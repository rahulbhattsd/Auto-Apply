import json
from playwright.async_api import Page, Locator

async def extract_all_form_fields(page) -> list[dict]:
    """
    Recursively extracts all form fields from the page, piercing open Shadow DOM
    and same-origin iframes. Returns a list of rich field descriptors.
    """
    js_script = """
    () => {
        function getAccessibleName(el) {
            // Try aria-label, aria-labelledby, label[for], placeholder, name
            if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
            const labelledBy = el.getAttribute('aria-labelledby');
            if (labelledBy) {
                const labelEl = el.ownerDocument.getElementById(labelledBy);
                if (labelEl) return labelEl.innerText.trim();
            }
            if (el.id) {
                const label = el.ownerDocument.querySelector(`label[for="${el.id}"]`);
                if (label) return label.innerText.trim();
            }
            if (el.placeholder) return el.placeholder;
            // Check surrounding text for fieldset/legend
            let parent = el.closest('fieldset');
            if (parent) {
                const legend = parent.querySelector('legend');
                if (legend) return legend.innerText.trim();
            }
            return el.name || 'unknown';
        }

        function collectFields(root, fields) {
            const inputs = root.querySelectorAll('input, select, textarea, [role="combobox"], [role="textbox"]');
            for (const el of inputs) {
                if (el.type === 'hidden') continue;
                const field = {
                    tag: el.tagName.toLowerCase(),
                    type: el.type || el.getAttribute('role') || 'text',
                    name: el.name || '',
                    id: el.id || '',
                    accessible_name: getAccessibleName(el),
                    required: el.required || el.getAttribute('aria-required') === 'true',
                    current_value: el.value || '',
                    options: [],
                    placeholder: el.placeholder || '',
                    nearby_text: (el.parentElement?.innerText || '').substring(0, 200),
                };
                if (el.tagName.toLowerCase() === 'select') {
                    field.options = Array.from(el.options).map(o => ({ value: o.value, text: o.text }));
                }
                // For radio/checkbox groups, get all options
                if (el.type === 'radio' || el.type === 'checkbox') {
                    const name = el.name;
                    if (name) {
                        const group = root.querySelectorAll(`[name="${name}"]`);
                        field.options = Array.from(group).map(r => ({ value: r.value, text: getAccessibleName(r) }));
                    }
                }
                fields.push(field);
            }
            // Recurse into open shadow roots
            const allElements = root.querySelectorAll('*');
            for (const el of allElements) {
                if (el.shadowRoot) {
                    collectFields(el.shadowRoot, fields);
                }
            }
        }

        const allFields = [];
        collectFields(document, allFields);
        return allFields;
    }
    """
    fields = await page.evaluate(js_script)
    return fields

async def find_and_fill_field(page, field_descriptor: dict, value: str):
    """
    Locates a field by its accessible name and fills it.
    Handles text inputs, selects, and radio/checkbox groups.
    """
    name = field_descriptor['accessible_name']
    tag = field_descriptor['tag']
    field_type = field_descriptor['type']

    # Try to locate the field using Playwright's built-in locators (pierces shadow DOM)
    try:
        if tag == 'select':
            locator = page.get_by_label(name)
            await locator.select_option(label=value)
        elif field_type in ('radio', 'checkbox'):
            # For radio/checkbox, the accessible name might be on the group
            # Try clicking the option with matching value
            option_locator = page.get_by_label(value)
            if await option_locator.count() > 0:
                await option_locator.first.click()
            else:
                # Fallback: click by value
                await page.locator(f'input[value="{value}"]').click()
        else:
            locator = page.get_by_label(name)
            await locator.fill(value)
        return True
    except Exception as e:
        # Fallback: try filling by name attribute
        try:
            await page.locator(f'[name="{field_descriptor["name"]}"]').fill(value)
            return True
        except Exception:
            return False
