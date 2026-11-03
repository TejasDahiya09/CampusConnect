import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2];
const browser = await openChromeFixture(output);
const { send, evaluate, screenshot, delay, settle } = browser;
const waitFor = (expression) => browser.waitFor(`Boolean(${expression})`);
const results = [];
const load = async (width = 1440, theme = 'light', scenario = 'populated', query = '') => {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: width < 700 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await send('Page.navigate', {
    url: browser.origin + '/' + theme + '.html?' + new URLSearchParams({ case: scenario, query }),
  });
  await waitFor(
    scenario === 'loading'
      ? "!!document.querySelector('.cc-tu-card-skeleton')"
      : "!!document.querySelector('.cc-tu-results[aria-busy=false]')",
  );
  await evaluate('document.fonts.ready');
  await settle();
};
const fill = async (selector, value) => {
  await evaluate(
    `(() => {const element=document.querySelector(${JSON.stringify(selector)});const prototype=element.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`,
  );
  await settle();
};
const click = async (label) => {
  await evaluate(
    `(() => {const button=[...document.querySelectorAll('button')].find(element=>element.textContent.trim()===${JSON.stringify(label)}||(${JSON.stringify(label)}==='Filters'&&element.classList.contains('cc-tu-filter-trigger')));if(!button)throw new Error('Missing action '+${JSON.stringify(label)});button.focus();button.click();})()`,
  );
  await settle();
};
const calls = () =>
  evaluate("window.__qaCalls.filter(call=>call.path.startsWith('/api/teamup/projects?')).length");
