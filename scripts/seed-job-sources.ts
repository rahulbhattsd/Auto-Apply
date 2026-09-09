import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  await prisma.jobSource.upsert({
    where: { name: 'Razorpay' },
    update: {},
    create: {
      name: 'Razorpay',
      config: {
        type: 'greenhouse',
        boardToken: 'razorpaysoftwareprivatelimited',
        companyName: 'Razorpay'
      }
    }
  });

  await prisma.jobSource.upsert({
    where: { name: 'Glean' },
    update: {},
    create: {
      name: 'Glean',
      config: {
        type: 'greenhouse',
        boardToken: 'gleanwork',
        companyName: 'Glean'
      }
    }
  });

  await prisma.jobSource.upsert({
    where: { name: 'Fi Money' },
    update: {},
    create: {
      name: 'Fi Money',
      config: {
        type: 'lever',
        boardToken: 'fi',
        companyName: 'Fi Money'
      }
    }
  });

  console.log("Seeded known JobSources.");
}

run().catch(console.error).finally(() => prisma.$disconnect());
