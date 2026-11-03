/** Real AppShell and Services components; synthetic identity/API adapters, no live auth. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';

const output = process.argv[2];
const browser = await openChromeFixture(output);
const records = [];
try {
  for (const screen of ['create', 'edit', 'workspace']) {
    for (const width of [1920, 1440, 1280, 1024, 768, 430, 390, 360, 320]) {
      for (const theme of ['light', 'dark']) {
        await browser.send('Emulation.setDeviceMetricsOverride', {
          width,
          height: width < 700 ? 844 : 900,
          deviceScaleFactor: 1,
          mobile: width < 700,
        });
        await browser.send('Page.navigate', {
          url:
            browser.origin + '/' + theme + '.html?' + new URLSearchParams({ screen, case: 'long' }),
        });
        await browser.waitFor('Boolean(document.querySelector(".cc-mobile-nav"))');
        await browser.waitFor(
          screen === 'workspace'
            ? 'Boolean(document.querySelector(".svm-tabs"))'
            : 'Boolean(document.querySelector("form textarea"))',
        );
        await browser.settle();
        const metrics = await browser.evaluate(`(() => {
          const bar=document.querySelector('.cc-mobile-nav');
          return {width:innerWidth,scroll:document.documentElement.scrollWidth,theme:document.documentElement.dataset.theme,links:[...bar.querySelectorAll('a')].map(a=>a.getAttribute('href')),visible:getComputedStyle(bar).display!=='none'};
        })()`);
        assert.ok(
          metrics.scroll <= metrics.width + 1,
          JSON.stringify({ screen, theme, ...metrics }),
        );
        assert.equal(metrics.theme, theme);
        assert.deepEqual(metrics.links, [
          '/home',
          '/marketplace',
          '/search',
          '/assistant',
          '/messages',
          '/profile',
        ]);
        if (metrics.visible) {
          const clearance = await browser.evaluate(`(() => {
            window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"});
            const targets=[...document.querySelectorAll('main button,main a,main input,main textarea')].filter(e=>e.getClientRects().length&&!e.disabled);
            const last=targets.at(-1);last?.focus({preventScroll:true});
            return {last:last?.getBoundingClientRect().bottom,bar:document.querySelector('.cc-mobile-nav').getBoundingClientRect().top};
          })()`);
          assert.ok(
            clearance.last <= clearance.bar + 1,
            JSON.stringify({ screen, width, theme, clearance }),
          );
        }
        if ([1440, 390, 320].includes(width)) {
          await browser.evaluate('window.scrollTo(0,0)');
          await browser.screenshot(`shell-${screen}-${width}-${theme}.png`);
        }
        records.push({ screen, width, theme, ...metrics });
      }
    }
  }
  assert.deepEqual(browser.errors, []);
  await writeFile(join(output, 'shell-results.json'), JSON.stringify(records, null, 2));
  console.log(
    'PASS: 54 actual AppShell/Services viewport-theme compositions; overflow, six destinations and last-control clearance. Synthetic adapters only, not authenticated integration.',
  );
} finally {
  await browser.close();
}
