"""AI-4B realistic quality, resource, cache, and concurrency evaluation."""

import argparse
import json
import math
import os
import statistics
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from ctypes import POINTER, Structure, byref, c_bool, c_size_t, c_ulong, c_void_p, sizeof, windll
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.core.config import get_settings
from app.matching.baseline import category_score, location_score, report_text, time_score
from app.matching.embeddings import SentenceTransformerEmbeddingProvider
from app.matching.images import MODEL_ID, PRETRAINED_CHECKPOINT, OpenClipImageEmbeddingProvider, best_image_similarity, decode_image
from app.matching.multimodal import MULTIMODAL_WEIGHTS, SEMANTIC_WEIGHTS, MultimodalMatcher
from evaluation.evaluate_v2 import _metrics, comparison
from evaluation.multimodal_realistic_dataset import BENCHMARK_SEED, BENCHMARK_VERSION, CASE_COUNT, generate_realistic_benchmark

TARGET = Path(__file__).parent / "results" / "multimodal-realistic-v1.json"


class _MemoryCounters(Structure):
    _fields_ = [("cb", c_ulong), ("PageFaultCount", c_ulong), ("PeakWorkingSetSize", c_size_t), ("WorkingSetSize", c_size_t), ("QuotaPeakPagedPoolUsage", c_size_t), ("QuotaPagedPoolUsage", c_size_t), ("QuotaPeakNonPagedPoolUsage", c_size_t), ("QuotaNonPagedPoolUsage", c_size_t), ("PagefileUsage", c_size_t), ("PeakPagefileUsage", c_size_t)]


def process_memory_mib() -> tuple[float, float]:
    counters = _MemoryCounters()
    counters.cb = sizeof(counters)
    get_process = windll.kernel32.GetCurrentProcess
    get_process.restype = c_void_p
    get_memory = windll.psapi.GetProcessMemoryInfo
    get_memory.argtypes = (c_void_p, POINTER(_MemoryCounters), c_ulong)
    get_memory.restype = c_bool
    if not get_memory(get_process(), byref(counters), counters.cb):
        raise OSError("process memory measurement failed")
    return counters.WorkingSetSize / 1048576, counters.PeakWorkingSetSize / 1048576


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, math.ceil(len(ordered) * fraction) - 1)]


def _evaluate(cases, text_provider, image_provider):
    reports = [report for case in cases for report in (case.query, *case.candidates)]
    texts = tuple(dict.fromkeys(report_text(report) for report in reports))
    text_vectors = dict(zip(texts, text_provider.encode(texts), strict=True))
    evidence = tuple(dict.fromkeys(image.content_base64 for report in reports for image in report.images))
    decoded_by_key = {}
    for report in reports:
        for image in report.images:
            if image.content_base64 not in decoded_by_key:
                try:
                    decoded_by_key[image.content_base64] = decode_image(image)[1]
                except ValueError:
                    pass
    image_vectors = {}
    keys = tuple(decoded_by_key)
    for start in range(0, len(keys), 32):
        batch_keys = keys[start:start + 32]
        vectors = image_provider.encode(tuple(decoded_by_key[key] for key in batch_keys))
        image_vectors.update(zip(batch_keys, vectors, strict=True))
        print(f"[AI-4B] Encoded images {min(start + 32, len(keys))}/{len(keys)}", flush=True)
    ranks = {"semantic": [], "multimodal": []}
    slices: dict[str, dict[str, list[int]]] = {"semantic": {}, "multimodal": {}}
    regressions = {"fixed": 0, "introduced": 0, "both_succeeded": 0, "both_failed": 0}
    false_confidence = []
    for case in cases:
        query_text = text_vectors[report_text(case.query)]
        query_images = tuple(image_vectors[image.content_base64] for image in case.query.images if image.content_base64 in image_vectors)
        scored = {"semantic": [], "multimodal": []}
        for candidate in case.candidates:
            signals = {"text": max(0.0, min(1.0, sum(a*b for a,b in zip(query_text, text_vectors[report_text(candidate)], strict=True)))), "category": category_score(case.query, candidate), "location": location_score(case.query, candidate), "time": time_score(case.query, candidate)}
            semantic_score = sum(SEMANTIC_WEIGHTS[name] * signals[name] for name in SEMANTIC_WEIGHTS)
            candidate_images = tuple(image_vectors[image.content_base64] for image in candidate.images if image.content_base64 in image_vectors)
            image_score = best_image_similarity(query_images, candidate_images)
            multimodal_score = semantic_score if image_score is None else sum(MULTIMODAL_WEIGHTS[name] * (image_score if name == "image" else signals[name]) for name in MULTIMODAL_WEIGHTS)
            scored["semantic"].append((semantic_score, candidate.id))
            scored["multimodal"].append((multimodal_score, candidate.id))
            if candidate.id in case.hard_negative_ids and image_score is not None and image_score >= 0.80 and len(false_confidence) < 20:
                false_confidence.append({"query_id": case.query.id, "wrong_candidate_id": candidate.id, "visual_similarity": image_score, "difficulty": case.difficulty, "interaction": case.interaction})
        case_ranks = {}
        for mode in ("semantic", "multimodal"):
            ordered = sorted(scored[mode], key=lambda item: (-item[0], item[1]))
            rank = next(index + 1 for index, (_, identifier) in enumerate(ordered) if identifier == case.true_id)
            ranks[mode].append(rank)
            case_ranks[mode] = rank
            labels = (case.difficulty, case.category, case.interaction, "both_images_present" if case.has_bilateral_images else "missing_image_fallback", "same_category_hard_negative")
            for label in labels:
                slices[mode].setdefault(label, []).append(rank)
        semantic_ok, multimodal_ok = case_ranks["semantic"] == 1, case_ranks["multimodal"] == 1
        if not semantic_ok and multimodal_ok: regressions["fixed"] += 1
        elif semantic_ok and not multimodal_ok: regressions["introduced"] += 1
        elif semantic_ok: regressions["both_succeeded"] += 1
        else: regressions["both_failed"] += 1
    return {mode: _metrics(values) for mode, values in ranks.items()}, {mode: {label: {"count": len(values), **_metrics(values)} for label, values in groups.items()} for mode, groups in slices.items()}, regressions, false_confidence, len(evidence)


