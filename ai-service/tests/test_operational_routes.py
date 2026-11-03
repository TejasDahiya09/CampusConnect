from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

TEST_API_KEY = "test-only-internal-key"


def create_client() -> TestClient:
    app = create_app(
            Settings(
                AI_SERVICE_API_KEY=TEST_API_KEY,
                AI_SERVICE_ENV="test",
                AI_SERVICE_NAME="CampusConnect AI Test Service",
                AI_SERVICE_PORT=8002,
                AI_SERVICE_VERSION="0.1.0-test",
                AI_LOST_FOUND_MATCHER="baseline",
            )
        )
    app.state.model_ready = True
    return TestClient(app, headers={"X-CampusConnect-AI-Key": TEST_API_KEY})


def test_application_creation_uses_configured_metadata() -> None:
    app = create_client().app

    assert app.title == "CampusConnect AI Test Service"
    assert app.version == "0.1.0-test"
    assert app.debug is False


def test_health_is_a_small_stable_operational_response() -> None:
    response = create_client().get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "CampusConnect AI Test Service",
        "version": "0.1.0-test",
    }


def test_version_advertises_implemented_matching_capabilities() -> None:
    response = create_client().get("/version")

    assert response.status_code == 200
    assert response.json() == {
        "api_version": "v1",
        "capabilities": [
            "lost-found-baseline-matching",
            "lost-found-semantic-matching",
            "marketplace-hybrid-recommendations",
            "assistant-semantic-reranking",
            "assistant-grounded-generation",
            "resume-skill-extraction",
            "teamup-semantic-recommendations",
        ],
        "baseline_matcher": "lf-baseline-v1",
        "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
        "embedding_revision": "1110a243fdf4706b3f48f1d95db1a4f5529b4d41",
        "multimodal_status": "disabled",
        "recommender": "marketplace-hybrid-v1",
        "semantic_matcher": "lf-semantic-v1",
        "service": "CampusConnect AI Test Service",
        "version": "0.1.0-test",
    }


def test_readiness_is_truthful_and_contains_no_secret() -> None:
    response = create_client().get("/ready")
    assert response.status_code == 200
    assert response.json()["ready"] is True
    assert TEST_API_KEY not in response.text


def test_inference_requires_the_internal_service_credential() -> None:
    configured_client = create_client()
    client = TestClient(configured_client.app)
    payload = {"query": {"id": "lost", "type": "LOST"}, "candidates": [], "top_k": 1}
    missing = client.post("/api/v1/lost-found/match", json=payload, headers={})
    wrong = client.post(
        "/api/v1/lost-found/match",
        json=payload,
        headers={"X-CampusConnect-AI-Key": "wrong-test-key"},
    )
    assert missing.status_code == 401
    assert wrong.status_code == 401
    assert TEST_API_KEY not in missing.text
    assert TEST_API_KEY not in wrong.text
