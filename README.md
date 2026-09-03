# Exa Ranking Lab

Exa Ranking Lab is a search-quality observability and evaluation workspace for tracking ranking change, measuring judged relevance, diagnosing document movement across recorded retrieval stages, and comparing search strategies on frozen benchmarks.

## Why it exists

```text
ranking changed ≠ search quality changed
```

Ranking drift is an operational signal. Human relevance judgments and reproducible metric policy are needed to determine whether measured search quality changed. The Lab keeps global drift, metric deltas, document movement, stage evidence, and strategy tradeoffs separate so the evidence remains auditable.

## Core capabilities

- Query execution, immutable snapshots, ranking drift, and algorithm-change evidence
- Frozen human benchmarks with accepted `0/1/2` judgments and canonical document identity
- nDCG, benchmark-relative Recall, MRR, Hit, Judged Precision, and Judgment Coverage
- Immutable evaluation runs, relevance-aware comparison, and query gains/losses
- Canonical judged-document movement and top-K transitions
- Generic candidate/retrieval/fusion/rerank/final stage traces and descriptive diagnosis
- Accepted grade-0 hard-negative candidate and repeated false-positive analysis
- Imported or native strategy execution benchmarking with quality, latency, error, and stage profiles

## Architecture

```mermaid
flowchart TD
    O[Search / strategy outputs] --> S[Snapshots / stage traces]
    S --> C[Canonical document identity]
    C --> B[Frozen human benchmark]
    B --> M[Metric Policy v1]
    M --> R[Immutable evaluation runs]
    R --> X[Run comparison]
    X --> D[Document movement]
    S --> G[Stage diagnosis]
    D --> H[Hard-negative analysis]
    G --> H
    H --> L[Strategy benchmarking]
    O --> P[Ranking drift / algorithm detector]
    P -. parallel operational evidence .-> X
```

The system does not combine these signals into a synthetic score or make unsupported causal claims.

## Quick start

Requirements: Node.js 22, npm, and an Appwrite project for persisted runtime workflows.

```bash
npm ci
cp .env.example .env.local
# Fill the required Appwrite values in .env.local
npm run provision:evaluation-schema -- --dry-run
npm run provision:evaluation-schema
npm run dev
```

Open <http://localhost:3000>. Appwrite clients initialize lazily, so type checking and production compilation do not require live secrets; an actual runtime Appwrite operation fails with a clear missing-variable error until configuration is supplied.

## Environment setup

`.env.example` is grouped by subsystem. The important classes are:

| Class | Variables | When required |
|---|---|---|
| Core runtime | `NEXT_PUBLIC_APPWRITE_ENDPOINT`, `NEXT_PUBLIC_APPWRITE_PROJECT_ID`, `NEXT_PUBLIC_APPWRITE_DATABASE_ID`, `APPWRITE_API_KEY`, core collection IDs | Authentication and persisted application operations |
| Evaluation | evaluation dataset/query/judgment/run collection IDs | Frozen benchmark workflows |
| Stage trace | stage trace header/document collection IDs | Trace capture and stage diagnosis |
| Strategy | strategy/execution/document collection IDs | Strategy Lab persistence |
| Optional providers | `GEMINI_API_KEY`, `OPENAI_API_KEY`, `WEAVIATE_*`, `RESEND_API_KEY` | Only their embedding, vector, or notification paths |
| Scheduling/deployment | `CRON_SECRET`, `APP_URL`, `NEXT_PUBLIC_APP_URL` | Scheduled jobs and deployed callbacks |
| Provisioning only | server Appwrite API key and database/project configuration | Schema provisioning scripts |

Exa credentials are normally managed through the authenticated Settings workflow. Optional embedding/vector credentials are not required for core evaluation startup. Never commit `.env.local`.

## Appwrite provisioning

The additive provisioning script covers evaluation datasets, queries, relevance judgments, runs, run-query results, stage traces/documents, strategies, and strategy execution headers/documents.

Evaluation configuration uses stable logical environment-variable names mapped to isolated v1 physical collections:

