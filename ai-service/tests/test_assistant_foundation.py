import asyncio
from dataclasses import dataclass

import pytest
from google.genai import errors, types
from pydantic import ValidationError

from app.core.config import Settings
from app.generation.gemini import (
    GeminiGenerationProvider,
    _default_client_factory,
    create_generation_provider,
)
from app.generation.grounding import GROUNDING_SYSTEM_POLICY
from app.generation.provider import GenerationErrorCode, GenerationProviderError, GenerationRequest
from app.schemas.assistant import (
    AssistantGenerationRequest,
    AssistantGenerationResponse,
    validate_response_citations,
)

SENSITIVE_PROVIDER_DETAIL = "credential-provider-detail-must-not-leak"


@dataclass
class FakeResponse:
    text: str | None


class FakeModels:
    def __init__(self, response: FakeResponse | Exception, delay: float = 0) -> None:
        self.response = response
        self.delay = delay
        self.calls = 0
        self.config: types.GenerateContentConfig | None = None
        self.model: str | None = None

    async def generate_content(self, *, model, contents, config):
        del contents
        self.calls += 1
        self.config = config
        self.model = model
        if self.delay:
            await asyncio.sleep(self.delay)
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


class FakeClient:
    def __init__(self, models: FakeModels) -> None:
        self.models = models
        self.closed = False

    async def aclose(self) -> None:
        self.closed = True


def generation_request() -> GenerationRequest:
    return GenerationRequest(prompt="Use supplied evidence.", system_instruction=GROUNDING_SYSTEM_POLICY)


def evidence(source_id: str = "11111111-1111-4111-8111-111111111111") -> dict[str, object]:
    return {
        "source_id": source_id,
        "source_type": "MARKETPLACE",
        "title": "Scientific calculator",
        "snippet": "A calculator available near the library.",
        "route": f"/marketplace/{source_id}",
        "relevance": 0.9,
    }


def assert_error(provider, code: GenerationErrorCode) -> GenerationProviderError:
    with pytest.raises(GenerationProviderError) as captured:
        asyncio.run(provider.generate(generation_request()))
    assert captured.value.code == code
    assert SENSITIVE_PROVIDER_DETAIL not in str(captured.value)
    return captured.value


def test_provider_is_disabled_by_default_without_initializing_a_client() -> None:
    initialized = False

    def forbidden_factory(_project: str, _location: str):
        nonlocal initialized
        initialized = True
        raise AssertionError("outbound provider client initialized")

    provider = create_generation_provider(Settings(AI_SERVICE_ENV="test"), forbidden_factory)
    assert_error(provider, GenerationErrorCode.FEATURE_DISABLED)
    assert initialized is False


def test_missing_vertex_configuration_is_safe_and_does_not_initialize_a_client() -> None:
    for configured in (
        Settings(_env_file=None, AI_SERVICE_ENV="test", CAMPUS_ASSISTANT_ENABLED=True),
        Settings(
            _env_file=None,
            AI_SERVICE_ENV="test",
            CAMPUS_ASSISTANT_ENABLED=True,
            GOOGLE_CLOUD_PROJECT="campusconnect-511010",
            GOOGLE_GENAI_USE_VERTEXAI=False,
        ),
    ):
        provider = create_generation_provider(
            configured,
            lambda _project, _location: (_ for _ in ()).throw(
                AssertionError("client initialized")
            ),
        )
        assert_error(provider, GenerationErrorCode.INVALID_CONFIGURATION)


def test_generation_configuration_is_strictly_bounded() -> None:
    for invalid in (
        {"GEMINI_GENERATION_TIMEOUT_SECONDS": 0},
        {"GEMINI_GENERATION_TIMEOUT_SECONDS": 61},
        {"GEMINI_MAX_OUTPUT_TOKENS": 63},
        {"GEMINI_MAX_OUTPUT_TOKENS": 2_049},
        {"GEMINI_MAX_CONCURRENCY": 0},
        {"GEMINI_MAX_CONCURRENCY": 5},
        {"GEMINI_MODEL": ""},
        {"GOOGLE_CLOUD_LOCATION": ""},
    ):
        with pytest.raises(ValidationError):
            Settings(AI_SERVICE_ENV="test", **invalid)


