# Datasets

This directory is reserved for AI development and evaluation datasets. Do not copy production student, profile, Marketplace, Lost & Found, or authentication data into the repository.

## AI-1 synthetic Lost & Found evaluation data

`app/matching/synthetic.py` deterministically generates the AI-1 evaluation corpus; no report data is stored in this repository. Dataset version `lost-found-synthetic-v1` uses fixed seed `20261006` and creates exactly 250 latent item pairs, yielding 500 reports: 250 LOST and 250 FOUND. Each pair is linked only by an evaluation-only ground-truth identifier that is never sent to the matching endpoint.

The generator varies title/description wording, categories, campus locations, and incident dates. It deliberately produces related non-match candidates through repeated categories, location overlap, and similar item descriptions. This gives the lexical baseline harder ranking choices without representing actual students or incidents.

The corpus is an offline evaluation fixture, not training data. It is generated entirely from templates and contains no personal information, credentials, student data, production exports, or external API calls.

## AI-2 Benchmark V2

`app/matching/benchmark_v2.py` deterministically generates `lost-found-benchmark-v2` with seed `20261020`. It has exactly 500 latent LOST/FOUND pairs (1,000 reports total): 150 EASY, 175 MODERATE, and 175 HARD pairs. Every LOST report is evaluated against the same 500 FOUND-report candidate pool.

EASY pairs retain distinctive lexical overlap. MODERATE pairs use partially different wording. HARD pairs use alternative item terms and generic phrasing while retaining metadata context; repeated categories and locations create semantic hard negatives. The hidden ground-truth identifier exists only in the evaluation wrapper and is never included in the `MatchReport` payload passed to a matcher.

Benchmark V2 is an offline synthetic evaluation fixture, not model training data and not a production-performance claim. It contains no real student, account, report, image, credential, or external-service data.

## AI-3 scaling corpus

`evaluation/scaling.py` deterministically generates the separate `lost-found-scaling-v1` corpus using seed `20261021`. Full mode creates exactly 10,000 synthetic reports: 5,000 LOST reports and 5,000 paired FOUND reports. Quick mode uses a deterministic smaller prefix of the same generator to validate the evaluator without writing the official artifact. Each report has an evaluation-only `paired_report_id` held by the wrapper; the `MatchReport` supplied to embedding and ranking helpers has no ground-truth field.

The corpus reuses generic item, category, location, date, mark, and wording patterns. It deliberately produces repeated/near-duplicate descriptions so that the experiment can separately observe dense-vector scaling and ranking ambiguity. It is not Benchmark V2, does not modify Benchmark V2, is not training data, and contains no student or production data.

## AI-4 multimodal dataset

`evaluation/multimodal_dataset.py` generates `lost-found-multimodal-v1` with seed `20261022`. It contains 12 controlled queries across backpacks, bottles, earbuds, calculators, books, keys, wallets, chargers, umbrellas, and glasses. Ten visually discriminative cases use locally rendered geometric PNG fixtures and same-category hard negatives; two cases omit images to verify exact semantic fallback. True-pair fixture bytes are deliberately reproducible so the benchmark validates multimodal wiring and ranking behavior. This makes the dataset legally self-generated and private-data-free, but easier than uncontrolled campus photography; its metrics must not be generalized to production accuracy.

## AI-5 Marketplace recommendation benchmark

`evaluation/evaluate_recommendations.py` creates the in-memory `marketplace-recommendations-v1` benchmark with fixed seed `20261024`. It defines 24 synthetic user contexts and 30 synthetic active listing candidates across books, electronics, calculators, cycles, gaming, and music. Relevance labels are evaluation-only and never enter the recommendation request.

The scenarios include strong single-category and multiple-interest preferences, bookmarks, profile-only cold starts, completely new users, sparse histories, recency conflicts, own listings, ineligible listings, diversity pressure, and profile/behavior conflicts. All identities, interests, listings, and interactions are synthetic templates. No production data, private student activity, external behavioral dataset, or sensitive-trait inference is used.

## AI-5B authenticated-view benchmark

`evaluation/evaluate_recommendation_views.py` creates a deterministic in-memory benchmark with seed `20261025`, 30 synthetic user scenarios, and 30 eligible candidates per user. It models already-deduplicated recent/old views, repeated opens, multi-category viewing, bookmarks plus views, profile interests plus views, conflicting signals, sparse users, and users with no views. Evaluation labels and synthetic histories never enter production storage and contain no student data.

## AI-4B realistic benchmark

`evaluation/multimodal_realistic_dataset.py` generates `lost-found-multimodal-realistic-v1` with seed `20261023`. The full benchmark contains 120 cases, balanced across ten categories and EASY/MODERATE/HARD difficulty. Every query ranks five same-category candidates, including four wrong hard negatives. Six interaction patterns cover ambiguous text, ambiguous images, mutually supportive evidence, conflicting evidence, and near duplicates; 36 cases intentionally lack bilateral image evidence.

All source objects and variants are generated locally. Deterministic transformations cover crop, resize, rotation, affine angle, brightness, contrast, blur, noise, partial occlusion, background clutter, and scale. No network images, student images, or production data are included. These transformations are more demanding than AI-4 fixtures but remain synthetic and cannot substitute for a legally sourced real-photo benchmark.
