import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeQuestion,
  mapQuestion,
  answerQuestion,
  CANONICAL_KEYS,
  HIGH_STAKES_KEYS,
  type CanonicalKey,
  type AnswerBank,
} from '../src/questions.js';

/**
 * GOLDEN TABLE.
 * Real phrasings seen on Naukri's chatbot and Glassdoor/ATS screening forms.
 * When a new phrasing shows up in production (see the
 * questionnaire_unmapped_total metric), add a row here FIRST, then fix the rules.
 */
const GOLDEN: Array<[string, CanonicalKey]> = [
  // notice_period
  ['What is your current notice period?', 'notice_period'],
  ['Notice period (in days)', 'notice_period'],
  ['How soon can you join?', 'notice_period'],
  ['What is your official notice period with your current employer?', 'notice_period'],
  ['Joining time required', 'notice_period'],
  ['Are you serving notice period currently?', 'notice_period'],

  // current_ctc
  ['What is your current CTC?', 'current_ctc'],
  ['Current annual salary (in LPA)', 'current_ctc'],
  ['Present CTC', 'current_ctc'],
  ['What is your current fixed compensation?', 'current_ctc'],
  ['Current CTC in Lacs', 'current_ctc'],

  // expected_ctc
  ['What is your expected CTC?', 'expected_ctc'],
  ['Expected salary', 'expected_ctc'],
  ['What are your compensation expectations for this role?', 'expected_ctc'],
  ['Expected CTC (in LPA)', 'expected_ctc'],
  ['Desired annual compensation', 'expected_ctc'],

  // total_experience
  ['Total years of experience', 'total_experience'],
  ['How many years of work experience do you have?', 'total_experience'],
  ['Total work experience (in years)', 'total_experience'],
  ['Overall experience', 'total_experience'],

  // relevant_experience
  ['How many years of relevant experience do you have in Python?', 'relevant_experience'],
  ['Relevant experience in years', 'relevant_experience'],
  ['Years of experience with React', 'relevant_experience'],

  // current_location
  ['What is your current location?', 'current_location'],
  ['Current city', 'current_location'],
  ['Where are you based currently?', 'current_location'],

  // preferred_locations
  ['Preferred job location', 'preferred_locations'],
  ['Which locations are you open to?', 'preferred_locations'],
  ['Preferred work location(s)', 'preferred_locations'],

  // willing_to_relocate
  ['Are you willing to relocate to Bengaluru?', 'willing_to_relocate'],
  ['Are you open to relocation?', 'willing_to_relocate'],
  ['Can you relocate for this role?', 'willing_to_relocate'],

  // highest_qualification
  ['What is your highest qualification?', 'highest_qualification'],
  ['Highest degree completed', 'highest_qualification'],
  ['Educational qualification', 'highest_qualification'],

  // graduation_year
  ['Year of graduation', 'graduation_year'],
  ['What year did you graduate?', 'graduation_year'],
  ['Passing year', 'graduation_year'],
  ['Batch year', 'graduation_year'],

  // current_employer
  ['Who is your current employer?', 'current_employer'],
  ['Current company name', 'current_employer'],
  ['Present organisation', 'current_employer'],

  // current_designation
  ['What is your current designation?', 'current_designation'],
  ['Current job title', 'current_designation'],
  ['Present role', 'current_designation'],

  // work_auth
  ['Are you legally authorized to work in India?', 'work_auth'],
  ['Do you require visa sponsorship?', 'work_auth'],
  ['Work authorization status', 'work_auth'],
];

/** These must NOT match any rule — they are genuine free text. */
const UNMAPPABLE = [
  'Why do you want to work at this company?',
  'Describe a challenging project you have shipped.',
  'Tell us about yourself.',
  'What interests you about this role?',
  'Describe your experience leading a team through an incident.',
];

describe('normalizeQuestion', () => {
  test('lowercases, strips punctuation, collapses whitespace', () => {
    assert.equal(normalizeQuestion('  What is your   CURRENT CTC?? '), 'what is your current ctc');
  });

  test('is idempotent', () => {
    const once = normalizeQuestion('Expected CTC (in LPA)?');
    assert.equal(normalizeQuestion(once), once);
  });

  test('handles non-breaking spaces and unicode dashes from real DOM text', () => {
    assert.equal(normalizeQuestion('Notice\u00a0period \u2013 in days'), 'notice period in days');
  });

  test('never returns an empty string for non-empty input', () => {
    assert.ok(normalizeQuestion('CTC?').length > 0);
  });
});

