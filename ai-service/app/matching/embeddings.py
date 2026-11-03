"""Local sentence-transformer provider and bounded process-local embedding cache."""

from collections import OrderedDict
from collections.abc import Sequence
from hashlib import sha256
from threading import Lock
from threading import BoundedSemaphore

MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_REVISION = "1110a243fdf4706b3f48f1d95db1a4f5529b4d41"
EMBEDDING_DIMENSION = 384


class SemanticModelError(RuntimeError):
    """A controlled model load or inference failure eligible for baseline fallback."""


class EmbeddingCache:
    """Small LRU cache for derived vectors; it is never persisted or exposed."""

    def __init__(self, capacity: int) -> None:
        self._capacity = capacity
        self._entries: OrderedDict[str, tuple[float, ...]] = OrderedDict()
        self._lock = Lock()

    @staticmethod
    def key(model_id: str, normalized_text: str) -> str:
        return sha256(f"{model_id}\0{normalized_text}".encode("utf-8")).hexdigest()

    def get(self, model_id: str, normalized_text: str) -> tuple[float, ...] | None:
        key = self.key(model_id, normalized_text)
        with self._lock:
            vector = self._entries.get(key)
            if vector is not None:
                self._entries.move_to_end(key)
            return vector

    def put(self, model_id: str, normalized_text: str, vector: tuple[float, ...]) -> None:
        key = self.key(model_id, normalized_text)
        with self._lock:
            self._entries[key] = vector
            self._entries.move_to_end(key)
            while len(self._entries) > self._capacity:
                self._entries.popitem(last=False)

    @property
    def size(self) -> int:
        with self._lock:
            return len(self._entries)


class EmbeddingProvider:
    """Minimal protocol-like base class used by semantic matching and tests."""

    model_id: str = MODEL_ID
    dimension: int = EMBEDDING_DIMENSION

    def encode(self, texts: Sequence[str]) -> tuple[tuple[float, ...], ...]:
        raise NotImplementedError


class SentenceTransformerEmbeddingProvider(EmbeddingProvider):
    """Lazily loads one local model instance and encodes text in batches."""

    def __init__(self, device: str = "cpu", max_concurrency: int = 2) -> None:
        self.revision = MODEL_REVISION
        self._device = device
        self._model: object | None = None
        self._load_lock = Lock()
        self._inference_slots = BoundedSemaphore(max_concurrency)
        self.load_count = 0

    def _get_model(self) -> object:
        if self._model is not None:
            return self._model
        with self._load_lock:
            if self._model is not None:
                return self._model
            try:
                from sentence_transformers import SentenceTransformer

                self._model = SentenceTransformer(
                    self.model_id, device=self._device, revision=MODEL_REVISION
                )
                self.load_count += 1
            except Exception as error:  # pragma: no cover - exercised through provider fakes
                raise SemanticModelError("semantic model initialization failed") from error
            return self._model

    def encode(self, texts: Sequence[str]) -> tuple[tuple[float, ...], ...]:
        if not texts:
            return ()
        try:
            model = self._get_model()
            encoder = getattr(model, "encode", None)
            if not callable(encoder):
                raise SemanticModelError("semantic model does not support batch encoding")
            with self._inference_slots:
                vectors = encoder(
                    list(texts),
                    convert_to_numpy=True,
                    normalize_embeddings=True,
                    show_progress_bar=False,
                )
            encoded = tuple(tuple(float(value) for value in vector) for vector in vectors)
        except SemanticModelError:
            raise
        except Exception as error:  # pragma: no cover - provider library boundary
            raise SemanticModelError("semantic model inference failed") from error
        if any(len(vector) != self.dimension for vector in encoded):
            raise SemanticModelError("semantic model returned an unexpected embedding dimension")
        return encoded

    def preload(self) -> None:
        """Load and minimally exercise the pinned model before readiness."""
        self.encode(("campusconnect model readiness",))


class CachedEmbeddingProvider(EmbeddingProvider):
    """Adds deterministic cache reuse without changing embedding correctness."""

    def __init__(self, provider: EmbeddingProvider, cache: EmbeddingCache) -> None:
        self._provider = provider
        self._cache = cache
        self.model_id = provider.model_id
        self.dimension = provider.dimension

    def encode(self, texts: Sequence[str]) -> tuple[tuple[float, ...], ...]:
        results: list[tuple[float, ...] | None] = []
        missing_indices: dict[str, list[int]] = {}
        for index, text in enumerate(texts):
            vector = self._cache.get(self.model_id, text)
            results.append(vector)
            if vector is None:
                missing_indices.setdefault(text, []).append(index)
        if missing_indices:
            missing = tuple(missing_indices)
            encoded = self._provider.encode(missing)
            if len(encoded) != len(missing):
                raise SemanticModelError("semantic model returned an unexpected vector count")
            for text, vector in zip(missing, encoded, strict=True):
                if len(vector) != self.dimension:
                    raise SemanticModelError("semantic model returned an unexpected embedding dimension")
                self._cache.put(self.model_id, text, vector)
                for index in missing_indices[text]:
                    results[index] = vector
        if any(vector is None for vector in results):
            raise SemanticModelError("semantic cache did not resolve every embedding")
        return tuple(vector for vector in results if vector is not None)
