/** Run after build + marketplace-detail-visual-fixture.ts. Uses an isolated Chrome profile and mock HTML. */
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
    if (path === '/qa-calculator.svg') {
      response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      response.end(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 960 640" preserveAspectRatio="xMidYMid slice"><rect width="960" height="640" fill="#e8e4df"/><rect x="285" y="74" width="390" height="494" rx="32" fill="#e5e7eb" stroke="#979baa" stroke-width="8"/><rect x="333" y="132" width="294" height="114" rx="8" fill="#aabdb7"/><text x="480" y="206" text-anchor="middle" font-family="monospace" font-size="55" fill="#203b36">123.456</text><g fill="#b2b6bf"><rect x="333" y="285" width="64" height="48" rx="9"/><rect x="410" y="285" width="64" height="48" rx="9"/><rect x="487" y="285" width="64" height="48" rx="9"/><rect x="564" y="285" width="64" height="48" rx="9"/><rect x="333" y="347" width="64" height="48" rx="9"/><rect x="410" y="347" width="64" height="48" rx="9"/><rect x="487" y="347" width="64" height="48" rx="9"/><rect x="564" y="347" width="64" height="48" rx="9"/><rect x="333" y="409" width="64" height="48" rx="9"/><rect x="410" y="409" width="64" height="48" rx="9"/><rect x="487" y="409" width="64" height="48" rx="9"/><rect x="564" y="409" width="64" height="48" rx="9"/></g><text x="480" y="610" text-anchor="middle" font-family="sans-serif" font-size="17" fill="#514e56">SYNTHETIC QA IMAGE - NOT A REAL LISTING</text></svg>',
      );
      return;
    }
    if (['/qa-landscape.svg', '/qa-portrait.svg', '/qa-square.svg'].includes(path)) {
      const portrait = path.includes('portrait'),
        square = path.includes('square');
      const w = portrait ? 640 : square ? 800 : 960,
        h = portrait ? 960 : square ? 800 : 640;
      const scale = Math.min(w / 960, h / 640) * 0.9;
      response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      response.end(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#e7e4ee"/><rect y="${h * 0.75}" width="${w}" height="${h * 0.25}" fill="#d1c6b6"/><g transform="translate(${(w - 960 * scale) / 2} ${(h - 640 * scale) / 2}) scale(${scale})"><path d="M250 150h460v310H250Z" fill="#444353"/><path d="M270 170h420v270H270Z" fill="#202332"/><path d="m210 460 540 0 65 45H145Z" fill="#b4b4bf"/><path d="M250 150h460v310H250Z" fill="none" stroke="#9999a6" stroke-width="8"/></g><text x="${w / 2}" y="60" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#363348">ISOLATED QA IMAGE - NOT A REAL LISTING</text><text x="${w / 2}" y="${h - 50}" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#363348">${portrait ? 'Portrait' : square ? 'Square' : 'Landscape'} fixture</text></svg>`,
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

  const waitFor = async (expression) => {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await evaluate(expression)) return;
      await delay(30);
    }
    throw new Error('Fixture condition not met: ' + expression);
  };
  const settle = () =>
    evaluate('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))');
  const shot = async (name) => {
    await settle();
    const screenshot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(join(output, name + '.png'), Buffer.from(screenshot.data, 'base64'));
  };
  const load = async (scenario, width, height, theme = 'light') => {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: width === 720 ? 2 : 1,
      mobile: width <= 430,
    });
    await send('Page.navigate', { url: origin + '/' + theme + '.html?case=' + scenario });
    const condition =
      scenario === 'loading'
        ? "!!document.querySelector('.cc-listing-loading')"
        : ['unavailable', 'error'].includes(scenario)
          ? "!!document.querySelector('.cc-listing-unavailable')"
          : "!!document.querySelector('#listing-title')";
    await waitFor('window.__qaReady && ' + condition);
    await evaluate('document.fonts.ready');
    await settle();
    assert.equal(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
      true,
      scenario + ' ' + width + ': no page overflow',
    );
  };
  const closeDialog = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await settle();
    assert.equal(await evaluate('!!document.querySelector("[role=dialog]")'), false);
  };
  const reports = [];
  const viewports = [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1280, 720],
    [1100, 800],
    [1024, 768],
    [768, 1024],
    [430, 932],
    [390, 844],
    [375, 812],
    [360, 800],
    [320, 568],
    [720, 450],
  ];
  for (const [width, height] of viewports) {
    for (const theme of width === 1440 || width === 1366 || width === 390 || width === 320
      ? ['light', 'dark']
      : ['light']) {
      await load('visitor', width, height, theme);
      await waitFor("document.querySelector('.cc-listing-photo img')?.naturalWidth > 0");
      const metrics = await evaluate(`(() => {
        const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
        return {gallery:rect(document.querySelector('.cc-listing-gallery')),info:rect(document.querySelector('.cc-listing-product-summary')),safety:rect(document.querySelector('.cc-listing-safety')),actions:rect(document.querySelector('.cc-listing-secondary-actions')),lower:rect(document.querySelector('.cc-listing-information')),title:rect(document.querySelector('#listing-title')),price:rect(document.querySelector('.cc-listing-price')),main:rect(document.querySelector('.cc-listing-gallery-stage')),photoFit:getComputedStyle(document.querySelector('.cc-listing-photo img')).objectFit,
          thumbs:[...document.querySelectorAll('.cc-listing-thumbnails button')].map(rect),buttons:[...document.querySelectorAll('.cc-listing-secondary-actions button')].map(rect),contact:rect(document.querySelector('.cc-listing-contact')),seller:rect(document.querySelector('.cc-listing-seller')),about:rect(document.querySelector('.cc-listing-about h2')),aboutSection:rect(document.querySelector('.cc-listing-about')),facts:rect(document.querySelector('.cc-listing-information-facts')),details:rect(document.querySelector('[aria-labelledby=listing-details-heading]')),location:rect(document.querySelector('[aria-labelledby=listing-location-heading]')),reportBackground:getComputedStyle(document.querySelector('.cc-listing-report > button')).backgroundColor,contactBackground:getComputedStyle(document.querySelector('.cc-listing-contact')).backgroundColor,padding:parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom)};
      })()`);
      assert.equal(metrics.photoFit, 'contain');
      assert.equal(metrics.thumbs.length, 3);
      for (const thumb of metrics.thumbs) assert.ok(thumb.width >= 44 && thumb.height >= 44);
      for (const button of metrics.buttons) assert.ok(button.height >= 36);
      assert.ok(
        metrics.buttons.every((button) => Math.abs(button.height - 44) < 1),
        'Action heights match',
      );
      assert.ok(metrics.contact.height >= 44);
      assert.notEqual(metrics.reportBackground, 'rgba(0, 0, 0, 0)', 'Report has a visible surface');
      assert.notEqual(metrics.contactBackground, metrics.reportBackground);
      assert.ok(metrics.seller.height < 260, 'Compact truthful seller panel');
      assert.ok(metrics.contact.width >= metrics.seller.width - 42, 'Full-width contact');
      assert.ok(metrics.title.bottom <= metrics.price.y + 1);
      if (width >= 1200) {
        assert.ok(Math.abs(metrics.info.y - metrics.gallery.y) < 1, 'Three-region top alignment');
        assert.ok(Math.abs(metrics.seller.y - metrics.gallery.y) < 1, 'Seller top aligns');
        assert.ok(metrics.gallery.right < metrics.info.x && metrics.info.right < metrics.seller.x);
        const total = metrics.gallery.width + metrics.info.width + metrics.seller.width;
        assert.ok(
          metrics.gallery.width / total >= 0.4 && metrics.gallery.width / total <= 0.43,
          'Gallery proportion',
        );
        assert.ok(
          metrics.info.width / total >= 0.32 && metrics.info.width / total <= 0.35,
          'Product information proportion',
        );
        assert.ok(
          metrics.seller.width / total >= 0.23 && metrics.seller.width / total <= 0.251,
          'Seller rail proportion',
        );
        assert.ok(
          metrics.actions.x >= metrics.info.x && metrics.actions.right <= metrics.info.right + 1,
          'Actions stay inside product information',
        );
        assert.ok(
          metrics.buttons[0].y === metrics.buttons[1].y,
          'Save and Share align horizontally',
        );
        assert.ok(
          metrics.buttons[2].x - metrics.buttons[1].right <= 9,
          'Report stays beside Share',
        );
        assert.ok(Math.abs(metrics.buttons[2].y - metrics.buttons[1].y) <= 2);
        assert.ok(
          metrics.lower.x >= metrics.info.x && metrics.lower.right <= metrics.info.right + 1,
        );
        assert.ok(metrics.lower.y >= metrics.actions.bottom, 'About follows the actions');
        assert.ok(metrics.safety.y >= metrics.seller.bottom, 'Separate safety panel under seller');
      } else if (width >= 800) {
        assert.ok(Math.abs(metrics.info.y - metrics.gallery.y) < 1);
        assert.ok(metrics.seller.y >= metrics.gallery.bottom);
      } else {
        assert.ok(metrics.title.y >= metrics.gallery.bottom, 'Mobile title follows gallery');
        assert.ok(metrics.seller.y >= metrics.price.bottom, 'Mobile seller follows product');
        assert.ok(
          metrics.actions.y >= metrics.contact.bottom,
          'Mobile contact before Save and Share',
        );
        assert.ok(metrics.lower.y >= metrics.actions.bottom, 'Information follows actions');
        assert.ok(metrics.safety.y >= metrics.lower.bottom, 'Safety follows details');
        if (width === 390)
          assert.ok(metrics.contact.y < 844, 'CTA visible in first mobile viewport');
      }
      const information = await evaluate(`(() => {
        const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,bottom:r.bottom};};
        const report=document.querySelector('.cc-listing-report > button');
        report.focus({preventScroll:true});
        const aligned=selector=>[...document.querySelectorAll(selector)].map(el=>el.getBoundingClientRect());
        return {about:rect('.cc-listing-about'),detailsHeading:rect('#listing-details-heading'),locationHeading:rect('#listing-location-heading'),
          detailValues:aligned('[aria-labelledby=listing-details-heading] dd').map(r=>r.x),
          detailLabels:aligned('[aria-labelledby=listing-details-heading] dt').map(r=>r.width),
          locationValues:aligned('[aria-labelledby=listing-location-heading] dd').map(r=>r.x),
          locationLabels:aligned('[aria-labelledby=listing-location-heading] dt').map(r=>r.width),
          aboutBorder:getComputedStyle(document.querySelector('.cc-listing-about')).borderTopWidth,
          detailsBorder:getComputedStyle(document.querySelector('[aria-labelledby=listing-details-heading]')).borderTopWidth,
          cards:[...document.querySelectorAll('.cc-listing-about, .cc-listing-information-facts > section')].map(el=>{
            const style=getComputedStyle(el);return [style.paddingTop,style.paddingRight,style.borderRadius,style.borderColor,style.backgroundColor];
          }),
          actionRadii:[...document.querySelectorAll('.cc-listing-secondary-actions button')].map(el=>getComputedStyle(el).borderRadius),
          saveWidth:document.querySelector('.cc-listing-save').getBoundingClientRect().width,
          saveButtonWidth:document.querySelector('.cc-listing-save button').getBoundingClientRect().width,
          border:getComputedStyle(report).borderTopWidth,focus:getComputedStyle(report).outlineWidth};
      })()`);
      assert.ok(
        Math.abs(information.about.width - metrics.lower.width) < 1,
        'About spans center column',
      );
      assert.ok(metrics.facts.y >= information.about.bottom, 'Metadata follows About');
      if (width >= 800) {
        assert.ok(Math.abs(metrics.details.y - metrics.location.y) < 1, 'Metadata cards align');
        assert.ok(
          Math.abs(metrics.details.width - metrics.location.width) < 1,
          'Metadata cards are equal',
        );
        assert.ok(metrics.details.right < metrics.location.x, 'Metadata cards remain distinct');
        assert.ok(
          metrics.details.height > metrics.location.height,
          'Metadata heights follow their own content',
        );
      } else {
        assert.ok(metrics.location.y >= metrics.details.bottom, 'Mobile metadata stacks');
      }
      for (const values of [information.detailValues, information.locationValues])
        assert.ok(values.every((x) => Math.abs(x - values[0]) < 1));
      for (const labels of [information.detailLabels, information.locationLabels])
        assert.ok(labels.every((value) => Math.abs(value - labels[0]) < 1));
      assert.equal(information.aboutBorder, '1px');
      assert.equal(information.detailsBorder, '1px');
      assert.equal(information.border, '1px');
      assert.ok(
        information.cards.every(
          (card) => JSON.stringify(card) === JSON.stringify(information.cards[0]),
        ),
        'Information cards share padding and surfaces',
      );
      assert.ok(
        information.actionRadii.every((radius) => radius === information.actionRadii[0]),
        'Action radii match',
      );
      assert.ok(
        Math.abs(information.saveWidth - information.saveButtonWidth) < 1,
        'Entire Save surface is clickable',
      );
      assert.ok(parseFloat(information.focus) >= 2, 'Report has a visible keyboard focus ring');
      assert.ok(metrics.buttons[2].height >= 44, 'Report preserves its touch target');
      assert.ok(
        await evaluate(
          "!document.querySelector('[role=tablist], .cc-listing-bottom') && document.querySelector('#listing-details-heading') && document.querySelector('#listing-location-heading') && document.querySelectorAll('.cc-listing-information dt').length===5",
        ),
      );
      if (width <= 430)
        assert.ok(metrics.padding >= 80, 'Shared shell mobile clearance: ' + metrics.padding);
      assert.equal(await evaluate("window.__qaCalls.filter(call=>call.method==='GET').length"), 1);
      assert.equal(await evaluate('window.__qaNetwork'), 0);
      await shot(width + '-' + theme + '-detail');
      reports.push({ width, height, theme, ...metrics });
      console.log(width + 'x' + height + ' ' + theme + ': layout PASS');
    }
  }
  for (const theme of ['light', 'dark']) {
    await load('single', 1440, 900, theme);
    await waitFor("document.querySelector('.cc-listing-photo img')?.naturalWidth > 0");
    const single = await evaluate(`(() => {
      const frame=document.querySelector('.cc-listing-gallery-stage').getBoundingClientRect();
      const image=document.querySelector('.cc-listing-photo img');
      return {ratio:frame.width/frame.height,fit:getComputedStyle(image).objectFit,thumbs:document.querySelectorAll('.cc-listing-thumbnails button').length,count:!!document.querySelector('.cc-listing-image-count')};
    })()`);
    assert.ok(Math.abs(single.ratio - 1.5) < 0.01, 'Single photo preserves landscape ratio');
    assert.equal(single.fit, 'contain');
    assert.equal(single.thumbs, 0);
    assert.equal(single.count, false, 'No redundant single-image counter');
    await shot('1440-' + theme + '-single');
    await evaluate(
      "document.querySelector('.cc-listing-information').scrollIntoView({block:'start'})",
    );
    await shot('1440-' + theme + '-description-details');
  }
  for (const scenario of ['single', 'single-portrait', 'single-square']) {
    for (const width of [1440, 390, 320]) {
      await load(scenario, width, width === 1440 ? 900 : width === 390 ? 844 : 568);
      await waitFor("document.querySelector('.cc-listing-photo img')?.naturalWidth > 0");
      const geometry = await evaluate(`(() => {
        const image=document.querySelector('.cc-listing-photo img');
        const frame=document.querySelector('.cc-listing-gallery-stage').getBoundingClientRect();
        const title=document.querySelector('#listing-title').getBoundingClientRect();
        const info=document.querySelector('.cc-listing-workspace').getBoundingClientRect();
        return {ratio:frame.width/frame.height,fit:getComputedStyle(image).objectFit,imageRatio:image.naturalWidth/image.naturalHeight,titleRight:title.right,infoRight:info.right,thumbs:document.querySelectorAll('.cc-listing-thumbnails button').length};
      })()`);
      if (scenario === 'single')
        assert.ok(Math.abs(geometry.ratio - (width === 1440 ? 1.5 : 2.35)) < 0.07);
      else if (scenario === 'single-square')
        assert.ok(Math.abs(geometry.ratio - (width === 1440 ? 1.05 : 2.35)) < 0.07);
      else
        assert.ok(
          geometry.ratio >= 0.99 && geometry.ratio <= 1.6,
          'Portrait frame adapts with a height cap',
        );
      assert.equal(geometry.fit, 'contain', 'Portrait/square photos remain uncropped');
      assert.equal(geometry.thumbs, 0);
      assert.ok(geometry.titleRight <= geometry.infoRight + 1);
      await shot(width + '-' + scenario + '-geometry');
    }
  }
  console.log('Single-image landscape/portrait/square geometry: 9 cases PASS');
  for (const scenario of ['reference', 'calculator']) {
    for (const [width, height, theme] of [
      [1440, 900, 'light'],
      [1440, 900, 'dark'],
      [390, 844, 'light'],
      [390, 844, 'dark'],
    ]) {
      await load(scenario, width, height, theme);
      await waitFor("document.querySelector('.cc-listing-photo img')?.naturalWidth > 0");
      assert.equal(await evaluate('window.__qaNetwork'), 0);
      if (scenario === 'calculator') {
        const composition = await evaluate(`(() => {
          const frame=document.querySelector('.cc-listing-gallery-stage').getBoundingClientRect();
          return {ratio:frame.width/frame.height,excerpt:document.querySelector('.cc-listing-description-preview')?.textContent,
            full:document.querySelector('.cc-listing-about')?.textContent,
            expandVisible:getComputedStyle(document.querySelector('.cc-listing-zoom-hint')).display !== 'none'};
        })()`);
        assert.ok(Math.abs(composition.ratio - (width === 1440 ? 1.05 : 2.35)) < 0.07);
        assert.equal(
          composition.excerpt,
          undefined,
          'Short description is not repeated above About',
        );
        assert.ok(composition.full?.includes('[campusconnect-examiner-demo-v1]'));
        assert.equal(composition.expandVisible, true);
        assert.equal(
          await evaluate("document.querySelectorAll('.cc-listing-thumbnails button').length"),
          0,
        );
        assert.equal(
          await evaluate(
            "document.body.innerText.includes('RAM') || document.body.innerText.includes('Warranty')",
          ),
          false,
        );
      }
      await shot(scenario + '-' + width + '-' + theme);
      if (scenario === 'calculator' && width === 390) {
        await evaluate(
          "document.querySelector('.cc-listing-information').scrollIntoView({block:'start',behavior:'instant'})",
        );
        await settle();
        await shot('calculator-390-' + theme + '-information');
      }
    }
  }
  console.log('Synthetic reference-like and sparse calculator presentations: 8 cases PASS');
  for (const theme of ['light', 'dark']) {
    await load('reference', 390, 844, theme);
    await evaluate(
      "document.documentElement.style.scrollBehavior='auto';document.querySelector('.cc-listing-seller').scrollIntoView({block:'center',behavior:'instant'})",
    );
    await delay(100);
    await shot('reference-390-' + theme + '-seller-safety');
  }
  await load('visitor', 390, 844);
  await waitFor("document.querySelector('.cc-listing-photo img')?.naturalWidth > 0");
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  const swipe = await evaluate(
    `(() => {const r=document.querySelector('.cc-listing-gallery-stage').getBoundingClientRect();return {x:r.left+r.width*.7,y:r.top+r.height*.45};})()`,
  );
  await send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: swipe.x, y: swipe.y }],
  });
  for (const delta of [30, 60, 90, 120]) {
    await send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: swipe.x - delta, y: swipe.y }],
    });
    await delay(20);
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitFor("document.querySelector('.cc-listing-image-count')?.textContent.includes('2 / 3')");
  assert.equal(
    await evaluate('!!document.querySelector("[role=dialog]")'),
    false,
    'Swiping does not accidentally open the viewer',
  );
  await evaluate('document.querySelector(\'[aria-label="View image 1"]\').click()');
  await settle();
  await evaluate('document.querySelector(\'[aria-label="Next image"]\').click()');
  await waitFor("document.querySelector('.cc-listing-image-count')?.textContent.includes('2 / 3')");
  assert.ok(
    (await evaluate("document.querySelector('.cc-listing-photo img').src")).endsWith(
      '/qa-portrait.svg',
    ),
  );
  await evaluate('document.querySelector(\'[aria-label="View larger image"]\').focus()');
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
  await settle();
  assert.ok(
    (await evaluate("document.querySelector('.cc-listing-photo img').src")).endsWith(
      '/qa-square.svg',
    ),
  );
  assert.equal(
    await evaluate('document.querySelector(\'[aria-label="Next image"]\').disabled'),
    true,
  );
  await evaluate('document.querySelector(\'[aria-label="View image 1"]\').click()');
  await settle();
  assert.equal(
    await evaluate('document.querySelector(\'[aria-label="Previous image"]\').disabled'),
    true,
  );
  await evaluate(
    'document.querySelector(\'[aria-label="View larger image"]\').focus();document.querySelector(\'[aria-label="View larger image"]\').click()',
  );
  await settle();
  assert.equal(
    await evaluate("document.querySelector('[role=dialog]').contains(document.activeElement)"),
    true,
  );
  assert.equal(await evaluate('document.body.style.overflow'), 'hidden');
  await evaluate('document.querySelector(\'[role=dialog] [aria-label="Next image"]\').click()');
  await settle();
  assert.ok(
    (await evaluate("document.querySelector('[role=dialog] img').src")).endsWith(
      '/qa-portrait.svg',
    ),
  );
  await shot('390-light-lightbox');
  await evaluate(
    "document.querySelector('[role=dialog] .cc-listing-thumbnails button:last-child').focus()",
  );
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' });
  await settle();
  assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"), 'Close dialog');
  await closeDialog();
  assert.equal(
    await evaluate("document.activeElement.getAttribute('aria-label')"),
    'View larger image',
  );
  const saveLabel = await evaluate(`(() => {
    const label=document.querySelector('.cc-listing-save > span[aria-hidden=true]');
    label.scrollIntoView({block:'center',behavior:'instant'});
    const rect=label.getBoundingClientRect();return {x:rect.right-16,y:rect.top+rect.height/2};
  })()`);
  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...saveLabel,
    button: 'left',
    clickCount: 1,
  });
  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...saveLabel,
    button: 'left',
    clickCount: 1,
  });
  await waitFor(
    "document.querySelector('.cc-listing-save button')?.getAttribute('aria-pressed')==='true'",
  );
  await waitFor("!document.querySelector('.cc-listing-save button').disabled");
  assert.equal(
    await evaluate("window.__qaCalls.filter(call=>call.path.endsWith('/bookmark')).length"),
    1,
  );
  await shot('390-light-saved');
  await evaluate(
    'window.__qaFailBookmark=true;document.querySelector(".cc-listing-save button").click()',
  );
  await waitFor("!document.querySelector('.cc-listing-save button').disabled");
  assert.equal(
    await evaluate(
      "document.querySelector('.cc-listing-save button').getAttribute('aria-pressed')",
    ),
    'true',
    'Failed unsave rolls back',
  );
  assert.ok(
    (
      await evaluate("document.querySelector('.cc-listing-save [role=status]').textContent")
    ).includes('could not'),
  );
  await evaluate(
    "[...document.querySelectorAll('.cc-listing-secondary-actions > button')].find(button=>button.textContent.trim()==='Share').click()",
  );
  await settle();
  const share = await evaluate(
    "document.querySelector('[role=dialog] a[title], [role=dialog] a[aria-label*=WhatsApp]')?.href",
  );
  assert.ok(share.startsWith('https://wa.me/?text='));
  assert.ok(
    decodeURIComponent(share).includes('/marketplace/11111111-1111-4111-8111-111111111111'),
  );
  assert.ok(!decodeURIComponent(share).includes('private@example.test'));
  await shot('390-light-share');
  await closeDialog();
  await evaluate("document.querySelector('.cc-listing-contact').click()");
  await waitFor('window.__qaNavigation === "/messages/qa-conversation"');
  assert.equal(
    await evaluate(
      "window.__qaCalls.filter(call=>call.path==='/api/messages/conversations').length",
    ),
    1,
  );
  const conversation = await evaluate(
    "window.__qaCalls.find(call=>call.path==='/api/messages/conversations').body",
  );
  assert.equal(conversation.contextType, 'MARKETPLACE');
  assert.equal(conversation.targetUserId, '22222222-2222-4222-8222-222222222222');
  assert.equal(conversation.contextId, '11111111-1111-4111-8111-111111111111');
  await evaluate(
    "[...document.querySelectorAll('.cc-listing-secondary-actions button')].find(button=>button.textContent.trim()==='Report').click()",
  );
  await settle();
  await shot('390-light-report');
  await evaluate('document.querySelector("[role=dialog] form").requestSubmit()');
  await waitFor(
    "document.querySelector('[role=dialog] [role=status]')?.textContent.includes('Thank you')",
  );
  const report = await evaluate(
    "window.__qaCalls.find(call=>call.path==='/api/moderation/reports').body",
  );
  assert.equal(report.targetType, 'MARKETPLACE');
  assert.equal('reporterId' in report, false);
  console.log(
    'Gallery selection/keyboard/lightbox, save rollback, sharing, contact and reporting PASS',
  );
  for (const scenario of [
    'single',
    'empty',
    'failed',
    'fallback',
    'sold',
    'owner',
    'owner-sold',
    'long',
    'loading',
    'unavailable',
    'error',
    'contact-error',
    'owner-error',
  ]) {
    await load(scenario, 390, 844, scenario === 'sold' ? 'dark' : 'light');
    if (scenario === 'failed')
      await waitFor(
        "document.querySelector('.cc-listing-photo-empty strong')?.textContent==='Photos unavailable'",
      );
    if (scenario === 'fallback')
      await waitFor(
        "document.querySelector('.cc-listing-photo img')?.src.endsWith('/qa-landscape.svg') && document.querySelector('.cc-listing-image-count')?.textContent.includes('/ 3')",
      );
    if (scenario === 'single') {
      assert.equal(
        await evaluate("document.querySelectorAll('.cc-listing-thumbnails button').length"),
        0,
      );
    }
    if (scenario === 'empty')
      assert.equal(
        await evaluate("document.querySelector('.cc-listing-photo-empty strong').textContent"),
        'No photos added',
      );
    if (['sold', 'owner-sold'].includes(scenario))
      assert.equal(await evaluate('!!document.querySelector(".cc-listing-contact")'), false);
    if (scenario === 'owner') {
      assert.equal(
        await evaluate(
          "document.querySelector('.cc-listing-owner-actions a').getAttribute('href')",
        ),
        '/marketplace/11111111-1111-4111-8111-111111111111/edit',
      );
      assert.equal(
        await evaluate("document.querySelectorAll('.cc-listing-secondary-actions button').length"),
        2,
      );
      await shot('390-light-owner');
      await evaluate(
        "[...document.querySelectorAll('.cc-listing-owner-actions button')].find(b=>b.textContent==='Mark as sold').click()",
      );
      await waitFor("document.querySelector('.cc-listing-status')?.textContent==='Sold'");
      assert.equal(
        await evaluate('!!document.querySelector(".cc-listing-owner-actions a")'),
        false,
      );
      assert.equal(
        await evaluate("window.__qaCalls.filter(call=>call.method==='PATCH').length"),
        1,
      );
      await evaluate(
        "[...document.querySelectorAll('.cc-listing-owner-actions button')].find(b=>b.textContent==='Archive listing').click()",
      );
      await settle();
      await shot('390-light-archive-confirm');
      await evaluate(
        "[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Archive listing').click()",
      );
      await waitFor("window.__qaNavigation==='/marketplace'");
      assert.equal(
        await evaluate("window.__qaCalls.filter(call=>call.method==='DELETE').length"),
        1,
      );
    }
    if (scenario === 'contact-error') {
      await evaluate('document.querySelector(".cc-listing-contact").click()');
      await waitFor(
        "document.querySelector('.cc-listing-error')?.textContent.includes('Conversation could not')",
      );
      assert.equal(await evaluate('window.__qaNavigation'), null);
    }
    if (scenario === 'owner-error') {
      await evaluate(
        "[...document.querySelectorAll('.cc-listing-owner-actions button')].find(b=>b.textContent==='Mark as sold').click()",
      );
      await waitFor(
        "document.querySelector('.cc-listing-error')?.textContent.includes('could not be updated')",
      );
      assert.equal(
        await evaluate("document.querySelector('.cc-listing-status').textContent"),
        'Available',
      );
    }
    if (scenario === 'error') {
      await evaluate(
        "[...document.querySelectorAll('button')].find(b=>b.textContent==='Retry listing').click()",
      );
      await waitFor("window.__qaCalls.filter(call=>call.method==='GET').length===2");
    }
    if (scenario === 'unavailable')
      assert.ok(!(await evaluate('document.body.innerText')).includes('QA Student'));
    await shot('390-' + scenario);
    assert.equal(await evaluate('window.__qaNetwork'), 0);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    console.log(scenario + ': state PASS');
  }
  await load('long', 320, 568, 'dark');
  assert.ok(
    await evaluate(
      "document.querySelector('.cc-listing-about p').textContent.includes('[campusconnect-examiner-demo-v1]')",
    ),
    'Persisted description marker remains literal',
  );
  await shot('320-dark-long');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await evaluate('window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"})');
  await shot('320-dark-bottom');
  assert.equal(
    await evaluate(
      `(() => {const r=document.querySelector('.cc-listing-related').getBoundingClientRect();return r.bottom<=innerHeight-80 && r.top>=0;})()`,
    ),
    true,
    'Last action clears mobile navigation allowance',
  );
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.ok(await evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'));
  await send('Emulation.setEmulatedMedia', { features: [] });
  assert.deepEqual(runtimeErrors, [], 'No uncaught browser JavaScript errors');
  await writeFile(join(output, 'verified-detail-results.json'), JSON.stringify(reports, null, 2));
  console.log(
    'Detail QA complete: ' +
      reports.length +
      ' viewport/theme cases, 13 lifecycle/error scenarios and gallery/action interactions PASS',
  );
} finally {
  if (socket?.readyState === WebSocket.OPEN && closeBrowser) await closeBrowser().catch(() => {});
  socket?.close();
  browser.kill();
  server.close();
}
