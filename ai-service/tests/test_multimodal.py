import base64
import json
from datetime import date
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image
from pydantic import ValidationError

from app.matching.embeddings import EMBEDDING_DIMENSION, EmbeddingProvider
from app.matching.images import (
    IMAGE_EMBEDDING_DIMENSION,
    CachedImageEmbeddingProvider,
    ImageEmbeddingCache,
    ImageEmbeddingProvider,
    InvalidImageError,
    best_image_similarity,
    decode_image,
)
from app.matching.multimodal import MultimodalMatcher
from app.schemas.lost_found import ImageEvidence, MatchReport
from evaluation.multimodal_dataset import DATASET_SEED, generate_multimodal_dataset


def image_evidence(format_name: str = "PNG", color: str = "red") -> ImageEvidence:
    output = BytesIO()
    Image.new("RGB", (16, 16), color).save(output, format=format_name)
    mime = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}[format_name]
    return ImageEvidence(content_base64=base64.b64encode(output.getvalue()).decode(), mime_type=mime)


class FakeImages(ImageEmbeddingProvider):
    def __init__(self) -> None:
        self.calls: list[int] = []

    def encode(self, images):
        self.calls.append(len(images))
        return tuple((1.0, *(0.0 for _ in range(IMAGE_EMBEDDING_DIMENSION - 1))) for _ in images)


class FakeText(EmbeddingProvider):
    def encode(self, texts):
        return tuple((1.0, *(0.0 for _ in range(EMBEDDING_DIMENSION - 1))) for _ in texts)


def report(identifier: str, kind: str, images=()) -> MatchReport:
    return MatchReport(id=identifier, type=kind, title="campus item", description="dark object", category="Other", location="Library", incident_at=date(2026, 10, 1), images=images)


@pytest.mark.parametrize("format_name", ["JPEG", "PNG", "WEBP"])
def test_supported_images_are_verified_by_real_decoder(format_name: str) -> None:
    content, decoded = decode_image(image_evidence(format_name))
    assert content
    assert decoded.mode == "RGB"


def test_invalid_content_and_mime_mismatch_are_rejected() -> None:
    with pytest.raises(InvalidImageError):
        decode_image(ImageEvidence(content_base64="bm90LWltYWdl", mime_type="image/png"))
    with pytest.raises(InvalidImageError):
        decode_image(image_evidence("PNG").model_copy(update={"mime_type": "image/jpeg"}))
    with pytest.raises(ValidationError):
        ImageEvidence.model_validate({"content_base64": "aA==", "mime_type": "image/png", "url": "http://example.test"})


def test_image_provider_batches_unique_misses_and_reuses_content_cache() -> None:
    provider = FakeImages()
    cached = CachedImageEmbeddingProvider(provider, ImageEmbeddingCache(4))
    red, blue = image_evidence(color="red"), image_evidence(color="blue")
    assert len(cached.encode_evidence((red, red, blue))) == 3
    assert provider.calls == [2]
    cached.encode_evidence((blue, red))
    assert provider.calls == [2]


def test_image_cache_uses_content_identity_and_lru_eviction() -> None:
    cache = ImageEmbeddingCache(2)
    keys = [cache.key("model", bytes([value])) for value in range(3)]
    cache.put(keys[0], (1.0,))
    cache.put(keys[1], (2.0,))
    assert cache.get(keys[0]) == (1.0,)
    cache.put(keys[2], (3.0,))
    assert cache.get(keys[1]) is None
    assert keys[0] != ImageEmbeddingCache.key("other-model", b"\0")


def test_best_pair_uses_maximum_cosine_transformed_to_unit_interval() -> None:
    assert best_image_similarity(((1.0, 0.0), (0.0, 1.0)), ((0.0, 1.0),)) == 1.0
    assert best_image_similarity((), ((1.0, 0.0),)) is None


def test_multimodal_weights_and_one_sided_fallback_are_truthful() -> None:
    matcher = MultimodalMatcher(FakeText(), FakeImages())
    evidence = image_evidence()
    result = matcher.rank(report("q", "LOST", (evidence,)), [report("multi", "FOUND", (evidence,)), report("text", "FOUND")], 2)
    by_id = {match.report_id: match for match in result.matches}
    assert result.matcher_version == "lf-multimodal-v1"
    assert by_id["multi"].scoring_mode == "multimodal"
    assert by_id["multi"].signals.image == 1.0
    assert by_id["text"].scoring_mode == "semantic"
    assert by_id["text"].signals.image is None


def test_corrupt_images_fall_back_without_calling_image_model() -> None:
    provider = FakeImages()
    matcher = MultimodalMatcher(FakeText(), provider)
    corrupt = ImageEvidence(content_base64="bm90LWltYWdl", mime_type="image/png")
    result = matcher.rank(report("q", "LOST", (corrupt,)), [report("c", "FOUND", (corrupt,))], 1)
    assert result.matcher_version == "lf-semantic-v1"
    assert result.matches[0].scoring_mode == "semantic"
    assert provider.calls == []


def test_ranking_has_stable_report_id_tie_break() -> None:
    matcher = MultimodalMatcher(FakeText(), FakeImages())
    result = matcher.rank(report("q", "LOST"), [report("b", "FOUND"), report("a", "FOUND")], 2)
    assert [match.report_id for match in result.matches] == ["a", "b"]


def test_multimodal_dataset_is_deterministic_and_has_fallback_cases() -> None:
    first = generate_multimodal_dataset()
    assert first == generate_multimodal_dataset()
    assert DATASET_SEED == 20261022
    assert len(first) == 12
    assert sum(case.slice_name == "missing_image_fallback" for case in first) == 2
    assert all(case.true_id in {candidate.id for candidate in case.candidates} for case in first)


def test_completed_multimodal_artifact_has_provenance_and_required_metrics() -> None:
    target = Path(__file__).parents[1] / "evaluation" / "results" / "multimodal-v1.json"
    result = json.loads(target.read_text(encoding="utf-8"))
    assert result["status"] == "complete"
    assert result["dataset"]["seed"] == DATASET_SEED
    assert result["benchmark_v2_regression"]["status"] == "pass"
    assert set(result["metrics"]) == {"lf-semantic-v1", "lf-multimodal-v1"}
    assert result["provenance"]["stages_completed"][-1] == "artifact_written"
