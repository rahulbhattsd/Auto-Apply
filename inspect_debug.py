"""inspect_debug.py — analyze saved debug HTML files to find real button selectors."""
from bs4 import BeautifulSoup
import glob, os, sys

def analyze(filepath):
    print(f"\n=== {os.path.basename(filepath)} ===")
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        soup = BeautifulSoup(f.read(), "html.parser")
    
    # Try modal selectors
    modal_selectors = [
        ('div[role="dialog"]', 'role=dialog'),
        ('.artdeco-modal', 'artdeco-modal'),
        ('.jobs-easy-apply-modal', 'easy-apply-modal'),
        ('[data-test-modal]', 'data-test-modal'),
        ('.jobs-easy-apply-content', 'easy-apply-content'),
    ]
    modal = None
    for sel, name in modal_selectors:
        found = soup.select(sel)
        if found:
            modal = found[0]
            print(f"  Modal found: {name}")
            break
    
    if modal:
        buttons = modal.select("button")
        print(f"  Buttons in modal: {len(buttons)}")
        for b in buttons[:15]:
            print(f"    text={b.get_text(strip=True)[:50]!r}")
            print(f"      class={b.get('class')}")
            print(f"      aria-label={b.get('aria-label')}")
            print(f"      data-*={[k for k in b.attrs if k.startswith('data-')]}")
    else:
        print("  No modal found!")
        print(f"  Page title: {soup.title.string if soup.title else 'N/A'}")
        
        # What roles exist
        roles_elems = soup.find_all(attrs={"role": True})
        roles = set(e.get("role") for e in roles_elems)
        print(f"  Roles on page: {roles}")
        
        print(f"  Top-level buttons ({len(soup.select('button'))}):")
        for b in soup.select("button")[:10]:
            print(f"    text={b.get_text(strip=True)[:50]!r} aria={b.get('aria-label')} class={b.get('class')}")
        
        # Check for footer buttons (LinkedIn puts CTA in footer)
        footer = soup.select("footer")
        if footer:
            print(f"  Footer buttons:")
            for b in footer[0].select("button")[:5]:
                print(f"    text={b.get_text(strip=True)[:50]!r} class={b.get('class')}")

files = sorted(glob.glob("debug/*.html"))
print(f"Found {len(files)} debug HTML files")
if len(sys.argv) > 1:
    analyze(sys.argv[1])
else:
    for f in files[:3]:
        analyze(f)
