# Naukri + Glassdoor test suites

Drop-in for `rahulbhattsd/Auto-Apply`. Copy the tree over the repo root — paths already match.

These tests are the **spec**. The `src/` files shipped here are stubs that throw
`NOT_IMPLEMENTED`, so the suites go **red on purpose**. Hand one file at a time to
Antigravity and let it make the tests pass. That's the whole workflow.

## What's here

```
packages/providers/core/
  PATCH.md                     three small edits you must apply by hand
  src/questions.ts             shared screening-question mapping (stub)
  src/rateBudget.ts            daily caps, active window, jitter (stub)
  src/session.ts               AES-256-GCM session sealing (stub)
  src/testing/fakePage.ts      Playwright test doubles — no browser, no network
  src/testing/conformance.ts   suite every provider must pass
  tests/questions.test.ts      48-row golden table + tier-1/2/3 answer rules
  tests/rateBudget.test.ts     caps, IST window boundaries, delay randomness
  tests/session.test.ts        round-trip, tamper detection, log redaction

packages/providers/naukri/
  src/selectors.json           every DOM selector, versioned
  src/pageClassifier.ts        pure html -> what to do (stub)
  src/searchParser.ts          search JSON + detail page -> CanonicalJob (stub)
  src/NaukriProvider.ts        JobProvider impl (stub)
  __fixtures__/*.html          8 synthetic fixtures — REPLACE THESE
  tests/pageClassifier.test.ts internal / external / applied / walk-in / captcha / logged-out
  tests/searchParser.test.ts   payload parsing, experience ranges, dedupe keys
  tests/apply-outcomes.test.ts every ApplyOutcome branch, page-leak + cookie-leak guards
  tests/selectors.test.ts      selector contract + drift canary  [PASSES TODAY]
  tests/conformance.test.ts    runs the shared conformance suite

packages/providers/glassdoor/
  src/selectors.json, src/pageClassifier.ts, src/GlassdoorProvider.ts   (stubs)
  __fixtures__/*.html          5 synthetic fixtures — REPLACE THESE
  tests/pageClassifier.test.ts easy-apply vs employer-site vs Cloudflare vs login wall
  tests/capabilities.test.ts   honest-capability tests + apply branches
  tests/no-live-network.test.ts guard: no test may launch a browser or hit the network
  tests/conformance.test.ts

scripts/record-fixtures.ts     manual recorder for real HTML
```

## Setup

1. Apply `packages/providers/core/PATCH.md` — adds `'glassdoor'` to `ProviderId`, exports
   the `testing/*` helpers, re-exports the new core modules. Nothing compiles without it.
2. `pnpm install` (the two new packages are picked up by the existing
   `packages/providers/*` workspace glob).
3. `pnpm --filter @autoapply/providers-naukri test` → red, with `NOT_IMPLEMENTED` messages
   naming exactly what to build.

## Fixtures

The committed fixtures are **synthetic**. They exercise the logic correctly but their class
names are invented — real Naukri class hashes (`styles_jd-header-title__rZwM1`) rotate on
every deploy, and I can't read a logged-in page.

Record real ones once:

```
pnpm tsx scripts/record-fixtures.ts naukri
pnpm tsx scripts/record-fixtures.ts glassdoor
```

Then update `selectors.json` and re-run `tests/selectors.test.ts`. **Strip your name, email,
phone and any token values from a recording before committing it** — fixtures are public.

## Two things the tests encode that are easy to get wrong

**The model never authors a fact.** `answerQuestion` lets an LLM map an unseen phrasing onto
a canonical key, but the value always comes from the user's AnswerBank. There's a test that
loops over every high-stakes key (CTC, notice period, experience, graduation year) and asserts
an empty bank yields `UNANSWERABLE` even when the classifier returns confidence 1.0. A wrong
CTC on a real application is worse than no application.

**No confirmation means not applied.** Several tests assert `APPLIED` is impossible without a
screenshot or HTML snapshot as proof, and that a missing confirmation element yields
`CONFIRMATION_NOT_FOUND`. Your README already states this rule — these make it enforceable.

## Glassdoor, honestly

Glassdoor is a worse target than Naukri and the tests reflect it:

- Most listings are **not** Easy Apply — they redirect to the employer's ATS. The provider's
  job is mostly to extract that URL and hand off to `ats-generic`, which you already have working.
  There's a test asserting the handed-off URL is a real ATS domain, not a glassdoor.com page.
- Glassdoor exposes no reliable applied-state marker, so `capabilities.verifyApplied` is
  `false` and `verifyApplied()` must not return `VERIFIED`. A test enforces that.
- Cloudflare interstitials are common, so that branch is `CAPTCHA` → `NEEDS_HUMAN`, never a retry loop.

If you're picking one to build first, build Naukri. Glassdoor's realistic ceiling is
"discovery + handoff", which the ATS adapters already cover from other sources.

## CI

Add to the provider packages' CI step:

```
pnpm --filter "@autoapply/providers-*" test
```

`tests/no-live-network.test.ts` fails the build if any test file launches Chromium or makes
an HTTP call. Keep it. One live request from CI is how a Naukri account gets flagged.
