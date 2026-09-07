const { spawn } = require('node:child_process');

const workers = [
  '@autoapply/discovery-worker',
  '@autoapply/analysis-worker',
  '@autoapply/resume-worker',
  '@autoapply/application-worker',
  '@autoapply/verification-worker',
  '@autoapply/notification-worker',
];

const children = new Map();
const restartCounts = new Map();
let shuttingDown = false;

const MAX_RESTARTS = 5;
const BASE_BACKOFF_MS = 1000;

const startWorker = (name) => {
  const child = spawn('pnpm', ['--filter', name, 'start'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  children.set(name, child);
  child.on('exit', (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;

    console.error(`[worker-supervisor] ${name} exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`);

    const count = (restartCounts.get(name) || 0) + 1;
    restartCounts.set(name, count);

    if (count > MAX_RESTARTS) {
      console.error(`[worker-supervisor] ${name} exceeded max restart count (${MAX_RESTARTS}). Giving up on this worker.`);
      if (children.size === 0) {
        shutdown(1);
      }
      return;
    }

    const backoff = BASE_BACKOFF_MS * Math.pow(2, count - 1);
    console.log(`[worker-supervisor] Restarting ${name} in ${backoff}ms (attempt ${count}/${MAX_RESTARTS})`);

    setTimeout(() => {
      if (!shuttingDown) startWorker(name);
    }, backoff);
  });
};

const shutdown = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children.values()) {
    if (!child.killed) child.kill('SIGTERM');
  }

  const timeout = setTimeout(() => process.exit(exitCode), 25000);
  timeout.unref();

  if (children.size === 0) {
    process.exit(exitCode);
  }
};

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));

for (const worker of workers) {
  startWorker(worker);
}

