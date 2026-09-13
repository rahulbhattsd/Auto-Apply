import { PageObservation, PageButton } from '@autoapply/shared/src/browser/types.js';
import { FieldMapping, PlannedAction } from './types.js';

export class ApplicationActionPlanner {
  plan(observation: PageObservation, mappings: FieldMapping[]): { actions: PlannedAction[], navigation: 'NEXT' | 'FINAL_SUBMIT' | 'NO_ACTION' } {
    const actions: PlannedAction[] = [];

    // Plan field interactions
    for (const mapping of mappings) {
      if (mapping.confidence === 'LOW' || mapping.confidence === 'UNKNOWN') {
        continue; // Skip filling unknown fields
      }

      const field = observation.fields.find(f => f.locator === mapping.fieldLocator);
      if (!field) continue;

      if (mapping.action === 'upload' && mapping.semanticMeaning === 'FILE_RESUME') {
        actions.push({
          type: 'upload',
          locator: mapping.fieldLocator,
          description: `Upload resume to ${mapping.fieldLocator}`
        });
      } else if (mapping.candidateValue !== null) {
        if (mapping.action === 'check') {
           const candidateStr = String(mapping.candidateValue).toLowerCase().trim();
           let shouldCheck = false;

           // If it's a strict boolean true
           if (mapping.candidateValue === true || candidateStr === 'true' || candidateStr === 'yes') {
              if (field.htmlValue?.toLowerCase() === 'true' || field.htmlValue?.toLowerCase() === 'yes' || !field.htmlValue) {
                  shouldCheck = true;
              }
           }

           // Match against HTML value or label
           if (!shouldCheck && field.htmlValue) {
               if (field.htmlValue.toLowerCase().trim() === candidateStr) {
                   shouldCheck = true;
               }
           }
           if (!shouldCheck && field.label) {
               if (field.label.toLowerCase().trim().includes(candidateStr) || candidateStr.includes(field.label.toLowerCase().trim())) {
                   shouldCheck = true;
               }
           }

           if (shouldCheck) {
               actions.push({
                 type: 'check',
                 locator: mapping.fieldLocator,
                 value: true,
                 description: `Check field ${mapping.fieldLocator}`
               });
           }
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

    let navigation: 'NEXT' | 'FINAL_SUBMIT' | 'NO_ACTION' = 'NO_ACTION';

    // Prefer Next over Submit if both are present (multi-step form heuristic)
    if (nextBtn) {
      actions.push({
        type: 'click',
        locator: nextBtn.locator,
        description: `Click Next button: ${nextBtn.text}`
      });
      navigation = 'NEXT';
    } else if (finalSubmitBtn) {
      actions.push({
        type: 'click',
        locator: finalSubmitBtn.locator,
        description: `Click Final Submit button: ${finalSubmitBtn.text}`
      });
      navigation = 'FINAL_SUBMIT';
    } else {
      // Fallback: look for generic submit type button
      const fallback = observation.buttons.find(b => b.type === 'submit');
      if (fallback) {
         actions.push({
            type: 'click',
            locator: fallback.locator,
            description: `Click generic submit button: ${fallback.text}`
         });
         navigation = 'FINAL_SUBMIT'; // Assume generic submit is final if no Next exists
      }
    }

    return { actions, navigation };
  }
}
