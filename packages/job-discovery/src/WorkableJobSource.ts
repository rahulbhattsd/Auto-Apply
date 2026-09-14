import { z } from 'zod';
import { JobResult, JobSearchQuery, JobSource } from './JobSource';

const configSchema = z.object({
  type: z.literal('workable'),
  boardToken: z.string().min(1),
  companyName: z.string().min(1),
});

interface WorkableJobItem {
  id?: string | number;
  shortcode?: string;
  title: string;
  url?: string;
  location?: {
    country?: string;
    city?: string;
    region?: string;
  };
  department?: string;
  description?: string;
  created_at?: string;
}

export class WorkableJobSource implements JobSource {
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
    const url = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(this.boardToken)}/jobs`;

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
        throw new Error(`Workable API returned status ${response.status}`);
      }

      const data = await response.json() as { results?: WorkableJobItem[] };
      const rawJobs = data.results || [];

      const results: JobResult[] = [];
      for (const job of rawJobs) {
        const title = String(job.title || '');
        const locParts = [job.location?.city, job.location?.country].filter(Boolean);
        const location = locParts.length > 0 ? locParts.join(', ') : undefined;
        const jobUrl = job.url || `https://apply.workable.com/${this.boardToken}/j/${job.shortcode || job.id}/`;

        if (query.title && !title.toLowerCase().includes(query.title.toLowerCase())) continue;
        if (query.location && location && !location.toLowerCase().includes(query.location.toLowerCase())) continue;

        const result: JobResult = {
          externalId: String(job.shortcode || job.id || Math.random().toString(36).substring(2)),
          title,
          company: this.companyName,
          description: String(job.description || ''),
          url: String(jobUrl),
          postedAt: job.created_at ? new Date(job.created_at) : new Date(),
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
      console.error(`[WorkableJobSource] Error fetching jobs for ${this.name}:`, error);
      return [];
    }
  }
}
