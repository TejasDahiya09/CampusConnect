# CampusConnect AI Service

This is an independently deployable FastAPI service for CampusConnect AI capabilities. It has no database connection, Supabase access, AWS access, or vector store. Existing matching and recommendation inference remains local. RAG-0 adds a disabled-by-default Vertex AI Gemini provider foundation for a future Campus Assistant; it does not add retrieval, a student-facing endpoint, or a functional assistant.

## Boundary

```text
React frontend -> Express backend -> FastAPI AI service
```

The browser never calls this service directly. Express remains responsible for authorization and for deciding which minimized, permitted data may be supplied to a future AI capability. The service can be stopped or removed without affecting authentication, Profile, Marketplace, Lost & Found CRUD, claims, bookmarks, statuses, or search.

## Local development

```text
python -m venv .venv
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements-dev.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

From the repository root, `npm run dev:all` starts the frontend, backend, and
AI service together. It calls the virtual-environment Python executable
directly, so PowerShell activation is not required.

Copy `.env.example` to `.env` and configure a dedicated `AI_SERVICE_API_KEY` matching the Express backend. Inference routes reject requests without that internal credential. Deploy the service behind private/restricted ingress as an additional control. Never reuse or forward a student JWT. `AI_INFERENCE_CONCURRENCY` bounds model work per process, and `AI_MAX_REQUEST_BYTES` provides an application request-size boundary.

The AI service always loads `ai-service/.env` relative to its own source directory,
including when started from the repository root with `--app-dir ai-service`.
Process environment variables take precedence. Set the same `AI_SERVICE_API_KEY`
in `backend/.env` and `ai-service/.env`; Express sends it using
`X-CampusConnect-AI-Key` (not a Bearer token). Restart both services after changing
credentials because their configuration is loaded and cached at startup. Wait for
`GET /ready` to return 200 before testing inference; `/health` alone does not prove
that the credential and embedding model are ready. No credential values are
returned by these operational endpoints.

Production ingress should independently enforce the same request-body limit because application `Content-Length` checks cannot police every proxy/chunked-transfer configuration. The 1.5 MB semantic default accommodates the bounded 100-candidate text contract. Experimental multimodal runs require an explicitly larger controlled limit and the optional dependency set.

## Operational endpoints

- `GET /health` returns process health and service metadata.
- `GET /ready` returns `200` only after the pinned MiniLM model is initialized and the internal credential is configured.
- `GET /version` returns safe version, model-revision, and capability metadata.
- `POST /api/v1/lost-found/match` ranks an Express-authorized, data-minimized set of Lost & Found candidates. It accepts a maximum of 100 candidates and returns at most 20 results.

## AI-1 Lost & Found baseline

`lf-baseline-v1` is a deterministic, explainable baseline. It uses transient TF-IDF lexical similarity and cosine similarity for the supplied request only; it does not persist vectors or use semantic embeddings. The final score is clamped to `[0, 1]` and is the weighted sum below:

The score is a ranking score, **not** a calibrated probability that two reports describe the same item.

| Signal   | Weight | Rule                                                                   |
| -------- | -----: | ---------------------------------------------------------------------- |
| Text     |   0.55 | TF-IDF cosine similarity over normalized title and description         |
| Category |   0.20 | Exact normalized category match; `Other` does not create a match bonus |
| Location |   0.15 | Jaccard overlap of normalized location tokens                          |
| Time     |   0.10 | `exp(-absolute_days / 14)` when both incident dates are present        |

The service only compares opposite report types, rejects duplicate candidate IDs, uses stable `score DESC, report_id ASC` ordering, and reports the evidence that actually contributed to each result. Confidence thresholds are high `>= 0.70`, medium `>= 0.40`, and low otherwise; these are ranking-confidence bands, not calibrated probabilities. Missing category, location, date, or text contributes a zero signal rather than causing a failure.

The initial weights, time-decay window, and confidence thresholds are centralized environment settings. They must retain a total weight of `1.0`; invalid weights or unordered thresholds fail service configuration clearly.

Express remains the authority for authentication, report visibility, candidate hydration, and API response delivery. The browser never calls this service directly.

## AI-2 semantic matcher

`lf-semantic-v1` uses the local `sentence-transformers/all-MiniLM-L6-v2` model with 384-dimensional embeddings. It preserves the AI-1 category, location, time, weights, confidence bands, score clamping, candidate rules, and stable ordering; only the text-similarity signal changes from lexical TF-IDF cosine similarity to semantic cosine similarity. It is the default matcher (`AI_LOST_FOUND_MATCHER=semantic`). Candidates below `AI_LOST_FOUND_MIN_SEMANTIC_SIMILARITY` (default `0.50`) are excluded before metadata contributes to ranking, preventing location and date alone from presenting unrelated item types as matches.

The pinned model revision is `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`. One application-scoped provider and bounded LRU cache are shared by semantic matching and Marketplace recommendations. Startup preloads MiniLM before readiness becomes true, while a small process-local semaphore bounds concurrent model inference. Cache keys are SHA-256 hashes of model identifier and normalized report text. The cache is per-process and never persisted or exposed.

If model initialization or embedding fails, the service logs the detailed server-side cause and automatically ranks the same request with `lf-baseline-v1`. The returned `matcher_version` truthfully identifies that fallback. No request data is sent to an external AI API.

The model is distributed through the Sentence Transformers/Hugging Face ecosystem. Its model card declares the Apache-2.0 license; retain that attribution and review the upstream card before redistributing or updating the model.

## Tests

```text
pytest
```

Tests are independent of PostgreSQL, Supabase, AWS, the frontend, and Express.

`requirements.txt` contains pinned semantic production dependencies. `requirements-dev.txt` adds tests. Dormant OpenCLIP dependencies are isolated in `requirements-multimodal.txt` and are not required by a semantic-only production deployment.

## RAG-0 Vertex AI Gemini provider foundation

RAG-0 establishes Vertex AI configuration, a lazy asynchronous `google-genai` adapter, strict grounded-generation contracts, and a provider-neutral safety policy. The selected model is `gemini-2.5-flash`. The foundation is disabled by default and is not connected to React, Express, retrieval, or an HTTP generation route.

### Configuration and authentication

```text
CAMPUS_ASSISTANT_ENABLED=false
GOOGLE_CLOUD_PROJECT=campusconnect-511010
GOOGLE_CLOUD_LOCATION=global
GOOGLE_GENAI_USE_VERTEXAI=true
GEMINI_MODEL=gemini-2.5-flash
GEMINI_GENERATION_TIMEOUT_SECONDS=20
GEMINI_MAX_OUTPUT_TOKENS=512
GEMINI_MAX_CONCURRENCY=1
```

- `CAMPUS_ASSISTANT_ENABLED` defaults to `false`.
- `GOOGLE_CLOUD_PROJECT` is required only when the foundation is enabled.
- `GOOGLE_CLOUD_LOCATION` defaults to `global`.
- `GOOGLE_GENAI_USE_VERTEXAI` defaults to `true` and must remain true for this provider.
- `GEMINI_MODEL` defaults to `gemini-2.5-flash`.
- Generation timeout accepts 1–60 seconds, output tokens accept 64–2,048, and concurrency accepts 1–4. Presentation configuration uses one concurrent call.

The SDK obtains credentials from Google Application Default Credentials (ADC); no API key or service-account JSON belongs in `.env`. Authenticate locally with `gcloud auth application-default login`. For future deployment, attach a least-privileged Google Cloud service account to the workload through the hosting platform's identity mechanism instead of generating or shipping a long-lived JSON key.

An unrelated `GOOGLE_APPLICATION_CREDENTIALS` value overrides normal ADC discovery. Before launching CampusConnect, clear that variable from the current shell without inspecting or changing the referenced file:

```powershell
# PowerShell, current process only
Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue
```

```bat
:: Command Prompt, current process only
set GOOGLE_APPLICATION_CREDENTIALS=
```

If the variable is persisted at user or machine scope, remove it through the Windows Environment Variables UI, open a new terminal, and authenticate with ADC. The application deliberately does not silently override an explicitly configured credential path.

The provider performs no automatic retries. It maps client initialization/ADC failures, timeouts, quota failures, authentication failures, malformed responses, and empty responses into safe internal error categories without returning raw provider details, prompts, or credentials. Missing Vertex configuration leaves the provider unavailable but does not prevent FastAPI or existing MiniLM modules from starting.

### Tests and optional smoke test

Automated tests use injected fake clients and make no Vertex AI requests:

```text
pytest tests/test_assistant_foundation.py
pytest
```

A paid real request must be manually authorized. After confirming billing, quota, project access, the Vertex AI API, and ADC, run exactly one request from `ai-service` with the old credential override cleared:

```powershell
Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue
$env:CAMPUS_ASSISTANT_ENABLED = "true"
$env:GOOGLE_CLOUD_PROJECT = "campusconnect-511010"
$env:GOOGLE_CLOUD_LOCATION = "global"
$env:GOOGLE_GENAI_USE_VERTEXAI = "true"
@'
import asyncio
from app.core.config import Settings
from app.generation.gemini import create_generation_provider
from app.generation.provider import GenerationRequest

