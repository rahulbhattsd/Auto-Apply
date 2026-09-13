import test from 'node:test';
import assert from 'node:assert';
import { ApplicationActionPlanner } from '../../src/intelligence/ApplicationActionPlanner.js';
import { FieldMapping } from '../../src/intelligence/types.js';
import { PageObservation } from '@autoapply/shared/src/browser/types.js';

test('ApplicationActionPlanner', async (t) => {
  const planner = new ApplicationActionPlanner();

  await t.test('plans actions based on mappings', () => {
    const observation: PageObservation = { url: 'http://test', title: 'test', buttons: [], links: [], fields: [
       { type: 'text', name: 'name', locator: '#name', disabled: false, required: true },
       { type: 'file', name: 'resume', locator: '#resume', disabled: false, required: true }
    ] };
    const mappings: FieldMapping[] = [
      { fieldLocator: '#name', semanticMeaning: 'PERSONAL_NAME', candidateValue: 'Alice', confidence: 'HIGH', source: 'profile', action: 'fill' },
      { fieldLocator: '#resume', semanticMeaning: 'FILE_RESUME', candidateValue: null, confidence: 'HIGH', source: 'inferred', action: 'upload' }
    ];

    const result = planner.plan(observation, mappings);
    assert.strictEqual(result.actions.length, 2);
    assert.strictEqual(result.actions[0].type, 'fill');
    assert.strictEqual(result.actions[0].locator, '#name');
    assert.strictEqual(result.actions[0].value, 'Alice');

    assert.strictEqual(result.actions[1].type, 'upload');
    assert.strictEqual(result.actions[1].locator, '#resume');
  });

  await t.test('prefers NEXT button over SUBMIT', () => {
    const observation: PageObservation = {
      url: 'http://test', title: 'test', links: [], fields: [],
      buttons: [
        { text: 'Final Submit', type: 'submit', locator: '#sub', disabled: false },
        { text: 'Continue / Next', type: 'button', locator: '#next', disabled: false }
      ]
    };

    const result = planner.plan(observation, []);
    assert.strictEqual(result.actions.length, 1);
    assert.strictEqual(result.actions[0].type, 'click');
    assert.strictEqual(result.actions[0].locator, '#next');
    assert.strictEqual(result.navigation, 'NEXT');
  });
});
