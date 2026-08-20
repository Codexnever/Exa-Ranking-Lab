# Phase 13 release-blocker inventory

Last local audit: 2026-08-18 on `feat/relevance-foundation`.

## Resolved in code

- **Eager Appwrite initialization:** server and browser Appwrite SDK objects are now constructed lazily and validated only when used. A credentials-free production build completes.
- **Broken Next.js lint script:** `next lint` was replaced by ESLint CLI with a flat compatibility configuration. The gate exits successfully while reporting the inherited warning backlog.
- **Type errors hidden during builds:** `ignoreBuildErrors` was removed from Next configuration; production builds run TypeScript.
- **Missing release automation:** CI, a dependency shrinkwrap, demo manifest validation, release checklist, and developer demo script were added.
- **Incomplete onboarding:** README and `.env.example` now describe the real Appwrite-backed evaluation product and optional integrations.

## External blockers before declaring v1 released

1. No Appwrite endpoint, project, database, or server API key is available in this environment. Live schema inspect/provision, authentication, and authoritative evaluation API smoke flows remain unverified.
2. No deployment credentials or confirmed deployment target are available. Deployment health is unverified.
3. No Git remote is configured, so CI cannot be observed and the branch cannot be pushed.
4. No browser executable is installed. Authenticated product screenshots cannot be captured locally.
5. The inherited lint baseline contains warnings, although there are zero lint errors and the lint command succeeds. These warnings should be reduced incrementally after v1 rather than through release-risk formatting churn.

Do not mark `V1 RELEASE READY` until the infrastructure and deployment items in `RELEASE_CHECKLIST.md` are completed against the intended environment.
