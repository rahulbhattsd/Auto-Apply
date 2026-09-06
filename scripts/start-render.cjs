const { spawn } = require('node:child_process');

const processes = [
  ['api', ['--filter', '@autoapply/api', 'start']],
  ['discovery-worker', ['--filter', '@autoapply/discovery-worker', 'start']],
  ['analysis-worker', ['--filter', '@autoapply/analysis-worker', 'start']],
  ['resume-worker', ['--filter', '@autoapply/resume-worker', 'start']],
  ['application-worker', ['--filter', '@autoapply/application-worker', 'start']],
  ['verification-worker', ['--filter', '@autoapply/verification-worker', 'start']],
  ['notification-worker', ['--filter', '@autoapply/notification-worker', 'start']],
];

const children = new Map();
const restartCounts = new Map();
let shuttingDown = false;

const MAX_RESTARTS = 5;
const BASE_BACKOFF_MS = 1000;

const start = ([name, args]) => {
  const child = spawn('pnpm', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  children.set(name, child);
  child.on('exit', (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;

    console.error(`[render-supervisor] ${name} exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`);

    const count = (restartCounts.get(name) || 0) + 1;
    restartCounts.set(name, count);

    if (count > MAX_RESTARTS) {
      console.error(`[render-supervisor] ${name} exceeded max restart count (${MAX_RESTARTS}). Giving up on this process.`);
      if (children.size === 0) {
        shutdown(1);
      }
      return;
    }

    const backoff = BASE_BACKOFF_MS * Math.pow(2, count - 1);
    console.log(`[render-supervisor] Restarting ${name} in ${backoff}ms (attempt ${count}/${MAX_RESTARTS})`);

    setTimeout(() => {
      if (!shuttingDown) start([name, args]);
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

processes.forEach(start);
