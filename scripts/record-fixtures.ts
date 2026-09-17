/**
 * Fixture recorder — run MANUALLY, never in CI.
 *
 *   pnpm tsx scripts/record-fixtures.ts naukri
 *   pnpm tsx scripts/record-fixtures.ts glassdoor
 *
 * Opens a headful browser with a persistent profile. You log in yourself
 * (OTP included), browse to each page it asks for, and press Enter.
 * It saves the rendered HTML into the provider's __fixtures__ folder.
 *
 * The committed fixtures are synthetic placeholders. Replace them with real
 * recordings once, then the whole test suite runs offline forever after.
 *
 * Before committing a recording: open it and strip your name, email, phone,
 * resume filename and any cookie/token values. Fixtures are public in the repo.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

const TARGETS: Record<string, Array<{ file: string; hint: string }>> = {
  naukri: [
    { file: 'job-internal-apply.html', hint: 'a job whose button says "Apply"' },
    { file: 'job-external-apply.html', hint: 'a job that says "Apply on company site"' },
    { file: 'job-already-applied.html', hint: 'a job you have already applied to' },
    { file: 'job-walkin.html', hint: 'a walk-in drive listing' },
    { file: 'questionnaire-modal.html', hint: 'a job where the chatbot questionnaire is open' },
    { file: 'logged-out.html', hint: 'any job page in a logged-out window' },
  ],
  glassdoor: [
    { file: 'job-easy-apply.html', hint: 'a listing with the Easy Apply button' },
    { file: 'job-employer-site.html', hint: 'a listing that says "Apply on employer site"' },
    { file: 'job-already-applied.html', hint: 'a listing you have already applied to' },
    { file: 'login-wall.html', hint: 'a listing showing the sign-in wall' },
  ],
};

const provider = process.argv[2];
const targets = TARGETS[provider ?? ''];
if (!targets) {
  console.error(`usage: tsx scripts/record-fixtures.ts <${Object.keys(TARGETS).join('|')}>`);
  process.exit(1);
}

const outDir = join('packages', 'providers', provider!, '__fixtures__');
mkdirSync(outDir, { recursive: true });

const ctx = await chromium.launchPersistentContext(`.browser-profiles/${provider}`, {
  headless: false,
  viewport: { width: 1440, height: 900 },
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log('\nLog in manually in the browser window, then follow the prompts.\n');

for (const t of targets) {
  await rl.question(`Navigate to ${t.hint}, then press Enter to capture ${t.file} `);
  const html = await page.content();
  writeFileSync(join(outDir, t.file), html, 'utf8');
  console.log(`  saved ${t.file} (${(html.length / 1024).toFixed(0)} KB) — review it for PII before committing`);
}

await rl.close();
await ctx.close();
console.log('\nDone. Now update selectors.json recordedAt and re-run the drift tests.');
