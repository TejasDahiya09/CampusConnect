"""Deterministic semantic Lost & Found ranking using local sentence embeddings."""

import math

from app.matching.baseline import (
    WEIGHTS,
    category_score,
    confidence,
    location_score,
    reasons,
    report_text,
    time_score,
)
from app.matching.embeddings import CachedEmbeddingProvider, EmbeddingCache, EmbeddingProvider
from app.core.config import get_settings
from app.schemas.lost_found import MatchReport, MatchResponse, MatchResult, MatchSignals

MATCHER_VERSION = "lf-semantic-v1"
MIN_SEMANTIC_SIMILARITY = get_settings().lost_found_min_semantic_similarity


def cosine_score(left: tuple[float, ...], right: tuple[float, ...]) -> float:
    if len(left) != len(right) or not left:
        return 0.0
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    cosine = sum(a * b for a, b in zip(left, right, strict=True)) / (left_norm * right_norm)
    return max(0.0, min(1.0, cosine))


class SemanticMatcher:
    def __init__(self, provider: EmbeddingProvider, cache_capacity: int = 512) -> None:
        self._provider = (
            provider
            if isinstance(provider, CachedEmbeddingProvider)
            else CachedEmbeddingProvider(provider, EmbeddingCache(cache_capacity))
        )

    def rank(self, query: MatchReport, candidates: list[MatchReport], top_k: int) -> MatchResponse:
        texts = [report_text(query), *(report_text(candidate) for candidate in candidates)]
        vectors = self._provider.encode(texts) if candidates else ()
        query_vector = vectors[0] if vectors else ()
        candidate_vectors = vectors[1:] if vectors else ()
        ranked: list[MatchResult] = []
        for candidate, vector in zip(candidates, candidate_vectors, strict=True):
            text_similarity = cosine_score(query_vector, vector)
            if text_similarity < MIN_SEMANTIC_SIMILARITY:
                continue
            signals = MatchSignals(
                text=text_similarity,
                category=category_score(query, candidate),
                location=location_score(query, candidate),
                time=time_score(query, candidate),
            )
            score = max(0.0, min(1.0, sum(WEIGHTS[name] * getattr(signals, name) for name in WEIGHTS)))
            ranked.append(
                MatchResult(
                    report_id=candidate.id,
                    score=score,
                    confidence=confidence(score),
                    signals=signals,
                    reasons=reasons(signals),
                )
            )
        ranked.sort(key=lambda result: (-result.score, result.report_id))
        return MatchResponse(matcher_version=MATCHER_VERSION, matches=tuple(ranked[:top_k]))