def test_default_client_factory_selects_vertex_ai_without_network(monkeypatch) -> None:
    models = FakeModels(FakeResponse("unused"))
    async_client = FakeClient(models)
    captured: dict[str, object] = {}

    class SyncClient:
        aio = async_client

    def fake_client(**kwargs):
        captured.update(kwargs)
        return SyncClient()

    monkeypatch.setattr("app.generation.gemini.genai.Client", fake_client)
    assert _default_client_factory("campusconnect-511010", "global") is async_client
    assert captured["vertexai"] is True
    assert captured["project"] == "campusconnect-511010"
    assert captured["location"] == "global"
    assert "api_key" not in captured
    http_options = captured["http_options"]
    assert isinstance(http_options, types.HttpOptions)
    assert http_options.retry_options is not None
    assert http_options.retry_options.attempts == 1


def test_gemini_provider_is_lazy_bounded_and_returns_safe_metadata() -> None:
    models = FakeModels(FakeResponse("  Grounded answer.  "))
    client = FakeClient(models)
    factory_calls = 0

    def factory(project: str, location: str) -> FakeClient:
        nonlocal factory_calls
        factory_calls += 1
        assert project == "campusconnect-511010"
        assert location == "global"
        return client

    provider = GeminiGenerationProvider(
        project="campusconnect-511010",
        location="global",
        model="gemini-2.5-flash",
        timeout_seconds=1,
        max_output_tokens=256,
        max_concurrency=2,
        client_factory=factory,
    )
    assert factory_calls == 0
    result = asyncio.run(provider.generate(generation_request()))
    assert result.text == "Grounded answer."
    assert result.provider == "gemini"
    assert result.model == "gemini-2.5-flash"
    assert factory_calls == 1
    assert models.calls == 1
    assert models.model == "gemini-2.5-flash"
    assert models.config is not None
    assert models.config.max_output_tokens == 256
    assert models.config.tools is None
    asyncio.run(provider.aclose())
    assert client.closed is True


def test_vertex_provider_initialization_failure_is_safe() -> None:
    def failing_factory(_project: str, _location: str) -> FakeClient:
        raise RuntimeError(SENSITIVE_PROVIDER_DETAIL)

    provider = GeminiGenerationProvider(
        project="campusconnect-511010",
        location="global",
        model="gemini-2.5-flash",
        timeout_seconds=1,
        max_output_tokens=64,
        max_concurrency=1,
        client_factory=failing_factory,
    )
    error = assert_error(provider, GenerationErrorCode.PROVIDER_INITIALIZATION_FAILED)
    assert error.retryable is False


def test_gemini_provider_maps_timeout_quota_and_authentication_failures() -> None:
    timeout_models = FakeModels(FakeResponse("late"), delay=0.05)
    timeout = GeminiGenerationProvider(
        project="campusconnect-511010",
        location="global",
        model="gemini-2.5-flash",
        timeout_seconds=0.01,
        max_output_tokens=64,
        max_concurrency=1,
        client_factory=lambda _project, _location: FakeClient(timeout_models),
    )
    assert assert_error(timeout, GenerationErrorCode.TIMEOUT).retryable is True

    for status_code, expected, retryable in (
        (429, GenerationErrorCode.QUOTA_EXCEEDED, True),
        (401, GenerationErrorCode.AUTHENTICATION_FAILED, False),
        (403, GenerationErrorCode.AUTHENTICATION_FAILED, False),
    ):
        models = FakeModels(
            errors.APIError(status_code, {"message": f"failure {SENSITIVE_PROVIDER_DETAIL}"})
        )
        provider = GeminiGenerationProvider(
            project="campusconnect-511010",
            location="global",
            model="gemini-2.5-flash",
            timeout_seconds=1,
            max_output_tokens=64,
            max_concurrency=1,
            client_factory=lambda _project, _location, models=models: FakeClient(models),
        )
        assert assert_error(provider, expected).retryable is retryable


