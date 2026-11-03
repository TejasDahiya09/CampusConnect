"""Run the frozen baseline and semantic matchers against Benchmark V2."""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.matching.baseline import MATCHER_VERSION as BASELINE_VERSION, rank_matches
from app.matching.benchmark_v2 import BENCHMARK_VERSION, RANDOM_SEED, BenchmarkReport, generate_benchmark_v2
from app.matching.embeddings import SentenceTransformerEmbeddingProvider
from app.matching.semantic import MATCHER_VERSION as SEMANTIC_VERSION, SemanticMatcher
from app.schemas.lost_found import MatchReport, MatchResponse

Ranker = Callable[[MatchReport, list[MatchReport], int], MatchResponse]


def _metrics(ranks: list[int]) -> dict[str, float]:
    total = len(ranks)
    return {
        "precision_at_1": sum(rank == 1 for rank in ranks) / total,
        "precision_at_3": sum(1 / 3 for rank in ranks if 0 < rank <= 3) / total,
        "recall_at_3": sum(0 < rank <= 3 for rank in ranks) / total,
        "recall_at_5": sum(0 < rank <= 5 for rank in ranks) / total,
        "mrr": sum(1 / rank if rank else 0 for rank in ranks) / total,
    }


def _evaluate_positions(
    reports: tuple[BenchmarkReport, ...], ranker: Ranker
) -> tuple[list[int], dict[str, list[int]], list[dict[str, Any]], int]:
    lost = [entry for entry in reports if entry.report.type == "LOST"]
    found = [entry for entry in reports if entry.report.type == "FOUND"]
    truth = {entry.report.id: entry.ground_truth_id for entry in reports}
    ranks: list[int] = []
    by_difficulty: dict[str, list[int]] = {"EASY": [], "MODERATE": [], "HARD": []}
    errors: list[dict[str, Any]] = []
    candidate_reports = [entry.report for entry in found]
    for source in lost:
        matches = ranker(source.report, candidate_reports, 5).matches
        rank = next(
            (index + 1 for index, match in enumerate(matches) if truth[match.report_id] == source.ground_truth_id),
            0,
        )
        ranks.append(rank)
        by_difficulty[source.difficulty].append(rank)
        if rank != 1 and len(errors) < 10:
            errors.append({"difficulty": source.difficulty, "query_id": source.report.id, "true_match_rank": rank or None})
    return ranks, by_difficulty, errors, len(found)


def evaluate_matcher(reports: tuple[BenchmarkReport, ...], ranker: Ranker) -> dict[str, Any]:
    ranks, by_difficulty, errors, candidate_count = _evaluate_positions(reports, ranker)
    return {
        "candidate_pool": candidate_count,
        "candidate_pool_methodology": "Each LOST report ranks against all generated FOUND reports.",
        "error_examples": errors,
        "overall": _metrics(ranks),
        "by_difficulty": {difficulty: _metrics(values) for difficulty, values in by_difficulty.items()},
    }


def comparison() -> dict[str, Any]:
    reports = generate_benchmark_v2()
    settings = get_settings()
    semantic = SemanticMatcher(
        SentenceTransformerEmbeddingProvider(settings.lost_found_embedding_device),
        settings.lost_found_embedding_cache_size,
    )
    baseline_ranks, baseline_difficulties, baseline_errors, candidate_count = _evaluate_positions(
        reports, rank_matches
    )
    semantic_ranks, semantic_difficulties, semantic_errors, _ = _evaluate_positions(
        reports, semantic.rank
    )
    baseline = {
        "candidate_pool": candidate_count,
        "candidate_pool_methodology": "Each LOST report ranks against all generated FOUND reports.",
        "error_examples": baseline_errors,
        "overall": _metrics(baseline_ranks),
        "by_difficulty": {
            difficulty: _metrics(ranks) for difficulty, ranks in baseline_difficulties.items()
        },
    }
    semantic_result = {
        "candidate_pool": candidate_count,
        "candidate_pool_methodology": "Each LOST report ranks against all generated FOUND reports.",
        "error_examples": semantic_errors,
        "overall": _metrics(semantic_ranks),
        "by_difficulty": {
            difficulty: _metrics(ranks) for difficulty, ranks in semantic_difficulties.items()
        },
    }
    lost_reports = [entry for entry in reports if entry.report.type == "LOST"]
    error_analysis: dict[str, list[dict[str, Any]]] = {
        "semantic_improves_to_first": [],
        "baseline_beats_semantic": [],
        "both_miss_top_five": [],
    }
    for source, baseline_rank, semantic_rank in zip(
        lost_reports, baseline_ranks, semantic_ranks, strict=True
    ):
        if baseline_rank != 1 and semantic_rank == 1:
            bucket = "semantic_improves_to_first"
        elif baseline_rank == 1 and semantic_rank != 1:
            bucket = "baseline_beats_semantic"
        elif baseline_rank == 0 and semantic_rank == 0:
            bucket = "both_miss_top_five"
        else:
            continue
        if len(error_analysis[bucket]) < 10:
            error_analysis[bucket].append(
                {
                    "difficulty": source.difficulty,
                    "query_id": source.report.id,
                    "baseline_rank": baseline_rank or None,
                    "semantic_rank": semantic_rank or None,
                }
            )
    return {
        "benchmark_version": BENCHMARK_VERSION,
        "random_seed": RANDOM_SEED,
        "report_count": len(reports),
        "baseline": {"matcher_version": BASELINE_VERSION, **baseline},
        "semantic": {"matcher_version": SEMANTIC_VERSION, **semantic_result},
        "delta_semantic_minus_baseline": {
            "overall": {
                metric: semantic_result["overall"][metric] - baseline["overall"][metric]
                for metric in baseline["overall"]
            },
            "hard": {
                metric: semantic_result["by_difficulty"]["HARD"][metric]
                - baseline["by_difficulty"]["HARD"][metric]
                for metric in baseline["by_difficulty"]["HARD"]
            },
        },
        "error_analysis": error_analysis,
    }


if __name__ == "__main__":
    results = comparison()
    target = Path(__file__).parent / "results" / "comparison-v2.json"
    target.write_text(json.dumps(results, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(results, indent=2, sort_keys=True))
