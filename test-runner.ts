import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'path';

run({ files: [path.resolve('workers/application-worker/tests/retry.test.ts')] })
  .on('test:fail', () => process.exitCode = 1)
  .compose(new spec())
  .pipe(process.stdout);
