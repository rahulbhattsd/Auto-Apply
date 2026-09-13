import { SemanticFieldMeaning } from './types.js';

export interface CandidateContext {
  name?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedin?: string | null;
  github?: string | null;
  portfolio?: string | null;
  user?: {
    email?: string | null;
  } | null;
  education?: unknown;
  experience?: unknown;
  skills?: unknown;
  projects?: unknown;
  certifications?: unknown;
  preferredRoles?: string[];
  preferredLocations?: string[];
  remotePreference?: string | null;
  minimumSalary?: number | null;
  maximumSalary?: number | null;
  [key: string]: unknown;
}

export interface ResolvedKnowledge {
  value: string | boolean | string[] | null;
  confidence: 'HIGH' | 'UNKNOWN';
  source: 'profile' | 'unknown';
}

export class CandidateKnowledgeResolver {
  resolve(meaning: SemanticFieldMeaning, candidate: CandidateContext): ResolvedKnowledge {
    if (meaning.startsWith('VOLUNTARY_EEO')) {
      // Hard rule: do not guess EEO questions. If we must map, return "Decline to answer"
      // Wait, the prompt says "do NOT automatically answer voluntary EEO/diversity questions using sensitive profile information."
      // The instructions say: "If a field asks for demographic data (like gender, race, veteran status, or disability status) AND is part of a voluntary self-identification, EEO, or diversity section, you MUST select "Decline to answer", "I prefer not to say", or equivalent. Do NOT use the candidate's stored demographic data for these fields."
      return { value: 'Decline to answer', confidence: 'HIGH', source: 'profile' };
    }

    let value: string | null = null;
    const confidence: 'HIGH' | 'UNKNOWN' = 'HIGH';
    const source: 'profile' | 'unknown' = 'profile';

    switch (meaning) {
      case 'PERSONAL_NAME':
        value = candidate.name ?? null;
        break;
      case 'PERSONAL_EMAIL':
        value = candidate.user?.email ?? null;
        break;
      case 'PERSONAL_PHONE':
        value = candidate.phone ?? null;
        break;
      case 'PERSONAL_CITY':
      case 'PERSONAL_ADDRESS':
      case 'PERSONAL_STATE':
      case 'PERSONAL_ZIP':
      case 'PERSONAL_COUNTRY':
      case 'PREFERENCE_LOCATION':
        value = candidate.location ?? null;
        // In a real system, you'd parse `candidate.location` to separate city/state/zip
        break;
      case 'LINK_LINKEDIN':
        value = candidate.linkedin ?? null;
        break;
      case 'LINK_GITHUB':
        value = candidate.github ?? null;
        break;
      case 'LINK_PORTFOLIO':
      case 'LINK_WEBSITE':
        value = candidate.portfolio ?? null;
        break;
      case 'PREFERENCE_SALARY':
        value = candidate.minimumSalary !== undefined && candidate.minimumSalary !== null ? String(candidate.minimumSalary) : null;
        break;
      // Below requires parsing `experience`, `education`, `skills` JSON
      // This implementation acts defensively and returns UNKNOWN for complex fields not directly accessible
      // without further AI/deterministic parsing in this basic resolver.
      case 'WORK_EXPERIENCE_COMPANY':
      case 'WORK_EXPERIENCE_TITLE':
      case 'EDUCATION_DEGREE':
      case 'EDUCATION_UNIVERSITY':
      case 'SKILL_TECHNICAL':
      case 'PREFERENCE_NOTICE_PERIOD':
      case 'LEGAL_WORK_AUTHORIZATION':
      case 'LEGAL_SPONSORSHIP':
      case 'QUESTION_FREE_TEXT':
      case 'QUESTION_YES_NO':
      case 'QUESTION_DROPDOWN':
      case 'UNKNOWN':
      default:
        value = null;
        break;
    }

    if (value === null || value === undefined) {
      return { value: null, confidence: 'UNKNOWN', source: 'unknown' };
    }

    return { value: String(value), confidence, source };
  }
}
