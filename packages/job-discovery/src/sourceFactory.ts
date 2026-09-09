import { Prisma } from '@prisma/client';
import { env } from '@autoapply/config';
import { prisma } from '@autoapply/database';
import { JobSource } from './JobSource';
import { MockJobSource } from './MockJobSource';
import { HttpJsonJobSource } from './HttpJsonJobSource';
import { GreenhouseJobSource } from './GreenhouseJobSource';
import { LeverJobSource } from './LeverJobSource';

type DbSource = {
  name: string;
  config: Prisma.JsonValue | null;
};

export function createJobSource(source: DbSource): JobSource | null {
  const config = source.config as Record<string, unknown> | null;
  if (!config?.['type']) return null;

  if (config['type'] === 'mock') {
    if (env.NODE_ENV === 'production') return null;
    return new MockJobSource();
  }

  if (config['type'] === 'http-json') {
    return new HttpJsonJobSource(source.name, config);
  }

  if (config['type'] === 'greenhouse') {
    return new GreenhouseJobSource(source.name, config);
  }

  if (config['type'] === 'lever') {
    return new LeverJobSource(source.name, config);
  }

  return null;
}

export async function loadConfiguredJobSources(): Promise<JobSource[]> {
  const records = await prisma.jobSource.findMany({ where: { config: { not: Prisma.JsonNull } } });
  const sources = records.map(createJobSource).filter((source): source is JobSource => Boolean(source));

  if (sources.length === 0 && env.NODE_ENV !== 'production') {
    return [new MockJobSource()];
  }

  return sources;
}
