from evaluation.evaluate import evaluate
from app.matching.synthetic import RANDOM_SEED, generate_reports


def test_synthetic_generator_is_reproducible_and_contains_pairs() -> None:
    first = generate_reports()
    assert first == generate_reports(RANDOM_SEED)
    assert len(first) == 500
    assert sum(entry.report.type == "LOST" for entry in first) == 250
    assert sum(entry.report.type == "FOUND" for entry in first) == 250
    assert len({entry.ground_truth_id for entry in first}) == 250
    assert any(
        left.ground_truth_id != right.ground_truth_id
        and left.report.type == right.report.type == "FOUND"
        and left.report.category == right.report.category
        for index, left in enumerate(first)
        for right in first[index + 1 :]
    )


def test_evaluation_computes_ranking_metrics_without_ground_truth_features() -> None:
    result = evaluate()
    assert result["report_count"] == 500
    assert result["evaluation_queries"] == 250
    assert 0 <= result["precision_at_1"] <= 1
    assert 0 <= result["precision_at_3"] <= 1
    assert 0 <= result["recall_at_3"] <= 1
    assert 0 <= result["recall_at_5"] <= 1
    assert 0 <= result["mrr"] <= 1
    assert result["error_analysis"]["not_ranked_first"] >= 0
