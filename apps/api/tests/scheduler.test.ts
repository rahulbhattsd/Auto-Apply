import test from 'node:test';
import assert from 'node:assert';
import { connection } from '@autoapply/queue';
import { startScheduler, stopScheduler } from '../src/scheduler';
import { prisma } from '@autoapply/database';

test('Scheduler Distributed Lock', async () => {
  // To avoid real database calls, we mock prisma.automationConfig.findMany
  const originalFindMany = prisma.automationConfig.findMany;
  let findManyCalled = 0;
  prisma.automationConfig.findMany = async () => {
    findManyCalled++;
    return [];
  };

  const originalLog = console.log;
  let logOutput: string[] = [];
  console.log = (msg: string) => {
    if (typeof msg === 'string') logOutput.push(msg);
  };

  // Mock connection methods to simulate Redis NX behavior explicitly
  const originalSet = connection.set;
  const originalEval = connection.eval;

  let lockStore = new Map<string, string>();

  // We want to test that if two starts happen concurrently, only one runs the work
  // We'll mock connection.set to simulate racing
  connection.set = async (key: string, value: string, px: string, ttl: number, nx: string): Promise<any> => {
    if (nx === 'NX') {
      if (lockStore.has(key)) return null; // already locked
      lockStore.set(key, value);
      return 'OK';
    }
    return 'OK';
  };

  connection.eval = async (script: string, numKeys: number, key: string, arg: string): Promise<any> => {
      // simulate the lua script
      if (lockStore.get(key) === arg) {
          lockStore.delete(key);
          return 1;
      }
      return 0;
  };

  try {
    // Clear lock store
    lockStore.clear();
    findManyCalled = 0;

    lockStore.set('lock:discovery-scheduler', 'fake-instance');

    await startScheduler();
    stopScheduler();

    // If the lock was held, findManyCalled should be 0 because it aborts.
    assert.strictEqual(findManyCalled, 0, 'Scheduler should abort if lock is held');
    assert.ok(logOutput.some(log => log.includes('Lock not acquired')), 'Should log lock failure');

    // Now release lock and run it to verify it runs when lock is free
    lockStore.clear();
    logOutput = [];

    stopScheduler();

    await startScheduler();
    stopScheduler();

    assert.strictEqual(findManyCalled, 1, 'Scheduler should execute if lock is acquired');
    assert.ok(!logOutput.some(log => log.includes('Lock not acquired')), 'Should not log lock failure');

  } finally {
    console.log = originalLog;
    connection.set = originalSet;
    connection.eval = originalEval;
    prisma.automationConfig.findMany = originalFindMany;
  }
});
