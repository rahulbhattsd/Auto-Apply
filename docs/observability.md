# Observability, Metrics & Telemetry

## 1. Monitoring Endpoints

### 1. Health & Readiness Checks
- `GET /api/health`: Immediate liveness check returning service name, status (`ok`), and server timestamp.
- `GET /api/system/status`: Comprehensive status including database connectivity, active AI provider, process uptime, and worker summaries.
- `GET /api/system/workers`: Real-time list of all active worker heartbeats retrieved from Redis.

### 2. Prometheus Metrics
- `GET /metrics` or `GET /api/metrics`: Exposes standard Prometheus text metrics:
  - `http_requests_total`: Counter for total requests labeled by method, path, and HTTP status.
  - `http_request_duration_seconds`: Histogram measuring API latency across endpoints.
  - `active_workers_count`: Gauge of active healthy workers.
  - `bullmq_queue_depth`: Gauge of pending tasks in `agent-tasks`.
  - `db_connection_pool`: Database connection health and active connections.

---

## 2. Structured Logging
The platform utilizes **Pino** for high-throughput, structured JSON logging:
- In `development`: Beautiful formatted terminal output via `pino-pretty`.
- In `production`: Machine-parseable JSON lines with standardized keys:
  - `reqId`: Unique request ID for distributed tracing.
  - `service`: `api`, `task-worker`, or `notification-worker`.
  - `responseTime`: Elapsed request time in milliseconds.
  - `userId`: Masked user context when authenticated.

---

## 3. Real-Time Events (Server-Sent Events)
Clients subscribe to real-time agent updates at `GET /api/events` via Server-Sent Events (SSE):
- Secured with JWT cookie authentication.
- Scoped to the user's specific channel: `agent-events:${userId}`.
- Emits task completion events, worker telemetry, and background notifications in real-time.
- Automatically sends periodic `KEEPALIVE` pings every 30 seconds to maintain persistent connections across proxies and firewalls.
