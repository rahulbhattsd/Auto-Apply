# Application Worker Tests

This directory contains both unit logic tests and integration tests for the Application Worker.

## Deterministic Unit Logic Tests

The core mapping and state decisions are validated deterministically without backing services:
- `errors.test.ts`: Verifies classification constraints for `ApplicationExecutionError`.
- `recovery.test.ts`: Verifies pure `reconcileCheckpoint` outcomes (Idempotency and Checkpoint staleness constraints) via mocked pages.

You can run these via standard `pnpm test` or native node `tsx`:
```bash
npx tsx --test workers/application-worker/tests/errors.test.ts
```

## E2E Integration Suite

The `worker-integration.test.ts` suite exercises the full system boundary:
`BullMQ` -> `Application Worker` -> `PostgreSQL Checkpoints` -> `Playwright` -> `Mock ATS Server`.

### Dependencies

Because this strictly enforces real queues, DB persistence, and concurrency boundaries, it **requires** the following infrastructure running:
- **Docker Engine** (or equivalent environment)
- **Redis**
- **PostgreSQL**
- **Playwright Chromium** (`npx playwright install chromium`)

### Running the Suite

By default, standard `pnpm test` skips this suite if the infrastructure requirement flag is missing, gracefully logging a SKIP reason.

To execute it, you must explicitly flag that your environment supports it:

```bash
docker compose up -d redis postgres
npx prisma migrate dev
RUN_WORKER_INTEGRATION=1 npx tsx --test workers/application-worker/tests/worker-integration.test.ts
```

Do not mock Redis or Postgres internally to fake these tests; if the infrastructure is missing, it is acceptable and correct to log SKIP rather than run fake validation.
