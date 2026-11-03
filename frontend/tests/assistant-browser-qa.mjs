/** Actual Assistant, AppShell, API client and Express orchestration. Synthetic identity/repository/provider only. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { openChromeFixture } from './chrome-fixture-driver.mjs';

const output = process.argv[2];
if (!output) throw Error('Supply an external evidence directory.');
await mkdir(output, { recursive: true });
const env = {
  ...process.env,
  NODE_ENV: 'test',
  DOTENV_CONFIG_PATH: 'NUL',
  DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
  AI_SERVICE_ENABLED: 'false',
  AWS_EC2_METADATA_DISABLED: 'true',
};
for (const name of Object.keys(env))
  if (
    /^(SUPABASE|DIRECT_URL|PG|PROFILE_PHOTO|PROFILE_PROFESSIONAL|AWS_ACCESS|AWS_SECRET|.*TEST_DATABASE_URL)/.test(
      name,
    )
  )
    delete env[name];
const child = spawn(
  process.execPath,
  ['node_modules/tsx/dist/cli.mjs', 'backend/tests/assistant-demo-server.ts'],
  { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
const port = await new Promise((done, reject) => {
  const timeout = setTimeout(() => reject(Error('Synthetic API startup timeout')), 15000);
  child.stdout.on('data', (data) => {
    const match = /SYNTHETIC_ASSISTANT_PORT=(\d+)/.exec(data.toString());
    if (match) {
      clearTimeout(timeout);
      done(Number(match[1]));
    }
  });
  child.once('exit', (code) => {
    clearTimeout(timeout);
    reject(Error('Synthetic API exit ' + code));
  });
});
const css = (await readdir('frontend/dist/assets')).find(
  (n) => n.startsWith('index-') && n.endsWith('.css'),
);
const bundle = await build({
  stdin: {
    sourcefile: 'assistant-qa.tsx',
    resolveDir: resolve('frontend'),
    loader: 'tsx',
    contents: `
import {createRoot} from 'react-dom/client';import {useEffect} from 'react';import {MemoryRouter,Routes,Route,useNavigate} from 'react-router-dom';
import {AppShell} from './src/app/AppShell';import {AIAssistantPage} from './src/features/ai/AIAssistantPage';import {ThemeProvider} from './src/features/theme/ThemeProvider';
window.__qaToken='synthetic-qa-token-'+crypto.randomUUID();window.__qaCalls=[];const originalFetch=window.fetch.bind(window);
window.fetch=async(url,init)=>{if(!String(url).startsWith('http://127.0.0.1:${port}/'))throw Error('External fixture request blocked');window.__qaCalls.push(JSON.parse(init.body||'{}'));if(window.__qaDelay)await new Promise(r=>setTimeout(r,500));return originalFetch(url,init);};
localStorage.setItem('campusconnect-theme',document.documentElement.dataset.theme);
function QAHistory(){const navigate=useNavigate();useEffect(()=>{window.__qaNavigate=navigate;},[navigate]);return null;}
createRoot(document.querySelector('#fixture-root')).render(<ThemeProvider><MemoryRouter initialEntries={['/assistant']}><QAHistory/><Routes><Route element={<AppShell/>}><Route path="/assistant" element={<AIAssistantPage/>}/><Route path="*" element={<p>QA destination reached</p>}/></Route></Routes></MemoryRouter></ThemeProvider>);`,
  },
  bundle: true,
  jsx: 'automatic',
  platform: 'browser',
  format: 'esm',
  write: false,
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'synthetic-boundaries',
      setup(b) {
        const modules = {
          'auth/useAuth': 'auth',
          'admin/admin-service': 'admin',
          'notifications-service': 'notifications',
          'lib/supabase': 'supabase',
          'config/env': 'env',
        };
        for (const [suffix, path] of Object.entries(modules))
          b.onResolve({ filter: new RegExp(suffix + '$') }, () => ({ path, namespace: 'qa' }));
        b.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'qa' }));
        b.onLoad({ filter: /.*/, namespace: 'qa' }, ({ path }) => ({
          loader: 'js',
          resolveDir: resolve('frontend'),
          contents:
            path === 'css'
              ? ''
              : path === 'auth'
                ? `import {useSyncExternalStore} from 'react';export const useAuth=()=>{const id=useSyncExternalStore(callback=>{window.addEventListener('qa-account',callback);return()=>window.removeEventListener('qa-account',callback)},()=>window.__qaAccount||'synthetic-user');return({applicationUser:{id,role:'STUDENT',status:'ACTIVE',email:'qa@example.test',profile:{displayName:'Synthetic Student'}},logout:async()=>{}});};`
                : path === 'supabase'
                  ? `export const getSupabaseClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:window.__qaToken}}}),signOut:async()=>{}}});`
                  : path === 'env'
                    ? `export const frontendEnv={apiBaseUrl:'http://127.0.0.1:${port}',authConfigured:false};`
                    : path === 'admin'
                      ? `export const adminApi={access:async()=>{throw Error('Synthetic admin denial')}};`
                      : `export const notificationsChangedEvent='qa-notifications';export const announceNotificationsChanged=()=>{};export const mergeNotifications=(a,b)=>[b,...a];export const notificationActionState=()=>({});export const notificationsService={list:async()=>({notifications:[],pagination:{total:0}}),count:async()=>0};export const connectNotificationSocket=async()=>({disconnect(){}});`,
        }));
      },
    },
  ],
});
await writeFile(join(output, 'fixture.js'), bundle.outputFiles[0].text);
const scoped = await readFile('frontend/src/features/ai/assistant.css', 'utf8');
for (const theme of ['light', 'dark'])
  await writeFile(
    join(output, theme + '.html'),
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic Assistant QA</title><link rel="stylesheet" href="/assets/${css}"><style>${scoped}</style></head><body><div id="fixture-root"></div><script type="module" src="/fixture.js"></script></body></html>`,
  );
const b = await openChromeFixture(output),
  results = [];
const click = (text) =>
  b.evaluate(
    `(()=>{const e=[...document.querySelectorAll('button')].find(e=>(e.textContent.trim()===${JSON.stringify(text)}||e.getAttribute('aria-label')===${JSON.stringify(text)})&&e.getClientRects().length);if(!e)throw Error('Missing '+${JSON.stringify(text)});e.click();})()`,
  );
const ask = async (text) => {
  await b.evaluate(
    `(()=>{const e=document.querySelector('.campus-assistant textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await b.evaluate(`document.querySelector('.campus-assistant form').requestSubmit()`);
  await b.waitFor(`!document.querySelector('.campus-assistant textarea').disabled`);
};
if (process.env.ASSISTANT_GEOMETRY_PHASE) {
  const phase = process.env.ASSISTANT_GEOMETRY_PHASE,
    geometry = [];
  try {
    for (const [width, height] of [
      [1536, 864],
      [1440, 900],
      [1366, 768],
      [1280, 720],
      [1280, 600],
      [440, 956],
      [390, 844],
      [320, 640],
    ])
      for (const theme of ['light', 'dark']) {
        await b.send('Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: 1,
          mobile: width < 768,
        });
        await b.send('Page.navigate', { url: b.origin + '/' + theme + '.html' });
        await b.waitFor(`Boolean(document.querySelector('.campus-assistant textarea'))`);
        await b.evaluate('document.fonts.ready');
        await b.settle();
        const measure = async (state) => {
          const result = await b.evaluate(
            `(()=>{const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {top:r.top,bottom:r.bottom,height:r.height,width:r.width,client:e.clientHeight,scroll:e.scrollHeight,overflow:s.overflowY,paddingBottom:s.paddingBottom}};const workspace=document.querySelector('.cc-chat-workspace'),panel=document.querySelector('.cc-chat-scroll'),sidebar=document.querySelector('.cc-chat-workspace aside'),composer=document.querySelector('.campus-assistant form'),last=[...document.querySelectorAll('.cc-message-bubble')].at(-1);return {innerHeight,innerWidth,documentHeight:document.documentElement.scrollHeight,documentClient:document.documentElement.clientHeight,pageY:scrollY,documentScroll:document.documentElement.scrollHeight>innerHeight+1,shell:rect(document.querySelector('.cc-app-shell')),main:rect(document.querySelector('main')),page:rect(document.querySelector('.campus-assistant')),header:rect(document.querySelector('.cc-top-nav')),workspace:rect(workspace),sidebar:rect(sidebar),history:rect(panel),composer:rect(composer),last:rect(last),verticalScrollContainers:[...document.querySelectorAll('body *')].filter(e=>e.getClientRects().length && /auto|scroll/.test(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+1).map(e=>({tag:e.tagName,classes:e.className,client:e.clientHeight,scroll:e.scrollHeight})),horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1}})()`,
          );
          if (phase === 'after') {
            assert.equal(
              result.documentScroll,
              false,
              `${width}x${height} ${state}: outer scrolling`,
            );
            assert.equal(result.horizontalOverflow, false);
            assert.ok(result.composer.bottom <= height - (width < 768 ? 66 : 0));
            if (width >= 1024 && height >= 720)
              assert.ok(result.sidebar.scroll <= result.sidebar.client + 1);
            if (state === 'ten-messages' || state === 'long-sources') {
              assert.equal(
                result.verticalScrollContainers.filter((e) =>
                  String(e.classes).includes('cc-chat-scroll'),
                ).length,
                1,
              );
              assert.ok(result.last.bottom <= result.history.bottom + 1);
            }
          }
          geometry.push({ phase, width, height, theme, state, ...result });
          await b.screenshot(`${phase}-${width}x${height}-${theme}-${state}`);
        };
        await measure('empty');
        await ask('hi');
        await b.settle();
        await measure('two-messages');
        for (let i = 0; i < 4; i++) await ask('What is CampusConnect?');
        await b.settle();
        await measure('ten-messages');
        await ask('Show long calculators in Marketplace');
        await b.settle();
        await measure('long-sources');
      }
    await writeFile(
      join(output, phase + '-geometry.json'),
      JSON.stringify(
        {
          evidence:
            'Actual Assistant/AppShell in Chrome with synthetic identity/retrieval. CSS viewport dimensions, not browser-window dimensions.',
          geometry,
        },
        null,
        2,
      ),
    );
    console.log('PASS measured ' + phase + ' geometry');
  } finally {
    await b.close();
    child.kill();
  }
  process.exit(0);
}
try {
  for (const width of [1440, 1366, 440, 390, 320])
    for (const theme of ['light', 'dark']) {
      await b.send('Emulation.setDeviceMetricsOverride', {
        width,
        height:
          width === 1440
            ? 900
            : width === 1366
              ? 768
              : width === 440
                ? 956
                : width === 390
                  ? 844
                  : 640,
        deviceScaleFactor: 1,
        mobile: width < 768,
      });
      await b.send('Page.navigate', { url: b.origin + '/' + theme + '.html' });
      await b.waitFor(`Boolean(document.querySelector('.campus-assistant textarea'))`);
      await b.evaluate('document.fonts.ready');
      await b.screenshot(`assistant-SYNTHETIC-${width}-${theme}-welcome`);
      if (width === 1440) {
        await click('I lost my bag.');
        await b.waitFor(`!document.querySelector('.campus-assistant textarea').disabled`);
      } else await ask('My bag got lost.');
      assert.ok(
        await b.evaluate(`Boolean(document.querySelector('a[href="/lost-found/new?type=lost"]'))`),
      );
      await b.screenshot(`assistant-SYNTHETIC-${width}-${theme}-lost-guidance`);
      await ask('It was black.');
      await ask('Near the library.');
      assert.equal(
        await b.evaluate(`document.querySelectorAll('a[href="/lost-found/new?type=lost"]').length`),
        3,
      );
      await ask('Can you find similar reports?');
      assert.ok(
        await b.evaluate(`Boolean(document.querySelector('a[href="/lost-found/synthetic-bag"]'))`),
      );
      assert.equal(
        await b.evaluate(
          `Boolean(document.querySelector('a[href="/lost-found/synthetic-calculator"]'))`,
        ),
        false,
      );
      await b.screenshot(`assistant-SYNTHETIC-${width}-${theme}-lost-context`);
      await click(width === 1440 ? 'New conversation' : 'Clear conversation');
      await ask('Show calculators in Marketplace');
      assert.ok(
        await b.evaluate(
          `Boolean(document.querySelector('a[href="/marketplace/synthetic-qa-one"]'))`,
        ),
      );
      assert.ok(
        await b.evaluate(
          `document.querySelector('.campus-assistant').innerText.includes('cannot generate a summary')`,
        ),
      );
      await b.screenshot(`assistant-SYNTHETIC-${width}-${theme}-search-fallback`);
      await b.settle();
      const geometry = await b.evaluate(
        `(()=>{const r=document.querySelector('.campus-assistant textarea').getBoundingClientRect(),nav=document.querySelector('.cc-mobile-nav')?.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth+1,composerVisible:r.top>=0&&r.bottom<=(nav?.height?nav.top:innerHeight)}})()`,
      );
      assert.equal(geometry.overflow, false);
      assert.equal(geometry.composerVisible, true);
      await b.screenshot(`assistant-SYNTHETIC-${width}-${theme}-composer`);
      await ask('Show long calculators in Marketplace');
      await b.delay(100);
      assert.ok(
        await b.evaluate(
          `(()=>{const e=document.querySelector('.cc-chat-scroll');return e.scrollHeight-e.clientHeight-e.scrollTop<3})()`,
        ),
      );
      assert.equal(
        await b.evaluate(
          `[...document.querySelectorAll('.assistant-source-label')].at(-1).textContent`,
        ),
        'AI-assisted',
      );
      const scroll = await b.evaluate(
        `(()=>{const e=document.querySelector('.cc-chat-scroll'),y=scrollY;const overflow=e.scrollHeight>e.clientHeight;e.scrollTop=0;return {overflow,pageY:y,historyTop:e.scrollTop}})()`,
      );
      assert.equal(scroll.overflow, true);
      assert.equal(scroll.historyTop, 0);
      await b.waitFor(`Boolean(document.querySelector('.assistant-jump'))`);
      await click('Jump to latest');
      await b.waitFor(`!document.querySelector('.assistant-jump')`);
      assert.ok(
        await b.evaluate(
          `(()=>{const e=document.querySelector('.cc-chat-scroll');return e.scrollHeight-e.clientHeight-e.scrollTop<3})()`,
        ),
      );
      assert.equal(await b.evaluate('scrollY'), scroll.pageY);
      await b.evaluate(`document.querySelector('.cc-chat-scroll').scrollTop=100000`);
      await b.screenshot(`assistant-SYNTHETIC-${width}-${theme}-long-reply`);
      await b.evaluate(
        `(()=>{const e=document.querySelector('.cc-chat-scroll'),reply=[...document.querySelectorAll('.cc-message-bubble.rounded-bl-md')].at(-1);e.scrollTop+=reply.getBoundingClientRect().top-e.getBoundingClientRect().top-8})()`,
      );
      await b.screenshot(`assistant-SYNTHETIC-${width}-${theme}-long-reading`);
      results.push({
        width,
        theme,
        ...geometry,
        lostContext: 'PASS',
        relevantFoundReports: 'PASS',
        recordFallback: 'PASS',
        independentHistoryScroll: 'PASS',
        generatedFixtureLabel: 'PASS',
      });
    }
  await b.evaluate('window.__qaDelay=true');
  await b.evaluate(
    `(()=>{const e=document.querySelector('.campus-assistant textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'hi');e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await b.evaluate(`document.querySelector('.campus-assistant form').requestSubmit()`);
  await b.waitFor(`document.querySelector('.campus-assistant textarea').disabled`);
  await b.evaluate(`document.querySelector('.cc-chat-scroll').scrollTop=0`);
  await b.delay(40);
  const readingY = await b.evaluate('scrollY');
  await b.waitFor(`!document.querySelector('.campus-assistant textarea').disabled`);
  assert.equal(await b.evaluate(`document.querySelector('.cc-chat-scroll').scrollTop`), 0);
  assert.equal(await b.evaluate('scrollY'), readingY);
  await b.evaluate('window.__qaDelay=false');
  // Use a readable history viewport for the semantic evidence captures rather
  // than showing only the tail of a long answer at the preceding 320px case.
  await b.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await b.evaluate(`scrollTo(0,0);dispatchEvent(new Event('resize'))`);
  await b.settle();
  await click('Clear conversation');
  await ask('forgot my bottle');
  assert.ok(
    await b.evaluate(`Boolean(document.querySelector('a[href="/lost-found/synthetic-bottle"]'))`),
  );
  assert.ok(
    await b.evaluate(
      `document.querySelector('.campus-assistant').innerText.includes('Student Centre')`,
    ),
  );
  await b.screenshot('assistant-SYNTHETIC-found-bottle');
  await click('Clear conversation');
  await ask('project of 3 members');
  assert.ok(
    await b.evaluate(
      `document.querySelector('.campus-assistant').innerText.includes('maximum total')`,
    ),
  );
  await click('Clear conversation');
  await ask('project of 4 teammates');
  assert.ok(
    await b.evaluate(
      `document.querySelector('.campus-assistant').innerText.includes('maximum total')`,
    ),
  );
  assert.equal(await b.evaluate(`document.querySelectorAll('.assistant-record-link').length`), 0);
  await b.screenshot('assistant-SYNTHETIC-team-size-clarification');
  await click('Clear conversation');
  await ask('project with total team size 4');
  assert.ok(
    await b.evaluate(`Boolean(document.querySelector('a[href="/teamup/synthetic-project"]'))`),
  );
  await b.screenshot('assistant-SYNTHETIC-team-size-qualified');
  await click('Clear conversation');
  await ask('project with total team size 4 unknown');
  assert.ok(
    await b.evaluate(
      `document.querySelector('.campus-assistant').innerText.includes('do not establish')`,
    ),
  );
  await b.screenshot('assistant-SYNTHETIC-team-size-unknown');
  await b.evaluate(`window.__qaToken='synthetic-qa-token-'+crypto.randomUUID()`);
  await click('Clear conversation');
  await ask('Show failure calculators');
  assert.ok(
    await b.evaluate(
      `document.querySelector('.campus-assistant').innerText.includes('could not retrieve the live')`,
    ),
  );
  const before = await b.evaluate('window.__qaCalls.length');
  await click('Retry');
  await b.waitFor(
    `window.__qaCalls.length===${before + 1}&&!document.querySelector('.campus-assistant textarea').disabled`,
  );
  assert.equal(
    await b.evaluate(`document.querySelectorAll('.cc-message-bubble.rounded-br-md').length`),
    1,
  );
  await b.screenshot('assistant-SYNTHETIC-retrieval-failure-retry');
  await click('Clear conversation');
  await ask('Show empty calculators');
  await b.screenshot('assistant-SYNTHETIC-empty-state');

  assert.ok(
    await b.evaluate(
      `document.querySelector('.campus-assistant').innerText.includes('No matching records')`,
    ),
  );
  await click('Clear conversation');
  await ask('Show slow calculators');
  assert.ok(
    await b.evaluate(
      `document.querySelector('.campus-assistant').innerText.includes('took too long')`,
    ),
  );
  await click('Clear conversation');
  await b.evaluate('window.__qaDelay=true');
  const rapidBefore = await b.evaluate('window.__qaCalls.length');
  await b.evaluate(
    `(()=>{const e=document.querySelector('.campus-assistant textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'I lost my bag.');e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await b.evaluate(
    `document.querySelector('.campus-assistant form').requestSubmit();document.querySelector('.campus-assistant form').requestSubmit()`,
  );
  await b.waitFor(`document.querySelector('.campus-assistant textarea').disabled`);
  assert.equal(await b.evaluate('window.__qaCalls.length'), rapidBefore + 1);
  await click('Clear conversation');
  await b.delay(700);
  assert.equal(await b.evaluate(`document.querySelectorAll('.cc-message-bubble').length`), 0);
  await b.evaluate('window.__qaDelay=false');
  await ask('Near the library.');
  assert.equal(
    await b.evaluate(`Boolean(document.querySelector('a[href="/lost-found/new?type=lost"]'))`),
    false,
  );
  await click('Clear conversation');
  await ask('How can I find project teammates?');
  await b.screenshot('assistant-SYNTHETIC-teamup');
  await b.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await click('Clear conversation');
  await b.evaluate(`document.querySelector('.campus-assistant textarea').focus()`);
  await b.send('Input.insertText', { text: 'hi' });
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' });
  await b.waitFor(`document.querySelector('.campus-assistant').innerText.includes('Hello!')`);
  await b.evaluate(`document.querySelector('.campus-assistant textarea').focus()`);
  await b.send('Input.insertText', { text: 'first line' });
  const keyboardBefore = await b.evaluate('window.__qaCalls.length');
  await b.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    modifiers: 8,
    text: '\r',
  });
  assert.equal(await b.evaluate('window.__qaCalls.length'), keyboardBefore);
  assert.equal(
    await b.evaluate(
      `document.querySelector('.campus-assistant textarea').value.includes(String.fromCharCode(10))`,
    ),
    true,
  );
  await click('Clear conversation');
  await b.evaluate(`window.__qaSavedToken=window.__qaToken;window.__qaToken=''`);
  await ask('hi');
  assert.ok(
    await b.evaluate(
      `document.querySelector('.campus-assistant').innerText.includes('session has expired')`,
    ),
  );
  assert.equal(
    await b.evaluate(
      `[...document.querySelectorAll('.campus-assistant button')].some(e=>e.textContent.trim()==='Retry')`,
    ),
    false,
  );
  await b.evaluate('window.__qaToken=window.__qaSavedToken');
  await click('Clear conversation');
  await b.evaluate('window.__qaDelay=true');
  await b.evaluate(
    `(()=>{const e=document.querySelector('.campus-assistant textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'My bag got lost.');e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await b.evaluate(`document.querySelector('.campus-assistant form').requestSubmit()`);
  await b.waitFor(`document.querySelector('.campus-assistant textarea').disabled`);
  await b.evaluate(
    `window.__qaAccount='another-synthetic-account';window.__qaToken='synthetic-qa-token-'+crypto.randomUUID();window.dispatchEvent(new Event('qa-account'))`,
  );
  await b.waitFor(`!document.querySelector('.campus-assistant textarea').disabled`);
  await b.delay(650);
  assert.equal(await b.evaluate(`document.querySelectorAll('.cc-message-bubble').length`), 0);
  await b.evaluate('window.__qaDelay=false');
  await ask('Near the library.');
  assert.deepEqual(await b.evaluate('window.__qaCalls.at(-1).history'), []);
  await click('Clear conversation');
  await b.evaluate('window.__qaDelay=true');
  await b.evaluate(
    `(()=>{const e=document.querySelector('.campus-assistant textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'I lost my bag.');e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await b.evaluate(`document.querySelector('.campus-assistant form').requestSubmit()`);
  await b.waitFor(`document.querySelector('.campus-assistant textarea').disabled`);
  await b.evaluate(`window.__qaNavigate('/home')`);
  await b.delay(650);
  await b.evaluate(`window.__qaNavigate('/assistant')`);
  await b.waitFor(`Boolean(document.querySelector('.campus-assistant textarea'))`);
  assert.equal(await b.evaluate(`document.querySelectorAll('.cc-message-bubble').length`), 0);
  await b.evaluate('window.__qaDelay=false');
  await b.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 500,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await b.evaluate(`document.querySelector('.campus-assistant textarea').focus()`);
  await b.delay(100);
  await b.evaluate(
    `document.querySelector('.campus-assistant textarea').scrollIntoView({block:'center',behavior:'instant'})`,
  );
  assert.ok(
    await b.evaluate(
      `(()=>{const r=document.querySelector('.campus-assistant form button').getBoundingClientRect();return r.top>=0&&r.bottom<=document.querySelector('.cc-mobile-nav').getBoundingClientRect().top})()`,
    ),
  );
  await b.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await b.evaluate(`scrollTo(0,0);dispatchEvent(new Event('resize'))`);
  await b.delay(100);
  await b.screenshot('assistant-SYNTHETIC-keyboard-viewport-restored');
  await b.send('Emulation.setDeviceMetricsOverride', {
    width: 720,
    height: 450,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await b.evaluate(`scrollTo(0,0);dispatchEvent(new Event('resize'))`);
  await b.delay(100);
  await ask('My bag got lost.');
  await b.evaluate(
    `document.querySelector('.campus-assistant form').scrollIntoView({block:'center',behavior:'instant'})`,
  );
  assert.equal(await b.evaluate('document.documentElement.scrollWidth>innerWidth+1'), false);
  await b.screenshot('assistant-SYNTHETIC-200-percent-equivalent-reflow');

  await click('Clear conversation');
  await ask('I found a student ID card.');
  await b.evaluate(`document.querySelector('a[href="/lost-found/new?type=found"]').click()`);
  await b.waitFor(`document.body.innerText.includes('QA destination reached')`);
  assert.equal(b.errors.length, 0);
  await writeFile(
    join(output, 'assistant-results.json'),
    JSON.stringify(
      {
        evidence:
          'Synthetic identity/repository/provider; actual React/API client/Express auth+routes+retrieval. No Supabase or real student records.',
        results,
        accountChangeReset: 'PASS',
        routeChangeCancellation: 'PASS',
        retrievalTimeout: 'PASS',
        equivalentReflow: 'PASS',
        emulatedKeyboardRecovery: 'PASS',
        retry: 'PASS',
        clearDuringRequest: 'PASS',
        resetContext: 'PASS',
        consoleErrors: b.errors,
      },
      null,
      2,
    ),
  );
  console.log('PASS Assistant synthetic HTTP/browser QA');
} finally {
  await b.close();
  child.kill();
}
