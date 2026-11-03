/** Before/after visual and interaction checks for Step 10D.1; synthetic fixtures only. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2],
  phase = process.argv[3] ?? 'after';
const b = await openChromeFixture(output),
  { send, evaluate, settle, screenshot, waitFor } = b;
const records = [];
const load = async (width, theme, scenario = 'populated') => {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height: width < 700 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 700,
  });
  await send('Page.navigate', {
    url:
      b.origin +
      '/' +
      theme +
      '.html?' +
      new URLSearchParams({ screen: 'workspace', case: scenario }),
  });
  await waitFor('Boolean(document.querySelector(".svm-tabs"))');
  await evaluate('document.fonts.ready');
  await settle();
};
const tab = async (value, focus = true) => {
  await evaluate(
    `(()=>{const e=document.querySelector('#workspace-tab-${value}');${focus ? 'e.focus({preventScroll:true});' : ''}e.click();})()`,
  );
  await settle();
};
const unchangedPagePosition = async (previous) => {
  const current = await evaluate(
    '({x:scrollX,y:scrollY,max:Math.max(0,document.documentElement.scrollHeight-innerHeight)})',
  );
  assert.equal(current.x, previous.x);
  // A shorter tab panel may naturally clamp the page to its new scroll boundary.
  assert.equal(current.y, Math.min(previous.y, current.max));
  return { x: current.x, y: current.y };
};
const measure = () =>
  evaluate(
    `(()=>{const bar=document.querySelector('.svm-tabs'),frame=bar.parentElement;const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,bottom:r.bottom};};const active=bar.querySelector('[aria-selected=true]');return {width:innerWidth,pageX:scrollX,pageY:scrollY,overflow:document.documentElement.scrollWidth>innerWidth,bar:rect(bar),active:rect(active),left:bar.scrollLeft,max:bar.scrollWidth-bar.clientWidth,start:frame.dataset.scrollStart,end:frame.dataset.scrollEnd,beforeOpacity:getComputedStyle(frame,'::before').opacity,afterOpacity:getComputedStyle(frame,'::after').opacity,counts:[...bar.querySelectorAll('span')].map(e=>e.textContent),empty:document.querySelector('.svm-state')?rect(document.querySelector('.svm-state')):null};})()`,
  );
try {
  for (const width of [320, 360, 390, 430, 768, 1440])
    for (const theme of ['light', 'dark']) {
      await load(width, theme);
      const initial = await measure();
      assert.equal(initial.overflow, false);
      assert.deepEqual(initial.counts, ['3', '4', '4']);
      assert.ok(initial.active.left >= initial.bar.left);
      await screenshot(`${phase}-tabs-${width}-${theme}-first`);
      if (phase === 'after') {
        if (width < 768) {
          assert.ok(initial.max > 0);
          assert.equal(initial.start, 'false');
          assert.equal(initial.end, 'true');
          assert.equal(initial.beforeOpacity, '0');
          assert.equal(initial.afterOpacity, '1');
          await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
          const touch = {
            x: initial.bar.left + initial.bar.width * 0.75,
            y: initial.bar.top + initial.bar.height / 2,
          };
          await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
          for (let step = 1; step <= 10; step++) {
            await send('Input.dispatchTouchEvent', {
              type: 'touchMove',
              touchPoints: [{ x: touch.x - step * 14, y: touch.y }],
            });
            await b.delay(20);
          }
          await b.delay(200); // Finish the controlled drag without a continuing inertial fling.
          await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await b.delay(100);
          await settle();
          assert.ok(
            (await measure()).left > 0,
            'Native horizontal touch scroll moves the tab strip',
          );
          assert.equal(await evaluate('scrollX'), 0);
          await evaluate('document.querySelector(".svm-tabs").scrollLeft=0');
          await settle();
        } else {
          assert.ok(initial.max <= 1);
          assert.equal(initial.start, 'false');
          assert.equal(initial.end, 'false');
        }
        // Native scroll input changes only the horizontal strip. Indicators follow both edges.
        await evaluate('document.querySelector(".svm-tabs").scrollLeft=10000');
        await settle();
        const end = await measure();
        assert.equal(end.end, 'false');
        if (initial.max > 1) assert.equal(end.start, 'true');
        await evaluate('document.querySelector(".svm-tabs").scrollLeft=0');
        await settle();
        assert.equal((await measure()).start, 'false');
      }
      await tab('received');
      const third = await measure();
      assert.equal(third.overflow, false);
      assert.ok(
        third.active.left >= third.bar.left &&
          third.active.left + third.active.width <= third.bar.left + third.bar.width,
      );
      await screenshot(`${phase}-tabs-${width}-${theme}-third`);
      if (phase === 'after') {
        assert.equal(third.end, 'false');
        if (width < 768) assert.equal(third.afterOpacity, '0');
        // Keep the page away from the tab bar: keyboard/programmatic selection must not move it.
        await evaluate(
          'window.scrollTo(0,Math.min(500,document.documentElement.scrollHeight-innerHeight))',
        );
        await settle();
        let position = await evaluate('({x:scrollX,y:scrollY})');
        await tab('offered');
        position = await unchangedPagePosition(position);
        await evaluate(
          'document.querySelector("#workspace-tab-offered").focus({preventScroll:true})',
        );
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End' });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End' });
        await settle();
        assert.equal(await evaluate('document.activeElement.id'), 'workspace-tab-received');
        position = await unchangedPagePosition(position);
        let active = await measure();
        assert.ok(
          active.active.left >= active.bar.left &&
            active.active.left + active.active.width <= active.bar.left + active.bar.width,
        );
        for (const key of ['Home', 'ArrowRight', 'ArrowRight', 'ArrowLeft']) {
          await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key });
          await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key });
          await settle();
          active = await measure();
          assert.ok(
            active.active.left >= active.bar.left &&
              active.active.left + active.active.width <= active.bar.left + active.bar.width,
          );
          position = await unchangedPagePosition(position);
        }
        // Focus ring has room inside the scrolling surface, with no edge fade over the active label.
        const focus = await evaluate(
          `(()=>{const e=document.activeElement,r=e.getBoundingClientRect(),bar=document.querySelector('.svm-tabs').getBoundingClientRect(),s=getComputedStyle(e),space=parseFloat(s.outlineWidth)+parseFloat(s.outlineOffset);return {left:r.left-space-bar.left,right:bar.right-r.right-space,top:r.top-space-bar.top,bottom:bar.bottom-r.bottom-space};})()`,
        );
        for (const value of Object.values(focus))
          assert.ok(value >= -0.5, `Focus ring clipped: ${JSON.stringify(focus)}`);
        assert.equal(
          await evaluate('window.__qaCalls.length'),
          1,
          'Tab actions do not fetch or mutate data',
        );
        assert.equal(await evaluate('window.__qaLocation'), '/services/saved');
      }
      records.push({ width, theme, initial, third });
    }
  for (const width of [390, 1440])
    for (const theme of ['light', 'dark']) {
      await load(width, theme, 'empty');
      for (const section of ['offered', 'sent', 'received']) {
        await tab(section, false);
        const metrics = await measure();
        assert.ok(metrics.empty);
        assert.equal(metrics.overflow, false);
        assert.deepEqual(metrics.counts, ['0', '0', '0']);
        const content = await evaluate('document.querySelector(".svm-state").innerText');
        await screenshot(`${phase}-empty-${section}-${width}-${theme}`);
        records.push({ width, theme, section, metrics, content });
      }
    }
  if (phase === 'after') {
    const before = JSON.parse(await readFile(join(output, 'before-mobile-workspace.json'), 'utf8'));
    for (const row of records) {
      const old = before.find(
        (value) =>
          value.width === row.width && value.theme === row.theme && value.section === row.section,
      );
      assert.ok(old);
      if (row.section) {
        assert.equal(row.content, old.content);
        if (row.width < 768) {
          assert.ok(row.metrics.empty.height < old.metrics.empty.height - 20);
          assert.ok(row.metrics.empty.height > 150);
        } else assert.deepEqual(row.metrics.empty, old.metrics.empty);
      } else if (row.width === 1440) {
        assert.deepEqual(row.initial.bar, old.initial.bar);
        assert.deepEqual(row.initial.active, old.initial.active);
        for (const name of ['first', 'third']) {
          const file = `tabs-1440-${row.theme}-${name}.png`;
          const hash = async (prefix) =>
            createHash('sha256')
              .update(await readFile(join(output, `${prefix}-${file}`)))
              .digest('hex');
          assert.equal(await hash('after'), await hash('before'), 'Desktop screenshots unchanged');
        }
      }
    }
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    assert.equal(await evaluate('window.__qaNetwork'), 0);
    assert.deepEqual(b.errors, []);
  }
  await writeFile(join(output, `${phase}-mobile-workspace.json`), JSON.stringify(records, null, 2));
  console.log(
    `${phase}: 12 viewport/theme navigation cases and 12 empty-state comparisons recorded. ${phase === 'after' ? 'Indicators, horizontal-only reveal, keyboard/focus, genuine counts and unchanged desktop screenshots PASS.' : 'Unmodified baseline captured.'}`,
  );
} finally {
  await b.close();
}
