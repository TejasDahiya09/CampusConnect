/** Actual detail components in isolated Chrome. No authenticated or production requests. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2],
  b = await openChromeFixture(output);
const { send, evaluate, screenshot, waitFor, settle, delay } = b;
const results = [];
const id = '10000000-1111-4111-8111-111111111111',
  requestId = '20000000-1111-4111-8111-111111111111';
const load = async (width = 1440, theme = 'light', scenario = 'eligible') => {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: width < 700 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await send('Page.navigate', {
    url: b.origin + '/' + theme + '.html?' + new URLSearchParams({ case: scenario }),
  });
  await waitFor('Boolean(document.querySelector(".cc-sd-detail"))');
  if (scenario !== 'loading')
    await waitFor(
      'Boolean(document.querySelector(".cc-sd-overview,.cc-sd-state"))&&!document.querySelector(".cc-sd-sync")',
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
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await settle();
};
const posts = () =>
  evaluate('window.__qaCalls.filter(c=>c.method==="POST"&&c.path.endsWith("/requests")).length');
try {
  for (const width of [1920, 1440, 1366, 1280, 1024, 768, 430, 390, 360, 320])
    for (const theme of ['light', 'dark']) {
      await load(width, theme);
      const metrics = await evaluate(
        `(()=>{const root=document.querySelector('.cc-sd-detail');const r=e=>{const b=e.getBoundingClientRect();return {top:b.top,left:b.left,width:b.width,bottom:b.bottom};};return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,featureOverflow:root.scrollWidth>root.clientWidth,overview:r(document.querySelector('.cc-sd-overview')),pricing:r(document.querySelector('.cc-sd-pricing')),information:r(document.querySelector('.cc-sd-information')),provider:r(document.querySelector('.cc-sd-provider')),actions:r(document.querySelector('.cc-sd-secondary')),textareaFits:document.querySelector('textarea').scrollWidth<=document.querySelector('textarea').clientWidth};})()`,
      );
      assert.equal(metrics.overflow, false);
      assert.equal(metrics.featureOverflow, false);
      assert.equal(metrics.textareaFits, true);
      if (width >= 900) {
        assert.ok(Math.abs(metrics.overview.top - metrics.pricing.top) < 1);
        assert.ok(metrics.overview.width > metrics.pricing.width);
      } else {
        assert.ok(metrics.pricing.top >= metrics.overview.bottom);
        assert.ok(metrics.information.top >= metrics.pricing.bottom);
        assert.ok(metrics.provider.top >= metrics.information.bottom);
        assert.ok(metrics.actions.top >= metrics.provider.bottom);
      }
      assert.equal(await evaluate('document.querySelectorAll("textarea").length'), 1);
      assert.equal(
        await evaluate('window.__qaCalls.length'),
        1,
        'One initial detail request, no decorative API calls',
      );
      assert.ok(
        await evaluate(
          'document.querySelector(".cc-sd-description").textContent.includes("[campusconnect-examiner-demo-v1]")',
        ),
      );
      await screenshot(`detail-${width}-${theme}`);
      if (width === 390) {
        const { cssContentSize } = await send('Page.getLayoutMetrics');
        const full = await send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          clip: {
            x: 0,
            y: 0,
            width: cssContentSize.width,
            height: cssContentSize.height,
            scale: 1,
          },
        });
        await writeFile(
          join(output, `detail-full-390-${theme}.png`),
          Buffer.from(full.data, 'base64'),
        );
        await evaluate(
          'document.querySelector(".cc-sd-pricing").scrollIntoView({block:"start",behavior:"instant"})',
        );
        await screenshot(`request-panel-390-${theme}`);
      }
      if ([1440, 390].includes(width)) {
        await evaluate(
          'document.querySelector(".cc-sd-secondary").scrollIntoView({block:"end",behavior:"instant"})',
        );
        await screenshot(`detail-bottom-${width}-${theme}`);
      }
      results.push({ theme, ...metrics });
      console.log(`${width} ${theme}: PASS`);
    }
  for (const scenario of [
    'free',
    'negotiable',
    'pending',
    'accepted',
    'rejected',
    'completed',
    'owner',
    'owner-archived',
    'paused',
    'archived',
    'redacted',
    'long',
    'sparse',
    'hidden-history',
  ])
    for (const theme of ['light', 'dark']) {
      await load(390, theme, scenario);
      await delay(60);
      await screenshot(`${scenario}-390-${theme}`);
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false);
      if (
        [
          'pending',
          'accepted',
          'owner',
          'owner-archived',
          'paused',
          'archived',
          'hidden-history',
        ].includes(scenario)
      )
        assert.equal(await evaluate('!!document.querySelector("textarea")'), false);
      if (['rejected', 'completed'].includes(scenario))
        assert.equal(await evaluate('!!document.querySelector("textarea")'), true);
      if (scenario === 'redacted')
        assert.equal(
          await evaluate(
            'document.querySelector(".cc-sd-provider").textContent.includes("Synthetic provider")',
          ),
          false,
        );
      if (scenario === 'owner')
        assert.equal(
          await evaluate(`document.querySelector('a[href="/services/${id}/edit"]')!==null`),
          true,
        );
      if (scenario === 'free')
        assert.equal(await evaluate('document.querySelector(".cc-sd-price").textContent'), 'Free');
      if (scenario === 'negotiable')
        assert.equal(
          await evaluate('document.querySelector(".cc-sd-price").textContent'),
          'Negotiable',
        );
    }
  await load(320, 'dark', 'long');
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false);
  await screenshot('long-320-dark');
  // Optional message validation and duplicate-submit protection before React can repaint.
  await load();
  await fill('textarea', 'a'.repeat(1001));
  assert.ok(
    await evaluate('document.querySelector("textarea").getAttribute("aria-invalid")==="true"'),
  );
  assert.equal(await posts(), 0);
  await fill('textarea', 'Synthetic request for help');
  await evaluate(
    'window.__qaHold=true;document.querySelector(".cc-sd-request-form").requestSubmit();document.querySelector(".cc-sd-request-form").requestSubmit();',
  );
  await waitFor('typeof window.__qaRelease==="function"');
  assert.equal(await posts(), 1);
  assert.equal(await evaluate('document.querySelector("textarea").disabled'), true);
  await screenshot('request-submitting');
  await evaluate('window.__qaRelease()');
  await waitFor(
    'Boolean(document.querySelector(".cc-sd-request-status"))&&!document.querySelector(".cc-sd-sync")',
  );
  assert.match(
    await evaluate('document.querySelector(".cc-sd-request-status").textContent'),
    /PENDING/,
  );
  assert.equal(await posts(), 1);
  assert.equal(
    await evaluate(
      'window.__qaCalls.filter(c=>c.path==="/api/services/' + id + '"&&c.method==="GET").length',
    ),
    2,
  );
  await screenshot('request-confirmed-pending');
  // Confirmed POST vs failed refresh is explicit; retry never repeats a POST.
  await load(390, 'dark', 'refresh-error');
  await byText('Request service');
  await waitFor('Boolean(document.querySelector(".cc-sd-refresh-error"))');
  assert.match(
    await evaluate('document.querySelector(".cc-sd-refresh-error").textContent'),
    /request was submitted/,
  );
  assert.equal(await evaluate('!!document.querySelector("textarea")'), false);
  await screenshot('request-refresh-failed');
  await evaluate('window.__qaFailRefresh=false');
  await byText('Refresh service');
  await waitFor(
    '!document.querySelector(".cc-sd-refresh-error")&&!document.querySelector(".cc-sd-sync")',
  );
  assert.equal(await posts(), 1);
  await load(390, 'light', 'request-error');
  await byText('Request service');
  await waitFor(
    'Boolean(document.querySelector(".cc-sd-feedback--error"))&&!document.querySelector(".cc-sd-sync")',
  );
  assert.equal(await evaluate('!!document.querySelector("textarea")'), true);
  assert.doesNotMatch(await evaluate('document.body.innerText'), /Service request submitted/);
  await load(390, 'light', 'conflict');
  await byText('Request service');
  await waitFor(
    'Boolean(document.querySelector(".cc-sd-request-status"))&&!document.querySelector(".cc-sd-sync")',
  );
  assert.equal(await evaluate('!!document.querySelector("textarea")'), false);
  // Real existing conversation adapter: request ID, opposite participant, server rejection handling.
  await load(390, 'light', 'accepted');
  await waitFor(
    '[...document.querySelectorAll("button")].some(e=>e.textContent.trim()==="Message provider")',
  );
  await byText('Message provider');
  await waitFor('window.__qaLocation==="/messages/fixture-conversation"');
  const conversation = await evaluate(
    'window.__qaCalls.find(c=>c.path==="/api/messages/conversations").body',
  );
  assert.equal(conversation.contextId, requestId);
  assert.equal(conversation.contextType, 'SERVICE');
  assert.equal(conversation.targetUserId, '30000000-1111-4111-8111-111111111111');
  assert.notEqual(conversation.contextId, id);
  await load(390, 'dark', 'message-error');
  await waitFor(
    '[...document.querySelectorAll("button")].some(e=>e.textContent.trim()==="Message provider")',
  );
  await byText('Message provider');
  await waitFor('Boolean(document.querySelector(".cc-sd-feedback--error"))');
  assert.equal(await evaluate('window.__qaLocation'), '/services/' + id);
  await screenshot('messaging-rejected');
  await load(390, 'light', 'workspace-error');
  await waitFor('document.body.innerText.includes("Could not check messaging")');
  await evaluate('window.__qaFailWorkspace=false');
  await byText('Retry messaging check');
  await waitFor(
    '[...document.querySelectorAll("button")].some(e=>e.textContent.trim()==="Message provider")',
  );
  await load(390, 'light', 'owner');
  await byText('Archive');
  await waitFor('document.querySelector(".cc-sd-availability").textContent==="Archived"');
  assert.equal(await evaluate('window.__qaCalls.filter(c=>c.path.endsWith("/status")).length'), 1);
  // Sharing and reporting use the original shared components and payloads.
  await load();
  await click('.cc-sd-share summary');
  assert.match(
    await evaluate('decodeURIComponent(document.querySelector(".cc-sd-share a").href)'),
    /\/services\/10000000/,
  );
  await screenshot('share-expanded');
  await byText('Report');
  await waitFor('Boolean(document.querySelector("[role=dialog]"))');
  await evaluate('document.querySelector("[role=dialog] form").requestSubmit()');
  await waitFor('document.body.innerText.includes("report was submitted")');
  const report = await evaluate(
    'window.__qaCalls.find(c=>c.path==="/api/moderation/reports").body',
  );
  assert.equal(report.targetType, 'SERVICE');
  assert.equal(report.targetId, id);
  await screenshot('report-confirmed');
  // Failure states are not presented as empty content; retry recovers with current authoritative data.
  for (const scenario of ['loading', 'error', 'notfound', 'hidden', 'forbidden', 'invalid-link']) {
    await load(390, 'dark', scenario);
    await screenshot(`state-${scenario}`);
    if (scenario === 'invalid-link') assert.equal(await evaluate('window.__qaCalls.length'), 0);
    if (scenario === 'error') {
      await evaluate('window.__qaFailGet=false');
      await byText('Try again');
      await waitFor('Boolean(document.querySelector(".cc-sd-overview"))');
    }
  }
  await load(720, 'light');
  await screenshot('reflow-200-percent-equivalent');
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.equal(await evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'), true);
  assert.equal(await evaluate('window.__qaNetwork'), 0);
  assert.deepEqual(b.errors, []);
  await writeFile(
    join(output, 'verified-services-detail.json'),
    JSON.stringify(
      {
        results,
        checks:
          '20 viewport/theme cases, 28 mobile state cases, long content, request validation/duplicate guards, authoritative refresh/recovery, messaging request-ID and failure, owner archive, Share/Report payloads, loading/errors. 720px is zoom-equivalent reflow, not native zoom. Synthetic fixtures only; authenticated shell not verified.',
      },
      null,
      2,
    ),
  );
  console.log('PASS: Services Details layout/state/workflow Chrome QA; synthetic fixtures only.');
} finally {
  await b.close();
}
