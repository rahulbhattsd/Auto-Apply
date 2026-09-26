# Design notes — hardening pass on the existing `main` branch

## The short version

Your `main` branch (Python + Playwright + Groq) is **already** the new
architecture — it is not the old Prisma/pnpm monorepo (that's a separate
branch, `jules-autoapply-foundational-...`, a Node/Postgres/Redis stack).
Nothing here needed to be thrown away. Six concrete bugs explain every
symptom you described. All six are fixed in this pass; nothing was
rewritten from scratch.

## Root causes found (read from your actual code, not assumed)

1. **Every job was routed through the LinkedIn handler.**
   `main.py` had:
   ```python
   if "linkedin.com" in job_url or True:  # Default handler
   ```
   The `or True` made the condition always pass, so `ats/greenhouse.py`,
   `ats/lever.py`, `ats/workday.py`, `ats/generic.py` — all fully written —
   were **dead code**. Every non-LinkedIn job (Indeed, Glassdoor, career
   pages) got shoved into LinkedIn-specific button detection, failed, and
   came back `skipped_external`. This is the actual cause of "redirect/
   external ATS jobs are simply skipped."
   → Fixed with `core/router.py`, a real domain→handler map, wired into
   `main.py`.

2. **Both configured Groq models are dead.** `llama3-70b-8192` (primary)
   and `llama-3.3-70b-versatile` (fallback) were both deprecated by Groq on
   **16 Aug 2026**. Every LLM call was hitting the primary, failing,
   hitting the fallback, failing again, and returning `{}` — silently,
   because of the bare `except Exception: return {}`. Any application
   question that needed the LLM was going unanswered.
   → Fixed: `core/llm.py` now defaults to `openai/gpt-oss-20b` (primary)
   and `openai/gpt-oss-120b` (fallback), the current free-tier IDs.

3. **7 keys configured, 1 key ever used.** `GroqPool.current_index` was
   set once in `__init__` and never changed anywhere. Key rotation
   didn't exist.
   → Fixed: round-robin across all keys per call, with a per-key cooldown
   timer that kicks in on a 429/rate-limit error so a burned key is skipped
   for `cooldown_seconds` instead of being retried immediately.

4. **The cache existed but was never called.** `core/cache.py` and the
   `llm_cache` SQLite table were fully built, but nothing in `core/llm.py`
   or `handlers/linkedin_handler.py` ever read or wrote them.
   → Fixed: caching now lives inside `GroqPool.map_fields_batch` itself
   (keyed on a hash of model + fields + a condensed profile signature), so
   every call site benefits automatically. The same "years of experience"
   / "need sponsorship" question repeats across nearly every job, so after
   the first handful of applications most calls are served from SQLite and
   cost zero tokens.

5. **LinkedIn's per-field LLM calls, not per-step.** `_fill_text_inputs`
   called `llm_pool.map_fields_batch(...)` once **per unmapped field**,
   each time re-sending the full resume text — a step with 4 unknown
   questions meant 4 separate API calls. `ats/base.py`'s generic
   `fill_unknown_fields` already batched correctly; the dedicated LinkedIn
   handler didn't reuse that pattern.
   → Fixed: all unmapped fields on a step are now collected first and
   resolved in **one** batched call, with a condensed profile string
   (~500 chars) instead of the raw resume text.

6. **No stuck-loop detection.** The 15-step retry loop had no way to tell
   "Next was clicked but the form didn't move" (usually a silent
   validation error) apart from "form validation error" from "normal
   multi-step progress" — it would spin through steps doing nothing new.
   → Fixed: `core/dom_utils.step_signature()` fingerprints the visible
   step's fields; two identical signatures in a row means the flow is
   stuck, so it exits early and reports `stuck` instead of exhausting the
   step budget.

## What was added (previously missing platforms)

- **Indeed** (`handlers/indeed_handler.py`) — Indeed Apply is shaped just
  like LinkedIn Easy Apply (multi-step modal/iframe), so it **subclasses**
  `LinkedInHandler` and only overrides button/container detection and the
  confirmation-text check. It gets the batched-LLM-call fix and the
  stuck-loop detection for free — no duplicated state machine.
- **Ashby** (`ats/ashby.py`) — single-page form, same shape as your
  existing Greenhouse/Lever handlers.
- **Glassdoor** (`ats/glassdoor.py`) — Glassdoor mostly hosts a button that
  either opens a native Indeed-style apply widget or pops open the real
  employer ATS in a new tab. This handler waits for that popup; if one
  opens, it reads the resolved URL and re-dispatches through the same
  `core/router.get_handler()` used by `main.py`, so a Glassdoor listing
  that lands on, say, a Workday page gets handled by `WorkdayHandler`
  automatically rather than being treated as a dead end.
- **"Big" career sites (Accenture / PwC / EY / Adobe, etc.)** — most run on
  Workday (`*.myworkdayjobs.com`), which `WorkdayHandler` already matches
  by domain. Anything else falls through to `GenericHandler`, which fills
  known + unknown fields and looks for a confirmation phrase — best-effort
  by design, same philosophy as your README already states: escalate to
  `stuck`/Telegram rather than pretend success.

## Token math (why this stays inside 7 free Groq keys)

- Deterministic fields (name, email, phone, experience, salary,
  sponsorship, notice period, etc.) are resolved from `profile.yaml`
  locally — **0 tokens**.
- Only genuinely unrecognized questions go to the LLM, batched **once per
  step**, with a ~500-character condensed profile instead of a full
  resume (roughly 150–250 tokens in, ~100 tokens out per call).
- Repeat questions across jobs are served from the SQLite cache after the
  first occurrence — 0 tokens on every repeat.
- With Groq's free tier giving each key its own per-minute limit, 7 keys
  round-robined plus caching should comfortably cover a normal run of
  30–50 applications/day with well under 1–2 live calls per job on
  average, as your README already targets.

## What's unchanged (already solid, didn't need touching)

`core/browser_manager.py` (real Chrome + stealth args + session
persistence), `barriers/` (CAPTCHA/OTP/login-wall detection and Gmail OTP
auto-read), `core/notifier.py` + `bot.py` (Telegram escalation and
resume/skip/pause commands), `core/db.py` (schema, stats, reason
categorization), `dashboard.py`/`dashboard_ui/` — all left as-is.

## Suggested next step

Run one real job through each new/changed path (LinkedIn, Indeed, one
Greenhouse or Workday listing, one Glassdoor listing that redirects) with
`headless: false` and watch it live — Indeed's and Glassdoor's exact
selectors are the most likely to need a small live tweak, since they
weren't previously exercised at all (dead code / never built). The
existing debug screenshot + HTML dump on failure in `main.py` will show
exactly what to adjust.
