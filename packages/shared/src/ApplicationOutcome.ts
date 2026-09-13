export type ApplicationOutcome =
  | { type: 'CONTINUE' }
  | { type: 'READY_TO_SUBMIT'; submitLocator?: string }
  | { type: 'BLOCKED_REQUIRED_FIELD'; fields: string[] }
  | { type: 'HUMAN_VERIFICATION_REQUIRED'; reason: string }
  | { type: 'NO_ACTION' }
  | { type: 'FAILED'; reason: string }
  | { type: 'SUBMITTED'; evidence: unknown }
  | { type: 'CONFIRMED'; evidence: unknown };
