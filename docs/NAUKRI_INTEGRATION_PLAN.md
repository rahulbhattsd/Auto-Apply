# AutoApply → Naukri.com Integration Plan

Agent brief for Antigravity (Claude Sonnet). Drop this at `docs/NAUKRI_INTEGRATION_PLAN.md` and work phase by phase. **Do not run all phases in one agent session.** Each phase below is one scoped task with its own acceptance criteria.

Repo context: pnpm + Turborepo monorepo. `apps/` (web: React+Vite+TS, api: Fastify+TS), `workers/` (discovery, analysis, resume, application, verification, notification), `packages/`, `prisma/`, Postgres + Prisma, Redis + BullMQ, Playwright, Groq.

---

## 0. Read this before writing code

Three constraints shape every decision below.

**Naukri has no public job-seeker API.** The site is a React SPA talking to an internal JSON API (`/jobapi/v3/...`) that requires per-request headers generated in client-side JS (`appid`, `systemid`, a rotating `nkparam`-style token) plus a logged-in cookie jar. Reproducing those headers in plain `fetch` breaks on every rotation. **Therefore: all Naukri network calls go through a live Playwright browser context**, either as page navigation or as `context.request` calls made *from* the authenticated page so the browser attaches its own headers/cookies. Never hand-roll the auth headers.

**Naukri's terms prohibit automated access.** The realistic failure mode is not legal — it is the user's own Naukri account getting flagged, rate-limited, or suspended, which destroys the whole value of the tool. Design accordingly: one account = one user's own account, human-supervised login, low daily caps, no parallelism per account, hard stop on anomalies.

**Therefore the product shape changes.** Do not build "fire and forget, apply to 200 jobs overnight." Build **assisted apply**: discovery and ranking run automatically, the user approves a shortlist in the dashboard, and the worker executes a small quota (default 15–25/day) with full evidence capture. This is both safer and measurably more effective than blind blasting — Naukri recruiters filter on profile-match, not application volume.

---

## 1. Architecture change: providers, not a fork

Do **not** fork the application worker into a Naukri copy. Introduce a provider abstraction so Naukri, LinkedIn, Indeed and direct-ATS all sit behind one interface.

Create `packages/providers/` with:

```
packages/providers/
  core/           # interfaces + canonical models + registry
  naukri/         # Naukri implementation
  ats-generic/    # existing Greenhouse/Lever/etc. logic moved here
```

### 1.1 The interface (`packages/providers/core/src/types.ts`)

```ts
export type ProviderId = 'naukri' | 'linkedin' | 'ats-generic';

export interface JobProvider {
  id: ProviderId;
  capabilities: {
    search: boolean;
    recommendedFeed: boolean;
    internalApply: boolean;     // apply without leaving the platform
    externalHandoff: boolean;   // "Apply on company site"
    verifyApplied: boolean;
  };

  search(ctx: ProviderCtx, q: SearchQuery): Promise<RawJobRef[]>;
  fetchDetail(ctx: ProviderCtx, ref: RawJobRef): Promise<CanonicalJob>;
  apply(ctx: ProviderCtx, job: CanonicalJob, profile: ApplyProfile): Promise<ApplyOutcome>;
  verifyApplied(ctx: ProviderCtx, job: CanonicalJob): Promise<VerifyOutcome>;
}

export interface ProviderCtx {
  userId: string;
  browser: BrowserContext;       // already authenticated
  logger: Logger;
  budget: RateBudget;            // see §5
  abortSignal: AbortSignal;
}

export type ApplyOutcome =
  | { status: 'APPLIED'; evidence: Evidence }
  | { status: 'ALREADY_APPLIED' }
  | { status: 'HANDOFF_EXTERNAL'; url: string }      // pass to ats-generic
  | { status: 'NEEDS_HUMAN'; reason: NeedsHumanReason; evidence: Evidence }
  | { status: 'FAILED'; reason: string; retryable: boolean };

export type NeedsHumanReason =
  | 'CAPTCHA' | 'OTP_REQUIRED' | 'SESSION_EXPIRED'
  | 'UNANSWERABLE_QUESTION' | 'UNKNOWN_UI' | 'CONFIRMATION_NOT_FOUND';
```

`Evidence` = `{ screenshotKey, htmlSnapshotKey, url, timestamp }`. Every terminal outcome captures evidence. This is what makes the system debuggable when Naukri changes its DOM — which it will.

