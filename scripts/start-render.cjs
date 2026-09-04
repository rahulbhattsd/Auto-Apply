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
let shuttingDown = false;

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
    shutdown(code && code > 0 ? code : 1);
  });
};

const shutdown = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children.values()) {
    if (!child.killed) child.kill('SIGTERM');
  }

  setTimeout(() => process.exit(exitCode), 25000).unref();
};

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));

processes.forEach(start);
