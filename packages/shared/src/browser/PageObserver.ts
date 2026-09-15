import { Page } from 'playwright';
import { PageObservation, PageField, PageButton, PageLink } from './types.js';

export class PageObserver {
  constructor(private page: Page) {}

  async observe(): Promise<PageObservation> {
    const url = this.page.url();
    const title = await this.page.title();

    // Evaluate in browser context to extract fields, buttons, links
    const observationData = await this.page.evaluate(() => {
      (window as any).__name ||= (fn: any) => fn;
      const getVisibility = (el: HTMLElement) => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0 && el.offsetHeight > 0;
      };

      const generateLocator = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        if (el.getAttribute('name')) return `[name="${el.getAttribute('name')}"]`;
        if (el.className && typeof el.className === 'string') {
          const classes = el.className.split(' ').filter((c: string) => c).join('.');
          if (classes) return `.${classes}`;
        }
        return el.tagName.toLowerCase(); // fallback, not unique enough
      };

      const fields: PageField[] = [];
      document.querySelectorAll('input, select, textarea').forEach((el) => {
        if (!getVisibility(el as HTMLElement)) return;

        let type: PageField['type'] = 'text';
        let options: string[] | undefined;
        let value: string | string[] | boolean | undefined;
        let htmlValue: string | undefined;

        if (el instanceof HTMLInputElement) {
          type = el.type === 'file' ? 'file' : el.type === 'checkbox' ? 'checkbox' : el.type === 'radio' ? 'radio' : 'text';
          if (el.type === 'checkbox' || el.type === 'radio') {
            value = el.checked;
            htmlValue = el.value;
          } else {
            value = el.value;
            htmlValue = el.value;
          }
        } else if (el instanceof HTMLSelectElement) {
          type = 'select';
          options = Array.from(el.options).map((o: HTMLOptionElement) => o.text);
          value = Array.from(el.selectedOptions).map((o: HTMLOptionElement) => o.value);
        } else if (el instanceof HTMLTextAreaElement) {
          type = 'text';
          value = el.value;
          htmlValue = el.value;
        }

        const name = el.getAttribute('name') || el.id || '';
        let label = '';
        if (el.id) {
          const labelEl = document.querySelector(`label[for="${el.id}"]`);
          if (labelEl) label = labelEl.textContent?.trim() || '';
        }
        // Fallback for checkbox/radio label
        if (!label && (type === 'checkbox' || type === 'radio')) {
           const parentLabel = el.closest('label');
           if (parentLabel && parentLabel.textContent) {
               label = parentLabel.textContent.trim();
           } else {
               // Next sibling text node heuristic
               let nextNode = el.nextSibling;
               while (nextNode && nextNode.nodeType !== Node.TEXT_NODE && nextNode.nodeType !== Node.ELEMENT_NODE) {
                   nextNode = nextNode.nextSibling;
               }
               if (nextNode && nextNode.nodeType === Node.TEXT_NODE && nextNode.textContent?.trim()) {
                   label = nextNode.textContent.trim();
               }
           }
        }

        const field: PageField = {
          type,
          name,
          label,
          required: (el as HTMLInputElement).required || el.hasAttribute('aria-required'),
          disabled: (el as HTMLInputElement).disabled,
          locator: generateLocator(el)
        };

        if (value !== undefined) field.value = value;
        if (htmlValue !== undefined) field.htmlValue = htmlValue;
        if (options !== undefined) field.options = options;

        fields.push(field);
      });

      const buttons: PageButton[] = [];
      document.querySelectorAll('button, input[type="submit"], input[type="button"]').forEach((el) => {
         if (!getVisibility(el as HTMLElement)) return;
         let text = el.textContent?.trim() || '';
         if (el instanceof HTMLInputElement) text = el.value;

         let type: PageButton['type'] = 'button';
         if (el instanceof HTMLButtonElement) {
           type = (el.type === 'submit' || el.type === 'reset') ? el.type : 'button';
         } else if (el instanceof HTMLInputElement) {
           type = (el.type === 'submit' || el.type === 'reset') ? el.type : 'button';
         }

         buttons.push({
           text,
           type,
           disabled: (el as HTMLButtonElement).disabled,
           locator: generateLocator(el)
         });
      });

      const links: PageLink[] = [];
      document.querySelectorAll('a').forEach((el) => {
        if (!getVisibility(el as HTMLElement)) return;
        links.push({
          text: el.textContent?.trim() || '',
          href: el.getAttribute('href') || '',
          locator: generateLocator(el)
        });
      });

      return { fields, buttons, links };
    });

    return {
      url,
      title,
      ...observationData
    };
  }
}
