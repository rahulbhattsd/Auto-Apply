"""analyze_form.py"""
from bs4 import BeautifulSoup

with open('debug/job_10_failed.html', 'r', encoding='utf-8', errors='replace') as f:
    soup = BeautifulSoup(f.read(), 'html.parser')

inputs = soup.find_all(['input', 'select', 'textarea'])
print(f'Total inputs: {len(inputs)}')
for inp in inputs[:20]:
    tag = inp.name
    typ = inp.get("type", "")
    name = inp.get("name", "")
    iid = inp.get("id", "")
    aria = inp.get("aria-label", "")
    print(f'  tag={tag} type={typ} name={name} id={iid} aria={aria}')

forms = soup.find_all('form')
print(f'\nForms: {len(forms)}')

footer = soup.find('footer')
if footer:
    print('Footer found:')
    print(footer.get_text()[:300])

# Find Next button parent chain
for btn in soup.find_all('button'):
    if btn.get_text(strip=True) == 'Next':
        print('\nNext button full attrs:')
        print(f'  class: {btn.get("class")}')
        print(f'  type: {btn.get("type")}')
        print(f'  disabled: {btn.get("disabled")}')
        print('Next button parent chain:')
        parent = btn.parent
        for i in range(6):
            if parent and parent.name:
                cls = parent.get("class", [])
                role = parent.get("role", "")
                print(f'  {i}: {parent.name} role={role} class={cls[:3]}')
                parent = parent.parent
        break

# Check what the page body structure looks like overall
print('\nMain content divs (first 10 divs with role):')
for el in soup.find_all(attrs={"role": True})[:10]:
    print(f'  {el.name} role={el.get("role")} id={el.get("id")} class={el.get("class", [])[:3]}')
