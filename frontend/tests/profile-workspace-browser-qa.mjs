/* Actual Profile workspace; synthetic DTOs and in-memory API only. No providers/database. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2],
  b = await openChromeFixture(output),
  results = [];
const click = (text) =>
  b.evaluate(
    `(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.getClientRects().length);if(!e)throw Error('Missing '+${JSON.stringify(text)});e.click()})()`,
  );
const field = (selector, value) =>
  b.evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`,
  );
const select = async (key, label) => {
  await click(label);
  await b.settle();
  await b.waitFor(`document.querySelector('#profile-edit-${key}').getClientRects().length>0`);
  await b.waitFor(
    '(()=>{const n=document.querySelector(".sp-edit-mobile-nav");if(!n.getClientRects().length)return true;const r=n.querySelector("[aria-current]").getBoundingClientRect(),p=n.getBoundingClientRect();return r.left>=p.left-1&&r.right<=p.right+1})()',
  );
};
const load = async (width, theme, scenario = 'photo-disabled') => {
  await b.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: width === 440 ? 956 : width === 320 ? 640 : width < 768 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await b.send('Page.navigate', { url: b.origin + '/' + theme + '.html?case=' + scenario });
  await b.waitFor('Boolean(document.querySelector(".sp-identity"))');
  await click('Edit profile');
  await b.waitFor('document.querySelector(".sp-editor").getClientRects().length>0');
  await b.settle();
};
try {
  await b.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  for (const [width, theme] of [
    [1440, 'light'],
    [1440, 'dark'],
    [768, 'light'],
    [440, 'light'],
    [440, 'dark'],
    [390, 'light'],
    [390, 'dark'],
    [320, 'light'],
    [320, 'dark'],
  ]) {
    await load(width, theme);
    for (const [key, label] of [
      ['identity', 'Personal information'],
      ['skills', 'Skills & interests'],
      ['achievements', 'Achievements'],
      ['portfolio', 'Portfolio'],
      ['professional', 'Professional details'],
    ]) {
      await select(key, label);
      assert.equal(
        await b.evaluate('document.documentElement.scrollWidth>innerWidth'),
        false,
        key + ' overflow at ' + width,
      );
      assert.equal(
        await b.evaluate(
          '(()=>{const e=document.querySelector(".sp-edit-content");return e.scrollWidth>e.clientWidth+1})()',
        ),
        false,
        'Content overflow cannot be concealed by shell clipping',
      );
      await b.evaluate('window.scrollTo(0,0)');
      if (key === 'achievements')
        assert.equal(
          await b.evaluate(
            '(()=>{const buttons=[...document.querySelectorAll("#profile-edit-achievements article button")];return buttons.every(e=>{const r=e.getBoundingClientRect(),t=document.createRange();t.selectNodeContents(e);return r.width>=44&&t.getClientRects().length===1})})()',
          ),
          true,
          'Row actions remain readable',
        );
      await b.screenshot('workspace-SYNTHETIC-' + width + '-' + theme + '-' + key);
    }
    assert.equal(
      await b.evaluate('document.querySelector(".sp-native-form fieldset").disabled'),
      true,
    );
    await select('identity', 'Personal information');
    await click('Manage profile photo');
    await b.waitFor('Boolean(document.querySelector("dialog[open]"))');
    await b.waitFor('Boolean(document.querySelector("dialog .cc-photo-gate"))');
    assert.equal(
      await b.evaluate(
        '[...document.querySelectorAll("dialog button")].find(e=>e.textContent==="Save photo").disabled',
      ),
      true,
    );
    await b.screenshot('workspace-SYNTHETIC-' + width + '-' + theme + '-photo');
    await click('Close');
    results.push({
      width,
      theme,
      sections: 'PASS',
      overflow: false,
      professionalDisabled: 'PASS',
      photoIntegration: 'PASS',
    });
  }
  await load(1440, 'light');
  assert.equal(
    await b.evaluate('Boolean(document.querySelector(".sp-native-form"))'),
    false,
    'Professional editor is deferred until first visit',
  );
  assert.equal(
    await b.evaluate('Boolean(document.querySelector("#profile-edit-skills form"))'),
    false,
    'Skills editor is deferred',
  );
  const callsBefore = await b.evaluate('window.__qaCalls.length');
  await b.evaluate(
    `(()=>{for(const label of ['Skills & interests','Portfolio','Personal information'])[...document.querySelectorAll('.sp-edit-nav button')].find(e=>e.textContent===label).click()})()`,
  );
  await b.settle();
  assert.equal(
    await b.evaluate('document.querySelector(".sp-edit-nav [aria-current]").textContent'),
    'Personal information',
    'Last rapid selection wins',
  );

  for (let cycle = 0; cycle < 3; cycle++) {
    for (const [key, label] of [
      ['skills', 'Skills & interests'],
      ['portfolio', 'Portfolio'],
      ['professional', 'Professional details'],
      ['identity', 'Personal information'],
    ]) {
      await b.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
      await select(key, label);
      assert.equal(
        await b.evaluate(`Boolean(document.activeElement?.closest('#profile-edit-${key}'))`),
        true,
      );
      assert.equal(
        await b.evaluate(
          `(()=>{const r=document.querySelector('#profile-edit-${key} h2').getBoundingClientRect();return r.top>=70&&r.bottom<innerHeight})()`,
        ),
        true,
        'Heading visible on long-to-short switch',
      );
    }
  }
  assert.equal(
    await b.evaluate('window.__qaCalls.length'),
    callsBefore,
    'No API calls on section changes',
  );
  const skip = await b.evaluate(
    'document.querySelector(".cc-skip-link").getBoundingClientRect().bottom',
  );
  assert.ok(skip <= 0, 'Unfocused skip link is outside viewport');
  await b.screenshot('workspace-SYNTHETIC-skip-unfocused');
  await b.evaluate('document.querySelector(".cc-skip-link").focus()');
  await b.evaluate('new Promise(r=>setTimeout(r,180))');
  assert.equal(
    await b.evaluate('document.querySelector(".cc-skip-link").getBoundingClientRect().top>=0'),
    true,
  );
  await b.screenshot('workspace-SYNTHETIC-skip-focused');
  await b.evaluate('document.querySelector(".cc-skip-link").click()');
  assert.equal(await b.evaluate('location.hash'), '#main-content');
  assert.equal(
    await b.evaluate('Boolean(document.querySelector("#main-content .sp-editor"))'),
    true,
  );
  for (const width of [390, 320]) {
    await load(width, 'dark');
    for (const [key, label] of [
      ['identity', 'Personal information'],
      ['skills', 'Skills & interests'],
      ['achievements', 'Achievements'],
      ['portfolio', 'Portfolio'],
      ['professional', 'Professional details'],
    ]) {
      await select(key, label);
      await b.evaluate(
        `(()=>{const panel=document.querySelector('#profile-edit-${key}');const e=[...panel.querySelectorAll('button')].at(-1);e.scrollIntoView({block:'center',behavior:'instant'});if(!e.disabled)e.focus({preventScroll:true})})()`,
      );
      await b.settle();
      await b.screenshot('workspace-SYNTHETIC-' + width + '-bottom-' + key);
      const geometry = await b.evaluate(
        `(()=>{const r=[...document.querySelectorAll('#profile-edit-${key} button')].at(-1).getBoundingClientRect(),bar=document.querySelector('.cc-mobile-nav').getBoundingClientRect();return {top:r.top,bottom:r.bottom,bar:bar.top,scroll:scrollY}})()`,
      );
      assert.ok(
        geometry.top >= 0 && geometry.bottom <= geometry.bar,
        'Last action ' + key + ' at ' + width + ': ' + JSON.stringify(geometry),
      );
      await b.screenshot('workspace-SYNTHETIC-' + width + '-bottom-' + key);
    }
  }

  await load(1440, 'light');
  await select('achievements', 'Achievements');
  await b.evaluate(
    `[...document.querySelectorAll('#profile-edit-achievements button')].find(e=>e.textContent==='Edit').click()`,
  );
  await field('textarea[aria-label="Achievement description"]', 'Retained achievement edit');
  await select('portfolio', 'Portfolio');
  await b.evaluate(
    `[...document.querySelectorAll('#profile-edit-portfolio button')].find(e=>e.textContent==='Edit').click()`,
  );
  await field('input[aria-label="Link label"]', 'Retained portfolio edit');
  await select('achievements', 'Achievements');
  assert.equal(
    await b.evaluate(`document.querySelector('[aria-label="Achievement description"]').value`),
    'Retained achievement edit',
  );
  await select('portfolio', 'Portfolio');
  assert.equal(
    await b.evaluate(`document.querySelector('[aria-label="Link label"]').value`),
    'Retained portfolio edit',
  );
  await select('skills', 'Skills & interests');
  assert.equal(
    await b.evaluate('Boolean(document.querySelector(".sp-edit-resume input[type=file]"))'),
    false,
    'Resume editor deferred',
  );
  await b.evaluate('document.querySelector(".sp-edit-resume").open=true');
  await b.waitFor('Boolean(document.querySelector(".sp-edit-resume input[type=file]"))');
  await b.evaluate(
    `(()=>{const f=new File(['%PDF-1.7 synthetic fixture'],'synthetic-resume.pdf',{type:'application/pdf'});const data=new DataTransfer();data.items.add(f);const e=document.querySelector('.sp-edit-resume input[type=file]');e.files=data.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await b.settle();
  await b.evaluate(
    'window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"})',
  );
  await b.screenshot('workspace-SYNTHETIC-transition-long-before');
  await select('portfolio', 'Portfolio');
  await b.screenshot('workspace-SYNTHETIC-transition-short-after');
  await select('skills', 'Skills & interests');
  assert.equal(
    await b.evaluate('document.querySelector(".sp-edit-resume input[type=file]").files[0].name'),
    'synthetic-resume.pdf',
  );
  const beforeDelete = await b.evaluate('window.__qaCalls.length');
  await b.evaluate(
    `window.confirm=()=>false;document.querySelector('.sp-edit-skill-row button').click()`,
  );
  await b.settle();
  assert.equal(
    await b.evaluate('window.__qaCalls.length'),
    beforeDelete,
    'Cancelled skill removal has no API call',
  );
  await b.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await select('portfolio', 'Portfolio');
  assert.equal(
    await b.evaluate(
      'getComputedStyle(document.querySelector("#profile-edit-portfolio > section")).animationName',
    ),
    'none',
  );
  await b.send('Emulation.setEmulatedMedia', { features: [] });
  await b.send('Page.navigate', { url: b.origin + '/light.html?case=navigation-guard' });
  await b.waitFor('Boolean(window.__qaScopedNavigate)');
  await b.evaluate(
    'window.__qaPrompts=0;window.confirm=()=>{window.__qaPrompts++;return false};window.__qaScopedNavigate("/home")',
  );
  await b.settle();
  assert.equal(await b.evaluate('window.__qaPath'), '/profile');
  assert.equal(await b.evaluate('window.__qaPrompts'), 1);
  await b.evaluate('window.__qaScopedNavigate(-1)');
  assert.equal(await b.evaluate('window.__qaPrompts'), 2);
  await b.evaluate('window.confirm=()=>true;window.__qaScopedNavigate("/home")');
  await b.waitFor('window.__qaPath==="/home"');
  await load(1440, 'light');
  await field('#profile-edit-identity input[maxlength="120"]', 'Synthetic student updated');
  await field('#profile-edit-identity textarea', 'Unsaved personal biography');
  await b.settle();
  assert.equal(
    await b.evaluate(
      '(()=>{const e=new Event("beforeunload",{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented})()',
    ),
    true,
  );
  await select('skills', 'Skills & interests');
  await field('input[aria-label="Skill name"]', 'Unsaved skill draft');
  await select('identity', 'Personal information');
  assert.equal(
    await b.evaluate('document.querySelector("#profile-edit-identity input[maxlength]").value'),
    'Synthetic student updated',
  );
  await b.evaluate(
    `(()=>{const original=window.__qaApi;window.__qaApi=async(path,init={})=>{if(path==='/api/profile/me'&&init.method==='PATCH'&&!window.__qaPersonalReleased)await new Promise(r=>window.__qaReleasePersonal=()=>{window.__qaPersonalReleased=true;r()});return original(path,init)};})()`,
  );
  await click('Save profile');
  await b.waitFor('Boolean(window.__qaReleasePersonal)');
  assert.equal(
    await b.evaluate('document.querySelector("#profile-edit-identity input").matches(":disabled")'),
    true,
  );
  await select('portfolio', 'Portfolio');
  assert.equal(
    await b.evaluate(
      'Boolean(document.querySelector("#profile-edit-portfolio").getClientRects().length)',
    ),
    true,
    'Navigation remains responsive during save',
  );
  await b.evaluate('document.querySelector("#profile-edit-identity form").requestSubmit()');
  await b.evaluate('window.__qaReleasePersonal()');
  await b.waitFor('Boolean(document.querySelector(".sp-notice"))');
  assert.equal(
    await b.evaluate(
      'window.__qaCalls.filter(c=>c.path==="/api/profile/me"&&c.method==="PATCH").length',
    ),
    1,
  );

  await b.settle();
  await select('skills', 'Skills & interests');
  assert.equal(
    await b.evaluate(`document.querySelector('input[aria-label="Skill name"]').value`),
    'Unsaved skill draft',
  );
  await field('select[aria-label="New skill proficiency"]', '4');
  await b.evaluate('document.querySelector("#profile-edit-skills form").requestSubmit()');
  await b.waitFor(`document.querySelector('input[aria-label="Skill name"]').value===""`);
  assert.ok(
    (await b.evaluate('document.querySelector("#profile-edit-skills").innerText')).includes(
      'Unsaved skill draft',
    ),
  );
  await field('input[aria-label="Interest name"]', 'Synthetic research');
  await b.evaluate('document.querySelector("#profile-edit-interests form").requestSubmit()');
  await b.waitFor(`document.querySelector('input[aria-label="Interest name"]').value===""`);
  await select('achievements', 'Achievements');
  await field('input[aria-label="Achievement title"]', 'Synthetic achievement');
  await field(
    'textarea[aria-label="Achievement description"]',
    'A synthetic student-authored achievement.',
  );
  await field('input[aria-label="Awarded date"]', '2026-10-01');
  await click('Add achievement');
  await b.waitFor(`document.querySelector('input[aria-label="Achievement title"]').value===""`);
  assert.ok(
    (await b.evaluate('document.querySelector("#profile-edit-achievements").innerText')).includes(
      'Synthetic achievement',
    ),
  );
  await select('portfolio', 'Portfolio');
  await field('input[aria-label="Link label"]', 'LinkedIn');
  await field('input[aria-label="Link URL"]', 'https://www.linkedin.com/in/synthetic-qa/');
  await field('input[aria-label="Sort order"]', '2');
  await click('Add link');
  await b.waitFor(`document.querySelector('input[aria-label="Link label"]').value===""`);
  assert.equal(
    await b.evaluate(
      `Boolean(document.querySelector('#profile-edit-portfolio a[href="https://www.linkedin.com/in/synthetic-qa/"][target="_blank"]'))`,
    ),
    true,
  );
  await click('Back to profile');
  assert.ok(
    (await b.evaluate('document.querySelector(".sp-identity").innerText')).includes(
      'Synthetic student updated',
    ),
  );
  await click('Edit profile');
  await select('identity', 'Personal information');
  await field('#profile-edit-identity textarea', 'Keep this after network failure');
  await b.evaluate('window.__qaFail=true');
  await click('Save profile');
  await b.waitFor('Boolean(document.querySelector(".sp-error"))');
  assert.equal(
    await b.evaluate('document.querySelector("#profile-edit-identity textarea").value'),
    'Keep this after network failure',
  );
  await b.screenshot('workspace-SYNTHETIC-save-error-draft');
  await b.evaluate('window.__qaFail=false');
  await click('Save profile');
  await b.waitFor('!document.querySelector(".sp-error")');
  await b.settle();
  assert.equal(
    await b.evaluate(
      '(()=>{const e=new Event("beforeunload",{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented})()',
    ),
    false,
  );
  await load(390, 'dark');
  await b.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 500,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await b.evaluate(
    `document.querySelector('#profile-edit-identity input[maxlength="180"]').focus()`,
  );
  await b.settle();
  assert.equal(
    await b.evaluate(
      '(()=>{const r=document.activeElement.getBoundingClientRect();return r.top>=0&&r.bottom<=document.querySelector(".cc-mobile-nav").getBoundingClientRect().top})()',
    ),
    true,
    'Focused field above bottom bar in short viewport',
  );
  await b.screenshot('workspace-SYNTHETIC-short-viewport-focused-field');
  // Narrow equivalent 200% desktop reflow.
  await load(720, 'dark');
  await b.send('Emulation.setDeviceMetricsOverride', {
    width: 720,
    height: 450,
    deviceScaleFactor: 2,
    mobile: false,
  });
  assert.equal(await b.evaluate('document.documentElement.scrollWidth>innerWidth'), false);
  await b.screenshot('workspace-SYNTHETIC-200-percent-equivalent');
  await load(390, 'light', 'empty');
  await select('achievements', 'Achievements');
  await b.screenshot('workspace-SYNTHETIC-empty-achievements');
  await select('portfolio', 'Portfolio');
  await b.screenshot('workspace-SYNTHETIC-empty-portfolio');
  // Native same-document traversal uses the real BrowserRouter fixture, not the scoped go wrapper.
  await b.send('Page.navigate', {
    url: b.origin + '/light.html?case=photo-disabled&native-history=1',
  });
  await b.waitFor('Boolean(document.querySelector(".sp-identity"))');
  await click('Edit profile');
  await field('#profile-edit-identity input[maxlength="120"]', 'Saved synthetic history student');
  await click('Save profile');
  await b.waitFor('Boolean(document.querySelector(".sp-edit-feedback .sp-notice"))');
  let entries = await b.send('Page.getNavigationHistory');
  const homeEntry = entries.entries.findLast((e) => new URL(e.url).pathname === '/home');
  const profileEntry = entries.entries[entries.currentIndex];
  await b.send('Page.navigateToHistoryEntry', { entryId: homeEntry.id });
  await b.waitFor('window.__qaPath==="/home"');
  await b.send('Page.navigateToHistoryEntry', { entryId: profileEntry.id });
  await b.waitFor('Boolean(document.querySelector(".sp-identity"))');
  assert.ok(
    (await b.evaluate('document.querySelector(".sp-identity").innerText')).includes(
      'Saved synthetic history student',
    ),
  );
  await click('Edit profile');
  await field('#profile-edit-identity textarea', 'Unsaved native Back draft');
  await b.settle();
  await b.send('Page.navigateToHistoryEntry', { entryId: homeEntry.id });
  await b.waitFor('window.__qaPath==="/home"');
  await b.send('Page.navigateToHistoryEntry', { entryId: profileEntry.id });
  await b.waitFor('Boolean(document.querySelector(".sp-identity"))');
  await click('Edit profile');
  const nativeDraftRetained = await b.evaluate(
    'document.querySelector("#profile-edit-identity textarea").value==="Unsaved native Back draft"',
  );
  assert.equal(
    nativeDraftRetained,
    false,
    'Native Back bypasses scoped navigation guard; record this limitation honestly',
  );
  assert.deepEqual(b.errors, []);
  await writeFile(
    join(output, 'workspace-results.json'),
    JSON.stringify(
      {
        evidence:
          'SYNTHETIC ONLY; real components, mocked API. No actual persistence/storage activation.',
        results,
        draftRetention: 'PASS',
        confirmedMockSaves: 'PASS',
        failurePreservesDraft: 'PASS',
        unloadGuard: 'PASS',
        programmaticGuard: 'PASS (Profile-scoped router navigator)',
        repeatedLongShortNavigation: 'PASS with heading visible and no added API calls',
        existingRecordDraftsAndResumeSelection: 'PASS',
        focusedAndUnfocusedSkipLink: 'PASS',
        mobileFinalActions: 'PASS at 390 and 320',
        reducedMotion: 'PASS',
        nativeBrowserZoom: 'NOT TESTED; equivalent reflow passed',
        nativeBackForward: 'PASS canonical mock-saved profile reload',
        nativeDirtyTraversal:
          'KNOWN LIMITATION: browser Back bypasses scoped guard and in-memory draft is not retained',
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS workspace Chrome: 9 viewport/theme sets, five sections/photo, mock CRUD, retained drafts, failure, unload guard, empty states and equivalent reflow.',
  );
} finally {
  await b.close();
}
