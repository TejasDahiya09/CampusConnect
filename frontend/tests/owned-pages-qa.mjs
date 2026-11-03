import assert from 'node:assert/strict';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const browser = await openChromeFixture(process.argv[2]);
const { send, evaluate, waitFor, screenshot } = browser;
const load = async (page, width, theme, scenario = 'owner') => {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await send('Page.navigate', {
    url: browser.origin + '/' + theme + '.html?' + new URLSearchParams({ page, case: scenario }),
  });
};
const clickText = async (label) =>
  evaluate(
    `(() => {const button=[...document.querySelectorAll('button')].find(element=>element.textContent.trim()===${JSON.stringify(label)});if(!button)throw new Error('Missing '+${JSON.stringify(label)});button.click();})()`,
  );
try {
  for (const page of ['my-listings', 'my-reports']) {
    for (const width of [1440, 390, 320])
      for (const theme of ['light', 'dark']) {
        await load(page, width, theme);
        await waitFor("document.querySelectorAll('.cc-feature-card').length===12");
        assert.equal(
          await evaluate('document.documentElement.scrollWidth<=innerWidth'),
          true,
          `${page} ${width} no overflow`,
        );
        assert.equal(
          await evaluate('document.querySelector("h1").textContent'),
          page === 'my-listings' ? 'My listings' : 'My reports',
        );
        await screenshot(`${page}-${width}-${theme}`);
        await clickText('Next');
        await waitFor("document.body.innerText.includes('Page 2 of 2')");
        assert.equal(
          await evaluate(
            "[...document.querySelectorAll('button')].find(button=>button.textContent==='Next').disabled",
          ),
          true,
        );
        await clickText('Previous');
        await waitFor("document.body.innerText.includes('Page 1 of 2')");
      }
    for (const scenario of ['empty', 'error']) {
      await load(page, 390, 'light', scenario);
      await waitFor(
        scenario === 'empty'
          ? "document.body.innerText.includes('No ' + (location.search.includes('my-listings') ? 'listings' : 'reports') + ' yet')"
          : "!!document.querySelector('[role=alert]')",
      );
    }
  }
  await load('browse', 320, 'light');
  await waitFor('!!document.querySelector(\'a[href="/lost-found/my-reports"]\')');
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.cc-lf-header-actions a')].every(element=>{const r=element.getBoundingClientRect();return r.width>=44&&r.height>=44&&element.scrollWidth<=element.clientWidth;})",
    ),
    true,
    'All four mobile header actions fit',
  );
  await evaluate('document.querySelector(\'a[href="/lost-found/my-reports"]\').click()');
  await waitFor("document.querySelector('h1')?.textContent==='My reports'");
  assert.deepEqual(browser.errors, []);
  console.log(
    'Owner pages: 12 viewport/theme cases, pagination, empty/error states and My reports header navigation PASS.',
  );
} finally {
  await browser.close();
}
