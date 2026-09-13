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
  noticePeriod?: string | null;
  workAuthorization?: string | null;
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
      case 'WORK_EXPERIENCE_COMPANY':
        if (Array.isArray(candidate.experience) && candidate.experience.length > 0) {
          value = candidate.experience[0].company ?? null;
        }
        break;
      case 'WORK_EXPERIENCE_TITLE':
        if (Array.isArray(candidate.experience) && candidate.experience.length > 0) {
          value = candidate.experience[0].title ?? null;
        }
        break;
      case 'WORK_EXPERIENCE_START_DATE':
        if (Array.isArray(candidate.experience) && candidate.experience.length > 0) {
          value = candidate.experience[0].startDate ?? null;
        }
        break;
      case 'WORK_EXPERIENCE_END_DATE':
        if (Array.isArray(candidate.experience) && candidate.experience.length > 0) {
           value = candidate.experience[0].endDate ?? null;
        }
        break;
      case 'EDUCATION_DEGREE':
        if (Array.isArray(candidate.education) && candidate.education.length > 0) {
          value = candidate.education[0].degree ?? null;
        }
        break;
      case 'EDUCATION_UNIVERSITY':
        if (Array.isArray(candidate.education) && candidate.education.length > 0) {
          value = candidate.education[0].university ?? null;
        }
        break;
      case 'EDUCATION_START_DATE':
        if (Array.isArray(candidate.education) && candidate.education.length > 0) {
          value = candidate.education[0].startDate ?? null;
        }
        break;
      case 'EDUCATION_END_DATE':
        if (Array.isArray(candidate.education) && candidate.education.length > 0) {
          value = candidate.education[0].endDate ?? null;
        }
        break;
      case 'SKILL_TECHNICAL':
        if (Array.isArray(candidate.skills)) {
          value = candidate.skills.join(', ');
        }
        break;
      case 'PREFERENCE_NOTICE_PERIOD':
        value = (candidate.noticePeriod as string) ?? null;
        break;
      case 'LEGAL_WORK_AUTHORIZATION':
      case 'LEGAL_SPONSORSHIP':
        value = (candidate.workAuthorization as string) ?? null;
        break;
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
