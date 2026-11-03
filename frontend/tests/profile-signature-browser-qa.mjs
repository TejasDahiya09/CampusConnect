/** Signature Profile, genuine components and isolated synthetic DTOs only. No durable storage claims. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2],
  b = await openChromeFixture(output),
  results = [];
const load = async (width = 1440, theme = 'light', scenario = 'populated', height = 900) => {
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
const scroll = async (y) => {
  await b.evaluate(`window.scrollTo({top:${y},behavior:'instant'})`);
  await b.settle();
};
const geometry = () =>
  b.evaluate(
    `(()=>{const box=e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,width:r.width}};return {y:scrollY,viewport:innerHeight,pageHeight:document.documentElement.scrollHeight,mode:document.querySelector('.sp-workspace').dataset.affixMode,eligible:document.querySelector('.sp-workspace').dataset.affixEligible,rail:box(document.querySelector('.sp-sidebar')),completion:document.querySelector('.sp-completion-wrap')?box(document.querySelector('.sp-completion-wrap')):null,root:box(document.querySelector('.sp-workspace')),offset:Math.max(0,document.querySelector('.cc-top-nav').getBoundingClientRect().bottom)+16};})()`,
  );
try {
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1280, 800],
    [1024, 768],
    [430, 932],
    [390, 844],
    [360, 800],
    [320, 568],
  ])
    for (const theme of ['light', 'dark']) {
      await load(width, theme, 'populated', height);
      const measured = await b.evaluate(
        `(()=>{const rgb=s=>s.match(/[0-9.]+/g).slice(0,3).map(Number);const lum=c=>c.map(v=>{const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);const ratio=(a,z)=>(Math.max(a,z)+.05)/(Math.min(a,z)+.05);const cover=getComputedStyle(document.querySelector('.sp-identity-cover'));return {overflow:document.documentElement.scrollWidth>innerWidth,width:innerWidth,scale:visualViewport.scale,dpr:devicePixelRatio,coverContrast:ratio(lum(rgb(cover.color)),lum(rgb(cover.backgroundColor))),avatars:document.querySelectorAll('.sp-workspace [role=img]').length,skills:document.querySelectorAll('.sp-content .sp-skill').length,controls:[...document.querySelectorAll('.sp-workspace a,.sp-workspace button')].filter(e=>e.getClientRects().length).map(e=>({label:e.textContent.trim(),height:e.getBoundingClientRect().height})),calls:window.__qaCalls};})()`,
      );
      assert.equal(measured.overflow, false);
      assert.equal(measured.width, width);
      assert.equal(measured.scale, 1);
      assert.equal(measured.dpr, 1);
      assert.equal(measured.skills, 17);
      assert.equal(measured.avatars, 1);
      assert.ok(measured.coverContrast >= 4.5);
      assert.ok(measured.controls.every((c) => c.height >= 44));
      assert.equal(measured.calls.length, 3);
      await b.screenshot(`signature-SYNTHETIC-${width}-${theme}-populated`);
      results.push({ width, height, theme, ...measured, ...(await geometry()) });
    }
  for (const width of [1440, 390, 320])
    for (const theme of ['light', 'dark']) {
      await load(width, theme, 'minimal', width < 768 ? 844 : 900);
      assert.equal(
        await b.evaluate('document.querySelector(".sp-identity h1").textContent'),
        'Alex',
      );
      assert.ok(
        (await b.evaluate('document.querySelector(".sp-completion").innerText')).includes('20%'),
      );
      assert.equal(await b.evaluate('document.documentElement.scrollWidth>innerWidth'), false);
      await b.screenshot(`signature-SYNTHETIC-${width}-${theme}-minimal`);
    }
  // Native sticky attempt: strictly Profile-scoped temporary CSS, never a BODY/AppShell change.
  await load(1440, 'light', 'many-achievements');
  const ancestors = await b.evaluate(
    `(()=>{let n=document.querySelector('.sp-sidebar');const a=[];while(n){const s=getComputedStyle(n);a.push({tag:n.tagName,className:n.className,overflowX:s.overflowX,overflowY:s.overflowY,position:s.position,transform:s.transform});n=n.parentElement;}return a})()`,
  );
  await b.evaluate(
    `(()=>{const s=document.createElement('style');s.textContent='.cc-student-profile .sp-sidebar{position:sticky;top:90px;transform:none!important}.cc-student-profile .sp-completion-wrap{transform:none!important}.cc-student-profile .sp-workspace{overflow:visible}';document.head.append(s)})()`,
  );
  const native = [];
  for (const y of [0, 400, 600]) {
    await scroll(y);
    native.push(await geometry());
  }
  assert.ok(Math.abs(native[1].rail.top - native[2].rail.top - (native[2].y - native[1].y)) < 2);
  results.push({
    nativeStickyAttempt: {
      ancestors,
      positions: native,
      result: 'Profile-only native sticky attempt does not pin. No shared CSS was changed.',
    },
  });
  // Reload removes the diagnostic CSS and resets the affix hook.
  await load(1440, 'light', 'many-achievements');
  const affixed = [];
  for (const y of [0, 400, 600, 800]) {
    await scroll(y);
    affixed.push(await geometry());
  }
  for (const state of affixed.slice(1)) {
    assert.equal(state.mode, 'bounded');
    assert.ok(Math.abs(state.rail.top - state.offset) < 2);
    assert.ok(state.completion.bottom <= state.viewport - 8);
    assert.ok(state.completion.bottom <= state.root.bottom + 1);
    assert.equal(state.pageHeight, affixed[0].pageHeight);
  }
  await b.screenshot('signature-SYNTHETIC-middle-scroll-affixed');
  const beforeWheel = await geometry();
  await b.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: beforeWheel.rail.left + 50,
    y: beforeWheel.rail.top + 60,
    deltaX: 0,
    deltaY: 180,
  });
  await b.waitFor(`window.scrollY>${beforeWheel.y}+50`);
  assert.equal((await geometry()).mode, 'bounded');
  // Expanding criteria makes the pair too tall; focus must survive the return to flow.
  await b.evaluate('document.querySelector(".sp-completion summary").focus()');
  await b.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
  });
  await b.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
  });
  await b.waitFor('document.querySelector(".sp-completion details").open');
  await b.settle();
  const expanded = await geometry();
  assert.equal(expanded.eligible, 'false');
  assert.equal(expanded.mode, 'flow');
  const focus = await b.evaluate(
    `(()=>{const e=document.activeElement,r=e.getBoundingClientRect();return {isSummary:e.matches('.sp-completion summary'),top:r.top,bottom:r.bottom}})()`,
  );
  assert.equal(focus.isSummary, true);
  assert.ok(focus.top >= -1 && focus.bottom <= 900);
  results.push({
    boundedAffix: {
      positions: affixed,
      wheelScroll: 'PASS normal window scrolling',
      expanded,
      focus,
    },
  });
  await load(1440, 'dark', 'long', 600);
  assert.equal((await geometry()).eligible, 'false');
  await load(390, 'dark', 'many-achievements', 844);
  await scroll(500);
  assert.equal((await geometry()).mode, 'flow');
  await load(1440, 'dark', 'many-achievements');
  assert.equal(
    await b.evaluate('document.querySelectorAll(".sp-achievements article").length'),
    12,
  );
  await b.evaluate('document.querySelector(".sp-achievements").scrollIntoView({block:"start"})');
  await b.settle();
  await b.screenshot('signature-SYNTHETIC-substantial-achievements');
  await load(1440, 'light');
  await b.evaluate('document.querySelector(".sp-completion summary").focus()');
  await b.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
  });
  await b.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: ' ',
    code: 'Space',
    windowsVirtualKeyCode: 32,
  });
  await b.waitFor('document.querySelector(".sp-completion details").open');
  await b.evaluate('document.querySelector(".sp-criterion-action").click()');
  await b.waitFor('document.activeElement?.id==="profile-edit-identity"');
  await b.screenshot('signature-SYNTHETIC-edit-workspace');
  await load(390, 'light', 'no-linkedin', 844);
  await b.evaluate('document.querySelector(".sp-linkedin-link").click()');
  await b.waitFor('document.activeElement?.id==="profile-edit-portfolio"');
  await b.screenshot('signature-SYNTHETIC-link-editor');
  await load(1440, 'light');
  await b.evaluate('document.querySelector(".sp-identity-actions a").click()');
  await b.waitFor('window.__qaPath.startsWith("/profile/11111111-")');
  results.push({
    publicView:
      'Existing destination reached in isolated router; not live public-profile verification',
  });
  assert.deepEqual(b.errors, []);
  await writeFile(
    join(output, 'signature-results.json'),
    JSON.stringify(
      {
        evidence:
          'Synthetic components/API adapters only; no durable professional/photo/production verification',
        results,
        native200Zoom: 'UNVERIFIED; fresh-profile default 100% and reflow proxies tested',
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS signature Profile: 18 viewport/theme captures + six minimal; native sticky diagnosis, bounded affix at three middle positions, wheel/focus/tall/mobile guards, completion targets and public navigation.',
  );
} finally {
  await b.close();
}
