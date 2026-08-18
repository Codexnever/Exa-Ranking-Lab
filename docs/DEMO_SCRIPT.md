# Exa Ranking Lab v1 — 3–5 minute demo

## Setup

Use a development Appwrite project provisioned with `npm run provision:evaluation-schema`. Seed or import only clearly synthetic data. Never use production user data for the demo.

## Walkthrough

1. **Ranking change is not quality change (30 seconds).** Open two snapshots for the same query. Point out that drift shows *what changed*, but cannot establish whether relevance improved.
2. **Human benchmark (40 seconds).** Open Evaluation, show accepted labels (`0` not relevant, `1` relevant, `2` highly relevant), and emphasize that unjudged is not grade 0. Freeze the dataset.
3. **Metrics and history (40 seconds).** Run nDCG, benchmark-relative Recall, MRR, Hit, Judged Precision, and Judgment Coverage. Save two immutable runs.
4. **Run comparison and movement (40 seconds).** Compare the runs. Open “What moved?” and identify a grade-2 loss or grade-0 promotion using canonical document identity.
5. **Pipeline evidence (40 seconds).** Open a demo candidate → rerank → final trace. Show the document path and stage diagnosis. Say that this is descriptive evidence—not causal attribution.
6. **Hard negatives (30 seconds).** Show an accepted grade-0 result with high or repeated prominence and its raw ranking evidence.
7. **Strategy Lab (45 seconds).** Compare the synthetic imported “Dense Baseline” and “Hybrid + Reranker” executions. Show quality, compatible latency, wins/losses, hard negatives, and unavailable stage evidence where appropriate. Do not call the highest-nDCG strategy universally best.
8. **Close (15 seconds).** Reiterate: ranking drift detects change; frozen human truth determines measured quality; trace and movement evidence make the change inspectable.

## Presenter guardrails

- Do not claim statistical significance or component causality.
- Always say “benchmark-relative Recall.”
- Identify imported strategy outputs as demo fixtures.
- Do not display credentials, cookies, API keys, or private URLs.
