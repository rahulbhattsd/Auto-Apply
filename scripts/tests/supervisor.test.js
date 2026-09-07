import test from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Supervisor handles crashing worker with backoff and exits after max retries', async () => {
    const mockPnpmPath = path.join(__dirname, 'mock-pnpm.cjs');
    fs.writeFileSync(mockPnpmPath, `
        const name = process.argv[3];
        if (name === '@autoapply/discovery-worker') {
            console.log('Mock discovery-worker crashing...');
            process.exit(1);
        } else {
            console.log('Mock ' + name + ' running...');
            process.on('SIGTERM', () => process.exit(0));
            setInterval(() => {}, 10000);
        }
    `);

    const runnerPath = path.join(__dirname, 'run-supervisor.cjs');
    fs.writeFileSync(runnerPath, `
        const cp = require('node:child_process');
        const originalSpawn = cp.spawn;
        cp.spawn = (cmd, args, opts) => {
            if (cmd === 'pnpm') {
                return originalSpawn('node', ['${mockPnpmPath.replace(/\\/g, '\\\\')}', ...args], opts);
            }
            return originalSpawn(cmd, args, opts);
        };
        require('../start-workers.cjs');
    `);

    const supervisor = spawn('node', [runnerPath], { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    let stdout = '';

    supervisor.stdout.on('data', d => stdout += d.toString());
    supervisor.stderr.on('data', d => stderr += d.toString());

    const exitCode = await new Promise((resolve) => {
        supervisor.on('close', resolve);
    });

    fs.unlinkSync(mockPnpmPath);
    fs.unlinkSync(runnerPath);

    console.log("Supervisor STDERR:\\n" + stderr);

    assert.strictEqual(exitCode, 1, 'Supervisor should exit with code 1 after max restarts');
    const allOut = stdout + stderr;
    assert.ok(allOut.includes('attempt 2/5') || allOut.includes('attempt 1/5'), 'Should log attempts in stdout or stderr');
    assert.ok(stderr.includes('exceeded max restart count'), 'Should log giving up: ' + stderr);
    assert.ok(stdout.includes('Mock @autoapply/analysis-worker running...'), 'Other workers should start');
});
