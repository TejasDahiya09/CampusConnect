"""Small provider-neutral contracts for bounded text generation."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class GenerationErrorCode(StrEnum):
    FEATURE_DISABLED = "FEATURE_DISABLED"
    INVALID_CONFIGURATION = "INVALID_CONFIGURATION"
    PROVIDER_INITIALIZATION_FAILED = "PROVIDER_INITIALIZATION_FAILED"
    TIMEOUT = "TIMEOUT"
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED"
    AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED"
    EMPTY_RESPONSE = "EMPTY_RESPONSE"
    MALFORMED_RESPONSE = "MALFORMED_RESPONSE"
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"


class GenerationProviderError(RuntimeError):
    """Safe categorized provider failure that never contains provider secrets."""

    def __init__(self, code: GenerationErrorCode, *, retryable: bool) -> None:
        super().__init__(code.value)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class GenerationRequest:
    prompt: str
    system_instruction: str
    response_json_schema: dict[str, Any] | None = None


@dataclass(frozen=True)
class GenerationResult:
    model: str
    provider: str
    text: str


class GenerationProvider(ABC):
    @abstractmethod
    async def generate(self, request: GenerationRequest) -> GenerationResult:
        """Generate bounded text or raise a safe GenerationProviderError."""

    async def aclose(self) -> None:
        """Release provider resources when the application shuts down."""
