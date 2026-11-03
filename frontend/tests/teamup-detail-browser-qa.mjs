import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2],
  b = await openChromeFixture(output);
const { send, evaluate, screenshot, settle, delay } = b;
const wait = (expression) => b.waitFor(`Boolean(${expression})`);
const results = [];
async function load(width = 1440, theme = 'light', scenario = 'eligible') {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: width < 768 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await send('Page.navigate', { url: b.origin + '/' + theme + '.html?case=' + scenario });
  await wait(
    scenario === 'loading'
      ? "document.querySelector('.tu-detail-loading')"
      : scenario === 'error'
        ? "document.querySelector('.tu-detail-unavailable')"
        : "document.querySelector('.tu-detail-workspace')",
  );
  await evaluate('document.fonts.ready');
  await settle();
}
async function click(text) {
  await evaluate(
    `(()=>{const button=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!button)throw new Error('Missing button '+${JSON.stringify(text)});button.focus();button.click();})()`,
  );
  await settle();
}
const has = (text) =>
  evaluate(`document.querySelector('.tu-detail').innerText.includes(${JSON.stringify(text)})`);
try {
  for (const width of [1920, 1440, 1366, 1280, 1024, 768, 430, 390, 360, 320])
    for (const theme of ['light', 'dark']) {
      await load(width, theme);
      const metrics = await evaluate(
        `(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,bottom:r.bottom}};return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,main:rect(innerWidth>=768?'.tu-detail-main':'.tu-detail-overview-group'),identity:rect('.tu-detail-identity'),participation:rect('.tu-detail-participation'),skills:rect('.tu-detail-skills'),team:rect('.tu-detail-team'),facts:rect('.tu-detail-facts'),owner:rect('.tu-detail-owner')}})()`,
      );
      assert.equal(metrics.overflow, false);
      if (width >= 768) {
        assert.ok(Math.abs(metrics.main.y - metrics.participation.y) < 1);
        assert.ok(metrics.participation.x > metrics.identity.x);
      } else {
        assert.ok(
          metrics.identity.y < metrics.skills.y &&
            metrics.skills.y < metrics.participation.y &&
            metrics.participation.y < metrics.team.y &&
            metrics.team.y < metrics.facts.y,
        );
      }
      assert.equal(
        await evaluate('window.__qaCalls.length'),
        1,
        'One detail read for visitor; no decorative requests',
      );
      assert.equal(await evaluate("document.querySelectorAll('textarea').length"), 1);
      const refinement = await evaluate(`(() => {
        const field=document.querySelector('#tu-application-note'),lead=document.querySelector('.tu-detail-owner'),buttons=[...document.querySelectorAll('.tu-detail-action-row > button')],facts=[...document.querySelectorAll('.tu-detail-facts dl > div')];
        const box=element=>element.getBoundingClientRect();
        return {textareaHeight:box(field).height,leadHeight:box(lead).height,leadAvatars:lead.querySelectorAll('[role=img]').length,optional:!field.required,limit:field.maxLength,buttonGeometry:buttons.map(e=>({x:box(e).x,y:box(e).y,width:box(e).width,height:box(e).height})),memberRows:[...document.querySelectorAll('.tu-detail-roster li')].map(e=>box(e).height),factTops:facts.map(e=>box(e).top),factWidths:facts.map(e=>box(e).width),skillTeamGap:box(document.querySelector('.tu-detail-team')).top-box(document.querySelector('.tu-detail-skills')).bottom};
      })()`);
      assert.ok(refinement.textareaHeight >= 80 && refinement.textareaHeight <= 96);
      assert.equal(refinement.optional, true);
      assert.equal(refinement.limit, 1000);
      assert.equal(refinement.buttonGeometry.length, 2);
      assert.equal(refinement.buttonGeometry[0].height, 44);
      assert.equal(refinement.buttonGeometry[0].y, refinement.buttonGeometry[1].y);
      assert.ok(
        refinement.buttonGeometry[1].x -
          (refinement.buttonGeometry[0].x + refinement.buttonGeometry[0].width) <=
          9,
      );
      assert.ok(refinement.memberRows.every((height) => height < 80));
      if (width >= 360) assert.equal(refinement.factTops[0], refinement.factTops[1]);
      else assert.ok(refinement.factTops[1] > refinement.factTops[0]);
      assert.ok(Math.abs(refinement.factWidths[0] - refinement.factWidths[1]) < 1);
      if (width >= 768) assert.ok(refinement.skillTeamGap <= 21);
      else assert.ok(metrics.participation.y - metrics.skills.bottom <= 40);
      assert.equal(
        await evaluate(`(() => {
        const list=document.querySelector('.tu-detail-roster'),rows=[...list.children];
        return parseFloat(getComputedStyle(list).borderTopWidth)===1&&rows.every((row,index)=>index===0||Math.abs(row.getBoundingClientRect().top-rows[index-1].getBoundingClientRect().bottom)<1);
      })()`),
        true,
        'Members share one continuous list surface',
      );
      assert.equal(
        await evaluate(
          "[...document.querySelectorAll('.tu-detail-facts dl > div')].every(e=>parseFloat(getComputedStyle(e).borderBottomWidth)===0)",
        ),
        true,
        'Metadata has no independent card borders',
      );
      assert.equal(
        await evaluate(
          "[...document.querySelectorAll('.tu-detail-skills li')].every(e=>e.getBoundingClientRect().height>=30)",
        ),
        true,
      );
      if (width < 768) {
        assert.equal(refinement.leadAvatars, 0);
        assert.ok(refinement.leadHeight <= 65);
      }
      await screenshot(`detail-${width}-${theme}`);
      results.push({ theme, ...metrics, refinement });
    }
  for (const scenario of [
    'pending',
    'accepted',
    'rejected',
    'member',
    'owner',
    'full',
    'closed',
    'archived',
    'expired',
    'sparse',
    'long',
    'loading',
    'error',
    'apply-error',
    'message-error',
  ]) {
    await load(390, 'dark', scenario);
    if (scenario === 'owner') await wait("document.querySelector('.tu-detail-applications li')");
    if (
      [
        'pending',
        'accepted',
        'rejected',
        'member',
        'owner',
        'full',
        'closed',
        'archived',
        'expired',
      ].includes(scenario)
    )
      assert.equal(await evaluate("!!document.querySelector('#tu-application-note')"), false);
    if (scenario === 'member') assert.equal(await has('You’re on the team'), true);
    if (scenario === 'owner') {
      assert.equal(await has('Edit project'), true);
      assert.equal(
        await evaluate("window.__qaCalls.some(c=>c.path.endsWith('/recommended-students'))"),
        false,
      );
      await click('Find Suitable Students');
      await wait(
        "document.querySelector('.tu-detail-suggestions').innerText.includes('No suitable collaborators yet')",
      );
    }
    if (scenario === 'sparse') {
      assert.equal(await has('No specific skills required.'), true);
      assert.equal(await evaluate("document.querySelectorAll('.tu-detail-roster li').length"), 1);
      assert.equal(
        await evaluate("!!document.querySelector('.tu-detail-team > .tu-detail-muted')"),
        false,
      );
    }
    if (scenario === 'error') {
      await screenshot('project-error-390-dark');
      await evaluate('window.__qaFail=false');
      await click('Retry project');
      await wait("document.querySelector('.tu-detail-workspace')");
    }
    if (scenario === 'apply-error') {
      await click('Apply to join');
      await wait("document.querySelector('[role=alert]')");
      assert.equal(await has('Application could not be submitted.'), true);
      assert.equal(await evaluate("document.querySelector('button[type=submit]').disabled"), false);
    }
    if (scenario === 'message-error') {
      await click('Message project owner');
      await wait("document.querySelector('[role=alert]')");
      assert.equal(await has('Conversation unavailable.'), true);
    }
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await evaluate('window.scrollTo(0,0)');
    await screenshot('state-' + scenario);
  }
  await load(390, 'light');
  await evaluate(
    `(() => {const field=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'A line of application text\\n'.repeat(12));field.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await settle();
  assert.ok(
    await evaluate("document.querySelector('textarea').getBoundingClientRect().height>96"),
    'Application note grows with the content',
  );
  await evaluate(
    `(() => {const field=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'');field.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await settle();
  assert.equal(
    await evaluate("document.querySelector('textarea').getBoundingClientRect().height"),
    88,
    'An emptied note returns to its compact height',
  );
  await evaluate("document.querySelector('textarea').focus()");
  const readCount = await evaluate('window.__qaCalls.length');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await settle();
  assert.equal(
    await evaluate('window.__qaCalls.length'),
    readCount,
    'Responsive reflow does not refetch the project',
  );
  await load(390, 'light');
  await evaluate(
    "(()=>{const field=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'I can help with research.');field.dispatchEvent(new Event('input',{bubbles:true}));})()",
  );
  await evaluate(
    "(()=>{const form=document.querySelector('.tu-detail-participation form');form.requestSubmit();form.requestSubmit();})()",
  );
  await wait(
    "document.querySelector('.tu-detail-participation').innerText.includes('Application pending')",
  );
  assert.equal(
    await evaluate("window.__qaCalls.filter(c=>c.method==='POST').length"),
    1,
    'Synchronous guard prevents duplicate applications',
  );
  assert.equal(await has('Application submitted.'), true);
  await screenshot('application-success-390-light');
  for (const decision of ['Accept application', 'Reject application']) {
    await load(1440, 'light', 'owner');
    await wait("document.querySelector('.tu-detail-applications li')");
    await click(decision);
    await wait(
      "document.querySelector('.tu-detail-participation').innerText.includes('roster are up to date')",
    );
    assert.equal(await has('Synthetic QA applicant'), true);
    assert.equal(
      await evaluate("document.querySelectorAll('.tu-detail-roster li').length"),
      decision === 'Accept application' ? 3 : 2,
    );
    assert.equal(await evaluate("window.__qaCalls.filter(c=>c.method==='PATCH').length"), 1);
    assert.equal(
      await evaluate(
        "window.__qaCalls.filter(c=>c.method==='GET'&&c.path.endsWith('/applications')).length",
      ),
      2,
    );
    await screenshot(
      decision.startsWith('Accept') ? 'review-accepted-1440-light' : 'review-rejected-1440-light',
    );
  }
  await load(390, 'dark', 'review-refresh-error');
  await wait("document.querySelector('.tu-detail-applications li')");
  await click('Accept application');
  await wait(
    "document.querySelector('.tu-detail-participation').innerText.includes('decision was saved')",
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.tu-detail-review-actions button')].every(e=>e.disabled)",
    ),
    true,
  );
  await evaluate('window.__qaRefreshFail=false');
  await click('Refresh project information');
  await wait("document.querySelectorAll('.tu-detail-roster li').length===3");
  assert.equal(
    await evaluate("window.__qaCalls.filter(c=>c.method==='PATCH').length"),
    1,
    'Refresh recovery never repeats the saved mutation',
  );
  await load(1440, 'dark', 'owner');
  await wait("document.querySelector('.tu-detail-applications li')");
  await click('Mark completed');
  await wait("document.querySelector('.tu-detail-kickers').innerText.includes('Completed')");
  assert.equal(
    await evaluate("document.querySelectorAll('.tu-detail-roster li').length"),
    2,
    'Lifecycle summary preserves enriched member data',
  );
  await load(390, 'light', 'member');
  await click('Message project owner');
  await wait("window.__qaLocation==='/messages/fixture-conversation'");
  await load(390, 'light');
  await click('Share project');
  assert.equal(
    await evaluate(
      "document.querySelector('[aria-controls=tu-project-share]').getAttribute('aria-expanded')",
    ),
    'true',
  );
  await click('Copy link');
  await wait('window.__qaClipboard.length===1');
  assert.match(await evaluate('window.__qaClipboard[0]'), /\/teamup\/11111111/);
  await click('Copy message');
  assert.ok(await evaluate('window.__qaClipboard.length===2'));
  assert.equal(
    await evaluate('document.querySelector(\'a[href^="https://wa.me/"]\').target'),
    '_blank',
  );
  await click('Report');
  await wait("document.querySelector('[role=dialog]')");
  assert.equal(
    await evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)"),
    true,
  );
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await wait("!document.querySelector('[role=dialog]')");
  assert.equal(await evaluate("document.activeElement.textContent.trim()==='Report'"), true);
  await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
  await screenshot('bottom-390-light');
  assert.equal(
    await evaluate(
      "document.querySelector('.tu-detail-secondary').getBoundingClientRect().bottom<=innerHeight-80",
    ),
    true,
  );
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.ok(
    await evaluate(
      "parseFloat(getComputedStyle(document.querySelector('[aria-controls=tu-project-share]')).transitionDuration)<=0.001",
    ),
  );
  assert.equal(await evaluate('window.__qaNetwork'), 0);
  await load(320, 'dark', 'long');
  assert.equal(await evaluate("document.querySelector('.tu-detail-overview').open"), false);
  await evaluate("document.querySelector('.tu-detail-overview summary').click()");
  assert.equal(
    await evaluate(
      "document.querySelector('.tu-detail-overview p').textContent.endsWith('Original final paragraph.')",
    ),
    true,
    'The complete original description remains available',
  );
  await screenshot('overview-expanded-320-dark');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  await evaluate(
    "document.querySelector('.tu-detail-team').scrollIntoView({block:'start',behavior:'instant'})",
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.tu-detail-roster strong')].every(e=>e.scrollWidth<=e.clientWidth)",
    ),
    true,
    'Long member names wrap inside their row',
  );
  await screenshot('long-members-320-dark');
  for (const theme of ['light', 'dark']) {
    await load(390, theme, 'sparse');
    await evaluate(
      "document.querySelector('.tu-detail-team').scrollIntoView({block:'start',behavior:'instant'})",
    );
    await screenshot('single-member-390-' + theme);
    assert.ok(
      await evaluate(
        "document.querySelector('.tu-detail-roster li').getBoundingClientRect().height<80",
      ),
    );
    assert.equal(
      await evaluate("document.querySelectorAll('.tu-detail-owner [role=img]').length"),
      0,
    );
    await load(390, theme);
    await evaluate(
      "document.querySelector('.tu-detail-team').scrollIntoView({block:'start',behavior:'instant'})",
    );
    await screenshot('team-lead-actions-390-' + theme);
  }
  for (const width of [1440, 390])
    for (const theme of ['light', 'dark']) {
      await load(width, theme, 'owner');
      await wait("document.querySelector('.tu-detail-applications li')");
      assert.equal(
        await evaluate(
          "document.querySelector('.tu-detail-application-date').textContent.startsWith('Submitted ')",
        ),
        true,
      );
      assert.equal(
        await evaluate("window.__qaCalls.some(c=>c.path.endsWith('/recommended-students'))"),
        false,
      );
      await evaluate(
        "document.querySelector('.tu-detail-applications').scrollIntoView({block:'start',behavior:'instant'})",
      );
      await screenshot('owner-applications-' + width + '-' + theme);
      await load(width, theme, 'owner-empty');
      await wait(
        "document.querySelector('.tu-detail-applications').textContent.includes('No applications yet.')",
      );
      assert.equal(
        await evaluate("document.querySelectorAll('.tu-detail-applications li').length"),
        0,
      );
      await evaluate(
        "document.querySelector('.tu-detail-applications').scrollIntoView({block:'start',behavior:'instant'})",
      );
      await screenshot('owner-empty-' + width + '-' + theme);
    }
  assert.deepEqual(b.errors, []);
  await writeFile(join(output, 'verified-detail-results.json'), JSON.stringify(results, null, 2));
  console.log(
    'PASS: 20 viewport/theme cases; 15 state scenarios; application submission/duplicate/error, authoritative accept/reject and refresh recovery, lifecycle, messaging, sharing, report focus, reduced motion and bottom clearance.',
  );
} finally {
  await b.close();
}
