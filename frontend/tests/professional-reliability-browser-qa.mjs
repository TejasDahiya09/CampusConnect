/** Actual Profile/components, synthetic adapters only. No database, Supabase or provider calls. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2],
  b = await openChromeFixture(output),
  results = [];
const click = (text) =>
  b.evaluate(
    `(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.getClientRects().length);if(!e)throw Error('Missing button '+${JSON.stringify(text)});e.click()})()`,
  );
const load = async (scenario, theme = 'light', width = 1440) => {
  await b.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: width < 768 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await b.send('Page.navigate', { url: b.origin + '/' + theme + '.html?case=' + scenario });
  await b.waitFor('Boolean(document.querySelector(".sp-identity"))');
};
const input = (value) =>
  b.evaluate(
    `(()=>{const e=document.querySelector('.sp-native-form input[maxlength="180"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
try {
  for (const [scenario, message] of [
    ['professional-network', 'connection'],
    ['professional-auth', 'Sign in again'],
    ['professional-server', 'service is unavailable'],
  ])
    for (const [width, theme] of [
      [1440, 'light'],
      [390, 'dark'],
    ]) {
      await load(scenario, theme, width);
      await b.waitFor(
        `document.querySelector('.sp-professional').innerText.includes(${JSON.stringify(message)})`,
      );
      assert.ok(
        !(await b.evaluate('document.querySelector(".sp-professional").innerText')).includes(
          'pending setup',
        ),
      );
      assert.equal(await b.evaluate('document.documentElement.scrollWidth>innerWidth'), false);
      await b.screenshot('reliability-SYNTHETIC-' + scenario + '-' + width + '-' + theme);
      results.push({ scenario, result: 'PASS distinct error; not disabled or empty' });
    }
  await load('professional-loading');
  await b.waitFor(
    'document.querySelector(".sp-professional").innerText.includes("Loading professional details")',
  );
  await b.evaluate('window.__qaProfessionalRelease()');
  await b.waitFor('document.querySelector(".sp-professional").innerText.includes("pending setup")');
  await load('professional-empty');
  await b.waitFor(
    'document.querySelector(".sp-professional").innerText.includes("Edit professional profile")',
  );
  assert.ok(
    !(await b.evaluate('document.querySelector(".sp-professional").innerText')).includes(
      'pending setup',
    ),
  );
  await load('professional-retry');
  await b.waitFor(
    'document.querySelector(".sp-professional").innerText.includes("service is unavailable")',
  );
  await b.evaluate('window.__qaProfessionalStatus=0');
  await click('Retry professional details');
  await b.waitFor('document.querySelector(".sp-professional").innerText.includes("pending setup")');
  results.push({
    scenario: 'GET failure retry',
    result: 'PASS recovered without false empty saved data',
  });
  await load('native-professional');
  await click('Edit professional profile');
  await input('Unsaved synthetic draft');
  await b.evaluate(
    "window.__qaProfessional={available:true,version:'b'.repeat(64),details:{headline:'Newer server version',education:[],experience:[]}};window.__qaProfessionalStatus=503",
  );
  await click('Save professional profile');
  await b.waitFor(
    'document.querySelector(".sp-native-form").innerText.includes("draft is retained")',
  );
  assert.equal(
    await b.evaluate('document.querySelector(".sp-native-form input[maxlength]").value'),
    'Unsaved synthetic draft',
  );
  await b.evaluate('window.__qaProfessionalStatus=0');
  await click('Save professional profile');
  await b.waitFor(
    'document.querySelector(".sp-native-form").innerText.includes("changed elsewhere")',
  );
  await click('Reload latest professional details');
  await b.waitFor(
    '!document.querySelector(".sp-native-form button[type=submit]").disabled===false && document.querySelector(".sp-native-form").innerText.includes("Newer saved details")',
  );
  assert.equal(
    await b.evaluate('document.querySelector(".sp-native-form input[maxlength]").value'),
    'Unsaved synthetic draft',
  );
  await b.screenshot('reliability-SYNTHETIC-conflict-retained');
  await click('Use latest saved details (discard draft)');
  assert.equal(
    await b.evaluate('document.querySelector(".sp-native-form input[maxlength]").value'),
    'Newer server version',
  );
  await input('Reviewed synthetic update');
  await b.evaluate('window.__qaProfessionalDelay=200');
  await click('Save professional profile');
  assert.equal(
    await b.evaluate('document.querySelector(".sp-native-form button[type=submit]").disabled'),
    true,
  );
  await b.evaluate('document.querySelector(".sp-native-form button[type=submit]").click()');
  await b.waitFor(
    'document.querySelector(".sp-native-form").innerText.includes("Professional profile saved.")',
  );
  assert.equal(
    await b.evaluate(
      'window.__qaCalls.filter(c=>c.path.endsWith("professional")&&c.method==="PUT").length',
    ),
    3,
  );
  await click('Back to profile');
  assert.ok(
    (await b.evaluate('document.querySelector(".sp-professional").innerText')).includes(
      'Reviewed synthetic update',
    ),
  );
  results.push({
    scenario: 'save/failed/stale/reload/discard/reviewed-save/double-click',
    result: 'PASS',
  });
  await load('native-professional');
  await click('Edit professional profile');
  await input('Draft survives whole Profile refresh');
  await click('Back to profile');
  await b.evaluate(
    "window.__qaProfessional={available:true,version:'c'.repeat(64),details:{headline:'Refreshed persisted headline',education:[],experience:[]}}",
  );
  await click('Refresh profile');
  await b.waitFor(
    'document.querySelector(".sp-professional").innerText.includes("Refreshed persisted headline")',
  );
  await click('Edit professional profile');
  assert.equal(
    await b.evaluate('document.querySelector(".sp-native-form input[maxlength]").value'),
    'Draft survives whole Profile refresh',
  );
  assert.equal(
    await b.evaluate('document.querySelector(".sp-native-form button[type=submit]").disabled'),
    true,
  );
  await click('Use latest saved details (discard draft)');
  assert.equal(
    await b.evaluate('document.querySelector(".sp-native-form input[maxlength]").value'),
    'Refreshed persisted headline',
  );
  results.push({
    scenario: 'whole Profile background refresh',
    result: 'PASS retained dirty draft; newer server version blocked stale save',
  });
  await load('native-professional', 'dark', 390);
  await click('Edit professional profile');
  await input('Account A draft');
  await b.evaluate(
    "window.__qaUser='synthetic-profile-b';window.dispatchEvent(new Event('qa-account'))",
  );
  await b.waitFor('Boolean(document.querySelector(".sp-identity"))');
  assert.equal(await b.evaluate('Boolean(document.querySelector(".sp-native-form"))'), false);
  assert.equal(await b.evaluate('document.documentElement.scrollWidth>innerWidth'), false);
  results.push({ scenario: 'account reset/mobile', result: 'PASS' });
  assert.deepEqual(b.errors, []);
  await writeFile(
    join(output, 'professional-reliability-results.json'),
    JSON.stringify(
      { evidence: 'SYNTHETIC only; no persistence database executed', results },
      null,
      2,
    ),
  );
  console.log(
    'PASS professional loading/error distinctions, retained drafts, conditional conflicts, explicit reload/discard, guarded save, account reset.',
  );
} finally {
  await b.close();
}
