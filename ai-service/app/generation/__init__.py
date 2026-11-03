"""Generation-provider foundation for future grounded Campus Assistant requests."""

from .provider import GenerationProvider, GenerationProviderError, GenerationRequest, GenerationResult

__all__ = [
    "GenerationProvider",
    "GenerationProviderError",
    "GenerationRequest",
    "GenerationResult",
]
