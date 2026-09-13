import { test } from 'node:test';
import assert from 'node:assert';
import { BrowserAgent } from '../../src/browser/BrowserAgent.js';
import * as http from 'http';

test('PageObserver extracts fields correctly', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <body>
          <input type="text" name="firstName" id="firstName" value="John" />
          <input type="checkbox" name="agree" id="agree" checked />
          <button id="submitBtn">Next</button>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  const agent = new BrowserAgent({ headless: true });
  await agent.init();
  await agent.getPage().goto(`http://localhost:${port}`);

  const obs = await agent.observe();

  assert.equal(obs.fields.length, 2);
  const textInput = obs.fields.find(f => f.name === 'firstName');
  assert.ok(textInput);
  assert.equal(textInput?.type, 'text');
  assert.equal(textInput?.value, 'John');
  assert.equal(textInput?.locator, '#firstName');

  const checkboxInput = obs.fields.find(f => f.name === 'agree');
  assert.ok(checkboxInput);
  assert.equal(checkboxInput?.type, 'checkbox');
  assert.equal(checkboxInput?.value, true);

  assert.equal(obs.buttons.length, 1);
  assert.equal(obs.buttons[0].text, 'Next');

  await agent.close();

  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('PageObserver detects dynamic DOM changes', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <body>
          <button id="addBtn" onclick="document.body.innerHTML += '<input type=\\'text\\' id=\\'dynamicInput\\' />'">Add Input</button>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  const agent = new BrowserAgent({ headless: true });
  await agent.init();
  await agent.getPage().goto(`http://localhost:${port}`);

  // Initial observation
  let obs = await agent.observe();
  assert.equal(obs.fields.length, 0);

  // Trigger DOM change
  await agent.actions.click('#addBtn');

  // Re-observe
  obs = await agent.observe();
  assert.equal(obs.fields.length, 1);
  assert.equal(obs.fields[0].locator, '#dynamicInput');

  await agent.close();

  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
