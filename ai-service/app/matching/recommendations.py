"""Deterministic, explainable Marketplace hybrid recommendations."""

import math
from datetime import UTC, datetime

from app.matching.baseline import normalize_text
from app.matching.embeddings import CachedEmbeddingProvider, EmbeddingCache, EmbeddingProvider
from app.matching.semantic import cosine_score
from app.schemas.recommendations import MarketplaceRecommendationRequest, MarketplaceRecommendationResponse, RecommendationResult

RECOMMENDER_VERSION = "marketplace-hybrid-v1"
WEIGHTS = {"content": 0.40, "category": 0.25, "bookmark": 0.15, "profile": 0.10, "recency": 0.10}
RECENCY_HALF_LIFE_DAYS = 30.0


class MarketplaceRecommender:
    def __init__(self, provider: EmbeddingProvider, cache_capacity: int = 512) -> None:
        self._embeddings = (
            provider
            if isinstance(provider, CachedEmbeddingProvider)
            else CachedEmbeddingProvider(provider, EmbeddingCache(cache_capacity))
        )

    def rank(self, request: MarketplaceRecommendationRequest, now: datetime | None = None) -> MarketplaceRecommendationResponse:
        moment = now or datetime.now(UTC)
        interests = tuple(normalize_text(value) for value in request.user_context.interests if normalize_text(value))
        bookmark_signals: dict[str, float] = {}
        view_signals: dict[str, float] = {}
        for signal in request.user_context.category_signals:
            key = normalize_text(signal.category)
            target = bookmark_signals if signal.source == "bookmark" else view_signals
            target[key] = max(target.get(key, 0.0), signal.strength)
        signals = set((*bookmark_signals, *view_signals))
        strategy = "hybrid" if signals else "profile" if interests else "recent"
        user_text = " ".join((*interests, *signals))
        listing_texts = tuple(normalize_text(f"{candidate.category} {candidate.title} {candidate.description}") for candidate in request.candidates)
        vectors = self._embeddings.encode((user_text, *listing_texts)) if user_text and listing_texts else ()
        ranked = []
        for index, candidate in enumerate(request.candidates):
            category = normalize_text(candidate.category)
            content = cosine_score(vectors[0], vectors[index + 1]) if vectors else 0.0
            bookmark = bookmark_signals.get(category, 0.0)
            view = view_signals.get(category, 0.0)
            category_affinity = max(bookmark, view)
            profile = 1.0 if any(value in normalize_text(f"{candidate.category} {candidate.title} {candidate.description}") for value in interests) else 0.0
            age = max(0.0, (moment - candidate.created_at.astimezone(UTC)).total_seconds() / 86400)
            recency = math.exp(-math.log(2) * age / RECENCY_HALF_LIFE_DAYS)
            score = recency if strategy == "recent" else sum(WEIGHTS[name] * value for name, value in {"content": content, "category": category_affinity, "bookmark": bookmark, "profile": profile, "recency": recency}.items())
            reasons = []
            if content >= 0.35: reasons.append("Matches your interests")
            if bookmark >= 0.5: reasons.append("Similar to items you saved")
            elif view > 0: reasons.append("Based on items you've viewed")
            if recency >= 0.75: reasons.append("Recently listed")
            ranked.append((max(0.0, min(1.0, score)), candidate, tuple(reasons)))
        ranked.sort(key=lambda item: (-item[0], item[1].id))
        selected, counts = [], {}
        for item in ranked:
            category = item[1].category
            if counts.get(category, 0) >= 2 and len({entry[1].category for entry in ranked}) > 1: continue
            selected.append(item); counts[category] = counts.get(category, 0) + 1
            if len(selected) == request.limit: break
        if len(selected) < request.limit:
            selected_ids = {item[1].id for item in selected}
            selected.extend(item for item in ranked if item[1].id not in selected_ids)
            selected = selected[:request.limit]
        return MarketplaceRecommendationResponse(recommender_version=RECOMMENDER_VERSION, strategy=strategy, results=tuple(RecommendationResult(listing_id=candidate.id, score=score, reasons=reasons) for score, candidate, reasons in selected))
