# Exa Ranking Lab — Complete Developer Reference

> Personal reference document. Not for users. Contains everything needed to
> continue development, debug issues, and understand every architectural decision.

---

## Table of Contents

1. [What This Project Is](#1-what-this-project-is)
2. [Tech Stack](#2-tech-stack)
3. [Environment Variables](#3-environment-variables)
4. [Folder Structure](#4-folder-structure)
5. [Data Flow — End to End](#5-data-flow--end-to-end)
6. [Drift Detection — How It Works](#6-drift-detection--how-it-works)
7. [Embedding Pipeline](#7-embedding-pipeline)
8. [Weaviate Schema](#8-weaviate-schema)
9. [New Services Built This Session](#9-new-services-built-this-session)
10. [API Routes Reference](#10-api-routes-reference)
11. [Appwrite Collections](#11-appwrite-collections)
12. [Zustand Stores](#12-zustand-stores)
13. [Key Bugs Fixed](#13-key-bugs-fixed)
14. [Known Limitations](#14-known-limitations)
15. [Testing Checklist](#15-testing-checklist)
16. [Deployment](#16-deployment)
17. [Strategic Notes](#17-strategic-notes)

---

## 1. What This Project Is

SERP drift-detection platform built on Exa.ai search API. Tracks how search
engine results pages change over time using both traditional position-tracking
AND semantic/vector analysis to detect content drift that position-only tools
cannot see.

**Core differentiator:** Semrush/Ahrefs only track position. This tool also
tracks semantic content drift — a page can keep the same rank while its
content changes meaning, or the SERP's intent mix can shift even while
individual positions look stable. Requires vector-native architecture which
legacy SEO tools don't have.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js App Router + TypeScript | |
| UI | Tailwind + shadcn/ui + Recharts | |
| State | Zustand (4 stores) | |
| Primary DB | Appwrite | Split client/server SDK |
| Vector DB | Weaviate Cloud | FREE PLAN = 1 collection only |
| Embeddings | Gemini `gemini-embedding-2-preview` | 768-dim |
| Embedding fallback | OpenAI `text-embedding-3-small` | same 768-dim output |
| Search API | Exa.ai | full text + highlights |
| Scheduling | GitHub Actions cron | fires every 30min |
| Email alerts | Resend | drift threshold notifications |
| Deployment | Vercel | |

---

## 3. Environment Variables

```bash
# Appwrite
NEXT_PUBLIC_APPWRITE_ENDPOINT=
NEXT_PUBLIC_APPWRITE_PROJECT_ID=
NEXT_PUBLIC_APPWRITE_DATABASE_ID=
APPWRITE_API_KEY=                    # server-only, NO NEXT_PUBLIC_ prefix

# Appwrite Collection IDs
COLLECTION_USERS=
COLLECTION_QUERIES=
COLLECTION_SNAPSHOTS=
COLLECTION_FEEDBACK=
COLLECTION_ANALYTICS=
COLLECTION_NOTIFICATIONS=            # new — drift alerts
COLLECTION_ALGORITHM_EVENTS=         # new — algorithm update detector
COLLECTION_EMBEDDING_CACHE=          # new — persistent embedding cache
COLLECTION_EVALUATION_RUNS=          # immutable evaluation-run headers
COLLECTION_EVALUATION_RUN_QUERIES=   # per-query metric payloads for each run
NEXT_PUBLIC_COLLECTION_SETTINGS=
NEXT_PUBLIC_COLLECTION_ACCESS_LOGS=
COLLECTION_API_USAGE=

# Weaviate
WEAVIATE_URL=
WEAVIATE_API_KEY=

# Gemini (primary embedding model)
GEMINI_API_KEY=

# OpenAI (embedding fallback only — not used for generation)
OPENAI_API_KEY=

# App
NEXT_PUBLIC_APP_URL=                 # used for CORS + Origin checks + email links

# Cron
CRON_SECRET=                         # must match GitHub Actions repo secret
                                     # set in both Vercel + GitHub Actions

# Email alerts
RESEND_API_KEY=                      # re_... from resend.com
```

---

## 4. Folder Structure

```
app/
├── (auth)/auth/page.tsx             # Login — no sidebar layout
├── (dashboard)/                     # All dashboard pages — shared layout
│   ├── layout.tsx                   # Sidebar + Navbar
│   ├── page.tsx                     # Dashboard
│   ├── analytics/page.tsx
│   ├── drift/
│   │   ├── page.tsx                 # Drift Radar list
│   │   └── [queryid]/page.tsx       # Drift detail
│   └── ...other pages
├── api/
│   ├── queries/[id]/run/route.ts    # Execute query → snapshot → Weaviate sync
│   ├── drift/[queryid]/route.ts     # Run drift analysis for one query
│   ├── notifications/route.ts       # GET alerts + PATCH mark-read
│   ├── analytics/refresh/route.ts   # "Run Queries" button
│   └── cron/process-scheduled/      # GitHub Actions trigger
└── server/
    ├── appwrite-server.ts           # node-appwrite SDK (server routes)
    └── appwrite.ts                  # browser SDK (client components)

lib/
├── services/
│   └── algorithm-detector/          # Modular cross-query update detection
│       ├── AlgorithmUpdateDetector.ts
│       ├── ConfidenceScorer.ts
│       ├── EventPersistence.ts
│       └── DescriptionBuilder.ts
├── middleware/
│   ├── security/security-middleware.ts   # withEnhancedSecurity
│   └── authentication/auth-context.tsx   # useAuth hook
└── utils/
    ├── coverage-and-versioning.ts   # computeConfigHash + computeCoverageGap
    └── vector-math.ts               # cosineSimilarity

app/logic/                           # Pure computation
├── drift-analyzer.ts                # Core drift engine (uses EmbeddingService)
├── analyticsLogic.ts
└── useAvgResponseTimeImprovement.ts

app/services/database/               # Data access layer
├── query-service.ts
└── snapshot-service.ts

app/services/weaviate/
└── weaviate-service.ts              # BQ+PQ, sync, anomaly detection

store/
├── use-analytics-store.ts
├── use-queries-store.ts
├── use-snapshots-store.ts
└── weaviate-store.ts

types/type.ts                        # ALL TypeScript interfaces — single file
constants/category-map.ts            # EXA_CATEGORIES — single source of truth
```

---

## 5. Data Flow — End to End

### Manual query execution

```
User clicks "Run Query"
  → POST /api/queries/[id]/run
  → withEnhancedSecurity (auth, rate limit, CORS)
  → userId from SESSION only — never from request body
  → fetch Exa API key from SETTINGS collection
  → ExaClient.search() → Exa /search with full contents+highlights
  → Exa returns: results[] + searchTime(ms) + requestId
  → map results → SearchResult[] with SHA-256 contentHash per result
  → computeConfigHash(query) → 16-char hex stored in snapshot metadata
  → computeCoverageGap(numRequested, numReturned) → stored in metadata
  → databaseService.snapshotService.createSnapshot() → Appwrite
  → fire-and-forget: WeaviateService.syncSnapshot() → embed + store vectors
  → return results + coverageGap to client
```

### Drift analysis

```
GET /api/drift/[queryid]
  → withEnhancedSecurity
  → verify query ownership (query.userId === session.userId)
  → getSnapshots(queryid, userId) from Appwrite
  → analyzeDrift(queryId, queryName, snapshots)
      → sort snapshots oldest → newest
      → for each consecutive pair: calculateDriftScore(prev, curr)
          → check content hashes (fast path if all identical)
          → collect unique texts → EmbeddingService.embedBatch()
              → LRU cache check
              → Appwrite persistent cache check (embedding_cache collection)
              → Gemini gemini-embedding-2-preview API
              → OpenAI text-embedding-3-small (if Gemini fails)
              → position-only mode (if both fail — simScore=0.5 neutral)
          → cosineSimilarity per matched URL
          → drift formula: weight × decay × contentMultiplier × thresholdBonus
          → DriftDecomposer.decompose() → contentDrift/competitorDrift/rerankDrift
      → aggregate timeline → DriftAnalysisResult
  → return to client → drift/[queryid]/page.tsx renders
```

### Scheduled cron

```
GitHub Actions (*/30 * * * *)
  → GET /api/cron/process-scheduled
  → Authorization: Bearer $CRON_SECRET
  → getAllScheduledQueries() — cursor-paginated, all users
  → filter isQueryDue() by frequency (hourly/daily/weekly)
  → sort by most-overdue first, cap at 30 queries
  → execute in batches of 3 with 500ms delay
  → POST-PROCESSING (fire-and-forget per user):
      → analyzeDrift() for each successful query
      → DriftAlertService.checkAndAlert() — email if threshold crossed
      → AlgorithmUpdateDetector.detect() — detect coordinated drift + confidence
      → persistEvents() to algorithm_events collection
```

---

## 6. Drift Detection — How It Works

### Core formula (per snapshot pair, per matched URL)

```
contentHash fast path:
  if all hashes identical → calculatePositionOnlyDrift() — no API calls

For each matched URL (in both snapshots):
  contentChanged = (prevHash !== currHash)

  if contentChanged AND embeddings available:
    simScore = cosineSimilarity(prev_vector, curr_vector)
  elif contentChanged AND position-only mode:
    simScore = 0.5  (neutral — avoids inflating drift when AI is down)
  else:
    simScore = 1.0  (identical content)

  weight    = 1 - rank/topN          (linear) or exp(-rank/topN) (exponential)
  decay     = max(0, 1 - simScore)   (0 = identical, 1 = completely different)
  cmult     = contentChanged ? 2.0 : 1
  tbonus    = simScore < 0.8 ? 1.5 : 1

  contribution += |positionDelta| × weight × (1 + decay) × cmult × tbonus

New URL penalty:  +5 × weight per new URL
Dropped penalty:  +3 per dropped URL

driftScore = min(100, totalDrift / (topN × 15) × 100)
```

### Drift decomposition (DriftDecomposer)

```
contentDrift    — URL stayed, content changed semantically
                  (same URL, prevHash ≠ currHash, sim dropped)
competitorDrift — new URL entered the SERP
                  (URL not in previous snapshot)
rerankDrift     — position moved, content unchanged
                  (same URL, same hash, different position)

dominantCause   — whichever type contributes >50% of total
                  or "mixed" if no single type dominates
```

### Algorithm update detection (AlgorithmUpdateDetector)

```
After every cron batch:
  group all driftResults by query.category
  for each category with ≥3 queries:
    driftedCount = queries where latestDrift > 30
    driftRate = driftedCount / totalInCategory
    if driftRate >= 0.60:
      → coordinated drift = systemic signal, not random
      → create AlgorithmUpdateEvent
      → severity: minor (<70% rate), moderate (70-85%), major (>85% + score>60)
      → persist to algorithm_events collection
      → visible in Analytics → AI Insights tab
```

### Anomaly detection (WeaviateService.detectContentAnomalies)

```
For each query's results in Weaviate:
  dequantize BQ codes → ±1 vectors
  centroid = average of all vectors
  similarity[i] = cosineSimilarity(vector[i], centroid)
  mean, stddev = stats of similarity[]
  flag as anomaly if similarity[i] < mean - 2σ
  anomalyScore = (mean - similarity[i]) / stddev
```

---

## 7. Embedding Pipeline

### EmbeddingService fallback chain

```
embed(text, contentHash?) →

  1. In-process LRU cache (2000 entries, 24h TTL)
     cache key = contentHash if available, else djb2(text)
     → HIT: return immediately, sub-millisecond

  2. Appwrite persistent cache (embedding_cache collection)
     → HIT: store in LRU, return
     → MISS: continue

  3. Gemini gemini-embedding-2-preview
     REST: /v1beta/models/gemini-embedding-2-preview:embedContent
     batch: :batchEmbedContents (up to 100/call)
     output: 768-dim float32
     prepareText: "task: sentence similarity | query: {text}"
     → SUCCESS: store in LRU + Appwrite (fire-and-forget), return
     → FAIL: continue

  4. OpenAI text-embedding-3-small
     dimensions: 768 (matches Gemini output dim)
     → SUCCESS: store in LRU + Appwrite (fire-and-forget), return
     → FAIL: continue

  5. Position-only degradation
     returns { vector: [], mode: "position-only" }
     drift-analyzer uses simScore=0.5 (neutral) for content-changed URLs
     UI shows "Position Only" badge in EmbeddingModeIndicator
```

### WeaviateService embedding (separate from EmbeddingService)

WeaviateService has its OWN internal embedding logic (5000-entry LRU) for
SYNC operations. This is separate from EmbeddingService intentionally:
- WeaviateService embeds for STORAGE (sync snapshots to Weaviate)
- EmbeddingService embeds for ANALYSIS (drift similarity scoring)
Different contexts, different lifetimes. Two caches exist — acceptable at
this scale. Future: pass EmbeddingService into WeaviateService constructor
to unify.

---

## 8. Weaviate Schema

**FREE PLAN = ONLY 1 COLLECTION ALLOWED.**
`ExaRankingData` is the only collection. All record types live here
distinguished by `recordType` discriminator field.

**CRITICAL: Every Weaviate query MUST filter `recordType` or results
will mix search_result / query_intent / drift_pattern records.**

```
Collection: ExaRankingData
Vectorizer: none (we provide our own vectors)
Distance:   cosine

Properties:
  recordType          text     "search_result" | "query_intent" | "drift_pattern"
  userId              text
  queryId             text
  snapshotId          text
  timestamp           date
  url                 text
  title               text
  snippet             text
  domain              text
  position            int
  score               number
  contentHash         text
  category            text
  binaryCode          text     base64 BQ-compressed vector (96 bytes = 768 bits)
  pqCode              text     base64 PQ-compressed codes (after 2000 vectors trained)
  quantizationMethod  text     "BQ" or "BQ+PQ"
  name                text     (query_intent only)
  query               text     (query_intent only)
  lastRun             date     (query_intent only)
  previousSnapshotId  text     (drift_pattern only)
  driftScore          number   (drift_pattern only)
  contentChanges      int      (drift_pattern only)

EmbeddingCache (separate concern — stored in APPWRITE, not Weaviate):
  contentHash    text   (unique index)
  vector         text   JSON.stringify(float32[]) — 768 floats ≈ 5400 chars
  storedAt       date
```

### BQ+PQ Quantization

```
BQ (Binary Quantization):
  768-dim float32 → 768 bits → 96 bytes
  rule: value > 0 → 1, value ≤ 0 → 0
  similarity: Hamming distance → hammingToSimilarity()
  compression: 32× vs raw float32

PQ (Product Quantization):
  triggered after 2000 vectors collected (HybridQuantizer.maybeCollectAndTrain)
  8 subspaces, 128 codebook (reduced from 256 to handle 768-dim efficiently)
  15 k-means++ iterations
  OPQ-lite: sorts dimensions by variance before subspace assignment

Hybrid reranking:
  final = 0.35 × bqSimilarity + 0.65 × adcScore
  BQ provides coarse fast first pass
  PQ ADC provides fine-grained second pass
```

### Legacy cleanup

If you ever see `USAGE_LIMIT_EXCEEDED (429)` from Weaviate, old 3-class
schema (`SearchResult`, `QueryIntent`, `DriftPattern`) may have been
recreated. Run `delete-legacy-weaviate-classes.ts` to clean up.

---

## 9. New Services Built This Session

### EmbeddingService (`lib/services/EmbeddingService.ts`)

Single entry point for all embeddings. Never call Gemini directly anywhere
else. Import via:
```typescript
import { getEmbeddingService } from "@/lib/services/EmbeddingService"
const embSvc = getEmbeddingService()
const result = await embSvc.embed(text, contentHash)
const batch  = await embSvc.embedBatch(texts, contentHashes)
```

### DriftAlertService (`lib/services/DriftAlertService.ts`)

Called in `process-scheduled/route.ts` after every cron batch:
```typescript
await driftAlertService.checkAndAlert(userId, driftResults)
```
Thresholds: `highThreshold: 60`, `criticalThreshold: 80`
Email via Resend. Stores in `COLLECTION_NOTIFICATIONS`.
Only alerts when threshold is CROSSED (not if already high) — no spam.

### DriftDecomposer (`lib/services/DriftDecomposer.ts`)

Called inside `calculateDriftScore()` in drift-analyzer.ts:
```typescript
const decomposed = DriftDecomposer.decompose({
  prev, curr, prevEmbeddings: vecMap, currEmbeddings: vecMap, topN
})
```
Returns: `contentDrift`, `competitorDrift`, `rerankDrift`, `dominantCause`,
full `breakdown` with URL lists. Shown in `DecomposedDriftChart`.

### AlgorithmUpdateDetector (`lib/services/AlgorithmUpdateDetector.ts`)

Called in `process-scheduled/route.ts` after alerts:
```typescript
const events = algorithmUpdateDetector.analyze(driftResults, queryMeta)
await algorithmUpdateDetector.persistEvents(userId, events)
```
Minimum 3 queries per category, 60% drift rate threshold.

### CoverageAndVersioning (`lib/utils/coverage-and-versioning.ts`)

Called in both `run/route.ts` and `process-scheduled/route.ts`:
```typescript
import { computeConfigHash, computeCoverageGap } from "@/lib/utils/coverage-and-versioning"

const configHash  = computeConfigHash(query)
const coverageGap = computeCoverageGap(numRequested, numReturned)
// Store both in snapshot.metadata
```
`checkConfigChange(prevHash, currHash)` detects parameter drift between
snapshots that would artificially inflate drift scores.

---

## 10. API Routes Reference

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/api/queries` | List user's queries | Session |
| POST | `/api/queries` | Create query | Session |
| GET | `/api/queries/[id]` | Get single query | Session + ownership |
| PUT | `/api/queries/[id]` | Update query | Session + ownership |
| DELETE | `/api/queries/[id]` | Delete query + all snapshots | Session + ownership |
| POST | `/api/queries/[id]/run` | Execute query → snapshot | Session + ownership |
| GET | `/api/snapshots` | List snapshots | Session |
| GET | `/api/snapshots/[id]` | Get single snapshot | Session + ownership |
| GET | `/api/analytics` | Analytics data | Session |
| POST | `/api/analytics/refresh` | Run all queries | Session |
| GET | `/api/drift/[queryid]` | Drift analysis | Session + ownership |
| GET | `/api/notifications` | Get alerts | Session |
| PATCH | `/api/notifications/read-all` | Mark all read | Session |
| PATCH | `/api/notifications/[id]/read` | Mark one read | Session |
| GET | `/api/analytics/algorithm-events` | Algorithm update events | Session |
| GET/POST | `/api/cron/process-scheduled` | Cron trigger | CRON_SECRET header |
| GET | `/api/weaviate` | Weaviate status | Session |
| POST | `/api/weaviate/sync-queries` | Sync queries to Weaviate | Session |
| POST | `/api/weaviate/search` | Semantic search | Session |

**Security pattern on every protected route:**
```typescript
export const GET = withEnhancedSecurity(handler, {
  rateLimit: { windowMs: 60_000, maxRequests: 30 },
  allowedMethods: ['GET'],
  logAttempts: true,
})
```
`userId` ALWAYS from `context.user.$id` — NEVER from request body/query.

---

## 11. Appwrite Collections

### queries
Standard fields + `schedule` (JSON), `filters` (JSON), `tags` (JSON)
Category stored as raw key (`"news"`) NOT display label (`"News"`)

### snapshots
`metadata` field (JSON string) now includes:
- `configHash` — 16-char hex of query param fingerprint
- `numRequested` — what you asked Exa for
- `numReturned` — what Exa gave back
- `coverageGap` — difference
- `coverageRate` — gap as %
- `coverageStatus` — "full" | "partial" | "sparse"

### notifications (NEW)
```
userId      string    required
queryId     string    required
queryName   string    required
driftScore  float     required
driftType   string    "high" | "critical"
change      float     required
read        boolean   default: false
createdAt   datetime  required
```
Indexes: `userId`, `read`, `createdAt DESC`

### algorithm_events (NEW)
```

`COLLECTION_ALGORITHM_EVENTS` defaults to `algorithm_events` for compatibility
with deployments created before the environment variable was documented.
userId           string    required
eventId          string    required
category         string    required
driftRate        float     required
avgDriftScore    float     required
severity         string    "minor" | "moderate" | "major"
description      string    required (generated from structured event at write time)
affectedCount    integer   required
affectedQueries  string    JSON array of query drift points
detectedAt       datetime  required
```
Indexes: `userId`, `detectedAt DESC`, `category`

Schema v2 preserves all fields above and adds optional first-class detector,
confidence, query-count, baseline, and window attributes plus
`thresholdsJson` (4096), `evidenceJson` (16384), and `confidenceJson` (8192).
`metricsJson` is intentionally omitted to stay within Appwrite attribute limits;
the reader reconstructs metrics from first-class fields and `evidenceJson`.
`userId` must remain because Appwrite's `$id` identifies a document, not its
owner, and event listing is scoped by `userId`. Run `npm run provision:algorithm-events-v2 -- --dry-run`
to inspect, then run it without `--dry-run` before deploying v2-writing code.
The migration never recreates the collection or modifies old documents.

During a staggered rollout the application checks attribute readiness. If v2
attributes are missing it writes the legacy payload and emits a warning rather
than failing scheduled processing. Production order is: provision attributes,
verify they are available, deploy application code, then verify a new document
has `schemaVersion=2` and `detectorVersion=2.0`.

Descriptions are generated from the structured event when written. Event documents use deterministic IDs
scoped by user, category, and UTC correlation-window bucket so repeated cron
runs update the same event rather than creating duplicates.

### embedding_cache (NEW — Appwrite, not Weaviate)
```
contentHash  string   required, UNIQUE INDEX
vector       string   JSON.stringify(float32[]) ≈ 5400 chars for 768-dim
storedAt     datetime required
```
Why Appwrite not Weaviate: free Weaviate plan = 1 collection only
(ExaRankingData already uses it).

---

## 12. Zustand Stores

### use-analytics-store
Holds `analytics`, `dataSource` ("appwrite" | "weaviate"), `isLoading`,
`fetchAnalytics()`, `setDataSource()`

### use-queries-store
Holds `queries[]`, `fetchQueries()`, `createQuery()`, `updateQuery()`,
`deleteQuery()`, `runQuery()`, `syncWithWeaviate()`

### use-snapshots-store
Holds `allSnapshots[]`, `fetchAllSnapshots()`, `checkAndRefreshIfEmpty()`
Also holds `useAvgResponseTimeImprovement` computed value

### weaviate-store
Holds `isConnected`, `dataSource`, `semanticInsights`, `enhancedMetrics`,
`connectionStatus`, `vectorsAvailable`, `getSemanticAnalytics()`,
`syncData()`, `syncQueries()`, `initializeWeaviateMode()`

---

## 13. Key Bugs Fixed

### Security
- **IDOR** — 10+ routes accepted userId from request body → all now use session
- **Race condition** — shared JWT singleton → per-request Client instances
- **Credential leak** — `console.log(jwt)` removed
- **jwtDecode misuse** — doesn't verify signatures, replaced with `account.get()`
- **Login-CSRF** — added Origin header validation to set-cookie route
- **CORS wildcards** — restricted to `NEXT_PUBLIC_APP_URL`

### Statistical correctness
- **`-220%` Content Efficiency** — unit mismatch (result-level changes ÷ pair-level count). Fixed: added `totalResultsCompared` field in same units as `totalContentChanges`
- **Fabricated p-values** — 3-bucket lookup that structurally could never produce p < 0.05 → `isStatisticallySignificant` was ALWAYS false. Fixed: real t-distribution CDF
- **`avgResponseTime` phantom field** — read from `analytics?.avgResponseTime` which never existed. Found in 3 separate components. All fixed to derive from `successRateByHour[].avgTime`
- **`averageCacheHitRate` mislabeled** — was actually "content identical rate". Fixed: real cache hit rate exposed, `contentStabilityRate` added as separate honest metric
- **Gemini model string** — `"gemini-embedding-2"` instead of `"gemini-embedding-2-preview"`. Fixed everywhere

### Category validation bug (query-service.ts)
- `createQuery` stored raw key `"news"`
- `updateQuery` mapped via `CATEGORY_MAP["news"]` → stored display label `"News"`
- Next `getQuery` returned `"News"` which failed `"News" in CATEGORY_MAP` check
- Fixed: `updateQuery` stores raw key, validated against CATEGORY_MAP

### Crash risks
- 15+ unguarded `.toFixed()` calls across components → `safeFixed()` helpers
- Missing `Array.isArray` guards on nearly every component
- `ResponsiveContainer` wrapping empty-state divs (Recharts structural issue)
- Array index keys instead of stable IDs
- All fixed systematically

### Import fixes
- `appwrite.ts` had `"use client"` → split into client SDK + `appwrite-server.ts`
- `query-service.ts` imported `ID, Query` from `"appwrite"` (browser) → `"node-appwrite"`

---

## 14. Known Limitations

| Limitation | Impact | Future fix |
|---|---|---|
| Weaviate free plan = 1 collection | Must use recordType discriminator | Upgrade plan → separate collections |
| `detectContentAnomalies` limit=1000 | Miss anomalies when >1000 results in range | Paginate the Weaviate query |
| `syncSnapshot` no duplicate guard | Retry storms could create duplicate vectors | Add idempotency check by snapshotId |
| WeaviateService has own embedding LRU | Vector cache not shared with EmbeddingService | Pass EmbeddingService into constructor |
| `getAllScheduledQueries` full table scan | Slow with many queries | Add `scheduleEnabled` indexed boolean |
| Embedding cache in Appwrite (not Redis) | Higher latency than in-memory | Add Redis/Upstash for hot path |
| `deleteQuery` snapshot deletion synchronous | Slow for queries with many snapshots | Background job / queue |

---

## 15. Testing Checklist

Run this exact sequence after every deploy:

**Step 1 — Snapshot metadata**
- Run any query manually from UI
- Check Appwrite `snapshots` collection
- Verify metadata has: `configHash`, `numRequested`, `numReturned`, `coverageGap`, `coverageStatus`

**Step 2 — Drift analysis**
- Open any query in Drift Radar with 2+ snapshots
- `DecomposedDriftChart` should render (content/competitor/rerank split)
- `CoverageGapChart` should render with real data
- No console errors
- `EmbeddingModeIndicator` in Sidebar shows "Gemini" with real cache %

**Step 3 — Alert system**
- Temporarily lower `DriftAlertService` thresholds to `highThreshold: 5`
- Run a query
- Check `notifications` collection for new document
- Check email (if RESEND_API_KEY set)
- Reset threshold back to 60

**Step 4 — Algorithm detector**
- Trigger cron manually:
  ```bash
  curl -X GET https://yourapp.com/api/cron/process-scheduled \
       -H "Authorization: Bearer $CRON_SECRET"
  ```
- Check `algorithm_events` collection after run
- Check Analytics → AI Insights → Algorithm Update Detector panel

**Step 5 — Notification bell**
- After step 3 creates a notification, bell should show red badge within 2 min
- Click notification → navigates to correct drift page

**Step 6 — Analytics page**
- Switch to AI mode → verify Response Time card shows real value (not "rs time")
- Export CSV → verify no broken columns
- Domain filter → verify filtering works

**Step 7 — Embedding fallback**
- Temporarily set `GEMINI_API_KEY=invalid`
- Run a query with drift comparison
- Verify: falls back to OpenAI, `EmbeddingModeIndicator` shows "OpenAI"
- Restore key

---

## 16. Deployment

### Vercel environment variables
All variables from §3 must be set in Vercel dashboard.
`APPWRITE_API_KEY` — server-only, no `NEXT_PUBLIC_` prefix.

### GitHub Actions cron
```yaml
# .github/workflows/process-scheduled-queries.yml
on:
  schedule:
    - cron: '*/30 * * * *'  # every 30 minutes
```
Required GitHub repo secrets: `APP_URL`, `CRON_SECRET`

### Manual cron trigger (testing)
```bash
curl -X GET https://yourapp.com/api/cron/process-scheduled \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Weaviate legacy schema issue
If you see `USAGE_LIMIT_EXCEEDED (429)`:
1. Check Weaviate console for extra classes
2. Run `scripts/delete-legacy-weaviate-classes.ts`
3. Re-initialize via `WeaviateService.initialize()`

---

## 17. Strategic Notes

### Product positioning
- **Don't build:** keyword research, backlinks, multi-engine, site audit
- **Do build next:** intent-drift detection, Exa `findSimilar()` competitive scoring, webhook integrations, drift API for third-party access

### Exa API behavior
- `numResults: 100` returns 64-87 results — this is NORMAL
- Exa races multiple indexes and applies relevance cutoff
- `coverageGap` metric tracks this over time — a widening gap = topic coverage decay
- Blog post "Canon" (April 2026) confirms this is by design

### Weaviate relationship
- Bob van Luijt (founder) replied to cold email — warm connection exists
- Follow-up email should: show working product, BQ+PQ usage depth, real drift numbers
- `docs/weaviate-schema.md` — keep updated, attach to outreach

### Embedding model
- `gemini-embedding-2-preview` is the ONLY correct model string
- Confirmed GA April 2026, 768-dim, documented endpoint
- Never use `gemini-embedding-2` (no `-preview`) — undefined behavior
- `text-embedding-3-small` with `dimensions: 768` — OpenAI fallback, same dimension space

### Category validation rule
- Always validate `category in CATEGORY_MAP` (key check, not value check)
- CATEGORY_MAP maps `"news"` → `"News"` — store the KEY not the VALUE
- Both `createQuery` and `updateQuery` must store the raw key
- If this breaks again: check query-service.ts updateQuery first

---

*Last updated: End of full audit session — all ~80 files reviewed*
*Session covered: security fixes, statistical correctness, UI crash risks,*
*5 new services, 5 new UI components, type system, folder structure*

## Relevance-Judgment Foundation (Phase 1)

Phase 1 adds only the strict domain, deterministic identity, and Appwrite schema foundation for future search-relevance evaluation. It does not add evaluation APIs, labeling UI, metrics, or detector integration.

### Relevance semantics

Authoritative `RelevanceJudgment` records use a three-level scale:

- `0` — not relevant
- `1` — relevant
- `2` — highly relevant

**Unjudged != irrelevant.** Grade `0` is an explicit human judgment. A result is unjudged when no accepted judgment exists. Accepted judgments require grade 0, 1, or 2; pending and conflicted judgments cannot expose an authoritative grade.

`UserFeedback` remains operational, multi-purpose feedback with its existing 1–5 rating and relevance/quality/freshness/authority dimensions. It is not ground truth and is not converted automatically. `RelevanceJudgment` is a separate evaluation-domain type with dataset-version, assessor, status, and provenance fields.

### Canonical URL policy v1

`CANONICALIZATION_VERSION` is `"1"`. The pure helper in `utils/canonicalize-document-url.ts`:

1. accepts only absolute HTTP(S) URLs and fails explicitly for invalid input;
2. normalizes identity URLs to HTTPS, lowercases the hostname, and removes default ports;
3. removes fragments;
4. retains `/` for the root and removes trailing slashes from non-root paths;
5. removes only `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`, `gclid`, `fbclid`, and `msclkid` (case-insensitive); and
6. preserves and deterministically sorts every remaining meaningful query parameter.

Any behavioral change requires a new canonicalization version. Raw URLs and content hashes remain provenance; neither is the primary identity. The document identity is:

```text
documentKey = SHA-256(canonicalUrl)
```

Judgment and benchmark-query keys are likewise deterministic SHA-256 tuple hashes. Snapshot records are not mutated.

### Evaluation collections

Phase 1 provisions three additive Appwrite collections using scalar IDs (no Appwrite relationship attributes):

- `evaluation_datasets` — dataset-version metadata and freeze metadata;
- `evaluation_queries` — frozen benchmark-query definitions; and
- `relevance_judgments` — unique query-document judgment state and bounded JSON provenance.

Required environment variables:

```dotenv
COLLECTION_EVALUATION_DATASETS=evaluation_datasets
COLLECTION_EVALUATION_QUERIES=evaluation_queries
COLLECTION_RELEVANCE_JUDGMENTS=relevance_judgments
```

The provisioning command also needs the existing Appwrite endpoint, project, database, and server API-key variables. Inspect safely without mutation:

```bash
npm run provision:evaluation-schema -- --dry-run
# --inspect is an equivalent non-mutating mode
```

Provision missing collections, attributes, and indexes:

```bash
npm run provision:evaluation-schema
```

The script is idempotent, reports existing/missing resources and schema mismatches, and never deletes collections, attributes, indexes, or documents. A mismatch fails for manual review rather than being repaired destructively.

## Evaluation Dataset Lifecycle (Phase 2)

Phase 2 adds owner-scoped dataset-version creation, listing/detail reads, server-authoritative benchmark query snapshotting, and frozen-version cloning. It intentionally does not add judgments, final freezing, labeling, or relevance metrics.

### Dataset families and versions

`familyKey` is the normalized, index-safe lineage shared by versions of one benchmark. A new family starts at version 1 in `draft` status. Version, status, owner/creator, timestamps, counts, and `canonicalizationVersion` are assigned server-side. The unique `familyKey + version` Appwrite index is the final concurrency guard. Clone allocation reads the highest family version and retries a version-creation conflict up to three times; it does not implement a distributed lock.

The initial ownership rule is deliberately simple: only `dataset.ownerUserId` may list/read the dataset, add queries, or clone it. Operational queries must be owned by the same authenticated user.

### Operational query snapshotting

Clients submit only operational query IDs. The server loads each authoritative `QueryConfig` and freezes the query text, category, include/exclude domains, date filters, result count, and the existing `computeConfigHash()` value into `evaluation_queries`. Schedule and tags are not copied because they do not affect retrieval. `computeConfigHash()` keeps its existing semantics (result-affecting configuration but not query text); reproducibility requires both the separately frozen `queryText` and `configHash`.

`sourceQueryId` is provenance only. Editing or deleting the operational query does not mutate or delete the benchmark copy. Membership is idempotent through:

```text
queryKey = SHA-256(datasetVersionId + "\n" + sourceQueryId)
```

Example:

```text
Operational query:
"latest vector database filtering research"

        ↓ add to benchmark

EvaluationQuery v1
queryText frozen
filters frozen
numResults frozen
configHash frozen

        ↓ operational query later edited

EvaluationQuery v1 remains unchanged
```

### Clone behavior

Only a dataset already stored as `frozen` can be cloned. The new version:

- keeps the family key;
- uses the next available version;
- records `parentVersionId`;
- starts as a draft with zero judgments/conflicts;
- uses the current canonicalization policy version; and
- copies benchmark query records from the parent, not mutable live queries.

New query keys are generated because the dataset-version ID changes. Judgments are not copied in Phase 2.

### Readiness and final freeze

Dataset detail responses include `QueryFoundationReadiness`. `queryFoundationReady` validates that queries exist, counts agree, IDs are scoped to the dataset, conflicts are absent, and the canonicalization version is present. `fullEvaluationFreezeReady` is always `false` in Phase 2, with pending phases listed explicitly. No `/freeze` endpoint is provided: final freezing requires the future judgment/conflict lifecycle and must not be simulated early.

### Phase 2 routes

- `GET /api/evaluation/datasets` — owner-scoped summaries with status/family filters and bounded pagination.
- `POST /api/evaluation/datasets` — create version 1 from safe name/description/family input.
- `GET /api/evaluation/datasets/[id]` — owner-scoped metadata, benchmark queries, and readiness.
- `POST /api/evaluation/datasets/[id]/queries` — add up to 50 operational query IDs using server-side snapshots.
- `POST /api/evaluation/datasets/[id]/clone` — clone a frozen version into the next draft.

Phase 2 does not implement `RelevanceJudgmentService`, feedback promotion, adjudication, judgment-aware freezing, UI, metrics, analytics, drift, detector, or algorithm-event integration.

## Authoritative Relevance Judgments (Phase 3)

Phase 3 adds the owner-curated judgment backend while intentionally leaving labeling UI, metrics, feedback promotion, and final dataset freezing for later phases. Relevance uses the evaluation-only scale `0 = not relevant`, `1 = relevant`, and `2 = highly relevant`; operational `UserFeedback` stars and expected positions remain separate and are never converted automatically.

### Direct labels, conflicts, and adjudication

The dataset owner is the initial curator. A valid direct label against a result in a compatible snapshot is accepted immediately, with the grade, assessor, acceptance identity, and timestamps assigned server-side. Future metric code must read only `accepted` judgments. Submitting a different grade for the same evaluation-query/document identity preserves both assessments, changes the judgment to `conflicted`, clears its authoritative grade and acceptance metadata, and blocks judgment readiness until the owner adjudicates it. Conflict adjudication requires an explicit final 0/1/2 grade and rationale; it preserves all prior assessments and appends the curator's decision.

```text
Query: "best vector database for filtered search"

Result A
assessor 1 → grade 2

Judgment: status = accepted, grade = 2

Later proposal → grade 0
Judgment: status = conflicted, grade = null

Curator adjudicates → final grade = 1
Judgment: status = accepted, grade = 1

All historical assessments remain preserved.
```

An assessment is idempotent by assessor, proposed grade, snapshot, optional feedback source, and canonical document key. Repeating that exact action does not append history; distinct snapshot provenance for the same grade is retained. Assessments and provenance arrays are deduplicated and bounded to match the provisioned Appwrite JSON capacities rather than being allowed to grow without limit.

### Snapshot provenance policy

The server derives canonical URL policy v1 identity, `documentKey`, and `judgmentKey` from the actual stored snapshot result. It verifies snapshot ownership, source-query identity, and result membership. When a snapshot contains `metadata.configHash`, it must equal the frozen `EvaluationQuery.configHash`; a mismatch is rejected. Older snapshots without a stored config hash remain labelable because their absence cannot be compared reliably. Raw URLs, snapshot IDs, domains, and content hashes are retained as provenance but are not relevance truth.

`judgmentCount` is reconciled to the number of accepted authoritative records, while `conflictCount` is reconciled to conflicted records. Dataset detail readiness now distinguishes query-foundation readiness from judgment-foundation readiness and reports accepted/conflicted consistency. `fullEvaluationFreezeReady` remains false because Phase 3 does not implement final freeze or judgment-copy policy.

### Phase 3 routes

- `PUT /api/evaluation/datasets/[id]/queries/[evaluationQueryId]/judgments` — submit up to 50 safe `{ resultUrl, grade, rationale? }` labels for one owner-scoped snapshot/query.
- `GET /api/evaluation/datasets/[id]/queries/[evaluationQueryId]/judgments` — return judgments and accepted/pending/conflicted progress counts for one benchmark query.
- `POST /api/evaluation/datasets/[id]/judgments/[judgmentId]/adjudicate` — resolve an owner-scoped conflict with a final grade and required rationale.

Phase 3 does not add a labeling UI, promote feedback, clone judgments, freeze datasets, calculate nDCG/Recall/MRR/Precision/Hit Rate, mine hard negatives, or integrate relevance into drift and detector events.

## Evaluation Workspace and Final Freeze (Phase 4)

`/evaluation` is the controlled benchmark workspace. It is intentionally separate from `/feedback`: Feedback remains operational 1–5 user opinion, while Evaluation records owner-curated, authoritative 0/1/2 judgments (`0 = not relevant`, `1 = relevant`, `2 = highly relevant`). No feedback record is converted automatically.

The dataset list creates version-1 families and shows owner-scoped version, status, query, accepted-judgment, conflict, and readiness summaries. A dataset workspace can add operational queries to a draft, select a frozen benchmark query, choose one of its owner-scoped snapshots, stage several labels locally, and save them as one bounded batch. Snapshots with a matching stored `configHash` are marked verified; legacy snapshots without a hash are shown as **Compatibility not verifiable**. Known mismatches are excluded by the UI and remain authoritatively rejected by the server.

Accepted, conflicted, and unjudged results are displayed distinctly—unjudged never means grade 0. Conflict review preserves every assessment and lets the owner submit a final 0/1/2 grade with a required rationale. These controls become read-only for frozen datasets.

### Final freeze

`POST /api/evaluation/datasets/[id]/freeze` reloads authoritative queries and judgments and recalculates readiness server-side. It requires a draft with queries, consistent query/judgment/conflict counts, no orphan records, no conflicts, valid accepted grades, and at least one accepted judgment for every benchmark query. A successful freeze assigns `status = frozen`, `frozenAt`, and `frozenByUserId` on the server. Frozen query membership, labels, and adjudication are immutable; reads and the existing clone action remain available. Changes require **Create New Version**, which copies the frozen query definitions into a new draft and intentionally starts with no judgments.

Readiness remains explicit:

- `queryFoundationReady` validates the frozen query foundation;
- `judgmentFoundationReady` validates authoritative judgment coverage and consistency; and
- `fullEvaluationFreezeReady` is true only when every final-freeze rule passes.

Failed readiness includes human-readable blocker reasons used by the UI. The freeze confirmation explains immutability before submission.

```text
Create benchmark v1
        ↓
Add 20 operational queries
        ↓
Select snapshots
        ↓
Label results 0/1/2
        ↓
Resolve conflicts
        ↓
Readiness passes
        ↓
Freeze v1
        ↓
v1 is immutable
        ↓
Need changes?
Clone → v2 draft
```

Phase 4 adds `POST /api/evaluation/datasets/[id]/freeze` and the `/evaluation` pages. It still does not calculate nDCG, Recall, MRR, Precision, Hit Rate, relevance deltas, hard negatives, reranker comparisons, or relevance-aware drift.

## Search Relevance Metric Engine (Phase 5)

Phase 5 adds deterministic, on-demand evaluation of explicit snapshots against a frozen dataset version. `EVALUATION_METRIC_VERSION = "1"` pins grade semantics, `2^grade - 1` gain, grade `>= 1` relevance, preservation of unjudged rank positions, highest-ranked-only canonical duplicate handling, benchmark-relative recall, judged-only precision denominators, and unweighted macro aggregation. Changing any of these semantics requires a new metric policy version.

The engine calculates generic positive-integer cutoffs, with `5` and `10` as UI/API defaults:

- **nDCG@K** uses graded gain and logarithmic discount. It is unavailable without accepted relevant benchmark truth.
- **Benchmark Recall@K** is retrieved accepted relevant benchmark documents divided by all known accepted relevant documents for the evaluation query. It is not exhaustive web recall.
- **Judged Precision@K** is accepted relevant divided by all accepted judged results in the top K. Unjudged results are excluded from this denominator, never treated as grade 0.
- **Judgment Coverage@K** is accepted judged results divided by unique evaluated results in the top K.
- **Reciprocal Rank / MRR** uses the original rank of the first accepted relevant result; no retrieved relevant result contributes zero.
- **Hit@K** is one when an accepted relevant result occurs inside K and zero otherwise.

`POST /api/evaluation/datasets/[id]/metrics` accepts cutoffs and explicit `{ evaluationQueryId, snapshotId }` selections. The server verifies owner, frozen status, query membership, snapshot ownership/source/config compatibility, judgment scope and canonical identity, then loads relevance truth itself. Legacy snapshots without `configHash` are allowed with a warning. Canonical duplicate results retain the first occurrence and ignore later occurrences without collapsing the original rank positions.

Responses contain per-query metrics/counts/warnings, explicit selected snapshot IDs, macro aggregates, eligible/skipped counts, metric policy version, and `persisted: false`. Metric runs and relevance deltas remain intentionally unpersisted/deferred; judgment documents are not overloaded with metric output. Relevance-aware drift, hard negatives, reranker comparisons, detector integration, feedback promotion, and training exports are not part of Phase 5.

## Persisted Evaluation Runs and Metric History (Phase 6)

Phase 6 adds immutable `EvaluationRun` history without changing Phase 5 formulas. `POST /metrics` remains an on-demand preview. `POST /runs` accepts only cutoffs and explicit query/snapshot selections, invokes the same Phase 5 `EvaluationMetricsService` on the server, and persists its exact output. Clients never submit metrics, warnings, eligibility, or a metric-policy version.

Authoritative runs require a frozen, owner-scoped dataset. Every run receives a new Appwrite ID, even when its inputs match a previous execution, because execution time is part of the audit history. There are no update or delete APIs. A correction or later observation creates another immutable run.

### Storage layout

Two additive Appwrite collections keep payload sizes bounded:

- `evaluation_runs` stores the run header, dataset family/version, Metric Policy version, cutoffs, exact snapshot-selection map, aggregate output, warning summary, counts, creator, and timestamp.
- `evaluation_run_queries` stores one bounded Phase 5 `PerQueryEvaluationResult` document per selected query.

A single JSON payload could exceed the configured 32 KiB string boundary when evaluating up to 100 queries. Splitting query results prevents that growth while keeping list reads small: run summaries read only `evaluation_runs`, and detail reads join immutable query records by `runId`. The provisioning script remains additive, idempotent, inspectable with `--dry-run`/`--inspect`, mismatch-reporting, and non-destructive.

Required collection variables:

```dotenv
COLLECTION_EVALUATION_RUNS=evaluation_runs
COLLECTION_EVALUATION_RUN_QUERIES=evaluation_run_queries
```

### APIs and UI

- `POST /api/evaluation/datasets/[id]/runs` — recalculate and save one completed authoritative run.
- `GET /api/evaluation/datasets/[id]/runs?limit=20&offset=0` — newest-first, dataset-version-scoped summaries.
- `GET /api/evaluation/datasets/[id]/runs/[runId]` — full provenance, aggregate, per-query results, and warnings.

Frozen dataset workspaces retain **Run Evaluation** for previews and add **Save This Run**, which sends only the current cutoffs and explicit selections. **Evaluation History** displays lightweight summaries and loads full immutable detail on demand. Same `datasetVersionId` plus same `metricVersion` establishes comparable benchmark truth for a future phase; different dataset versions may contain changed queries or judgments and must not be treated as directly comparable.

```text
Frozen Dataset v1
        ↓
Run A — Aug 18
nDCG@10 = 0.74

        ↓ later

Run B — Aug 20
nDCG@10 = 0.66

Both:
datasetVersionId = same
metricVersion = 1

Therefore Phase 7 can safely calculate:

ΔnDCG@10 = -0.08
```

Phase 6 stores the provenance needed for this comparison but does not calculate the delta. Metric deltas, compatibility scoring, before/after UI, and relevance-aware drift remain Phase 7 work.
