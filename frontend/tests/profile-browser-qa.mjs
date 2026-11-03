/** Owner Profile + unchanged AppShell with synthetic API adapters. No production access. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2],
  browser = await openChromeFixture(output),
  results = [];
const load = async (
  width = 1440,
  theme = 'light',
  scenario = 'populated',
  height = width < 768 ? 844 : 900,
) => {
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await browser.send('Page.navigate', {
    url: browser.origin + '/' + theme + '.html?case=' + scenario,
  });
  await browser.waitFor('Boolean(document.querySelector(".cc-student-profile"))');
  await browser.waitFor(
    scenario === 'loading'
      ? 'Boolean(document.querySelector(".sp-loading"))'
      : scenario === 'error'
        ? 'Boolean(document.querySelector(".sp-unavailable"))'
        : 'Boolean(document.querySelector(".sp-identity"))',
  );
  await browser.evaluate('document.fonts.ready');
  await browser.settle();
};
const click = (selector) =>
  browser.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const fill = (selector, value) =>
  browser.evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
const full = async (name) => {
  const { cssContentSize } = await browser.send('Page.getLayoutMetrics');
  const { data } = await browser.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 },
  });
  await writeFile(join(output, name + '.png'), Buffer.from(data, 'base64'));
};
try {
  for (const width of [1920, 1440, 1366, 1280, 1024, 768, 430, 390, 360, 320])
    for (const theme of ['light', 'dark']) {
      await load(width, theme, 'populated', width === 1366 ? 768 : width < 768 ? 844 : 900);
      const measured = await browser.evaluate(
        `(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width}};return {overflow:document.documentElement.scrollWidth>innerWidth,main:rect(document.querySelector('.sp-main')),professional:rect(document.querySelector('.sp-professional')),identity:rect(document.querySelector('.sp-identity')),about:rect(document.querySelector('.sp-content')),completion:rect(document.querySelector('.sp-completion-wrap')),skills:document.querySelectorAll('#sp-skills+ul li').length,inputs:[...document.querySelectorAll('.cc-student-profile input,.cc-student-profile select,.cc-student-profile textarea')].filter(e=>e.getClientRects().length).length,calls:window.__qaCalls,sticky:getComputedStyle(document.querySelector('.sp-sidebar')).position,clip:[...document.querySelectorAll('.sp-skill,.sp-links a,.sp-identity h1,.sp-linkedin-link')].some(e=>e.scrollWidth>e.clientWidth+1),bottom:[...document.querySelectorAll('.cc-mobile-nav a')].map(e=>e.getAttribute('href'))};})()`,
      );
      assert.equal(measured.overflow, false);
      assert.equal(measured.clip, false);
      assert.equal(measured.inputs, 0);
      assert.equal(
        await browser.evaluate('document.querySelectorAll(".sp-content .sp-skill").length'),
        17,
      );
      assert.equal(measured.calls.length, 3);
      assert.deepEqual(measured.bottom, [
        '/home',
        '/marketplace',
        '/search',
        '/assistant',
        '/messages',
        '/profile',
      ]);
      if (width >= 1100) {
        assert.ok(measured.professional.left > measured.main.right);
        assert.ok(Math.abs(measured.professional.top - measured.main.top) < 2);
        assert.ok(measured.identity.width > measured.main.width + measured.professional.width);
        const ratio = measured.main.width / measured.professional.width;
        assert.ok(ratio > 1.7 && ratio < 2.0);
      } else {
        assert.ok(measured.professional.top >= measured.identity.bottom);
        assert.ok(measured.about.top >= measured.professional.bottom);
        assert.ok(measured.completion.top >= measured.about.bottom);
        assert.equal(measured.sticky, 'static');
      }
      if ([1440, 1366, 1280, 1024, 430, 390, 360, 320].includes(width))
        await browser.screenshot(`profile-${width}-${theme}`);
      if (width === 390) await full(`profile-390-${theme}-full`);
      if (width === 1440) await full(`profile-1440-${theme}-full`);
      await browser.evaluate(
        'window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"})',
      );
      await browser.settle();
      const clearance = await browser.evaluate(
        `(()=>{const e=document.querySelector('.sp-completion-edit'),bar=document.querySelector('.cc-mobile-nav');return {last:e.getBoundingClientRect().bottom,bar:bar.getBoundingClientRect().top,visible:getComputedStyle(bar).display!=='none'};})()`,
      );
      if (clearance.visible) assert.ok(clearance.last <= clearance.bar + 1);
      if (width === 390) await browser.screenshot(`profile-bottom-${theme}`);
      results.push({ width, theme, ...measured, clearance });
    }
  await load();
  const stickyMode = await browser.evaluate(
    'getComputedStyle(document.querySelector(".sp-sidebar")).position',
  );
  await browser.evaluate('window.scrollTo({top:350,behavior:"instant"})');
  await browser.settle();
  const top = await browser.evaluate(
    'document.querySelector(".sp-sidebar").getBoundingClientRect().top',
  );
  if (stickyMode === 'sticky') assert.ok(Math.abs(top - 91) < 3);
  else assert.equal(await browser.evaluate('getComputedStyle(document.body).overflowY'), 'auto');
  results.push({
    stickyMode,
    sidebarTopAfterWindowScroll: top,
    limitation:
      stickyMode === 'static'
        ? 'Native CSS remains static; Profile-local bounded affix is verified separately. Global shell unchanged.'
        : null,
  });
  await browser.screenshot('profile-scrolled-desktop');
  await load(1440, 'dark');
  await browser.evaluate('document.querySelector(".sp-completion summary").focus()');
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
  await browser.waitFor('document.querySelector(".sp-completion details").open');
  assert.equal(await browser.evaluate('document.querySelectorAll(".sp-completion li").length'), 10);
  assert.ok(
    (await browser.evaluate('document.querySelector(".sp-completion").innerText')).includes(
      'Email verified',
    ),
  );
  await browser.screenshot('profile-completion-expanded');
  await load(1440, 'light', 'long');
  await full('profile-long-desktop');
  await load(320, 'dark', 'long');
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth>innerWidth'), false);
  await full('profile-long-320-dark');
  await load(1440, 'light', 'no-linkedin');
  await browser.screenshot('profile-no-linkedin');
  await click('.sp-linkedin-link');
  await browser.waitFor('document.activeElement?.id==="profile-edit-portfolio"');
  assert.equal(
    await browser.evaluate('Boolean(document.querySelector(".sp-editor:not([hidden])"))'),
    true,
  );
  await load(390, 'dark', 'empty');
  await full('profile-empty-mobile');
  await click('.sp-identity-actions button');
  await browser.waitFor('Boolean(document.querySelector(".sp-editor:not([hidden])"))');
  for (const heading of [
    'Identity & biography',
    'Skills',
    'Analyze resume',
    'Interests',
    'Achievements',
    'Portfolio links',
  ])
    assert.ok(
      (await browser.evaluate('document.querySelector(".sp-editor").innerText')).includes(heading),
    );
  await browser.screenshot('profile-editor-mobile');
  await load();
  await click('.sp-identity-actions button');
  await browser.waitFor('document.activeElement?.id==="profile-edit-heading"');
  await browser.screenshot('profile-editor-desktop');
  await fill('.sp-editor input[minlength="2"][maxlength="120"]', 'Draft student name');
  await click('.sp-editor-header button');
  await click('.sp-identity-actions button');
  assert.equal(
    await browser.evaluate(`document.querySelector('.sp-editor input[maxlength="120"]').value`),
    'Draft student name',
  );
  await click('.sp-editor form button[type=submit]');
  await browser.waitFor('Boolean(document.querySelector(".sp-notice"))');
  await click('.sp-editor-header button');
  assert.equal(
    await browser.evaluate('document.querySelector(".sp-identity h1").textContent'),
    'Draft student name',
  );
  await click('.sp-identity-actions button');
  // Exercise existing rendered managers and their real service functions through isolated adapters.
  await fill('#profile-edit-skills input', 'Synthetic skill');
  await click('#profile-edit-skills button[type=submit]');
  await browser.waitFor(
    'document.querySelectorAll("#profile-edit-skills select[aria-label]").length===18',
  );
  await browser.evaluate(
    `(()=>{const e=[...document.querySelectorAll('#profile-edit-skills select[aria-label]')].at(-1);e.value='3';e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await browser.waitFor(
    'window.__qaCalls.some(c=>c.method==="PATCH"&&c.path.includes("/skills/"))',
  );
  await browser.evaluate(
    `document.querySelectorAll('#profile-edit-skills button[type=button]')[17].click()`,
  );
  await browser.waitFor(
    'document.querySelectorAll("#profile-edit-skills select[aria-label]").length===17',
  );
  const sectionExpr = (title) =>
    `[...document.querySelectorAll('.sp-editor section')].find(e=>e.querySelector('h2')?.textContent===${JSON.stringify(title)})`;
  const field = async (title, selector, value) =>
    browser.evaluate(
      `(()=>{const e=${sectionExpr(title)}.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  const submitSection = (title) =>
    browser.evaluate(`${sectionExpr(title)}.querySelector('button[type=submit]').click()`);
  const waitText = (title, text, present = true) =>
    browser.waitFor(
      `${sectionExpr(title)}.innerText.includes(${JSON.stringify(text)})===${present}`,
    );
  await field('Interests', 'input', 'Synthetic interest');
  await submitSection('Interests');
  await waitText('Interests', 'Synthetic interest');
  await browser.evaluate(
    `${sectionExpr('Interests')}.querySelector('[aria-label="Remove Synthetic interest"]').click()`,
  );
  await waitText('Interests', 'Synthetic interest', false);
  await field('Achievements', 'input[placeholder]', 'Synthetic milestone');
  await field('Achievements', 'textarea', 'Synthetic achievement description');
  await submitSection('Achievements');
  await waitText('Achievements', 'Synthetic milestone');
  const achievement = () => `${sectionExpr('Achievements')}.querySelector('article:last-of-type')`;
  await browser.evaluate(`${achievement()}.querySelector('button').click()`);
  await field('Achievements', 'input[placeholder]', 'Updated synthetic milestone');
  await submitSection('Achievements');
  await waitText('Achievements', 'Updated synthetic milestone');
  await browser.evaluate(`${achievement()}.querySelectorAll('button')[1].click()`);
  await waitText('Achievements', 'Updated synthetic milestone', false);
  await field('Portfolio links', 'input[placeholder^="LinkedIn"]', 'Synthetic portfolio');
  await field('Portfolio links', 'input[type=url]', 'https://example.test/synthetic');
  await submitSection('Portfolio links');
  await waitText('Portfolio links', 'Synthetic portfolio');
  const linkRow = () =>
    `[...${sectionExpr('Portfolio links')}.querySelectorAll('a')].find(e=>e.textContent.includes('Synthetic portfolio')).parentElement`;
  await browser.evaluate(`${linkRow()}.querySelector('button').click()`);
  await field('Portfolio links', 'input[type=url]', 'https://example.test/updated');
  await submitSection('Portfolio links');
  await waitText('Portfolio links', 'https://example.test/updated');
  await browser.evaluate(`${linkRow()}.querySelectorAll('button')[1].click()`);
  await waitText('Portfolio links', 'Synthetic portfolio', false);
  // The real resume UI, isolated synthetic response; never calls an AI provider.
  const callsBefore = await browser.evaluate('window.__qaCalls.length');
  await browser.evaluate(
    `(()=>{const e=${sectionExpr('Analyze resume')}.querySelector('input[type=file]'),d=new DataTransfer();d.items.add(new File(['%PDF-synthetic'],'synthetic.pdf',{type:'application/pdf'}));e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  assert.equal(await browser.evaluate('window.__qaCalls.length'), callsBefore);
  await browser.evaluate(
    `[...${sectionExpr('Analyze resume')}.querySelectorAll('button')].find(e=>e.textContent==='Analyze resume').click()`,
  );
  await waitText('Analyze resume', 'Review suggested skills');
  assert.equal(
    await browser.evaluate(
      'document.querySelectorAll("#profile-edit-skills select[aria-label]").length',
    ),
    17,
  );
  await browser.evaluate(
    `[...${sectionExpr('Analyze resume')}.querySelectorAll('button')].find(e=>e.textContent==='Add selected skills').click()`,
  );
  await browser.waitFor(
    'document.querySelectorAll("#profile-edit-skills select[aria-label]").length===18',
  );
  await browser.evaluate('window.__qaFail=true');
  await click('.sp-editor form button[type=submit]');
  await browser.waitFor('Boolean(document.querySelector(".sp-error"))');
  assert.ok(
    (await browser.evaluate('document.querySelector(".sp-error").innerText')).includes('Synthetic'),
  );
  await browser.evaluate('window.__qaFail=false');
  await click('.sp-editor-header button');
  await browser.evaluate('window.__qaFail=true');
  await click('.sp-refresh');
  await browser.waitFor('Boolean(document.querySelector(".sp-error"))');
  await browser.screenshot('profile-failed-refresh');
  await browser.evaluate('window.__qaFail=false');
  await click('.sp-refresh');
  await browser.waitFor(
    'Boolean(document.querySelector(".sp-identity")) && !document.querySelector(".sp-error")',
  );
  for (const scenario of ['loading', 'error']) {
    await load(390, 'light', scenario);
    await browser.screenshot('profile-state-' + scenario);
  }
  await load(720, 'light', 'long', 450);
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth>innerWidth'), false);
  await browser.screenshot('profile-200-percent-reflow-proxy');
  await load(1440, 'light', 'populated', 600);
  assert.equal(
    await browser.evaluate('getComputedStyle(document.querySelector(".sp-sidebar")).position'),
    'static',
  );
  await browser.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.ok(
    parseFloat(
      await browser.evaluate(
        'getComputedStyle(document.querySelector(".sp-identity-actions button")).transitionDuration',
      ),
    ) <= 0.00001,
  );
  assert.deepEqual(browser.errors, []);
  await writeFile(
    join(output, 'profile-results.json'),
    JSON.stringify(
      {
        evidence:
          'Actual Profile/AppShell; synthetic DTOs and isolated service adapters only. Native 200% zoom unverified; 720px reflow proxy passed.',
        results,
        interactions:
          'PASS: edit entry/focus, retained drafts, base save, skill/interest/achievement/portfolio mutations and explicit resume approval, mutation error, refresh failure/retry, completion, sticky/short viewport, all states, reduced motion',
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: Profile 20 viewport/theme cases, sticky/short viewport, read-only rendering, editor/drafts/mutations, states, clearance and reflow proxy.',
  );
} finally {
  await browser.close();
}
