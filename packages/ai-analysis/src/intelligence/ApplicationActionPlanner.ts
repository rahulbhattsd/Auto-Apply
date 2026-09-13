import { PageObservation, PageButton } from '@autoapply/shared/src/browser/types.js';
import { FieldMapping, PlannedAction } from './types.js';

export class ApplicationActionPlanner {
  plan(observation: PageObservation, mappings: FieldMapping[]): PlannedAction[] {
    const actions: PlannedAction[] = [];
    const missingRequired: string[] = [];

    // Plan field interactions
    for (const mapping of mappings) {
      if (mapping.confidence === 'LOW' || mapping.confidence === 'UNKNOWN') {
        const field = observation.fields.find(f => f.locator === mapping.fieldLocator);
        if (field?.required) {
           missingRequired.push(field.label || field.name || mapping.fieldLocator);
        }
        continue; // Skip filling unknown fields
      }

      if (mapping.action === 'upload' && mapping.semanticMeaning === 'FILE_RESUME') {
        actions.push({
          type: 'upload',
          locator: mapping.fieldLocator,
          description: `Upload resume to ${mapping.fieldLocator}`
        });
      } else if (mapping.candidateValue !== null) {
        if (mapping.action === 'check') {
           // Basic heuristic for boolean true/false or specific option checking
           // In a full implementation, you'd find the exact radio/checkbox value matching candidateValue
           actions.push({
             type: 'check',
             locator: mapping.fieldLocator,
             value: true,
             description: `Check field ${mapping.fieldLocator}`
           });
        } else {
           actions.push({
             type: mapping.action as PlannedAction['type'],
             locator: mapping.fieldLocator,
             value: mapping.candidateValue as string,
             description: `${mapping.action === 'select' ? 'Select' : 'Fill'} ${mapping.candidateValue} in ${mapping.fieldLocator}`
           });
        }
      }
    }

    // Determine NEXT vs SUBMIT
    let finalSubmitBtn: PageButton | null = null;
    let nextBtn: PageButton | null = null;

    for (const btn of observation.buttons) {
      const text = btn.text.toLowerCase();
      if (text.includes('submit') || text.includes('apply') || text.includes('finish')) {
        finalSubmitBtn = btn;
      } else if (text.includes('next') || text.includes('continue')) {
        nextBtn = btn;
      }
    }

    if (missingRequired.length > 0) {
      throw new Error(`UNKNOWN_REQUIRED_FIELD:${missingRequired.join(',')}`);
    }

    // Prefer Next over Submit if both are present (multi-step form heuristic)
    if (nextBtn) {
      actions.push({
        type: 'click',
        locator: nextBtn.locator,
        description: `Click Next button: ${nextBtn.text}`
      });
    } else if (finalSubmitBtn) {
      actions.push({
        type: 'click',
        locator: finalSubmitBtn.locator,
        description: `Click Final Submit button: ${finalSubmitBtn.text}`
      });
    } else {
      // Fallback: look for generic submit type button
      const fallback = observation.buttons.find(b => b.type === 'submit');
      if (fallback) {
         actions.push({
            type: 'click',
            locator: fallback.locator,
            description: `Click generic submit button: ${fallback.text}`
         });
      }
    }

    return actions;
  }
}
