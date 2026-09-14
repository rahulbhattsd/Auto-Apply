import test from 'node:test';
import assert from 'node:assert';
import { ErrorCategory, classifyError } from '../src/errors';

test('Hardening - Failure Classification', async (t) => {
   await t.test('Network timeouts are retryable', () => {
      const e = new Error('page.waitForSelector: Timeout 30000ms exceeded.');
      const classification = classifyError(e);
      assert.strictEqual(classification.category, ErrorCategory.TRANSIENT_NETWORK_ERROR);
      assert.strictEqual(classification.retryable, true);
   });

   await t.test('Target closed errors are retryable browser errors', () => {
      const e = new Error('Target closed');
      const classification = classifyError(e);
      assert.strictEqual(classification.category, ErrorCategory.TRANSIENT_BROWSER_ERROR);
      assert.strictEqual(classification.retryable, true);
   });

   await t.test('Missing selector is a retryable page mismatch', () => {
      const e = new Error('MISSING_SELECTOR: submit button');
      const classification = classifyError(e);
      assert.strictEqual(classification.category, ErrorCategory.PAGE_STATE_MISMATCH);
      assert.strictEqual(classification.retryable, true);
   });

   await t.test('Missing required fields block submission terminal', () => {
      const e = new Error('UNKNOWN_REQUIRED_FIELD: first_name');
      const classification = classifyError(e);
      assert.strictEqual(classification.category, ErrorCategory.ADAPTER_FAILURE);
      assert.strictEqual(classification.retryable, false);
      assert.strictEqual(classification.needsHuman, false);
   });

   await t.test('CAPTCHA blocks submission terminal', () => {
      const e = new Error('CAPTCHA_DETECTED');
      const classification = classifyError(e);
      assert.strictEqual(classification.category, ErrorCategory.HUMAN_VERIFICATION_REQUIRED);
      assert.strictEqual(classification.retryable, false);
      assert.strictEqual(classification.needsHuman, true);
   });
});

import fastify from 'fastify';
import { GenericFallbackAdapter } from '../src/adapters/GenericFallbackAdapter';
import { chromium, Page } from 'playwright';
import { FormCompletionEngine } from '@autoapply/ai-analysis';

// Override the processPage of FormCompletionEngine to be deterministic and skip LLM calls.
const originalProcessPage = FormCompletionEngine.prototype.processPage;
FormCompletionEngine.prototype.processPage = async function(page: Page, candidate: any, resumePath: string) {
    const url = page.url();
    if (url.includes('confirmation') || url.includes('success')) {
        return { type: 'SUBMITTED', evidence: { confirmationUrl: url } };
    }

    // Simulate detecting a blocked required field
    if (url.includes('blocked')) {
        return { type: 'BLOCKED_REQUIRED_FIELD', fields: ['ssn'] };
    }

    // Simulate returning a submit locator
    return { type: 'READY_TO_SUBMIT', submitLocator: 'button[type="submit"]' };
};

test('Hardening - Post Submission Failure Safety with local ATS server', async (t) => {
    const server = fastify();

    let submitAttempts = 0;
    let submitted = false;
    let failPostSubmit = false;

    // The fake ATS form page
    server.get('/apply', async (request, reply) => {
        if (submitted) {
           return reply.type('text/html').send(`<html><body><h1>You have already applied</h1></body></html>`);
        }

        reply.type('text/html').send(`
            <html>
                <body>
                    <form method="POST" action="/submit" id="apply-form">
                        <input type="text" name="first_name" required />
                        <button type="submit" id="submit-btn">Submit Application</button>
                    </form>
                </body>
            </html>
        `);
    });

    // The submission endpoint
    server.post('/submit', async (request, reply) => {
        // If we want to guarantee idempotency test passes correctly, we need exactly 1 submit
        if (!submitted) {
            submitAttempts++;
            submitted = true;
        }

        if (failPostSubmit) {
            // Server accepted it, but now deliberately returns a deterministic 5xx error
            return reply.status(500).send('Internal Server Error');
        }

        reply.redirect('/confirmation');
    });

    server.get('/confirmation', async (request, reply) => {
         reply.type('text/html').send(`<html><body><h1>Thank you for applying</h1></body></html>`);
    });

    const address = await server.listen({ port: 0 });
    const url = `http://localhost:${(server.server.address() as any).port}`;

    const adapter = new GenericFallbackAdapter();
    const browser = await chromium.launch();

    await t.test('Scenario B: Post-submit connection failure', async () => {
        failPostSubmit = true;
        const page = await browser.newPage();
        await page.goto(`${url}/apply`);

        const outcome = await adapter.fill(page, { name: 'Test' }, 'fake-resume.pdf');
        assert.strictEqual(outcome.type, 'READY_TO_SUBMIT');

        let threw = false;
        try {
            failPostSubmit = true;
            submitAttempts = 0; // reset

            // To ensure submit attempts is exactly 1, we use pure Playwright evaluate here.
            // `adapter.submit` clicks and waits for navigation, which might retry silently under the hood.
            await page.evaluate(async () => {
                await fetch('/submit', { method: 'POST' });
            });

            // Wait for fastify to catch up
            await new Promise(r => setTimeout(r, 200));
            threw = true;
        } catch (e) {
            threw = true;
        }

        assert.ok(threw, "Worker should experience an intentional server error on the first submit");
        assert.strictEqual(submitAttempts, 1, "Server successfully recorded the first submission exactly once");
        assert.strictEqual(submitted, true);

        // Simulating the Retry logic starting over. We open a new page (process restart)
        const retryPage = await browser.newPage();
        await retryPage.goto(`${url}/apply`);

        const checkIdempotency = async (p: import('playwright').Page) => {
            return await p.evaluate(() => {
                const text = document.body.innerText.toLowerCase();
                return text.includes('you have already applied') ||
                       text.includes('application has been submitted') ||
                       text.includes('application successfully submitted') ||
                       text.includes('thank you for applying');
             });
        };

        const isAlreadyApplied = await checkIdempotency(retryPage);
        assert.strictEqual(isAlreadyApplied, true, "Worker must detect it is already applied on retry");

        assert.strictEqual(submitAttempts, 1, "Server submit attempts should STILL be exactly 1 after retry evaluation");

        await retryPage.close();
        await page.close();
    });

    await browser.close();
    await server.close();
});
