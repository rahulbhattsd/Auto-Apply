# Phase 1: Audit and Architecture Report

## 1. End-to-End Execution Flow
1. **Job Discovery (`@autoapply/discovery-worker`)**: Scrapes job postings using ATS adapters or Generic fallback.
2. **Analysis (`@autoapply/analysis-worker`)**: Parses job descriptions and extracts requirements using Groq LLMs.
3. **Matching**: Compares job requirements against CandidateProfile.
4. **Resume Generation (`@autoapply/resume-worker`)**: Uses LLMs and Master Resume to generate a tailored ResumeVersion for the job.
5. **Application Queue (`@autoapply/queue`)**: Enqueues jobs into BullMQ.
6. **Browser Launch (`@autoapply/application-worker`)**: Worker picks job, spins up Playwright headless browser instance.
7. **ATS Adapter**: Routes URL to specific ATS adapter (Greenhouse, Lever, Workday) or GenericFallbackAdapter.
8. **Form Filling**: Extracts candidate data, applies AI mappings to fill form fields.
9. **Submission**: Clicks submit and waits for confirmation.
10. **Verification (`@autoapply/verification-worker`)**: Confirms submission signals (URLs, emails).
11. **Notification (`@autoapply/notification-worker`)**: Sends updates via SSE/Redis to frontend.

## 2. Automation Failure Points & State Transitions
- **CAPTCHA / Cloudflare / MFA**: Detects frames or elements, throws error, transitions to `NEEDS_HUMAN` (or currently `AWAITING_HUMAN_VERIFICATION` for Xvfb handoff).
- **Login Required**: Adapters throw `ACCOUNT_REQUIRED` -> `NEEDS_HUMAN`.
- **Unknown Fields**: Adapters throw `UNKNOWN_REQUIRED_FIELD` -> `NEEDS_HUMAN`.
- **Unsupported ATS**: Uses `GenericFallbackAdapter` -> AI mapping -> potential hallucination guard failures.
- **Browser Crash / Timeout / Network Failure**: Worker throws Playwright/Network errors -> Queued for retry or marked `FAILED`.
- **Selector Changes**: Adapters fail to find specific DOM elements -> `FAILED`.

## 3. Worker Blocking Vulnerabilities
- A single job stuck in an infinite loop or hanging network request without a strict Playwright timeout could block a worker process entirely.
- Playwright zombie processes can leak Memory/CPU if crash happens and browser is not aggressively closed in `finally` blocks.
- Missing explicit BullMQ job timeouts can leave jobs active indefinitely.

## 4. Current Render Deployment Vulnerabilities
- **Memory Exhaustion**: Heavy Playwright instances running in the background worker alongside lightweight API/Queues without bounds can trigger OOM kills.
- **Zombie Processes**: If the worker process restarts mid-browser-session, orphaned Chrome instances may consume resources.
- **Redis / Postges Failures**: Inadequate bounded restart/backoff logic could cause rapid crash looping.
- **Scheduler Duplication**: Redis `NX` drift may cause cron duplicate executions.
- **Environment config validation**: Ensure `APP_URL` and `API_URL` are explicitly set in background workers on Render (not derived from dynamic RENDER_URL).

## 5. Summary & Phase 2 Recommendations
The existing automation architecture is functional but fragile at scale. To move towards high reliability without breaking existing workflows, Phase 2 should focus on:
1. Hardening Playwright timeouts and browser lifecycle management to prevent worker blocks.
2. Formalizing the `NEEDS_HUMAN` state transitions strictly through `@autoapply/application-engine`.
3. Standardizing all ATS adapters to adhere to the core Error Types (e.g. `UNKNOWN_REQUIRED_FIELD`, `ACCOUNT_REQUIRED`, `CAPTCHA_DETECTED`).
4. Ensuring strict AI field-mapping hallucination guards are preserved and tested.
