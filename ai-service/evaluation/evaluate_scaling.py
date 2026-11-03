"""Efficient, observable AI-3 scaling evaluation with verified provenance."""

import argparse
import json
import os
import platform
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from statistics import median
from time import perf_counter_ns
from uuid import uuid4

import numpy as np

from app.core.config import get_settings
from app.matching.baseline import MATCHER_VERSION as BASELINE_VERSION, rank_matches, report_text
from app.matching.benchmark_v2 import BENCHMARK_VERSION, generate_benchmark_v2
from app.matching.embeddings import EMBEDDING_DIMENSION, MODEL_ID, MODEL_REVISION, EmbeddingProvider
from app.matching.semantic import MATCHER_VERSION as SEMANTIC_VERSION, SemanticMatcher
from evaluation.evaluate_v2 import evaluate_matcher
from evaluation.scaling import (
    CANDIDATE_POOL_LEVELS,
    SCALE_LEVELS,
    SCALING_CORPUS_VERSION,
    SCALING_REPORT_COUNT,
    SCALING_SEED,
    ScalingEntry,
    controlled_candidate_indices,
    generate_scaling_corpus,
    metadata_candidate_order,
    rank_of_target,
    recall_at,
    select_query_entries,
    validate_scaling_result,
)

EVALUATOR_VERSION = "ai-3-scaling-evaluator-v2"
ARTIFACT_SCHEMA_VERSION = "ai-3-scaling-result-v2"
DEFAULT_BATCH_SIZE = 64
COSINE_REPETITIONS = 3
WARM_REPETITIONS = 3

EXPECTED_BASELINE_METRICS = {
    "precision_at_1": 0.288,
    "precision_at_3": 0.11733333333333333,
    "recall_at_3": 0.352,
    "recall_at_5": 0.39,
    "mrr": 0.32406666666666667,
}
EXPECTED_SEMANTIC_METRICS = {
    "precision_at_1": 0.362,
    "precision_at_3": 0.176,
    "recall_at_3": 0.528,
    "recall_at_5": 0.67,
    "mrr": 0.46436666666666665,
}

ProgressReporter = Callable[[str], None]
BenchmarkVerifier = Callable[["MatrixEncoder"], dict[str, object]]


@dataclass(frozen=True)
class EvaluationConfig:
    mode: str
    report_count: int
    scale_levels: tuple[int, ...]
    candidate_pool_levels: tuple[int, ...]
    scale_query_count: int
    pool_query_count: int
    batch_size: int


def full_config(batch_size: int = DEFAULT_BATCH_SIZE) -> EvaluationConfig:
    return EvaluationConfig(
        mode="full",
        report_count=SCALING_REPORT_COUNT,
        scale_levels=SCALE_LEVELS,
        candidate_pool_levels=CANDIDATE_POOL_LEVELS,
        scale_query_count=64,
        pool_query_count=128,
        batch_size=batch_size,
    )


def quick_config(batch_size: int = DEFAULT_BATCH_SIZE) -> EvaluationConfig:
    return EvaluationConfig(
        mode="quick",
        report_count=200,
        scale_levels=(20, 50, 100, 150, 200),
        candidate_pool_levels=(10, 25, 50, 100),
        scale_query_count=8,
        pool_query_count=16,
        batch_size=batch_size,
    )


def _utc_now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _milliseconds(start_ns: int) -> float:
    return (perf_counter_ns() - start_ns) / 1_000_000


def _median(values: list[float]) -> float:
    return round(float(median(values)), 3)


class MatrixEncoder:
    """Evaluation-only interface for batched normalized dense embeddings."""

    model_id: str = MODEL_ID
    dimension: int = EMBEDDING_DIMENSION

    @property
    def encode_calls(self) -> int:
        raise NotImplementedError

    @property
    def encoded_texts(self) -> int:
        raise NotImplementedError

    def load(self) -> None:
        raise NotImplementedError

    def encode(self, texts: Sequence[str], *, show_progress: bool) -> np.ndarray:
        raise NotImplementedError


