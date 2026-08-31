import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { AnalysisPipeline } from '../src/AnalysisPipeline';
import { GroqProvider } from '../src/GroqProvider';
import { prisma } from '@autoapply/database';

describe('AnalysisPipeline', () => {
  it('should reject deterministically without calling AI for excluded keywords', async () => {
    let aiCalled = false;
    const mockAiProvider = {
      name: 'mock',
      analyzeJob: async () => {
        aiCalled = true;
        return { matchScore: 100, recommendation: 'APPLY', skillsMatched: [], skillsMissing: [], experienceMatch: null, educationMatch: null, locationMatch: null, reasoning: '' };
      }
    };

    const pipeline = new AnalysisPipeline(mockAiProvider as any);

    // Provide companyId null to avoid DB lookup since we can't reliably mock prisma findUnique cleanly in the current test runner setup
    const job = { id: 1, title: 'Dev', companyId: null, description: 'Requires Top Secret clearance', salaryMax: 100000, employmentType: 'Full-time' };
    const profile = { id: 1, minimumSalary: 50000, employmentTypes: ['Full-time'] };
    const policy = { excludedKeywords: ['Top Secret'], excludedCompanies: [] };

    const reason = await pipeline.runDeterministicFilter(job as any, profile as any, policy as any);

    assert.strictEqual(reason, 'Contains excluded keyword: Top Secret');
    assert.strictEqual(aiCalled, false);
  });

  it('should reject deterministically for below minimum salary', async () => {
    const pipeline = new AnalysisPipeline({} as any);

    const job = { description: 'stuff', salaryMax: 40000 };
    const profile = { minimumSalary: 60000, employmentTypes: [] };

    const reason = await pipeline.runDeterministicFilter(job as any, profile as any, null);

    assert.strictEqual(reason, 'Salary below minimum threshold');
  });
});
