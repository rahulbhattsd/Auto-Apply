/**
 * Shared screening-question handling. Used by naukri, glassdoor and any future provider.
 *
 * Design rule the tests enforce: the LLM may CLASSIFY a question onto a canonical key,
 * but it must never AUTHOR a factual answer. Values come from the user's AnswerBank.
 */

export const CANONICAL_KEYS = [
  'notice_period',
  'current_ctc',
  'expected_ctc',
  'total_experience',
  'relevant_experience',
  'current_location',
  'preferred_locations',
  'willing_to_relocate',
  'highest_qualification',
  'graduation_year',
  'current_employer',
  'current_designation',
  'work_auth',
] as const;

export type CanonicalKey = (typeof CANONICAL_KEYS)[number];

/** Keys where a wrong value materially misrepresents the candidate. Never guessed. */
export const HIGH_STAKES_KEYS: readonly CanonicalKey[] = [
  'current_ctc',
  'expected_ctc',
  'notice_period',
  'total_experience',
  'relevant_experience',
  'graduation_year',
];

export type AnswerBank = Partial<Record<CanonicalKey, string>>;

export type AnswerResult =
  | { status: 'ANSWERED'; key: CanonicalKey; value: string; source: 'RULES' | 'LLM_CLASSIFIED' }
  | { status: 'UNANSWERABLE'; reason: 'NO_KEY_MATCH' | 'NO_BANK_VALUE' | 'LOW_CONFIDENCE' | 'FREE_TEXT_NEEDS_APPROVAL' };

/** Lowercase, strip punctuation, collapse whitespace, drop a trailing question mark. */
export function normalizeQuestion(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2010-\u2015\u2212\uFF0D-]/g, ' ')
    .replace(/[^\w\s]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tier 1: deterministic rules only. Returns null when no rule matches. */
export function mapQuestion(raw: string): CanonicalKey | null {
  const norm = normalizeQuestion(raw);
  if (!norm) return null;

  // notice_period
  if (
    norm.includes('notice period') ||
    norm.includes('how soon can you join') ||
    norm.includes('joining time')
  ) {
    return 'notice_period';
  }

  // current_ctc vs expected_ctc
  if (
    norm.includes('current ctc') ||
    norm.includes('present ctc') ||
    norm.includes('current annual salary') ||
    norm.includes('current fixed compensation') ||
    norm.includes('current salary')
  ) {
    return 'current_ctc';
  }

  if (
    norm.includes('expected ctc') ||
    norm.includes('expected salary') ||
    norm.includes('compensation expectations') ||
    norm.includes('desired annual compensation')
  ) {
    return 'expected_ctc';
  }

  // relevant_experience vs total_experience
  if (
    norm.includes('relevant experience') ||
    norm.includes('years of experience with') ||
    norm.includes('experience do you have in')
  ) {
    return 'relevant_experience';
  }

  if (
    norm.includes('total experience') ||
    norm.includes('total years of experience') ||
    norm.includes('total work experience') ||
    norm.includes('overall experience') ||
    norm.includes('years of work experience do you have')
  ) {
    return 'total_experience';
  }

  // preferred_locations vs current_location
  if (
    norm.includes('preferred job location') ||
    norm.includes('preferred work location') ||
    norm.includes('which locations are you open to')
  ) {
    return 'preferred_locations';
  }

  if (
    norm.includes('current location') ||
    norm.includes('current city') ||
    norm.includes('where are you based currently')
  ) {
    return 'current_location';
  }

  // willing_to_relocate
  if (
    norm.includes('willing to relocate') ||
    norm.includes('open to relocation') ||
    norm.includes('can you relocate')
  ) {
    return 'willing_to_relocate';
  }

  // highest_qualification
  if (
    norm.includes('highest qualification') ||
    norm.includes('highest degree') ||
    norm.includes('educational qualification')
  ) {
    return 'highest_qualification';
  }

  // graduation_year
  if (
    norm.includes('graduation') ||
    norm.includes('graduate') ||
    norm.includes('passing year') ||
    norm.includes('batch year')
  ) {
    return 'graduation_year';
  }

  // current_employer
  if (
    norm.includes('current employer') ||
    norm.includes('current company') ||
    norm.includes('present organisation') ||
    norm.includes('present organization')
  ) {
    return 'current_employer';
  }

  // current_designation
  if (
    norm.includes('current designation') ||
    norm.includes('current job title') ||
    norm.includes('present role')
  ) {
    return 'current_designation';
  }

  // work_auth
  if (
    norm.includes('authorized to work') ||
    norm.includes('authorised to work') ||
    norm.includes('visa sponsorship') ||
    norm.includes('work authorization') ||
    norm.includes('work authorisation')
  ) {
    return 'work_auth';
  }

  return null;
}

export interface ClassifierResult {
  canonicalKey: CanonicalKey | null;
  confidence: number;
}

export interface AnswerOptions {
  /** Tier 2. Injected so tests never call Groq. */
  classify?: (question: string) => Promise<ClassifierResult>;
  /** Below this, fall through to UNANSWERABLE. */
  minConfidence?: number;
  /** Default true: drafted free-text answers require human approval. */
  requireApprovalForFreeText?: boolean;
}

export async function answerQuestion(
  raw: string,
  bank: AnswerBank,
  opts?: AnswerOptions,
): Promise<AnswerResult> {
  const mappedKey = mapQuestion(raw);
  if (mappedKey) {
    const val = bank[mappedKey];
    if (val !== undefined && val !== null && val !== '') {
      return { status: 'ANSWERED', key: mappedKey, value: val, source: 'RULES' };
    }
    return { status: 'UNANSWERABLE', reason: 'NO_BANK_VALUE' };
  }

  if (opts?.classify) {
    try {
      const classified = await opts.classify(raw);
      if (
        classified.canonicalKey &&
        (CANONICAL_KEYS as readonly string[]).includes(classified.canonicalKey)
      ) {
        const minConf = opts.minConfidence ?? 0.8;
        if (classified.confidence < minConf) {
          return { status: 'UNANSWERABLE', reason: 'LOW_CONFIDENCE' };
        }
        const val = bank[classified.canonicalKey];
        if (val !== undefined && val !== null && val !== '') {
          return {
            status: 'ANSWERED',
            key: classified.canonicalKey,
            value: val,
            source: 'LLM_CLASSIFIED',
          };
        }
        return { status: 'UNANSWERABLE', reason: 'NO_BANK_VALUE' };
      }
      return { status: 'UNANSWERABLE', reason: 'NO_KEY_MATCH' };
    } catch {
      return { status: 'UNANSWERABLE', reason: 'NO_KEY_MATCH' };
    }
  }

  return { status: 'UNANSWERABLE', reason: 'NO_KEY_MATCH' };
}