async def main():
    provider = create_generation_provider(Settings())
    try:
        result = await provider.generate(GenerationRequest(
            prompt="Reply with exactly: CampusConnect Vertex smoke test OK",
            system_instruction="Follow the user instruction. Do not call tools.",
        ))
        print(result.text)
    finally:
        await provider.aclose()

asyncio.run(main())
'@ | .\.venv\Scripts\python.exe -
```

This smoke test is opt-in, billable, and never runs during installation, startup, tests, or builds. Delete the temporary process environment variables or close the shell afterward.

RAG-0 does **not** implement authorized retrieval, semantic reranking, prompt assembly, response generation endpoints, document ingestion, vector storage, conversation history, or frontend integration. Those remain later, separately approved milestones.

## Evaluation

The deterministic synthetic evaluation set contains exactly 500 reports: 250 LOST and 250 FOUND reports arranged as known pairs, with controlled wording, category, location, and incident-date variation plus hard negatives. It contains no production or student data.

```text
python -m evaluation.evaluate
```

The command writes a machine-readable result to `evaluation/results/baseline-v1.json` and prints the same JSON. Definitions and limitations are in [evaluation/README.md](evaluation/README.md); dataset construction is in [datasets/README.md](datasets/README.md).

AI-2 comparison uses a separate benchmark and never overwrites the AI-1 artifact:

```text
python -m evaluation.evaluate_v2
```

It writes `evaluation/results/comparison-v2.json`, containing baseline and semantic metrics, their delta, and bounded error samples.

## AI-3 scaling decision

AI-3 measures local brute-force semantic retrieval before considering vector infrastructure. It does not add a vector database, embedding persistence, FastAPI database access, or a production candidate-limit change.

```text
python -m evaluation.evaluate_scaling --quick
python -m evaluation.evaluate_scaling
```

Quick mode exercises the complete pipeline with a small corpus and never writes or replaces the official artifact. Full mode generates the separate deterministic 10,000-report synthetic corpus, batch-encodes it once, reuses the resulting matrix for every retrieval experiment, verifies the frozen Benchmark V2 metrics, and atomically writes `evaluation/results/scaling-v1.json` only after all stages pass. It measures the single real full-corpus embedding operation, precomputed `numpy.float32` matrix cosine-search cost, warm per-query total time, dense-vector memory, and a metadata-only bounded candidate-pool proxy. Smaller-corpus embedding values are explicitly derived estimates, not additional measured encode runs. The result is a local CPU measurement artifact, not a production load test or a change to the matcher.

## Future roadmap

- AI-0: independent service foundation.
- AI-1: deterministic Lost & Found lexical baseline matching.
- AI-2: local semantic matcher and Benchmark V2 comparison against the preserved baseline.
- AI-3: synthetic scaling measurement; the measured result keeps the current bounded brute-force approach.
- Future milestones: only after separate approval, assess ranking-quality improvements or production retrieval telemetry.

No vector database or external provider has been selected.

## AI-4 multimodal foundation

AI-4 adds an opt-in `lf-multimodal-v1` matcher using `open_clip_torch==3.3.0` (installed package license: MIT), local OpenCLIP `ViT-B-32`, and the `laion2b_s34b_b79k` checkpoint (512-dimensional normalized image embeddings). The checkpoint must remain accompanied by its upstream OpenCLIP/model-card attribution and usage terms when redistributed. It is disabled by default. Enable it only for controlled review with `AI_LOST_FOUND_MATCHER=multimodal` in the AI service and `AI_LOST_FOUND_MULTIMODAL_ENABLED=true` in Express.

OpenCLIP is excluded from the normal production requirements. Install `requirements-multimodal.txt` only for controlled experimental evaluation.

Express remains the sole owner of authentication, report visibility, candidate retrieval, and private S3 access. It reads only authorized database-backed object keys and sends bounded image bytes to FastAPI. FastAPI accepts no image URLs, AWS credentials, or database access. JPEG, PNG, and WebP evidence is independently decoded and verified before local inference.

Limits are three images per report, 2 MiB per image, and 8 MiB of decoded image bytes per AI request. Image embeddings use a process-local LRU cache (default 256 entries) keyed by the OpenCLIP model/checkpoint and a SHA-256 digest of image content. Raw images are not retained after request processing.

When both reports have usable images, scoring is 40% semantic text, 25% best pairwise image similarity, 15% category, 10% location, and 10% time. Otherwise the exact semantic weights remain 55%, 20%, 15%, and 10%. Image cosine is mapped from `[-1, 1]` to `[0, 1]` via `(cosine + 1) / 2`, clamped, and remains a ranking signal rather than an identity probability.

Run the controlled local evaluation with:

```text
python -m evaluation.evaluate_multimodal
```

The verified result is `evaluation/results/multimodal-v1.json`. The generated fixture evaluation contains no student data and does not constitute production accuracy evidence.

## AI-5 Marketplace recommendations

`marketplace-hybrid-v1` ranks an Express-authorized pool of at most 100 active Marketplace listings at `POST /api/v1/recommendations/marketplace`. It combines MiniLM content relevance, category affinity, bookmarks, explicit profile interests, and modest recency. It excludes database access and PII, returns transparent reasons, and applies stable lightweight category diversification. Its score is a ranking score, not a probability.

Express exposes the authenticated application endpoint and owns candidate eligibility and response hydration. If this service is unavailable, Express uses a recent eligible-listing fallback; the normal Marketplace feed is unaffected. See [the Marketplace recommendation architecture](../docs/marketplace-recommendations.md) for signal availability, weights, privacy boundaries, and the activity-persistence gap.

Run the deterministic offline comparison with:

```text
python -m evaluation.evaluate_recommendations
```

The command atomically writes `evaluation/results/marketplace-recommendations-v1.json` only after evaluation succeeds.

### AI-5B authenticated view signals

Express may add minimized `view` category signals derived from authenticated Marketplace detail opens. A view is capped at `0.35` strength and decays with a 14-day half-life, so it remains weaker than a bookmark. FastAPI receives no user ID or raw Activity row. The truthful reason `Based on items you've viewed` appears only when a view signal contributes.

