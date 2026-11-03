"""Composition of unchanged semantic signals with optional local image evidence."""

from app.matching.baseline import category_score, confidence, location_score, reasons, report_text, time_score
from app.matching.embeddings import CachedEmbeddingProvider, EmbeddingCache, EmbeddingProvider
from app.matching.images import CachedImageEmbeddingProvider, ImageEmbeddingCache, ImageEmbeddingProvider, best_image_similarity
from app.matching.semantic import cosine_score
from app.schemas.lost_found import MatchReport, MatchResponse, MatchResult, MatchSignals

MATCHER_VERSION = "lf-multimodal-v1"
MULTIMODAL_WEIGHTS = {"text": 0.40, "image": 0.25, "category": 0.15, "location": 0.10, "time": 0.10}
SEMANTIC_WEIGHTS = {"text": 0.55, "category": 0.20, "location": 0.15, "time": 0.10}


class MultimodalMatcher:
    def __init__(self, text_provider: EmbeddingProvider, image_provider: ImageEmbeddingProvider, text_cache_capacity: int = 512, image_cache_capacity: int = 256) -> None:
        self._text = (
            text_provider
            if isinstance(text_provider, CachedEmbeddingProvider)
            else CachedEmbeddingProvider(text_provider, EmbeddingCache(text_cache_capacity))
        )
        self._image = CachedImageEmbeddingProvider(image_provider, ImageEmbeddingCache(image_cache_capacity))

    def rank(self, query: MatchReport, candidates: list[MatchReport], top_k: int) -> MatchResponse:
        texts = [report_text(query), *(report_text(candidate) for candidate in candidates)]
        vectors = self._text.encode(texts) if candidates else ()
        query_images = self._image.encode_evidence(query.images)
        candidate_images = [self._image.encode_evidence(candidate.images) for candidate in candidates]
        ranked: list[MatchResult] = []
        used_multimodal = False
        for candidate, text_vector, images in zip(candidates, vectors[1:], candidate_images, strict=True):
            image = best_image_similarity(query_images, images)
            signals = MatchSignals(text=cosine_score(vectors[0], text_vector), image=image, category=category_score(query, candidate), location=location_score(query, candidate), time=time_score(query, candidate))
            weights = MULTIMODAL_WEIGHTS if image is not None else SEMANTIC_WEIGHTS
            score = max(0.0, min(1.0, sum(weight * getattr(signals, name) for name, weight in weights.items())))
            used_multimodal = used_multimodal or image is not None
            extra_reasons = ("Similar visual appearance",) if image is not None and image >= 0.60 else ()
            ranked.append(MatchResult(report_id=candidate.id, score=score, confidence=confidence(score), signals=signals, reasons=(*reasons(signals), *extra_reasons), scoring_mode="multimodal" if image is not None else "semantic"))
        ranked.sort(key=lambda result: (-result.score, result.report_id))
        version = MATCHER_VERSION if used_multimodal else "lf-semantic-v1"
        return MatchResponse(matcher_version=version, matches=tuple(ranked[:top_k]))
