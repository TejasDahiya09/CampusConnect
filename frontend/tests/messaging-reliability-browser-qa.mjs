/** Two Chrome tabs, actual UI/controller/lifecycle, synthetic session/network boundaries. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2],
  b = await openChromeFixture(output);
let ws;
let stage = 'initial';
try {
  await b.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await b.send('Page.navigate', { url: b.origin + '/light.html' });
  await b.waitFor('document.querySelectorAll(".cc-msg-message").length===50');
  await b.waitFor('window.__qaListeners.has("connect")');
  await b.evaluate("document.querySelector('.cc-msg-earlier').click()");
  await b.waitFor('document.querySelectorAll(".cc-msg-message").length===100');
  await b.evaluate(
    "document.querySelector('.cc-msg-history').scrollTop=0;document.querySelector('.cc-msg-history').dispatchEvent(new Event('scroll'))",
  );
  stage = 'gap recovery';
  // More than two pages missed while disconnected: cursor recovery must not stop at latest 50.
  await b.evaluate(
    `(()=>{window.__qaSockets[0].connected=false;window.__qaListeners.get('disconnect')('transport close');for(let n=121;n<=355;n++)window.__qaMessages.a.push({id:'missed-'+n,conversationId:'a',senderId:'other',sentAt:new Date(Date.UTC(2026,9,31,0,n)).toISOString(),text:'Synthetic gap message '+n,read:false});window.__qaListeners.get('connect')();})()`,
  );
  await b.waitFor('document.querySelectorAll(".cc-msg-message").length===335');
  assert.equal(
    await b.evaluate('window.__qaCalls.filter(c=>c.path.includes("/updates")).length>=3'),
    true,
  );
  await b.screenshot('recovered-235-messages-desktop-light');
  // Browser lifecycle simulation: no recovery reads while offline; online resumes.
  const updatesBeforeOffline = await b.evaluate(
    'window.__qaCalls.filter(c=>c.path.includes("/updates")).length',
  );
  await b.evaluate(
    `(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.__qaSockets[0].connected=false;window.__qaListeners.get('disconnect')('transport close');window.__qaMessages.a.push({id:'offline-message',conversationId:'a',senderId:'other',sentAt:'2026-10-31T23:00:00Z',text:'Synthetic offline gap',read:false});document.dispatchEvent(new Event('visibilitychange'));})()`,
  );
  await b.delay(100);
  assert.equal(
    await b.evaluate('window.__qaCalls.filter(c=>c.path.includes("/updates")).length'),
    updatesBeforeOffline,
  );
  await b.evaluate(
    `Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'))`,
  );
  await b.waitFor('document.querySelectorAll(".cc-msg-message").length===336');
  stage = 'token renewal';
  // Token renewal recreates one physical connection; same token event is a no-op.
  await b.evaluate(
    'window.__qaToken="synthetic-renewal";window.dispatchEvent(new Event("qa-auth"))',
  );
  await b.waitFor('window.__qaSocketCount===2');
  await b.evaluate('window.dispatchEvent(new Event("qa-auth"))');
  await b.settle();
  assert.equal(await b.evaluate('window.__qaSocketCount'), 2);
  assert.equal(await b.evaluate('document.querySelectorAll(".cc-msg-message").length'), 336);
  stage = 'second tab';
  // Recover a committed message whose HTTP response was lost, without resending.
  await b.evaluate(
    `(()=>{const e=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Synthetic uncertain send');e.dispatchEvent(new Event('input',{bubbles:true}));window.__qaLoseResponseOnce=true;})()`,
  );
  await b.delay(50);
  await b.evaluate('document.querySelector(\'button[aria-label="Send message"]\').click()');
  await b.waitFor('Boolean(document.querySelector(".cc-msg-notice"))');
  await b.evaluate('window.__qaListeners.get("connect")()');
  await b.waitFor('document.querySelector("textarea").value===""');
  assert.equal(await b.evaluate('window.__qaCalls.filter(c=>c.method==="POST").length'), 1);
  // Open a second real tab in the same isolated Chrome profile/origin.
  const page = await fetch(
    `http://127.0.0.1:${b.debugPort}/json/new?${encodeURIComponent(b.origin + '/dark.html')}`,
    { method: 'PUT' },
  ).then((r) => r.json());
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const value = JSON.parse(event.data);
    const entry = pending.get(value.id);
    if (entry) {
      pending.delete(value.id);
      clearTimeout(entry.timer);
      value.error ? entry.reject(new Error(value.error.message)) : entry.resolve(value.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq,
        timer = setTimeout(() => reject(new Error('Second tab timeout')), 10000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async (expression) => {
    for (let n = 0; n < 150; n++) {
      if (await evaluate(expression)) return;
      await b.delay(30);
    }
    throw new Error('Second tab condition failed: ' + expression);
  };
  await wait('document.querySelectorAll(".cc-msg-message").length===50');
  assert.equal(await evaluate('window.__qaSocketCount'), 1);
  stage = 'read convergence';
  // Invalidation refetches each tab's synthetic authoritative unread count; no local +/- arithmetic.
  await evaluate(
    'window.__qaUnread=0;window.__qaListeners.get("messages:read")({conversationId:"a"})',
  );
  await b.evaluate(
    'window.__qaUnread=0;window.__qaListeners.get("messages:read")({conversationId:"a"})',
  );
  await wait('document.querySelector(".cc-msg-unread").textContent==="0 unread"');
  await b.waitFor('document.querySelector(".cc-msg-unread").textContent==="0 unread"');
  stage = 'drafts';
  // Independent session-memory drafts in two tabs.
  const draft = (text) =>
    `(()=>{const e=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`;
  await b.evaluate(draft('First tab draft'));
  await evaluate(draft('Second tab draft'));
  await b.delay(100);
  assert.equal(await b.evaluate('document.querySelector("textarea").value'), 'First tab draft');
  assert.equal(await evaluate('document.querySelector("textarea").value'), 'Second tab draft');
  stage = 'logout';
  // Controlled SDK auth adapters simulate a cross-tab logout notification, not real Supabase behavior.
  await b.evaluate(
    'window.__qaUid=null;window.dispatchEvent(new Event("qa-auth"));window.dispatchEvent(new Event("qa-account"))',
  );
  await evaluate(
    'window.__qaUid=null;window.dispatchEvent(new Event("qa-auth"));window.dispatchEvent(new Event("qa-account"))',
  );
  await b.waitFor('document.querySelector("textarea").value===""');
  await wait('document.querySelector("textarea").value===""');
  assert.equal(await evaluate('window.__qaSockets.every(s=>!s.connected)'), true);
  assert.equal(await b.evaluate('window.__qaSockets.every(s=>!s.connected)'), true);
  assert.deepEqual(b.errors, []);
  await writeFile(
    join(output, 'reliability-results.json'),
    JSON.stringify(
      {
        result: 'PASS',
        recoveredMissedMessages: 235,
        tabs: 2,
        checks: [
          'current-token renewal',
          'same-token no-op',
          '235-message cursor recovery',
          'history retained',
          'authoritative read invalidation in two tabs',
          'independent drafts',
          'synthetic logout cleanup',
        ],
        limitations: [
          'Supabase session events and server data simulated; real SDK cross-tab refresh not exercised',
          'No native mobile keyboard or distributed deployment evidence',
        ],
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: actual Messaging in two Chrome tabs; 235-message catch-up, token renewal, read invalidation convergence, drafts and logout. Synthetic adapters only.',
  );
} catch (error) {
  console.error('Reliability fixture failed at ' + stage);
  throw error;
} finally {
  ws?.close();
  await b.close();
}
