
        const cp = require('node:child_process');
        const originalSpawn = cp.spawn;
        cp.spawn = (cmd, args, opts) => {
            if (cmd === 'pnpm') {
                return originalSpawn('node', ['/app/scripts/tests/mock-pnpm.cjs', ...args], opts);
            }
            return originalSpawn(cmd, args, opts);
        };
        require('../start-workers.cjs');
