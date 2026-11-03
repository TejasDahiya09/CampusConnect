import json
from datetime import datetime
from pathlib import Path
import numpy as np
import pytest

from app.matching.embeddings import EMBEDDING_DIMENSION
from evaluation.evaluate_scaling import (
    MatrixEncoder,
    EvaluationConfig,
    full_config,
    quick_config,
    run_benchmark,
    write_verified_artifact,
)
from evaluation.scaling import (
    CANDIDATE_POOL_LEVELS,
    SCALE_LEVELS,
    SCALING_REPORT_COUNT,
    SCALING_SEED,
    controlled_candidate_indices,
    generate_scaling_corpus,
    metadata_candidate_indices,
    rank_of_target,
    recall_at,
    select_query_entries,
    top_k_indices,
    validate_scaling_result,
)


class FakeMatrixEncoder(MatrixEncoder):
    def __init__(self, *, fail: bool = False) -> None:
        self._calls = 0
        self._texts = 0
        self.load_calls = 0
        self.fail = fail

    @property
    def encode_calls(self) -> int:
        return self._calls

    @property
    def encoded_texts(self) -> int:
        return self._texts

    def load(self) -> None:
        self.load_calls += 1

    def encode(self, texts: tuple[str, ...], *, show_progress: bool) -> np.ndarray:
        del show_progress
        if self.fail:
            raise RuntimeError("controlled fake encoder failure")
        self._calls += 1
        self._texts += len(texts)
        matrix = np.zeros((len(texts), EMBEDDING_DIMENSION), dtype=np.float32)
        for index in range(len(texts)):
            matrix[index, index % EMBEDDING_DIMENSION] = 1.0
        return matrix


def benchmark_pass(_encoder: MatrixEncoder) -> dict[str, object]:
    return {"status": "pass", "benchmark_version": "lost-found-benchmark-v2"}


def test_scaling_corpus_is_deterministic_and_contains_controlled_pairs() -> None:
    entries = generate_scaling_corpus()

    assert entries == generate_scaling_corpus(SCALING_SEED)
    assert len(entries) == SCALING_REPORT_COUNT
    assert sum(entry.report.type == "LOST" for entry in entries) == 5_000
    assert sum(entry.report.type == "FOUND" for entry in entries) == 5_000
    identifiers = {entry.report.id for entry in entries}
    assert all(entry.paired_report_id in identifiers for entry in entries)
    assert all(not hasattr(entry.report, "paired_report_id") for entry in entries)


def test_full_mode_preserves_locked_sizes_and_quick_mode_is_small() -> None:
    full = full_config()
    quick = quick_config()

    assert full.report_count == 10_000
    assert full.scale_levels == SCALE_LEVELS
    assert full.candidate_pool_levels == CANDIDATE_POOL_LEVELS
    assert full.batch_size == 64
    assert quick.report_count < full.report_count
    assert max(quick.scale_levels) == quick.report_count


def test_controlled_scale_slices_are_stable_and_include_the_true_match() -> None:
    entries = generate_scaling_corpus(pair_count=100)
    query = select_query_entries(entries, 1)[0]

    for size in (20, 50, 100, 150, 200):
        indices = controlled_candidate_indices(entries, query, size, SCALING_SEED)
        assert indices == controlled_candidate_indices(entries, query, size, SCALING_SEED)
        assert len(indices) == size
        assert entries[indices[0]].report.id == query.paired_report_id


def test_metadata_candidate_pool_is_bounded_without_using_ground_truth() -> None:
    entries = generate_scaling_corpus(pair_count=100)
    query = select_query_entries(entries, 1)[0]
    found = tuple(entry for entry in entries if entry.report.type == "FOUND")

    selected = metadata_candidate_indices(query, found, 100)

    assert len(selected) == 100
    assert all(0 <= index < len(found) for index in selected)
    assert any(found[index].report.id == query.paired_report_id for index in selected)


def test_precomputed_cosine_retrieval_and_recall_are_correct() -> None:
    matrix = np.asarray(((1.0, 0.0), (0.8, 0.2), (0.0, 1.0)), dtype=np.float32)
    query = np.asarray((1.0, 0.0), dtype=np.float32)

    assert top_k_indices(query, matrix, 3) == (0, 1, 2)
    assert rank_of_target(query, matrix, 1, top_k=3) == 2
    assert recall_at((1, 0, 3, 5), 3) == 0.5


