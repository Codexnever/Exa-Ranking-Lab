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
