import { z } from 'zod';
import { JobResult, JobSearchQuery, JobSource } from './JobSource';
import { chromium } from 'playwright';
import { HtmlJobExtractorProvider } from '@autoapply/ai-analysis';
import { connection } from '@autoapply/queue';
import crypto from 'crypto';

const configSchema = z.object({
  type: z.literal('html'),
  endpoint: z.string().url(),
  companyName: z.string().min(1),
  timeout: z.number().optional().default(30000), // Longer timeout for browser
  retries: z.number().optional().default(2),
});

export class HtmlJobSource implements JobSource {
  readonly name: string;
  private readonly endpoint: string;
  private readonly companyName: string;
  private readonly timeout: number;
  private readonly retries: number;
  private extractor = new HtmlJobExtractorProvider();

  constructor(name: string, config: unknown) {
    const parsed = configSchema.parse(config);
    this.name = name;
    this.endpoint = parsed.endpoint;
    this.companyName = parsed.companyName;
    this.timeout = parsed.timeout;
    this.retries = parsed.retries;
  }

  async searchJobs(query: JobSearchQuery): Promise<JobResult[]> {
    const cacheKey = `html-source-cache:${this.endpoint}`;

    // Attempt to return from cache first (24h cache)
    const cached = await connection.get(cacheKey);
    if (cached) {
      const parsedJobs = JSON.parse(cached) as JobResult[];
      return this.filterJobs(parsedJobs, query);
    }

    let attempt = 0;
    while (attempt <= this.retries) {
      let browser;
      try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(this.endpoint, {
          waitUntil: 'domcontentloaded',
          timeout: this.timeout
        });

        // Wait a bit for JS frameworks to render listings
        await page.waitForTimeout(3000);

        // Extract structural summary (headings, links, repeated elements)
        const structuralSummary = await page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('h1, h2, h3, h4, a, li, article, .job-card, .job-item, .posting'));

            return elements.map(el => {
                const tag = el.tagName.toLowerCase();
                if (tag === 'a') {
                   const href = (el as HTMLAnchorElement).href;
                   return `<a href="${href}">${el.textContent?.trim() || ''}</a>`;
                } else if (tag.startsWith('h')) {
                   return `<${tag}>${el.textContent?.trim() || ''}</${tag}>`;
                } else {
                   // Keep it brief for structural containers
                   const cls = el.className ? ` class="${el.className}"` : '';
                   const text = el.textContent?.trim().replace(/\s+/g, ' ').substring(0, 100) || '';
                   return `<${tag}${cls}>${text}</${tag}>`;
                }
            }).join('\n');
        });

        await browser.close();

        // Pass to AI Extractor
        const extractedJobs = await this.extractor.extractJobs(structuralSummary, this.endpoint);

        const validJobs: JobResult[] = [];


        for (const rawJob of extractedJobs) {
            let validUrl = rawJob.url;
            try {
                // Ensure URL resolves, handle relative URLs
                const fullUrl = new URL(rawJob.url, this.endpoint);

                // Anti-hallucination: Ensure the URL matches the base domain (or is at least a valid URL if on a known sub-domain)
                // To be safe, we just check if it's a valid URL and not an empty string. Ideally, we might check it belongs to the company.
                validUrl = fullUrl.toString();

                if (!validUrl.startsWith('http')) continue;

                if (new URL(validUrl).hostname !== new URL(this.endpoint).hostname) continue;

            } catch {
                // Invalid URL
                continue;
            }

            // Map to JobResult
            const externalId = crypto.createHash('md5').update(validUrl).digest('hex');

            validJobs.push({
                externalId,
                title: rawJob.title,
                company: this.companyName,
                ...(rawJob.location ? { location: rawJob.location } : {}),
                description: 'Please visit the link for the full job description.', // We don't extract the full description yet
                url: validUrl,
                postedAt: new Date(), // We don't have posting date from summary
                skills: []
            });
        }

        // Cache valid jobs for 24 hours
        await connection.set(cacheKey, JSON.stringify(validJobs), 'EX', 86400);

        return this.filterJobs(validJobs, query);

      } catch (error) {
        if (browser) {
            await browser.close().catch(() => {});
        }

        if (attempt === this.retries) {
          throw new Error(`HtmlJobSource ${this.name} failed after ${this.retries} retries: ${error instanceof Error ? error.message : String(error)}`);
        }
        attempt++;
        // Small exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
    return [];
  }

  private filterJobs(jobs: JobResult[], query: JobSearchQuery): JobResult[] {
      let filtered = jobs;

      if (query.title) {
          const lowerQuery = query.title.toLowerCase();
          filtered = filtered.filter(j => j.title.toLowerCase().includes(lowerQuery));
      }

      if (query.location) {
          const lowerLoc = query.location.toLowerCase();
          filtered = filtered.filter(j => j.location && j.location.toLowerCase().includes(lowerLoc));
      }

      if (query.limit && query.limit > 0) {
          filtered = filtered.slice(0, query.limit);
      }

      return filtered;
  }
}
