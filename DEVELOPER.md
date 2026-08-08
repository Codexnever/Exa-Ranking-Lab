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
`thresholdsJson` (4096), `evidenceJson` (16384), `confidenceJson` (8192), and
`metricsJson` (8192). Run `npm run provision:algorithm-events-v2 -- --dry-run`
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
