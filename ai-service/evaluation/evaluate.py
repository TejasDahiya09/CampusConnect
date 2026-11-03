"""Run deterministic AI-1 baseline evaluation over synthetic reports."""
import json
from pathlib import Path

from app.matching.baseline import (
    CONFIDENCE_THRESHOLDS,
    MATCHER_VERSION,
    WEIGHTS,
    rank_matches,
)
from app.matching.synthetic import DATASET_VERSION, RANDOM_SEED, generate_reports


def evaluate() -> dict[str, object]:
    reports = generate_reports()
    lost = [entry for entry in reports if entry.report.type == "LOST"]
    found = [entry for entry in reports if entry.report.type == "FOUND"]
    truth = {entry.report.id: entry.ground_truth_id for entry in reports}
    ranks: list[int] = []
    error_examples: list[dict[str, object]] = []
    for source in lost:
        matches = rank_matches(source.report, [entry.report for entry in found], 5).matches
        rank = next(
            (
                index + 1
                for index, match in enumerate(matches)
                if truth[match.report_id] == source.ground_truth_id
            ),
            0,
        )
        ranks.append(rank)
        if rank != 1 and len(error_examples) < 5:
            error_examples.append(
                {
                    "query_id": source.report.id,
                    "true_match_rank": rank or None,
                    "top_ranked_report_id": matches[0].report_id if matches else None,
                    "category": source.report.category,
                    "location": source.report.location,
                }
            )
    total = len(ranks)
    return {
        "matcher_version": MATCHER_VERSION,
        "dataset_version": DATASET_VERSION,
        "random_seed": RANDOM_SEED,
        "report_count": len(reports),
        "evaluation_queries": total,
        "candidate_pool": len(found),
        "candidate_pool_methodology": "Each LOST report ranks against all 250 generated FOUND reports.",
        "confidence_thresholds": CONFIDENCE_THRESHOLDS,
        "weights": WEIGHTS,
        "precision_at_1": sum(rank == 1 for rank in ranks) / total,
        "precision_at_3": sum(min(1, 1 if rank and rank <= 3 else 0) / 3 for rank in ranks) / total,
        "recall_at_3": sum(bool(rank and rank <= 3) for rank in ranks) / total,
        "recall_at_5": sum(bool(rank and rank <= 5) for rank in ranks) / total,
        "mrr": sum(1 / rank if rank else 0 for rank in ranks) / total,
        "error_analysis": {
            "not_ranked_first": sum(rank != 1 for rank in ranks),
            "outside_top_3": sum(not rank or rank > 3 for rank in ranks),
            "representative_examples": error_examples,
        },
    }


if __name__ == "__main__":
    results = evaluate()
    target = Path(__file__).parent / "results" / "baseline-v1.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(results, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(results, indent=2, sort_keys=True))