```dotenv
COLLECTION_EVALUATION_DATASETS=evaluation_datasets_v1
COLLECTION_EVALUATION_QUERIES=evaluation_queries_v1
COLLECTION_EVALUATION_QUERY_CONFIGS=evaluation_query_configs_v1
COLLECTION_RELEVANCE_JUDGMENTS=relevance_judgments_v2
COLLECTION_RELEVANCE_JUDGMENT_PAYLOADS=relevance_judgment_payloads_v1
COLLECTION_EVALUATION_PAYLOAD_CHUNKS=evaluation_payload_chunks_v1
COLLECTION_EVALUATION_RUNS=evaluation_runs_v1
COLLECTION_EVALUATION_RUN_QUERIES=evaluation_run_queries_v1
COLLECTION_EVALUATION_STAGE_TRACES=evaluation_stage_traces_v1
COLLECTION_EVALUATION_STAGE_TRACE_DOCUMENTS=evaluation_stage_docs_v1
COLLECTION_EVALUATION_STRATEGIES=evaluation_strategies_v1
COLLECTION_EVALUATION_STRATEGY_EXECUTIONS=evaluation_strategy_execs_v1
COLLECTION_EVALUATION_STRATEGY_EXECUTION_DOCUMENTS=evaluation_strategy_docs_v1
```

```bash
node --check scripts/provision-evaluation-schema.mjs
npm run provision:evaluation-schema -- --dry-run  # inspect only
npm run provision:evaluation-schema -- --inspect  # inspect only
npm run provision:evaluation-schema               # apply additive changes
```

It never deletes collections or attributes. Existing schema mismatches are reported for manual review. Live inspection and application require valid Appwrite credentials.

### Optional legacy cleanup

Legacy collections such as `evaluation_datasets`, `evaluation_queries`, and `relevance_judgments` are never deleted by the provisioner. Cleanup is optional and manual, and must happen only after all 13 active collections pass final inspection. Before any manual cleanup, independently confirm that every legacy collection has zero documents and that runtime environment variables point to the verified active collections.

## Development and verification

```bash
npm run dev
npm run check-types
npm run lint
npm test -- --runInBand
npm run build
```

The GitHub Actions CI workflow runs the same type, lint, test, and build gates without embedding secrets.

## Demo evaluation flow

The optional demo command validates a synthetic, non-writing import bundle containing a frozen dataset description, two queries, two run descriptors, a comparison, a candidate → rerank → final trace, and two imported strategies:

```bash
npm run seed:evaluation-demo
npm run seed:evaluation-demo -- --write /tmp/exa-ranking-lab-demo.json
```

`--write` uses exclusive creation and will not overwrite a file. The bundle never writes directly to Appwrite or bypasses server authorization; import it through authenticated APIs after provisioning. See [the demo script](docs/DEMO_SCRIPT.md) for the 3–5 minute walkthrough.

## Strategy Lab

Open `/evaluation/<frozen-dataset-id>/strategies`. Register provider-neutral strategy configurations, import immutable execution outputs through the API, and compare the same query cohort under Metric Policy v1. Tables keep ranking quality, compatible latency, hard negatives, and optional stage evidence separate. “Highest nDCG@10” is not a universal-best claim.

## Weaviate storage and benchmark retrieval

The optional Weaviate integration uses one unified `ExaRankingData` collection because the configured service tier supports one collection. A `recordType` discriminator separates `search_result`, `query_intent`, and `drift_pattern` objects. Search-result objects are intentionally historical: every synchronized ranking snapshot remains available, and long result text may produce multiple chunk records for the same source document.

Historical analytics and benchmark retrieval use that storage differently:

- **Historical analytics** filters `search_result` records by authenticated owner and time range, groups them into snapshots, and retains multiple snapshots for semantic stability, ranking volatility, anomaly detection, semantic clustering, content evolution, discovery trends, and snapshot export. Historical objects are not globally deduplicated or deleted.
- **Strategy Benchmark retrieval** uses `GET /api/evaluation/datasets/<datasetVersionId>/queries/<evaluationQueryId>/weaviate-search?limit=10`. The authenticated server requires a frozen, owned dataset; resolves the evaluation query's immutable `sourceQueryId`; and derives the controlled corpus from the union of `sourceSnapshotIds` preserved by its accepted judgments. A frozen query currently has no single snapshot pointer, so missing snapshot provenance is rejected instead of falling back to the owner's full history.

