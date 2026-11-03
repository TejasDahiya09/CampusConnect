from datetime import date

import pytest

from app.matching.baseline import (
    CONFIDENCE_THRESHOLDS,
    WEIGHTS,
    category_score,
    confidence,
    location_score,
    normalize_text,
    rank_matches,
    text_scores,
    time_score,
)
from app.schemas.lost_found import MatchReport, MatchRequest


def report(identifier: str, report_type: str, **changes: object) -> MatchReport:
    values: dict[str, object] = {
        "id": identifier,
        "type": report_type,
        "title": "Black calculator",
        "description": "Scientific calculator lost near library entrance",
        "category": "Calculators",
        "location": "Central Library",
        "incident_at": date(2026, 10, 1),
    }
    values.update(changes)
    return MatchReport.model_validate(values)


def test_preprocessing_and_text_similarity_are_deterministic() -> None:
    query = report("query", "LOST")
    matching = report("matching", "FOUND", title="Calculator", description="Black scientific calculator at library entrance")
    unrelated = report("negative", "FOUND", title="Blue umbrella", description="Umbrella at sports area")

    assert normalize_text("  Caf\u00e9---LIBRARY! ") == "café library"
    assert text_scores(query, [matching, unrelated])[0] > text_scores(query, [matching, unrelated])[1]
    assert text_scores(report("blank", "LOST", title="", description=""), [report("empty", "FOUND", title="", description="")]) == [0.0]


def test_metadata_signals_handle_matches_and_missing_values() -> None:
    query = report("query", "LOST")
    candidate = report("candidate", "FOUND", location="Library Entrance")

    assert category_score(query, candidate) == 1.0
    assert category_score(query, report("other", "FOUND", category="Other")) == 0.0
    assert location_score(query, candidate) > 0
    assert time_score(query, candidate) == 1.0
    assert time_score(query, report("no-date", "FOUND", incident_at=None)) == 0.0


def test_weighted_ranking_explanations_and_tie_breaking() -> None:
    query = report("query", "LOST")
    best = report("a-match", "FOUND", location="Library Entrance")
    negative = report("z-negative", "FOUND", title="Black calculator", location="Hostel", incident_at=date(2026, 9, 1))
    result = rank_matches(query, [negative, best], 5)

    assert sum(WEIGHTS.values()) == pytest.approx(1.0)
    assert result.matcher_version == "lf-baseline-v1"
    assert result.matches[0].scoring_mode == "baseline"
    assert result.matches[0].report_id == "a-match"
    assert result.matches[0].score <= 1
    assert "Same item category" in result.matches[0].reasons
    assert confidence(CONFIDENCE_THRESHOLDS["high"]) == "HIGH"
    assert confidence(CONFIDENCE_THRESHOLDS["medium"]) == "MEDIUM"
    assert confidence(0.0) == "LOW"


def test_request_requires_unique_opposite_type_candidates() -> None:
    query = report("query", "LOST")
    candidate = report("candidate", "FOUND")

    MatchRequest(query=query, candidates=[candidate], top_k=1)
    with pytest.raises(ValueError):
        MatchRequest(query=query, candidates=[query], top_k=1)
    with pytest.raises(ValueError):
        MatchRequest(query=query, candidates=[candidate, candidate], top_k=1)
