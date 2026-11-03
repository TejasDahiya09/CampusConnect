from app.recommendations.schemas import SemanticRecommendationRequest
from app.recommendations.scoring import TeamUpSemanticScorer
from test_assistant_reranking import FakeEmbeddingProvider
from test_operational_routes import create_client
from fastapi.testclient import TestClient


def test_semantic_scoring_is_bounded_stable_and_authenticated() -> None:
    scorer = TeamUpSemanticScorer(FakeEmbeddingProvider())
    result = scorer.score(SemanticRecommendationRequest(query="React frontend", candidates=({"id": "student-b", "text": "React TypeScript"}, {"id": "student-a", "text": "Graphic design"})))
    assert [item.id for item in result.results] == ["student-b", "student-a"]
    assert all(0 <= item.score <= 1 for item in result.results)
    client = create_client()
    response = client.post("/api/v1/recommendations/teamup/semantic", json={"query": "React", "candidates": []})
    assert response.status_code == 200


def test_semantic_scoring_requires_internal_authentication() -> None:
    configured = create_client()
    anonymous = TestClient(configured.app)
    response = anonymous.post(
        "/api/v1/recommendations/teamup/semantic",
        json={"query": "React", "candidates": []},
        headers={},
    )
    assert response.status_code == 401
