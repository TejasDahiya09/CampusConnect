/** Actual frontend HTTP/Socket clients + real local Express/PostgreSQL. Only identity is synthetic. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const [output, apiBase, a, b, conversationId] = process.argv.slice(2);
const target = new URL(apiBase);
if (target.hostname !== '127.0.0.1' || target.protocol !== 'http:')
  throw new Error('Only the verified local integration server is allowed.');
await mkdir(output, { recursive: true });
const assets = await readdir(resolve('frontend/dist/assets'));
const css = ['index-', 'MessagesPage-']
  .map((prefix) => {
    const file = assets.find((name) => name.startsWith(prefix) && name.endsWith('.css'));
    if (!file) throw new Error('Build frontend first');
    return `<link rel="stylesheet" href="/assets/${file}">`;
  })
  .join('');
const bundle = await build({
  stdin: {
    sourcefile: 'local-messaging-integration.tsx',
    resolveDir: resolve('frontend'),
    loader: 'tsx',
    contents: `
import {useEffect} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route} from 'react-router-dom';import {MessagesPage} from './src/features/messaging/MessagesPage';import {AppShell} from './src/app/AppShell';import {ThemeProvider} from './src/features/theme/ThemeProvider';
window.__syntheticId=new URLSearchParams(location.search).get('account');window.__syntheticSession=()=>({access_token:window.__syntheticId,user:{id:window.__syntheticId},expires_at:Date.now()/1000+3600});localStorage.setItem('campusconnect-theme',document.documentElement.dataset.theme);
createRoot(document.querySelector('#root')).render(<ThemeProvider><MemoryRouter initialEntries={['/messages/${conversationId}']}><Routes><Route element={<AppShell/>}><Route path="/messages" element={<MessagesPage/>}/><Route path="/messages/:id" element={<MessagesPage/>}/></Route></Routes></MemoryRouter></ThemeProvider>);
`,
  },
  bundle: true,
  jsx: 'automatic',
  platform: 'browser',
  format: 'esm',
  write: false,
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'synthetic-local-auth-only',
      setup(builder) {
        for (const [suffix, path] of Object.entries({
          'auth/useAuth': 'auth',
          'lib/supabase': 'supabase',
          'config/env': 'env',
        }))
          builder.onResolve({ filter: new RegExp(suffix + '$') }, () => ({
            path,
            namespace: 'local-qa',
          }));
        builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'local-qa' }));
        builder.onLoad({ filter: /.*/, namespace: 'local-qa' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === 'css'
              ? ''
              : path === 'env'
                ? `export const frontendEnv={apiBaseUrl:${JSON.stringify(apiBase)},authConfigured:true};`
                : path === 'auth'
                  ? 'export const useAuth=()=>({applicationUser:{id:window.__syntheticId,role:"STUDENT",status:"ACTIVE"},isAuthenticated:true});'
                  : 'export const getSupabaseClient=()=>({auth:{getSession:async()=>({data:{session:window.__syntheticSession()}}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>{}}});',
        }));
      },
    },
  ],
});
await writeFile(join(output, 'fixture.js'), bundle.outputFiles[0].text);
for (const theme of ['light', 'dark'])
  await writeFile(
    join(output, theme + '.html'),
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SYNTHETIC LOCAL DATABASE Messaging Integration</title>${css}</head><body><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>`,
  );
const browser = await openChromeFixture(output);
let socket;
const text = 'Synthetic 11E real HTTP and Socket.IO browser message <img src=x onerror=alert(1)>.';
try {
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await browser.send('Network.enable');
  await browser.send('Network.setBlockedURLs', { urls: ['https://*'] });
  await browser.send('Page.navigate', { url: browser.origin + '/light.html?account=' + a });
  await browser.waitFor('Boolean(document.querySelector("textarea"))');
  await browser.waitFor(
    '!document.querySelector(".cc-msg-history").getAttribute("aria-busy")||document.querySelector(".cc-msg-history").getAttribute("aria-busy")==="false"',
  );
  const page = await fetch(
    `http://127.0.0.1:${browser.debugPort}/json/new?${encodeURIComponent(browser.origin + '/dark.html?account=' + b)}`,
    { method: 'PUT' },
  ).then((r) => r.json());
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = (event) => {
    const value = JSON.parse(event.data);
    if (value.method === 'Runtime.exceptionThrown') errors.push(value.params.exceptionDetails.text);
    const p = pending.get(value.id);
    if (p) {
      pending.delete(value.id);
      clearTimeout(p.timer);
      value.error ? p.reject(new Error(value.error.message)) : p.resolve(value.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const next = ++id,
        timer = setTimeout(() => reject(new Error('Local integration tab timeout')), 15000);
      pending.set(next, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: next, method, params }));
    });
  const evaluate = async (expression) => {
    const value = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.text);
    return value.result.value;
  };
  const wait = async (expression) => {
    for (let i = 0; i < 200; i++) {
      if (await evaluate(expression)) return;
      await browser.delay(40);
    }
    throw new Error('Recipient condition not met: ' + expression);
  };
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['https://*'] });
  await wait(
    'Boolean(document.querySelector("textarea"))&&document.querySelector(".cc-msg-history").getAttribute("aria-busy")==="false"',
  );
  await browser.send('Page.bringToFront');
  // Selected conversation predates page one: real backend selected projection keeps identity intact.
  await browser.waitFor('document.querySelectorAll(".cc-msg-row").length===30');
  await browser.waitFor(
    'Array.from(document.querySelectorAll("button")).some(e=>e.textContent==="Load more conversations")',
  );
  await browser.screenshot('actual-paginated-inbox-desktop-light');
  await browser.evaluate(
    `document.querySelector('button[aria-label="Switch to dark mode"]').click()`,
  );
  await browser.screenshot('actual-paginated-inbox-desktop-dark');
  await browser.evaluate(
    `document.querySelector('button[aria-label="Switch to light mode"]').click()`,
  );
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await browser.evaluate('document.querySelector(".cc-msg-back").click()');
  await browser.waitFor(
    '!document.querySelector(".cc-msg-page").classList.contains("has-conversation")',
  );
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  await browser.screenshot('actual-paginated-inbox-mobile-light');
  await browser.evaluate(
    `document.querySelector('button[aria-label="Switch to dark mode"]').click()`,
  );
  await browser.screenshot('actual-paginated-inbox-mobile-dark');
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 568,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  const geometry = await browser.evaluate(
    `(()=>{const button=Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Load more conversations').getBoundingClientRect(),nav=document.querySelector('.cc-mobile-nav').getBoundingClientRect();return {height:button.height,bottom:button.bottom,navTop:nav.top};})()`,
  );
  assert.ok(
    geometry.height >= 44 && geometry.bottom <= geometry.navTop + 1,
    JSON.stringify(geometry),
  );
  await browser.screenshot('actual-paginated-inbox-320-dark');
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await browser.evaluate(
    `document.querySelector('button[aria-label="Switch to light mode"]').click()`,
  );

  await browser.evaluate(
    'Array.from(document.querySelectorAll("button")).find(e=>e.textContent==="Load more conversations").click()',
  );
  await browser.waitFor('document.querySelectorAll(".cc-msg-row").length===35');
  assert.equal(
    await browser.evaluate(
      'new Set(Array.from(document.querySelectorAll(".cc-msg-row")).map(e=>e.getAttribute("href"))).size',
    ),
    35,
  );
  await browser.screenshot('actual-loaded-inbox-mobile-light');
  await browser.evaluate(`document.querySelector('a[href="/messages/${conversationId}"]').click()`);
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await browser.screenshot('actual-loaded-inbox-desktop-light');
  await browser.evaluate(
    `(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(text)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await browser.waitFor(`!document.querySelector('button[aria-label="Send message"]').disabled`);
  await browser.evaluate(`document.querySelector('button[aria-label="Send message"]').click()`);
  await send('Page.bringToFront');
  await wait('document.querySelectorAll(".cc-msg-message").length===1');
  assert.equal(
    await evaluate('document.querySelector(".cc-msg-history img")===null'),
    true,
    'Message text must not become HTML',
  );
  await wait('document.querySelector(".cc-msg-unread").textContent==="0 unread"');
  const call = async (actor, path, method = 'GET', body) => {
    const response = await fetch(apiBase + '/api/messages' + path, {
      method,
      headers: { authorization: 'Bearer ' + actor, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assert.ok(response.ok);
    return (await response.json()).data;
  };
  const invalidNotifications = await fetch(apiBase + '/api/notifications?page=' + '9'.repeat(400), {
    headers: { authorization: 'Bearer ' + b },
  });
  assert.equal(
    invalidNotifications.status,
    400,
    'Oversized notification pages fail at the real HTTP validation boundary',
  );
  let snapshot = await call(b, '/' + conversationId);
  assert.equal(snapshot.messages[0].text, text);
  for (let i = 0; i < 60 && snapshot.messages[0].read === false; i++) {
    await browser.delay(40);
    snapshot = await call(b, '/' + conversationId);
  }
  assert.equal(snapshot.messages[0].read, true, 'Recipient fetched-set receipt persisted');
  const draft = 'Synthetic browser draft kept through network recovery';
  await evaluate(
    `(()=>{const input=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,${JSON.stringify(draft)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await fetch(apiBase + '/__qa/disconnect/' + b, { method: 'POST' });
  // Interrupt the real websocket, not a fabricated message callback.
  await evaluate("window.dispatchEvent(new Event('offline'))");
  await browser.delay(200);
  for (let i = 0; i < 3; i++)
    await call(a, '/' + conversationId, 'POST', {
      text: 'Synthetic real-backend gap ' + i,
      clientMessageId: crypto.randomUUID(),
    });
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await evaluate("window.dispatchEvent(new Event('online'))");
  await wait('document.querySelectorAll(".cc-msg-message").length===4');
  await wait('!document.querySelector(".cc-msg-connection")');
  await call(a, '/' + conversationId, 'POST', {
    text: 'Synthetic live delivery after actual reconnect',
    clientMessageId: crypto.randomUUID(),
  });
  await wait('document.querySelectorAll(".cc-msg-message").length===5');
  await wait('document.querySelector(".cc-msg-unread").textContent==="0 unread"');
  assert.equal(await evaluate('document.querySelector("textarea").value'), draft);
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send('Page.bringToFront');
  const captured = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(
    join(output, 'actual-local-database-mobile-dark.png'),
    Buffer.from(captured.data, 'base64'),
  );
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  assert.equal((await call(b, '')).unread.total, 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(browser.errors, []);
  assert.equal(
    await browser.evaluate(
      `new RegExp([226,194,65533].map(n=>String.fromCharCode(n)).join('|')).test(document.body.innerText+Array.from(document.querySelectorAll('input,textarea')).map(e=>e.placeholder).join(''))`,
    ),
    false,
    'Rendered synthetic UI copy remains correctly encoded',
  );
  await writeFile(
    join(output, 'local-integration-results.json'),
    JSON.stringify(
      {
        evidence: ['VERIFIED — LOCAL DATABASE', 'VERIFIED — SYNTHETIC AUTH', 'VERIFIED — BROWSER'],
        tabs: 2,
        initialInbox: 30,
        loadedInbox: 35,
        selectedDeepLinkBeyondPageOne: true,
        actual: [
          'MessagesPage',
          'AppShell',
          'Messaging HTTP client',
          'Socket.IO client and server',
          'Express controllers',
          'Prisma',
          'PostgreSQL ciphertext',
          'Signed read receipts',
          'NotificationBell',
        ],
        identity: 'Dedicated local synthetic accounts; no real Supabase',
        result: 'PASS',
        messages: 5,
        gapMessages: 3,
        plaintextRenderedAsText: true,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: two real browser tabs, actual frontend/HTTP/Socket/PostgreSQL journey; synthetic authentication only.',
  );
} finally {
  socket?.close();
  await browser.close();
}
