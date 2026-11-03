/** Small local-only Chrome driver shared by isolated UI fixtures. */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

export async function openChromeFixture(output, options = {}) {
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (path === '/qa-bag.svg' || path === '/qa-book.svg') {
        const bag = path.includes('bag');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="#d9deea"/><rect y="630" width="800" height="170" fill="#b9c2d1"/>${bag ? '<path d="M310 210v-60q90-90 180 0v60" fill="none" stroke="#263958" stroke-width="25"/><rect x="200" y="180" width="400" height="460" rx="85" fill="#3b5273"/><rect x="245" y="420" width="310" height="170" rx="35" fill="#2a3d5b"/><path d="M245 450h310" stroke="#a8b6ce" stroke-width="9"/><rect x="375" y="320" width="50" height="35" rx="8" fill="#d7c8a5"/>' : '<path d="M150 230h230q20 0 20 20 0-20 20-20h230v340H420q-20 0-20 20 0-20-20-20H150Z" fill="#f9f4e8" stroke="#59678b" stroke-width="16"/><path d="M400 250v310M200 310h150m-150 60h150m-150 60h150m100-120h150m-150 60h150m-150 60h150" stroke="#9da6bd" stroke-width="8"/>'}<text x="400" y="735" text-anchor="middle" font-family="sans-serif" font-size="21" fill="#263958">SYNTHETIC QA IMAGE — NOT A REAL REPORT</text></svg>`;
        response.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(svg);
        return;
      }
      const asset = path.startsWith('/assets/');
      if (!asset && !['/light.html', '/dark.html', '/fixture.js'].includes(path)) {
        response.writeHead(404).end();
        return;
      }
      const bytes = await readFile(
        asset ? resolve('frontend/dist/assets', basename(path)) : join(output, basename(path)),
      );
      response
        .writeHead(200, {
          'Content-Type': path.endsWith('.js')
            ? 'text/javascript'
            : path.endsWith('.css')
              ? 'text/css'
              : path.endsWith('.woff2')
                ? 'font/woff2'
                : 'text/html',
        })
        .end(bytes);
    } catch {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = await mkdtemp(join(output, 'chrome-cdp-'));
  const browser = spawn(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--disable-background-networking',
      '--disable-extensions',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  const delay = (ms) => new Promise((done) => setTimeout(done, ms));
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      break;
    } catch {
      await delay(100);
    }
  }
  if (!port) {
    browser.kill();
    server.close();
    throw new Error('Isolated Chrome unavailable.');
  }
  const page = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(
    (response) => response.json(),
  );
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.onopen = done;
    socket.onerror = reject;
  });
  let id = 0;
  const pending = new Map(),
    errors = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (options.syntheticImage && message.method === 'Fetch.requestPaused') {
      const body = options.syntheticImage(message.params.request.url);
      void send(
        body ? 'Fetch.fulfillRequest' : 'Fetch.failRequest',
        body
          ? {
              requestId: message.params.requestId,
              responseCode: 200,
              responseHeaders: [{ name: 'Content-Type', value: 'image/png' }],
              body,
            }
          : { requestId: message.params.requestId, errorReason: 'BlockedByClient' },
      ).catch(() => errors.push('Synthetic image interception failed'));
    }
    if (message.method === 'Runtime.exceptionThrown')
      errors.push(message.params.exceptionDetails.text);
    if (message.id && pending.has(message.id)) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry.timeout);
      message.error ? entry.reject(new Error(message.error.message)) : entry.done(message.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((done, reject) => {
      const next = ++id;
      const timeout = setTimeout(() => {
        pending.delete(next);
        reject(new Error('Timeout ' + method));
      }, 10000);
      pending.set(next, { done, reject, timeout });
      socket.send(JSON.stringify({ id: next, method, params }));
    });
  await send('Page.enable');
  await send('Runtime.enable');
  if (options.syntheticImage)
    await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*/*' }] });
  const evaluate = async (expression) => {
    const value = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (value.exceptionDetails)
      throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
    return value.result.value;
  };
  const waitFor = async (expression) => {
    for (let i = 0; i < 160; i++) {
      if (await evaluate(expression)) return;
      await delay(30);
    }
    throw new Error('Fixture condition not met: ' + expression);
  };
  const settle = () =>
    evaluate('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))');
  const screenshot = async (name) => {
    await settle();
    const value = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(join(output, name + '.png'), Buffer.from(value.data, 'base64'));
  };
  const close = async () => {
    try {
      await send('Browser.close');
    } catch {
      browser.kill();
    }
    socket.close();
    server.close();
  };
  return {
    origin,
    debugPort: port,
    send,
    evaluate,
    waitFor,
    settle,
    screenshot,
    close,
    errors,
    delay,
  };
}
