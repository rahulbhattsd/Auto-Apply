export type SemanticFieldMeaning =
  | 'PERSONAL_NAME'
  | 'PERSONAL_EMAIL'
  | 'PERSONAL_PHONE'
  | 'PERSONAL_ADDRESS'
  | 'PERSONAL_CITY'
  | 'PERSONAL_STATE'
  | 'PERSONAL_ZIP'
  | 'PERSONAL_COUNTRY'
  | 'WORK_EXPERIENCE_COMPANY'
  | 'WORK_EXPERIENCE_TITLE'
  | 'WORK_EXPERIENCE_START_DATE'
  | 'WORK_EXPERIENCE_END_DATE'
  | 'WORK_EXPERIENCE_DESCRIPTION'
  | 'EDUCATION_DEGREE'
  | 'EDUCATION_UNIVERSITY'
  | 'EDUCATION_START_DATE'
  | 'EDUCATION_END_DATE'
  | 'SKILL_TECHNICAL'
  | 'PREFERENCE_SALARY'
  | 'PREFERENCE_NOTICE_PERIOD'
  | 'PREFERENCE_LOCATION'
  | 'LEGAL_WORK_AUTHORIZATION'
  | 'LEGAL_SPONSORSHIP'
  | 'LINK_LINKEDIN'
  | 'LINK_GITHUB'
  | 'LINK_PORTFOLIO'
  | 'LINK_WEBSITE'
  | 'FILE_RESUME'
  | 'FILE_COVER_LETTER'
  | 'VOLUNTARY_EEO_GENDER'
  | 'VOLUNTARY_EEO_RACE'
  | 'VOLUNTARY_EEO_VETERAN'
  | 'VOLUNTARY_EEO_DISABILITY'
  | 'VOLUNTARY_EEO_PRONOUNS'
  | 'QUESTION_FREE_TEXT'
  | 'QUESTION_YES_NO'
  | 'QUESTION_DROPDOWN'
  | 'UNKNOWN';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export interface FieldMapping {
  fieldLocator: string;
  semanticMeaning: SemanticFieldMeaning;
  candidateValue: string | boolean | string[] | null;
  confidence: ConfidenceLevel;
  source: 'profile' | 'resume' | 'inferred' | 'fallback' | 'unknown';
  action: 'fill' | 'select' | 'check' | 'upload' | 'skip' | 'escalate';
}

export interface PlannedAction {
  type: 'fill' | 'select' | 'check' | 'upload' | 'click' | 'wait' | 'navigate';
  locator?: string;
  value?: string | boolean;
  filePath?: string;
  url?: string;
  duration?: number;
  description: string;
}
