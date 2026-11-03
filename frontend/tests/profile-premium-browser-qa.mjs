/** Actual Profile UI with synthetic data. No live users, database, photo storage or LinkedIn access. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2],
  b = await openChromeFixture(output),
  results = [];
const load = async (width, theme, scenario = 'populated', height = width < 768 ? 844 : 900) => {
  await b.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await b.send('Page.navigate', { url: b.origin + '/' + theme + '.html?case=' + scenario });
  await b.waitFor('Boolean(document.querySelector(".sp-identity"))');
  await b.evaluate('document.fonts.ready');
  await b.settle();
};
const click = async (label) =>
  b.evaluate(
    `(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)}&&e.getClientRects().length);if(!e)throw Error('Missing action');e.click();})()`,
  );
try {
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [390, 844],
    [360, 800],
    [320, 568],
  ])
    for (const theme of ['light', 'dark'])
      for (const scenario of ['populated', 'empty']) {
        await load(width, theme, scenario, height);
        const v = await b.evaluate(
          `(()=>{const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}};return {overflow:document.documentElement.scrollWidth>innerWidth,hero:rect(document.querySelector('.sp-identity')),professional:rect(document.querySelector('.sp-professional')),main:rect(document.querySelector('.sp-main')),completion:rect(document.querySelector('.sp-completion-wrap')),avatars:document.querySelectorAll('.sp-workspace [role=img]').length,skills:document.querySelectorAll('.sp-content .sp-skill').length,sideSkills:document.querySelectorAll('.sp-sidebar .sp-skill').length,fullEdits:document.querySelectorAll('.sp-identity-actions .cc-button--primary').length,calls:window.__qaCalls};})()`,
        );
        assert.equal(v.overflow, false);
        assert.equal(v.avatars, 1);
        assert.equal(v.sideSkills, 0);
        assert.equal(v.fullEdits, 1);
        assert.equal(v.skills, scenario === 'empty' ? 0 : 17);
        assert.equal(v.calls.length, 3);
        assert.ok(v.calls.every((c) => !c.path.includes('/linkedin')));
        const accessibility = await b.evaluate(`(()=>{
          const rgb=s=>s.match(/[0-9.]+/g).slice(0,3).map(Number);
          const lum=c=>c.map(v=>{const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
          const fg=lum(rgb(getComputedStyle(document.querySelector('.sp-identity h1')).color));
          const bg=lum(rgb(getComputedStyle(document.querySelector('.sp-identity')).backgroundColor));
          return {heroContrast:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05),controls:[...document.querySelectorAll('.sp-workspace a,.sp-workspace button')].filter(e=>e.getClientRects().length).map(e=>({label:e.textContent.trim(),height:e.getBoundingClientRect().height}))};
        })()`);
        assert.ok(accessibility.heroContrast >= 4.5);
        assert.ok(accessibility.controls.every((control) => control.height >= 44));
        if (width < 1100) {
          assert.ok(v.professional.top >= v.hero.bottom);
          assert.ok(v.main.top >= v.professional.bottom);
          if (scenario === 'empty') assert.equal(v.completion, null);
          else assert.ok(v.completion.top >= v.main.bottom);
        }
        assert.equal(
          await b.evaluate(
            'Boolean([...document.querySelectorAll(".sp-professional button")].find(e=>/edit professional/i.test(e.innerText)))',
          ),
          false,
        );
        assert.equal(
          await b.evaluate('document.querySelector(".sp-identity h1").textContent'),
          'Avery Morgan',
        );
        await b.screenshot(`premium-SYNTHETIC-${width}-${theme}-${scenario}`);
        results.push({ width, height, theme, scenario, ...v, accessibility });
      }
  await load(1440, 'light', 'gate-disabled-with-data');
  assert.equal(
    await b.evaluate(
      'document.querySelector(".sp-professional").innerText.includes("Must not display")',
    ),
    false,
  );
  await load(390, 'dark');
  const sections = [
    ['Edit introduction', 'identity'],
    ['Edit skills', 'skills'],
    ['Edit achievements', 'achievements'],
    ['Edit interests', 'interests'],
    ['Manage links', 'portfolio'],
  ];
  for (const [label, id] of sections) {
    await click(label);
    await b.waitFor(`document.activeElement?.id==='profile-edit-${id}'`);
    await click('Back to profile');
    await b.waitFor('document.activeElement?.id==="profile-overview-heading"');
  }
  await load(1440, 'light', 'empty');
  await click('Add achievement');
  await b.waitFor('document.activeElement?.id==="profile-edit-achievements"');
  await load(1440, 'dark');
  await click('Edit profile');
  await b.waitFor('Boolean(document.querySelector(".sp-editor:not([hidden])"))');
  await b.evaluate(
    'document.getElementById("profile-edit-professional").scrollIntoView({block:"start"})',
  );
  assert.equal(
    await b.evaluate('document.querySelector(".sp-native-form > fieldset").disabled'),
    true,
  );
  await b.screenshot('premium-SYNTHETIC-professional-storage-pending');
  await b.evaluate(
    'document.getElementById("profile-edit-portfolio").scrollIntoView({block:"start"})',
  );
  await b.screenshot('premium-SYNTHETIC-portfolio-editor');
  for (const width of [1440, 320]) {
    await load(width, 'dark', 'long');
    assert.equal(await b.evaluate('document.documentElement.scrollWidth>innerWidth'), false);
    await b.screenshot(`premium-SYNTHETIC-${width}-long`);
    await b.evaluate(
      'window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"})',
    );
    await b.settle();
    const clearance = await b.evaluate(
      `(()=>{const last=document.querySelector('.sp-completion-edit').getBoundingClientRect();const bar=document.querySelector('.cc-mobile-nav');return {bottom:last.bottom,limit:getComputedStyle(bar).display==='none'?innerHeight:bar.getBoundingClientRect().top};})()`,
    );
    assert.ok(clearance.bottom <= clearance.limit + 1);
  }
  await load(390, 'light', 'many-achievements');
  assert.equal(
    await b.evaluate('document.querySelectorAll(".sp-achievements article").length'),
    12,
  );
  await b.evaluate('document.querySelector(".sp-achievements").scrollIntoView({block:"start"})');
  await b.screenshot('premium-SYNTHETIC-many-achievements');
  await load(1440, 'light');
  const scroll = await b.evaluate(
    `(()=>{const e=document.querySelector('.sp-sidebar');return {before:e.getBoundingClientRect().top,bodyOverflow:getComputedStyle(document.body).overflowY,scrollingElement:document.scrollingElement.tagName,position:getComputedStyle(e).position,bodyClient:document.body.clientHeight,bodyScroll:document.body.scrollHeight};})()`,
  );
  await b.evaluate('window.scrollTo({top:300,behavior:"instant"})');
  await b.settle();
  const after = await b.evaluate(
    'document.querySelector(".sp-sidebar").getBoundingClientRect().top',
  );
  assert.equal(scroll.position, 'static');
  assert.equal(scroll.bodyOverflow, 'auto');
  const actualScroll = await b.evaluate('window.scrollY');
  const mode = await b.evaluate('document.querySelector(".sp-workspace").dataset.affixMode');
  if (mode === 'bounded')
    assert.ok(
      Math.abs(
        after -
          (await b.evaluate(
            'Math.max(0,document.querySelector(".cc-top-nav").getBoundingClientRect().bottom)+16',
          )),
      ) < 2,
    );
  else assert.ok(Math.abs(scroll.before - after - actualScroll) < 2);
  await b.screenshot('premium-SYNTHETIC-static-sidebar-scrolled');
  results.push({
    sticky: {
      ...scroll,
      after,
      result: 'Profile-local bounded affix; native CSS ancestor remains unchanged.',
    },
  });
  await b.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await load(720, 'light');
  assert.equal(await b.evaluate('document.documentElement.scrollWidth>innerWidth'), false);
  assert.equal(
    await b.evaluate(
      'getComputedStyle(document.querySelector(".sp-identity button")).transitionDuration',
    ),
    '0s',
  );
  results.push({
    reflow: '720 CSS pixels proxy; native 200% browser zoom not verified',
    reducedMotion: 'PASS',
  });
  assert.deepEqual(b.errors, []);
  await writeFile(
    join(output, 'premium-results.json'),
    JSON.stringify(
      {
        evidence: 'SYNTHETIC UI ONLY; no durable professional details or photo upload verified',
        results,
        sectionActions: 'PASS',
        gate: 'PASS',
        console: 'No captured errors',
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS premium Profile: 20 populated/empty geometry captures; identity uniqueness, all skills, targeted editors, gate, 12 achievements, static scrolling, reduced motion and reflow.',
  );
} finally {
  await b.close();
}
