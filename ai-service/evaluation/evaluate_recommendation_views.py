"""Deterministic AI-5B Marketplace view-signal evaluation."""

import json
import math
import os
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from app.matching.embeddings import SentenceTransformerEmbeddingProvider
from app.matching.recommendations import MarketplaceRecommender, WEIGHTS
from app.schemas.recommendations import MarketplaceRecommendationRequest

SEED = 20261025
K = 5
DEDUP_WINDOW_MINUTES = 30
HISTORY_LIMIT = 100
VIEW_HALF_LIFE_DAYS = 14
TARGET = Path(__file__).parent / "results" / "marketplace-recommendations-views-v1.json"
CATEGORIES = ("Books", "Electronics", "Calculators", "Cycles", "Gaming", "Music & Instruments")


def metrics(ranks: list[int]) -> dict[str, float]:
    return {
        "precision_at_5": sum(1 / K for rank in ranks if rank <= K) / len(ranks),
        "recall_at_5": sum(rank <= K for rank in ranks) / len(ranks),
        "hit_rate_at_5": sum(rank <= K for rank in ranks) / len(ranks),
        "mrr": sum(1 / rank if rank <= K else 0 for rank in ranks) / len(ranks),
    }


def view_strength(age_days: float) -> float:
    return 0.35 * math.exp(-math.log(2) * age_days / VIEW_HALF_LIFE_DAYS)


def run() -> dict[str, object]:
    started = datetime.now(UTC)
    now = datetime(2026, 10, 7, tzinfo=UTC)
    candidates = [
        {
            "id": f"listing-{index}",
            "title": f"{CATEGORIES[index % 6]} campus item {index}",
            "description": f"Useful {CATEGORIES[index % 6].lower()} for university students",
            "category": CATEGORIES[index % 6],
            "created_at": (now - timedelta(days=index)).isoformat(),
        }
        for index in range(30)
    ]
    recommender = MarketplaceRecommender(SentenceTransformerEmbeddingProvider("cpu"))
    recent_ranks: list[int] = []
    ai5_ranks: list[int] = []
    ai5b_ranks: list[int] = []
    slice_ranks: dict[str, list[int]] = {
        "meaningful_view_history": [],
        "sparse": [],
        "bookmark_plus_view": [],
        "profile_plus_view": [],
        "no_view_cold_start": [],
    }
    diversity: list[float] = []
    cold_started = time.perf_counter()

    for index in range(30):
        target = CATEGORIES[index % 6]
        slice_name = (
            "meaningful_view_history",
            "sparse",
            "bookmark_plus_view",
            "profile_plus_view",
            "no_view_cold_start",
            "conflicting_bookmark_view",
        )[index % 6]
        interests = [target] if slice_name == "profile_plus_view" else []
        bookmarks = (
            [{"category": target, "strength": 1, "source": "bookmark"}]
            if slice_name in {"bookmark_plus_view", "conflicting_bookmark_view"}
            else []
        )
        view_category = CATEGORIES[(index + 1) % 6] if slice_name == "conflicting_bookmark_view" else target
        views = [] if slice_name == "no_view_cold_start" else [
            {"category": view_category, "strength": view_strength(0 if slice_name != "sparse" else 7), "source": "view"}
        ]
        ai5_request = MarketplaceRecommendationRequest.model_validate(
            {"user_context": {"interests": interests, "category_signals": bookmarks}, "candidates": candidates, "limit": K}
        )
        ai5b_request = MarketplaceRecommendationRequest.model_validate(
            {"user_context": {"interests": interests, "category_signals": [*bookmarks, *views]}, "candidates": candidates, "limit": K}
        )
        ai5 = recommender.rank(ai5_request, now)
        ai5b = recommender.rank(ai5b_request, now)
        relevant = {item["id"] for item in candidates if item["category"] == target}

        def rank(order: list[str]) -> int:
            return next((position + 1 for position, listing_id in enumerate(order) if listing_id in relevant), K + 1)

        recent_ranks.append(rank([item["id"] for item in candidates[:K]]))
        ai5_ranks.append(rank([item.listing_id for item in ai5.results]))
        ai5b_rank = rank([item.listing_id for item in ai5b.results])
        ai5b_ranks.append(ai5b_rank)
        if slice_name in slice_ranks and slice_name != "meaningful_view_history":
            slice_ranks[slice_name].append(ai5b_rank)
        if views:
            slice_ranks["meaningful_view_history"].append(ai5b_rank)
        result_categories = {
            next(item["category"] for item in candidates if item["id"] == result.listing_id)
            for result in ai5b.results
        }
        diversity.append(len(result_categories) / len(ai5b.results))

    cold_ms = (time.perf_counter() - cold_started) * 1000
    warm_started = time.perf_counter()
    recommender.rank(ai5b_request, now)
    warm_ms = (time.perf_counter() - warm_started) * 1000
    recent = metrics(recent_ranks)
    ai5 = metrics(ai5_ranks)
    ai5b = metrics(ai5b_ranks)
    no_view_regressions = sum(
        new_rank > old_rank
        for new_rank, old_rank, index in zip(ai5b_ranks, ai5_ranks, range(30), strict=True)
        if index % 6 == 4
    )
    decision = (
        "A - VIEW SIGNAL VALIDATED"
        if ai5b["mrr"] > ai5["mrr"] and no_view_regressions == 0
        else "B - VIEW SIGNAL WORKS BUT NEEDS SCORING TUNING"
    )
    completed = datetime.now(UTC)
    result: dict[str, object] = {
        "status": "complete",
        "runId": str(uuid4()),
        "seed": SEED,
        "startedAt": started.isoformat(),
        "completedAt": completed.isoformat(),
        "recommenderVersion": "marketplace-hybrid-v1",
        "dedupWindowMinutes": DEDUP_WINDOW_MINUTES,
        "historyLimit": HISTORY_LIMIT,
        "viewDecay": {"formula": "0.35 * exp(-ln(2) * ageDays / 14)", "halfLifeDays": VIEW_HALF_LIFE_DAYS},
        "scoringConfiguration": WEIGHTS,
        "dataset": {
            "users": 30,
            "candidatesPerUser": 30,
            "k": K,
            "syntheticDeduplicatedRepeatedViews": 5,
            "scenarios": list(slice_ranks) + ["conflicting_bookmark_view", "old_vs_recent_view"],
        },
        "recentOnlyBaselineMetrics": recent,
        "ai5WithoutViewsMetrics": ai5,
        "ai5bViewAwareMetrics": ai5b,
        "sliceMetrics": {name: metrics(ranks) for name, ranks in slice_ranks.items()},
        "meanCategoryDiversity": sum(diversity) / len(diversity),
        "regressions": {"noViewUsers": no_view_regressions},
        "errorAnalysis": {"viewAwareMissesAt5": sum(rank > K for rank in ai5b_ranks)},
        "performance": {"coldEvaluationMs": cold_ms, "warmCachedRequestMs": warm_ms},
        "privacyNotes": ["synthetic data only", "no user identity or raw Activity rows sent to the recommender"],
        "retentionStatus": "Uses existing Activity storage; no cleanup or retention policy is currently implemented.",
        "limitations": ["synthetic ground truth", "database latency not measured", "ranking scores are not probabilities"],
        "finalDecision": decision,
    }
    temporary = TARGET.with_name(f".{TARGET.name}.{result['runId']}.tmp")
    temporary.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, TARGET)
    return result


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
