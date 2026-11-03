"""Grounded Campus Assistant generation orchestration for authorized evidence."""

import re

from pydantic import ValidationError

from app.generation.grounding import (
    GROUNDING_SYSTEM_POLICY,
    build_grounded_prompt,
    is_unsupported_question,
)
from app.generation.provider import (
    GenerationErrorCode,
    GenerationProvider,
    GenerationProviderError,
    GenerationRequest,
)
from app.schemas.assistant import (
    AssistantCitation,
    AssistantGenerationRequest,
    AssistantGenerationResponse,
    AssistantModelOutput,
    validate_response_citations,
)

_URL_PATTERN = re.compile(r"\b(?:https?://|www\.)", re.IGNORECASE)
_ERROR_CODES = {
    GenerationErrorCode.FEATURE_DISABLED: "feature_disabled",
    GenerationErrorCode.INVALID_CONFIGURATION: "invalid_configuration",
    GenerationErrorCode.PROVIDER_INITIALIZATION_FAILED: "provider_initialization_failed",
    GenerationErrorCode.TIMEOUT: "timeout",
    GenerationErrorCode.QUOTA_EXCEEDED: "quota_exceeded",
    GenerationErrorCode.AUTHENTICATION_FAILED: "authentication_failed",
    GenerationErrorCode.EMPTY_RESPONSE: "invalid_provider_response",
    GenerationErrorCode.MALFORMED_RESPONSE: "invalid_provider_response",
    GenerationErrorCode.PROVIDER_UNAVAILABLE: "provider_unavailable",
}


class AssistantGenerationService:
    def __init__(self, provider: GenerationProvider) -> None:
        self._provider = provider

    async def generate(self, payload: AssistantGenerationRequest) -> AssistantGenerationResponse:
        if not payload.evidence:
            return AssistantGenerationResponse(
                status="insufficient_evidence",
                answer="I couldn't find enough authorized CampusConnect information to answer that question.",
            )
        if is_unsupported_question(payload.question):
            return AssistantGenerationResponse(
                status="unsupported",
                answer="I can only provide read-only information from public CampusConnect records.",
            )

        try:
            result = await self._provider.generate(
                GenerationRequest(
                    prompt=build_grounded_prompt(payload),
                    system_instruction=GROUNDING_SYSTEM_POLICY,
                    response_json_schema=AssistantModelOutput.model_json_schema(by_alias=True),
                )
            )
        except GenerationProviderError as error:
            return AssistantGenerationResponse(
                status="unavailable",
                answer="The Campus Assistant is temporarily unavailable.",
                error_code=_ERROR_CODES[error.code],
            )

        try:
            output = AssistantModelOutput.model_validate_json(result.text)
            if _URL_PATTERN.search(output.answer):
                raise ValueError("model answer contains a URL")
            response = AssistantGenerationResponse(
                status=(
                    "insufficient_evidence" if output.status == "insufficient" else output.status
                ),
                answer=output.answer,
                citations=tuple(
                    AssistantCitation(source_id=source_id) for source_id in output.citation_ids
                ),
                provider="gemini",
                model=result.model,
            )
            return validate_response_citations(payload, response)
        except (ValidationError, ValueError):
            return AssistantGenerationResponse(
                status="unavailable",
                answer="The Campus Assistant returned an invalid response.",
                error_code="invalid_provider_response",
            )
