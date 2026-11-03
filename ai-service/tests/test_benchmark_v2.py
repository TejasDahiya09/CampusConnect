from app.matching.baseline import rank_matches
from app.matching.benchmark_v2 import DIFFICULTY_COUNTS, RANDOM_SEED, generate_benchmark_v2
from evaluation.evaluate_v2 import evaluate_matcher


def test_benchmark_v2_is_reproducible_and_has_locked_distribution() -> None:
    reports = generate_benchmark_v2()
    assert reports == generate_benchmark_v2(RANDOM_SEED)
    assert len(reports) == 1_000
    assert sum(entry.report.type == "LOST" for entry in reports) == 500
    assert sum(entry.report.type == "FOUND" for entry in reports) == 500
    assert len({entry.ground_truth_id for entry in reports}) == 500
    assert {
        difficulty: sum(entry.difficulty == difficulty and entry.report.type == "LOST" for entry in reports)
        for difficulty in DIFFICULTY_COUNTS
    } == DIFFICULTY_COUNTS


def test_benchmark_v2_ground_truth_is_evaluation_only_and_metrics_are_grouped() -> None:
    reports = generate_benchmark_v2()
    assert not hasattr(reports[0].report, "ground_truth_id")
    result = evaluate_matcher(reports, rank_matches)
    assert result["candidate_pool"] == 500
    assert set(result["by_difficulty"]) == {"EASY", "MODERATE", "HARD"}
    assert 0 <= result["overall"]["mrr"] <= 1