class SentenceTransformerMatrixEncoder(MatrixEncoder):
    """Loads MiniLM once and returns normalized float32 matrices in controlled batches."""

    def __init__(self, device: str, batch_size: int) -> None:
        self._device = device
        self._batch_size = batch_size
        self._model: object | None = None
        self._encode_calls = 0
        self._encoded_texts = 0

    @property
    def encode_calls(self) -> int:
        return self._encode_calls

    @property
    def encoded_texts(self) -> int:
        return self._encoded_texts

    def load(self) -> None:
        if self._model is not None:
            return
        from sentence_transformers import SentenceTransformer

        self._model = SentenceTransformer(
            self.model_id, device=self._device, revision=MODEL_REVISION
        )

    def encode(self, texts: Sequence[str], *, show_progress: bool) -> np.ndarray:
        self.load()
        encoder = getattr(self._model, "encode", None)
        if not callable(encoder):
            raise RuntimeError("semantic model does not support batch encoding")
        vectors = encoder(
            list(texts),
            batch_size=self._batch_size,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=show_progress,
        )
        matrix = np.asarray(vectors, dtype=np.float32)
        if matrix.shape != (len(texts), self.dimension):
            raise RuntimeError("embedding matrix has an unexpected shape")
        self._encode_calls += 1
        self._encoded_texts += len(texts)
        return matrix


class PrecomputedEmbeddingProvider(EmbeddingProvider):
    """Feeds real precomputed vectors through the unchanged semantic matcher."""

    def __init__(self, vectors: dict[str, tuple[float, ...]]) -> None:
        self._vectors = vectors

    def encode(self, texts: Sequence[str]) -> tuple[tuple[float, ...], ...]:
        return tuple(self._vectors[text] for text in texts)


def _encode_report_matrix(
    encoder: MatrixEncoder, entries: Sequence[ScalingEntry], *, show_progress: bool
) -> tuple[np.ndarray, int]:
    texts = tuple(report_text(entry.report) for entry in entries)
    unique_texts = tuple(dict.fromkeys(texts))
    unique_matrix = encoder.encode(unique_texts, show_progress=show_progress)
    vector_by_text = {text: unique_matrix[index] for index, text in enumerate(unique_texts)}
    matrix = np.asarray([vector_by_text[text] for text in texts], dtype=np.float32)
    return matrix, len(unique_texts)


def _target_position(
    indices: tuple[int, ...], report_index: dict[str, int], query: ScalingEntry
) -> int:
    return indices.index(report_index[query.paired_report_id])


def _scale_results(
    config: EvaluationConfig,
    entries: tuple[ScalingEntry, ...],
    matrix: np.ndarray,
    query_entries: tuple[ScalingEntry, ...],
    full_embedding_ms: float,
) -> list[dict[str, object]]:
    report_index = {entry.report.id: index for index, entry in enumerate(entries)}
    results: list[dict[str, object]] = []
    for candidate_count in config.scale_levels:
        cosine_ms: list[float] = []
        warm_ms: list[float] = []
        ranks: list[int] = []
        vector_bytes = candidate_count * EMBEDDING_DIMENSION * np.dtype(np.float32).itemsize
        for query in query_entries:
            indices = controlled_candidate_indices(entries, query, candidate_count, SCALING_SEED)
            index_array = np.asarray(indices)
            candidate_matrix = matrix[index_array]
            query_vector = matrix[report_index[query.report.id]]
            target_position = _target_position(indices, report_index, query)
            ranks.append(rank_of_target(query_vector, candidate_matrix, target_position))
            for _ in range(COSINE_REPETITIONS):
                start = perf_counter_ns()
                rank_of_target(query_vector, candidate_matrix, target_position)
                cosine_ms.append(_milliseconds(start))
            for _ in range(WARM_REPETITIONS):
                start = perf_counter_ns()
                warm_matrix = matrix[index_array]
                rank_of_target(query_vector, warm_matrix, target_position)
                warm_ms.append(_milliseconds(start))
        embedding_kind = "measured" if candidate_count == config.report_count else "derived_estimate"
        embedding_ms = (
            full_embedding_ms
            if embedding_kind == "measured"
            else full_embedding_ms * candidate_count / config.report_count
        )
        results.append(
            {
                "candidate_count": candidate_count,
                "embedding_time_ms": round(embedding_ms, 3),
                "embedding_timing_kind": embedding_kind,
                "embedding_estimation_basis": None
                if embedding_kind == "measured"
                else "linear proportion of the single measured full-corpus batch duration",
                "cosine_search_median_ms_per_query": _median(cosine_ms),
                "warm_precomputed_total_median_ms_per_query": _median(warm_ms),
                "vector_matrix_bytes": int(vector_bytes),
                "vector_matrix_mib": round(vector_bytes / (1024 * 1024), 3),
                "controlled_pool_recall_at_1": recall_at(tuple(ranks), 1),
                "controlled_pool_recall_at_3": recall_at(tuple(ranks), 3),
                "controlled_pool_recall_at_5": recall_at(tuple(ranks), 5),
            }
        )
    return results


