"""Strict, versioned contracts for future authorized Campus Assistant generation."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

AssistantContractVersion = Literal["campus-assistant-grounded-v1"]
AssistantSourceType = Literal["MARKETPLACE", "LOST_FOUND", "TEAMUP", "SERVICE"]
AssistantStatus = Literal["answered", "insufficient_evidence", "unsupported", "unavailable"]
AssistantErrorCode = Literal[
    "feature_disabled",
    "invalid_configuration",
    "provider_initialization_failed",
    "timeout",
    "quota_exceeded",
    "authentication_failed",
    "provider_unavailable",
    "invalid_provider_response",
]

MAX_QUESTION_CHARACTERS = 500
MAX_EVIDENCE_RECORDS = 20
MAX_EVIDENCE_CHARACTERS = 30_000
MAX_ANSWER_CHARACTERS = 4_000
MAX_CITATIONS = 10
MAX_RERANK_RESULTS = 20

_SOURCE_ROUTES: dict[str, str] = {
    "MARKETPLACE": "marketplace",
    "LOST_FOUND": "lost-found",
    "TEAMUP": "teamup",
    "SERVICE": "services",
}


class AssistantEvidence(BaseModel):
    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        str_strip_whitespace=True,
        allow_inf_nan=False,
    )

    source_id: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
    source_type: AssistantSourceType
    title: str = Field(min_length=1, max_length=180)
    snippet: str = Field(min_length=1, max_length=2_000)
    route: str = Field(min_length=1, max_length=240)
    relevance: float | None = Field(default=None, ge=0, le=1)

    @model_validator(mode="after")
    def validates_internal_route(self) -> "AssistantEvidence":
        expected = f"/{_SOURCE_ROUTES[self.source_type]}/{self.source_id}"
        if self.route != expected:
            raise ValueError("route must be the internal route for the supplied source")
        return self


class AssistantGenerationRequest(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)

    contract_version: AssistantContractVersion = "campus-assistant-grounded-v1"
    question: str = Field(min_length=2, max_length=MAX_QUESTION_CHARACTERS)
    evidence: tuple[AssistantEvidence, ...] = Field(max_length=MAX_EVIDENCE_RECORDS)

    @field_validator("question")
    @classmethod
    def normalizes_question(cls, question: str) -> str:
        normalized = " ".join(question.split())
        if len(normalized) < 2:
            raise ValueError("question must contain at least two characters")
        return normalized

    @model_validator(mode="after")
    def validates_evidence_bounds(self) -> "AssistantGenerationRequest":
        source_ids = [item.source_id for item in self.evidence]
        if len(source_ids) != len(set(source_ids)):
            raise ValueError("evidence source identifiers must be unique")
        total = sum(len(item.title) + len(item.snippet) for item in self.evidence)
        if total > MAX_EVIDENCE_CHARACTERS:
            raise ValueError("evidence text exceeds the request limit")
        return self


class AssistantCitation(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)

    source_id: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")


class AssistantGenerationResponse(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", str_strip_whitespace=True)

    contract_version: AssistantContractVersion = "campus-assistant-grounded-v1"
    status: AssistantStatus
    answer: str = Field(min_length=1, max_length=MAX_ANSWER_CHARACTERS)
    citations: tuple[AssistantCitation, ...] = Field(default=(), max_length=MAX_CITATIONS)
    provider: Literal["gemini"] | None = None
    model: str | None = Field(default=None, min_length=1, max_length=120)
    error_code: AssistantErrorCode | None = None

    @model_validator(mode="after")
    def validates_status_and_citations(self) -> "AssistantGenerationResponse":
        citation_ids = [citation.source_id for citation in self.citations]
        if len(citation_ids) != len(set(citation_ids)):
            raise ValueError("citation identifiers must be unique")
        if self.status == "answered" and not citation_ids:
            raise ValueError("answered responses require at least one citation")
        if self.status != "answered" and citation_ids:
            raise ValueError("non-answered responses cannot include citations")
        if (self.provider is None) != (self.model is None):
            raise ValueError("provider and model metadata must be supplied together")
        if self.status != "unavailable" and self.error_code is not None:
            raise ValueError("error classification is valid only for unavailable responses")
        return self


class AssistantModelOutput(BaseModel):
    """Untrusted structured model output validated before becoming an API response."""

    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        str_strip_whitespace=True,
        populate_by_name=True,
    )

    status: Literal["answered", "insufficient", "unsupported"]
    answer: str = Field(min_length=1, max_length=MAX_ANSWER_CHARACTERS)
    citation_ids: tuple[str, ...] = Field(
        default=(),
        alias="citationIds",
        max_length=MAX_CITATIONS,
    )

    @field_validator("citation_ids")
    @classmethod
    def validates_citation_identifiers(cls, citation_ids: tuple[str, ...]) -> tuple[str, ...]:
        if len(citation_ids) != len(set(citation_ids)):
            raise ValueError("citation identifiers must be unique")
        if any(
            len(source_id) > 120
            or not source_id
            or not source_id[0].isalnum()
            or any(not (character.isalnum() or character in "_-") for character in source_id)
            for source_id in citation_ids
        ):
            raise ValueError("citation identifier is malformed")
        return citation_ids

    @model_validator(mode="after")
    def validates_status_and_citations(self) -> "AssistantModelOutput":
        if self.status == "answered" and not self.citation_ids:
            raise ValueError("answered output requires citations")
        if self.status != "answered" and self.citation_ids:
            raise ValueError("non-answered output cannot include citations")
        return self


def validate_response_citations(
    request: AssistantGenerationRequest,
    response: AssistantGenerationResponse,
) -> AssistantGenerationResponse:
    """Reject model citations that were not supplied by authorized retrieval."""

    supplied = {item.source_id for item in request.evidence}
    if any(citation.source_id not in supplied for citation in response.citations):
        raise ValueError("response contains a citation outside the supplied evidence")
    return response


class AssistantRerankRequest(BaseModel):
    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        str_strip_whitespace=True,
        allow_inf_nan=False,
    )

    contract_version: AssistantContractVersion = "campus-assistant-grounded-v1"
    question: str = Field(min_length=2, max_length=MAX_QUESTION_CHARACTERS)
    evidence: tuple[AssistantEvidence, ...] = Field(max_length=MAX_EVIDENCE_RECORDS)
    limit: int = Field(default=10, ge=1, le=MAX_RERANK_RESULTS)

    @field_validator("question")
    @classmethod
    def normalizes_question(cls, question: str) -> str:
        normalized = " ".join(question.split())
        if len(normalized) < 2:
            raise ValueError("question must contain at least two characters")
        return normalized

    @model_validator(mode="after")
    def validates_evidence_bounds(self) -> "AssistantRerankRequest":
        source_ids = [item.source_id for item in self.evidence]
        if len(source_ids) != len(set(source_ids)):
            raise ValueError("evidence source identifiers must be unique")
        total = sum(len(item.title) + len(item.snippet) for item in self.evidence)
        if total > MAX_EVIDENCE_CHARACTERS:
            raise ValueError("evidence text exceeds the request limit")
        return self


class AssistantRerankResult(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", allow_inf_nan=False)

    source_id: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
    score: float = Field(ge=0, le=1)


class AssistantRerankResponse(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", allow_inf_nan=False)

    contract_version: AssistantContractVersion = "campus-assistant-grounded-v1"
    status: Literal["ranked", "empty"]
    rankings: tuple[AssistantRerankResult, ...] = Field(max_length=MAX_RERANK_RESULTS)
    reranker_version: Literal["assistant-minilm-rerank-v1"] = "assistant-minilm-rerank-v1"
    embedding_model: str = Field(min_length=1, max_length=180)

    @model_validator(mode="after")
    def validates_status_and_rankings(self) -> "AssistantRerankResponse":
        source_ids = [item.source_id for item in self.rankings]
        if len(source_ids) != len(set(source_ids)):
            raise ValueError("ranked source identifiers must be unique")
        if self.status == "empty" and self.rankings:
            raise ValueError("empty responses cannot include rankings")
        if self.status == "ranked" and not self.rankings:
            raise ValueError("ranked responses require rankings")
        return self
