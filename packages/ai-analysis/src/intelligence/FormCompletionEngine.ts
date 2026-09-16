import { Page } from 'playwright';
import { PageObserver, ApplicationOutcome } from '@autoapply/shared';
import { BrowserAction } from '@autoapply/shared';
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

  async processPage(page: Page, candidate: CandidateContext, resumePath?: string): Promise<ApplicationOutcome> {
    const observer = new PageObserver(page);
    const browserAction = new BrowserAction(page);
    const executor = new ActionExecutor(browserAction, page);

    // Initial Observation
    const observation = await observer.observe();

    // Check for CAPTCHA/MFA
    const pageHtml = await page.content();
    if (pageHtml.includes('recaptcha') || pageHtml.includes('hcaptcha') || pageHtml.includes('cloudflare')) {
       return { type: 'HUMAN_VERIFICATION_REQUIRED', reason: 'CAPTCHA_DETECTED' };
    }
    const mfaElements = await page.$$('input[name*="code" i], input[name*="mfa" i], input[name*="otp" i], input[id*="otp" i], input[name*="2fa" i], input[autocomplete="one-time-code"]');
    if (mfaElements.length > 0) {
       return { type: 'HUMAN_VERIFICATION_REQUIRED', reason: 'MFA_DETECTED' };
    }

    if (observation.fields.length === 0 && observation.buttons.length === 0) {
       return { type: 'NO_ACTION' };
    }

    // Understanding & Mapping
    const mappings = await this.mapper.mapFields(observation.fields, candidate);

    // Planning
    const { actions, navigation } = this.planner.plan(observation, mappings);

    // Execute Fill Actions (everything except navigation clicks)
    const fillActions = actions.filter(a => a.type !== 'click');
    const navActions = actions.filter(a => a.type === 'click');

    if (fillActions.length > 0) {
        await executor.execute(fillActions, resumePath);
    }

    // Re-observe state after fills
    const postFillObservation = await observer.observe();

    // Validation Check: ensure no required fields are left unfilled
    // A required field is unfilled if it's empty, or in a radio group where nothing is selected
    const missingRequired: string[] = [];

    // Group fields by name to handle radio button groups properly
    const fieldsByName = new Map<string, typeof postFillObservation.fields>();
    for (const f of postFillObservation.fields) {
        if (!fieldsByName.has(f.name)) {
            fieldsByName.set(f.name, []);
        }
        fieldsByName.get(f.name)!.push(f);
    }

    for (const [name, fields] of fieldsByName.entries()) {
        const isRequiredGroup = fields.some(f => f.required);
        if (!isRequiredGroup) continue;

        let hasValue = false;
        for (const f of fields) {
            if (f.type === 'checkbox' || f.type === 'radio') {
                if (f.value === true) hasValue = true;
            } else if (f.value !== undefined && String(f.value).trim() !== '') {
                hasValue = true;
            }
        }

        if (!hasValue) {
            // Pick a label to report
            const firstField = fields[0];
            if (firstField) {
                const labelToReport = firstField.label || name || firstField.locator;
                missingRequired.push(labelToReport);
            }
        }
    }

    if (missingRequired.length > 0) {
       return { type: 'BLOCKED_REQUIRED_FIELD', fields: missingRequired };
    }

    if (navigation === 'FINAL_SUBMIT') {
       // Do not click the submit button. Return the locator to the orchestrator.
       const submitLocator = navActions.find(a => a.type === 'click')?.locator;
       if (!submitLocator) {
           return { type: 'FAILED', reason: 'MISSING_SUBMIT_LOCATOR' };
       }
       return { type: 'READY_TO_SUBMIT', submitLocator };
    } else if (navigation === 'NEXT') {
       // Execute Navigation Action
       if (navActions.length > 0) {
          await executor.execute(navActions);
       }
       return { type: 'CONTINUE' };
    }

    return { type: 'NO_ACTION' };
  }
}
