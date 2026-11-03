from app.matching.embeddings import EmbeddingProvider, SemanticModelError
from app.matching.semantic import cosine_score
from app.recommendations.schemas import SemanticRecommendationRequest, SemanticRecommendationResponse, SemanticScore


class TeamUpSemanticScorer:
    def __init__(self, provider: EmbeddingProvider) -> None:
        self._provider = provider

    def score(self, payload: SemanticRecommendationRequest) -> SemanticRecommendationResponse:
        texts = [payload.query, *(candidate.text for candidate in payload.candidates)]
        vectors = self._provider.encode(texts)
        if len(vectors) != len(texts):
            raise SemanticModelError("semantic model returned an unexpected vector count")
        query = vectors[0]
        results = tuple(
            SemanticScore(id=candidate.id, score=cosine_score(query, vector))
            for candidate, vector in zip(payload.candidates, vectors[1:], strict=True)
        )
        return SemanticRecommendationResponse(model=self._provider.model_id, results=results)
