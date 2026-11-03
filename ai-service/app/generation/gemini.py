"""Lazy, bounded Google Gemini implementation for the RAG-0 provider foundation."""

import asyncio
from collections.abc import Callable
from typing import Protocol

from google import genai
from google.genai import errors, types

from app.core.config import Settings
from app.generation.provider import (
    GenerationErrorCode,
    GenerationProvider,
    GenerationProviderError,
    GenerationRequest,
    GenerationResult,
)


class GeminiResponse(Protocol):
    @property
    def text(self) -> str | None: ...


class GeminiModels(Protocol):
    async def generate_content(
        self,
        *,
        model: str,
        contents: str,
        config: types.GenerateContentConfig,
    ) -> GeminiResponse: ...


class GeminiAsyncClient(Protocol):
    models: GeminiModels

    async def aclose(self) -> None: ...


GeminiClientFactory = Callable[[str, str], GeminiAsyncClient]


def _default_client_factory(project: str, location: str) -> GeminiAsyncClient:
    return genai.Client(
        vertexai=True,
        project=project,
        location=location,
        http_options=types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=1)),
    ).aio


class UnavailableGenerationProvider(GenerationProvider):
    def __init__(self, code: GenerationErrorCode) -> None:
        self._code = code

    async def generate(self, request: GenerationRequest) -> GenerationResult:
        del request
        raise GenerationProviderError(self._code, retryable=False)


class GeminiGenerationProvider(GenerationProvider):
    def __init__(
        self,
        *,
        project: str,
        location: str,
        model: str,
        timeout_seconds: float,
        max_output_tokens: int,
        max_concurrency: int,
        client_factory: GeminiClientFactory = _default_client_factory,
    ) -> None:
        self._project = project
        self._location = location
        self._model = model
        self._timeout_seconds = timeout_seconds
        self._max_output_tokens = max_output_tokens
        self._client_factory = client_factory
        self._client: GeminiAsyncClient | None = None
        self._client_lock = asyncio.Lock()
        self._inference_slots = asyncio.Semaphore(max_concurrency)

    async def _get_client(self) -> GeminiAsyncClient:
        if self._client is not None:
            return self._client
        async with self._client_lock:
            if self._client is None:
                try:
                    self._client = await asyncio.to_thread(
                        self._client_factory,
                        self._project,
                        self._location,
                    )
                except Exception as error:
                    raise GenerationProviderError(
                        GenerationErrorCode.PROVIDER_INITIALIZATION_FAILED,
                        retryable=False,
                    ) from error
            return self._client

    async def generate(self, request: GenerationRequest) -> GenerationResult:
        try:
            async with asyncio.timeout(self._timeout_seconds):
                client = await self._get_client()
                async with self._inference_slots:
                    response = await client.models.generate_content(
                        model=self._model,
                        contents=request.prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=request.system_instruction,
                            max_output_tokens=self._max_output_tokens,
                            response_mime_type=(
                                "application/json"
                                if request.response_json_schema is not None
                                else None
                            ),
                            response_json_schema=request.response_json_schema,
                            tools=None,
                        ),
                    )
        except TimeoutError as error:
            raise GenerationProviderError(GenerationErrorCode.TIMEOUT, retryable=True) from error
        except errors.APIError as error:
            if error.code in (401, 403):
                code = GenerationErrorCode.AUTHENTICATION_FAILED
                retryable = False
            elif error.code == 429:
                code = GenerationErrorCode.QUOTA_EXCEEDED
                retryable = True
            else:
                code = GenerationErrorCode.PROVIDER_UNAVAILABLE
                retryable = error.code >= 500
            raise GenerationProviderError(code, retryable=retryable) from error
        except GenerationProviderError:
            raise
        except Exception as error:
            raise GenerationProviderError(
                GenerationErrorCode.PROVIDER_UNAVAILABLE, retryable=True
            ) from error

        try:
            text = response.text
        except Exception as error:
            raise GenerationProviderError(
                GenerationErrorCode.MALFORMED_RESPONSE, retryable=False
            ) from error
        if text is None or not isinstance(text, str):
            raise GenerationProviderError(
                GenerationErrorCode.MALFORMED_RESPONSE, retryable=False
            )
        normalized = text.strip()
        if not normalized:
            raise GenerationProviderError(GenerationErrorCode.EMPTY_RESPONSE, retryable=False)
        return GenerationResult(model=self._model, provider="gemini", text=normalized)

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None


def create_generation_provider(
    settings: Settings,
    client_factory: GeminiClientFactory = _default_client_factory,
) -> GenerationProvider:
    if not settings.campus_assistant_enabled:
        return UnavailableGenerationProvider(GenerationErrorCode.FEATURE_DISABLED)
    if not settings.google_genai_use_vertexai or settings.google_cloud_project is None:
        return UnavailableGenerationProvider(GenerationErrorCode.INVALID_CONFIGURATION)
    return GeminiGenerationProvider(
        project=settings.google_cloud_project,
        location=settings.google_cloud_location,
        model=settings.gemini_model,
        timeout_seconds=settings.gemini_generation_timeout_seconds,
        max_output_tokens=settings.gemini_max_output_tokens,
        max_concurrency=settings.gemini_max_concurrency,
        client_factory=client_factory,
    )
