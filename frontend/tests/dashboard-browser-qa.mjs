/** Actual Dashboard/AppShell. Only auth and API records are isolated synthetic adapters. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2],
  browser = await openChromeFixture(output),
  results = [];
const load = async (width = 1440, theme = 'light', scenario = 'populated', role = 'STUDENT') => {
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: width < 768 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await browser.send('Page.navigate', {
    url: browser.origin + '/' + theme + '.html?' + new URLSearchParams({ case: scenario, role }),
  });
  await browser.waitFor('Boolean(document.querySelector(".cc-dashboard"))');
  if (scenario === 'loading')
    await browser.waitFor('Boolean(document.querySelector(".cc-db-loading"))');
  else if (
    ['error', 'unauthorized', 'forbidden', 'timeout', 'malformed', 'inactive'].includes(scenario)
  )
    await browser.waitFor('Boolean(document.querySelector(".cc-db-state"))');
  else await browser.waitFor('document.querySelectorAll(".cc-db-value").length===4');
  await browser.evaluate('document.fonts.ready');
  await browser.settle();
};
const click = (selector) =>
  browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
try {
  for (const width of [1920, 1440, 1280, 1024, 768, 430, 390, 360, 320])
    for (const theme of ['light', 'dark']) {
      await load(width, theme);
      const metrics = await browser.evaluate(
        `(()=>{const cards=[...document.querySelectorAll('.cc-db-metric')],rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,height:r.height}};return {cards:cards.map(rect),overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...document.querySelectorAll('.cc-db-value,.cc-db-action,.cc-db-attention-link')].some(e=>e.scrollWidth>e.clientWidth+1||e.getBoundingClientRect().right>innerWidth+1),bottom:[...document.querySelectorAll('.cc-mobile-nav a')].map(e=>e.getAttribute('href')),calls:window.__qaCalls.length,active:document.querySelector('.cc-shell-primary-nav [aria-current=page]')?.getAttribute('href')};})()`,
      );
      assert.equal(metrics.cards.length, 4);
      assert.equal(metrics.overflow, false);
      assert.equal(metrics.clipped, false);
      assert.equal(metrics.calls, 1);
      assert.equal(metrics.active, '/dashboard');
      const columns = width >= 768 ? 4 : width >= 340 ? 2 : 1;
      assert.equal(
        metrics.cards.filter((card) => Math.abs(card.top - metrics.cards[0].top) < 1).length,
        columns,
      );
      for (let i = 0; i < columns; i++)
        assert.ok(Math.abs(metrics.cards[i].height - metrics.cards[0].height) < 1);
      assert.deepEqual(metrics.bottom, [
        '/home',
        '/marketplace',
        '/search',
        '/assistant',
        '/messages',
        '/profile',
      ]);
      if ([1440, 1280, 1024, 390, 430, 320].includes(width))
        await browser.screenshot(`dashboard-${width}-${theme}`);
      await browser.evaluate(
        'window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"})',
      );
      const clearance = await browser.evaluate(
        `(()=>{const last=[...document.querySelectorAll('.cc-dashboard a,.cc-dashboard button,.cc-dashboard summary')].filter(e=>e.getClientRects().length&&!e.disabled).at(-1),bar=document.querySelector('.cc-mobile-nav');return {last:last.getBoundingClientRect().bottom,bar:bar.getBoundingClientRect().top,visible:getComputedStyle(bar).display!=='none',touch:last.getBoundingClientRect().height};})()`,
      );
      assert.ok(clearance.touch >= 44);
      if (clearance.visible)
        assert.ok(clearance.last <= clearance.bar + 1, JSON.stringify(clearance));
      if (width === 390) await browser.screenshot(`dashboard-bottom-${theme}`);
      results.push({ width, theme, ...metrics, clearance });
    }
  await load();
  assert.deepEqual(
    await browser.evaluate(
      'Array.from(document.querySelectorAll(".cc-db-value")).map(e=>e.textContent)',
    ),
    ['7', '2', '4', '2'],
  );
  assert.ok(
    (await browser.evaluate('document.querySelector(".cc-db-attention").innerText')).includes(
      '3 Pending service requests received',
    ),
  );
  assert.ok(
    (await browser.evaluate('document.querySelector(".cc-db-attention").innerText')).includes(
      '8 Unread messages',
    ),
  );
  // Exercise real Router links, not just href strings.
  const routes = [
    '/marketplace/new',
    '/lost-found/new?type=lost',
    '/lost-found/new?type=found',
    '/teamup/new',
    '/services/new',
    '/messages',
  ];
  for (let i = 0; i < routes.length; i++) {
    await click(`.cc-db-action:nth-child(${i + 1})`);
    await browser.waitFor(`window.__qaPath===${JSON.stringify(routes[i])}`);
    await browser.evaluate('window.__qaNavigate("/dashboard")');
    await browser.waitFor('document.querySelectorAll(".cc-db-value").length===4');
  }
  for (const path of ['/services/saved', '/messages']) {
    await click(`.cc-db-attention-link[href="${path}"]`);
    await browser.waitFor(`window.__qaPath===${JSON.stringify(path)}`);
    await browser.evaluate('window.__qaNavigate("/dashboard")');
    await browser.waitFor('document.querySelectorAll(".cc-db-value").length===4');
  }
  await browser.evaluate('document.querySelector(".cc-db-action").focus()');
  await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' });
  await browser.waitFor('window.__qaPath==="/marketplace/new"');
  for (const scenario of [
    'loading',
    'empty',
    'error',
    'unauthorized',
    'forbidden',
    'timeout',
    'malformed',
    'inactive',
    'large',
  ]) {
    await load(390, 'dark', scenario);
    if (
      [
        'loading',
        'error',
        'unauthorized',
        'forbidden',
        'timeout',
        'malformed',
        'inactive',
      ].includes(scenario)
    )
      assert.equal(
        await browser.evaluate('document.querySelectorAll(".cc-db-value,.cc-db-action").length'),
        0,
      );
    if (scenario === 'empty') {
      assert.deepEqual(
        await browser.evaluate(
          'Array.from(document.querySelectorAll(".cc-db-value")).map(e=>e.textContent)',
        ),
        ['0', '0', '0', '0'],
      );
      assert.ok(
        (await browser.evaluate('document.body.innerText')).includes('Nothing waiting here'),
      );
    }
    if (scenario === 'inactive') assert.equal(await browser.evaluate('window.__qaCalls.length'), 0);
    if (scenario === 'large')
      assert.equal(
        await browser.evaluate(
          'document.documentElement.scrollWidth>innerWidth||Array.from(document.querySelectorAll(".cc-db-value")).some(e=>e.scrollWidth>e.clientWidth+1)',
        ),
        false,
      );
    await browser.screenshot(`state-${scenario}-390-dark`);
  }
  for (const theme of ['light', 'dark']) {
    for (const scenario of ['loading', 'empty', 'error']) {
      await load(1440, theme, scenario);
      await browser.screenshot(`state-${scenario}-1440-${theme}`);
    }
    await load(320, theme, 'large');
    assert.equal(
      await browser.evaluate(
        'document.documentElement.scrollWidth>innerWidth||Array.from(document.querySelectorAll(".cc-db-value")).some(e=>e.scrollWidth>e.clientWidth+1)',
      ),
      false,
    );
    await browser.screenshot(`large-320-${theme}`);
  }
  // Recoverable initial failure, failed refresh and request cancellation/account isolation.
  await load();
  await browser.evaluate('window.__qaFail=true');
  await click('.cc-dashboard > header button');
  await browser.waitFor('Boolean(document.querySelector(".cc-db-state"))');
  assert.ok(
    (await browser.evaluate('document.querySelector(".cc-db-state").innerText')).includes(
      "couldn't refresh",
    ),
  );
  assert.equal(await browser.evaluate('document.querySelectorAll(".cc-db-value").length'), 0);
  await browser.screenshot('failed-refresh-desktop-light');
  await browser.evaluate('window.__qaFail=false');
  await click('.cc-db-state button');
  await browser.waitFor('document.querySelectorAll(".cc-db-value").length===4');
  await browser.evaluate('window.__qaHold=true');
  await click('.cc-dashboard > header button');
  await browser.waitFor('Boolean(window.__qaRelease)');
  await browser.evaluate(
    'window.__qaUser="synthetic-dashboard-b";window.__qaHold=false;window.dispatchEvent(new Event("qa-account"))',
  );
  await browser.waitFor('document.querySelector(".cc-db-value")?.textContent==="0"');
  await browser.evaluate('window.__qaRelease()');
  await browser.settle();
  assert.deepEqual(
    await browser.evaluate(
      'Array.from(document.querySelectorAll(".cc-db-value")).map(e=>e.textContent)',
    ),
    ['0', '0', '0', '0'],
  );
  assert.ok(await browser.evaluate('window.__qaAbort>0'));
  for (const role of ['MODERATOR', 'ADMIN']) {
    await load(1440, 'light', 'populated', role);
    assert.equal(await browser.evaluate('document.querySelectorAll(".cc-db-action").length'), 6);
  }
  await browser.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await load(390, 'dark');
  assert.ok(
    Number.parseFloat(
      await browser.evaluate(
        'getComputedStyle(document.querySelector(".cc-db-action")).transitionDuration',
      ),
    ) <= 0.00002,
  );
  assert.deepEqual(browser.errors, []);
  await writeFile(
    join(output, 'dashboard-results.json'),
    JSON.stringify(
      {
        evidence:
          'Actual components; synthetic API/auth adapters, no real authenticated integration',
        results,
        states: 9,
        routing: 'PASS',
        refresh: 'PASS',
        accountIsolation: 'PASS',
        keyboard: 'PASS',
        reducedMotion: 'PASS',
        browserErrors: browser.errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: Dashboard 18 viewport/theme cases, nine states, actual link activation, truthful counts, refresh/retry, account isolation, touch/clearance and reduced motion.',
  );
} finally {
  await browser.close();
}
