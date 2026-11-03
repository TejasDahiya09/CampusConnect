import threading
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import numpy as np
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.matching.embeddings import EMBEDDING_DIMENSION, EmbeddingProvider, SentenceTransformerEmbeddingProvider
from app.matching.images import OpenClipImageEmbeddingProvider
from app.schemas.recommendations import MarketplaceRecommendationRequest

KEY = "hardening-test-only-key"


class CountingProvider(EmbeddingProvider):
    def __init__(self) -> None:
        self.calls = 0

    def encode(self, texts):
        self.calls += 1
        return tuple((1.0, *(0.0 for _ in range(EMBEDDING_DIMENSION - 1))) for _ in texts)


def settings() -> Settings:
    return Settings(AI_SERVICE_API_KEY=KEY, AI_SERVICE_ENV="test")


def test_shared_provider_preloads_once_and_serves_both_consumers() -> None:
    provider = CountingProvider()
    app = create_app(settings(), embedding_provider=provider)
    with patch.object(OpenClipImageEmbeddingProvider, "_load", side_effect=AssertionError("CLIP loaded")), TestClient(app, headers={"X-CampusConnect-AI-Key": KEY}) as client:
        assert client.get("/ready").status_code == 200
        assert provider.calls == 1
        shared = app.state.embedding_provider
        assert app.state.matching_service._semantic_matcher._provider is shared
        assert app.state.matching_service._multimodal_matcher._text is shared
        assert app.state.marketplace_recommender._embeddings is shared
        match = client.post(
            "/api/v1/lost-found/match",
            json={
                "query": {"id": "q", "type": "LOST", "title": "wallet"},
                "candidates": [{"id": "c", "type": "FOUND", "title": "wallet"}],
                "top_k": 1,
            },
        )
        recommendation = client.post(
            "/api/v1/recommendations/marketplace",
            json={
                "user_context": {"interests": ["books"], "category_signals": []},
                "candidates": [{
                    "id": "listing", "title": "Book", "description": "Textbook",
                    "category": "Books", "created_at": "2026-10-07T00:00:00Z",
                }],
                "limit": 1,
            },
        )
        assert match.status_code == 200
        assert recommendation.status_code == 200
        assert provider.calls == 3


def test_failed_preload_keeps_readiness_false() -> None:
    class FailingProvider(EmbeddingProvider):
        def encode(self, texts):
            raise RuntimeError("test failure")

    app = create_app(settings(), embedding_provider=FailingProvider())
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        response = client.get("/ready")
        assert response.status_code == 503
        assert response.json()["ready"] is False


def test_recommendation_contract_rejects_abuse_boundaries() -> None:
    valid = {
        "user_context": {"interests": ["books"], "category_signals": []},
        "candidates": [{
            "id": "listing", "title": "Book", "description": "Textbook",
            "category": "Books", "created_at": "2026-10-07T00:00:00Z",
        }],
        "limit": 1,
    }
    for mutation in (
        {**valid, "unexpected": True},
        {**valid, "user_context": {"interests": ["x" * 101], "category_signals": []}},
        {**valid, "user_context": {"interests": ["x"] * 31, "category_signals": []}},
        {**valid, "candidates": [valid["candidates"][0], valid["candidates"][0]]},
        {**valid, "candidates": [
            {**valid["candidates"][0], "id": f"listing-{index}"} for index in range(101)
        ]},
        {**valid, "user_context": {
            "interests": [],
            "category_signals": [{"category": "Books", "strength": float("nan"), "source": "view"}],
        }},
    ):
        try:
            MarketplaceRecommendationRequest.model_validate(mutation)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid recommendation request was accepted")


def test_request_body_limit_rejects_oversized_payload() -> None:
    configured = Settings(
        AI_SERVICE_API_KEY=KEY,
        AI_SERVICE_ENV="test",
        AI_MAX_REQUEST_BYTES=100_000,
    )
    app = create_app(configured, embedding_provider=CountingProvider())
    app.state.model_ready = True
    client = TestClient(app, headers={"X-CampusConnect-AI-Key": KEY})
    response = client.post(
        "/api/v1/lost-found/match",
        content="x" * 100_001,
        headers={"content-type": "application/json"},
    )
    assert response.status_code == 413


def test_sentence_transformer_inference_is_bounded_and_recovers() -> None:
    class TrackingModel:
        def __init__(self) -> None:
            self.active = 0
            self.maximum = 0
            self.lock = threading.Lock()

        def encode(self, texts, **_kwargs):
            with self.lock:
                self.active += 1
                self.maximum = max(self.maximum, self.active)
            time.sleep(0.02)
            with self.lock:
                self.active -= 1
            return np.ones((len(texts), EMBEDDING_DIMENSION), dtype=np.float32)

    model = TrackingModel()
    provider = SentenceTransformerEmbeddingProvider(max_concurrency=2)
    provider._model = model
    with ThreadPoolExecutor(max_workers=6) as executor:
        results = list(executor.map(lambda index: provider.encode((f"text-{index}",)), range(6)))
    assert all(len(result) == 1 for result in results)
    assert model.maximum == 2
    assert provider.encode(("after",))
