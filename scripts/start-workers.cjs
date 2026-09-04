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
let shuttingDown = false;

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
    shutdown(code && code > 0 ? code : 1);
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

