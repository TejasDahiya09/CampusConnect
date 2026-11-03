import math

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.main import create_app
from app.matching.assistant_reranker import AssistantSemanticReranker
from app.matching.embeddings import EmbeddingProvider, SemanticModelError
from app.schemas.assistant import (
    AssistantRerankRequest,
    AssistantRerankResponse,
    AssistantRerankResult,
)

TEST_API_KEY = "test-only-reranking-key"


class FakeEmbeddingProvider(EmbeddingProvider):
    model_id = "test-minilm"
    dimension = 2

    def __init__(self, vectors=()) -> None:
        self.vectors = tuple(vectors)
        self.calls = 0

    def encode(self, texts):
        self.calls += 1
        if self.vectors:
            return self.vectors
        return tuple((1.0, 0.0) for _ in texts)


class FailingEmbeddingProvider(FakeEmbeddingProvider):
    def encode(self, texts):
        del texts
        raise SemanticModelError("private model failure")


def evidence(source_id: str, title: str = "Calculator") -> dict[str, object]:
    return {
        "source_id": source_id,
        "source_type": "MARKETPLACE",
        "title": title,
        "snippet": "Public campus listing.",
        "route": f"/marketplace/{source_id}",
        "relevance": 0.5,
    }


def payload(records, limit=10):
    return {
        "contract_version": "campus-assistant-grounded-v1",
        "question": "Where can I find a calculator?",
        "evidence": records,
        "limit": limit,
    }


def client(provider: EmbeddingProvider, *, ready: bool = True, with_key: bool = True):
    app = create_app(
        Settings(
            AI_SERVICE_API_KEY=TEST_API_KEY,
            AI_SERVICE_ENV="test",
            AI_LOST_FOUND_MATCHER="baseline",
        ),
        embedding_provider=provider,
    )
    app.state.model_ready = ready
    headers = {"X-CampusConnect-AI-Key": TEST_API_KEY} if with_key else {}
    return TestClient(app, headers=headers)


def test_reranking_requires_internal_authentication() -> None:
    response = client(FakeEmbeddingProvider(), with_key=False).post(
        "/api/v1/assistant/rerank",
        json=payload([evidence("source-one")]),
    )
    assert response.status_code == 401
    assert TEST_API_KEY not in response.text


def test_semantic_reranking_orders_similarity_and_uses_one_batch() -> None:
    provider = FakeEmbeddingProvider(((1.0, 0.0), (0.0, 1.0), (1.0, 0.0)))
    response = client(provider).post(
        "/api/v1/assistant/rerank",
        json=payload(
            [
                evidence("irrelevant", "Bicycle"),
                evidence("relevant", "Calculator"),
            ]
        ),
    )
    assert response.status_code == 200
    body = response.json()
    assert [item["source_id"] for item in body["rankings"]] == ["relevant", "irrelevant"]
    assert body["rankings"][0]["score"] == 1.0
    assert body["rankings"][1]["score"] == 0.0
    assert provider.calls == 1


def test_semantic_reranking_uses_source_id_for_deterministic_ties() -> None:
    provider = FakeEmbeddingProvider(((1.0, 0.0), (1.0, 0.0), (1.0, 0.0)))
    result = AssistantSemanticReranker(provider).rank(
        AssistantRerankRequest.model_validate(payload([evidence("source-b"), evidence("source-a")]))
    )
    assert [item.source_id for item in result.rankings] == ["source-a", "source-b"]


def test_empty_evidence_skips_model_even_when_not_ready() -> None:
    provider = FakeEmbeddingProvider()
    response = client(provider, ready=False).post(
        "/api/v1/assistant/rerank",
        json=payload([]),
    )
    assert response.status_code == 200
    assert response.json()["status"] == "empty"
    assert provider.calls == 0


@pytest.mark.parametrize(
    "records",
    [
        [evidence("duplicate"), evidence("duplicate")],
        [{**evidence("source"), "source_type": "MESSAGE"}],
        [{**evidence("source"), "route": "/messages/source"}],
        [{**evidence("source"), "unexpected": True}],
    ],
)
def test_request_contract_rejects_duplicate_unsafe_or_unknown_evidence(records) -> None:
    response = client(FakeEmbeddingProvider()).post(
        "/api/v1/assistant/rerank",
        json=payload(records),
    )
    assert response.status_code == 422


def test_request_contract_rejects_oversized_input() -> None:
    too_many = [evidence(f"source-{index}") for index in range(21)]
    assert client(FakeEmbeddingProvider()).post(
        "/api/v1/assistant/rerank", json=payload(too_many)
    ).status_code == 422
    oversized_question = payload([])
    oversized_question["question"] = "x" * 501
    assert client(FakeEmbeddingProvider()).post(
        "/api/v1/assistant/rerank", json=oversized_question
    ).status_code == 422


def test_response_contract_rejects_nan_and_infinite_scores() -> None:
    for score in (math.nan, math.inf, -math.inf):
        with pytest.raises(ValidationError):
            AssistantRerankResult(source_id="source", score=score)
    with pytest.raises(ValidationError):
        AssistantRerankResponse(
            status="ranked",
            rankings=(),
            embedding_model="test-minilm",
        )


def test_model_unavailability_returns_safe_503() -> None:
    response = client(FailingEmbeddingProvider()).post(
        "/api/v1/assistant/rerank",
        json=payload([evidence("source")]),
    )
    assert response.status_code == 503
    assert "private model failure" not in response.text


def test_app_reuses_the_shared_embedding_provider_and_does_not_initialize_gemini() -> None:
    provider = FakeEmbeddingProvider()
    test_client = client(provider)
    app = test_client.app
    assert app.state.base_embedding_provider is provider
    assert app.state.assistant_reranker._provider is app.state.embedding_provider
    assert app.state.generation_provider.__class__.__name__ == "UnavailableGenerationProvider"