def _candidate_pool_results(
    config: EvaluationConfig,
    entries: tuple[ScalingEntry, ...],
    matrix: np.ndarray,
    query_entries: tuple[ScalingEntry, ...],
) -> list[dict[str, object]]:
    report_index = {entry.report.id: index for index, entry in enumerate(entries)}
    found_entries = tuple(entry for entry in entries if entry.report.type == "FOUND")
    found_indices = np.asarray([report_index[entry.report.id] for entry in found_entries])
    found_matrix = matrix[found_indices]
    accumulators = {
        pool: {
            "retrieval_ms": [],
            "ranking_ms": [],
            "ranks": [],
            "included_ranks": [],
            "excluded": 0,
            "misranked": 0,
        }
        for pool in config.candidate_pool_levels
    }
    for query in query_entries:
        start = perf_counter_ns()
        ordering = metadata_candidate_order(query, found_entries)
        retrieval_ms = _milliseconds(start)
        query_vector = matrix[report_index[query.report.id]]
        for candidate_pool in config.candidate_pool_levels:
            state = accumulators[candidate_pool]
            retrieval_values = state["retrieval_ms"]
            assert isinstance(retrieval_values, list)
            retrieval_values.append(retrieval_ms)
            selected = ordering[:candidate_pool]
            target_position = next(
                (
                    position
                    for position, candidate_index in enumerate(selected)
                    if found_entries[candidate_index].report.id == query.paired_report_id
                ),
                None,
            )
            ranks = state["ranks"]
            assert isinstance(ranks, list)
            if target_position is None:
                state["excluded"] = int(state["excluded"]) + 1
                ranks.append(0)
                continue
            start = perf_counter_ns()
            rank = rank_of_target(query_vector, found_matrix[np.asarray(selected)], target_position)
            ranking_values = state["ranking_ms"]
            included_ranks = state["included_ranks"]
            assert isinstance(ranking_values, list) and isinstance(included_ranks, list)
            ranking_values.append(_milliseconds(start))
            ranks.append(rank)
            included_ranks.append(rank)
            if rank == 0:
                state["misranked"] = int(state["misranked"]) + 1

    results: list[dict[str, object]] = []
    for candidate_pool in config.candidate_pool_levels:
        state = accumulators[candidate_pool]
        retrieval_values = state["retrieval_ms"]
        ranking_values = state["ranking_ms"]
        ranks = state["ranks"]
        included_ranks = state["included_ranks"]
        excluded = int(state["excluded"])
        assert isinstance(retrieval_values, list)
        assert isinstance(ranking_values, list)
        assert isinstance(ranks, list)
        assert isinstance(included_ranks, list)
        results.append(
            {
                "candidate_pool": candidate_pool,
                "candidate_retrieval_recall": round((len(query_entries) - excluded) / len(query_entries), 6),
                "semantic_end_to_end_recall_at_1": recall_at(tuple(ranks), 1),
                "semantic_end_to_end_recall_at_3": recall_at(tuple(ranks), 3),
                "semantic_end_to_end_recall_at_5": recall_at(tuple(ranks), 5),
                "semantic_recall_at_5_when_included": recall_at(tuple(included_ranks), 5),
                "excluded_before_semantic_ranking_count": excluded,
                "included_but_not_top_five_count": int(state["misranked"]),
                "metadata_ordering_median_ms": _median(retrieval_values),
                "semantic_ranking_median_ms_when_included": _median(ranking_values)
                if ranking_values
                else None,
            }
        )
    return results


def _verify_benchmark_v2(encoder: MatrixEncoder) -> dict[str, object]:
    reports = generate_benchmark_v2()
    texts = tuple(dict.fromkeys(report_text(entry.report) for entry in reports))
    matrix = encoder.encode(texts, show_progress=False)
    vectors = {
        text: tuple(float(value) for value in matrix[index]) for index, text in enumerate(texts)
    }
    semantic = SemanticMatcher(PrecomputedEmbeddingProvider(vectors), cache_capacity=len(texts) + 1)
    baseline = evaluate_matcher(reports, rank_matches)
    semantic_result = evaluate_matcher(reports, semantic.rank)
    if baseline["overall"] != EXPECTED_BASELINE_METRICS:
        raise RuntimeError("Benchmark V2 baseline regression detected")
    if semantic_result["overall"] != EXPECTED_SEMANTIC_METRICS:
        raise RuntimeError("Benchmark V2 semantic regression detected")
    return {
        "status": "pass",
        "benchmark_version": BENCHMARK_VERSION,
        "baseline": {"matcher_version": BASELINE_VERSION, "overall": baseline["overall"]},
        "semantic": {"matcher_version": SEMANTIC_VERSION, "overall": semantic_result["overall"]},
    }