The benchmark retrieval flow is:

```text
Frozen dataset and evaluation query
→ server-derived source query and frozen source-snapshot corpus
→ Gemini query embedding
→ Weaviate nearVector candidates
→ Binary Quantization similarity ranking
→ optional Product Quantization ADC reranking
→ canonical document deduplication
→ top K unique URLs
→ explicit Strategy Execution import
→ server-side Metric Policy evaluation
```

Candidate retrieval is bounded but intentionally fetches more than `K` before deduplication. When historical snapshots, repeated synchronization, or content chunks represent the same canonical document, only its highest-ranked occurrence is returned and later unique candidates fill the duplicate slots. The underlying historical records remain unchanged. Canonical identity uses evaluation canonicalization policy v1, including HTTPS/host normalization, fragment and tracking-parameter removal, and trailing-slash normalization.

The optional PQ pass uses the project-specific score `0.35 × BQ similarity + 0.65 × normalized ADC score`. This is an Exa Ranking Lab strategy implementation detail, not Weaviate's default dense-ranking formula. Deduplication happens after this ranking and before the final limit.

Stored source `position` is historical metadata from the original ranking. It is not Strategy Execution rank. When retrieved URLs are explicitly imported, the Strategy Execution service derives contiguous rank from returned array order and independently derives canonical URL and document key. Retrieval does not silently create an execution.

This corpus is reproducible relative to the immutable source snapshots that supplied frozen accepted judgment evidence. It is not an exhaustive web corpus, and Benchmark Recall remains relative to known accepted relevant benchmark documents.

## Algorithm Update Detector v2.1

Detector v2.1 identifies coordinated ranking-change candidates whose movement is unusual compared with the category's historical volatility. It observes external ranking behaviour; it cannot prove that Exa or another provider deployed an internal algorithm update. High drift alone is insufficient: enough related queries must move together, and a mature historical baseline must show that the category-wide movement is unusual.

```mermaid
flowchart TD
  A[Scheduled queries] --> B[Snapshots]
  B --> C[Drift analysis]
  C --> D[Current query coordination]
  D --> E[Historical category baseline]
  E --> F[Event or suppression]
  F --> G[Persistence]
  G --> H[Analytics UI]
```

Detection has four gates:

1. **Current observation coverage:** enough queries in the category must have valid observations in the current correlation window.
2. **Per-query movement:** a query is affected only when its drift meets that category's configured threshold.
3. **Coordination:** the affected-query rate must meet the configured threshold. One query with drift `90` does not create a category-wide event when the other queries remain stable.
4. **Historical abnormality:** when a baseline is available, the average across all currently observed queries must be unusually high relative to historical category-window averages.

Temporal means *across time*; volatility means *how much rankings normally change*. For example:

```text
News historical category drift: 45, 65, 35, 70, 50, 60, 40
Current average: 58
Interpretation: high raw drift, but normal for this historically volatile category.
No baseline-supported event.

Research historical category drift: 8, 12, 10, 9, 11, 10, 12
Current average: 42
Interpretation: unusual coordinated movement for a normally stable category.
Create a ranking-change candidate if coordination also passes.
```

### Detector defaults

| Setting | Default |
| --- | ---: |
| Affected-query drift-rate threshold | `0.60` |
| Per-query drift threshold | `30` |
| Minimum queries in a category | `3` |
| Correlation window | `24 hours` |
| Historical lookback | `14 days` before the current window |
| Minimum historical observations | `10` |
| Minimum distinct historical queries | `3` |
| Minimum valid historical windows | `3` |
| Minimum distinct queries per historical window | `3` |
| Historical robust-deviation threshold | `2` |
| Zero-dispersion absolute epsilon | `5` drift points |
| Fixed-threshold confidence cap | `49` |
| Change-type dominance ratio | `1.5` |

These are project engineering defaults that require production calibration, not universal search-industry standards. Category-specific overrides also apply where configured.

