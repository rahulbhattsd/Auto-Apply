import { PageObservation, PageButton } from './types.js';

export class MultiStepNavigation {
  /**
   * Identifies buttons that likely proceed to the next step.
   */
  static identifyNextButtons(observation: PageObservation): PageButton[] {
    const nextKeywords = ['next', 'continue', 'save & continue', 'save and continue', 'proceed'];
    return observation.buttons.filter(btn =>
      nextKeywords.some(keyword => btn.text.toLowerCase().includes(keyword))
    );
  }

  /**
   * Identifies buttons that likely go back to the previous step.
   */
  static identifyPreviousButtons(observation: PageObservation): PageButton[] {
    const prevKeywords = ['previous', 'back', 'go back'];
    return observation.buttons.filter(btn =>
      prevKeywords.some(keyword => btn.text.toLowerCase().includes(keyword))
    );
  }

  /**
   * Identifies buttons that likely submit the final application.
   */
  static identifySubmitButtons(observation: PageObservation): PageButton[] {
    const submitKeywords = ['submit', 'finish', 'complete application', 'apply'];
    // Avoid classifying "next" as submit if both are present in the text somehow
    return observation.buttons.filter(btn => {
      const text = btn.text.toLowerCase();
      return submitKeywords.some(keyword => text.includes(keyword)) &&
             !['next', 'continue'].some(keyword => text.includes(keyword));
    });
  }
}