**Acceptance for Phase 1:** existing ATS flow still passes all tests after being moved behind `ats-generic`; `pnpm typecheck && pnpm test && pnpm build` green; no behaviour change.

---

## 2. Session and credential handling

This is the part most auto-apply projects get wrong. Naukri login is email/password **plus** frequent OTP, and the session is fingerprint-bound.

### 2.1 Never store the password if you can avoid it

Preferred flow — **manual first login, reused session**:

1. User clicks "Connect Naukri" in the dashboard.
2. API enqueues a `SESSION_BOOTSTRAP` job. The application worker launches a headful (or remote-viewable, via CDP + noVNC/`playwright --ui`) Chromium with a **persistent user-data-dir** for that user.
3. User logs in themselves, including OTP. No credential ever touches your DB.
4. Worker dumps `context.storageState()` → encrypt → store.
5. Subsequent runs restore `storageState` into a context that keeps the same user agent, locale (`en-IN`), timezone (`Asia/Kolkata`), viewport and device scale. Fingerprint drift is the #1 cause of silent session invalidation.

If you must support headless password login later, gate it behind an explicit user opt-in and treat OTP as `NEEDS_HUMAN`.

### 2.2 Encryption

- Envelope encryption: AES-256-GCM per-record data key, wrapped by a master key from env (`SESSION_MASTER_KEY`, 32 bytes, base64).
- Store ciphertext + IV + auth tag + key version. Never log the plaintext, never return it over the API, redact it in Pino (`redact: ['*.storageState', '*.cookies', 'req.headers.cookie']`).

### 2.3 Session health

Add a cheap `probeSession()` that loads `https://www.naukri.com/mnjuser/profile` and checks for a logged-in marker. Run it:
- before any batch of applies,
- on any `403`/redirect-to-login mid-run.

On failure → mark `ProviderAccount.status = 'REAUTH_REQUIRED'`, pause that user's queue, fire a notification. Do **not** retry-loop into a lockout.

**Acceptance for Phase 2:** user can connect an account, disconnect it, and see status (`CONNECTED` / `REAUTH_REQUIRED` / `DISCONNECTED`) in the UI; storage state round-trips through encryption; nothing sensitive appears in logs.

---

## 3. Prisma schema additions

```prisma
model ProviderAccount {
  id             String   @id @default(cuid())
  userId         String
  provider       String                 // 'naukri'
  status         String                 // CONNECTED | REAUTH_REQUIRED | DISCONNECTED
  sessionBlob    Bytes?                 // encrypted storageState
  sessionIv      Bytes?
  sessionTag     Bytes?
  keyVersion     Int      @default(1)
  fingerprint    Json?                  // UA, viewport, tz, locale — must stay stable
  lastProbedAt   DateTime?
  user           User     @relation(fields: [userId], references: [id])
  @@unique([userId, provider])
}

model Job {
  // ... existing
  provider       String
  providerJobId  String
  @@unique([provider, providerJobId])   // dedupe across discovery runs
}

model ApplicationAttempt {
  id             String   @id @default(cuid())
  applicationId  String
  provider       String
  status         String                 // APPLIED | NEEDS_HUMAN | FAILED | ALREADY_APPLIED
  reason         String?
  screenshotKey  String?
  htmlKey        String?
  requestPath    Json?                  // step trace for debugging
  createdAt      DateTime @default(now())
}

model AnswerBank {
  id        String @id @default(cuid())
  userId    String
  key       String                      // canonical question key, see §4.2
  value     String
  source    String                      // USER | INFERRED
  updatedAt DateTime @updatedAt
  @@unique([userId, key])
}

model RateBudget {
  id            String   @id @default(cuid())
  userId        String
  provider      String
  windowDate    String                  // YYYY-MM-DD, Asia/Kolkata
  appliesUsed   Int      @default(0)
  searchesUsed  Int      @default(0)
  @@unique([userId, provider, windowDate])
}
```

Write a migration, don't edit an applied one.

---

## 4. The Naukri provider itself

### 4.1 Discovery

Two sources, both through the authenticated context:

1. **Search** — drive `https://www.naukri.com/<slug>-jobs...` or the SPA's search XHR via `context.request.get(...)` initiated after a real page load so cookies/headers are attached. Parse the JSON payload (`jobDetails[]`) rather than the DOM when available; fall back to DOM cards if the payload shape changes.
2. **Recommended jobs** — `mnjuser/recommendedjobs`. Higher signal-to-noise than keyword search because Naukri already matched it against the profile.