def test_quick_pipeline_batches_once_reuses_matrix_and_reports_progress() -> None:
    encoder = FakeMatrixEncoder()
    progress: list[str] = []

    result = run_benchmark(
        quick_config(),
        encoder,
        target=None,
        progress=progress.append,
        benchmark_verifier=benchmark_pass,
    )

    assert encoder.load_calls == 1
    assert encoder.encode_calls == 1
    assert encoder.encoded_texts == result["encoder_efficiency"]["unique_scaling_texts"]
    assert result["status"] == "complete"
    assert result["mode"] == "quick"
    assert [entry["candidate_count"] for entry in result["scale_results"]] == list(
        quick_config().scale_levels
    )
    assert [entry["candidate_pool"] for entry in result["candidate_pool_results"]] == list(
        quick_config().candidate_pool_levels
    )
    assert all(entry["embedding_timing_kind"] == "derived_estimate" for entry in result["scale_results"][:-1])
    assert result["scale_results"][-1]["embedding_timing_kind"] == "measured"
    assert [message.split(" - ")[0] for message in progress if "Stage" in message] == [
        f"[AI-3] Stage {index}/7" for index in range(1, 8)
    ]
    assert progress[-1] == "[AI-3] QUICK MODE COMPLETE - full artifact unchanged"


def test_provenance_has_unique_run_ids_timestamps_and_completed_stages() -> None:
    first = run_benchmark(
        quick_config(), FakeMatrixEncoder(), target=None, progress=lambda _message: None, benchmark_verifier=benchmark_pass
    )
    second = run_benchmark(
        quick_config(), FakeMatrixEncoder(), target=None, progress=lambda _message: None, benchmark_verifier=benchmark_pass
    )
    first_provenance = first["provenance"]
    second_provenance = second["provenance"]
    assert isinstance(first_provenance, dict) and isinstance(second_provenance, dict)
    assert first_provenance["run_id"] != second_provenance["run_id"]
    datetime.fromisoformat(str(first_provenance["started_at"]).replace("Z", "+00:00"))
    datetime.fromisoformat(str(first_provenance["completed_at"]).replace("Z", "+00:00"))
    assert first_provenance["stages_completed"] == [
        "corpus_generated",
        "model_loaded",
        "corpus_encoded",
        "scale_retrieval_completed",
        "candidate_pool_completed",
        "benchmark_v2_verified",
        "result_finalized",
    ]


def test_quick_mode_never_overwrites_verified_full_artifact(tmp_path: Path) -> None:
    target = tmp_path / "scaling-v1.json"
    target.write_text("verified-full-artifact", encoding="utf-8")

    run_benchmark(
        quick_config(),
        FakeMatrixEncoder(),
        target=target,
        progress=lambda _message: None,
        benchmark_verifier=benchmark_pass,
    )

    assert target.read_text(encoding="utf-8") == "verified-full-artifact"


def test_incomplete_result_cannot_replace_verified_artifact(tmp_path: Path) -> None:
    target = tmp_path / "scaling-v1.json"
    target.write_text("verified-full-artifact", encoding="utf-8")

    with pytest.raises(ValueError):
        write_verified_artifact(target, {"status": "incomplete"})

    assert target.read_text(encoding="utf-8") == "verified-full-artifact"
    assert list(tmp_path.glob("*.tmp")) == []


def test_encoder_failure_cannot_replace_verified_full_artifact(tmp_path: Path) -> None:
    target = tmp_path / "scaling-v1.json"
    target.write_text("verified-full-artifact", encoding="utf-8")

    with pytest.raises(RuntimeError, match="controlled fake encoder failure"):
        run_benchmark(
            full_config(),
            FakeMatrixEncoder(fail=True),
            target=target,
            progress=lambda _message: None,
            benchmark_verifier=benchmark_pass,
        )

    assert target.read_text(encoding="utf-8") == "verified-full-artifact"


def test_atomic_writer_persists_only_a_valid_complete_result(tmp_path: Path) -> None:
    result = run_benchmark(
        quick_config(), FakeMatrixEncoder(), target=None, progress=lambda _message: None, benchmark_verifier=benchmark_pass
    )
    target = tmp_path / "verified.json"

    write_verified_artifact(target, result)

    persisted = json.loads(target.read_text(encoding="utf-8"))
    validate_scaling_result(persisted)
    assert persisted["status"] == "complete"
    assert list(tmp_path.glob("*.tmp")) == []
