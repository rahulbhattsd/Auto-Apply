import test from 'node:test';
import assert from 'node:assert';
import { ApplicationActionPlanner } from '../../src/intelligence/ApplicationActionPlanner.js';
import { FieldMapping } from '../../src/intelligence/types.js';
import { PageObservation } from '@autoapply/shared/src/browser/types.js';

test('ApplicationActionPlanner', async (t) => {
  const planner = new ApplicationActionPlanner();

  await t.test('plans actions based on mappings', () => {
    const observation: PageObservation = { url: 'http://test', title: 'test', fields: [], buttons: [], links: [] };
    const mappings: FieldMapping[] = [
      { fieldLocator: '#name', semanticMeaning: 'PERSONAL_NAME', candidateValue: 'Alice', confidence: 'HIGH', source: 'profile', action: 'fill' },
      { fieldLocator: '#resume', semanticMeaning: 'FILE_RESUME', candidateValue: null, confidence: 'HIGH', source: 'inferred', action: 'upload' }
    ];

    const actions = planner.plan(observation, mappings);
    assert.strictEqual(actions.length, 2);
    assert.strictEqual(actions[0].type, 'fill');
    assert.strictEqual(actions[0].locator, '#name');
    assert.strictEqual(actions[0].value, 'Alice');

    assert.strictEqual(actions[1].type, 'upload');
    assert.strictEqual(actions[1].locator, '#resume');
  });

  await t.test('blocks submission on unresolved required fields', () => {
    const observation: PageObservation = {
      url: 'http://test', title: 'test', links: [], buttons: [],
      fields: [
        { type: 'text', name: 'salary', required: true, locator: '#salary', disabled: false }
      ]
    };
    const mappings: FieldMapping[] = [
      { fieldLocator: '#salary', semanticMeaning: 'PREFERENCE_SALARY', candidateValue: null, confidence: 'LOW', source: 'unknown', action: 'fill' }
    ];

    assert.throws(() => {
      planner.plan(observation, mappings);
    }, /UNKNOWN_REQUIRED_FIELD/);
  });

  await t.test('prefers NEXT button over SUBMIT', () => {
    const observation: PageObservation = {
      url: 'http://test', title: 'test', links: [], fields: [],
      buttons: [
        { text: 'Final Submit', type: 'submit', locator: '#sub', disabled: false },
        { text: 'Continue / Next', type: 'button', locator: '#next', disabled: false }
      ]
    };

    const actions = planner.plan(observation, []);
    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].type, 'click');
    assert.strictEqual(actions[0].locator, '#next');
  });
});
