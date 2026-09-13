import test from 'node:test';
import assert from 'node:assert';
import { CandidateKnowledgeResolver } from '../../src/intelligence/CandidateKnowledgeResolver.js';

test('CandidateKnowledgeResolver', async (t) => {
  const resolver = new CandidateKnowledgeResolver();

  await t.test('resolves simple facts from profile', () => {
    const context = { name: 'Alice Smith', phone: '555-1234' };

    let res = resolver.resolve('PERSONAL_NAME', context);
    assert.strictEqual(res.value, 'Alice Smith');
    assert.strictEqual(res.confidence, 'HIGH');

    res = resolver.resolve('PERSONAL_PHONE', context);
    assert.strictEqual(res.value, '555-1234');
    assert.strictEqual(res.confidence, 'HIGH');
  });

  await t.test('returns UNKNOWN for missing values', () => {
    const context = { name: 'Alice Smith' };
    const res = resolver.resolve('PERSONAL_PHONE', context);
    assert.strictEqual(res.value, null);
    assert.strictEqual(res.confidence, 'UNKNOWN');
  });

  await t.test('handles EEO questions securely', () => {
    const context = { name: 'Alice' }; // Candidate might even have demographic data here
    const res = resolver.resolve('VOLUNTARY_EEO_RACE', context);
    assert.strictEqual(res.value, 'Decline to answer');
    assert.strictEqual(res.confidence, 'HIGH');
  });
});