Run `python -m evaluation.evaluate_recommendation_views` for the separate AI-5B comparison artifact. It preserves the original AI-5 result and atomically writes `evaluation/results/marketplace-recommendations-views-v1.json`.

## AI-4B realistic validation

Run `python -m evaluation.evaluate_multimodal_realistic --quick` to validate the pipeline without writing the official artifact, then `python -m evaluation.evaluate_multimodal_realistic` for the full deterministic 120-case evaluation. AI-4B applies reproducible crop, rotation, affine-angle, brightness, contrast, blur, noise, occlusion, clutter, and scale transformations to self-generated fixtures. It also measures combined MiniLM/OpenCLIP process memory, cold/warm behavior, and progressive concurrency at 1, 2, 5, and 10 requests.

The verified `evaluation/results/multimodal-realistic-v1.json` result chose **D — KEEP SEMANTIC-ONLY FOR NOW**. Semantic and multimodal ranking both reached P@1/MRR 1.0 on this controlled benchmark, so it did not demonstrate incremental multimodal benefit. High visual similarity among wrong same-category objects further confirms that CLIP similarity must not be treated as item identity. Production settings remain semantic-only and multimodal-disabled.

# Resume analysis privacy

`POST /api/v1/resume/analyze` is an internal-service-authenticated endpoint used by the Express profile API. PDF and DOCX bytes are processed in memory, bounded by `RESUME_MAX_BYTES`, and are not persisted to PostgreSQL, S3, logs, or provider APIs. Only normalized skill suggestions and short evidence excerpts are returned. Raw extracted text is discarded after the request. Scanned PDFs require conversion to a text-based PDF; OCR is intentionally not included.
