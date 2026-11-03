import math
import re
import unicodedata
from dataclasses import dataclass
from datetime import date

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.core.config import get_settings
from app.schemas.lost_found import MatchReport, MatchResponse, MatchResult, MatchSignals

MATCHER_VERSION = "lf-baseline-v1"
settings = get_settings()
WEIGHTS = {
    "text": settings.lost_found_weight_text,
    "category": settings.lost_found_weight_category,
    "location": settings.lost_found_weight_location,
    "time": settings.lost_found_weight_time,
}
CONFIDENCE_THRESHOLDS = {
    "high": settings.lost_found_high_confidence_threshold,
    "medium": settings.lost_found_medium_confidence_threshold,
}
TIME_DECAY_DAYS = settings.lost_found_time_decay_days


def _validate_configuration() -> None:
    if not math.isclose(sum(WEIGHTS.values()), 1.0, abs_tol=1e-9):
        raise ValueError("baseline weights must total 1.0")
    if not 0 <= CONFIDENCE_THRESHOLDS["medium"] <= CONFIDENCE_THRESHOLDS["high"] <= 1:
        raise ValueError("confidence thresholds must be ordered inside [0, 1]")


_validate_configuration()


def normalize_text(value: str | None) -> str:
    normalized = unicodedata.normalize("NFKC", value or "").lower()
    normalized = re.sub(r"[^\w\s]", " ", normalized, flags=re.UNICODE)
    return " ".join(normalized.split())


def report_text(report: MatchReport) -> str:
    return normalize_text(f"{report.title} {report.description}")


def text_scores(query: MatchReport, candidates: list[MatchReport]) -> list[float]:
    corpus = [report_text(query), *(report_text(candidate) for candidate in candidates)]
    if not candidates or not any(corpus):
        return [0.0] * len(candidates)
    try:
        matrix = TfidfVectorizer(token_pattern=r"(?u)\b\w+\b").fit_transform(corpus)
    except ValueError:
        return [0.0] * len(candidates)
    return [float(value) for value in cosine_similarity(matrix[0:1], matrix[1:]).flatten()]


def category_score(query: MatchReport, candidate: MatchReport) -> float:
    left, right = normalize_text(query.category), normalize_text(candidate.category)
    if not left or not right or left == "other" or right == "other":
        return 0.0
    return 1.0 if left == right else 0.0


def location_score(query: MatchReport, candidate: MatchReport) -> float:
    left, right = set(normalize_text(query.location).split()), set(normalize_text(candidate.location).split())
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def time_score(query: MatchReport, candidate: MatchReport) -> float:
    if query.incident_at is None or candidate.incident_at is None:
        return 0.0
    days = abs((query.incident_at - candidate.incident_at).days)
    return math.exp(-days / TIME_DECAY_DAYS)


def confidence(score: float) -> str:
    if score >= CONFIDENCE_THRESHOLDS["high"]:
        return "HIGH"
    if score >= CONFIDENCE_THRESHOLDS["medium"]:
        return "MEDIUM"
    return "LOW"


def reasons(signals: MatchSignals) -> tuple[str, ...]:
    values: list[str] = []
    if signals.category == 1:
        values.append("Same item category")
    if signals.text >= 0.20:
        values.append("Similar report description")
    if signals.location >= 0.25:
        values.append("Similar reported location")
    if signals.time >= 0.50:
        values.append("Reported within a close time window")
    return tuple(values)


def rank_matches(query: MatchReport, candidates: list[MatchReport], top_k: int) -> MatchResponse:
    scores = text_scores(query, candidates)
    ranked: list[MatchResult] = []
    for candidate, text in zip(candidates, scores, strict=True):
        signals = MatchSignals(
            text=max(0.0, min(1.0, text)),
            category=category_score(query, candidate),
            location=location_score(query, candidate),
            time=time_score(query, candidate),
        )
        score = sum(WEIGHTS[name] * getattr(signals, name) for name in WEIGHTS)
        score = max(0.0, min(1.0, score))
        ranked.append(
            MatchResult(
                report_id=candidate.id,
                score=score,
                confidence=confidence(score),
                signals=signals,
                reasons=reasons(signals),
                scoring_mode="baseline",
            )
        )
    ranked.sort(key=lambda result: (-result.score, result.report_id))
    return MatchResponse(matches=tuple(ranked[:top_k]))
