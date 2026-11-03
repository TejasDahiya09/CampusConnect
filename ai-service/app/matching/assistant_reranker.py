"""Semantic reranking for already-authorized Campus Assistant evidence."""

from app.matching.embeddings import EmbeddingProvider, SemanticModelError
from app.matching.semantic import cosine_score
from app.schemas.assistant import (
    AssistantRerankRequest,
    AssistantRerankResponse,
    AssistantRerankResult,
)

RERANKER_VERSION = "assistant-minilm-rerank-v1"


class AssistantSemanticReranker:
    def __init__(self, provider: EmbeddingProvider) -> None:
        self._provider = provider

    def rank(self, payload: AssistantRerankRequest) -> AssistantRerankResponse:
        if not payload.evidence:
            return AssistantRerankResponse(
                status="empty",
                rankings=(),
                embedding_model=self._provider.model_id,
            )

        texts = [
            payload.question,
            *(f"{item.title}\n{item.snippet}" for item in payload.evidence),
        ]
        vectors = self._provider.encode(texts)
        if len(vectors) != len(texts):
            raise SemanticModelError("semantic model returned an unexpected vector count")
        query_vector = vectors[0]
        ranked = [
            AssistantRerankResult(source_id=item.source_id, score=cosine_score(query_vector, vector))
            for item, vector in zip(payload.evidence, vectors[1:], strict=True)
        ]
        ranked.sort(key=lambda item: (-item.score, item.source_id))
        return AssistantRerankResponse(
            status="ranked",
            rankings=tuple(ranked[: min(payload.limit, len(ranked))]),
            embedding_model=self._provider.model_id,
        )
