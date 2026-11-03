import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';

const output = process.argv[2];
if (!output) throw new Error('Supply generated Lost & Found fixture directory.');
const browser = await openChromeFixture(output);
const { send, evaluate, waitFor, settle, screenshot, delay } = browser;
const results = [];
try {
  const load = async (page, width, height, theme = 'light', scenario = 'lost', query = '') => {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 430,
    });
    await send('Page.navigate', {
      url:
        browser.origin +
        '/' +
        theme +
        '.html?' +
        new URLSearchParams({ page, case: scenario, query }),
    });
    const selector =
      scenario === 'loading'
        ? page === 'browse'
          ? '.cc-lf-card-skeleton'
          : '.cc-lf-detail-loading'
        : scenario === 'missing' || scenario === 'error'
          ? '.cc-lf-feedback'
          : page === 'browse'
            ? '.cc-lf-results[aria-busy=false]'
            : '#lf-report-title';
    await waitFor('window.__qaReady && !!document.querySelector(' + JSON.stringify(selector) + ')');
    await evaluate('document.fonts.ready');
    await settle();
    assert.equal(
      await evaluate('document.documentElement.scrollWidth<=innerWidth'),
      true,
      page + ' ' + width + ' overflow',
    );
    assert.equal(
      await evaluate(
        "document.querySelector('.cc-page').scrollWidth<=document.querySelector('.cc-page').clientWidth+1",
      ),
      true,
      'Feature content fits independently of shell overflow rules',
    );
  };
  const fill = async (selector, value) => {
    await evaluate(
      `(() => {const element=document.querySelector(${JSON.stringify(selector)});const type=element.tagName==='SELECT'?HTMLSelectElement:element.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;Object.getOwnPropertyDescriptor(type.prototype,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`,
    );
    await settle();
  };
  const clickText = async (text, scope = 'document') => {
    await evaluate(
      `(() => {const label=${JSON.stringify(text)};const button=[...${scope}.querySelectorAll('button')].find(button=>button.textContent.trim()===label||(label==='Filters'&&button.classList.contains('cc-lf-filter-trigger')));if(!button)throw new Error('Missing fixture control: '+label);button.focus();button.click();})()`,
    );
    await settle();
  };
  const escape = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await settle();
    assert.equal(await evaluate('!!document.querySelector("[role=dialog]")'), false);
  };
  for (const page of ['browse', 'detail']) {
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [1366, 768],
      [1100, 800],
      [1024, 768],
      [768, 1024],
      [430, 932],
      [390, 844],
      [375, 812],
      [360, 800],
      [320, 568],
      [720, 450],
    ]) {
      for (const theme of ['light', 'dark']) {
        await load(page, width, height, theme);
        const metrics =
          await evaluate(`(() => {const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,
          ${page === 'browse' ? `cards:[...document.querySelectorAll('.cc-lf-report-card')].map(rect),columns:getComputedStyle(document.querySelector('.cc-lf-grid')).gridTemplateColumns.split(' ').length,filtersVisible:getComputedStyle(document.querySelector('.cc-lf-filter-rail')).display!=='none',hero:rect(document.querySelector('.cc-lf-hero')),toolbar:rect(document.querySelector('.cc-lf-toolbar'))` : `gallery:rect(document.querySelector('.cc-lf-gallery')),summary:rect(document.querySelector('.cc-lf-summary')),reporter:rect(document.querySelector('.cc-lf-reporter')),info:rect(document.querySelector('.cc-lf-information')),about:rect(document.querySelector('.cc-lf-about')),facts:[...document.querySelectorAll('.cc-lf-information-facts > section')].map(rect),actions:rect(document.querySelector('.cc-lf-detail-actions')),safety:rect(document.querySelector('.cc-lf-safety'))`}}})()`);
        if (page === 'browse') {
          assert.equal(metrics.cards.length, 12);
          assert.equal(metrics.filtersVisible, width >= 1100);
          if (width >= 360 && width <= 430) assert.equal(metrics.columns, 2);
          if (width === 320) assert.equal(metrics.columns, 1);
          if (width <= 699)
            assert.ok(metrics.toolbar.y < metrics.hero.y, 'Mobile search precedes compact hero');
          assert.equal(
            await evaluate(
              "window.__qaCalls.filter(call=>call.path.startsWith('/api/lost-found/reports?')).length",
            ),
            1,
            'One initial catalog request',
          );
          assert.equal(
            await evaluate(
              "document.querySelectorAll('.cc-lf-hero .cc-button, .cc-lf-hero img').length",
            ),
            0,
          );
        } else {
          await waitFor("!document.querySelector('.cc-lf-recovery .cc-skeleton')");
          if (width >= 1200) {
            assert.ok(Math.abs(metrics.gallery.y - metrics.summary.y) < 1);
            assert.ok(Math.abs(metrics.gallery.y - metrics.reporter.y) < 1);
            assert.ok(
              metrics.gallery.right < metrics.summary.x &&
                metrics.summary.right < metrics.reporter.x,
            );
          }
          assert.ok(Math.abs(metrics.info.width - metrics.about.width) < 1);
          if (width >= 800) {
            assert.ok(Math.abs(metrics.facts[0].width - metrics.facts[1].width) < 1);
            assert.ok(Math.abs(metrics.facts[0].y - metrics.facts[1].y) < 1);
          } else {
            assert.ok(metrics.facts[1].y >= metrics.facts[0].bottom);
            assert.ok(metrics.info.y >= metrics.actions.bottom);
            assert.ok(metrics.safety.y >= metrics.info.bottom);
          }
          assert.equal(
            await evaluate(
              "getComputedStyle(document.querySelector('.cc-lf-gallery img')).objectFit",
            ),
            'contain',
          );
          assert.equal(
            await evaluate("window.__qaCalls.filter(call=>call.path.endsWith('/matches')).length"),
            0,
            'No automatic matching requests',
          );
          assert.equal(
            await evaluate("document.body.innerText.includes('private-must-not-render')"),
            false,
          );
        }
        assert.equal(await evaluate('window.__qaNetwork'), 0);
        await screenshot(page + '-' + width + '-' + theme);
        results.push({ page, theme, ...metrics });
        console.log(page + ' ' + width + ' ' + theme + ': PASS');
      }
    }
  }
  for (const page of ['browse', 'detail']) {
    for (const width of [1440, 390]) {
      for (const theme of ['light', 'dark']) {
        await load(page, width, width === 1440 ? 900 : 844, theme);
        await evaluate(
          `document.querySelector('${page === 'browse' ? '.cc-lf-results' : '.cc-lf-information'}').scrollIntoView({block:'start',behavior:'instant'})`,
        );
        if (page === 'browse')
          await waitFor("document.querySelector('.cc-lf-report-card img')?.naturalWidth>0");
        await screenshot(`${page}-${width}-${theme}-information`);
      }
    }
  }
  // Browse filtering uses the existing API, with one debounced request and real URL state.
  await load('browse', 390, 844);
  await clickText('Filters');
  await waitFor('!!document.querySelector("[role=dialog]")');
  assert.equal(
    await evaluate('document.querySelector("[role=dialog]").contains(document.activeElement)'),
    true,
  );
  assert.equal(await evaluate('document.body.style.overflow'), 'hidden');
  await evaluate(
    `(() => {const elements=[...document.querySelector('[role=dialog]').querySelectorAll('button,input,select,textarea,a[href]')].filter(element=>!element.disabled);elements.at(-1).focus();})()`,
  );
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' });
  assert.equal(
    await evaluate(`document.querySelector('[role=dialog] button')===document.activeElement`),
    true,
    'Filter dialog traps forward Tab',
  );
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', modifiers: 8 });
  assert.equal(
    await evaluate(
      `(() => {const elements=[...document.querySelector('[role=dialog]').querySelectorAll('button,input,select,textarea,a[href]')].filter(element=>!element.disabled);return elements.at(-1)===document.activeElement;})()`,
    ),
    true,
    'Filter dialog traps backward Tab',
  );
  await screenshot('browse-390-light-filters');
  await escape();
  assert.equal(
    await evaluate("document.activeElement.classList.contains('cc-lf-filter-trigger')"),
    true,
  );
  await clickText('Filters');
  await fill('[role=dialog] input[list]', 'Electronics');
  await fill('[role=dialog] input[placeholder="Any campus location"]', 'Student Centre');
  await fill('[role=dialog] input[type=date]', '2026-10-25');
  await evaluate(
    "document.querySelectorAll('[role=dialog] input[type=date]')[1].setAttribute('id','qa-date-to')",
  );
  await fill('#qa-date-to', '2026-10-01');
  await clickText('Apply filters', 'document.querySelector("[role=dialog]")');
  assert.ok(
    (await evaluate('document.querySelector("[role=dialog]").innerText')).includes('end date'),
  );
  await fill('#qa-date-to', '2026-10-26');
  await clickText('Apply filters', 'document.querySelector("[role=dialog]")');
  await waitFor(
    "!document.querySelector('[role=dialog]')&&window.__qaLocation.includes('category=Electronics')",
  );
  await clickText('Filters');
  assert.equal(
    await evaluate("document.querySelector('[role=dialog] input[list]').value"),
    'Electronics',
  );
  await clickText('Clear all', 'document.querySelector("[role=dialog]")');
  await waitFor(
    "window.__qaLocation==='/lost-found'&&!document.querySelector('.cc-lf-results[aria-busy=true]')",
  );
  await evaluate(
    "document.querySelector('.cc-lf-category[aria-label=Books]').focus();document.querySelector('.cc-lf-category[aria-label=Books]').click()",
  );
  await waitFor("window.__qaLocation.includes('category=Books')");
  assert.equal(
    await evaluate(
      `(() => {const item=document.querySelector('.cc-lf-category[aria-pressed=true]').getBoundingClientRect(),rail=document.querySelector('.cc-lf-category-rail').getBoundingClientRect();return item.left>=rail.left-1&&item.right<=rail.right+1;})()`,
    ),
    true,
    'Selected category revealed',
  );
  await clickText('Clear all');
  await waitFor("window.__qaLocation==='/lost-found'");
  const before = await evaluate(
    "window.__qaCalls.filter(call=>call.path.includes('/reports?')).length",
  );
  await fill('#lf-report-search', 'backpack');
  await delay(500);
  await waitFor("window.__qaLocation.includes('keyword=backpack')");
  assert.equal(
    await evaluate("window.__qaCalls.filter(call=>call.path.includes('/reports?')).length"),
    before + 1,
    'One debounced search request',
  );
  await clickText('Clear all');
  await waitFor("window.__qaLocation==='/lost-found'");
  await fill('.cc-lf-sort select', 'oldest');
  await waitFor(
    "window.__qaLocation.includes('sort=oldest')&&!document.querySelector('.cc-lf-results[aria-busy=true]')",
  );
  await clickText('Next');
  await waitFor(
    "window.__qaLocation.includes('page=2')&&!document.querySelector('.cc-lf-results[aria-busy=true]')",
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.cc-lf-pagination button')].find(button=>button.textContent==='Next').disabled",
    ),
    true,
  );
  await screenshot('browse-390-last-page');
  await evaluate('window.__qaBack()');
  await waitFor("!window.__qaLocation.includes('page=2')");
  await evaluate('window.__qaForward()');
  await waitFor("window.__qaLocation.includes('page=2')");
  await load('browse', 390, 844, 'light', 'lost', 'category=Books&type=FOUND');
  assert.equal(
    await evaluate(
      "document.querySelector('.cc-lf-category[aria-label=Books]').getAttribute('aria-pressed')",
    ),
    'true',
    'URL restoration',
  );
  await load('browse', 390, 844);
  await evaluate("document.querySelector('.cc-lf-report-link').click()");
  await waitFor("!!document.querySelector('#lf-report-title')");
  // Real shared modal focus restoration, keyboard image selection and authorized gallery fallback.
  await load('detail', 390, 844);
  await waitFor(
    "!![...document.querySelectorAll('button')].find(button=>button.textContent==='Submit claim')",
  );
  await evaluate('document.querySelector(\'[aria-label="View image 2"]\').focus()');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft' });
  assert.equal(
    await evaluate(
      "document.querySelector('[aria-label=\"View image 1\"]').getAttribute('aria-pressed')",
    ),
    'true',
  );
  await evaluate(
    'document.querySelector(\'[aria-label="View larger image"]\').focus();document.querySelector(\'[aria-label="View larger image"]\').click()',
  );
  await waitFor('!!document.querySelector("[role=dialog]")');
  await screenshot('detail-390-light-viewer');
  await escape();
  assert.equal(
    await evaluate('document.activeElement.getAttribute("aria-label")'),
    'View larger image',
  );
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const swipe = await evaluate(
    "(() => {const r=document.querySelector('.cc-lf-gallery-stage').getBoundingClientRect();return {x:r.x+r.width*.75,y:r.y+r.height*.5};})()",
  );
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [swipe] });
  for (const offset of [30, 60, 90, 120])
    await send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: swipe.x - offset, y: swipe.y }],
    });
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  assert.equal(
    await evaluate(
      'document.querySelector(\'[aria-label="View image 2"]\').getAttribute("aria-pressed")',
    ),
    'true',
    'Horizontal gallery swipe selects next genuine image',
  );
  // Bookmark failure leaves the last confirmed state intact.
  await clickText('Save');
  await waitFor(
    "document.querySelector('.cc-lf-save--detail button').getAttribute('aria-pressed')==='true'",
  );
  await evaluate('window.__qaFailSave=true');
  await clickText('Saved');
  await waitFor("!!document.querySelector('.cc-lf-save--detail [role=alert]')");
  assert.equal(
    await evaluate(
      "document.querySelector('.cc-lf-save--detail button').getAttribute('aria-pressed')",
    ),
    'true',
  );
  await clickText('Share');
  await waitFor('!!document.querySelector("[role=dialog]")');
  const share = await evaluate('document.querySelector(\'[role=dialog] a[href*="wa.me"]\').href');
  assert.ok(share.includes('LOST') || decodeURIComponent(share).includes('Lost'));
  assert.ok(!decodeURIComponent(share).includes('private identifying evidence'));
  await escape();
  await clickText('Report');
  await waitFor('!!document.querySelector("[role=dialog]")');
  await clickText('Submit report', 'document.querySelector("[role=dialog]")');
  await waitFor(
    "document.querySelector('[role=dialog] [role=status]')?.textContent.includes('Thank you')",
  );
  assert.equal(
    await evaluate(
      "'reporterId' in window.__qaCalls.find(call=>call.path==='/api/moderation/reports').body",
    ),
    false,
  );
  await escape();
  await clickText('Submit claim');
  await waitFor('!!document.querySelector("[role=dialog]")');
  assert.equal(
    await evaluate(
      "[...document.querySelector('[role=dialog]').querySelectorAll('button')].find(button=>button.textContent==='Submit claim').disabled",
    ),
    true,
  );
  await fill('[role=dialog] textarea', 'Synthetic identifying evidence supplied explicitly.');
  await clickText('Submit claim', 'document.querySelector("[role=dialog]")');
  await waitFor(
    "!document.querySelector('[role=dialog]')&&document.body.innerText.includes('Cancel claim')",
  );
  assert.equal(
    await evaluate(
      "window.__qaCalls.filter(call=>call.method==='POST'&&call.path.endsWith('/claims')).length",
    ),
    1,
  );
  assert.equal(
    await evaluate(
      "'claimantId' in window.__qaCalls.find(call=>call.method==='POST'&&call.path.endsWith('/claims')).body",
    ),
    false,
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('button')].some(button=>button.textContent==='Submit claim')",
    ),
    false,
    'No duplicate pending claim affordance',
  );
  await clickText('Cancel claim');
  await waitFor("document.body.innerText.includes('CANCELLED')");
  for (const scenario of [
    'found',
    'single',
    'no-images',
    'failed',
    'fallback',
    'matched',
    'pending',
    'resolved',
    'owner',
    'owner-resolved',
    'archived',
    'removed',
    'missing',
    'error',
    'loading',
    'long',
    'moderator',
  ]) {
    await load('detail', 390, 844, 'dark', scenario);
    if (!['missing', 'error', 'loading'].includes(scenario))
      await waitFor("!document.querySelector('.cc-lf-recovery .cc-skeleton')");
    if (['resolved', 'owner-resolved', 'archived', 'removed', 'pending'].includes(scenario))
      assert.equal(
        await evaluate(
          "[...document.querySelectorAll('button')].some(button=>button.textContent==='Submit claim')",
        ),
        false,
      );
    if (scenario === 'single')
      assert.equal(
        await evaluate("document.querySelectorAll('.cc-lf-thumbnails button').length"),
        0,
      );
    if (scenario === 'failed')
      await waitFor(
        "document.querySelector('.cc-lf-gallery').innerText.includes('Photos unavailable')",
      );
    if (scenario === 'fallback')
      await waitFor(
        "document.querySelector('.cc-lf-gallery img')?.getAttribute('src')==='/qa-bag.svg'",
      );
    if (scenario === 'owner') {
      assert.ok((await evaluate('document.body.innerText')).includes('Edit report'));
      await clickText('Approve');
      await waitFor("document.body.innerText.includes('APPROVED')");
      await clickText('Matched');
      await waitFor("document.querySelector('.cc-lf-summary-meta').innerText.includes('Matched')");
      await clickText('Find possible matches');
      await waitFor("document.body.innerText.includes('No strong matches found yet')");
    }
    if (scenario === 'moderator') {
      assert.ok((await evaluate('document.body.innerText')).includes('Approve'));
      assert.equal(
        await evaluate("!!document.querySelector('.cc-lf-edit, .cc-lf-owner-status')"),
        false,
      );
    }
    if (['missing', 'error'].includes(scenario))
      assert.equal(await evaluate("document.body.innerText.includes('QA Student')"), false);
    await screenshot('detail-390-' + scenario);
    assert.equal(await evaluate('window.__qaNetwork'), 0);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  }
  for (const scenario of ['empty', 'error', 'loading']) {
    await load('browse', 390, 844, 'light', scenario);
    await screenshot('browse-390-' + scenario);
  }
  // Claim loading, errors and restricted states must never resemble a blank action panel.
  for (const theme of ['light', 'dark']) {
    for (const scenario of [
      'owner-empty',
      'claims-loading',
      'claims-populated',
      'claims-restricted',
      'claims-error',
      'claims-timeout',
    ]) {
      await load('detail', 1440, 900, theme, scenario);
      if (scenario === 'claims-loading') {
        await waitFor('!!window.__qaReleaseClaims');
        assert.equal(
          await evaluate("document.querySelector('.cc-lf-recovery').getAttribute('aria-busy')"),
          'true',
        );
        assert.equal(
          await evaluate(
            "document.querySelector('.cc-lf-claim-skeleton').getBoundingClientRect().height",
          ),
          20,
        );
        assert.equal(
          await evaluate(
            "document.querySelector('.cc-lf-recovery').innerText.includes('Submit claim')",
          ),
          false,
        );
        await screenshot('claims-loading-' + theme);
        await evaluate('window.__qaReleaseClaims()');
      }
      if (scenario === 'claims-timeout') {
        await delay(12200);
        await waitFor(
          "document.querySelector('.cc-lf-claim-feedback')?.innerText.includes('too long')",
        );
      } else {
        await waitFor(
          "document.querySelector('.cc-lf-recovery')?.getAttribute('aria-busy')==='false'",
        );
      }
      const text = await evaluate("document.querySelector('.cc-lf-recovery').innerText");
      if (scenario === 'claims-restricted') {
        assert.ok(text.includes('unavailable to this account'));
        assert.ok(
          !text.includes('Submit claim') &&
            !text.includes('identifying evidence') &&
            !text.includes('No claims') &&
            !text.includes('Private server evidence'),
        );
      }
      if (['claims-error', 'claims-timeout'].includes(scenario)) {
        assert.ok(!text.includes('No claims available') && !text.includes('Submit claim'));
        await screenshot(scenario + '-' + theme);
        await clickText('Retry claims');
        await waitFor(
          "document.querySelector('.cc-lf-recovery')?.getAttribute('aria-busy')==='false'&&!document.querySelector('.cc-lf-claim-feedback')",
        );
      }
      if (scenario === 'owner-empty')
        assert.ok(text.includes('No claims available') && !text.includes('Submit claim'));
      if (scenario === 'claims-populated')
        assert.ok(text.includes('Cancel claim') && !text.includes('Approve'));
      await screenshot(scenario + '-settled-' + theme);
    }
  }
  // Scroll each native-lazy media surface into view. Inspect decoded pixels, request results and geometry.
  await load('browse', 390, 844);
  const initialMedia = await evaluate(
    "[...document.querySelectorAll('.cc-lf-report-card img')].map(img=>({loaded:img.naturalWidth>0,lazy:img.loading==='lazy',belowViewport:img.getBoundingClientRect().top>innerHeight}))",
  );
  const mediaResults = [];
  for (let index = 0; index < 12; index++) {
    const selector = `.cc-lf-report-card:nth-child(${index + 1}) .cc-lf-report-media`;
    const beforeHeight = await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().height`,
    );
    await evaluate(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`,
    );
    await waitFor(
      `(() => {const media=document.querySelector(${JSON.stringify(selector)});return !!media.querySelector('.cc-lf-photo-empty') || !!media.querySelector('img')?.naturalWidth;})()`,
    );
    const state = await evaluate(
      `(() => {const media=document.querySelector(${JSON.stringify(selector)}),img=media.querySelector('img');return {height:media.getBoundingClientRect().height,source:img?.getAttribute('src'),loaded:!!img?.naturalWidth,fallback:media.querySelector('.cc-lf-photo-empty')?.innerText};})()`,
    );
    assert.ok(
      Math.abs(beforeHeight - state.height) < 1,
      'Image completion causes no media layout shift',
    );
    assert.equal(index === 5 ? !!state.fallback : state.loaded, true);
    if (index === 11)
      assert.equal(
        state.source,
        '/qa-bag.svg',
        'Failed first source advances to genuine supplied URL',
      );
    mediaResults.push(state);
    for (const action of ['.cc-lf-card-save button', '.cc-lf-share-link']) {
      assert.equal(
        await evaluate(
          `(() => {const r=document.querySelector('.cc-lf-report-card:nth-child(${index + 1}) ${action}').getBoundingClientRect();return r.width>=44&&r.height>=44;})()`,
        ),
        true,
        'Full 44px card action targets',
      );
    }
  }
  await screenshot('browse-390-last-image-loaded');
  const imageRequests = await evaluate(
    "performance.getEntriesByType('resource').filter(entry=>/qa-bag|qa-book|missing-card/.test(entry.name)).map(entry=>({path:new URL(entry.name).pathname,status:entry.responseStatus,bytes:entry.transferSize}))",
  );
  assert.ok(imageRequests.some((entry) => entry.path === '/qa-bag.svg' && entry.status === 200));
  assert.ok(
    imageRequests.some((entry) => entry.path === '/missing-card.png' && entry.status === 404),
  );
  await writeFile(
    join(output, 'verified-image-loading.json'),
    JSON.stringify({ initialMedia, mediaResults, imageRequests }, null, 2),
  );
  for (const width of [390, 320]) {
    await load('browse', width, 844, 'dark', 'long');
    await evaluate(
      "document.querySelector('.cc-lf-results').scrollIntoView({block:'start',behavior:'instant'})",
    );
    assert.equal(
      await evaluate(
        `(() => {return [...document.querySelectorAll('.cc-lf-report-card')].every(card=>{const title=card.querySelector('h3'),location=card.querySelector('.cc-lf-card-location'),date=card.querySelector('.cc-lf-card-date'),footer=card.querySelector('footer');return title.getBoundingClientRect().bottom<=location.getBoundingClientRect().top+1&&location.getBoundingClientRect().bottom<=date.getBoundingClientRect().top+1&&date.getBoundingClientRect().bottom<=footer.getBoundingClientRect().top+1;});})()`,
      ),
      true,
      'Long titles and locations never overlap card metadata or actions',
    );
    await screenshot('browse-' + width + '-long');
  }
  await load('detail', 320, 568, 'dark', 'long');
  assert.ok(
    await evaluate(
      "document.querySelector('.cc-lf-about').textContent.includes('[campusconnect-examiner-demo-v1]')",
    ),
  );
  await evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
  await screenshot('detail-320-bottom');
  assert.equal(
    await evaluate(
      "document.querySelector('.cc-lf-related').getBoundingClientRect().bottom<=innerHeight-80",
    ),
    true,
  );
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.equal(await evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'), true);
  await send('Emulation.setEmulatedMedia', { features: [] });
  assert.deepEqual(browser.errors, [], 'No uncaught browser exceptions');
  await writeFile(
    join(output, 'verified-lost-found-results.json'),
    JSON.stringify(results, null, 2),
  );
  console.log(
    'Lost & Found QA complete: ' +
      results.length +
      ' viewport/theme cases, 17 detail states, 3 browse feedback states and filter/gallery/claim/owner/share/report/save interactions PASS.',
  );
} finally {
  await browser.close();
}
