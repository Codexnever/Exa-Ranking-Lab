# Phase 13 release-blocker inventory

Last local audit: 2026-08-27 on `codex/review-project-documentation`.

## Resolved in code

- **Eager Appwrite initialization:** server and browser Appwrite SDK objects are now constructed lazily and validated only when used. A credentials-free production build completes.
- **Broken Next.js lint script:** `next lint` was replaced by ESLint CLI with a flat compatibility configuration. The gate exits successfully while reporting the inherited warning backlog.
- **Type errors hidden during builds:** `ignoreBuildErrors` was removed from Next configuration; production builds run TypeScript.
- **Missing release automation:** CI, a dependency shrinkwrap, demo manifest validation, release checklist, and developer demo script were added.
- **Incomplete onboarding:** README and `.env.example` now describe the real Appwrite-backed evaluation product and optional integrations.

## External blockers before declaring v1 released

1. Live Appwrite schema provisioning and repository parity are verified for all 13 active evaluation collections, but authenticated end-to-end evaluation API smoke flows remain unverified.
2. No deployment credentials or confirmed deployment target are available. Deployment health is unverified.
3. CI must pass on the pushed release commit.
4. Authenticated product screenshots have not been captured from a verified deployment.
5. The inherited lint baseline contains warnings, although there are zero lint errors and the lint command succeeds. These warnings should be reduced incrementally after v1 rather than through release-risk formatting churn.

Do not mark `V1 RELEASE READY` until the infrastructure and deployment items in `RELEASE_CHECKLIST.md` are completed against the intended environment.
