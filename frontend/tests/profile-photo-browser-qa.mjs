/** Actual UI and client; API/S3 transport and images are SYNTHETIC. No provider access. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { openChromeFixture } from './chrome-fixture-driver.mjs';
const output = process.argv[2],
  results = [];
const crc = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let n = 0; n < 8; n++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (name, data) => {
  const b = Buffer.alloc(data.length + 12);
  b.writeUInt32BE(data.length);
  b.write(name, 4);
  data.copy(b, 8);
  b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length);
  return b;
};
const h = Buffer.alloc(13);
h.writeUInt32BE(64);
h.writeUInt32BE(64, 4);
h[8] = 8;
h[9] = 6;
const pixels = Buffer.alloc(257 * 64);
for (let y = 0; y < 64; y++)
  for (let x = 0; x < 64; x++) {
    const i = y * 257 + 1 + x * 4;
    pixels[i] = 90;
    pixels[i + 1] = 65 + x;
    pixels[i + 2] = 180 + y;
    pixels[i + 3] = 255;
  }
const picture = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', h),
  chunk('IDAT', deflateSync(pixels)),
  chunk('IEND', Buffer.alloc(0)),
]).toString('base64');
const b = await openChromeFixture(output, { syntheticImage: () => picture });
const click = (text) =>
  b.evaluate(
    `(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.getClientRects().length);if(!e)throw Error('Missing control');e.click();})()`,
  );
const load = async (width, theme, scenario = 'photo-ready') => {
  await b.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: width === 440 ? 956 : width === 320 ? 640 : width < 768 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await b.send('Page.navigate', { url: b.origin + '/' + theme + '.html?case=' + scenario });
  await b.waitFor('Boolean(document.querySelector(".sp-identity"))');
  await b.evaluate(
    '(()=>{const trigger=[...document.querySelectorAll("button")].find(e=>e.getAttribute("aria-label")==="Change profile photo");trigger.focus();trigger.click();})()',
  );
  await b.waitFor('Boolean(document.querySelector("dialog[open]"))');
  await b.waitFor(
    '!document.querySelector("dialog").innerText.includes("Checking photo saving availability")',
  );
};
const choose = () =>
  b.evaluate(
    `(async()=>{const c=document.createElement('canvas');c.width=900;c.height=600;const g=c.getContext('2d');g.fillStyle='#c6b9f6';g.fillRect(0,0,900,600);g.fillStyle='#5145ce';g.fillRect(120,80,300,400);g.fillStyle='#b4eeed';g.beginPath();g.arc(600,280,180,0,Math.PI*2);g.fill();g.fillStyle='#182139';g.font='36px sans-serif';g.fillText('SYNTHETIC PHOTO QA',160,550);const blob=await new Promise(r=>c.toBlob(r,'image/png'));const data=new DataTransfer();data.items.add(new File([blob],'synthetic-photo.png',{type:'image/png'}));const input=document.querySelector('dialog input[type=file]');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
try {
  for (const [width, theme] of [
    [1440, 'light'],
    [1440, 'dark'],
    [440, 'light'],
    [440, 'dark'],
    [390, 'light'],
    [390, 'dark'],
    [320, 'light'],
    [320, 'dark'],
  ]) {
    await load(width, theme);
    await choose();
    await b.waitFor('Boolean(document.querySelector("dialog canvas"))');
    await b.settle();
    assert.equal(await b.evaluate('document.documentElement.scrollWidth>innerWidth'), false);
    assert.equal(
      await b.evaluate(
        '(()=>{const e=document.querySelector(".cc-photo-main");return e.scrollWidth>e.clientWidth+1})()',
      ),
      false,
    );
    assert.equal(
      await b.evaluate(
        '(()=>{const r=[...document.querySelectorAll("dialog footer button")].find(e=>e.textContent==="Save photo").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()',
      ),
      true,
    );
    assert.equal(
      await b.evaluate(
        '[...document.querySelectorAll("dialog button")].find(e=>e.textContent==="Save photo").disabled',
      ),
      false,
    );
    await b.screenshot('photo-SYNTHETIC-' + width + '-' + theme + '-crop');
    const before = await b.evaluate('document.querySelector("dialog canvas").toDataURL()');
    await b.evaluate(
      `(()=>{const e=document.querySelector('input[type=range]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2');e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await b.settle();
    assert.notEqual(
      await b.evaluate('document.querySelector("dialog canvas").toDataURL()'),
      before,
    );
    assert.equal(
      await b.evaluate('document.querySelectorAll("dialog input[type=range]").length'),
      1,
    );
    assert.equal(
      await b.evaluate('document.querySelector("dialog input[type=file]").hidden'),
      true,
    );
    assert.equal(
      await b.evaluate(
        'Boolean([...document.querySelectorAll("dialog button")].find(e=>e.textContent==="Change Photo"))',
      ),
      true,
    );
    await b.evaluate(
      'document.querySelector(".cc-photo-preview").scrollIntoView({block:"center"})',
    );
    const area = await b.evaluate(
      '(()=>{const r=document.querySelector(".cc-photo-preview").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()',
    );
    await b.screenshot('photo-SYNTHETIC-' + width + '-' + theme + '-zoom-200');
    const zoomed = await b.evaluate('document.querySelector("dialog canvas").toDataURL()');
    if (width < 768) {
      await b.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await b.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: area.x, y: area.y, id: 1 }],
      });
      await b.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: area.x + 25, y: area.y + 15, id: 1 }],
      });
      await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await b.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: area.x,
        y: area.y,
        button: 'left',
        clickCount: 1,
      });
      await b.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: area.x + 25,
        y: area.y + 15,
        button: 'left',
        buttons: 1,
      });
      await b.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: area.x + 25,
        y: area.y + 15,
        button: 'left',
        clickCount: 1,
      });
    }
    await b.settle();
    const dragged = await b.evaluate('document.querySelector("dialog canvas").toDataURL()');
    assert.notEqual(dragged, zoomed, 'Actual mouse/touch drag changes exported crop pixels');
    await b.evaluate('document.querySelector(".cc-photo-preview").focus()');
    await b.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'ArrowLeft',
      code: 'ArrowLeft',
      windowsVirtualKeyCode: 37,
    });
    await b.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'ArrowLeft',
      code: 'ArrowLeft',
      windowsVirtualKeyCode: 37,
    });
    await b.settle();
    assert.notEqual(
      await b.evaluate('document.querySelector("dialog canvas").toDataURL()'),
      dragged,
      'Keyboard positioning changes crop',
    );
    await b.evaluate(`document.querySelector('[aria-label="Zoom out"]').click()`);
    await b.settle();
    assert.equal(
      await b.evaluate('document.querySelector("dialog input[type=range]").value'),
      '1.9',
    );
    await b.evaluate(`document.querySelector('[aria-label="Zoom in"]').click()`);
    await b.settle();
    assert.equal(await b.evaluate('document.querySelector("dialog input[type=range]").value'), '2');
    for (let i = 0; i < 25; i++)
      await b.evaluate(`document.querySelector('[aria-label="Zoom in"]').click()`);
    await b.settle();
    assert.equal(await b.evaluate('document.querySelector("dialog input[type=range]").value'), '3');
    assert.equal(
      await b.evaluate(`document.querySelector('[aria-label="Zoom in"]').disabled`),
      true,
    );
    await click('Reset Crop');
    await b.settle();
    assert.equal(await b.evaluate('document.querySelector("dialog input[type=range]").value'), '1');
    assert.equal(
      await b.evaluate(`document.querySelector('[aria-label="Zoom out"]').disabled`),
      true,
    );
    assert.equal(
      await b.evaluate('document.querySelector("dialog canvas").toDataURL()'),
      before,
      'Reset restores original crop',
    );
    for (let i = 0; i < 15; i++)
      await b.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      });
    assert.equal(
      await b.evaluate('document.querySelector("dialog").contains(document.activeElement)'),
      true,
    );
    await click('Save photo');
    await b.waitFor('!document.querySelector("dialog[open]")');
    await b.waitFor('Boolean(document.querySelector(".sp-identity img"))');
    await b.waitFor('document.querySelector(".sp-identity img").complete');
    assert.ok((await b.evaluate('window.__qaPhotoBlob.size')) > 0);
    assert.equal(await b.evaluate('window.__qaPhotoBlob.type'), 'image/png');
    assert.equal(await b.evaluate('document.querySelector(".sp-identity img").naturalWidth'), 64);
    assert.equal(
      await b.evaluate('document.querySelectorAll(".cc-shell-avatar img").length>0'),
      true,
    );
    await b.screenshot('photo-SYNTHETIC-' + width + '-' + theme + '-saved');
    await b.evaluate(
      '(()=>{const trigger=[...document.querySelectorAll("button")].find(e=>e.getAttribute("aria-label")==="Change profile photo");trigger.focus();trigger.click();})()',
    );
    await b.waitFor(
      'Boolean([...document.querySelectorAll("dialog button")].find(e=>e.textContent==="Remove photo"&&!e.disabled))',
    );
    await b.screenshot('photo-SYNTHETIC-' + width + '-' + theme + '-saved-actions');
    await click('Remove photo');
    await b.waitFor('!document.querySelector("dialog[open]")');
    assert.equal(await b.evaluate('Boolean(document.querySelector(".sp-identity img"))'), false);
    results.push({
      width,
      theme,
      crop: 'PASS',
      pointer: width < 768 ? 'TOUCH PASS' : 'MOUSE PASS',
      keyboardPositioning: 'PASS',
      zoomLimitsAndReset: 'PASS',
      keyboard: 'PASS',
      mockedSaveAndRemove: 'PASS',
      overflow: false,
    });
  }
  // Equivalent layout viewport at 200% of a 390x844 display, not a claim of native browser zoom.
  await load(195, 'light');
  await b.send('Emulation.setDeviceMetricsOverride', {
    width: 195,
    height: 422,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await choose();
  await b.waitFor('Boolean(document.querySelector("dialog canvas"))');
  await b.settle();
  const backgroundOverflowAt195 = await b.evaluate(
    'document.documentElement.scrollWidth>innerWidth',
  );
  await b.screenshot('photo-SYNTHETIC-200-percent-equivalent-reflow');
  assert.equal(
    await b.evaluate(
      '(()=>{const r=document.querySelector("dialog").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})()',
    ),
    true,
  );
  assert.equal(
    await b.evaluate(
      '(()=>{const d=document.querySelector("dialog");return d.scrollWidth>d.clientWidth+1})()',
    ),
    false,
  );
  assert.equal(
    await b.evaluate(
      '(()=>{const r=[...document.querySelectorAll("dialog footer button")].find(e=>e.textContent==="Save photo").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()',
    ),
    true,
  );
  await b.screenshot('photo-SYNTHETIC-200-percent-equivalent-reflow');
  await click('Cancel');
  for (const [width, theme] of [
    [1440, 'light'],
    [1440, 'dark'],
    [440, 'light'],
    [440, 'dark'],
    [390, 'light'],
    [390, 'dark'],
    [320, 'light'],
    [320, 'dark'],
  ]) {
    await load(width, theme, 'photo-disabled');
    await b.evaluate(
      `(()=>{window.__qaPickerOpened=0;document.querySelector('dialog input[type=file]').addEventListener('click',e=>{e.preventDefault();window.__qaPickerOpened++})})()`,
    );
    await click('Choose Photo');
    assert.equal(await b.evaluate('window.__qaPickerOpened'), 1);
    await choose();
    await b.waitFor('Boolean(document.querySelector("dialog canvas"))');
    await b.settle();
    const disabled = await b.evaluate(
      `(()=>{const e=[...document.querySelectorAll('dialog button')].find(e=>e.textContent==='Save photo');const s=getComputedStyle(e);return {disabled:e.hasAttribute('disabled'),cursor:s.cursor,opacity:Number(s.opacity),background:s.backgroundColor,primary:getComputedStyle(document.documentElement).getPropertyValue('--cc-primary')};})()`,
    );
    assert.equal(disabled.disabled, true);
    assert.equal(await b.evaluate('document.querySelector("dialog").matches(":modal")'), true);
    assert.equal(
      await b.evaluate('document.querySelector("dialog [role=status]").textContent.trim()'),
      'Photo saving is not available yet.',
    );
    assert.equal(
      await b.evaluate('document.querySelector(".cc-photo-position-help").textContent.trim()'),
      'Drag to reposition \u00b7 Use arrow keys for precision',
    );
    assert.equal(disabled.cursor, 'not-allowed');
    assert.ok(disabled.opacity < 1);
    await click('Save photo');
    assert.equal(
      await b.evaluate(
        'window.__qaCalls.some(c=>c.path.endsWith("/uploads")||c.path.endsWith("/uploads/complete"))',
      ),
      false,
    );
    assert.equal(
      await b.evaluate('document.body.innerText.includes("Profile photo updated.")'),
      false,
    );
    assert.equal(
      await b.evaluate(
        'Boolean([...document.querySelectorAll("dialog button")].find(e=>e.textContent==="Remove photo"))',
      ),
      false,
    );
    if (width === 320)
      await b.screenshot('photo-SYNTHETIC-' + width + '-' + theme + '-storage-disabled-top');
    const backgroundY = await b.evaluate('window.scrollY');
    await b.evaluate('document.querySelector(".cc-photo-main").scrollTop=9999');
    assert.equal(await b.evaluate('window.scrollY'), backgroundY);
    assert.equal(await b.evaluate('document.body.style.overflow'), 'hidden');
    assert.equal(
      await b.evaluate(
        '(()=>{const d=document.querySelector("dialog"),m=document.querySelector(".cc-photo-main");return d.scrollWidth<=d.clientWidth+1&&m.scrollWidth<=m.clientWidth+1})()',
      ),
      true,
    );
    assert.equal(
      await b.evaluate(
        '(()=>{const r=document.querySelector("dialog footer").getBoundingClientRect();const nav=document.querySelector(".cc-mobile-nav");return r.top>=0&&r.bottom<=innerHeight})()',
      ),
      true,
    );
    if (width < 768)
      assert.equal(
        await b.evaluate(
          'document.querySelector("dialog").getBoundingClientRect().bottom<=document.querySelector(".cc-mobile-nav").getBoundingClientRect().top',
        ),
        true,
      );
    await b.screenshot('photo-SYNTHETIC-' + width + '-' + theme + '-storage-disabled');
    await click('Reset Crop');
    await click('Change Photo');
    assert.equal(await b.evaluate('window.__qaPickerOpened'), 2);
    const snapshot = await b.evaluate('document.querySelector("dialog canvas").toDataURL()');
    await b.evaluate(
      `(()=>{const e=document.querySelector('dialog input[type=range]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2');e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await choose();
    await b.settle();
    assert.equal(await b.evaluate('document.querySelector("dialog canvas").toDataURL()'), snapshot);
    await click('Close');
    await b.waitFor('!document.querySelector("dialog[open]")');
    assert.equal(
      await b.evaluate('document.activeElement?.getAttribute("aria-label")'),
      'Change profile photo',
    );
  }
  await load(390, 'light', 'photo-disabled');
  await choose();
  await b.waitFor('Boolean(document.querySelector("dialog canvas"))');
  assert.equal(
    await b.evaluate(
      '[...document.querySelectorAll("dialog button")].find(e=>e.textContent==="Save photo").disabled',
    ),
    true,
  );
  assert.equal(await b.evaluate('window.__qaCalls.some(c=>c.path.endsWith("/uploads"))'), false);
  await b.screenshot('photo-SYNTHETIC-disabled-preview');
  await click('Cancel');
  await load(390, 'dark');
  await choose();
  await b.waitFor('Boolean(document.querySelector("dialog canvas"))');
  await b.evaluate('window.__qaPhotoFail="complete"');
  await click('Save photo');
  await b.waitFor('Boolean(document.querySelector("dialog [role=alert]"))');
  assert.equal(await b.evaluate('Boolean(document.querySelector(".sp-identity img"))'), false);
  await b.screenshot('photo-SYNTHETIC-save-error');
  await click('Cancel');
  await load(390, 'light');
  await choose();
  await b.waitFor('Boolean(document.querySelector("dialog canvas"))');
  await b.evaluate('window.__qaPhotoHoldUpload=true');
  await click('Save photo');
  await b.waitFor('Boolean(document.querySelector("dialog progress"))');
  await b.screenshot('photo-SYNTHETIC-upload-progress');
  await click('Cancel');
  await b.waitFor('!document.querySelector("dialog[open]")');
  assert.equal(
    await b.evaluate('window.__qaCalls.some(c=>c.path.endsWith("/uploads/complete"))'),
    false,
  );
  assert.equal(
    await b.evaluate('document.activeElement?.getAttribute("aria-label")'),
    'Change profile photo',
  );
  await load(320, 'dark');
  await b.evaluate(
    `(()=>{const d=new DataTransfer();d.items.add(new File(['<svg/>'],'fake.png',{type:'image/png'}));const e=document.querySelector('dialog input[type=file]');e.files=d.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await b.waitFor('Boolean(document.querySelector("dialog [role=alert]"))');
  assert.equal(
    await b.evaluate(
      '[...document.querySelectorAll("dialog button")].find(e=>e.textContent==="Save photo").disabled',
    ),
    true,
  );
  await b.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await b.waitFor('!document.querySelector("dialog[open]")');
  assert.deepEqual(b.errors, []);
  await writeFile(
    join(output, 'photo-results.json'),
    JSON.stringify(
      {
        evidence:
          'SYNTHETIC API/S3 transport and photos; actual components/client/browser canvas. No real AWS/Supabase/data writes.',
        results,
        disabledPreview:
          'PASS at all eight requested viewport/theme combinations; actual disabled attribute and styling, no upload/no success',
        failureNoFalseSuccess: 'PASS',
        uploadCancel: 'PASS',
        invalidImage: 'PASS',
        focusRestoration: 'PASS',
        reflow200PercentEquivalent: 'Editor checked; native browser zoom not exercised',
        inheritedBackgroundOverflowAt195: backgroundOverflowAt195,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS photo Chrome QA: 8 viewport/theme cases, crop/keyboard/mock save/remove, disabled preview, failure, cancellation, validation and focus.',
  );
} finally {
  await b.close();
}
