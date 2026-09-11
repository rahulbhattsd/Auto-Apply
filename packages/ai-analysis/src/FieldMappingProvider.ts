import { z } from 'zod';
import Groq from 'groq-sdk';
import { env } from '@autoapply/config';

export interface FormField {
  tagName: string;
  type?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  associatedLabelText?: string;
  required?: boolean;
  options?: string[];
}

export interface FieldMappingResult {
  mapping: Record<string, string>;
}

const FieldMappingSchema = z.object({
  mapping: z.record(z.string())
});

export class FieldMappingProvider {
  name = 'groq-field-mapping';
  private client?: Groq;

  private getClient(): Groq {
    if (!env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is required for field mapping');
    }

    this.client ??= new Groq({
      apiKey: env.GROQ_API_KEY,
    });

    return this.client;
  }

  async mapFields(fields: FormField[], candidateData: any): Promise<FieldMappingResult> {
    const systemPrompt = `You are an expert AI assistant that helps automate job applications by mapping known candidate profile data to form fields on a career page.
Your task is to analyze a list of form fields and the candidate's profile, and output ONLY a valid JSON object matching the following schema:
{
  "mapping": { "cssSelector": "valueToFill" }
}
For the "cssSelector", use the most specific and robust selector available from the field data (e.g., 'input[name="firstName"]' or '#email').
For the "valueToFill", use the EXACT string value from the candidate data that matches the field's intent.
CRITICAL INSTRUCTIONS:
1. If a field's purpose is ambiguous or it doesn't correspond to any known candidate attribute, OMIT it from the mapping entirely - do not guess a value.
2. Only output string values. Do not output booleans, arrays, or objects in the values.
3. Do NOT invent, hallucinate, or fabricate any data that is not explicitly present in the candidate data.
4. VOLUNTARY / DIVERSITY FIELDS: If a field asks for demographic data (like gender, race, veteran status, or disability status) AND is part of a voluntary self-identification, EEO, or diversity section, you MUST select "Decline to answer", "I prefer not to say", or equivalent. Do NOT use the candidate's stored demographic data for these fields. Only use candidate demographic data if it is a standard, required form field clearly separate from voluntary EEO surveys.
5. Output ONLY the JSON object, no markdown, no explanation.`;

    const candidateContext = `Candidate Data:\n${JSON.stringify(candidateData, null, 2)}`;
    const fieldsContext = `Form Fields:\n${JSON.stringify(fields, null, 2)}`;

    try {
      const response = await this.getClient().chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: candidateContext },
          { role: 'user', content: fieldsContext }
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
      const validated = FieldMappingSchema.parse(parsed);

      return validated as FieldMappingResult;
    } catch (error) {
      throw new Error(`Field mapping failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