The detector has two modes. **Baseline-aware** candidates passed the historical comparison. During cold start or insufficient history, **fixed-threshold** candidates can still be stored, but they are explicitly unverified and their confidence is capped at `49`, below moderate severity. Confidence is an evidence score, not a calibrated probability.

The existing panel is under **Analytics → Weaviate data source → AI Insights → Algorithm Update Detector**. It reads stored events and displays category, severity, drift rate, average drift score, affected queries, and the stored description. Refreshing or opening the panel does not run detection. More structured evidence is available from authenticated `GET /api/analytics/algorithm-events?limit=10`; the panel does not yet render median, MAD, robust deviation, detection mode, confidence-cap metadata, or change classification.

Current limitations:

- Baseline-aware detection requires sufficient historical observations, queries, and covered time windows; cold-start candidates remain unverified.
- Thresholds require calibration, and live-web categories such as news may naturally be more volatile.
- Query schedules, filters, and `topK` should remain consistent so drift comparisons stay meaningful.
- The detector finds correlation and abnormal movement, not confirmed causation.
- Suppressed candidates are not persisted as event records, and the existing UI does not expose every v2.1 evidence field.

Focused verification:

```bash
npm test -- --runInBand --verbose lib/services/algorithm-detector/__tests__/AlgorithmUpdateDetector.test.ts
npm test -- --runInBand
npx tsc --noEmit --incremental false
npm run lint
npm run build
```

The last verified project state had 37 passing focused detector tests, 288 passing full-suite tests, zero lint errors with existing warnings, and 47/47 static pages generated. Detection itself runs from scheduled-query processing, not from opening the Analytics UI.

## Metric semantics

- `0`: accepted not relevant; `1`: accepted relevant; `2`: accepted highly relevant.
- **Unjudged is not irrelevant.** Unjudged results occupy ranking positions for nDCG but never become grade 0 truth.
- **nDCG@K** measures graded ordering quality with gain `2^grade - 1`.
- **Benchmark Recall@K** is the fraction of known accepted relevant benchmark documents present—not exhaustive web recall.
- **MRR** uses the first accepted relevant result.
- **Hit@K** reports whether any accepted relevant result appears in the cutoff.
- **Judged Precision@K** divides judged relevant results by judged results; unjudged results are excluded from its denominator.
- **Judgment Coverage@K** reports how much of the evaluated ranking has accepted truth and qualifies interpretation.
- **Stage Recall** uses the same benchmark-relative truth over one recorded stage; missing stages are not inferred.
- A **hard-negative candidate** is accepted grade 0 plus high-prominence, persistence, outranking, or stage-survival evidence—not every grade-0 document and not automatically training data.

## Screenshots

Release screenshots must be captured from a configured runtime or verified deployment. They are intentionally not fabricated in source control when Appwrite/auth/browser infrastructure is unavailable. The required views are tracked in [the release checklist](docs/RELEASE_CHECKLIST.md).

## Security and provenance

Evaluation APIs are owner scoped and reject foreign datasets, runs, traces, strategies, and unsupported client authority fields. Canonical keys, metric values, evidence reasons, and severities are calculated on the server. Payloads and list endpoints are bounded. Server API keys must remain server-only.

## Current limitations

- A live Appwrite project is required for authenticated runtime and infrastructure smoke tests.
- Strategy outputs may be imported instead of executed natively.
- Stage diagnosis depends on exactly recorded stages and is descriptive, not causal.
- Hard-negative analysis depends on accepted human grade-0 judgments.
- Benchmark Recall is benchmark-relative.
- Comparisons are descriptive and do not claim statistical significance.
- Optional semantic/vector/notification paths depend on external provider availability.

## v1 status

The Phase 1–12 product roadmap is feature-complete. Phase 13 adds release engineering, reproducible environment documentation, lazy runtime configuration, CI, demo assets, and verification gates. A release is only declared ready after live Appwrite schema, authentication, smoke-flow, screenshot, and deployment validation complete.

Detailed policy and storage documentation lives in [DEVELOPER.md](DEVELOPER.md).
