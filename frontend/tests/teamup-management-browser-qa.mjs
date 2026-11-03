import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2],
  b = await openChromeFixture(output),
  { send, evaluate, screenshot, settle } = b;
const wait = (expression) => b.waitFor(`Boolean(${expression})`),
  results = [];
async function load(view = 'create', width = 1440, theme = 'light', scenario = 'populated') {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: width < 768 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await send('Page.navigate', {
    url: b.origin + '/' + theme + '.html?' + new URLSearchParams({ view, case: scenario }),
  });
  await wait(
    view === 'create'
      ? "document.querySelector('form')"
      : scenario === 'loading'
        ? "document.querySelector('[aria-busy=true]')"
        : scenario === 'error' || ['non-owner', 'closed', 'consent-missing'].includes(scenario)
          ? "document.querySelector('.tu-manage-state')"
          : view === 'edit'
            ? "document.querySelector('form')"
            : "document.querySelector('[role=tablist]')",
  );
  await evaluate('document.fonts.ready');
  await settle();
}
async function click(label) {
  await evaluate(
    `(()=>{const button=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(label)}||e.textContent.trim().startsWith(${JSON.stringify(label)}));if(!button)throw new Error('Missing '+${JSON.stringify(label)});button.focus();button.click();})()`,
  );
  await settle();
}
async function fill(selector, value) {
  await evaluate(
    `(()=>{const field=document.querySelector(${JSON.stringify(selector)});const proto=field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await settle();
}
const writes = () => evaluate("window.__qaCalls.filter(c=>['POST','PATCH'].includes(c.method))");
async function fullScreenshot(name) {
  const { cssContentSize } = await send('Page.getLayoutMetrics');
  const result = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width: Math.ceil(cssContentSize.width),
      height: Math.ceil(cssContentSize.height),
      scale: 1,
    },
  });
  await writeFile(join(output, name + '.png'), Buffer.from(result.data, 'base64'));
}
try {
  for (const view of ['create', 'edit', 'workspace'])
    for (const width of [1920, 1440, 1366, 1280, 1024, 768, 430, 390, 360, 320])
      for (const theme of ['light', 'dark']) {
        await load(view, width, theme);
        assert.equal(
          await evaluate('document.documentElement.scrollWidth<=innerWidth'),
          true,
          view + ' overflow at ' + width,
        );
        if (view !== 'workspace') {
          assert.ok(
            await evaluate("document.querySelector('form').getBoundingClientRect().width<=960"),
          );
          assert.equal(
            await evaluate("document.querySelector('input[type=checkbox]').checked"),
            view === 'edit',
          );
          assert.equal(
            await evaluate("document.querySelector('#tu-form-deadline').value"),
            view === 'edit' ? '2026-12-01' : '',
          );
          assert.equal(
            await evaluate("document.querySelector('button[type=submit]').disabled"),
            view === 'edit',
            'Unchanged edits cannot submit an empty PATCH',
          );
        } else
          assert.equal(await evaluate("document.querySelectorAll('.tu-workspace-card').length"), 4);
        if (view === 'workspace') {
          assert.equal(
            await evaluate(
              "(()=>{const tabs=[...document.querySelectorAll('[role=tab]')];return tabs.every(t=>Math.abs(t.getBoundingClientRect().y-tabs[0].getBoundingClientRect().y)<1)})()",
            ),
            true,
            'Tabs remain in one horizontal row',
          );
          assert.deepEqual(
            await evaluate(
              "[...document.querySelectorAll('[role=tab] > span')].map(e=>e.textContent)",
            ),
            ['4', '1', '3'],
          );
          assert.equal(
            await evaluate(
              "document.querySelectorAll('.tu-workspace-card-actions > .cc-button--primary').length",
            ),
            4,
          );
          if (width === 320)
            assert.ok(
              await evaluate(
                "document.querySelector('[role=tablist]').scrollWidth>document.querySelector('[role=tablist]').clientWidth",
              ),
            );
        } else
          assert.equal(
            await evaluate("document.querySelector('.tu-featured-consent details').open"),
            false,
          );
        assert.equal((await writes()).length, 0);
        if ([1440, 390, 320].includes(width)) await screenshot(view + '-' + width + '-' + theme);
        if ([1440, 390].includes(width))
          await fullScreenshot(view + '-full-' + width + '-' + theme);
        results.push({ view, width, theme, pass: true });
      }
  await load();
  await click('Create project');
  await wait("document.querySelector('[role=alert]')");
  assert.equal((await writes()).length, 0);
  await screenshot('create-validation-1440-light');
  await fill('#tu-form-title', 'Synthetic new student project');
  await fill(
    '#tu-form-description',
    'Synthetic QA description. We will build a useful campus collaboration tool.',
  );
  await fill('#tu-form-requiredSkills', 'React');
  await evaluate("document.querySelector('#tu-form-requiredSkills').focus()");
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' });
  await settle();
  // Use the explicit action as a keyboard-independent fallback if focus remained on description.
  if (
    !(await evaluate("document.querySelector('.tu-selected-skills').textContent.includes('React')"))
  )
    await click('Add skill');
  await fill('#tu-form-requiredSkills', 'react');
  await click('Add skill');
  assert.equal(
    await evaluate(
      "document.querySelector('#tu-error-requiredSkills').textContent.includes('already selected')",
    ),
    true,
  );
  await fill('#tu-form-requiredSkills', 'Research');
  await click('Add skill');
  await evaluate('document.querySelector(\'[aria-label="Remove React"]\').click()');
  assert.equal(await evaluate("document.querySelectorAll('.tu-selected-skills li').length"), 1);
  await evaluate("document.querySelector('input[type=checkbox]').click()");
  await evaluate(
    "(()=>{const form=document.querySelector('form');form.requestSubmit();form.requestSubmit()})()",
  );
  await wait("window.__qaLocation==='/teamup/11111111-1111-4111-8111-111111111111'");
  assert.equal((await writes()).length, 1);
  assert.deepEqual(JSON.parse((await writes())[0].body).requiredSkills, ['Research']);
  assert.equal(JSON.parse((await writes())[0].body).featuredOnLanding, true);
  await load('edit', 390, 'dark');
  assert.equal(
    await evaluate("document.querySelector('#tu-form-title').value"),
    'Campus resource exchange',
  );
  await fill('#tu-form-title', 'Changed title only');
  await click('Save changes');
  await wait("window.__qaLocation==='/teamup/11111111-1111-4111-8111-111111111111'");
  assert.deepEqual(
    JSON.parse((await writes())[0].body),
    { title: 'Changed title only' },
    'Unchanged capacity, date and consent are not written',
  );
  await load('edit', 390, 'light');
  await evaluate("document.querySelector('input[type=checkbox]').click()");
  await click('Save changes');
  await wait("window.__qaLocation==='/teamup/11111111-1111-4111-8111-111111111111'");
  assert.deepEqual(
    JSON.parse((await writes())[0].body),
    { featuredOnLanding: false },
    'Explicit opt-out is preserved',
  );
  await load('edit', 390, 'light', 'submit-error');
  await fill('#tu-form-title', 'Retain this unsaved title');
  await click('Save changes');
  await wait("document.querySelector('[role=alert]')");
  assert.equal(
    await evaluate("document.querySelector('#tu-form-title').value"),
    'Retain this unsaved title',
  );
  await screenshot('edit-save-error-390-light');
  await evaluate('window.__qaFailWrite=false');
  await click('Save changes');
  await wait("window.__qaLocation==='/teamup/11111111-1111-4111-8111-111111111111'");
  for (const scenario of ['non-owner', 'closed', 'consent-missing']) {
    await load('edit', 390, 'dark', scenario);
    assert.equal(await evaluate("!!document.querySelector('form')"), false);
    await screenshot('edit-' + scenario);
  }
  await load('workspace', 390, 'light');
  await click('Projects I joined');
  assert.equal(
    await evaluate("document.querySelectorAll('[aria-controls=tu-owner-review]').length"),
    0,
  );
  await click('My applications');
  assert.equal(await evaluate("document.querySelectorAll('.tu-workspace-card').length"), 3);
  await screenshot('applications-390-light');
  assert.equal(
    await evaluate(
      "(()=>{const card=document.querySelector('.tu-workspace-card');return card.querySelector('a').getBoundingClientRect().width<card.getBoundingClientRect().width-30})()",
    ),
    true,
    'Application navigation is content sized',
  );
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Home', code: 'Home' });
  assert.equal(await evaluate('document.activeElement.id'), 'tu-tab-owned');
  for (const decision of ['Accept', 'Reject']) {
    await load('workspace', 1440, 'light');
    await click('Review applications');
    await wait("document.querySelector('.tu-review-list li')");
    await evaluate(
      "document.querySelector('.tu-owner-review').scrollIntoView({block:'start',behavior:'instant'})",
    );
    await screenshot('review-pending-' + decision.toLowerCase());
    await evaluate(
      `(()=>{const button=[...document.querySelectorAll('.tu-review-actions button')].find(e=>e.textContent===${JSON.stringify(decision)});button.click();button.click()})()`,
    );
    await screenshot('review-in-progress-' + decision.toLowerCase());
    await wait("document.querySelector('.tu-review-feedback')?.textContent.includes('up to date')");
    assert.equal((await writes()).length, 1);
    assert.equal(
      await evaluate("document.querySelector('.tu-review-person strong').textContent"),
      'Synthetic QA applicant',
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.tu-review-person .tu-management-status').textContent",
      ),
      decision === 'Accept' ? 'accepted' : 'rejected',
    );
    await screenshot('review-' + decision.toLowerCase() + 'ed');
  }
  await load('workspace', 390, 'dark', 'refresh-error');
  await click('Review applications');
  await wait("document.querySelector('.tu-review-list li')");
  await click('Accept');
  await wait("document.querySelector('.tu-owner-review [role=alert]')");
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.tu-review-actions button')].every(e=>e.disabled)",
    ),
    true,
  );
  await evaluate('window.__qaRefreshFail=false');
  await click('Refresh information');
  await wait("document.querySelector('.tu-review-feedback')?.textContent.includes('up to date')");
  assert.equal((await writes()).length, 1);
  await load('workspace', 390, 'dark', 'review-error');
  await click('Review applications');
  await wait("document.querySelector('.tu-review-list li')");
  await click('Accept');
  await wait("document.querySelector('.tu-owner-review [role=alert]')");
  await evaluate(
    "document.querySelector('.tu-owner-review').scrollIntoView({block:'start',behavior:'instant'})",
  );
  await screenshot('review-failure-390-dark');
  for (const scenario of ['empty', 'error', 'loading', 'review-empty']) {
    await load('workspace', 390, 'light', scenario);
    if (scenario === 'review-empty') {
      await click('Review applications');
      await wait(
        "document.querySelector('.tu-owner-review').textContent.includes('No applications yet')",
      );
      await evaluate(
        "document.querySelector('.tu-owner-review').scrollIntoView({block:'start',behavior:'instant'})",
      );
    }
    await screenshot('workspace-' + scenario);
  }
  await load('create', 320, 'dark');
  await fill('#tu-form-requiredSkills', 'LongSkillName'.repeat(3));
  await click('Add skill');
  await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
  await screenshot('create-bottom-320-dark');
  assert.equal(
    await evaluate(
      "document.querySelector('.tu-form-actions').getBoundingClientRect().bottom<=innerHeight-80",
    ),
    true,
  );
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  for (const theme of ['light', 'dark']) {
    await load('edit', 390, theme);
    await evaluate("document.querySelector('.tu-featured-consent summary').focus()");
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      text: '\r',
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    await wait("document.querySelector('.tu-featured-consent details').open");
    assert.equal(
      await evaluate("document.querySelector('.tu-featured-consent input').checked"),
      true,
      'Disclosure does not change stored consent',
    );
    assert.equal((await writes()).length, 0);
    await evaluate(
      "document.querySelector('.tu-featured-consent').scrollIntoView({block:'start',behavior:'instant'})",
    );
    await screenshot('consent-expanded-390-' + theme);
    await load('workspace', 320, theme);
    await evaluate("document.querySelector('#tu-tab-applications').focus()");
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      text: '\r',
    });
    await wait(
      "document.querySelector('#tu-tab-applications').getAttribute('aria-selected')==='true'",
    );
    assert.ok(await evaluate("document.querySelector('[role=tablist]').scrollLeft>0"));
    await screenshot('tabs-applications-320-' + theme);
  }
  for (const theme of ['light', 'dark']) {
    await load('workspace', 320, theme, 'long');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    await screenshot('workspace-long-320-' + theme);
    await click('Review applications');
    await wait("document.querySelector('.tu-review-list li')");
    assert.equal(
      await evaluate(
        "document.querySelector('.tu-review-note').scrollWidth<=document.querySelector('.tu-review-note').clientWidth",
      ),
      true,
    );
    await screenshot('review-long-note-320-' + theme);
  }
  assert.equal(await evaluate('window.__qaNetwork'), 0);
  assert.deepEqual(b.errors, []);
  await writeFile(
    join(output, 'verified-management-results.json'),
    JSON.stringify(results, null, 2),
  );
  console.log(
    'PASS: 60 responsive viewport/theme/page cases; validation, skills, prefill, partial updates, duplicate guards, save recovery, role/lifecycle guards, tabs, accept/reject and refresh recovery, review states, privacy boundaries and bottom clearance.',
  );
} finally {
  await b.close();
}
