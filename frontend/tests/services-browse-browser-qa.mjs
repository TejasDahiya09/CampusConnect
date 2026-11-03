/** Real components in isolated Chrome; all records are synthetic, no backend writes. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2];
const b = await openChromeFixture(output);
const { send, evaluate, screenshot, settle, waitFor, delay } = b;
const results = [];
const done = () => waitFor('Boolean(document.querySelector(".cc-sv-results[aria-busy=false]"))');
const load = async (width = 1440, theme = 'light', scenario = 'populated', query = '') => {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: width < 700 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await send('Page.navigate', {
    url: b.origin + '/' + theme + '.html?' + new URLSearchParams({ case: scenario, query }),
  });
  await waitFor('Boolean(document.querySelector(".cc-sv-results"))');
  if (scenario !== 'loading') await done();
  await evaluate('document.fonts.ready');
  await settle();
};
const fill = async (selector, value) => {
  await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`,
  );
  await settle();
};
const click = async (selector) => {
  await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing '+${JSON.stringify(selector)});e.focus();e.click();})()`,
  );
  await settle();
};
const labelClick = async (label) => {
  await evaluate(
    `(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!e)throw new Error('Missing '+${JSON.stringify(label)});e.focus();e.click();})()`,
  );
  await settle();
};
const calls = () => evaluate('window.__qaCalls.length');
try {
  for (const width of [1920, 1440, 1366, 1280, 1024, 768, 430, 390, 360, 320])
    for (const theme of ['light', 'dark']) {
      await load(width, theme);
      const metrics = await evaluate(
        `(()=>{const root=document.querySelector('.cc-sv-browse');return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,featureOverflow:root.scrollWidth>root.clientWidth,columns:getComputedStyle(document.querySelector('.cc-sv-grid')).gridTemplateColumns.split(' ').length,rail:getComputedStyle(document.querySelector('.cc-sv-filter-rail')).display!=='none',cardCount:document.querySelectorAll('.cc-sv-card').length,cardGeometry:[...document.querySelectorAll('.cc-sv-card')].every(e=>e.scrollWidth<=e.clientWidth&&e.querySelector('.cc-sv-card-footer').getBoundingClientRect().bottom<=e.getBoundingClientRect().bottom)};})()`,
      );
      assert.equal(metrics.overflow, false);
      assert.equal(metrics.featureOverflow, false);
      assert.equal(metrics.rail, width >= 1100);
      assert.equal(metrics.columns, width < 768 ? 1 : 2);
      assert.equal(metrics.cardCount, 12);
      assert.equal(metrics.cardGeometry, true);
      assert.equal(await calls(), 1, 'One initial request');
      assert.equal(
        await evaluate(
          'new URL(window.__qaCalls[0].path,"https://qa.test").searchParams.get("status")',
        ),
        'ACTIVE',
      );
      assert.equal(await evaluate('document.querySelectorAll(".cc-sv-card img").length'), 0);
      await screenshot(`services-${width}-${theme}`);
      if ([1440, 390].includes(width)) {
        await evaluate(
          'document.querySelector(".cc-sv-results").scrollIntoView({block:"start",behavior:"instant"})',
        );
        await screenshot(`cards-${width}-${theme}`);
      }
      results.push({ theme, ...metrics });
      console.log(`${width} ${theme}: PASS`);
    }
  await load();
  await labelClick('Next');
  await done();
  assert.match(await evaluate('window.__qaLocation'), /page=2/);
  await labelClick('Next');
  await done();
  assert.match(
    await evaluate('document.querySelector(".cc-sv-pagination").innerText'),
    /Page 3 of 3/,
  );
  assert.equal(
    await evaluate('[...document.querySelectorAll(".cc-sv-pagination button")].at(-1).disabled'),
    true,
  );
  await screenshot('pagination-last-page');
  await evaluate('window.__qaBack()');
  await done();
  assert.match(await evaluate('window.__qaLocation'), /page=2/);
  await evaluate('window.__qaForward()');
  await done();
  assert.match(await evaluate('window.__qaLocation'), /page=3/);
  await fill('#sv-desktop-category', 'Tutoring');
  await fill('#sv-desktop-pricing', 'FIXED');
  await fill('#sv-desktop-minPrice', '200');
  await fill('#sv-desktop-maxPrice', '500');
  await labelClick('Apply filters');
  await done();
  let path = await evaluate('window.__qaCalls.at(-1).path');
  assert.match(path, /category=Tutoring/);
  assert.match(path, /pricingType=FIXED/);
  assert.match(path, /minPrice=200/);
  assert.doesNotMatch(path, /page=3/);
  await screenshot('filters-active');
  assert.ok(
    await evaluate(
      '[...document.querySelectorAll(".cc-sv-card")].every(e=>e.textContent.includes("Tutoring")&&!e.textContent.includes("Negotiable"))',
    ),
  );
  await fill('#sv-desktop-pricing', 'NEGOTIABLE');
  let before = await calls();
  await labelClick('Apply filters');
  assert.equal(await calls(), before);
  assert.ok(
    await evaluate(
      'document.querySelector(".cc-sv-filters [role=alert]").textContent.includes("highlighted")',
    ),
  );
  await labelClick('Clear filters');
  await done();
  assert.equal(await evaluate('window.__qaLocation'), '/services');
  // Debounce and old-response rejection even if a transport ignores cancellation.
  before = await calls();
  await fill('input[aria-label="Search services"]', 'Python');
  await delay(100);
  assert.equal(await calls(), before);
  await done();
  await waitFor('window.__qaLocation.includes("search=Python")');
  assert.equal(await calls(), before + 1);
  await evaluate('window.__qaDelay="old"');
  await fill('input[aria-label="Search services"]', 'old');
  await delay(400);
  await waitFor('typeof window.__qaRelease==="function"');
  await fill('input[aria-label="Search services"]', 'design');
  await delay(400);
  await done();
  await evaluate('window.__qaRelease()');
  await delay(50);
  assert.ok(await evaluate('window.__qaAborted>0'));
  assert.ok(
    await evaluate(
      '[...document.querySelectorAll(".cc-sv-card")].every(e=>e.textContent.toLowerCase().includes("design"))',
    ),
  );
  await click('button[aria-label="Clear search"]');
  await done();
  assert.equal(await evaluate('window.__qaLocation'), '/services');
  await fill('input[aria-label="Search services"]', 'no-match-here');
  await evaluate('document.querySelector(".cc-sv-search").requestSubmit()');
  await done();
  assert.match(
    await evaluate('document.querySelector(".cc-sv-state").textContent'),
    /No matching services/,
  );
  await screenshot('no-matches');
  // Refresh restoration / malformed URL normalization / out-of-range pagination recovery.
  await load(1440, 'light', 'populated', 'category=Tutoring&pricingType=FREE&sort=oldest');
  assert.equal(await evaluate('document.querySelector("#sv-desktop-category").value'), 'Tutoring');
  assert.equal(
    await evaluate(`document.querySelector('select[aria-label="Sort services"]').value`),
    'oldest',
  );
  await load(1440, 'dark', 'populated', 'page=999&unknown=bad&status=ARCHIVED');
  assert.match(await evaluate('window.__qaLocation'), /page=3/);
  assert.doesNotMatch(await evaluate('window.__qaLocation'), /unknown|status/);
  await done();
  // Accessible mobile dialog, validation, persistence, Escape and focus restoration.
  for (const width of [390, 320])
    for (const theme of ['light', 'dark']) {
      await load(width, theme);
      await click('.cc-sv-filter-trigger');
      await waitFor('Boolean(document.querySelector("[role=dialog]"))');
      assert.equal(await evaluate('document.body.style.overflow'), 'hidden');
      await fill('#sv-mobile-category', 'Tutoring');
      await fill('#sv-mobile-minPrice', '9');
      await fill('#sv-mobile-maxPrice', '1');
      before = await calls();
      await click('.cc-sv-drawer button[type=submit]');
      assert.equal(await calls(), before);
      assert.equal(
        await evaluate(
          'document.querySelector("#sv-mobile-minPrice").getAttribute("aria-invalid")',
        ),
        'true',
      );
      await screenshot(`drawer-${width}-${theme}`);
      await fill('#sv-mobile-minPrice', '0');
      await click('.cc-sv-drawer button[type=submit]');
      await done();
      assert.equal(await evaluate('!!document.querySelector("[role=dialog]")'), false);
      await click('.cc-sv-filter-trigger');
      assert.equal(
        await evaluate('document.querySelector("#sv-mobile-category").value'),
        'Tutoring',
      );
      // Reverse Tab at the first element wraps to the final control.
      await click('[aria-label="Close dialog"]');
      await click('.cc-sv-filter-trigger');
      await settle();
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        modifiers: 8,
      });
      await send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Tab',
        code: 'Tab',
        modifiers: 8,
      });
      assert.equal(await evaluate('document.activeElement.textContent'), 'Clear filters');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
      await settle();
      assert.equal(
        await evaluate('document.activeElement.classList.contains("cc-sv-filter-trigger")'),
        true,
      );
      assert.equal(await evaluate('document.body.style.overflow'), '');
    }
  for (const scenario of ['loading', 'empty', 'error', 'long'])
    for (const theme of ['light', 'dark']) {
      await load(scenario === 'long' ? 320 : 390, theme, scenario);
      await screenshot(`${scenario}-${theme}`);
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false);
      if (scenario === 'error') {
        await evaluate('window.__qaFail=false');
        await labelClick('Retry');
        await done();
        assert.equal(await evaluate('document.querySelectorAll(".cc-sv-card").length'), 12);
        assert.equal(await evaluate('!!document.querySelector("[role=alert]")'), false);
      }
      if (scenario === 'empty')
        assert.match(
          await evaluate('document.querySelector(".cc-sv-state").textContent'),
          /No published services/,
        );
    }
  for (const pricingType of ['FREE', 'FIXED', 'NEGOTIABLE']) {
    await load(1440, 'light', 'populated', `pricingType=${pricingType}`);
    const text = await evaluate('document.querySelector(".cc-sv-price").textContent');
    assert.ok(
      pricingType === 'FREE'
        ? text === 'Free'
        : pricingType === 'NEGOTIABLE'
          ? text === 'Negotiable'
          : text.startsWith('₹'),
    );
    await screenshot(`pricing-${pricingType.toLowerCase()}`);
  }
  await load(1440, 'light');
  await evaluate(`document.querySelector('input[aria-label="Search services"]').focus()`);
  await screenshot('search-focused');
  await load(720, 'light');
  await screenshot('reflow-1440-at-200-percent-equivalent');
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.ok(
    await evaluate(
      'parseFloat(getComputedStyle(document.querySelector(".cc-sv-card")).transitionDuration)<=0.001',
    ),
  );
  assert.equal(await evaluate('window.__qaNetwork'), 0);
  assert.deepEqual(b.errors, []);
  await writeFile(
    join(output, 'verified-services-browse.json'),
    JSON.stringify(
      {
        results,
        checks:
          'Filters, URL/history, debounce/cancel/stale protection, pagination, privacy-safe cards, dialog focus/Escape, states, recovery, reduced motion. 720px is zoom-equivalent reflow, not native browser zoom.',
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: 20 viewport/theme cases + interaction/state coverage. Synthetic fixtures only; no authenticated API verification.',
  );
} finally {
  await b.close();
}
