"""Safe local OpenCLIP image decoding, batching, and bounded embedding cache."""

import base64
import binascii
from collections import OrderedDict
from collections.abc import Sequence
from hashlib import sha256
from io import BytesIO
from threading import Lock

import numpy as np
from PIL import Image, UnidentifiedImageError

from app.schemas.lost_found import ImageEvidence, MAX_IMAGE_BYTES

MODEL_ID = "ViT-B-32"
PRETRAINED_CHECKPOINT = "laion2b_s34b_b79k"
IMAGE_EMBEDDING_DIMENSION = 512
MAX_IMAGE_PIXELS = 20_000_000


class ImageModelError(RuntimeError):
    """Controlled OpenCLIP initialization or inference failure."""


class InvalidImageError(ValueError):
    """Image evidence that cannot be safely decoded."""


class ImageEmbeddingProvider:
    model_id = MODEL_ID
    checkpoint = PRETRAINED_CHECKPOINT
    dimension = IMAGE_EMBEDDING_DIMENSION

    def encode(self, images: Sequence[Image.Image]) -> tuple[tuple[float, ...], ...]:
        raise NotImplementedError


class OpenClipImageEmbeddingProvider(ImageEmbeddingProvider):
    def __init__(self, device: str = "cpu") -> None:
        self._device = device
        self._model: object | None = None
        self._preprocess: object | None = None
        self._load_lock = Lock()

    def _load(self) -> tuple[object, object]:
        if self._model is not None and self._preprocess is not None:
            return self._model, self._preprocess
        with self._load_lock:
            if self._model is not None and self._preprocess is not None:
                return self._model, self._preprocess
            try:
                import open_clip

                model, _, preprocess = open_clip.create_model_and_transforms(
                    self.model_id, pretrained=self.checkpoint, device=self._device
                )
                model.eval()
                self._model, self._preprocess = model, preprocess
            except Exception as error:
                raise ImageModelError("OpenCLIP model initialization failed") from error
        return self._model, self._preprocess

    def encode(self, images: Sequence[Image.Image]) -> tuple[tuple[float, ...], ...]:
        if not images:
            return ()
        try:
            import torch

            model, preprocess = self._load()
            tensors = [preprocess(image) for image in images]
            batch = torch.stack(tensors).to(self._device)
            with torch.inference_mode():
                vectors = model.encode_image(batch)
                vectors = vectors / vectors.norm(dim=-1, keepdim=True).clamp_min(1e-12)
            encoded = tuple(tuple(float(value) for value in row) for row in vectors.cpu().numpy())
        except ImageModelError:
            raise
        except Exception as error:
            raise ImageModelError("OpenCLIP image inference failed") from error
        if any(len(vector) != self.dimension for vector in encoded):
            raise ImageModelError("OpenCLIP returned an unexpected embedding dimension")
        return encoded


class ImageEmbeddingCache:
    def __init__(self, capacity: int) -> None:
        self._capacity = capacity
        self._entries: OrderedDict[str, tuple[float, ...]] = OrderedDict()
        self._lock = Lock()

    @staticmethod
    def key(model_identity: str, content: bytes) -> str:
        digest = sha256(content).digest()
        return sha256(model_identity.encode("utf-8") + b"\0" + digest).hexdigest()

    def get(self, key: str) -> tuple[float, ...] | None:
        with self._lock:
            value = self._entries.get(key)
            if value is not None:
                self._entries.move_to_end(key)
            return value

    def put(self, key: str, vector: tuple[float, ...]) -> None:
        with self._lock:
            self._entries[key] = vector
            self._entries.move_to_end(key)
            while len(self._entries) > self._capacity:
                self._entries.popitem(last=False)

    @property
    def size(self) -> int:
        return len(self._entries)


def decode_image(evidence: ImageEvidence) -> tuple[bytes, Image.Image]:
    try:
        content = base64.b64decode(evidence.content_base64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise InvalidImageError("image content is not valid base64") from error
    if not content or len(content) > MAX_IMAGE_BYTES:
        raise InvalidImageError("image byte size is outside the allowed range")
    previous_limit = Image.MAX_IMAGE_PIXELS
    Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
    try:
        with Image.open(BytesIO(content)) as decoded:
            decoded.verify()
        with Image.open(BytesIO(content)) as decoded:
            actual_format = decoded.format
            expected = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}[
                evidence.mime_type
            ]
            if actual_format != expected:
                raise InvalidImageError("decoded image format does not match its media type")
            image = decoded.convert("RGB")
            image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise InvalidImageError("image content could not be safely decoded") from error
    finally:
        Image.MAX_IMAGE_PIXELS = previous_limit
    return content, image


class CachedImageEmbeddingProvider:
    def __init__(self, provider: ImageEmbeddingProvider, cache: ImageEmbeddingCache) -> None:
        self._provider = provider
        self._cache = cache
        self.model_identity = f"{provider.model_id}:{provider.checkpoint}"

    def encode_evidence(
        self, evidence: Sequence[ImageEvidence]
    ) -> tuple[tuple[float, ...], ...]:
        resolved: list[tuple[float, ...] | None] = []
        missing: dict[str, tuple[bytes, Image.Image, list[int]]] = {}
        for item in evidence:
            try:
                content, image = decode_image(item)
            except InvalidImageError:
                continue
            key = ImageEmbeddingCache.key(self.model_identity, content)
            cached = self._cache.get(key)
            resolved.append(cached)
            if cached is None:
                if key not in missing:
                    missing[key] = (content, image, [])
                missing[key][2].append(len(resolved) - 1)
        if missing:
            encoded = self._provider.encode(tuple(value[1] for value in missing.values()))
            if len(encoded) != len(missing):
                raise ImageModelError("OpenCLIP returned an unexpected vector count")
            for (key, (_, _, indices)), vector in zip(missing.items(), encoded, strict=True):
                if len(vector) != self._provider.dimension:
                    raise ImageModelError("OpenCLIP returned an unexpected embedding dimension")
                self._cache.put(key, vector)
                for index in indices:
                    resolved[index] = vector
        return tuple(vector for vector in resolved if vector is not None)


def best_image_similarity(
    left: Sequence[tuple[float, ...]], right: Sequence[tuple[float, ...]]
) -> float | None:
    if not left or not right:
        return None
    # Normalized CLIP cosine is transformed from [-1, 1] to [0, 1] as a ranking signal.
    return max(
        max(0.0, min(1.0, (float(np.dot(a, b)) + 1.0) / 2.0))
        for a in left
        for b in right
    )
