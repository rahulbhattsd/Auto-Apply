import { Page } from 'playwright';
import { PageObserver } from '@autoapply/shared/src/browser/PageObserver.js';
import { BrowserAction } from '@autoapply/shared/src/browser/BrowserAction.js';
import { CandidateContext } from './CandidateKnowledgeResolver.js';
import { SemanticFieldMapper } from './SemanticFieldMapper.js';
import { ApplicationActionPlanner } from './ApplicationActionPlanner.js';
import { ActionExecutor } from './ActionExecutor.js';

export class FormCompletionEngine {
  private mapper: SemanticFieldMapper;
  private planner: ApplicationActionPlanner;

  constructor() {
    this.mapper = new SemanticFieldMapper();
    this.planner = new ApplicationActionPlanner();
  }

  async processPage(page: Page, candidate: CandidateContext, resumePath?: string): Promise<{ isComplete: boolean }> {
    const observer = new PageObserver(page);
    const browserAction = new BrowserAction(page);
    const executor = new ActionExecutor(browserAction, page);

    // Initial Observation
    const observation = await observer.observe();

    // Check for CAPTCHA/MFA
    const pageHtml = await page.content();
    if (pageHtml.includes('recaptcha') || pageHtml.includes('hcaptcha') || pageHtml.includes('cloudflare')) {
       throw new Error('CAPTCHA_DETECTED');
    }
    const mfaElements = await page.$$('input[name*="code"], input[name*="mfa"]');
    if (mfaElements.length > 0) {
       throw new Error('MFA_DETECTED');
    }

    if (observation.fields.length === 0 && observation.buttons.length === 0) {
       // Nothing to do
       return { isComplete: true };
    }

    // Understanding & Mapping
    const mappings = await this.mapper.mapFields(observation.fields, candidate);

    // Planning
    const actions = this.planner.plan(observation, mappings);

    if (actions.length === 0) {
       // Nothing to execute
       return { isComplete: true };
    }

    // Check if the last action is a final submit or just a next
    const isFinalSubmit = actions.some(a => a.type === 'click' && a.description.toLowerCase().includes('final submit'));

    // Execution
    await executor.execute(actions, resumePath);

    // We only consider the application complete if we just clicked a final submit
    return { isComplete: isFinalSubmit };
  }
}
