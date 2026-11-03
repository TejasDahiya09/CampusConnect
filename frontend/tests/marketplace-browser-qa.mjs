/** Run after build + marketplace-visual-fixture.ts. Uses an isolated Chrome profile and mock HTML. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const output = process.argv[2];
if (!output) throw new Error('Supply the generated temporary fixture directory.');
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/qa-photo.svg') {
      response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      response.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#d4d1ee"/><text x="320" y="240" text-anchor="middle" fill="#37336a" font-size="32">QA image fixture</text></svg>',
      );
      return;
    }
    const asset = path.startsWith('/assets/');
    if (!asset && !['/light.html', '/dark.html', '/fixture.js'].includes(path)) {
      response.writeHead(404).end();
      return;
    }
    const file = asset
      ? resolve('frontend/dist/assets', basename(path))
      : join(output, basename(path));
    const type = path.endsWith('.js')
      ? 'text/javascript'
      : path.endsWith('.css')
        ? 'text/css'
        : path.endsWith('.woff2')
          ? 'font/woff2'
          : 'text/html';
    response.writeHead(200, { 'Content-Type': type });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(output, 'chrome-cdp-'));
const browser = spawn(
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  [
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--disable-background-networking',
    '--disable-extensions',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
let socket;
let closeBrowser;
const runtimeErrors = [];
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      break;
    } catch {
      await delay(100);
    }
  }
  if (!port) throw new Error('Isolated Chrome did not expose its test debugging port.');
  const page = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(
    (r) => r.json(),
  );
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.onopen = done;
    socket.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      runtimeErrors.push(message.params.exceptionDetails.text);
      console.error(
        'Fixture runtime error:',
        message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text,
      );
    }
    if (message.id && pending.has(message.id)) {
      const { done, reject, timeout } = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(timeout);
      if (message.error) reject(new Error(message.error.message));
      else done(message.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((done, reject) => {
      const next = ++id;
      const timeout = setTimeout(() => {
        pending.delete(next);
        reject(new Error(`Timeout: ${method}`));
      }, 10000);
      pending.set(next, { done, reject, timeout });
      socket.send(JSON.stringify({ id: next, method, params }));
    });
  closeBrowser = () => send('Browser.close');
  await send('Page.enable');
  await send('Runtime.enable');
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      );
    return result.result.value;
  };
  const reports = [];
  const cases = [
    [1920, 1080, 'light'],
    [1440, 900, 'light'],
    [1440, 900, 'dark'],
    [1366, 768, 'light'],
    [1280, 720, 'light'],
    [1100, 800, 'light'],
    [1024, 768, 'light'],
    [430, 932, 'light'],
    [430, 932, 'dark'],
    [390, 844, 'light'],
    [390, 844, 'dark'],
    [360, 800, 'light'],
    [375, 812, 'light'],
    [320, 568, 'light'],
    [320, 568, 'dark'],
    [720, 450, 'light'],
  ];
  for (const [width, height, theme] of cases) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: width === 720 ? 2 : 1,
      mobile: width <= 430,
    });
    await send('Page.navigate', { url: `${origin}/${theme}.html` });
    let report;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await send('Runtime.evaluate', {
        expression: 'document.querySelector("#qa-report")?.textContent',
        returnByValue: true,
      });
      if (result.result.value) {
        report = JSON.parse(result.result.value);
        break;
      }
      await delay(50);
    }
    assert.ok(report, 'Browser layout report exists');
    assert.equal(report.width, width, 'Actual viewport must match the requested width');
    assert.equal(report.overflow, false, `${width} ${theme}: no page overflow`);
    assert.equal(
      await evaluate(
        'document.querySelectorAll(".cc-market-hero a,.cc-market-hero button,.cc-market-hero img").length',
      ),
      0,
    );
    assert.equal(report.sell.length, 1);
    for (const action of report.sell) {
      assert.equal(action.nowrap, 'nowrap');
      assert.ok(action.height >= 44 && action.height < 60);
      assert.equal(action.icon.width, 18);
      assert.equal(action.icon.height, 18);
    }
    assert.equal(
      new Set(report.categories.map((c) => c.height)).size,
      1,
      'Uniform category label geometry',
    );
    assert.equal(
      await evaluate(
        `Array.from(document.querySelectorAll('.cc-market-category-label')).every(el => el.scrollHeight <= el.clientHeight + 1)`,
      ),
      true,
      'Full category names fit the two-line label area',
    );
    assert.equal(report.share.height, 44);
    assert.equal(report.bookmark.height, 44);
    assert.equal(report.lastNextDisabled, true);
    assert.equal(report.searchOutline, 'none');
    assert.notEqual(report.searchFocus, 'none');
    const columns = report.cards.filter((c) => c.y === report.cards[0].y).length;
    if (width < 360) assert.equal(columns, 1);
    else if (width <= 430) assert.equal(columns, 2);
    assert.ok(report.cards[0].width >= 140, 'Readable card width');
    const mediaBefore = await evaluate(
      `Array.from(document.querySelectorAll('.cc-market-product-media')).map(el => ({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))`,
    );
    const cards =
      await evaluate(`Array.from(document.querySelectorAll('.cc-market-product')).map(card => {
      const rect = selector => card.querySelector(selector).getBoundingClientRect();
      const title=rect('h3'), price=rect('.cc-market-product-price'), metadata=rect('.cc-market-product-condition'), footer=rect('.cc-market-product-footer'), location=rect('.cc-market-product-footer > span'), share=rect('.cc-market-share');
      return { titleHeight:title.height, line:parseFloat(getComputedStyle(card.querySelector('h3')).lineHeight), titleBottom:title.bottom, priceTop:price.top, priceBottom:price.bottom, metadataTop:metadata.top, metadataBottom:metadata.bottom, footerTop:footer.top, footerBottom:footer.bottom, locationRight:location.right, shareLeft:share.left, shareRight:share.right, cardRight:card.getBoundingClientRect().right, priceFits:card.querySelector('.cc-market-product-price').scrollWidth <= card.querySelector('.cc-market-product-price').clientWidth, height:card.getBoundingClientRect().height };
    })`);
    for (const card of cards) {
      assert.ok(card.titleHeight <= card.line * 2 + 1);
      assert.ok(card.titleBottom <= card.priceTop + 1);
      assert.ok(card.priceBottom <= card.metadataTop + 1);
      assert.ok(card.metadataBottom <= card.footerTop + 1);
      assert.ok(card.locationRight <= card.shareLeft + 1 && card.shareRight <= card.cardRight + 1);
      assert.equal(card.priceFits, true);
    }
    for (let index = 0; index < columns; index++)
      assert.ok(Math.abs(cards[index].footerBottom - cards[0].footerBottom) <= 1);
    const wholeCategories = async () =>
      evaluate(`(() => {
      const r=document.querySelector('.cc-market-category-rail').getBoundingClientRect();
      return Array.from(document.querySelectorAll('.cc-market-category-option')).filter(el => { const b=el.getBoundingClientRect();return b.right>r.left+3 && b.left<r.right-3; }).every(el => {const b=el.getBoundingClientRect();return b.left>=r.left+1 && b.right<=r.right-1;});
    })()`);
    const screenshot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(
      join(output, `${width}-${theme}-verified.png`),
      Buffer.from(screenshot.data, 'base64'),
    );
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    await evaluate(
      `(() => { const rail=document.querySelector('.cc-market-category-rail'); rail.scrollTo({left:0,behavior:'instant'}); })()`,
    );
    await delay(40);
    const initial = await evaluate(
      `(() => { const r=document.querySelector('.cc-market-category-rail'); return {max:r.scrollWidth-r.clientWidth, viewport:r.clientWidth, previous:document.querySelector('[aria-label="Previous categories"]').disabled, hidden:document.querySelector('[aria-label="Next categories"]').hidden}; })()`,
    );
    assert.equal(initial.previous, true);
    assert.equal(await wholeCategories(), true, 'No clipped category cells at the start');
    assert.ok(
      ['x', 'x proximity'].includes(
        await evaluate(
          'getComputedStyle(document.querySelector(".cc-market-category-rail")).scrollSnapType',
        ),
      ),
    );
    if (initial.max > 1) {
      assert.equal(initial.hidden, false);
      await evaluate(`document.querySelector('[aria-label="Next categories"]').click()`);
      await delay(40);
      assert.equal(await wholeCategories(), true, 'Arrow scrolling lands on whole cells');
      assert.ok(
        (await evaluate('document.querySelector(".cc-market-category-rail").scrollLeft')) >=
          Math.min(initial.max, initial.viewport * 0.7),
      );
      const nextShot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      await writeFile(
        join(output, `${width}-${theme}-carousel-next.png`),
        Buffer.from(nextShot.data, 'base64'),
      );
      await evaluate(
        `(() => { const r=document.querySelector('.cc-market-category-rail'); r.scrollLeft=r.scrollWidth; })()`,
      );
      await delay(40);
      assert.equal(
        await evaluate(`document.querySelector('[aria-label="Next categories"]').disabled`),
        true,
      );
      assert.equal(await wholeCategories(), true, 'No clipped category cells at the end');
      const endShot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      await writeFile(
        join(output, `${width}-${theme}-carousel-end.png`),
        Buffer.from(endShot.data, 'base64'),
      );
      await evaluate(`document.querySelector('[aria-label="Previous categories"]').click()`);
      await delay(40);
      assert.ok(
        (await evaluate('document.querySelector(".cc-market-category-rail").scrollLeft')) <
          initial.max,
      );
    }
    const pageY = await evaluate('scrollY');
    await evaluate('document.querySelectorAll(".cc-market-category-option")[12].click()');
    await delay(50);
    assert.equal(
      await evaluate(
        `(() => { const r=document.querySelector('.cc-market-category-rail').getBoundingClientRect(), s=document.querySelector('.cc-market-category-option[aria-pressed=true]').getBoundingClientRect(); return s.left>=r.left-1 && s.right<=r.right+1; })()`,
      ),
      true,
    );
    assert.equal(await evaluate('scrollY'), pageY);
    const selectedShot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(
      join(output, `${width}-${theme}-carousel-selected.png`),
      Buffer.from(selectedShot.data, 'base64'),
    );
    assert.equal(await evaluate('new URL(location.href).searchParams.get("categoryId")'), 'other');
    await evaluate('document.querySelectorAll(".cc-market-category-option")[1].click()');
    await delay(40);
    await evaluate('history.back()');
    await delay(80);
    assert.equal(
      await evaluate(
        'document.querySelector(".cc-market-category-option[aria-pressed=true]").getAttribute("aria-label")',
      ),
      'Other',
    );
    await evaluate('history.forward()');
    await delay(80);
    assert.equal(
      await evaluate(
        'document.querySelector(".cc-market-category-option[aria-pressed=true]").getAttribute("aria-label")',
      ),
      'Books & Study Material',
    );
    for (const count of [0, 1, 3]) {
      await evaluate(`window.__qaSetCategories(${count})`);
      await delay(60);
      const fits = await evaluate(
        `(() => { const r=document.querySelector('.cc-market-category-rail'); return r.scrollWidth<=r.clientWidth+1; })()`,
      );
      assert.equal(
        await evaluate(`document.querySelector('[aria-label="Next categories"]').hidden`),
        fits,
      );
    }
    await evaluate('window.__qaSetCategories(12)');
    await delay(60);
    await send('Emulation.setEmulatedMedia', { features: [] });
    await evaluate(
      'document.querySelector(".cc-market-category-option[aria-pressed=true]").focus({preventScroll:true})',
    );
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End', code: 'End' });
    await delay(40);
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'Other');
    assert.equal(
      await evaluate(
        `(() => {const r=document.querySelector('.cc-market-category-rail').getBoundingClientRect(), a=document.activeElement.getBoundingClientRect(); return a.left>=r.left-1 && a.right<=r.right+1;})()`,
      ),
      true,
    );
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Home', code: 'Home' });
    await delay(40);
    assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'), 'All');
    assert.equal(await evaluate('scrollY'), pageY);
    if (width === 1440 && theme === 'light') {
      await send('Emulation.setDeviceMetricsOverride', {
        width: 320,
        height: 568,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await delay(100);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      assert.equal(
        await evaluate(
          'document.querySelector(".cc-market-category-option[aria-pressed=true]").getAttribute("aria-label")',
        ),
        'Books & Study Material',
      );
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(100);
    }
    if (width === 390) {
      await send('Page.navigate', {
        url: `${origin}/${theme}.html?categoryId=music-instruments&page=2`,
      });
      for (let attempt = 0; attempt < 100; attempt++) {
        if (
          await evaluate(
            'window.__qaHydrated && document.querySelector(".cc-market-category-option[aria-pressed=true]")?.getAttribute("aria-label") === "Music & Instruments"',
          )
        )
          break;
        await delay(30);
      }
      assert.equal(
        await evaluate(
          'document.querySelector(".cc-market-category-option[aria-pressed=true]").getAttribute("aria-label")',
        ),
        'Music & Instruments',
      );
      assert.equal(
        await evaluate(
          `(() => { const r=document.querySelector('.cc-market-category-rail').getBoundingClientRect(), a=document.querySelector('.cc-market-category-option[aria-pressed=true]').getBoundingClientRect(); return a.left>=r.left-1 && a.right<=r.right+1; })()`,
        ),
        true,
      );
      await evaluate(
        'document.querySelector(".cc-market-category-rail").scrollTo({left:0,behavior:"instant"})',
      );
      await delay(40);
      await evaluate(`document.querySelector('[aria-label="Next categories"]').click()`);
      await delay(650);
      assert.ok(
        (await evaluate('document.querySelector(".cc-market-category-rail").scrollLeft')) > 20,
        'Normal-motion arrow scroll completes',
      );
      if (theme === 'light') {
        await evaluate(
          'document.querySelector(".cc-market-category-rail").scrollTo({left:0,behavior:"instant"})',
        );
        await delay(50);
        const box = await evaluate(
          '(() => {const r=document.querySelector(".cc-market-category-rail").getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+22};})()',
        );
        await send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: box.x,
          y: box.y,
          deltaX: 120,
          deltaY: 0,
        });
        await delay(150);
        assert.ok(
          (await evaluate('document.querySelector(".cc-market-category-rail").scrollLeft')) > 1,
          'Native horizontal wheel scrolling works',
        );
        assert.equal(
          await evaluate(`document.querySelector('[aria-label="Previous categories"]').disabled`),
          false,
        );
      }
    }
    assert.equal(await evaluate('window.__qaRequests'), 0);
    if (width === 390 || width === 320) {
      await send('Runtime.evaluate', {
        expression:
          'document.querySelector(".cc-market-pagination").scrollIntoView({block:"end",behavior:"instant"})',
      });
      const loadedLast = await evaluate(`(async () => {
        const cards=Array.from(document.querySelectorAll('.cc-market-product')).slice(-2);
        for(let attempt=0;attempt<100;attempt++) {
          if(cards.every(card => {const image=card.querySelector('img');return image?.naturalWidth>0 && image.dataset.imageState==='loaded';})) return true;
          await new Promise(done=>setTimeout(done,30));
        }
        return false;
      })()`);
      assert.equal(loadedLast, true, 'Last-row lazy fixture images are loaded after scrolling');
      const mediaAfter = await evaluate(
        `Array.from(document.querySelectorAll('.cc-market-product-media')).map(el => ({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height}))`,
      );
      assert.deepEqual(mediaAfter, mediaBefore, 'Image loading does not change media geometry');
      assert.ok(
        (await evaluate(
          'parseFloat(getComputedStyle(document.querySelector("main")).paddingBottom)',
        )) >= 80,
        'Shared shell retains mobile bottom clearance',
      );
      const last = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      await writeFile(
        join(output, `${width}-${theme}-last-card.png`),
        Buffer.from(last.data, 'base64'),
      );
      const settle = () =>
        evaluate('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))');
      await evaluate('window.scrollTo({top:0,behavior:"instant"})');
      await settle();
      const photo = await evaluate(`(async () => {
        for (let i=0;i<100;i++) {
          const image=document.querySelector('.cc-market-product .cc-market-product-media img');
          if (image?.src.endsWith('/qa-photo.svg') && image.naturalWidth > 0 && image.dataset.imageState === 'loaded') return true;
          await new Promise(done=>setTimeout(done,50));
        }
        return false;
      })()`);
      assert.equal(
        photo,
        true,
        'Failed fixture image advances to the genuine secondary fixture source and loads',
      );
      const open = async () => {
        await evaluate(
          'document.querySelector(".cc-market-filter-trigger").focus(); document.querySelector(".cc-market-filter-trigger").click()',
        );
        await settle();
        assert.equal(
          await evaluate(
            '!!document.querySelector("[role=dialog]")?.contains(document.activeElement)',
          ),
          true,
        );
        assert.equal(await evaluate('document.body.style.overflow'), 'hidden');
      };
      await open();
      const drawer = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      await writeFile(
        join(output, `${width}-${theme}-filters.png`),
        Buffer.from(drawer.data, 'base64'),
      );
      await evaluate(
        `(() => { const nodes=[...document.querySelector('[role=dialog]').querySelectorAll('button,input,select,a[href]')]; nodes.at(-1).focus(); })()`,
      );
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' });
      await settle();
      assert.equal(
        await evaluate('document.activeElement === document.querySelector("[role=dialog] button")'),
        true,
        'Tab wraps inside the drawer',
      );
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
      await settle();
      assert.equal(await evaluate('!!document.querySelector("[role=dialog]")'), false);
      assert.equal(
        await evaluate(
          'document.activeElement === document.querySelector(".cc-market-filter-trigger")',
        ),
        true,
        'Focus returns to Filters',
      );
      await open();
      await evaluate(
        `(() => { const select=document.querySelector('[role=dialog] select'); select.value='cycles'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`,
      );
      await settle();
      await evaluate('document.querySelector("[role=dialog] form").requestSubmit()');
      await settle();
      assert.equal(await evaluate('!!document.querySelector("[role=dialog]")'), false);
      assert.equal(
        await evaluate('document.querySelector(".cc-market-filter-rail select").value'),
        'cycles',
        'Apply synchronizes rail and shortcuts',
      );
      await open();
      assert.equal(
        await evaluate('document.querySelector("[role=dialog] select").value'),
        'cycles',
        'Reopened drawer preserves selection',
      );
      await evaluate(
        `[...document.querySelectorAll('[role=dialog] button')].find(button => button.textContent.trim() === 'Clear all').click()`,
      );
      await settle();
      assert.equal(
        await evaluate(
          'document.querySelector(".cc-market-categories [aria-pressed=true]").getAttribute("aria-label")',
        ),
        'All',
      );
      assert.equal(
        await evaluate('document.querySelector(".cc-market-filter-rail select").value'),
        '',
      );
      await send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      });
      assert.ok(
        parseFloat(
          await evaluate(
            'getComputedStyle(document.querySelector(".cc-market-product")).transitionDuration',
          ),
        ) <= 0.001,
        'Reduced motion remains effectively immediate, including the global compatibility rule',
      );
      await send('Emulation.setEmulatedMedia', { features: [] });
      console.log(
        `${width} ${theme}: drawer focus/Tab/Escape/Apply/Clear, real image fallback and reduced motion PASS`,
      );
    }
    reports.push({
      width,
      height,
      theme,
      columns,
      cardWidth: report.cards[0].width,
      overflow: report.overflow,
      heroHeight: report.hero.height,
      firstCardY: report.cards[0].y,
      sell: report.sell,
    });
    console.log(
      `${width}x${height} ${theme}: PASS (${columns} columns, ${report.cards[0].width.toFixed(1)}px cards)`,
    );
  }
  await writeFile(join(output, 'verified-layout-results.json'), JSON.stringify(reports, null, 2));
  assert.deepEqual(runtimeErrors, [], 'No uncaught fixture JavaScript exceptions');
} finally {
  if (socket?.readyState === WebSocket.OPEN && closeBrowser) await closeBrowser().catch(() => {});
  socket?.close();
  browser.kill();
  server.close();
}
