/** Actual Profile components; synthetic records and API persistence only, no storage/provider access. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2],
  b = await openChromeFixture(output),
  results = [];
const click = async (text) =>
  b.evaluate(
    `(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.getClientRects().length);if(!e)throw Error('Missing button');e.click()})()`,
  );
const load = async (width, theme, scenario) => {
  await b.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: width < 768 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await b.send('Page.navigate', { url: b.origin + '/' + theme + '.html?case=' + scenario });
  await b.waitFor('Boolean(document.querySelector(".sp-identity"))');
  await b.evaluate('document.fonts.ready');
};
try {
  for (const width of [1440, 1366, 390, 360, 320])
    for (const theme of ['light', 'dark'])
      for (const scenario of ['populated', 'native-professional', 'long']) {
        await load(width, theme, scenario);
        const result = await b.evaluate(
          `({overflow:document.documentElement.scrollWidth>innerWidth,copy:document.querySelector('.sp-professional').innerText,calls:window.__qaCalls,href:document.querySelector('.sp-professional a')?.href})`,
        );
        assert.equal(result.overflow, false);
        assert.ok(result.copy.toLowerCase().includes('professional profile'));
        assert.ok(!/Imported from LinkedIn|Connect LinkedIn|OAuth/.test(result.copy));
        assert.ok(result.calls.every((c) => !c.path.includes('/linkedin')));
        assert.ok(result.href.startsWith('https://www.linkedin.com/in/'));
        await b.screenshot(`native-SYNTHETIC-${width}-${theme}-${scenario}`);
        results.push({ width, theme, scenario, overflow: false });
      }
  await load(390, 'dark', 'no-linkedin');
  assert.equal(await b.evaluate('Boolean(document.querySelector(".sp-professional a"))'), false);
  await b.screenshot('native-SYNTHETIC-missing-link');
  await click('Add LinkedIn Profile');
  await b.waitFor('Boolean(document.activeElement?.closest("#profile-edit-portfolio"))');
  await load(1440, 'light', 'populated');
  assert.equal(
    await b.evaluate(
      '[...document.querySelectorAll(".sp-professional button")].some(e=>e.textContent.toLowerCase().includes("edit professional"))',
    ),
    false,
  );
  await click('Edit profile');
  await click('Professional details');
  await b.waitFor('Boolean(document.querySelector(".sp-native-form"))');
  await b.evaluate(
    'document.getElementById("profile-edit-professional").scrollIntoView({block:"start"})',
  );
  assert.equal(
    await b.evaluate(
      'Boolean([...document.querySelectorAll(".sp-native-form button")].find(e=>e.textContent==="Manage profile photo"))',
    ),
    false,
  );
  assert.equal(
    await b.evaluate('document.querySelector(".sp-native-form > fieldset").disabled'),
    true,
  );
  await b.screenshot('native-SYNTHETIC-editor-storage-pending');
  await load(390, 'light', 'empty');
  await b.screenshot('native-SYNTHETIC-missing-photo-avatar-fallback');
  await load(1440, 'dark', 'native-professional');
  await click('Edit professional profile');
  await b.waitFor('Boolean(document.querySelector(".sp-native-form"))');
  await b.evaluate(
    `(()=>{const e=document.querySelector('.sp-native-form input[maxlength="180"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,'Updated synthetic headline');e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await click('Save professional profile');
  await b.waitFor(
    'document.querySelector(".sp-native-form").innerText.includes("Professional profile saved.")',
  );
  await b.screenshot('native-SYNTHETIC-editor-mock-save');
  await click('Back to profile');
  assert.ok(
    (await b.evaluate('document.querySelector(".sp-professional").innerText')).includes(
      'Updated synthetic headline',
    ),
  );
  await click('Edit professional profile');
  await b.evaluate('window.__qaFail=true');
  await click('Save professional profile');
  await b.waitFor(
    'document.querySelector(".sp-native-form").innerText.includes("draft is retained")',
  );
  assert.equal(
    await b.evaluate('document.querySelector(".sp-native-form input[maxlength]").value'),
    'Updated synthetic headline',
  );
  assert.deepEqual(b.errors, []);
  await writeFile(
    join(output, 'native-professional-results.json'),
    JSON.stringify(
      {
        evidence: 'SYNTHETIC API ONLY; no migrated database, uploaded photo or LinkedIn access',
        results,
        editor: 'PASS pending/ready/mock-save/failure/draft-retention',
        externalLink: 'PASS',
        photoUpload: 'SEPARATELY GATED; photo editor verified by dedicated photo QA',
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS native Profile: 30 synthetic viewport/theme/state cases; external link, pending editor, mock save/error, draft retention, avatar fallback.',
  );
} finally {
  await b.close();
}
