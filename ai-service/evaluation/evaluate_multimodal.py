"""Run the real local AI-4 comparison and atomically persist a completed artifact."""

import json
import os
import platform
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.core.config import get_settings
from app.matching.embeddings import SentenceTransformerEmbeddingProvider
from app.matching.images import IMAGE_EMBEDDING_DIMENSION, MODEL_ID, PRETRAINED_CHECKPOINT, CachedImageEmbeddingProvider, ImageEmbeddingCache, OpenClipImageEmbeddingProvider, best_image_similarity, decode_image
from app.matching.multimodal import MULTIMODAL_WEIGHTS, SEMANTIC_WEIGHTS, MultimodalMatcher
from app.matching.semantic import SemanticMatcher
from evaluation.evaluate_v2 import _metrics, comparison
from evaluation.multimodal_dataset import DATASET_SEED, DATASET_VERSION, generate_multimodal_dataset

TARGET = Path(__file__).parent / "results" / "multimodal-v1.json"


def _ranks(cases, ranker):
    ranks = []
    by_slice: dict[str, list[int]] = {}
    for case in cases:
        matches = ranker(case.query, list(case.candidates), len(case.candidates)).matches
        rank = next((index + 1 for index, match in enumerate(matches) if match.report_id == case.true_id), 0)
        ranks.append(rank)
        by_slice.setdefault(case.slice_name, []).append(rank)
    return _metrics(ranks), {name: _metrics(values) for name, values in by_slice.items()}, ranks


def run() -> dict[str, object]:
    started = datetime.now(UTC)
    run_id = str(uuid4())
    print("[AI-4] Stage 1/5 - Generating controlled dataset", flush=True)
    cases = generate_multimodal_dataset()
    settings = get_settings()
    text_provider = SentenceTransformerEmbeddingProvider(settings.lost_found_embedding_device)
    image_provider = OpenClipImageEmbeddingProvider(settings.lost_found_image_device)
    semantic = SemanticMatcher(text_provider, settings.lost_found_embedding_cache_size)
    multimodal = MultimodalMatcher(text_provider, image_provider, settings.lost_found_embedding_cache_size, settings.lost_found_image_cache_size)
    print("[AI-4] Stage 2/5 - Loading OpenCLIP and measuring image inference", flush=True)
    sample_evidence = tuple(case.query.images[0] for case in cases if case.query.images)
    decoded = [decode_image(item)[1] for item in sample_evidence]
    before = time.perf_counter(); image_provider.encode((decoded[0],)); load_and_single_ms = (time.perf_counter() - before) * 1000
    before = time.perf_counter(); batch_vectors = image_provider.encode(decoded); batch_ms = (time.perf_counter() - before) * 1000
    cached = CachedImageEmbeddingProvider(image_provider, ImageEmbeddingCache(32)); cached.encode_evidence((sample_evidence[0],))
    before = time.perf_counter(); cached.encode_evidence((sample_evidence[0],)); cache_ms = (time.perf_counter() - before) * 1000
    before = time.perf_counter(); best_image_similarity((batch_vectors[0],), tuple(batch_vectors)); cosine_ms = (time.perf_counter() - before) * 1000
    print("[AI-4] Stage 3/5 - Comparing semantic and multimodal ranking", flush=True)
    semantic_metrics, semantic_slices, semantic_ranks = _ranks(cases, semantic.rank)
    before = time.perf_counter(); multimodal_metrics, multimodal_slices, multimodal_ranks = _ranks(cases, multimodal.rank); scoring_ms = (time.perf_counter() - before) * 1000 / len(cases)
    print("[AI-4] Stage 4/5 - Verifying frozen Benchmark V2", flush=True)
    frozen = comparison()
    expected = {"precision_at_1": 0.362, "precision_at_3": 0.176, "recall_at_3": 0.528, "recall_at_5": 0.67, "mrr": 0.46436666666666665}
    actual = frozen["semantic"]["overall"]
    benchmark_pass = all(abs(actual[name] - value) <= 1e-12 for name, value in expected.items())
    completed = datetime.now(UTC)
    decision = "A - MULTIMODAL MATCHING IMPROVES RESULTS" if multimodal_metrics["mrr"] > semantic_metrics["mrr"] and multimodal_metrics["precision_at_1"] >= semantic_metrics["precision_at_1"] else "B - MULTIMODAL MATCHING NEEDS FURTHER TUNING"
    result = {"status": "complete", "schema_version": "ai-4-multimodal-result-v1", "provenance": {"run_id": run_id, "started_at": started.isoformat().replace("+00:00", "Z"), "completed_at": completed.isoformat().replace("+00:00", "Z"), "duration_ms": (completed-started).total_seconds()*1000, "stages_completed": ["dataset_generated", "model_loaded", "performance_measured", "comparison_completed", "benchmark_v2_verified", "artifact_written"]}, "dataset": {"version": DATASET_VERSION, "seed": DATASET_SEED, "query_count": len(cases), "provenance": "Locally generated geometric PNG fixtures; no student or production data.", "slices": {name: sum(case.slice_name == name for case in cases) for name in {case.slice_name for case in cases}}}, "model": {"identifier": MODEL_ID, "pretrained_checkpoint": PRETRAINED_CHECKPOINT, "embedding_dimension": IMAGE_EMBEDDING_DIMENSION, "device": settings.lost_found_image_device}, "weights": {"multimodal": MULTIMODAL_WEIGHTS, "fallback": SEMANTIC_WEIGHTS}, "metrics": {"lf-semantic-v1": semantic_metrics, "lf-multimodal-v1": multimodal_metrics}, "slice_metrics": {"lf-semantic-v1": semantic_slices, "lf-multimodal-v1": multimodal_slices}, "error_analysis": {"multimodal_fixed_semantic": sum(a != 1 and b == 1 for a,b in zip(semantic_ranks,multimodal_ranks,strict=True)), "multimodal_hurt_semantic": sum(a == 1 and b != 1 for a,b in zip(semantic_ranks,multimodal_ranks,strict=True)), "both_failed_top1": sum(a != 1 and b != 1 for a,b in zip(semantic_ranks,multimodal_ranks,strict=True))}, "performance_ms": {"model_load_plus_first_single_embedding": load_and_single_ms, "batch_embedding_10_images": batch_ms, "cached_lookup": cache_ms, "pairwise_cosine": cosine_ms, "multimodal_ranking_per_query": scoring_ms}, "image_embedding_bytes_each": IMAGE_EMBEDDING_DIMENSION * 4, "environment": {"python": platform.python_version(), "device": settings.lost_found_image_device}, "benchmark_v2_regression": {"status": "pass" if benchmark_pass else "fail", "version": frozen["benchmark_version"]}, "recommendation": decision}
    if not benchmark_pass:
        raise RuntimeError("Benchmark V2 regression failed")
    print("[AI-4] Stage 5/5 - Writing verified artifact", flush=True)
    temporary = TARGET.with_name(f".{TARGET.name}.{run_id}.tmp")
    temporary.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, TARGET)
    print("AI-4 MULTIMODAL EVALUATION COMPLETE", flush=True)
    return result


if __name__ == "__main__":
    run()