Normalize to `CanonicalJob`: `{ providerJobId, title, company, locations[], experienceMin/Max, salaryText, postedAt, jdText, applyType, applyUrl }`.

`applyType` is the critical field. Detect it on the detail page:
- **internal apply** — the apply button posts within Naukri.
- **external** — button label/behaviour redirects off-domain ("Apply on company site").
- **walk-in / contact-recruiter** — not applicable, mark `SKIPPED`.

**Put every selector in a versioned config file**, `packages/providers/naukri/selectors.json`, with a `schemaVersion`. When Naukri ships a redesign, the fix is a config PR, not a refactor. Ship a daily canary job that opens one known job page, asserts each selector resolves, and alerts on drift.

### 4.2 Internal apply — the questionnaire is the hard part

Naukri's one-click apply frequently drops into a chatbot-style questionnaire (notice period, current CTC, expected CTC, preferred location, years of experience, willingness to relocate, free-text screening questions).

Three-tier answering, in order:

**Tier 1 — deterministic map.** Normalize the question text (lowercase, strip punctuation, collapse whitespace) and match against a rules table of canonical keys:

```
notice_period, current_ctc, expected_ctc, total_experience,
relevant_experience, current_location, preferred_locations,
willing_to_relocate, highest_qualification, graduation_year,
current_employer, current_designation, work_auth
```

Answers come from `AnswerBank`. For a fresher: `current_ctc = "0"`, `notice_period = "Immediate"`, `total_experience = "0"`. Seed these during onboarding — a one-time form in the dashboard. This tier should cover 80%+ of real questions.

**Tier 2 — LLM classification, not LLM invention.** Unmatched question → Groq call that returns **only** `{ canonicalKey | null, confidence }`, mapping the question to an existing key. The answer value still comes from `AnswerBank`. The model never authors a factual claim about the user.

**Tier 3 — free-text.** For genuine open questions ("why do you want this role?"), generate from the user's profile + JD with an explicit constraint: no facts not present in the profile. Then: if `requireApprovalForFreeText` is on (default **on**), stop and mark `NEEDS_HUMAN` with the drafted answer attached for one-tap approval.

**Anything unresolved at any tier → `NEEDS_HUMAN`. Never guess on CTC, notice period, or experience.** A wrong number on a real application is worse than no application.

### 4.3 Resume nuance — read this carefully

On **internal** Naukri apply, the resume sent is the one attached to the Naukri profile. Your per-job tailored resume generation does **not** apply to that path.

So:
- **External handoff** → tailored resume/cover letter (existing resume worker, unchanged).
- **Internal apply** → the profile resume is used. Optionally support "profile resume refresh" as an explicit, rate-limited action (at most once per N days, user-triggered). Do not rewrite the profile resume per job — it is a shared global object and churning it looks automated.

Make this visible in the UI so the user isn't surprised about which resume went out.

### 4.4 Verification

After an internal apply: re-open the job page and assert the applied state, or check the *Applied* list under My Naukri. If no confirmation → `CONFIRMATION_NOT_FOUND` → `NEEDS_HUMAN`. The existing README rule ("never pretend submission succeeded") is the right rule; keep it.

**Acceptance for Phase 4:** against recorded fixtures, the provider classifies apply type correctly, maps a fixture questionnaire to canonical keys, and produces `NEEDS_HUMAN` with evidence on an unknown question. Zero live-site calls in CI.

---

## 5. Pacing, quotas, circuit breaking

Wire into the existing Worker Supervisor / Circuit Breaker.

| Control | Default |
|---|---|
| Applies per user per day | 20 (hard cap 40, configurable) |
| Concurrency per provider account | **1** — never parallelise one account |
| Delay between applies | 45–180 s, randomised |
| Delay between page interactions | 300–1800 ms, randomised, plus realistic typing delay |
| Active window | 09:00–22:00 Asia/Kolkata |
| Searches per hour | 12 |
| Backoff on 429/403 | exponential, 2 min → 60 min, max 5 tries |
| Circuit open | 3 consecutive `UNKNOWN_UI` or any CAPTCHA → pause account 24 h, notify |

Enforce the daily cap in Postgres (`RateBudget`) not Redis — it must survive a Redis flush. Check the budget both at enqueue time and at job start.

