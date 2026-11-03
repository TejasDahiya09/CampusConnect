# Evaluation

AI-1 evaluates `lf-baseline-v1` against the deterministic synthetic corpus documented in [../datasets/README.md](../datasets/README.md). For each of the 250 LOST reports, all 250 FOUND reports are candidates and the paired FOUND report is the sole relevant result. Results are reproducible with the fixed generator seed.

Run the evaluation from `ai-service/`:

```text
python -m evaluation.evaluate
```

The command prints JSON and writes `results/baseline-v1.json`. The output includes matcher version, dataset version, seed, report and candidate counts, weights, and these metrics:

- `precision_at_1`: fraction of queries with the relevant result ranked first.
- `precision_at_3`: mean fraction of the first three positions occupied by the one relevant result.
- `recall_at_3` and `recall_at_5`: fraction of queries where the relevant result appears in the first 3 or 5 results.
- `mrr`: mean reciprocal rank; non-retrieved relevant results contribute zero.

This is an offline synthetic evaluation, not a production quality claim. It cannot measure student vocabulary, image evidence, intentional false reports, multilingual input, real campus location ambiguity, or post-claim outcomes. Runtime telemetry and human review are required before any future production scoring change.

## AI-2 comparison benchmark

AI-2 keeps the AI-1 artifact unchanged and evaluates both matchers on Benchmark V2:

```text
python -m evaluation.evaluate_v2
```

The command generates 1,000 synthetic reports representing 500 latent pairs (150 EASY, 175 MODERATE, and 175 HARD), then evaluates every LOST report against the identical 500-item FOUND candidate pool. It writes `results/comparison-v2.json` and reports metrics separately for `lf-baseline-v1` and `lf-semantic-v1`:

- `precision_at_1` and `precision_at_3`
- `recall_at_3` and `recall_at_5`
- `mrr`
- per-difficulty metrics
- aggregate and HARD-case semantic-minus-baseline deltas
- bounded non-sensitive error samples

`precision_at_3` has one relevant result per query, so it is intentionally lower than recall at the same cutoff. This benchmark is **USEFUL BUT SYNTHETIC**. It measures ranking quality on deterministic templates only; it does not establish calibrated confidence, real-world recall, fairness, safety, or production readiness.

## AI-3 scaling measurement

Run the separate, model-backed local experiment from `ai-service/`:

```text
python -m evaluation.evaluate_scaling --quick
python -m evaluation.evaluate_scaling
```

Quick mode validates the whole evaluator with a smaller deterministic corpus. It emits progress and results to the console but never creates or overwrites the official artifact. Full mode creates `results/scaling-v1.json` from a deterministic 10,000-report synthetic corpus (`lost-found-scaling-v1`, seed `20261021`). A complete result is validated and written atomically; an interruption or failed stage leaves the prior artifact untouched. Neither mode alters production matcher behavior, Benchmark V2, application candidate limits, a database, or a persistent vector index.

The verified run recorded in `scaling-v1.json` has run ID `fb27210a-16b6-4873-a963-09d7a182f2a5` and completed on 2026-10-07. It loaded `sentence-transformers/all-MiniLM-L6-v2` once on CPU, encoded all 10,000 unique scaling texts in one matrix operation using batch size 64, and reused that matrix for every scale and candidate-pool experiment. A second encode call covered the 336 unique frozen Benchmark V2 texts used for the required regression gate. In total, the model received 10,336 texts across two encode calls. Results below are local measurements, not universal performance claims.

Only the 10,000-report embedding duration is measured. Values at 100, 500, 1,000, and 5,000 are linearly derived from that single measurement and are included only as transparent cost estimates. Cosine and warm retrieval timings use the already-computed vectors.

| Candidates | Embedding cost | Timing kind | Cosine median/query | Warm precomputed total/query | Vector matrix |
| ---------: | -------------: | :---------- | ------------------: | ---------------------------: | ------------: |
|        100 |     310.812 ms | Derived     |            0.021 ms |                     0.040 ms |     0.146 MiB |
|        500 |   1,554.058 ms | Derived     |            0.056 ms |                     0.168 ms |     0.732 MiB |
|      1,000 |   3,108.117 ms | Derived     |            0.122 ms |                     0.697 ms |     1.465 MiB |
|      5,000 |  15,540.585 ms | Derived     |            0.687 ms |                     3.892 ms |     7.324 MiB |
|     10,000 |  31,081.170 ms | Measured    |            1.322 ms |                     8.176 ms |    14.648 MiB |

For bounded candidate availability, AI-3 uses a deterministic metadata-only proxy before semantic ranking. It is intentionally an evaluation proxy, not the current Express retrieval implementation.