try {
  for (const width of [1920, 1440, 1366, 1280, 1024, 768, 430, 390, 360, 320])
    for (const theme of ['light', 'dark']) {
      await load(width, theme);
      const metrics = await evaluate(
        `(() => {const r=element=>{const rect=element.getBoundingClientRect();return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,bottom:rect.bottom};};return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,featureOverflow:document.querySelector('.cc-tu-browse').scrollWidth>document.querySelector('.cc-tu-browse').clientWidth,columns:getComputedStyle(document.querySelector('.cc-tu-project-grid')).gridTemplateColumns.split(' ').length,hero:r(document.querySelector('.cc-tu-hero')),toolbar:r(document.querySelector('.cc-tu-toolbar')),results:r(document.querySelector('.cc-tu-results')),recommendations:r(document.querySelector('.cc-tu-recommendations')),rail:getComputedStyle(document.querySelector('.cc-tu-filter-rail')).display!=='none'};})()`,
      );
      assert.equal(metrics.overflow, false);
      assert.equal(metrics.featureOverflow, false);
      assert.equal(metrics.rail, width >= 1100);
      if (width < 768) {
        assert.equal(metrics.columns, 1);
        assert.ok(metrics.toolbar.y < metrics.hero.y);
      }
      assert.ok(metrics.recommendations.y >= metrics.hero.bottom);
      assert.ok(metrics.recommendations.bottom <= metrics.results.y);
      if (width >= 768) assert.ok(metrics.recommendations.bottom <= metrics.toolbar.y);
      assert.equal(
        await evaluate(`(() => {
        const selectors = ${JSON.stringify(['.cc-tu-header', '.cc-tu-hero', '.cc-tu-recommendations', '.cc-tu-toolbar', '.cc-tu-results'])};
        if(innerWidth<768) selectors.splice(1,0,selectors.splice(3,1)[0]);
        return selectors.every((selector,index)=>!index || Boolean(document.querySelector(selectors[index-1]).compareDocumentPosition(document.querySelector(selector)) & Node.DOCUMENT_POSITION_FOLLOWING));
      })()`),
        true,
        'DOM reading order follows visual hierarchy',
      );
      assert.equal(await evaluate("document.querySelectorAll('#tu-keyword').length"), 1);
      assert.equal(
        await evaluate("window.__qaCalls.filter(call=>call.path.includes('recommended')).length"),
        1,
      );
      assert.equal(await calls(), 1, 'One initial catalog request');
      assert.equal(
        await evaluate(`(() => {
        const cards=[...document.querySelectorAll('.cc-tu-card')];
        return cards.every(card=>{
          const bounds=card.getBoundingClientRect(),footer=card.querySelector('.cc-tu-card-footer').getBoundingClientRect(),team=card.querySelector('.cc-tu-card-team').getBoundingClientRect();
          return footer.bottom<=bounds.bottom&&footer.left>=bounds.left&&footer.right<=bounds.right&&team.bottom<=footer.top+1;
        });
      })()`),
        true,
        'Card footers stay inside each card and below capacity',
      );
      assert.equal(await evaluate("document.querySelectorAll('.cc-tu-card').length"), 12);
      assert.equal(
        await evaluate(
          "document.querySelector('.cc-tu-results').innerText.includes('24 projects')",
        ),
        true,
      );
      assert.equal(
        await evaluate("document.querySelectorAll('.cc-tu-card img,.cc-tu-hero a').length"),
        0,
      );
      assert.equal(
        await evaluate(
          '!!document.querySelector(\'a[href="/teamup/new"]\')&&!!document.querySelector(\'a[href="/teamup/my-projects"]\')',
        ),
        true,
      );
      await screenshot(`browse-${width}-${theme}`);
      if ([1440, 390].includes(width)) {
        await evaluate(
          "document.querySelector('.cc-tu-results').scrollIntoView({block:'start',behavior:'instant'})",
        );
        await screenshot(`catalog-${width}-${theme}`);
      }
      results.push({ theme, ...metrics });
      console.log(`${width} ${theme}: PASS (${metrics.columns} columns)`);
    }
  // Browser history, supported API filtering, sort and accurate pagination.
  await load();
  await click('Next');
  await waitFor(
    "window.__qaLocation.includes('page=2')&&document.querySelector('.cc-tu-results[aria-busy=false]')",
  );
  assert.equal(
    await evaluate("document.querySelector('.cc-tu-pagination').innerText.includes('Page 2 of 2')"),
    true,
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.cc-tu-pagination button')].find(button=>button.textContent==='Next').disabled",
    ),
    true,
  );
  await evaluate('window.__qaBack()');
  await waitFor(
    "window.__qaLocation==='/teamup'&&document.querySelector('.cc-tu-results[aria-busy=false]')",
  );
  await evaluate('window.__qaForward()');
  await waitFor(
    "window.__qaLocation.includes('page=2')&&document.querySelector('.cc-tu-results[aria-busy=false]')",
  );
  const initialCount = await calls();
  await fill('#tu-keyword', 'plan');
  await fill('#tu-keyword', 'planner');
  assert.equal(
    await evaluate("document.querySelectorAll('.cc-tu-card').length"),
    0,
    'Outdated catalog is hidden during a pending criterion',
  );
  await delay(450);
  await waitFor(
    "window.__qaLocation.includes('keyword=planner')&&document.querySelector('.cc-tu-results[aria-busy=false]')",
  );
  assert.equal(await calls(), initialCount + 1, 'One debounced keyword request');
  assert.equal(await evaluate("window.__qaLocation.includes('page=')"), false);
  await click('Clear all');
  await waitFor(
    "window.__qaLocation==='/teamup'&&document.querySelector('.cc-tu-results[aria-busy=false]')",
  );
  await fill('.cc-tu-filter-rail input', 'React');
  await delay(450);
  await waitFor(
    "window.__qaLocation.includes('skill=React')&&document.querySelector('.cc-tu-results[aria-busy=false]')",
  );
  assert.equal(
    await evaluate(
      "document.querySelector('.cc-tu-results').innerText.includes('11 matching projects')",
    ),
    true,
  );
  await fill('.cc-tu-filter-rail select', 'FULL');
  await waitFor(
    "window.__qaLocation.includes('status=FULL')&&document.querySelector('.cc-tu-results[aria-busy=false]')",
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.cc-tu-card')].every(card=>card.innerText.includes('Full team'))",
    ),
    true,
  );
  await fill('.cc-tu-sort select', 'deadline');
  await waitFor(
    "window.__qaLocation.includes('sort=deadline')&&document.querySelector('.cc-tu-results[aria-busy=false]')",
  );
  assert.equal(await evaluate("document.querySelector('.cc-tu-filter-rail input').value"), 'React');
  await click('Clear all');
  await waitFor(
    "window.__qaLocation==='/teamup'&&document.querySelector('.cc-tu-results[aria-busy=false]')",
  );
  await evaluate("window.__qaDelayKeyword='slow'");
  await fill('#tu-keyword', 'slow');
  await delay(450);
  await waitFor('!!window.__qaReleaseLate');
  await fill('#tu-keyword', 'resource');
  await delay(450);
  await waitFor(
    "window.__qaLocation.includes('keyword=resource')&&document.querySelector('.cc-tu-results[aria-busy=false]')",
  );
  const currentTitles = await evaluate(
    "[...document.querySelectorAll('.cc-tu-card h3')].map(element=>element.textContent)",
  );
  await evaluate('window.__qaReleaseLate()');
  await delay(100);
  assert.deepEqual(
    await evaluate(
      "[...document.querySelectorAll('.cc-tu-card h3')].map(element=>element.textContent)",
    ),
    currentTitles,
    'Late superseded response never overwrites current results',
  );
  assert.ok(await evaluate('window.__qaAborted>0'));
  await load(1440, 'light', 'populated', 'status=all&sort=oldest&page=2');
  assert.equal(await evaluate("document.querySelector('.cc-tu-filter-rail select').value"), '');
  assert.equal(await evaluate("document.querySelector('.cc-tu-sort select').value"), 'oldest');
  assert.equal(
    await evaluate("document.querySelector('.cc-tu-pagination').innerText.includes('Page 2 of 3')"),
    true,
  );
  await load(1440, 'light', 'populated', 'status=OPEN&page=999&category=Fake&sort=unknown');
  await waitFor(
    "window.__qaLocation==='/teamup?page=2'&&document.querySelector('.cc-tu-results[aria-busy=false]')",
  );
  // Actual shared modal: focus trap, dismissal, restored filter values and 44px controls.
  await load(390, 'dark');
  await click('Filters');
  await waitFor("!!document.querySelector('[role=dialog]')");
  assert.equal(await evaluate('document.body.style.overflow'), 'hidden');
  assert.equal(
    await evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)"),
    true,
  );
  await fill('[role=dialog] input', 'Python');
  await delay(450);
  await waitFor("window.__qaLocation.includes('skill=Python')");
  await fill('[role=dialog] select', 'COMPLETED');
  await waitFor("window.__qaLocation.includes('status=COMPLETED')");
  await screenshot('filters-390-dark');
  await evaluate(
    "[...document.querySelector('[role=dialog]').querySelectorAll('button,input,select')].at(-1).focus()",
  );
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' });
  assert.equal(
    await evaluate("document.activeElement===document.querySelector('[role=dialog] button')"),
    true,
  );
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await waitFor("!document.querySelector('[role=dialog]')");
  assert.equal(
    await evaluate("document.activeElement.classList.contains('cc-tu-filter-trigger')"),
    true,
  );
  assert.equal(await evaluate('document.body.style.overflow'), '');
  await click('Filters');
  assert.equal(await evaluate("document.querySelector('[role=dialog] input').value"), 'Python');
  await click('Reset filters');
  await click('Done');
  await waitFor(
    "window.__qaLocation==='/teamup'&&document.querySelector('.cc-tu-results[aria-busy=false]')",
  );
  // All resilience states use the same final components.
  for (const scenario of [
    'empty',
    'error',
    'loading',
    'long',
    'sparse',
    'recommendation-error',
    'recommendation-empty',
    'recommendation-loading',
  ]) {
    await load(390, 'light', scenario);
    if (scenario === 'error') {
      assert.equal(await evaluate("!!document.querySelector('.cc-tu-feedback[role=alert]')"), true);
      await screenshot('catalog-error');
      await evaluate('window.__qaFailCatalog=false');
      await click('Retry projects');
      await waitFor("document.querySelectorAll('.cc-tu-card').length===12");
      assert.equal(
        await evaluate("!!document.querySelector('.cc-tu-feedback[role=alert]')"),
        false,
      );
    }
    if (scenario === 'recommendation-error') {
      await waitFor("!!document.querySelector('.cc-tu-recommendations [role=alert]')");
      await screenshot('recommendations-error');
      await evaluate('window.__qaFailRecommendations=false');
      await click('Retry recommendations');
      await waitFor("document.querySelectorAll('.cc-tu-rec-card').length===4");
    }
    if (scenario === 'recommendation-loading') await waitFor('!!window.__qaReleaseRecommendations');
    if (scenario.startsWith('recommendation-')) {
      await evaluate(
        "document.querySelector('.cc-tu-recommendations').scrollIntoView({block:'start',behavior:'instant'})",
      );
      await screenshot(scenario + '-panel');
    }
    if (scenario === 'sparse')
      assert.equal(
        await evaluate(
          "document.querySelector('.cc-tu-card').innerText.includes('No specific skills listed')&&document.querySelector('.cc-tu-card').innerText.includes('No deadline')",
        ),
        true,
      );
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
    if (scenario !== 'loading')
      await evaluate(
        "document.querySelector('.cc-tu-results').scrollIntoView({block:'start',behavior:'instant'})",
      );
    await screenshot('state-' + scenario);
  }
  for (const status of ['FULL', 'COMPLETED', 'ARCHIVED']) {
    await load(390, 'dark', 'populated', 'status=' + status);
    assert.equal(
      await evaluate(
        `document.querySelector('.cc-tu-card').innerText.includes('${status === 'FULL' ? 'Full team' : 'Recruitment closed'}')`,
      ),
      true,
    );
    await screenshot('state-' + status.toLowerCase());
  }
  await load(320, 'dark', 'long');
  assert.equal(
    await evaluate(
      "document.querySelector('.cc-tu-browse').scrollWidth<=document.querySelector('.cc-tu-browse').clientWidth",
    ),
    true,
  );
  await evaluate(
    "document.querySelector('.cc-tu-results').scrollIntoView({block:'start',behavior:'instant'})",
  );
  await screenshot('long-320-dark');
  // Native recommendation rail supports keyboard scrolling without request churn.
  await load(390, 'light');
  await waitFor("document.querySelectorAll('.cc-tu-rec-card').length===4");
  assert.ok(
    await evaluate(
      "document.querySelector('.cc-tu-rec-grid').scrollWidth>document.querySelector('.cc-tu-rec-grid').clientWidth",
    ),
  );
  assert.ok(
    await evaluate("document.querySelector('.cc-tu-rec-grid').getBoundingClientRect().height<250"),
  );
  await evaluate("document.querySelector('.cc-tu-rec-grid').focus()");
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
  await waitFor("document.querySelector('.cc-tu-rec-grid').scrollLeft>0");
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End' });
  await delay(600);
  assert.ok(
    await evaluate(
      "(()=>{const rail=document.querySelector('.cc-tu-rec-grid');return rail.scrollWidth-rail.clientWidth-rail.scrollLeft<5})()",
    ),
  );
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Home', code: 'Home' });
  await delay(600);
  assert.ok(await evaluate("document.querySelector('.cc-tu-rec-grid').scrollLeft<=2"));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' });
  assert.equal(await evaluate("document.activeElement.classList.contains('cc-tu-rec-card')"), true);
  const resizeCalls = await calls();
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await settle();
  assert.equal(await calls(), resizeCalls, 'Layout relocation does not refetch discovery');
  assert.equal(
    await evaluate("window.__qaCalls.filter(call=>call.path.includes('recommended')).length"),
    1,
  );
  assert.equal(await evaluate("document.querySelectorAll('#tu-keyword').length"), 1);
  await load(390, 'dark', 'populated', 'page=2');
  await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
  await screenshot('pagination-390-dark');
  assert.equal(
    await evaluate(
      "document.querySelector('.cc-tu-pagination').getBoundingClientRect().bottom<=innerHeight-80",
    ),
    true,
  );
  await load(1440, 'light');
  await waitFor("document.querySelectorAll('.cc-tu-rec-card').length===4");
  assert.equal(await evaluate("document.querySelectorAll('.cc-tu-rec-card').length"), 4);
  const destination = await evaluate(
    "document.querySelector('.cc-tu-project-link').getAttribute('href')",
  );
  await evaluate("document.querySelector('.cc-tu-project-link').click()");
  await waitFor('window.__qaLocation===' + JSON.stringify(destination));
  await load(320, 'dark', 'empty');
  await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
  assert.equal(
    await evaluate(
      "document.querySelector('.cc-tu-results a').getBoundingClientRect().bottom<=innerHeight-80",
    ),
    true,
    'Last link clears shared mobile nav reservation',
  );
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.ok(
    await evaluate(
      "parseFloat(getComputedStyle(document.querySelector('.cc-tu-rec-empty')).transitionDuration)<=0.001",
    ),
    'Reduced motion keeps transitions effectively immediate, including the shared safety override',
  );
  assert.equal(await evaluate('window.__qaNetwork'), 0);
  assert.deepEqual(browser.errors, []);
  await writeFile(join(output, 'verified-teamup-results.json'), JSON.stringify(results, null, 2));
  console.log(
    'TeamUp Browse: ' +
      results.length +
      ' viewport/theme cases; URL/history, filtering/sort, debounce/cancellation/stale responses, pagination, recommendations, modal and states PASS.',
  );
} finally {
  await browser.close();
}
