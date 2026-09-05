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
  timeout: z.number().optional().default(10000),
  retries: z.number().optional().default(2),
});

export class HttpJsonJobSource implements JobSource {
  readonly name: string;
  private readonly endpoint: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;
  private readonly retries: number;

  constructor(name: string, config: unknown) {
    const parsed = configSchema.parse(config);
    this.name = name;
    this.endpoint = parsed.endpoint;
    this.headers = parsed.headers ?? {};
    this.timeout = parsed.timeout;
    this.retries = parsed.retries;
  }

  async searchJobs(query: JobSearchQuery): Promise<JobResult[]> {
    const url = new URL(this.endpoint);
    if (query.title) url.searchParams.set('title', query.title);
    if (query.location) url.searchParams.set('location', query.location);
    if (query.remoteType) url.searchParams.set('remoteType', query.remoteType);
    if (query.employmentType) url.searchParams.set('employmentType', query.employmentType);
    if (query.limit) url.searchParams.set('limit', String(query.limit));

    let attempt = 0;
    while (attempt <= this.retries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(url.toString(), {
          headers: this.headers,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Job source ${this.name} failed with HTTP ${response.status}`);
        }

        const data = await response.json() as unknown;

        // Handle array or object with `jobs` property
        let rawJobs: unknown[] = [];
        if (Array.isArray(data)) {
            rawJobs = data;
        } else if (data && typeof data === 'object' && 'jobs' in data && Array.isArray((data as Record<string, unknown>)['jobs'])) {
            rawJobs = (data as Record<string, unknown>)['jobs'] as unknown[];
        }

        // Validate each job individually, filtering out bad ones
        const validJobs: JobResult[] = [];
        for (const rawJob of rawJobs) {
            const parsed = jobResultSchema.safeParse(rawJob);
            if (parsed.success) {
                const job: JobResult = {
                  externalId: parsed.data.externalId,
                  title: parsed.data.title,
                  company: parsed.data.company,
                  description: parsed.data.description,
                  url: parsed.data.url,
                  postedAt: parsed.data.postedAt,
                  skills: parsed.data.skills,
                };

                if (parsed.data.location) job.location = parsed.data.location;
                if (parsed.data.remoteType) job.remoteType = parsed.data.remoteType;
                if (parsed.data.employmentType) job.employmentType = parsed.data.employmentType;
                if (parsed.data.salaryMin !== undefined) job.salaryMin = parsed.data.salaryMin;
                if (parsed.data.salaryMax !== undefined) job.salaryMax = parsed.data.salaryMax;
                if (parsed.data.currency) job.currency = parsed.data.currency;

                validJobs.push(job);
            } else {
                console.warn(`[HttpJsonJobSource] Failed to parse job from ${this.name}: ${parsed.error.message}`);
            }
        }

        return validJobs;
      } catch (error) {
        clearTimeout(timeoutId);
        if (attempt === this.retries) {
          throw new Error(`Job source ${this.name} failed after ${this.retries} retries: ${error instanceof Error ? error.message : String(error)}`);
        }
        attempt++;
        // Small exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
    return [];
  }
}
