/** Actual AppShell/router/theme; synthetic identity and API boundaries, no live services. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { openChromeFixture } from './chrome-fixture-driver.mjs';

const output = process.argv[2];
if (!output) throw new Error('Supply a private local screenshot directory.');
await mkdir(output, { recursive: true });
const css = (await readdir(resolve('frontend/dist/assets'))).find(
  (name) => name.startsWith('index-') && name.endsWith('.css'),
);
if (!css) throw new Error('Build frontend first.');
const bundle = await build({
  stdin: {
    sourcefile: 'navigation-qa.tsx',
    resolveDir: resolve('frontend'),
    loader: 'tsx',
    contents: `
import {useEffect} from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,useLocation,useNavigate} from 'react-router-dom';
import {AppShell} from './src/app/AppShell';import {ThemeProvider} from './src/features/theme/ThemeProvider';
const params=new URLSearchParams(location.search);window.__qaRole=params.get('role')||'STUDENT';window.__qaAdmin=params.get('admin')==='yes';
window.fetch=()=>Promise.reject(new Error('External network disabled in navigation fixture'));
localStorage.setItem('campusconnect-theme',document.documentElement.dataset.theme);
function Page(){const location=useLocation(),navigate=useNavigate();useEffect(()=>{window.__qaPath=location.pathname;window.__qaNavigate=navigate;},[location,navigate]);return <section className="cc-page"><p className="cc-eyebrow">ISOLATED NAVIGATION QA</p><h1 className="cc-title">Navigation verification fixture</h1><p>Actual CampusConnect header with synthetic identity. No Dashboard page or live API data is simulated here.</p></section>;}
createRoot(document.querySelector('#fixture-root')).render(<ThemeProvider><MemoryRouter initialEntries={[params.get('route')||'/dashboard']}><Routes><Route element={<AppShell/>}><Route path="*" element={<Page/>}/></Route></Routes></MemoryRouter></ThemeProvider>);
`,
  },
  bundle: true,
  jsx: 'automatic',
  platform: 'browser',
  format: 'esm',
  write: false,
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'isolated-navigation-boundaries',
      setup(builder) {
        for (const [suffix, path] of Object.entries({
          'auth/useAuth': 'auth',
          'admin/admin-service': 'admin',
          'services/api-client': 'api',
          'notifications-service': 'notifications',
        }))
          builder.onResolve({ filter: new RegExp(suffix + '$') }, () => ({
            path,
            namespace: 'nav-qa',
          }));
        builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'nav-qa' }));
        builder.onLoad({ filter: /.*/, namespace: 'nav-qa' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === 'css'
              ? ''
              : path === 'auth'
                ? `export const useAuth=()=>({applicationUser:{id:'synthetic-navigation-user',role:window.__qaRole,status:'ACTIVE',email:'synthetic@example.test',profile:{displayName:'Synthetic Student'}},logout:async()=>{window.__qaLoggedOut=true;}});`
                : path === 'admin'
                  ? `export const adminApi={access:()=>window.__qaAdmin?Promise.resolve({}):Promise.reject(new Error('Synthetic admin denial'))};`
                  : path === 'api'
                    ? `export class ApiClientError extends Error{};export const apiRequest=async()=>({results:[]});`
                    : `export const notificationsChangedEvent='qa-notifications';export const announceNotificationsChanged=()=>{};export const mergeNotifications=(a,b)=>[b,...a];export const notificationActionState=()=>({});export const notificationsService={list:async()=>({notifications:[],pagination:{total:0}}),count:async()=>0};export const connectNotificationSocket=async()=>({disconnect(){}});`,
        }));
      },
    },
  ],
});
await writeFile(join(output, 'fixture.js'), bundle.outputFiles[0].text);
for (const theme of ['light', 'dark'])
  await writeFile(
    join(output, theme + '.html'),
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Synthetic navigation QA</title><link rel="stylesheet" href="/assets/${css}"></head><body><div id="fixture-root"></div><script type="module" src="/fixture.js"></script></body></html>`,
  );

const browser = await openChromeFixture(output),
  results = [];
const expected = ['/home', '/dashboard', '/marketplace', '/lost-found', '/teamup', '/services'];
const load = async (width, theme, role = 'STUDENT', admin = false) => {
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width,
    height: width < 768 ? 844 : 900,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await browser.send('Page.navigate', {
    url:
      browser.origin +
      '/' +
      theme +
      '.html?' +
      new URLSearchParams({ role, admin: admin ? 'yes' : 'no' }),
  });
  await browser.waitFor('window.__qaPath==="/dashboard"');
  await browser.evaluate('document.fonts.ready');
  await browser.settle();
};
const escape = () =>
  browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
try {
  for (const width of [320, 390, 430, 768, 1024, 1280, 1340, 1440, 1600, 1920]) {
    for (const theme of ['light', 'dark']) {
      await load(width, theme);
      const metrics = await browser.evaluate(`(()=>{
        const nav=document.querySelector('.cc-shell-primary-nav'), visible=e=>!!e.getClientRects().length;
        const regions=['.cc-shell-brand',visible(nav)?'.cc-shell-primary-nav':'.cc-shell-explore-trigger',...(visible(document.querySelector('.cc-shell-search'))?['.cc-shell-search']:[]),'.cc-shell-utilities'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {selector,left:r.left,right:r.right};});
        return {expanded:visible(nav),routes:[...nav.querySelectorAll('a')].map(e=>e.getAttribute('href')),active:nav.querySelector('[aria-current="page"]')?.getAttribute('href'),regions,overflow:document.documentElement.scrollWidth>innerWidth,headerOverflow:document.querySelector('.cc-top-nav-inner').scrollWidth>innerWidth,bottom:[...document.querySelectorAll('.cc-mobile-nav a')].map(e=>e.getAttribute('href'))};
      })()`);
      assert.deepEqual(metrics.routes, expected);
      assert.equal(metrics.active, '/dashboard');
      assert.equal(metrics.expanded, width >= 1340);
      assert.equal(metrics.overflow, false);
      assert.equal(metrics.headerOverflow, false);
      for (let i = 0; i < metrics.regions.length - 1; i++)
        assert.ok(
          metrics.regions[i].right <= metrics.regions[i + 1].left + 1,
          JSON.stringify({ width, theme, ...metrics }),
        );
      assert.ok(metrics.regions.at(-1).right <= width);
      assert.deepEqual(metrics.bottom, [
        '/home',
        '/marketplace',
        '/search',
        '/assistant',
        '/messages',
        '/profile',
      ]);
      await browser.evaluate(
        `document.querySelector("button[aria-label='Open account menu']").click()`,
      );
      await browser.waitFor('Boolean(document.querySelector(".cc-shell-account-menu"))');
      const account = await browser.evaluate(
        'Array.from(document.querySelectorAll(".cc-shell-account-menu [role=menuitem]")).map(e=>e.textContent.trim())',
      );
      assert.deepEqual(account, ['My Profile', 'Settings', 'Sign out']);
      await escape();
      assert.equal(
        await browser.evaluate('document.activeElement.getAttribute("aria-label")'),
        'Open account menu',
      );
      if (metrics.expanded) {
        await browser.evaluate(
          `document.querySelector(".cc-shell-primary-nav a[href='/dashboard']").focus()`,
        );
        await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' });
        assert.equal(
          await browser.evaluate('document.activeElement.getAttribute("href")'),
          '/marketplace',
        );
        await browser.evaluate('document.activeElement.blur()');
        if ([1440, 1920].includes(width)) await browser.screenshot(`desktop-${width}-${theme}`);
      } else {
        await browser.evaluate('document.querySelector(".cc-shell-explore-trigger").click()');
        await browser.waitFor('Boolean(document.querySelector(".cc-explore-sheet"))');
        await browser.settle();
        await browser.evaluate(
          'Promise.all(document.getAnimations().filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))',
        );
        assert.equal(
          await browser.evaluate(
            `document.querySelectorAll(".cc-explore-sheet a[href='/dashboard']").length`,
          ),
          1,
        );
        assert.equal(
          await browser.evaluate(
            `document.querySelector(".cc-explore-sheet a[href='/dashboard']").getAttribute("aria-current")`,
          ),
          'page',
        );
        assert.equal(await browser.evaluate('document.body.style.overflow'), 'hidden');
        if ([320, 390, 430, 1024, 1280].includes(width))
          await browser.screenshot(`explore-${width}-${theme}`);
        await browser.evaluate(
          `document.querySelector(".cc-explore-sheet a[href='/dashboard']").focus()`,
        );
        await browser.send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'Enter',
          code: 'Enter',
        });
        await browser.waitFor('!document.querySelector(".cc-explore-sheet")');
        assert.equal(await browser.evaluate('document.body.style.overflow'), '');
      }
      await browser.evaluate('window.__qaNavigate("/home")');
      await browser.waitFor('window.__qaPath==="/home"');
      assert.equal(
        await browser.evaluate(
          'document.querySelector(".cc-shell-primary-nav [aria-current=page]").getAttribute("href")',
        ),
        '/home',
      );
      await browser.evaluate('window.__qaNavigate(-1)');
      await browser.waitFor('window.__qaPath==="/dashboard"');
      results.push({ width, theme, ...metrics });
    }
  }
  for (const [role, admin, expectedMenu] of [
    ['MODERATOR', false, ['My Profile', 'Settings', 'Moderation', 'Sign out']],
    ['ADMIN', false, ['My Profile', 'Settings', 'Moderation', 'Sign out']],
    ['ADMIN', true, ['My Profile', 'Settings', 'Moderation', 'Administration', 'Sign out']],
  ]) {
    await load(1440, 'dark', role, admin);
    await browser.evaluate(
      `document.querySelector("button[aria-label='Open account menu']").click()`,
    );
    if (admin)
      await browser.waitFor(
        'Array.from(document.querySelectorAll("[role=menuitem]")).some(e=>e.textContent.includes("Administration"))',
      );
    assert.deepEqual(
      await browser.evaluate(
        'Array.from(document.querySelectorAll(".cc-shell-account-menu [role=menuitem]")).map(e=>e.textContent.trim())',
      ),
      expectedMenu,
    );
  }
  assert.deepEqual(browser.errors, []);
  await writeFile(
    join(output, 'navigation-results.json'),
    JSON.stringify(
      {
        evidence: 'Actual AppShell; synthetic auth/API adapters, not a real authenticated session',
        results,
        roleGates: 'PASS',
        keyboard: 'PASS',
        routerHistory: 'PASS',
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: 20 viewport/theme cases, desktop order/geometry, unique mobile Dashboard, six bottom links, active states, keyboard/history and role gates.',
  );
} finally {
  await browser.close();
}
