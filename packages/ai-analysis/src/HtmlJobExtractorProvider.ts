import { z } from 'zod';
import Groq from 'groq-sdk';
import { env } from '@autoapply/config';

export interface ExtractedJob {
  title: string;
  url: string;
  location?: string | undefined;
}

const ExtractedJobsSchema = z.object({
  jobs: z.array(z.object({
    title: z.string().min(1),
    url: z.string().min(1),
    location: z.string().optional()
  }))
});

export class HtmlJobExtractorProvider {
  name = 'groq-html-job-extractor';
  private client?: Groq;

  private getClient(): Groq {
    if (!env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is required for HTML job extraction');
    }

    this.client ??= new Groq({
      apiKey: env.GROQ_API_KEY,
    });

    return this.client;
  }

  async extractJobs(structuralHtml: string, baseUrl: string): Promise<ExtractedJob[]> {
    const systemPrompt = `You are an expert AI assistant that helps automate job discovery by extracting job postings from career pages.
Your task is to analyze a lightweight structural summary of a career page (headings, links, repeated card-like DOM patterns) and output ONLY a valid JSON object matching the following schema:
{
  "jobs": [
    {
      "title": "Job Title",
      "url": "Link to job posting",
      "location": "Location (if available)"
    }
  ]
}

CRITICAL INSTRUCTIONS:
1. Identify elements that represent open job postings.
2. Extract the job title and the URL to the full job description.
3. If available, extract the location.
4. Do NOT invent, hallucinate, or fabricate any postings that are not explicitly present in the structural summary.
5. If the model can't confidently identify job listings (e.g. no open roles are listed), return an empty array for "jobs".
6. Output ONLY the JSON object, no markdown, no explanation.`;

    const pageContext = `Base URL: ${baseUrl}\n\nStructural Summary:\n${structuralHtml}`;

    try {
      const response = await this.getClient().chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: pageContext }
        ],
        model: env.GROQ_MODEL,
        temperature: 0,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content returned from Groq');
      }

      const parsed = JSON.parse(content);
      const validated = ExtractedJobsSchema.parse(parsed);

      return validated.jobs;
    } catch (error) {
      throw new Error(`HTML job extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
