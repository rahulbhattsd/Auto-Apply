# Worker Architecture & Supervisor

## 1. Overview
The platform's background processing runs under an autonomous, self-healing supervisor architecture designed to ensure continuous uptime and fault isolation.

---

## 2. Active Workers
1. **`@autoapply/task-worker`**:
   - Location: `workers/task-worker/src/index.ts`
   - Queue: `agent-tasks`
   - Handles: Long-running AI generation, web research, memory optimization, and maintenance routines.
   - Heartbeat: Periodically reports status (`HEALTHY` / `BUSY`) to Redis key `worker:heartbeat:task-worker-<pid>`.
2. **`@autoapply/notification-worker`**:
   - Location: `workers/notification-worker/src/index.ts`
   - Queue: `notifications`
   - Handles: Email alerts, digest generation, and system notification delivery.
   - Heartbeat: Reports to `worker:heartbeat:notification-worker-<pid>`.

---

## 3. Worker Heartbeat Mechanism
Workers report heartbeats every 15 seconds through `@autoapply/queue/src/heartbeat.ts`:
- **Key Format**: `worker:heartbeat:<workerId>`
- **TTL**: 45 seconds (auto-expires in Redis if the process terminates abruptly).
- **Payload**:
  ```json
  {
    "workerId": "task-worker-12345",
    "workerType": "TASK_WORKER",
    "status": "HEALTHY",
    "timestamp": 1726567200000,
    "metrics": {
      "uptimeSeconds": 3600,
      "memoryUsageMb": 85.4
    }
  }
  ```
The API's `/api/system/workers` and `/api/dashboard` endpoints query these keys to provide live observability on the dashboard.

---

## 4. Self-Healing Supervisor (`scripts/start-workers.cjs`)
The supervisor acts as the primary process manager for worker execution:

- **Process Supervision**: Spawns workers as child processes with piped logging.
- **Circuit Breaker Engine**:
  - Tracks crash frequencies within a sliding 60-second window.
  - If a worker crashes more than 5 times in 60 seconds, the circuit breaker opens (`OPEN` state), halting restarts for 60 seconds to protect CPU and external resources.
  - After the cooldown period, it transitions to `HALF_OPEN` to test stability.
- **Exponential Backoff**:
  - Delay formula: `Math.min(1000 * Math.pow(2, restartCount), 30000)`.
- **Graceful Shutdown**:
  - Intercepts `SIGINT` and `SIGTERM`.
  - Sends graceful termination signals to child processes, allowing currently processing jobs to complete cleanly.
- **Crash Telemetry**:
  - Worker crashes, exit codes, and circuit breaker transitions are logged directly to Redis under `supervisor:telemetry:*` for diagnostic inspection.