def _recommendation(
    scale_results: list[dict[str, object]], candidate_pool_results: list[dict[str, object]]
) -> tuple[str, str]:
    largest_cosine_ms = float(scale_results[-1]["cosine_search_median_ms_per_query"])
    pool_100 = next(result for result in candidate_pool_results if result["candidate_pool"] == 100)
    retrieval_recall = float(pool_100["candidate_retrieval_recall"])
    if largest_cosine_ms > 100:
        return (
            "C - VECTOR RETRIEVAL INFRASTRUCTURE IS JUSTIFIED",
            "The measured local brute-force cosine search exceeded the 100 ms decision threshold.",
        )
    if retrieval_recall < 0.95:
        return (
            "B - OPTIMIZE BOUNDED CANDIDATE RETRIEVAL",
            "Brute-force cosine search remained below the decision threshold, while the metadata-only "
            "100-candidate proxy excluded known matches in the synthetic corpus.",
        )
    return (
        "A - KEEP CURRENT BRUTE-FORCE APPROACH",
        "Brute-force cosine search remained below the decision threshold and the 100-candidate "
        "proxy retained at least 95% of known matches in the synthetic corpus.",
    )


def evaluate_scaling(
    config: EvaluationConfig,
    encoder: MatrixEncoder,
    *,
    progress: ProgressReporter = print,
    benchmark_verifier: BenchmarkVerifier = _verify_benchmark_v2,
) -> dict[str, object]:
    """Run all computation in memory; callers persist only the completed result."""

    run_id = str(uuid4())
    started_at = _utc_now()
    run_start = perf_counter_ns()
    stages: list[str] = []

    progress(f"[AI-3] Stage 1/7 - Generating {config.report_count:,}-report corpus")
    entries = generate_scaling_corpus(pair_count=config.report_count // 2)
    stages.append("corpus_generated")

    progress("[AI-3] Stage 2/7 - Loading embedding model")
    encoder.load()
    stages.append("model_loaded")

    progress("[AI-3] Stage 3/7 - Encoding corpus once")
    embedding_start = perf_counter_ns()
    matrix, unique_text_count = _encode_report_matrix(
        encoder, entries, show_progress=config.mode == "full"
    )
    embedding_ms = _milliseconds(embedding_start)
    progress(
        f"[AI-3] Encoded {unique_text_count:,} unique texts for {len(entries):,} reports "
        f"in {embedding_ms / 1000:.2f}s"
    )
    stages.append("corpus_encoded")

    progress("[AI-3] Stage 4/7 - Running precomputed scale retrieval benchmarks")
    scale_results = _scale_results(
        config,
        entries,
        matrix,
        select_query_entries(entries, config.scale_query_count),
        embedding_ms,
    )
    stages.append("scale_retrieval_completed")

    progress("[AI-3] Stage 5/7 - Running candidate-pool experiments")
    candidate_pool_results = _candidate_pool_results(
        config,
        entries,
        matrix,
        select_query_entries(entries, config.pool_query_count),
    )
    stages.append("candidate_pool_completed")

    progress("[AI-3] Stage 6/7 - Verifying frozen Benchmark V2")
    benchmark_v2 = benchmark_verifier(encoder)
    stages.append("benchmark_v2_verified")
    decision, rationale = _recommendation(scale_results, candidate_pool_results)

    completed_at = _utc_now()
    duration_ms = _milliseconds(run_start)
    stages.append("result_finalized")
    result: dict[str, object] = {
        "schema_version": ARTIFACT_SCHEMA_VERSION,
        "status": "complete",
        "mode": config.mode,
        "provenance": {
            "run_id": run_id,
            "started_at": started_at,
            "completed_at": completed_at,
            "duration_ms": round(duration_ms, 3),
            "evaluator_version": EVALUATOR_VERSION,
            "stages_completed": stages,
        },
        "configuration": {
            "batch_size": config.batch_size,
            "scale_levels": list(config.scale_levels),
            "candidate_pool_levels": list(config.candidate_pool_levels),
            "scale_query_count": config.scale_query_count,
            "candidate_pool_query_count": config.pool_query_count,
        },
        "corpus_version": SCALING_CORPUS_VERSION,
        "corpus_seed": SCALING_SEED,
        "corpus_size": len(entries),
        "controlled_pair_count": len(entries) // 2,
        "model": encoder.model_id,
        "embedding_dimension": encoder.dimension,
        "environment": {
            "device": get_settings().lost_found_embedding_device,
            "python_version": platform.python_version(),
            "vector_representation": "numpy float32 dense matrix",
        },
        "timing_methodology": {
            "clock": "time.perf_counter_ns",
            "corpus_embedding": "single measured batch operation",
            "smaller_embedding_times": "derived linear estimates from measured full corpus",
            "cosine_repetitions_per_query": COSINE_REPETITIONS,
            "warm_repetitions_per_query": WARM_REPETITIONS,
            "scope": "local CPU measurement; not a production load test",
        },
        "encoder_efficiency": {
            "model_encode_calls": encoder.encode_calls,
            "texts_encoded": encoder.encoded_texts,
            "unique_scaling_texts": unique_text_count,
        },
        "corpus_embedding": {
            "duration_ms": round(embedding_ms, 3),
            "timing_kind": "measured",
        },
        "full_vector_matrix_bytes": int(matrix.nbytes),
        "full_vector_matrix_mib": round(matrix.nbytes / (1024 * 1024), 3),
        "scale_results": scale_results,
        "candidate_pool_results": candidate_pool_results,
        "benchmark_v2_regression": benchmark_v2,
        "recommendation": {"decision": decision, "rationale": rationale},
        "privacy_boundary": {
            "synthetic_data_only": True,
            "external_inference_api": False,
            "database_access": False,
            "persistent_vector_store": False,
            "frontend_vector_exposure": False,
        },
    }
    validate_scaling_result(result)
    return result


def write_verified_artifact(target: Path, result: dict[str, object]) -> None:
    """Atomically replace the final artifact only with a validated complete result."""

    validate_scaling_result(result)
    provenance = result["provenance"]
    if not isinstance(provenance, dict) or not isinstance(provenance.get("run_id"), str):
        raise ValueError("verified result requires a run ID")
    temporary = target.with_name(f".{target.name}.{provenance['run_id']}.tmp")
    try:
        temporary.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def run_benchmark(
    config: EvaluationConfig,
    encoder: MatrixEncoder,
    *,
    target: Path | None,
    progress: ProgressReporter = print,
    benchmark_verifier: BenchmarkVerifier = _verify_benchmark_v2,
) -> dict[str, object]:
    result = evaluate_scaling(
        config, encoder, progress=progress, benchmark_verifier=benchmark_verifier
    )
    if config.mode == "full":
        if target is None:
            raise ValueError("full benchmark requires an artifact target")
        progress("[AI-3] Stage 7/7 - Writing verified artifact atomically")
        provenance = result["provenance"]
        if not isinstance(provenance, dict):
            raise ValueError("full benchmark result requires provenance")
        stages = provenance.get("stages_completed")
        if not isinstance(stages, list):
            raise ValueError("full benchmark result requires completed stages")
        stages.append("artifact_written")
        write_verified_artifact(target, result)
        progress("[AI-3] AI-3 SCALING BENCHMARK COMPLETE")
    else:
        progress("[AI-3] Stage 7/7 - Validating quick result without writing full artifact")
        progress("[AI-3] QUICK MODE COMPLETE - full artifact unchanged")
    return result


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the CampusConnect AI-3 scaling evaluator")
    parser.add_argument("--quick", action="store_true", help="run a small non-persistent pipeline check")
    parser.add_argument(
        "--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Sentence Transformers CPU batch size"
    )
    arguments = parser.parse_args()
    if arguments.batch_size < 1:
        parser.error("--batch-size must be positive")
    return arguments


if __name__ == "__main__":
    args = _arguments()
    settings = get_settings()
    selected_config = quick_config(args.batch_size) if args.quick else full_config(args.batch_size)
    selected_encoder = SentenceTransformerMatrixEncoder(
        settings.lost_found_embedding_device, selected_config.batch_size
    )
    artifact = None
    if selected_config.mode == "full":
        artifact = Path(__file__).parent / "results" / "scaling-v1.json"
    output = run_benchmark(
        selected_config,
        selected_encoder,
        target=artifact,
        progress=lambda message: print(message, flush=True),
    )
    if selected_config.mode == "quick":
        print(json.dumps(output, indent=2, sort_keys=True))
