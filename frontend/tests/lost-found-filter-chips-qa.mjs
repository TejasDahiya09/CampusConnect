import assert from 'node:assert/strict';
import { openChromeFixture } from './chrome-fixture-driver.mjs';

const browser = await openChromeFixture(process.argv[2]);
const { send, evaluate, waitFor, screenshot } = browser;
try {
  for (const width of [1440, 390, 320]) {
    for (const theme of ['light', 'dark']) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: width < 700,
      });
      const query = new URLSearchParams({ type: 'LOST', category: 'Electronics' }).toString();
      await send('Page.navigate', {
        url:
          browser.origin + '/' + theme + '.html?' + new URLSearchParams({ page: 'browse', query }),
      });
      await waitFor(
        "document.querySelectorAll('.cc-lf-active-filters .cc-filter-chip').length===2&&!document.querySelector('.cc-lf-results[aria-busy=true]')",
      );
      const metrics = await evaluate(
        `(() => {const rect=element=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return [...document.querySelectorAll('.cc-lf-active-filters .cc-filter-chip')].map(chip=>({chip:rect(chip),label:rect(chip.querySelector('span')),icon:rect(chip.querySelector('svg'))}));})()`,
      );
      for (const { chip, label, icon } of metrics) {
        assert.equal(chip.height, 44, 'Compact horizontal chip');
        assert.ok(label.height < 25, 'Normal labels stay on one line');
        assert.equal(icon.width, 14);
        assert.equal(icon.height, 14);
        assert.ok(
          icon.x >= label.right && icon.right <= chip.right,
          'Remove icon sits beside label',
        );
      }
      await evaluate(
        "document.querySelector('.cc-lf-active-filters').scrollIntoView({block:'center',behavior:'instant'})",
      );
      await screenshot(`filter-chips-${width}-${theme}`);
      await evaluate('document.querySelector(\'[aria-label="Remove Lost filter"]\').click()');
      await waitFor(
        "!window.__qaLocation.includes('type=LOST')&&window.__qaLocation.includes('category=Electronics')",
      );
      await evaluate("document.querySelector('.cc-lf-active-filters .cc-button').click()");
      await waitFor(
        "window.__qaLocation==='/lost-found'&&!document.querySelector('.cc-lf-active-filters')",
      );
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    }
  }
  // Long supplied filter text wraps within a chip without stretching its remove icon.
  await send('Page.navigate', {
    url:
      browser.origin +
      '/light.html?' +
      new URLSearchParams({
        page: 'browse',
        query: new URLSearchParams({ location: 'A long campus location '.repeat(6) }).toString(),
      }),
  });
  await waitFor("!!document.querySelector('.cc-lf-active-filters .cc-filter-chip')");
  assert.equal(
    await evaluate(
      "document.querySelector('.cc-lf-active-filters .cc-filter-chip').scrollWidth<=document.querySelector('.cc-lf-active-filters .cc-filter-chip').clientWidth",
    ),
    true,
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.cc-lf-active-filters svg').getBoundingClientRect().width",
    ),
    14,
  );
  assert.deepEqual(browser.errors, []);
  console.log(
    'Filter chips: 6 viewport/theme cases, individual removal, Clear all and long-label wrapping PASS.',
  );
} finally {
  await browser.close();
}
