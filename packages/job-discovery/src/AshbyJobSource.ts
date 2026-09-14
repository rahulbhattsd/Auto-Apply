import { z } from 'zod';
import { JobResult, JobSearchQuery, JobSource } from './JobSource';

const configSchema = z.object({
  type: z.literal('ashby'),
  boardToken: z.string().min(1),
  companyName: z.string().min(1),
});

interface AshbyJobItem {
  id: string;
  title: string;
  location?: string;
  department?: string;
  jobUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  publishedAt?: string;
}

export class AshbyJobSource implements JobSource {
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
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(this.boardToken)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ashby API returned status ${response.status}`);
      }

      const data = await response.json() as { jobs?: AshbyJobItem[] };
      const rawJobs = data.jobs || [];

      const results: JobResult[] = [];
      for (const job of rawJobs) {
        const title = String(job.title || '');
        const location = job.location ? String(job.location) : undefined;
        const jobUrl = job.jobUrl || job.applyUrl || `https://jobs.ashbyhq.com/${this.boardToken}/${job.id}`;

        if (query.title && !title.toLowerCase().includes(query.title.toLowerCase())) continue;
        if (query.location && location && !location.toLowerCase().includes(query.location.toLowerCase())) continue;

        const result: JobResult = {
          externalId: String(job.id),
          title,
          company: this.companyName,
          description: String(job.descriptionPlain || job.descriptionHtml || ''),
          url: String(jobUrl),
          postedAt: job.publishedAt ? new Date(job.publishedAt) : new Date(),
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
      console.error(`[AshbyJobSource] Error fetching jobs for ${this.name}:`, error);
      return [];
    }
  }
}
