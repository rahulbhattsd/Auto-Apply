import { test } from 'node:test';
import assert from 'node:assert';
import { BrowserAgent } from '../../src/browser/BrowserAgent.js';
import * as http from 'http';

test('BrowserAction operations and verification', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    if (req.url === '/upload') {
       res.end(`<html><body>Upload success</body></html>`);
       return;
    }
    res.end(`
      <html>
        <body>
          <input type="text" id="name" />
          <select id="country">
            <option value="us">USA</option>
            <option value="uk">UK</option>
          </select>
          <input type="checkbox" id="agree" />
          <input type="file" id="resume" />
          <div id="scrollTarget" style="margin-top: 2000px;">Far Down</div>
          <a href="/upload" id="link">Link</a>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  const agent = new BrowserAgent({ headless: true });
  await agent.init();
  await agent.getPage().goto(`http://localhost:${port}`);

  // Fill text
  const fillResult = await agent.actions.fill('#name', 'Alice');
  assert.equal(fillResult.success, true);
  assert.equal(fillResult.verified, true);

  // Select option
  const selectResult = await agent.actions.select('#country', 'uk');
  assert.equal(selectResult.success, true);
  assert.equal(selectResult.verified, true);

  // Check checkbox
  const checkResult = await agent.actions.check('#agree', true);
  assert.equal(checkResult.success, true);
  assert.equal(checkResult.verified, true);

  // Scroll
  const scrollResult = await agent.actions.scroll('#scrollTarget');
  assert.equal(scrollResult.success, true);
  assert.equal(scrollResult.verified, true);

  // Try on non-existent element
  const badResult = await agent.actions.fill('#nonexistent', 'test');
  assert.equal(badResult.success, false);
  assert.equal(badResult.verified, false);

  await agent.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('BrowserAction stale elements gracefully handled', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <body>
          <button id="destroyBtn" onclick="this.remove()">Destroy Me</button>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  const agent = new BrowserAgent({ headless: true });
  await agent.init();
  await agent.getPage().goto(`http://localhost:${port}`);

  // Element destroys itself on click, meaning next interaction fails gracefully
  await agent.actions.click('#destroyBtn');
  const result = await agent.actions.click('#destroyBtn');

  assert.equal(result.success, false);

  await agent.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
