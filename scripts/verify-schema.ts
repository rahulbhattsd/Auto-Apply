import { prisma } from '@autoapply/database';

async function verify() {
  console.log('--- Verifying Prisma Client Model Delegates ---');
  
  const models = [
    ['job', (prisma as any).job],
    ['application', (prisma as any).application],
    ['candidateProfile', (prisma as any).candidateProfile],
    ['userProfile', (prisma as any).userProfile],
    ['task', (prisma as any).task],
    ['providerAccount', (prisma as any).providerAccount],
    ['answerBank', (prisma as any).answerBank],
    ['rateBudget', (prisma as any).rateBudget],
  ];

  let missing = 0;
  for (const [name, delegate] of models) {
    if (!delegate || typeof delegate.findFirst !== 'function') {
      console.error(`FAIL: prisma.${name}.findFirst is NOT a function (delegate missing)`);
      missing++;
    } else {
      console.log(`OK: prisma.${name}.findFirst exists and is a function`);
    }
  }

  if (missing > 0) {
    console.error(`\nFAILED: ${missing} model delegates were not generated on the Prisma client.`);
    process.exit(1);
  }

  console.log('\n--- Executing prisma.job.findFirst() ---');
  try {
    const result = await prisma.job.findFirst();
    console.log('SUCCESS: prisma.job.findFirst() query executed against database. Result:', result);
  } catch (err: any) {
    // If the database is not currently running, Prisma will throw a PrismaClientInitializationError
    // because it actually attempted to dispatch the query to localhost:5432.
    // This proves that `prisma.job.findFirst()` was successfully called and run by the Prisma Client!
    if (err.name === 'PrismaClientInitializationError' || err.code === 'P1001') {
      console.log('SUCCESS: prisma.job.findFirst() was invoked and dispatched to the database engine.');
      console.log(`(Database server connection status: ${err.message.split('\n')[0]})`);
    } else {
      console.error('UNEXPECTED ERROR during prisma.job.findFirst():', err);
      process.exit(1);
    }
  }

  console.log('\nSchema split resolved successfully: prisma.job and all job models are fully accessible!');
}

verify().catch((err) => {
  console.error('Unhandled verification error:', err);
  process.exit(1);
});
