/** Real Messaging + AppShell in isolated Chrome. Synthetic records, no live authentication. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2],
  b = await openChromeFixture(output),
  results = [];
const { evaluate, waitFor, settle, screenshot, send } = b;
const load = async (width = 1440, theme = 'light', scenario = 'populated', inbox = false) => {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: width < 768 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await send('Page.navigate', {
    url:
      b.origin +
      '/' +
      theme +
      '.html?' +
      new URLSearchParams({ case: scenario, ...(inbox ? { inbox: '1' } : {}) }),
  });
  await waitFor('Boolean(document.querySelector(".cc-msg-page"))');
  if (!['loading', 'history-error'].includes(scenario) && !inbox)
    await waitFor(
      'document.querySelectorAll(".cc-msg-message").length>0 || Boolean(document.querySelector(".cc-msg-history h3"))',
    );
  await waitFor(
    'window.__qaCalls.some(c=>new URL(c.path,"http://fixture").pathname==="/api/messages")',
  );
  await evaluate('document.fonts.ready');
  await settle();
};
const click = async (selector) => {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await settle();
};
const fill = async (selector, value) => {
  await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await settle();
};
const go = async (id) => {
  await evaluate(`window.__qaNavigate(${JSON.stringify('/messages' + (id ? '/' + id : ''))})`);
  await settle();
};
const count = () => evaluate('document.querySelectorAll(".cc-msg-message").length');
const postCalls = () => evaluate('window.__qaCalls.filter(c=>c.method==="POST")');
try {
  for (const width of [1920, 1440, 1366, 1280, 1024, 768, 430, 390, 360, 320])
    for (const theme of ['light', 'dark']) {
      await load(width, theme);
      const metrics = await evaluate(
        `(()=>{const q=s=>document.querySelector(s),r=s=>{const x=q(s).getBoundingClientRect();return {top:x.top,bottom:x.bottom,width:x.width,left:x.left}};return {overflow:document.documentElement.scrollWidth>innerWidth,thread:r('.cc-msg-thread'),inbox:r('.cc-msg-inbox'),composer:r('.cc-msg-composer'),bottom:r('.cc-mobile-nav'),history:q('.cc-msg-history').scrollHeight>q('.cc-msg-history').clientHeight,links:q('.cc-mobile-nav').querySelectorAll('a').length,textarea:q('textarea').scrollWidth<=q('textarea').clientWidth};})()`,
      );
      assert.equal(metrics.overflow, false);
      assert.equal(metrics.textarea, true);
      assert.equal(metrics.links, 6);
      assert.equal(metrics.history, true);
      assert.ok(
        await evaluate(
          `(()=>{const h=document.querySelector('.cc-msg-history');return h.scrollHeight-h.clientHeight-h.scrollTop<2;})()`,
        ),
        'Latest messages stay visible after fonts settle',
      );
      if (width >= 768) assert.ok(Math.abs(metrics.thread.top - metrics.inbox.top) < 1);
      else assert.ok(metrics.composer.bottom <= metrics.bottom.top + 1, JSON.stringify(metrics));
      await screenshot(`conversation-${width}-${theme}`);
      await go();
      await screenshot(`inbox-${width}-${theme}`);
      results.push({ width, theme, ...metrics });
    }
  await load();
  assert.equal(await count(), 50);
  assert.ok(await evaluate('document.querySelector(".cc-msg-history").scrollTop>100'));
  await evaluate('document.querySelector(".cc-msg-history").scrollTop=0');
  const firstBefore = await evaluate(
    'document.querySelector(".cc-msg-message").getBoundingClientRect().top',
  );
  await click('.cc-msg-earlier');
  await waitFor('document.querySelectorAll(".cc-msg-message").length===100');
  assert.ok(
    Math.abs(
      (await evaluate(
        'document.querySelectorAll(".cc-msg-message")[50].getBoundingClientRect().top',
      )) - firstBefore,
    ) < 5,
    'Older history preserves visible anchor',
  );
  await screenshot('earlier-history-light');
  await click('.cc-msg-earlier');
  await waitFor('document.querySelectorAll(".cc-msg-message").length===120');
  assert.equal(await evaluate('Boolean(document.querySelector(".cc-msg-earlier"))'), false);
  assert.deepEqual(
    await evaluate(
      'window.__qaCalls.filter(c=>c.method==="PATCH").map(c=>c.body.readReceipt).filter(r=>r.startsWith("signed-fixture-"))',
    ),
    ['signed-fixture-a-1', 'signed-fixture-a-2', 'signed-fixture-a-3'],
  );
  // Scroll up, deliver a genuine synthetic transport event and its duplicate.
  await evaluate(
    `(()=>{const h=document.querySelector('.cc-msg-history');h.scrollTop=0;h.dispatchEvent(new Event('scroll'));const m={...window.__qaMessages.a.at(-1),id:'socket-new',text:'Synthetic incoming message',sentAt:'2026-10-31T12:00:00Z'};window.__qaMessages.a.push(m);window.__qaListeners.get('message:new')(m);window.__qaListeners.get('message:new')(m);})()`,
  );
  await waitFor('Boolean(document.querySelector(".cc-msg-jump"))');
  assert.equal(await count(), 121);
  assert.equal(await evaluate('document.querySelector(".cc-msg-history").scrollTop'), 0);
  await screenshot('new-message-indicator');
  await click('.cc-msg-jump');
  assert.ok(await evaluate('document.querySelector(".cc-msg-history").scrollTop>100'));
  // Filter must not discard selected thread/draft, and no socket listener multiplication.
  await fill('textarea', 'Draft A');
  await click('.cc-msg-filters button:nth-child(4)');
  await waitFor('document.querySelectorAll(".cc-msg-row").length===1');
  assert.equal(await evaluate('document.querySelector("textarea").value'), 'Draft A');
  assert.equal(await count(), 121);
  await go('b');
  await waitFor('document.querySelectorAll(".cc-msg-message").length===1');
  await fill('textarea', 'Draft B');
  await go('a');
  await waitFor('document.querySelectorAll(".cc-msg-message").length===50');
  assert.equal(await evaluate('document.querySelector("textarea").value'), 'Draft A');
  assert.equal(await evaluate('window.__qaSocketCount'), 1);
  await evaluate('window.__qaDelaySend=true');
  await click('button[aria-label="Send message"]');
  await waitFor('Boolean(window.__qaFinishSend)');
  await go('b');
  await waitFor('document.querySelectorAll(".cc-msg-message").length===1');
  assert.equal(await evaluate('document.querySelector("textarea").value'), 'Draft B');
  await evaluate('window.__qaDelaySend=false;window.__qaFinishSend()');
  await waitFor(`!document.querySelector('button[aria-label="Sending message"]')`);
  assert.equal(await evaluate('document.querySelector("textarea").value'), 'Draft B');
  await go('a');
  await waitFor('document.querySelectorAll(".cc-msg-message").length===50');
  assert.equal(await evaluate('document.querySelector("textarea").value'), '');
  // Retry uses stable durable ID, including returning to an earlier failed payload.
  await fill('textarea', 'Unconfirmed A');
  await evaluate('window.__qaFailSend=true');
  await click('button[aria-label="Send message"]');
  await waitFor('Boolean(document.querySelector(".cc-msg-notice"))');
  const failed = (await postCalls()).at(-1).body.clientMessageId;
  await click('button[aria-label="Send message"]');
  await waitFor('window.__qaCalls.filter(c=>c.method==="POST").length===3');
  await settle();
  assert.equal((await postCalls()).at(-1).body.clientMessageId, failed);
  await fill('textarea', 'Edited separate message');
  await click('button[aria-label="Send message"]');
  await waitFor('window.__qaCalls.filter(c=>c.method==="POST").length===4');
  await settle();
  assert.notEqual((await postCalls()).at(-1).body.clientMessageId, failed);
  await fill('textarea', 'Unconfirmed A');
  await evaluate('window.__qaFailSend=false');
  await click('button[aria-label="Send message"]');
  await waitFor('document.querySelector("textarea").value===""');
  assert.equal((await postCalls()).at(-1).body.clientMessageId, failed);
  // Socket echo of HTTP message must not add a second bubble.
  const before = await count();
  await evaluate('window.__qaListeners.get("message:new")(window.__qaMessages.a.at(-1))');
  await settle();
  assert.equal(await count(), before);
  // Native keyboard semantics and whitespace guards.
  await fill('textarea', '   ');
  assert.equal(
    await evaluate(`document.querySelector('button[aria-label="Send message"]').disabled`),
    true,
  );
  await fill('textarea', 'IME text');
  const postsBefore = (await postCalls()).length;
  await evaluate(
    `document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}))`,
  );
  await settle();
  assert.equal((await postCalls()).length, postsBefore);
  await evaluate(
    `document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true}))`,
  );
  await settle();
  assert.equal((await postCalls()).length, postsBefore);
  // Search excludes message-body search; debounce and selected identity stay coherent.
  await click('.cc-msg-filters button:first-child');
  await fill('input[aria-label="Search conversations"]', 'zzzz-no-match');
  await waitFor('Boolean(document.querySelector(".cc-msg-state h2"))');
  assert.equal(
    await evaluate('document.querySelector(".cc-msg-state h2").textContent'),
    'No matching conversations',
  );
  await click('button[aria-label="Clear search"]');
  await waitFor('document.querySelectorAll(".cc-msg-row").length===2');
  // Account switch remounts state and removes private drafts.
  await fill('textarea', 'Private draft');
  await evaluate('window.__qaUid="another-account";window.dispatchEvent(new Event("qa-account"))');
  await waitFor('document.querySelector("textarea").value===""');
  for (const scenario of [
    'loading',
    'history-error',
    'inbox-error',
    'empty',
    'empty-thread',
    'read-error',
    'redacted',
  ]) {
    await load(390, 'dark', scenario, scenario === 'empty' || scenario === 'inbox-error');
    if (scenario === 'loading')
      assert.equal(
        await evaluate(
          'document.querySelector(".cc-msg-history").textContent.includes("No messages yet")',
        ),
        false,
      );
    if (scenario.includes('error'))
      await waitFor('Boolean(document.querySelector(".cc-msg-notice"))');
    if (scenario === 'redacted')
      assert.equal(
        await evaluate(
          'Boolean(document.querySelector(".cc-msg-thread-heading a:not(.cc-msg-back)"))',
        ),
        false,
      );
    await screenshot(scenario + '-mobile-dark');
  }
  await load(390, 'light');
  await fill('textarea', 'Synthetic focused composer');
  await evaluate('document.querySelector("textarea").focus()');
  await screenshot('composer-focused-mobile-light');
  await evaluate('window.__qaFailSend=true');
  await click('button[aria-label="Send message"]');
  await waitFor('Boolean(document.querySelector(".cc-msg-notice"))');
  await screenshot('send-failure-mobile-light');
  await load(1440, 'light', 'empty', true);
  await screenshot('empty-inbox-desktop-light');
  await load(390, 'dark');
  await evaluate(
    `(()=>{const h=document.querySelector('.cc-msg-history');h.scrollTop=0;h.dispatchEvent(new Event('scroll'));const m={...window.__qaMessages.a.at(-1),id:'mobile-new',text:'Synthetic new campus message',sentAt:'2026-10-31T12:00:00Z'};window.__qaMessages.a.push(m);window.__qaListeners.get('message:new')(m);})()`,
  );
  await waitFor('Boolean(document.querySelector(".cc-msg-jump"))');
  await screenshot('new-message-mobile-dark');
  await click('.cc-msg-back');
  assert.equal(await evaluate('document.activeElement.tagName'), 'H1');
  await click('.cc-msg-row');
  await waitFor('document.activeElement.tagName==="H2"');
  await evaluate('window.__qaListeners.get("disconnect")()');
  await waitFor('Boolean(document.querySelector(".cc-msg-connection"))');
  await screenshot('socket-disconnected-mobile-dark');
  await load(720, 'light');
  await screenshot('zoom-reflow-720-csspx');
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.equal(
    await evaluate('getComputedStyle(document.querySelector(".cc-msg-row")).transitionDuration'),
    '0s',
  );
  assert.deepEqual(b.errors, []);
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify(
      {
        responsive: results,
        interactions:
          'Passed: pagination, anchoring, drafts, delayed send, durable retries, deduplication, signed receipts, filters, search, IME, account isolation, errors, reduced motion',
        runtimeErrors: b.errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'Messaging Chrome QA: 20 responsive/theme combinations and interaction scenarios passed. Synthetic AppShell fixtures only.',
  );
} finally {
  await b.close();
}
