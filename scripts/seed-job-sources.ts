import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

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

  // Seed HTML JobSources based on classification report
  const classificationFile = path.resolve(__dirname, 'career-sites-classification.json');
  if (fs.existsSync(classificationFile)) {
    const data = JSON.parse(fs.readFileSync(classificationFile, 'utf-8'));

    // Types that don't have a dedicated adapter yet
    const htmlTypes = new Set(['unknown', 'workday', 'darwinbox', 'keka', 'zohorecruit', 'ashby', 'workable', 'icims']);

    let htmlSeededCount = 0;
    for (const site of data) {
      if (htmlTypes.has(site.detectedAts) && site.url) {
        try {
          await prisma.jobSource.upsert({
            where: { name: site.company },
            update: {
              config: {
                type: 'html',
                endpoint: site.url,
                companyName: site.company
              }
            },
            create: {
              name: site.company,
              config: {
                type: 'html',
                endpoint: site.url,
                companyName: site.company
              }
            }
          });
          htmlSeededCount++;
        } catch (err) {
          console.error(`Failed to seed HTML source for ${site.company}:`, err);
        }
      }
    }
    console.log(`Seeded ${htmlSeededCount} HtmlJobSources from classification data.`);
  } else {
    console.warn("career-sites-classification.json not found, skipping HTML sources seeding.");
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
