import { HtmlJobSource } from '../packages/job-discovery/src/HtmlJobSource';

async function test() {
  const sources = [
    new HtmlJobSource('TestCompany1', {
      type: 'html',
      endpoint: 'https://hasura.io/careers/',
      companyName: 'Hasura'
    }),
    new HtmlJobSource('TestCompany2', {
      type: 'html',
      endpoint: 'https://www.freshworks.com/company/careers/',
      companyName: 'Freshworks'
    }),
    new HtmlJobSource('TestCompany3', {
      type: 'html',
      endpoint: 'https://careers.zohocorp.com/',
      companyName: 'Zoho'
    })
  ];

  console.log('Testing HtmlJobSource with multiple career pages...');

  // Create a dummy redis cache using Object to mock connection just for this test
  const queueModule = require('../packages/queue/src/index');
  queueModule.connection = {
      get: async () => null,
      set: async () => 'OK',
      quit: async () => 'OK'
  };

  try {
    for (const source of sources) {
        console.log(`\nTesting ${source.name}...`);
        const jobs = await source.searchJobs({ limit: 3 });
        console.log(`Resulting jobs for ${source.name}:`, jobs.length > 0 ? jobs.slice(0, 3) : 'No jobs found.');
    }
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    process.exit(0);
  }
}

test();
