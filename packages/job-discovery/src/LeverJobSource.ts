import { z } from 'zod';
import { JobResult, JobSearchQuery, JobSource } from './JobSource';

const configSchema = z.object({
  type: z.literal('lever'),
  boardToken: z.string().min(1),
  companyName: z.string().min(1),
});

export class LeverJobSource implements JobSource {
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
    const url = `https://api.lever.co/v0/postings/${this.boardToken}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Lever API failed with status ${response.status}`);
      }
      const data = await response.json() as any[];

      const results: JobResult[] = [];
      for (const job of data) {
        const title = String(job.text || '');
        const location = job.categories?.location ? String(job.categories.location) : undefined;

        if (query.title && !title.toLowerCase().includes(query.title.toLowerCase())) continue;
        if (query.location && location && !location.toLowerCase().includes(query.location.toLowerCase())) continue;

        const result: JobResult = {
          externalId: String(job.id),
          title: title,
          company: this.companyName,
          description: String(job.descriptionPlain || job.description || ''),
          url: String(job.hostedUrl || ''),
          postedAt: job.createdAt ? new Date(job.createdAt) : new Date(),
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
      console.error(`[LeverJobSource] Error fetching jobs for ${this.name}:`, error);
      return [];
    }
  }
}
