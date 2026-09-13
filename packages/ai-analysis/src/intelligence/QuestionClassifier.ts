import { env } from '@autoapply/config';
import { z } from 'zod';
import { SemanticFieldMeaning } from './types.js';

const ClassificationSchema = z.object({
  meaning: z.enum([
    'PERSONAL_NAME',
    'PERSONAL_EMAIL',
    'PERSONAL_PHONE',
    'PERSONAL_ADDRESS',
    'PERSONAL_CITY',
    'PERSONAL_STATE',
    'PERSONAL_ZIP',
    'PERSONAL_COUNTRY',
    'WORK_EXPERIENCE_COMPANY',
    'WORK_EXPERIENCE_TITLE',
    'WORK_EXPERIENCE_START_DATE',
    'WORK_EXPERIENCE_END_DATE',
    'WORK_EXPERIENCE_DESCRIPTION',
    'EDUCATION_DEGREE',
    'EDUCATION_UNIVERSITY',
    'EDUCATION_START_DATE',
    'EDUCATION_END_DATE',
    'SKILL_TECHNICAL',
    'PREFERENCE_SALARY',
    'PREFERENCE_NOTICE_PERIOD',
    'PREFERENCE_LOCATION',
    'LEGAL_WORK_AUTHORIZATION',
    'LEGAL_SPONSORSHIP',
    'LINK_LINKEDIN',
    'LINK_GITHUB',
    'LINK_PORTFOLIO',
    'LINK_WEBSITE',
    'FILE_RESUME',
    'FILE_COVER_LETTER',
    'VOLUNTARY_EEO_GENDER',
    'VOLUNTARY_EEO_RACE',
    'VOLUNTARY_EEO_VETERAN',
    'VOLUNTARY_EEO_DISABILITY',
    'VOLUNTARY_EEO_PRONOUNS',
    'QUESTION_FREE_TEXT',
    'QUESTION_YES_NO',
    'QUESTION_DROPDOWN',
    'UNKNOWN'
  ] as const)
});

export class QuestionClassifier {
  constructor() {
    // empty
  }

  async classify(questionText: string, context?: string): Promise<SemanticFieldMeaning> {
    if (!env.GROQ_API_KEY) {
      console.warn('GROQ_API_KEY is not set. QuestionClassifier returning UNKNOWN.');
      return 'UNKNOWN';
    }

    const systemPrompt = `You are an expert AI assistant that classifies application form questions into predefined semantic categories.
You must output a JSON object matching the following schema:
{
  "meaning": "CATEGORY_NAME"
}
Choose CATEGORY_NAME from the following list:
- PERSONAL_NAME, PERSONAL_EMAIL, PERSONAL_PHONE, PERSONAL_ADDRESS, PERSONAL_CITY, PERSONAL_STATE, PERSONAL_ZIP, PERSONAL_COUNTRY
- WORK_EXPERIENCE_COMPANY, WORK_EXPERIENCE_TITLE, WORK_EXPERIENCE_START_DATE, WORK_EXPERIENCE_END_DATE, WORK_EXPERIENCE_DESCRIPTION
- EDUCATION_DEGREE, EDUCATION_UNIVERSITY, EDUCATION_START_DATE, EDUCATION_END_DATE
- SKILL_TECHNICAL
- PREFERENCE_SALARY, PREFERENCE_NOTICE_PERIOD, PREFERENCE_LOCATION
- LEGAL_WORK_AUTHORIZATION, LEGAL_SPONSORSHIP
- LINK_LINKEDIN, LINK_GITHUB, LINK_PORTFOLIO, LINK_WEBSITE
- FILE_RESUME, FILE_COVER_LETTER
- VOLUNTARY_EEO_GENDER, VOLUNTARY_EEO_RACE, VOLUNTARY_EEO_VETERAN, VOLUNTARY_EEO_DISABILITY, VOLUNTARY_EEO_PRONOUNS
- QUESTION_FREE_TEXT, QUESTION_YES_NO, QUESTION_DROPDOWN
- UNKNOWN

If the question is ambiguous or you cannot confidently classify it, use UNKNOWN.
DO NOT use voluntary EEO categories for standard profile data; only use them if the question explicitly asks for EEO/diversity self-identification (e.g. Race, Veteran status, Gender/Sex).`;

    const userPrompt = `Question: "${questionText}"\nAdditional Context: ${context || 'None'}`;

    try {
      // Access the internal groq client since we need a generic completion
      // Using Groq SDK directly as the wrapper interface doesn't have a generic method
      const Groq = (await import('groq-sdk')).default;
      const client = new Groq({ apiKey: env.GROQ_API_KEY });
      const response = await client.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: env.GROQ_MODEL,
        temperature: 0,
        response_format: { type: "json_object" }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error('No content returned');
      const parsed = JSON.parse(content);
      const validated = ClassificationSchema.parse(parsed);
      return validated.meaning;
    } catch (error) {
      console.error('Question classification failed:', error);
      return 'UNKNOWN';
    }
  }
}
