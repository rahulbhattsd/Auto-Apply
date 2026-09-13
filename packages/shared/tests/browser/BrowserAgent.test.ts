import { test } from 'node:test';
import assert from 'node:assert';
import { BrowserAgent } from '../../src/browser/BrowserAgent.js';
import { MultiStepNavigation } from '../../src/browser/MultiStepNavigation.js';

test('BrowserAgent lifecycle', async () => {
  // Using a mock config or a fast timeout
  const agent = new BrowserAgent({ headless: true, launchTimeout: 5000 });
  await agent.init();
  const page = agent.getPage();
  assert.ok(page, 'Page should be initialized');
  await agent.close();
});

test('MultiStepNavigation identifies correct buttons', () => {
  const mockObservation: any = {
    buttons: [
      { text: 'Next', type: 'button', disabled: false, locator: 'button' },
      { text: 'Save & Continue', type: 'button', disabled: false, locator: 'button' },
      { text: 'Back', type: 'button', disabled: false, locator: 'button' },
      { text: 'Submit Application', type: 'submit', disabled: false, locator: 'button' },
    ]
  };

  const nextBtns = MultiStepNavigation.identifyNextButtons(mockObservation);
  assert.equal(nextBtns.length, 2);

  const prevBtns = MultiStepNavigation.identifyPreviousButtons(mockObservation);
  assert.equal(prevBtns.length, 1);
  assert.equal(prevBtns[0].text, 'Back');

  const submitBtns = MultiStepNavigation.identifySubmitButtons(mockObservation);
  assert.equal(submitBtns.length, 1);
  assert.equal(submitBtns[0].text, 'Submit Application');
});
