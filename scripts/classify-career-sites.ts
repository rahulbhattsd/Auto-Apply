import fs from 'fs';
import path from 'path';

interface CompanyEntry {
  company: string;
  url: string;
}

interface ClassificationResult {
  company: string;
  url: string;
  detectedAts: string;
  notes?: string;
}

const urlSignatures: Record<string, string[]> = {
  greenhouse: ['greenhouse.io', 'boards.greenhouse.io'],
  lever: ['lever.co', 'jobs.lever.co'],
  workday: ['myworkdayjobs.com'],
  icims: ['icims.com'],
  smartrecruiters: ['smartrecruiters.com'],
  ashby: ['ashbyhq.com', 'jobs.ashbyhq.com'],
  workable: ['workable.com', 'apply.workable.com'],
  darwinbox: ['darwinbox.com', 'darwinbox.in'],
  keka: ['keka.com'],
  zohorecruit: ['zohorecruit.com', 'zohocorp.com', 'zoho.com'],
  peoplestrong: ['peoplestrong.com'],
};

const domSignatures: Record<string, string[]> = {
  greenhouse: ['greenhouse.io', 'grnhse.js'],
  lever: ['lever.co'],
  workday: ['workday', 'Workday'],
  icims: ['icims.com'],
  smartrecruiters: ['smartrecruiters.com'],
  ashby: ['ashbyhq.com'],
  workable: ['workable.com'],
  darwinbox: ['darwinbox'],
  keka: ['keka.com'],
  zohorecruit: ['zohorecruit'],
  peoplestrong: ['peoplestrong'],
};

async function classifyUrl(company: string, originalUrl: string): Promise<ClassificationResult> {
  console.log(`Checking ${company} at ${originalUrl}...`);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(originalUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    clearTimeout(timeoutId);

    const finalUrl = response.url;

    // 1. Check final URL
    for (const [ats, signatures] of Object.entries(urlSignatures)) {
      if (signatures.some(sig => finalUrl.includes(sig) || originalUrl.includes(sig))) {
        return { company, url: originalUrl, detectedAts: ats, notes: `Matched URL signature on ${finalUrl}` };
      }
    }

    // 2. Check DOM
    const html = await response.text();
    for (const [ats, signatures] of Object.entries(domSignatures)) {
      if (signatures.some(sig => html.includes(sig))) {
        return { company, url: originalUrl, detectedAts: ats, notes: `Matched DOM signature in HTML` };
      }
    }

    return { company, url: originalUrl, detectedAts: 'unknown', notes: `Could not determine ATS from ${finalUrl} or HTML content` };

  } catch (error: any) {
    console.error(`  -> Failed to check ${company}: ${error.message}`);
    return { company, url: originalUrl, detectedAts: 'unknown', notes: `Error fetching URL: ${error.message}` };
  }
}

async function run() {
  const inputPath = path.join(__dirname, 'urls.json');
  const outputPath = path.join(__dirname, 'career-sites-classification.json');

  const rawData = fs.readFileSync(inputPath, 'utf-8');
  const companies: CompanyEntry[] = JSON.parse(rawData);

  const results: ClassificationResult[] = [];

  for (const entry of companies) {
    const result = await classifyUrl(entry.company, entry.url);
    results.push(result);
    // Small delay to be polite
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  // Generate summary
  const summary: Record<string, number> = {};
  const unknowns: ClassificationResult[] = [];

  for (const result of results) {
    summary[result.detectedAts] = (summary[result.detectedAts] || 0) + 1;
    if (result.detectedAts === 'unknown') {
      unknowns.push(result);
    }
  }

  console.log('\n=============================================');
  console.log('CLASSIFICATION SUMMARY');
  console.log('=============================================');
  console.table(Object.entries(summary).map(([ats, count]) => ({ ATS: ats, Count: count })).sort((a, b) => b.Count - a.Count));

  console.log('\n=============================================');
  console.log(`UNKNOWN ATS PLATFORMS (${unknowns.length})`);
  console.log('=============================================');
  unknowns.forEach(u => {
    console.log(`- ${u.company}: ${u.url}`);
    if (u.notes) {
      console.log(`  Notes: ${u.notes}`);
    }
  });

  console.log(`\nFull report written to ${outputPath}`);
}

run().catch(console.error);
