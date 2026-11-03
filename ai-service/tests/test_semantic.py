from datetime import date

import pytest

from app.core.config import Settings
from app.matching.embeddings import (
    EMBEDDING_DIMENSION,
    CachedEmbeddingProvider,
    EmbeddingCache,
    EmbeddingProvider,
    SemanticModelError,
)
from app.matching.semantic import MIN_SEMANTIC_SIMILARITY, SemanticMatcher, cosine_score
from app.matching.service import LostFoundMatchingService
from app.schemas.lost_found import MatchReport


class FakeProvider(EmbeddingProvider):
    def __init__(self, vectors: dict[str, tuple[float, ...]], fail: bool = False) -> None:
        self.vectors = vectors
        self.fail = fail
        self.calls: list[tuple[str, ...]] = []

    def encode(self, texts: list[str] | tuple[str, ...]) -> tuple[tuple[float, ...], ...]:
        self.calls.append(tuple(texts))
        if self.fail:
            raise SemanticModelError("fake model failure")
        return tuple(self.vectors[text] for text in texts)


def vector(first: float, second: float = 0.0) -> tuple[float, ...]:
    return (first, second, *(0.0 for _ in range(EMBEDDING_DIMENSION - 2)))


def report(identifier: str, report_type: str, title: str, description: str) -> MatchReport:
    return MatchReport(
        id=identifier,
        type=report_type,
        title=title,
        description=description,
        category="Phones",
        location="Central Library",
        incident_at=date(2026, 10, 1),
    )


def test_cache_reuses_normalized_text_and_evicts_least_recent_entry() -> None:
    provider = FakeProvider({"one": vector(1), "two": vector(0, 1), "three": vector(1, 1)})
    cached = CachedEmbeddingProvider(provider, EmbeddingCache(2))

    assert cached.encode(("one", "one", "two"))[0] == vector(1)
    assert provider.calls == [("one", "two")]
    cached.encode(("one",))
    cached.encode(("three",))
    cached.encode(("two",))
    assert provider.calls[-1] == ("two",)


def test_cosine_clamps_negative_and_handles_zero_vectors() -> None:
    assert cosine_score((1.0, 0.0), (-1.0, 0.0)) == 0.0
    assert cosine_score((0.0, 0.0), (1.0, 0.0)) == 0.0
    assert cosine_score((1.0, 0.0), (1.0, 0.0)) == 1.0


def test_semantic_matcher_batches_and_ranks_with_same_metadata_contract() -> None:
    query = report("lost", "LOST", "Samsung mobile", "dark protective cover")
    positive = report("found-good", "FOUND", "Galaxy phone", "black case")
    negative = report("found-bad", "FOUND", "water bottle", "blue flask")
    vectors = {
        "samsung mobile dark protective cover": vector(1, 0),
        "galaxy phone black case": vector(0.9, 0.1),
        "water bottle blue flask": vector(0, 1),
    }
    provider = FakeProvider(vectors)
    result = SemanticMatcher(provider).rank(query, [negative, positive], 2)

    assert result.matcher_version == "lf-semantic-v1"
    assert result.matches[0].report_id == "found-good"
    assert len(result.matches) == 1
    assert provider.calls == [("samsung mobile dark protective cover", "water bottle blue flask", "galaxy phone black case")]


def test_semantic_matcher_requires_minimum_item_similarity_before_metadata_can_contribute() -> None:
    query = report("lost", "LOST", "Grey backpack", "padded laptop storage")
    unrelated = report("found", "FOUND", "Bluetooth earphones", "black charging case")
    vectors = {
        "grey backpack padded laptop storage": vector(1, 0),
        "bluetooth earphones black charging case": vector(0.49, 0.872),
    }

    result = SemanticMatcher(FakeProvider(vectors)).rank(query, [unrelated], 1)

    assert cosine_score(vectors["grey backpack padded laptop storage"], vectors["bluetooth earphones black charging case"]) < MIN_SEMANTIC_SIMILARITY
    assert result.matches == ()


def test_semantic_failure_explicitly_falls_back_to_baseline() -> None:
    query = report("lost", "LOST", "Samsung mobile", "dark protective cover")
    candidate = report("found", "FOUND", "Galaxy phone", "black case")
    semantic = SemanticMatcher(FakeProvider({}, fail=True))
    service = LostFoundMatchingService(
        Settings(AI_LOST_FOUND_MATCHER="semantic"), semantic_matcher=semantic
    )

    assert service.rank(query, [candidate], 1).matcher_version == "lf-baseline-v1"


def test_baseline_configuration_does_not_call_semantic_provider() -> None:
    query = report("lost", "LOST", "Samsung mobile", "dark protective cover")
    candidate = report("found", "FOUND", "Galaxy phone", "black case")
    provider = FakeProvider({}, fail=True)
    service = LostFoundMatchingService(
        Settings(AI_LOST_FOUND_MATCHER="baseline"), semantic_matcher=SemanticMatcher(provider)
    )

    assert service.rank(query, [candidate], 1).matcher_version == "lf-baseline-v1"
    assert provider.calls == []


def test_provider_dimension_failure_is_controlled() -> None:
    cached = CachedEmbeddingProvider(FakeProvider({"bad": (1.0,)}), EmbeddingCache(2))
    with pytest.raises(SemanticModelError):
        cached.encode(("bad",))
