import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

interface CatalogEntry {
  company: string;
  category: string;
  url: string;
  type: string;
  boardToken?: string;
  endpoint?: string;
}

async function run() {
  const catalogPath = path.resolve(__dirname, '../packages/job-discovery/src/data/companies-catalog.json');
  if (!fs.existsSync(catalogPath)) {
    console.error(`Companies catalog not found at ${catalogPath}`);
    process.exit(1);
  }

  const catalog: CatalogEntry[] = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
  console.log(`Ingesting ${catalog.length} companies from catalog...`);

  let seededCompanies = 0;
  let seededSources = 0;

  for (const entry of catalog) {
    try {
      // 1. Upsert Company
      await prisma.company.upsert({
        where: { name: entry.company },
        update: {
          website: entry.url,
          description: `Category: ${entry.category}`
        },
        create: {
          name: entry.company,
          website: entry.url,
          description: `Category: ${entry.category}`
        }
      });
      seededCompanies++;

      // 2. Build JobSource Config
      let config: Record<string, unknown> = {
        type: entry.type,
        companyName: entry.company,
        category: entry.category,
      };

      if (entry.type === 'greenhouse' && entry.boardToken) {
        config = { ...config, boardToken: entry.boardToken };
      } else if (entry.type === 'lever' && entry.boardToken) {
        config = { ...config, boardToken: entry.boardToken };
      } else if (entry.type === 'ashby' && entry.boardToken) {
        config = { ...config, boardToken: entry.boardToken };
      } else if (entry.type === 'workable' && entry.boardToken) {
        config = { ...config, boardToken: entry.boardToken };
      } else if (entry.type === 'html' && entry.endpoint) {
        config = { ...config, endpoint: entry.endpoint };
      }

      // 3. Upsert JobSource
      await prisma.jobSource.upsert({
        where: { name: entry.company },
        update: { config },
        create: {
          name: entry.company,
          config,
        }
      });
      seededSources++;

    } catch (err) {
      console.error(`Failed to seed source for ${entry.company}:`, err);
    }
  }

  console.log(`Successfully seeded ${seededCompanies} companies and ${seededSources} job sources into PostgreSQL.`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