describe('mapQuestion golden table', () => {
  for (const [raw, expected] of GOLDEN) {
    test(`"${raw}" -> ${expected}`, () => {
      assert.equal(mapQuestion(raw), expected);
    });
  }

  test('every canonical key is covered by at least one golden row', () => {
    const covered = new Set(GOLDEN.map(([, k]) => k));
    const missing = CANONICAL_KEYS.filter((k) => !covered.has(k));
    assert.deepEqual(missing, [], `canonical keys with no golden coverage: ${missing.join(', ')}`);
  });

  for (const raw of UNMAPPABLE) {
    test(`free text stays unmapped: "${raw}"`, () => {
      assert.equal(mapQuestion(raw), null);
    });
  }

  test('does not confuse current_ctc with expected_ctc', () => {
    assert.equal(mapQuestion('Current CTC'), 'current_ctc');
    assert.equal(mapQuestion('Expected CTC'), 'expected_ctc');
  });

  test('does not confuse total with relevant experience', () => {
    assert.equal(mapQuestion('Total experience in years'), 'total_experience');
    assert.equal(mapQuestion('Relevant experience in years'), 'relevant_experience');
  });
});

describe('answerQuestion', () => {
  const bank: AnswerBank = {
    notice_period: 'Immediate',
    current_ctc: '0',
    expected_ctc: '8',
    total_experience: '0',
    current_location: 'Jabalpur',
    willing_to_relocate: 'Yes',
    graduation_year: '2026',
    highest_qualification: 'B.Tech Computer Science',
  };

  test('tier 1 answers from the bank without calling the classifier', async () => {
    let called = false;
    const res = await answerQuestion('What is your current notice period?', bank, {
      classify: async () => { called = true; return { canonicalKey: null, confidence: 0 }; },
    });
    assert.equal(called, false, 'rules matched, classifier must not be invoked');
    assert.deepEqual(res, { status: 'ANSWERED', key: 'notice_period', value: 'Immediate', source: 'RULES' });
  });

  test('a mapped key with no bank value is UNANSWERABLE, never invented', async () => {
    const res = await answerQuestion('What is your current designation?', bank);
    assert.equal(res.status, 'UNANSWERABLE');
    if (res.status === 'UNANSWERABLE') assert.equal(res.reason, 'NO_BANK_VALUE');
  });

  test('tier 2 classifier maps an unseen phrasing onto an existing key', async () => {
    const res = await answerQuestion('By when would you be able to come on board?', bank, {
      classify: async () => ({ canonicalKey: 'notice_period', confidence: 0.93 }),
      minConfidence: 0.8,
    });
    assert.equal(res.status, 'ANSWERED');
    if (res.status === 'ANSWERED') {
      assert.equal(res.key, 'notice_period');
      assert.equal(res.value, 'Immediate', 'value must come from the bank, not the model');
      assert.equal(res.source, 'LLM_CLASSIFIED');
    }
  });

  test('low-confidence classification is rejected', async () => {
    const res = await answerQuestion('Something ambiguous', bank, {
      classify: async () => ({ canonicalKey: 'expected_ctc', confidence: 0.4 }),
      minConfidence: 0.8,
    });
    assert.equal(res.status, 'UNANSWERABLE');
    if (res.status === 'UNANSWERABLE') assert.equal(res.reason, 'LOW_CONFIDENCE');
  });

  test('classifier returning a key outside CANONICAL_KEYS is rejected', async () => {
    const res = await answerQuestion('Odd question', bank, {
      classify: async () => ({ canonicalKey: 'blood_group' as CanonicalKey, confidence: 0.99 }),
    });
    assert.equal(res.status, 'UNANSWERABLE');
  });

  test('a classifier that throws degrades to UNANSWERABLE, not a crash', async () => {
    const res = await answerQuestion('Anything', bank, {
      classify: async () => { throw new Error('groq 429'); },
    });
    assert.equal(res.status, 'UNANSWERABLE');
  });

  test('free text requires approval by default', async () => {
    const res = await answerQuestion('Why do you want this role?', bank);
    assert.equal(res.status, 'UNANSWERABLE');
    if (res.status === 'UNANSWERABLE') {
      assert.ok(['NO_KEY_MATCH', 'FREE_TEXT_NEEDS_APPROVAL'].includes(res.reason));
    }
  });

  test('HIGH_STAKES keys are never answered from an empty bank', async () => {
    for (const key of HIGH_STAKES_KEYS) {
      const res = await answerQuestion(`What is your ${key.replace(/_/g, ' ')}?`, {}, {
        classify: async () => ({ canonicalKey: key, confidence: 1 }),
      });
      assert.equal(res.status, 'UNANSWERABLE', `${key} must not be fabricated`);
    }
  });
});
