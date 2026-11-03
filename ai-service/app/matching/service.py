"""Configured matcher selection with an explicit semantic-to-baseline fallback."""

import logging

from app.core.config import Settings
from app.matching.baseline import rank_matches
from app.matching.embeddings import EmbeddingProvider, SemanticModelError, SentenceTransformerEmbeddingProvider
from app.matching.semantic import SemanticMatcher
from app.matching.images import ImageModelError, OpenClipImageEmbeddingProvider
from app.matching.multimodal import MultimodalMatcher
from app.schemas.lost_found import MatchReport, MatchResponse

logger = logging.getLogger(__name__)


class LostFoundMatchingService:
    def __init__(
        self,
        settings: Settings,
        semantic_matcher: SemanticMatcher | None = None,
        multimodal_matcher: MultimodalMatcher | None = None,
        shared_text_provider: EmbeddingProvider | None = None,
    ) -> None:
        self._settings = settings
        text_provider = shared_text_provider or SentenceTransformerEmbeddingProvider(
            settings.lost_found_embedding_device, settings.inference_concurrency
        )
        self._semantic_matcher = semantic_matcher or SemanticMatcher(
            text_provider,
            settings.lost_found_embedding_cache_size,
        )
        self._multimodal_matcher = multimodal_matcher or MultimodalMatcher(
            text_provider,
            OpenClipImageEmbeddingProvider(settings.lost_found_image_device),
            settings.lost_found_embedding_cache_size,
            settings.lost_found_image_cache_size,
        )

    def rank(self, query: MatchReport, candidates: list[MatchReport], top_k: int) -> MatchResponse:
        if self._settings.lost_found_matcher == "baseline":
            return rank_matches(query, candidates, top_k)
        if self._settings.lost_found_matcher == "multimodal":
            try:
                return self._multimodal_matcher.rank(query, candidates, top_k)
            except ImageModelError:
                logger.warning("Multimodal image matching is unavailable; using lf-semantic-v1.")
        try:
            return self._semantic_matcher.rank(query, candidates, top_k)
        except SemanticModelError:
            logger.warning("Semantic Lost & Found matching is unavailable; using lf-baseline-v1.")
            return rank_matches(query, candidates, top_k)