def _concurrency(matcher, case, levels):
    results = []
    matcher.rank(case.query, list(case.candidates), 5)
    for level in levels:
        print(f"[AI-4B] Concurrency {level}", flush=True)
        latencies, failures = [], 0
        started = time.perf_counter()
        def invoke():
            before = time.perf_counter(); matcher.rank(case.query, list(case.candidates), 5); return (time.perf_counter()-before)*1000
        with ThreadPoolExecutor(max_workers=level) as executor:
            futures = [executor.submit(invoke) for _ in range(level * 2)]
            for future in as_completed(futures):
                try: latencies.append(future.result())
                except Exception: failures += 1
        duration = time.perf_counter() - started
        rss, peak = process_memory_mib()
        results.append({"concurrency": level, "total": level*2, "success": len(latencies), "failure": failures, "timeout": 0, "median_ms": statistics.median(latencies) if latencies else None, "p95_ms": percentile(latencies, .95) if latencies else None, "throughput_requests_per_second": len(latencies)/duration, "rss_mib": rss, "peak_rss_mib": peak})
        if failures or rss > 4096:
            break
    return results


def run(quick: bool = False) -> dict[str, object]:
    started = datetime.now(UTC); run_id = str(uuid4()); stages = []
    count = 12 if quick else CASE_COUNT
    print(f"[AI-4B] Stage 1/9 - Preparing {count}-case benchmark", flush=True)
    cases = generate_realistic_benchmark(count); stages.append("benchmark_prepared")
    settings = get_settings(); baseline_rss, _ = process_memory_mib()
    print("[AI-4B] Stage 2/9 - Loading MiniLM", flush=True)
    text_provider = SentenceTransformerEmbeddingProvider(settings.lost_found_embedding_device)
    before=time.perf_counter(); text_provider.encode(("warmup",)); minilm_load_ms=(time.perf_counter()-before)*1000; minilm_rss,_=process_memory_mib(); stages.append("minilm_loaded")
    print("[AI-4B] Stage 3/9 - Loading OpenCLIP", flush=True)
    image_provider = OpenClipImageEmbeddingProvider(settings.lost_found_image_device)
    sample=decode_image(next(image for case in cases for image in case.query.images))[1]
    before=time.perf_counter(); image_provider.encode((sample,)); openclip_load_ms=(time.perf_counter()-before)*1000; both_rss,_=process_memory_mib(); stages.append("openclip_loaded")
    print("[AI-4B] Stage 4/9 - Encoding benchmark and evaluating quality", flush=True)
    cpu_before=time.process_time(); wall_before=time.perf_counter(); metrics,slices,regressions,false_confidence,unique_images=_evaluate(cases,text_provider,image_provider); quality_wall=time.perf_counter()-wall_before; cpu_percent=(time.process_time()-cpu_before)/quality_wall*100; stages.append("quality_evaluated")
    print("[AI-4B] Stage 5/9 - Measuring cold and warm cache", flush=True)
    matcher=MultimodalMatcher(text_provider,image_provider,512,256); representative=next(case for case in cases if case.has_bilateral_images)
    before=time.perf_counter(); matcher.rank(representative.query,list(representative.candidates),5); cold_ms=(time.perf_counter()-before)*1000
    before=time.perf_counter(); matcher.rank(representative.query,list(representative.candidates),5); warm_ms=(time.perf_counter()-before)*1000; stages.append("cache_measured")
    print("[AI-4B] Stage 6/9 - Progressive concurrency", flush=True)
    concurrency=_concurrency(matcher,representative,(1,2) if quick else (1,2,5,10)); stages.append("concurrency_measured")
    print("[AI-4B] Stage 7/9 - Benchmark V2 regression", flush=True)
    frozen=comparison(); expected={"precision_at_1":.362,"precision_at_3":.176,"recall_at_3":.528,"recall_at_5":.67,"mrr":.46436666666666665}; actual=frozen["semantic"]["overall"]
    if not all(abs(actual[key]-value)<=1e-12 for key,value in expected.items()): raise RuntimeError("Benchmark V2 regression failed")
    stages.append("benchmark_v2_verified")
    print("[AI-4B] Stage 8/9 - Finalizing readiness", flush=True)
    multi, semantic=metrics["multimodal"],metrics["semantic"]
    if multi["precision_at_1"] <= semantic["precision_at_1"]: decision="D - KEEP SEMANTIC-ONLY FOR NOW"
    elif regressions["introduced"] > max(3,count*.05): decision="B - MULTIMODAL QUALITY NEEDS MORE TUNING"
    elif any(row["failure"] for row in concurrency) or both_rss > 2048: decision="C - DEPLOYMENT RESOURCES NEED OPTIMIZATION"
    else: decision="A - READY FOR CONTROLLED ACTIVATION REVIEW"
    stages.append("readiness_decided"); completed=datetime.now(UTC)
    difficulty_distribution={name:sum(case.difficulty==name for case in cases) for name in ("EASY","MODERATE","HARD")}; category_distribution={name:sum(case.category==name for case in cases) for name in sorted({case.category for case in cases})}
    result={"status":"complete","mode":"quick" if quick else "full","schema_version":"ai-4b-realistic-result-v1","provenance":{"run_id":run_id,"started_at":started.isoformat().replace("+00:00","Z"),"completed_at":completed.isoformat().replace("+00:00","Z"),"duration_ms":(completed-started).total_seconds()*1000,"stages_completed":[*stages,"artifact_written"] if not quick else stages},"benchmark":{"version":BENCHMARK_VERSION,"seed":BENCHMARK_SEED,"case_count":count,"provenance":"Self-generated geometric object identities with deterministic phone-photo-like transformations; no student or production data.","difficulty_distribution":difficulty_distribution,"category_distribution":category_distribution,"transformation_configuration":["crop","resize","rotation","angle_affine","brightness","contrast","blur","noise","partial_occlusion","background_clutter","scale"],"unique_image_payloads":unique_images},"model":{"text":"sentence-transformers/all-MiniLM-L6-v2","image":MODEL_ID,"checkpoint":PRETRAINED_CHECKPOINT,"device":"cpu"},"weights":{"multimodal":MULTIMODAL_WEIGHTS,"fallback":SEMANTIC_WEIGHTS},"overall_metrics":{"lf-semantic-v1":semantic,"lf-multimodal-v1":multi},"slice_metrics":slices,"regression_counts":regressions,"false_confidence":{"threshold":.80,"count":len(false_confidence),"examples":false_confidence},"resources":{"baseline_rss_mib":baseline_rss,"minilm_loaded_rss_mib":minilm_rss,"openclip_and_minilm_rss_mib":both_rss,"minilm_incremental_mib":minilm_rss-baseline_rss,"openclip_incremental_mib":both_rss-minilm_rss,"minilm_load_ms":minilm_load_ms,"openclip_load_ms":openclip_load_ms,"quality_cpu_time_over_wall_percent":cpu_percent,"quality_evaluation_ms":quality_wall*1000},"cache":{"capacity":256,"cold_request_ms":cold_ms,"warm_request_ms":warm_ms},"concurrency":concurrency,"benchmark_v2_regression":{"status":"pass"},"s3_readiness":{"status":"CODE READY / LIVE IAM UNVERIFIED","required_permission":"s3:GetObject","resource":"configured private bucket Lost & Found media object prefix"},"readiness_decision":decision}
    print("[AI-4B] Stage 9/9 - Writing verified artifact" if not quick else "[AI-4B] Stage 9/9 - Quick validation complete; artifact unchanged", flush=True)
    if not quick:
        temporary=TARGET.with_name(f".{TARGET.name}.{run_id}.tmp"); temporary.write_text(json.dumps(result,indent=2,sort_keys=True)+"\n",encoding="utf-8"); os.replace(temporary,TARGET)
        print("AI-4B REALISTIC EVALUATION COMPLETE",flush=True)
    return result


if __name__ == "__main__":
    parser=argparse.ArgumentParser(); parser.add_argument("--quick",action="store_true"); arguments=parser.parse_args(); run(arguments.quick)
