/** Actual Services forms/workspace in isolated Chrome; all records and writes synthetic. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2],
  b = await openChromeFixture(output);
const { send, evaluate, screenshot, settle, delay, waitFor } = b;
const results = [];
const uid = (i) => String(i).padStart(8, '0') + '-1111-4111-8111-111111111111';
const load = async (screen = 'create', width = 1440, theme = 'light', scenario = 'populated') => {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: width < 700 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await send('Page.navigate', {
    url: b.origin + '/' + theme + '.html?' + new URLSearchParams({ screen, case: scenario }),
  });
  await waitFor('Boolean(document.querySelector(".svm-page"))');
  if (scenario !== 'loading')
    await waitFor(
      screen === 'create'
        ? 'Boolean(document.querySelector(".svm-form"))'
        : screen === 'edit'
          ? 'Boolean(document.querySelector(".svm-form,.svm-state"))'
          : 'Boolean(document.querySelector(".svm-tabs,.svm-notice"))&&!document.querySelector("[role=tabpanel][aria-busy=true]")',
    );
  await evaluate('document.fonts.ready');
  await settle();
};
const click = async (selector) => {
  await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing '+${JSON.stringify(selector)});e.focus();e.click();})()`,
  );
  await settle();
};
const byText = async (label) => {
  await evaluate(
    `(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw new Error('Missing '+${JSON.stringify(label)});e.focus();e.click();})()`,
  );
  await settle();
};
const fill = async (selector, value) => {
  await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`,
  );
  await settle();
};
const tab = async (value) => {
  await click(`#workspace-tab-${value}`);
};
const writes = () => evaluate('window.__qaCalls.filter(c=>c.method!=="GET").length');
const refreshed = () =>
  waitFor('Boolean(document.querySelector("[role=tabpanel][aria-busy=false]"))');
const full = async (name) => {
  const { cssContentSize } = await send('Page.getLayoutMetrics');
  const shot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 },
  });
  await writeFile(join(output, name + '.png'), Buffer.from(shot.data, 'base64'));
};
const validCreate = async () => {
  await fill('#offer-title', 'Synthetic student service');
  await fill('#offer-category', 'Tutoring');
  await fill('#offer-description', 'Synthetic browser fixture description with enough detail.');
};
try {
  for (const screen of ['create', 'edit', 'workspace'])
    for (const width of [1920, 1440, 1366, 1280, 1024, 768, 430, 390, 360, 320])
      for (const theme of ['light', 'dark']) {
        await load(screen, width, theme);
        const geometry = await evaluate(
          `(()=>{const root=document.querySelector('.svm-page');return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,featureOverflow:root.scrollWidth>root.clientWidth,fieldsFit:[...document.querySelectorAll('input,textarea,select')].every(e=>e.getBoundingClientRect().right<=innerWidth),cards:document.querySelectorAll('.svm-card').length,columns:document.querySelector('.svm-grid')?getComputedStyle(document.querySelector('.svm-grid')).gridTemplateColumns.split(' ').length:null};})()`,
        );
        assert.equal(geometry.overflow, false);
        assert.equal(geometry.featureOverflow, false);
        assert.equal(geometry.fieldsFit, true);
        if (screen === 'workspace') assert.equal(geometry.columns, width < 768 ? 1 : 2);
        if (screen === 'create')
          assert.equal(
            await evaluate('document.querySelector(".svm-consent input").checked'),
            false,
          );
        if (screen === 'edit') {
          assert.equal(
            await evaluate('document.querySelector("#offer-title").value'),
            'Design support for student projects',
          );
          assert.equal(
            await evaluate('document.querySelector(".svm-consent input").checked'),
            true,
          );
          assert.ok(
            await evaluate('document.querySelector(".svm-form button[type=submit]").disabled'),
          );
        }
        assert.equal(
          await evaluate('window.__qaCalls.length'),
          screen === 'create' ? 0 : 1,
          'No duplicate initial fetch',
        );
        await screenshot(`${screen}-${width}-${theme}`);
        if ([1440, 390].includes(width)) await full(`${screen}-full-${width}-${theme}`);
        results.push({ screen, theme, ...geometry });
        console.log(`${screen} ${width} ${theme}: PASS`);
      }
  // Pricing, skill keyboard behavior, duplicate/limit validation, consent disclosure.
  await load('create', 390, 'light');
  await click('input[value="FIXED"]');
  assert.ok(await evaluate('!!document.querySelector("#offer-price")'));
  await fill('#offer-price', '999');
  await screenshot('create-fixed-price');
  await click('input[value="NEGOTIABLE"]');
  assert.equal(await evaluate('!!document.querySelector("#offer-price")'), false);
  await screenshot('create-negotiable');
  await fill('#offer-skill', 'Research');
  await evaluate('document.querySelector("#offer-skill").focus()');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
  await settle();
  assert.equal(await writes(), 0);
  assert.match(
    await evaluate('document.querySelector(".svm-skill-chips").textContent'),
    /Research/,
  );
  await fill('#offer-skill', 'research');
  await byText('Add skill');
  assert.match(
    await evaluate('document.querySelector(".svm-skills [role=alert]").textContent'),
    /already selected/,
  );
  await fill('#offer-skill', 'x'.repeat(51));
  await byText('Add skill');
  assert.match(
    await evaluate('document.querySelector(".svm-skills [role=alert]").textContent'),
    /50 characters/,
  );
  await fill('#offer-skill', '');
  await click('button[aria-label="Remove Research"]');
  assert.equal(await evaluate('document.querySelectorAll(".svm-skill-chips li").length'), 0);
  for (let i = 0; i < 12; i++) {
    await fill('#offer-skill', 'Skill ' + i);
    await byText('Add skill');
  }
  await fill('#offer-skill', 'Extra');
  await byText('Add skill');
  assert.match(
    await evaluate('document.querySelector(".svm-skills [role=alert]").textContent'),
    /12 skills/,
  );
  await fill('#offer-skill', '');
  await click('.svm-consent summary');
  await screenshot('create-consent-expanded');
  assert.match(
    await evaluate('document.querySelector(".svm-consent details").textContent'),
    /uncached homepage responses/,
  );
  await click('.svm-form button[type=submit]');
  assert.equal(await writes(), 0);
  assert.equal(await evaluate('document.activeElement.id'), 'offer-title');
  assert.equal(await evaluate('document.querySelectorAll(".svm-skill-chips li").length'), 12);
  await screenshot('create-validation-skills-preserved');
  // New offers: obsolete pricing removed, exactly one POST, server-confirmed destination.
  await load('create');
  await validCreate();
  await click('input[value="FIXED"]');
  await fill('#offer-price', '700');
  await click('input[value="FREE"]');
  await click('.svm-consent input');
  await evaluate(
    'window.__qaHold=true;document.querySelector(".svm-form").requestSubmit();document.querySelector(".svm-form").requestSubmit();',
  );
  await waitFor('typeof window.__qaRelease==="function"');
  assert.equal(await writes(), 1);
  assert.equal(await evaluate('document.querySelector("#offer-title").matches(":disabled")'), true);
  assert.ok(await evaluate('document.querySelector(".svm-form fieldset").disabled'));
  await evaluate('window.__qaRelease()');
  await waitFor('window.__qaLocation.endsWith("' + uid(99) + '")');
  let body = await evaluate('window.__qaCalls.find(c=>c.method==="POST").body');
  assert.equal(body.price, '0');
  assert.equal(body.pricingType, 'FREE');
  assert.equal(body.featuredOnLanding, true);
  assert.equal('providerId' in body, false);
  await load('create', 390, 'dark', 'write-error');
  await validCreate();
  await click('.svm-form button[type=submit]');
  await waitFor('Boolean(document.querySelector(".svm-notice--error"))');
  assert.equal(
    await evaluate('document.querySelector("#offer-title").value'),
    'Synthetic student service',
  );
  await screenshot('create-save-error');
  await evaluate('window.__qaFailWrite=false');
  await click('.svm-form button[type=submit]');
  await waitFor('window.__qaLocation.endsWith("' + uid(99) + '")');
  // Edit patches: unchanged values/consent survive; a changed amount pairs pricing, opt-out false.
  await load('edit');
  await fill('#offer-title', 'Only this title changed');
  await click('.svm-form button[type=submit]');
  await waitFor('window.__qaLocation==="/services/' + uid(1) + '"');
  body = await evaluate('window.__qaCalls.find(c=>c.method==="PATCH").body');
  assert.deepEqual(body, { title: 'Only this title changed' });
  await load('edit');
  await fill('#offer-price', '600.50');
  await click('.svm-consent input');
  await click('.svm-form button[type=submit]');
  await waitFor('window.__qaLocation==="/services/' + uid(1) + '"');
  body = await evaluate('window.__qaCalls.find(c=>c.method==="PATCH").body');
  assert.deepEqual(body, { featuredOnLanding: false, pricingType: 'FIXED', price: '600.50' });
  await load('edit', 390, 'dark', 'write-error');
  await fill('#offer-title', 'Keep my updated title');
  await click('.svm-form button[type=submit]');
  await waitFor('Boolean(document.querySelector(".svm-notice--error"))');
  assert.equal(
    await evaluate('document.querySelector("#offer-title").value'),
    'Keep my updated title',
  );
  await screenshot('edit-save-error');
  for (const scenario of [
    'archived',
    'nonowner',
    'missing-consent',
    'error',
    'notfound',
    'forbidden',
    'loading',
    'paused',
  ]) {
    await load('edit', 390, 'light', scenario);
    await screenshot(`edit-${scenario}`);
    if (!['paused', 'loading'].includes(scenario))
      assert.equal(await evaluate('!!document.querySelector(".svm-form")'), false);
    if (scenario === 'error') {
      await evaluate('window.__qaFailRead=false');
      await byText('Try again');
      await waitFor('Boolean(document.querySelector(".svm-form"))');
    }
  }
  // Workspace tab relationships, keyboard navigation and request filters.
  await load('workspace', 390, 'dark');
  assert.equal(await evaluate('document.querySelectorAll("[role=tab]").length'), 3);
  await click('#workspace-tab-offered');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
  await settle();
  assert.equal(await evaluate('document.activeElement.id'), 'workspace-tab-sent');
  assert.ok(
    await evaluate(
      'document.querySelector("#workspace-tab-sent").getAttribute("aria-selected")==="true"',
    ),
  );
  for (const value of ['offered', 'sent', 'received']) {
    await tab(value);
    assert.ok(
      await evaluate(
        '(()=>{const tab=document.querySelector("[role=tab][aria-selected=true]").getBoundingClientRect(),bar=document.querySelector(".svm-tabs").getBoundingClientRect();return tab.left>=bar.left&&tab.right<=bar.right;})()',
      ),
    );
    await screenshot(`workspace-tab-${value}`);
    assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false);
  }
  // Accept duplicate guard, full authoritative reload, no optimistic state.
  await load('workspace');
  await tab('received');
  await evaluate(
    'window.__qaHold=true;(()=>{const e=[...document.querySelectorAll("button")].find(e=>e.textContent.trim()==="Accept");e.click();e.click();})()',
  );
  await waitFor('typeof window.__qaRelease==="function"');
  assert.equal(await writes(), 1);
  assert.ok(
    await evaluate(
      'document.querySelector(".svm-request-card .svm-status").textContent==="Pending"',
    ),
  );
  await screenshot('workspace-review-pending');
  await evaluate('window.__qaRelease()');
  await refreshed();
  assert.equal(
    await evaluate('document.querySelector(".svm-request-card .svm-status").textContent'),
    'Accepted',
  );
  assert.equal(
    await evaluate('window.__qaCalls.filter(c=>c.path==="/api/services/workspace").length'),
    2,
  );
  await fill('select[aria-label="Filter request status"]', 'PENDING');
  assert.match(
    await evaluate('document.querySelector("[role=tabpanel]").textContent'),
    /No pending requests/,
  );
  await screenshot('workspace-no-pending');
  // A successful mutation with failed refresh never repeats its PATCH.
  await load('workspace', 390, 'dark', 'refresh-error');
  await tab('received');
  await byText('Accept');
  await waitFor('document.body.innerText.includes("Workspace refresh failed")');
  assert.equal(await writes(), 1);
  assert.equal(
    await evaluate(
      '[...document.querySelectorAll(".svm-request-card button")].every(e=>e.disabled)',
    ),
    true,
  );
  await screenshot('workspace-refresh-failed');
  await evaluate('window.__qaFailRefresh=false');
  await byText('Try again');
  await refreshed();
  assert.equal(await writes(), 1);
  await load('workspace', 390, 'light', 'conflict');
  await tab('received');
  await byText('Accept');
  await waitFor('Boolean(document.querySelector(".svm-notice--error"))');
  await refreshed();
  assert.equal(
    await evaluate('document.querySelector(".svm-request-card .svm-status").textContent'),
    'Rejected',
  );
  await screenshot('workspace-conflict-reconciled');
  // Rejection and historical completion stay distinct and server-confirmed.
  await load('workspace');
  await tab('received');
  await byText('Reject');
  await refreshed();
  assert.equal(
    await evaluate('window.__qaCalls.find(c=>c.path.endsWith("/review")).body.status'),
    'REJECTED',
  );
  await byText('Mark completed');
  await refreshed();
  assert.ok(await evaluate('window.__qaCalls.some(c=>c.path.endsWith("/complete"))'));
  await screenshot('workspace-completed');
  // Lifecycle menu + terminal Archive confirmation and focus restoration.
  await load('workspace', 390, 'light');
  await click('.svm-lifecycle summary');
  await byText('Pause');
  await refreshed();
  assert.equal(
    await evaluate('document.querySelector(".svm-card .svm-status").textContent'),
    'Paused',
  );
  await byText('Resume');
  await waitFor('document.querySelector(".svm-card .svm-status").textContent==="Available"');
  await refreshed();
  await byText('Archive');
  await waitFor('Boolean(document.querySelector("[role=dialog]"))');
  await screenshot('workspace-archive-confirmation');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await settle();
  assert.equal(await evaluate('!!document.querySelector("[role=dialog]")'), false);
  assert.equal(await evaluate('document.activeElement.textContent'), 'Archive');
  await byText('Archive');
  await click('[role=dialog] .cc-button--danger');
  await refreshed();
  assert.equal(
    await evaluate('document.querySelector(".svm-card .svm-status").textContent'),
    'Archived',
  );
  await load('workspace');
  await byText('Review requests');
  assert.equal(
    await evaluate(
      'document.querySelector("#workspace-tab-received").getAttribute("aria-selected")',
    ),
    'true',
  );
  assert.match(await evaluate('document.body.innerText'), /selected service/);
  // Correct SERVICE request IDs and participant direction, no pre-acceptance messaging.
  for (const received of [false, true]) {
    await load('workspace');
    await tab(received ? 'received' : 'sent');
    await byText(received ? 'Message requester' : 'Message provider');
    await waitFor('window.__qaLocation==="/messages/synthetic-conversation"');
    const message = await evaluate(
      'window.__qaCalls.find(c=>c.path==="/api/messages/conversations").body',
    );
    assert.equal(message.contextType, 'SERVICE');
    assert.equal(message.contextId, uid(received ? 101 : 201));
    assert.equal(message.targetUserId, received ? uid(131) : uid(25));
  }
  await load('workspace', 390, 'dark', 'message-error');
  await tab('sent');
  await byText('Message provider');
  await waitFor('Boolean(document.querySelector(".svm-notice--error"))');
  assert.equal(await evaluate('window.__qaLocation'), '/services/saved');
  await screenshot('workspace-message-error');
  for (const scenario of ['empty', 'redacted', 'long', 'error', 'loading'])
    for (const theme of ['light', 'dark']) {
      await load('workspace', 320, theme, scenario);
      if (!['loading', 'error'].includes(scenario)) {
        for (const value of ['offered', 'sent', 'received']) {
          await tab(value);
          assert.ok(
            await evaluate(
              '(()=>{const tab=document.querySelector("[role=tab][aria-selected=true]").getBoundingClientRect(),bar=document.querySelector(".svm-tabs").getBoundingClientRect();return tab.left>=bar.left&&tab.right<=bar.right;})()',
            ),
          );
          assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false);
          await screenshot(`workspace-${scenario}-${value}-${theme}`);
        }
      } else await screenshot(`workspace-${scenario}-${theme}`);
      if (scenario === 'error') {
        await evaluate('window.__qaFailRead=false');
        await byText('Try again');
        await refreshed();
      }
    }
  await load('create', 720, 'light');
  await screenshot('create-reflow-200-percent-equivalent');
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.equal(await evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'), true);
  assert.equal(await evaluate('window.__qaNetwork'), 0);
  assert.deepEqual(b.errors, []);
  await writeFile(
    join(output, 'verified-services-management.json'),
    JSON.stringify(
      {
        results,
        checks:
          '60 viewport/theme/screen cases; pricing, validation, skills, consent, prefill/patches, duplicate guards, conflicts, mutation refresh, tab/focus/dialog, lifecycle, review/completion, exact messaging context and states. Synthetic fixtures only. Native 200% zoom and authenticated shell are not verified.',
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: Services management Chrome QA — 60 viewport/screen/theme cases plus workflow and recovery checks. Synthetic fixtures only.',
  );
} finally {
  await b.close();
}
