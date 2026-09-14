import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FresherRoleFilter } from '../src/FresherRoleFilter';

describe('FresherRoleFilter', () => {
  it('should accept clear fresher and entry-level titles', () => {
    const testCases = [
      'Junior Software Engineer',
      'Graduate Engineer Trainee - Backend',
      'SDE-1 (Frontend)',
      'SDE 1 - Core Services',
      'Software Engineer I',
      'Software Development Engineer 1',
      'Associate Software Engineer',
      'Software Engineering Intern',
      'Campus Hire - 2025/2026',
      'Fresher Software Developer',
      'Entry Level QA Engineer',
    ];

    for (const title of testCases) {
      const result = FresherRoleFilter.evaluate({ title });
      assert.strictEqual(result.eligible, true, `Expected "${title}" to be eligible`);
      assert.ok(result.score >= 80, `Expected score >= 80 for "${title}"`);
    }
  });

  it('should strictly reject senior, lead, and executive roles', () => {
    const testCases = [
      'Senior Software Engineer',
      'Sr. SDE 1 (mixed signals)',
      'Staff Software Engineer',
      'Principal Architect',
      'Lead Backend Developer',
      'Engineering Manager',
      'Director of Engineering',
      'VP of Product & Tech',
      'Head of Mobile',
      'Software Engineer (8+ years experience)',
    ];

    for (const title of testCases) {
      const result = FresherRoleFilter.evaluate({ title });
      assert.strictEqual(result.eligible, false, `Expected "${title}" to be rejected`);
      assert.strictEqual(result.score <= 20, true, `Expected low score for "${title}"`);
    }
  });

  it('should accept neutral software engineering roles if no senior disqualifiers found', () => {
    const result = FresherRoleFilter.evaluate({
      title: 'Software Engineer',
      description: 'Join our backend engineering team. We welcome passionate problem solvers.',
    });
    assert.strictEqual(result.eligible, true);
    assert.ok(result.score >= 60);
  });

  it('should reject neutral roles if description requires high years of experience', () => {
    const result = FresherRoleFilter.evaluate({
      title: 'Software Engineer',
      description: 'Requires 5+ years of experience with distributed systems and Kubernetes.',
    });
    assert.strictEqual(result.eligible, false);
  });
});
