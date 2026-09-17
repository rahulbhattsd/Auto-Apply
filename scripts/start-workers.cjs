const { spawn } = require('node:child_process');
const Redis = require('ioredis');

const workers = [
  '@autoapply/task-worker',
  '@autoapply/notification-worker',
];

const children = new Map();
const workerStats = new Map();
let shuttingDown = false;

const MAX_RESTARTS = 5;
const BASE_BACKOFF_MS = 1000;
const CIRCUIT_BREAKER_RESET_MS = 300000; // 5 minutes cool-off to allow recovery

// Connect to Redis for supervisor status telemetry
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
let redisClient;
try {
  redisClient = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
  redisClient.connect().catch((err) => {
    console.warn(`[worker-supervisor] Redis connection failed for supervisor telemetry:`, err.message);
  });
} catch (e) {
  console.warn(`[worker-supervisor] Could not initialize Redis for supervisor telemetry:`, e.message);
}

const updateSupervisorStateInRedis = async (name, state, details = {}) => {
  if (!redisClient || redisClient.status !== 'ready') return;
  try {
    const key = `supervisor:worker:${name}`;
    const payload = JSON.stringify({
      worker: name,
      state,
      timestamp: new Date().toISOString(),
      ...details,
    });
    await redisClient.set(key, payload, 'EX', 3600);
  } catch (err) {
    // Non-blocking telemetry
  }
};

const startWorker = (name) => {
  if (shuttingDown) return;

  const currentStats = workerStats.get(name) || {
    restartCount: 0,
    circuitOpen: false,
    lastCrashReason: null,
    lastCrashTime: null,
  };

  if (currentStats.circuitOpen) {
    console.error(`[worker-supervisor] Cannot start ${name}: Circuit breaker is OPEN.`);
    return;
  }

  console.log(`[worker-supervisor] Starting worker ${name}...`);
  updateSupervisorStateInRedis(name, 'RUNNING', { restartCount: currentStats.restartCount });

  const child = spawn('pnpm', ['--filter', name, 'start'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  children.set(name, child);

  child.on('exit', (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;

    const crashReason = `exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`;
    console.error(`[worker-supervisor] ${name} ${crashReason}`);

    currentStats.restartCount += 1;
    currentStats.lastCrashReason = crashReason;
    currentStats.lastCrashTime = new Date().toISOString();

    if (currentStats.restartCount > MAX_RESTARTS) {
      currentStats.circuitOpen = true;
      workerStats.set(name, currentStats);

      console.error(`[worker-supervisor][CIRCUIT_BREAKER] Worker ${name} exceeded maximum restart threshold (${MAX_RESTARTS}).`);
      console.error(`[worker-supervisor][CIRCUIT_BREAKER] Tripping circuit breaker for ${name}. Worker will not auto-restart for ${CIRCUIT_BREAKER_RESET_MS / 1000}s.`);

      updateSupervisorStateInRedis(name, 'CIRCUIT_BREAKER_OPEN', {
        reason: crashReason,
        restarts: currentStats.restartCount,
        alert: 'CRITICAL_WORKER_FAILURE',
      });

      // Controlled recovery window: reset restart counter after 5 minutes and attempt recovery
      setTimeout(() => {
        if (!shuttingDown) {
          console.log(`[worker-supervisor] Resetting circuit breaker for ${name} after cool-down.`);
          currentStats.circuitOpen = false;
          currentStats.restartCount = 0;
          workerStats.set(name, currentStats);
          startWorker(name);
        }
      }, CIRCUIT_BREAKER_RESET_MS);

      return;
    }

    workerStats.set(name, currentStats);

    const backoff = BASE_BACKOFF_MS * Math.pow(2, currentStats.restartCount - 1);
    console.log(`[worker-supervisor] Restarting ${name} in ${backoff}ms (attempt ${currentStats.restartCount}/${MAX_RESTARTS})`);

    updateSupervisorStateInRedis(name, 'RESTARTING', {
      backoffMs: backoff,
      attempt: currentStats.restartCount,
      reason: crashReason,
    });

    setTimeout(() => {
      if (!shuttingDown && !currentStats.circuitOpen) {
        startWorker(name);
      }
    }, backoff);
  });
};

const shutdown = async (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[worker-supervisor] Initiating graceful shutdown of all supervised workers...');

  for (const [name, child] of children.entries()) {
    if (!child.killed) {
      console.log(`[worker-supervisor] Sending SIGTERM to ${name}...`);
      child.kill('SIGTERM');
    }
  }

  const timeout = setTimeout(() => {
    console.warn('[worker-supervisor] Forced shutdown after timeout.');
    process.exit(exitCode);
  }, 25000);
  timeout.unref();

  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {}
  }

  if (children.size === 0) {
    process.exit(exitCode);
  }
};

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));

for (const worker of workers) {
  startWorker(worker);
}