def test_gemini_provider_rejects_empty_and_malformed_output() -> None:
    for response, expected in (
        (FakeResponse("  "), GenerationErrorCode.EMPTY_RESPONSE),
        (FakeResponse(None), GenerationErrorCode.MALFORMED_RESPONSE),
    ):
        models = FakeModels(response)
        provider = GeminiGenerationProvider(
            project="campusconnect-511010",
            location="global",
            model="gemini-2.5-flash",
            timeout_seconds=1,
            max_output_tokens=64,
            max_concurrency=1,
            client_factory=lambda _project, _location, models=models: FakeClient(models),
        )
        assert_error(provider, expected)


def test_gemini_provider_limits_concurrent_generation() -> None:
    class ConcurrentModels(FakeModels):
        def __init__(self) -> None:
            super().__init__(FakeResponse("Grounded answer."))
            self.active = 0
            self.maximum_active = 0

        async def generate_content(self, *, model, contents, config):
            del model, contents, config
            self.calls += 1
            self.active += 1
            self.maximum_active = max(self.maximum_active, self.active)
            await asyncio.sleep(0.01)
            self.active -= 1
            return self.response

    models = ConcurrentModels()
    provider = GeminiGenerationProvider(
        project="campusconnect-511010",
        location="global",
        model="gemini-2.5-flash",
        timeout_seconds=1,
        max_output_tokens=64,
        max_concurrency=1,
        client_factory=lambda _project, _location: FakeClient(models),
    )

    async def generate_twice() -> None:
        await asyncio.gather(
            provider.generate(generation_request()),
            provider.generate(generation_request()),
        )

    asyncio.run(generate_twice())
    assert models.calls == 2
    assert models.maximum_active == 1


def test_assistant_request_contract_rejects_invalid_versions_sizes_and_sources() -> None:
    valid = {
        "contract_version": "campus-assistant-grounded-v1",
        "question": "Where can I find a calculator?",
        "evidence": [evidence()],
    }
    for mutation in (
        {**valid, "contract_version": "v0"},
        {**valid, "question": "x" * 501},
        {**valid, "evidence": [evidence(str(index)) for index in range(21)]},
        {**valid, "evidence": [{**evidence(), "source_type": "MESSAGE"}]},
        {**valid, "evidence": [{**evidence(), "unexpected": True}]},
        {**valid, "unexpected": True},
    ):
        with pytest.raises(ValidationError):
            AssistantGenerationRequest.model_validate(mutation)

    oversized = [
        {
            **evidence(f"source-{index}"),
            "title": "t" * 180,
            "snippet": "s" * 2_000,
            "route": f"/marketplace/source-{index}",
        }
        for index in range(14)
    ]
    with pytest.raises(ValidationError):
        AssistantGenerationRequest.model_validate({**valid, "evidence": oversized})


def test_response_citations_must_reference_supplied_evidence() -> None:
    request = AssistantGenerationRequest.model_validate(
        {"question": "Find a calculator", "evidence": [evidence()]}
    )
    valid = AssistantGenerationResponse.model_validate(
        {
            "status": "answered",
            "answer": "A calculator is listed near the library.",
            "citations": [{"source_id": request.evidence[0].source_id}],
            "provider": "gemini",
            "model": "gemini-2.5-flash",
        }
    )
    assert validate_response_citations(request, valid) is valid
    unknown = AssistantGenerationResponse.model_validate(
        {
            "status": "answered",
            "answer": "Unsupported citation.",
            "citations": [{"source_id": "unknown-source"}],
        }
    )
    with pytest.raises(ValueError, match="outside the supplied evidence"):
        validate_response_citations(request, unknown)

    unavailable = AssistantGenerationResponse.model_validate(
        {
            "status": "unavailable",
            "answer": "The assistant is temporarily unavailable.",
            "error_code": "provider_unavailable",
        }
    )
    assert unavailable.error_code == "provider_unavailable"
    with pytest.raises(ValidationError, match="only for unavailable"):
        AssistantGenerationResponse.model_validate(
            {
                "status": "unsupported",
                "answer": "That request is unsupported.",
                "error_code": "provider_unavailable",
            }
        )


def test_grounding_policy_forbids_actions_browsing_and_untrusted_instructions() -> None:
    normalized = GROUNDING_SYSTEM_POLICY.lower()
    for requirement in (
        "untrusted data",
        "do not invent sources",
        "do not browse the web",
        "access databases",
        "perform actions",
        "private messages",
    ):
        assert requirement in normalized
