# BullMQ Task Queues & Dead-Letter Handling

## 1. Queue Architecture
The asynchronous execution subsystem is built on **BullMQ** and **Redis 7**:

- **Primary Tasks Queue**: `agent-tasks`
- **Notifications Queue**: `notifications`

```
API (TaskService.createTask)
      │
      ▼
┌──────────────┐      enqueue (BullMQ)      ┌──────────────────┐
│  PostgreSQL  │ ─────────────────────────> │   Redis Queue    │
│  (Task table)│                            │  ("agent-tasks") │
└──────────────┘                            └────────┬─────────┘
                                                     │
                                                     │ dequeue
                                                     ▼
                                            ┌──────────────────┐
                                            │   Task Worker    │
                                            └────────┬─────────┘
                                                     │
                       ┌─────────────────────────────┴─────────────────────────────┐
                       │ Success                                                   │ Failure (attempts exhausted)
                       ▼                                                           ▼
         ┌───────────────────────────┐                               ┌───────────────────────────┐
         │ Status: COMPLETED         │                               │ Status: FAILED            │
         │ Result persisted to DB    │                               │ Saved to DeadLetter table │
         └───────────────────────────┘                               └───────────────────────────┘
```

---

## 2. Retry Policy & Exponential Backoff
Jobs enqueued to `agent-tasks` follow a strict bounded retry strategy to avoid overloading downstream services:

- **Max Retries**: 3 attempts (configurable per task).
- **Backoff Strategy**: Exponential with jitter (`type: 'exponential'`, `delay: 2000ms`).
- **Timeout**: Each job is constrained by a 120-second execution window.

---

## 3. Dead-Letter Processing
When a background task exhausts all retry attempts:
1. The BullMQ worker's `failed` event triggers.
2. The task status in the database is transitioned from `RUNNING` to `FAILED`.
3. A record is inserted into the `DeadLetter` table:
   - `jobId`: The BullMQ job identifier.
   - `queueName`: The queue from which the job originated.
   - `error`: Error message.
   - `attemptCount`: Total attempts made before termination.
   - `stackTrace`: Formatted error stack trace for debugging.
4. An alert is dispatched through `AlertService` with deduplication debouncing.

---

## 4. Task Types Supported
- `AI_TASK`: Asynchronous multi-step LLM reasoning, code analysis, and document summarization.
- `RESEARCH_TASK`: Automated deep topic research and structured fact synthesis.
- `MEMORY_TASK`: Background memory indexing, duplicate deduplication, and decay consolidation.
- `NOTIFICATION_TASK`: Email or webhook notifications and status summaries.
- `MAINTENANCE_TASK`: Redis cache purging, expired session cleanup, and database index maintenance.
