import { describe, it } from 'node:test';
import assert from 'node:assert';
import { VALID_TRANSITIONS } from './index.js';

describe('Application Engine State Machine', () => {
  it('should allow valid transitions', () => {
    assert.ok(VALID_TRANSITIONS['DISCOVERED']?.includes('ANALYZING'));
    assert.ok(VALID_TRANSITIONS['QUEUED']?.includes('RESUME_GENERATING'));
  });

  it('should reject illegal jumps', () => {
    assert.ok(!VALID_TRANSITIONS['DISCOVERED']?.includes('VERIFIED'));
    assert.ok(!VALID_TRANSITIONS['ANALYZING']?.includes('APPLYING'));
  });
});
