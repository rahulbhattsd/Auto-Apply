import { z } from 'zod';
import { JobResult, JobSearchQuery, JobSource } from './JobSource';

const jobResultSchema = z.object({
  externalId: z.string().min(1),
  title: z.string().min(1),
  company: z.string().min(1),
  location: z.string().optional(),
  remoteType: z.string().optional(),
  description: z.string().min(1),
  url: z.string().url(),
  employmentType: z.string().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  currency: z.string().optional(),
  postedAt: z.coerce.date(),
  skills: z.array(z.string()).default([]),
});

const configSchema = z.object({
  type: z.literal('http-json'),
  endpoint: z.string().url(),
  headers: z.record(z.string()).optional(),
});

const responseSchema = z.union([
  z.array(jobResultSchema),
  z.object({ jobs: z.array(jobResultSchema) }),
]);

export class HttpJsonJobSource implements JobSource {
  readonly name: string;
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;

  constructor(name: string, config: unknown) {
    const parsed = configSchema.parse(config);
    this.name = name;
    this.endpoint = parsed.endpoint;
    this.headers = parsed.headers ?? {};
  }

  async searchJobs(query: JobSearchQuery): Promise<JobResult[]> {
    const url = new URL(this.endpoint);
    if (query.title) url.searchParams.set('title', query.title);
    if (query.location) url.searchParams.set('location', query.location);
    if (query.remoteType) url.searchParams.set('remoteType', query.remoteType);
    if (query.employmentType) url.searchParams.set('employmentType', query.employmentType);
    if (query.limit) url.searchParams.set('limit', String(query.limit));

    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`Job source ${this.name} failed with HTTP ${response.status}`);
    }

    const parsed = responseSchema.parse(await response.json());
    return Array.isArray(parsed) ? parsed : parsed.jobs;
  }
}
