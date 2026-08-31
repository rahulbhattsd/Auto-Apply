import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert';
import { NormalizationService } from '../src/NormalizationService';
import { MockJobSource } from '../src/MockJobSource';

describe('NormalizationService', () => {
  let service: NormalizationService;
  let mockSource: MockJobSource;

  beforeEach(() => {
    service = new NormalizationService();
    mockSource = new MockJobSource();
  });

  it('should generate same canonical fingerprint for same job data', () => {
    const job1 = {
      externalId: '1', title: 'Developer', company: 'Corp', location: 'Remote', description: 'desc', url: 'https://example.com/job', postedAt: new Date(), skills: []
    };

    // Different external ID but same canonical fields
    const job2 = {
      externalId: '2', title: ' Developer ', company: 'corp', location: 'remote', description: 'desc2', url: 'https://example.com/job', postedAt: new Date(), skills: []
    };

    const fingerprint1 = service.generateFingerprint(job1);
    const fingerprint2 = service.generateFingerprint(job2);

    assert.strictEqual(fingerprint1, fingerprint2);
  });
});
