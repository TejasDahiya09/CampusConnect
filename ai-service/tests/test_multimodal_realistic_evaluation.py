from collections import Counter
from pathlib import Path

from evaluation.evaluate_multimodal_realistic import percentile, process_memory_mib
from evaluation.multimodal_realistic_dataset import (
    BENCHMARK_SEED,
    CASE_COUNT,
    CATEGORIES,
    DIFFICULTIES,
    INTERACTIONS,
    generate_realistic_benchmark,
)


def test_realistic_benchmark_is_deterministic_and_locked_to_120_cases() -> None:
    first = generate_realistic_benchmark()
    second = generate_realistic_benchmark()
    assert first == second
    assert BENCHMARK_SEED == 20261023
    assert len(first) == CASE_COUNT == 120


def test_categories_and_difficulties_are_balanced() -> None:
    cases = generate_realistic_benchmark()
    assert Counter(case.category for case in cases) == {category: 12 for category in CATEGORIES}
    assert Counter(case.difficulty for case in cases) == {difficulty: 40 for difficulty in DIFFICULTIES}


def test_transformations_cover_required_robustness_conditions() -> None:
    names = {name for case in generate_realistic_benchmark() for name in case.transformations}
    assert {"resize", "rotation", "crop", "brightness", "contrast", "scale"} <= names
    assert {"angle_affine", "blur", "noise", "partial_occlusion", "background_clutter"} <= names


def test_every_case_has_same_category_hard_negatives_and_ground_truth() -> None:
    for case in generate_realistic_benchmark():
        identifiers = {candidate.id for candidate in case.candidates}
        assert case.true_id in identifiers
        assert len(case.hard_negative_ids) == 4
        assert set(case.hard_negative_ids) < identifiers
        assert all(candidate.category == case.category for candidate in case.candidates)


def test_interactions_and_missing_image_fallback_are_present() -> None:
    cases = generate_realistic_benchmark()
    assert {case.interaction for case in cases} == set(INTERACTIONS)
    assert sum(not case.has_bilateral_images for case in cases) == 36
    assert any(not case.query.images for case in cases)
    assert any(case.query.images and not next(c for c in case.candidates if c.id == case.true_id).images for case in cases)


def test_quick_dataset_is_a_deterministic_nonpersistent_subset(tmp_path: Path) -> None:
    target = tmp_path / "multimodal-realistic-v1.json"
    target.write_text("verified", encoding="utf-8")
    assert generate_realistic_benchmark(12) == generate_realistic_benchmark(12)
    assert target.read_text(encoding="utf-8") == "verified"


def test_percentile_and_resource_schema_helpers() -> None:
    assert percentile([4.0, 1.0, 3.0, 2.0], 0.95) == 4.0
    rss, peak = process_memory_mib()
    assert rss > 0
    assert peak >= rss
