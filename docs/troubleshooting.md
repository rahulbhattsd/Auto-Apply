# Troubleshooting & Operations Runbook

## 1. Common Issues & Resolutions

### 1. Database Connection Refused (`P1001`)
- **Symptom**: `Can't reach database server at localhost:5432`.
- **Cause**: PostgreSQL is stopped or the container is unhealthy.
- **Resolution**:
  ```bash
  # Check PostgreSQL container
  docker compose ps postgres
  # Restart container if needed
  docker compose restart postgres
  ```

### 2. BullMQ Redis Connection Errors
- **Symptom**: `ECONNREFUSED 127.0.0.1:6379`.
- **Cause**: Redis service is down or max connection limits reached.
- **Resolution**:
  ```bash
  docker compose restart redis
  # Check Redis info
  redis-cli ping
  ```

### 3. Worker Circuit Breaker Tripped
- **Symptom**: Worker supervisor logs: `[Supervisor] Circuit breaker OPEN for task-worker. Delaying restart...`.
- **Cause**: The worker process crashed 5+ times in 60 seconds (e.g., bad database schema or unhandled exception).
- **Resolution**:
  1. Inspect supervisor logs in console or Redis `supervisor:telemetry:*`.
  2. Fix the underlying exception.
  3. The supervisor will automatically enter `HALF_OPEN` after 60 seconds and attempt a controlled restart.
  4. Or manually restart workers: `node scripts/start-workers.cjs`.

### 4. Dead Letter Queue Growth
- **Symptom**: Tasks enter `FAILED` state and accumulate in `DeadLetter` table.
- **Resolution**:
  1. Inspect dead-letter details via the web UI (`/tasks` -> click "Inspect") or query the database:
     ```sql
     SELECT id, queue_name, error, attempt_count, created_at FROM dead_letters ORDER BY created_at DESC LIMIT 10;
     ```
  2. Remediate root cause (e.g. invalid payload or external network error).
  3. Re-queue task using the UI "Retry" button or `POST /api/tasks/:id/retry`.

### 5. AI Inference Timeouts
- **Symptom**: Orchestrator returns `AI_TIMEOUT` or hangs for 30 seconds.
- **Cause**: Upstream Groq API latency or network congestion.
- **Resolution**:
  - The platform includes built-in 30-second `AbortController` timeouts.
  - Temporarily switch `AI_PROVIDER=mock` in `.env` to verify offline system functionality without external network dependencies.