| Candidate pool | True-match availability | Semantic R@5 end-to-end | Metadata median/query | Semantic ranking median/query |
| -------------: | ----------------------: | ----------------------: | --------------------: | ----------------------------: |
|             50 |                  100.0% |                  99.22% |             49.836 ms |                      0.129 ms |
|            100 |                  100.0% |                  98.44% |             49.836 ms |                      0.073 ms |
|            250 |                  100.0% |                  98.44% |             49.836 ms |                      0.136 ms |
|            500 |                  100.0% |                  97.66% |             49.836 ms |                      0.235 ms |

The controlled full-scale stress pools deliberately retain the true match and expose growing near-duplicate ambiguity; that isolates semantic ranking from candidate exclusion. At 10,000 candidates, cosine search itself remained small, while the transformer embedding step was the dominant measured cost. The artifact therefore records decision **A — KEEP CURRENT BRUTE-FORCE APPROACH**. Reconsider vector retrieval only with production-like candidate counts, latency telemetry, and evidence that candidate exclusion—not ranking quality—is a real bottleneck.

## AI-4 multimodal evaluation

Run `python -m evaluation.evaluate_multimodal` from `ai-service/`. The evaluator uses the separate generated `lost-found-multimodal-v1` dataset, compares the unchanged `lf-semantic-v1` ranker with `lf-multimodal-v1`, verifies frozen Benchmark V2 metrics, and atomically writes `results/multimodal-v1.json` only after completion.

The completed controlled run contains 12 queries: ten visually discriminative cases and two missing-image fallback cases. Overall P@1 improved from 0.1667 to 1.0 and MRR from 0.4444 to 1.0; both systems had R@3/R@5 of 1.0. Multimodal ranking fixed ten semantic top-one failures, caused no top-one regression, and preserved both fallback cases. Because true pairs reuse deterministic generated fixture content, this demonstrates correct image influence and fallback—not real-campus accuracy or identity certainty.

The measured CPU run recorded approximately 5,699 ms for model load plus first single-image inference, 225 ms for a 10-image batch, 0.379 ms for a cached lookup, 0.510 ms for the controlled pairwise comparison, and 89.842 ms average end-to-end multimodal ranking per query. These are local measurements and not production latency guarantees.

## AI-5 Marketplace recommendation evaluation

Run `python -m evaluation.evaluate_recommendations` to compare `marketplace-hybrid-v1` against recent eligible listings at `K = 5`. The deterministic benchmark uses seed `20261024`, 24 synthetic user scenarios, and 30 synthetic Marketplace candidates across six categories. It covers single- and multi-interest users, bookmark-driven preference, profile-only and complete cold starts, sparse behavior, recency conflicts, own/ineligible exclusions, diversity, and conflicting profile/bookmark evidence.

The artifact reports Precision@5, Recall@5, Hit Rate@5, MRR, category diversity, cold-start and sparse-user slices, bounded error analysis, one cold model-backed request, and warm cached request timing. It is **USEFUL BUT SYNTHETIC**, and perfect MRR is not proof of real-world recommender accuracy. It contains no production or student activity and is not model training or a production quality claim. A complete artifact is written atomically to `results/marketplace-recommendations-v1.json`.

## AI-5B authenticated-view evaluation

Run `python -m evaluation.evaluate_recommendation_views` to compare identical eligible candidate pools under recent-only ordering, AI-5 without views, and AI-5B with weak decayed views. Seed `20261025` creates 30 synthetic users and 30 candidates per user. Slices cover recent and old views, deduplicated repeated views, multiple categories, bookmark plus view, profile plus view, conflicting bookmark/view preference, sparse behavior, and no-view cold starts.

The evaluator uses the real local MiniLM provider and reports Precision@5, Recall@5, Hit Rate@5, MRR, category diversity, slice results, no-view regressions, and cold/warm local timing. It writes only `results/marketplace-recommendations-views-v1.json`; the AI-5 artifact remains unchanged.

## AI-4B realistic validation

`python -m evaluation.evaluate_multimodal_realistic --quick` validates the benchmark, resource, cache, concurrency, and regression paths without writing the full artifact. Full mode evaluates 120 cases and atomically writes `results/multimodal-realistic-v1.json` after Benchmark V2 passes.

The verified CPU run completed all 120 cases and concurrency levels. Both semantic and multimodal ranking recorded P@1 1.0, R@3 1.0, R@5 1.0, and MRR 1.0. Multimodal fixed no semantic top-one failures and introduced none; therefore the benchmark did not establish incremental benefit. It also recorded at least 20 sampled wrong same-category candidates with visual similarity at or above 0.80. The decision is **D — KEEP SEMANTIC-ONLY FOR NOW**.

Combined model RSS increased from approximately 137 MiB before load to 488 MiB after MiniLM and 1,133 MiB after OpenCLIP, with observed process peak RSS around 1,695 MiB. Warm cached latency ranged from approximately 3.7 ms median at concurrency 1 to 18.8 ms at concurrency 10, with no failures or timeouts. These are local readiness observations, not a production load test.
