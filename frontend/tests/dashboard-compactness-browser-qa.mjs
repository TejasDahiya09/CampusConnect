/** Matched before/after measurements, actual components, isolated synthetic aggregates. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';

const output = process.argv[2],
  before = process.argv.includes('--before');
const baselinePath = process.argv.find((arg) => arg.startsWith('--baseline='))?.slice(11);
const browser = await openChromeFixture(output),
  results = [];
const datasetHash = createHash('sha256')
  .update(await readFile(resolve('frontend/tests/fixtures/dashboard-fixtures.ts')))
  .digest('hex');
const viewports = [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [1280, 800],
  [1024, 768],
  [430, 932],
  [390, 844],
  [360, 800],
  [320, 568],
];
const load = async (width, height, theme, scenario) => {
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await browser.send('Page.navigate', {
    url: browser.origin + '/' + theme + '.html?' + new URLSearchParams({ case: scenario }),
  });
  await browser.waitFor('document.querySelectorAll(".cc-db-value").length===4');
  await browser.evaluate('document.fonts.ready');
  await browser.settle();
};
const fullScreenshot = async (name) => {
  await browser.evaluate('window.scrollTo({top:0,behavior:"instant"})');
  const layout = await browser.send('Page.getLayoutMetrics');
  const shot = await browser.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width: layout.cssContentSize.width,
      height: layout.cssContentSize.height,
      scale: 1,
    },
  });
  await writeFile(join(output, name + '.png'), Buffer.from(shot.data, 'base64'));
};
try {
  for (const [width, height] of viewports)
    for (const theme of ['light', 'dark'])
      for (const scenario of ['populated', 'empty']) {
        await load(width, height, theme, scenario);
        const metrics = await browser.evaluate(`(()=>{
      const root=document.querySelector('.cc-dashboard'),rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,left:r.left,right:r.right};};
      const actions=document.querySelector('.cc-db-actions'),attention=document.querySelector('.cc-db-attention'),cards=[...document.querySelectorAll('.cc-db-metric')];
      return {width:innerWidth,height:innerHeight,documentHeight:document.documentElement.scrollHeight,dashboard:rect(root),attention:rect(attention),quickActions:rect(actions),cards:cards.map(rect),values:[...document.querySelectorAll('.cc-db-value')].map(e=>e.textContent),management:!!document.querySelector('.cc-db-workspaces'),descriptions:document.querySelectorAll('.cc-db-action span').length,definitionInOverview:!!document.querySelector('section[aria-labelledby="db-overview"] .cc-db-definitions'),devicePixelRatio,scale:visualViewport.scale,overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...root.querySelectorAll('.cc-db-value,.cc-db-action,.cc-db-attention-link')].some(e=>e.scrollWidth>e.clientWidth+1||e.getBoundingClientRect().right>innerWidth+1),actions:[...actions.querySelectorAll('a')].map(e=>({href:e.getAttribute('href'),...rect(e)}))};
    })()`);
        assert.equal(metrics.width, width);
        assert.equal(metrics.height, height);
        assert.equal(metrics.devicePixelRatio, 1);
        assert.equal(metrics.scale, 1);
        assert.equal(metrics.overflow, false);
        assert.equal(metrics.clipped, false);
        assert.deepEqual(
          metrics.values,
          scenario === 'empty' ? ['0', '0', '0', '0'] : ['7', '2', '4', '2'],
        );
        assert.deepEqual(
          metrics.actions.map((row) => row.href),
          [
            '/marketplace/new',
            '/lost-found/new?type=lost',
            '/lost-found/new?type=found',
            '/teamup/new',
            '/services/new',
            '/messages',
          ],
        );
        if (!before) {
          assert.equal(metrics.management, false);
          assert.equal(metrics.descriptions, 0);
          assert.equal(metrics.definitionInOverview, true);
          for (const action of metrics.actions) assert.ok(action.height >= 44);
          if (width === 1440)
            assert.ok(
              Math.max(metrics.attention.bottom, metrics.quickActions.bottom) <= height,
              JSON.stringify(metrics),
            );
          assert.equal(
            await browser.evaluate(
              'document.querySelectorAll(".cc-db-caught-up a,.cc-db-caption").length',
            ),
            0,
          );
          if (scenario === 'empty')
            assert.ok(metrics.attention.height < 180, JSON.stringify(metrics.attention));
        }
        if (
          (width === 1440 ||
            (width === 1366 && theme === 'light') ||
            (width === 320 && theme === 'light')) &&
          scenario === 'populated'
        )
          await browser.screenshot(`dashboard-${width}-${height}-${theme}`);
        if (width === 1440 && scenario === 'empty')
          await browser.screenshot(`dashboard-empty-${theme}`);
        if (width === 390 && scenario === 'populated')
          await fullScreenshot(`dashboard-390-${theme}-full`);
        await browser.evaluate(
          'window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"})',
        );
        const clearance = await browser.evaluate(
          `(()=>{const focusable=[...document.querySelectorAll('.cc-dashboard a,.cc-dashboard button,.cc-dashboard summary')].filter(e=>e.getClientRects().length&&!e.disabled),last=focusable.at(-1),bar=document.querySelector('.cc-mobile-nav');return {last:last.getBoundingClientRect().bottom,nav:bar.getBoundingClientRect().top,visible:getComputedStyle(bar).display!=='none',label:last.textContent.trim()};})()`,
        );
        if (clearance.visible)
          assert.ok(clearance.last <= clearance.nav + 1, JSON.stringify(clearance));
        if (width === 390 && scenario === 'populated')
          await browser.screenshot(`bottom-clearance-${theme}`);
        results.push({
          requestedWidth: width,
          requestedHeight: height,
          theme,
          scenario,
          ...metrics,
          clearance,
        });
      }
  if (!before) {
    await load(1440, 900, 'light', 'populated');
    await browser.evaluate('document.querySelector(".cc-db-definitions summary").focus()');
    assert.equal(await browser.evaluate('document.activeElement.tagName'), 'SUMMARY');
    await browser.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
    });
    await browser.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
    });
    await browser.waitFor('document.querySelector(".cc-db-definitions").open');
    const definitions = await browser.evaluate(
      'document.querySelector(".cc-db-definitions").innerText',
    );
    assert.ok(definitions.includes('Completed projects are included'));
    assert.ok(definitions.includes('not requests you'));
    assert.ok(definitions.includes('Unread messages'));
    await browser.screenshot('count-definitions-open');
    await browser.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
    });
    await browser.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: ' ',
      code: 'Space',
      windowsVirtualKeyCode: 32,
    });
    await browser.waitFor('!document.querySelector(".cc-db-definitions").open');
    // Attempt native browser shortcut once; do not label a CSS/pinch simulation native zoom.
    const unzoomed = await browser.evaluate('innerWidth');
    await browser.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: '+',
      code: 'Equal',
      modifiers: 2,
      windowsVirtualKeyCode: 187,
    });
    await browser.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: '+',
      code: 'Equal',
      modifiers: 2,
      windowsVirtualKeyCode: 187,
    });
    const shortcutChangedWidth = (await browser.evaluate('innerWidth')) !== unzoomed;
    await load(720, 450, 'dark', 'populated');
    assert.equal(
      await browser.evaluate(
        'document.documentElement.scrollWidth>innerWidth||Array.from(document.querySelectorAll(".cc-db-action")).some(e=>e.scrollWidth>e.clientWidth+1)',
      ),
      false,
    );
    await browser.screenshot('200-percent-reflow-proxy-720-css-px');
    results.push({
      zoomEvidence: {
        native200PercentVerified: false,
        shortcutChangedWidth,
        reflow:
          'PASS: 720x450 CSS-pixel proxy for a 1440x900 viewport at 200%; no native browser zoom claim',
      },
    });
  }
  let comparison;
  if (baselinePath) {
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    assert.equal(baseline.datasetHash, datasetHash);
    comparison = results
      .filter((row) => row.requestedWidth)
      .map((row) => {
        const prior = baseline.results.find(
          (old) =>
            old.requestedWidth === row.requestedWidth &&
            old.requestedHeight === row.requestedHeight &&
            old.theme === row.theme &&
            old.scenario === row.scenario,
        );
        assert.ok(prior);
        assert.ok(row.dashboard.height < prior.dashboard.height);
        return {
          width: row.requestedWidth,
          height: row.requestedHeight,
          theme: row.theme,
          scenario: row.scenario,
          documentBefore: prior.documentHeight,
          documentAfter: row.documentHeight,
          dashboardBefore: prior.dashboard.height,
          dashboardAfter: row.dashboard.height,
          attentionBefore: prior.attention.height,
          attentionAfter: row.attention.height,
        };
      });
  }
  assert.deepEqual(browser.errors, []);
  await writeFile(
    join(output, 'compactness-results.json'),
    JSON.stringify(
      {
        phase: before ? 'before' : 'after',
        datasetHash,
        evidence:
          'Fresh isolated Chrome profile at default 100% zoom, DSF=1, visual scale=1; actual components with synthetic API/auth adapters',
        results,
        comparison,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: ${before ? 'before' : 'after'} measurements, 36 matched viewport/theme/state cases${before ? '' : ', disclosure keyboard, desktop viewport target and reflow proxy'}.`,
  );
} finally {
  await browser.close();
}