Use `playwright-extra` + stealth plugin, a stable realistic UA matching the Chromium build, `locale: 'en-IN'`, `timezoneId: 'Asia/Kolkata'`, and a fixed viewport per account. Do not rotate proxies or user agents per request — inconsistency is more detectable than a boring stable session.

---

## 6. API and UI surface

New Fastify routes (all behind existing JWT + CSRF + tenant isolation):

```
POST   /api/providers/naukri/connect        -> starts SESSION_BOOTSTRAP, returns bootstrap session id
GET    /api/providers/naukri/status
DELETE /api/providers/naukri/disconnect
POST   /api/answer-bank                     -> upsert canonical answers
GET    /api/answer-bank
GET    /api/jobs?provider=naukri&status=... -> discovered + ranked
POST   /api/applications/:id/approve        -> moves to APPROVED, worker picks up
POST   /api/applications/:id/resolve        -> answer a NEEDS_HUMAN question
GET    /api/applications/:id/evidence       -> signed URL to screenshot/HTML
```

Frontend additions on the existing routes:
- `/settings` → Connect Naukri card + session status + daily quota slider.
- `/settings` → Answer Bank form (the fresher fields from §4.2).
- `/tasks` → review queue: shortlist to approve, and a `NEEDS_HUMAN` inbox showing the screenshot next to the unanswered question.
- SSE already exists — stream apply progress into the review queue.

---

## 7. Testing

- **No live Naukri in CI. Ever.** Record fixtures once, manually: HTML snapshots of a search page, an internal-apply job page, an external-apply job page, and a questionnaire modal. Commit them to `packages/providers/naukri/__fixtures__/`.
- Unit: question normalizer + canonical key mapper (golden table, ~40 phrasings).
- Unit: apply-type classifier against the three page fixtures.
- Integration: Playwright against a local static server serving the fixtures.
- Contract: `ats-generic` and `naukri` both satisfy the same `JobProvider` conformance suite.
- Canary (manual/cron, not CI): selector drift check, one page, once a day.

---

## 8. Phase order for Antigravity

Run these as separate agent tasks. Commit and verify between each.

| Phase | Task | Done when |
|---|---|---|
| 1 | Extract `JobProvider` interface; move existing ATS logic into `packages/providers/ats-generic` | Existing tests green, no behaviour change |
| 2 | Prisma migration for `ProviderAccount`, `AnswerBank`, `RateBudget`, `ApplicationAttempt`, `Job` dedupe | `pnpm db:migrate` clean; round-trip test |
| 3 | Session bootstrap + envelope encryption + `probeSession` | Connect/disconnect works end to end; logs redacted |
| 4 | Naukri discovery (search + recommended) → `CanonicalJob`, selectors in config | Fixture tests pass; jobs land deduped in DB |
| 5 | Answer Bank: schema, onboarding form, normalizer, canonical key mapper | Golden mapper test passes |
| 6 | Internal apply state machine + evidence capture + verification | Fixture-driven Playwright test passes all outcome branches |
| 7 | External handoff → `ats-generic` | External job routes through old path correctly |
| 8 | Rate budget, jitter, circuit breaker wiring | Cap enforced across restart; breaker trips in test |
| 9 | Review queue UI + `NEEDS_HUMAN` inbox + SSE | Approve → apply → evidence visible in UI |
| 10 | Selector canary + Prometheus metrics + DLQ routing | Metrics exposed; drift alert fires on a broken fixture |

---

## 9. Metrics worth having

`naukri_apply_total{outcome}`, `naukri_questionnaire_unmapped_total{question_hash}`, `naukri_session_reauth_total`, `naukri_selector_miss_total{selector}`, apply latency histogram, daily budget utilisation gauge.

`naukri_questionnaire_unmapped_total` is the important one — it tells you exactly which questions to add to the rules table next, and it's how the answer coverage improves over time.

---

## 10. Standing instructions for the coding agent

- One phase per session. Do not start Phase N+1 in the same run.
- Never commit a real cookie, storage state, token, or `.env`.
- No live requests to naukri.com from tests or from `generate_all.sh`.
- Every new external interaction gets an evidence capture and a `NEEDS_HUMAN` branch before it gets a happy path.
- Selectors go in `selectors.json`, never inline in TS.
- If a question about the user's factual data (CTC, notice period, experience) cannot be answered from `AnswerBank`, stop — do not infer, do not let the LLM author it.
- Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build` before declaring a phase done.
