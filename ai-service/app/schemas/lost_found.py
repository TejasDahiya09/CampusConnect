from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ReportType = Literal["LOST", "FOUND"]
Confidence = Literal["HIGH", "MEDIUM", "LOW"]
MatcherVersion = Literal["lf-baseline-v1", "lf-semantic-v1", "lf-multimodal-v1"]
ScoringMode = Literal["baseline", "semantic", "multimodal"]

MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_IMAGES_PER_REPORT = 3
MAX_REQUEST_IMAGE_BYTES = 8 * 1024 * 1024
SUPPORTED_IMAGE_MIME_TYPES = frozenset({"image/jpeg", "image/png", "image/webp"})


class ImageEvidence(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    content_base64: str = Field(min_length=1, max_length=((MAX_IMAGE_BYTES + 2) // 3) * 4)
    mime_type: Literal["image/jpeg", "image/png", "image/webp"]


class MatchReport(BaseModel):
    model_config = ConfigDict(frozen=True, str_strip_whitespace=True, extra="forbid")

    id: str = Field(min_length=1, max_length=120)
    type: ReportType
    title: str = Field(default="", max_length=180)
    description: str = Field(default="", max_length=5000)
    category: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=180)
    incident_at: date | None = None
    images: tuple[ImageEvidence, ...] = Field(default=(), max_length=MAX_IMAGES_PER_REPORT)


class MatchRequest(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    query: MatchReport
    candidates: list[MatchReport] = Field(min_length=0, max_length=100)
    top_k: int = Field(default=5, ge=1, le=20)

    @field_validator("candidates")
    @classmethod
    def unique_candidate_ids(cls, candidates: list[MatchReport]) -> list[MatchReport]:
        ids = [candidate.id for candidate in candidates]
        if len(ids) != len(set(ids)):
            raise ValueError("candidate IDs must be unique")
        return candidates

    @model_validator(mode="after")
    def validates_opposite_candidates(self) -> "MatchRequest":
        if any(candidate.id == self.query.id for candidate in self.candidates):
            raise ValueError("query report cannot be a candidate")
        if any(candidate.type == self.query.type for candidate in self.candidates):
            raise ValueError("candidates must have the opposite report type")
        encoded_total = sum(
            len(image.content_base64)
            for report in (self.query, *self.candidates)
            for image in report.images
        )
        if encoded_total > ((MAX_REQUEST_IMAGE_BYTES + 2) // 3) * 4:
            raise ValueError("total image evidence exceeds the request limit")
        return self


class MatchSignals(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    text: float = Field(ge=0, le=1)
    category: float = Field(ge=0, le=1)
    location: float = Field(ge=0, le=1)
    time: float = Field(ge=0, le=1)
    image: float | None = Field(default=None, ge=0, le=1)


class MatchResult(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    report_id: str
    score: float = Field(ge=0, le=1)
    confidence: Confidence
    signals: MatchSignals
    reasons: tuple[str, ...]
    scoring_mode: ScoringMode = "semantic"


class MatchResponse(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    matcher_version: MatcherVersion = "lf-baseline-v1"
    matches: tuple[MatchResult, ...]

    @model_validator(mode="after")
    def validates_ranked_matches(self) -> "MatchResponse":
        report_ids = [match.report_id for match in self.matches]
        if len(report_ids) != len(set(report_ids)):
            raise ValueError("match report IDs must be unique")
        if any(
            left.score < right.score
            for left, right in zip(self.matches, self.matches[1:], strict=False)
        ):
            raise ValueError("matches must be ordered by descending score")
        return self
