import { z } from 'zod';
import { JobResult, JobSearchQuery, JobSource } from './JobSource';

const configSchema = z.object({
  type: z.literal('greenhouse'),
  boardToken: z.string().min(1),
  companyName: z.string().min(1),
});

export class GreenhouseJobSource implements JobSource {
  readonly name: string;
  private readonly boardToken: string;
  private readonly companyName: string;

  constructor(name: string, config: unknown) {
    const parsed = configSchema.parse(config);
    this.name = name;
    this.boardToken = parsed.boardToken;
    this.companyName = parsed.companyName;
  }

  async searchJobs(query: JobSearchQuery): Promise<JobResult[]> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${this.boardToken}/jobs?content=true`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Greenhouse API failed with status ${response.status}`);
      }
      const data = await response.json() as any;
      const rawJobs = data.jobs || [];

      const results: JobResult[] = [];
      for (const job of rawJobs) {
        const title = String(job.title || '');
        const location = job.location?.name ? String(job.location.name) : undefined;

        if (query.title && !title.toLowerCase().includes(query.title.toLowerCase())) continue;
        if (query.location && location && !location.toLowerCase().includes(query.location.toLowerCase())) continue;

        const result: JobResult = {
          externalId: String(job.id),
          title: title,
          company: this.companyName,
          description: String(job.content || ''),
          url: String(job.absolute_url || ''),
          postedAt: job.updated_at ? new Date(job.updated_at) : new Date(),
          skills: [],
        };
        if (location) {
          result.location = location;
        }

        results.push(result);
      }

      if (query.limit) {
        return results.slice(0, query.limit);
      }
      return results;
    } catch (error) {
      console.error(`[GreenhouseJobSource] Error fetching jobs for ${this.name}:`, error);
      return [];
    }
  }
}
