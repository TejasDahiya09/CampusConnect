/** Actual Dashboard, AppShell, API client contract and theme; synthetic records only. */
import { build } from 'esbuild';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const output = process.argv[2];
if (!output) throw new Error('Supply a private local QA directory.');
await mkdir(output, { recursive: true });
const assets = await readdir(resolve('frontend/dist/assets'));
const css = ['index-', 'DashboardPage-']
  .map((prefix) => {
    const asset = assets.find((name) => name.startsWith(prefix) && name.endsWith('.css'));
    if (!asset) throw new Error('Build frontend before Dashboard QA.');
    return `<link rel="stylesheet" href="/assets/${asset}">`;
  })
  .join('');
const bundle = await build({
  stdin: {
    sourcefile: 'dashboard-qa.tsx',
    resolveDir: resolve('frontend'),
    loader: 'tsx',
    contents: `
import {useEffect} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route,useLocation,useNavigate} from 'react-router-dom';
import {AppShell} from './src/app/AppShell';import {DashboardPage} from './src/features/dashboard/DashboardPage';import {ThemeProvider} from './src/features/theme/ThemeProvider';
import {dashboardFixture,emptyDashboardFixture} from './tests/fixtures/dashboard-fixtures';
const params=new URLSearchParams(location.search),scenario=params.get('case')||'populated';
window.__qaUser='synthetic-dashboard-a';window.__qaRole=params.get('role')||'STUDENT';window.__qaStatus=scenario==='inactive'?'SUSPENDED':'ACTIVE';window.__qaCalls=[];window.__qaFail=false;window.__qaHold=false;window.__qaAbort=0;
localStorage.setItem('campusconnect-theme',document.documentElement.dataset.theme);
window.fetch=()=>Promise.reject(new Error('External network blocked in isolated Dashboard fixture'));
window.__qaApi=async(path,init={})=>{
  const account=window.__qaUser;window.__qaCalls.push({path,account});
  if(path!=='/api/dashboard')throw new Error('Unsupported Dashboard request');
  init.signal?.addEventListener('abort',()=>window.__qaAbort++);
  if(scenario==='loading')return new Promise(()=>{});
  if(scenario==='error'||window.__qaFail)throw Object.assign(new Error('Synthetic unavailable'),{status:503});
  if(scenario==='unauthorized')throw Object.assign(new Error('Synthetic expired session'),{status:401});
  if(scenario==='forbidden')throw Object.assign(new Error('Synthetic unavailable account'),{status:403});
  if(scenario==='timeout')throw new DOMException('Synthetic timeout','TimeoutError');
  let result=structuredClone(scenario==='empty'?emptyDashboardFixture:dashboardFixture);
  if(scenario==='malformed')delete result.insights.services;
  if(scenario==='large')result.metrics=result.metrics.map(row=>({...row,value:123456789012}));
  if(account==='synthetic-dashboard-b')result=structuredClone(emptyDashboardFixture);
  if(window.__qaHold)await new Promise(done=>window.__qaRelease=done);
  return result;
};
function Probe(){const location=useLocation(),navigate=useNavigate();useEffect(()=>{window.__qaPath=location.pathname+location.search;window.__qaNavigate=navigate;},[location,navigate]);return null;}
createRoot(document.querySelector('#fixture-root')).render(<ThemeProvider><MemoryRouter initialEntries={['/dashboard']}><Probe/><Routes><Route element={<AppShell/>}><Route path="/dashboard" element={<DashboardPage/>}/><Route path="*" element={<section className="cc-page"><h1>Verified existing destination</h1></section>}/></Route></Routes></MemoryRouter></ThemeProvider>);
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
      name: 'isolated-dashboard-boundaries',
      setup(builder) {
        for (const [suffix, path] of Object.entries({
          'auth/useAuth': 'auth',
          'services/api-client': 'api',
          'admin/admin-service': 'admin',
          'notifications-service': 'notifications',
        }))
          builder.onResolve({ filter: new RegExp(suffix + '$') }, () => ({
            path,
            namespace: 'db-qa',
          }));
        builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'db-qa' }));
        builder.onLoad({ filter: /.*/, namespace: 'db-qa' }, ({ path }) => ({
          loader: 'js',
          resolveDir: resolve('frontend'),
          contents:
            path === 'css'
              ? ''
              : path === 'auth'
                ? `
import {useEffect,useState} from 'react';export const useAuth=()=>{const [account,set]=useState(()=>({id:window.__qaUser,status:window.__qaStatus}));useEffect(()=>{const changed=()=>set({id:window.__qaUser,status:window.__qaStatus});window.addEventListener('qa-account',changed);return ()=>window.removeEventListener('qa-account',changed);},[]);return {applicationUser:{...account,role:window.__qaRole,email:'synthetic@example.test',profile:{displayName:'Synthetic Student'}},logout:async()=>{}};};`
                : path === 'api'
                  ? `export class ApiClientError extends Error {constructor(code,message,status){super(message);this.code=code;this.status=status;}}export const apiRequest=async(...args)=>{try{return await window.__qaApi(...args);}catch(error){if(error.status)throw new ApiClientError('SYNTHETIC_ERROR',error.message,error.status);throw error;}};`
                  : path === 'admin'
                    ? `export const adminApi={access:async()=>({})};`
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
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Synthetic Dashboard QA</title>${css}</head><body><div id="fixture-root"></div><script type="module" src="/fixture.js"></script></body></html>`,
  );
console.log(
  'Generated actual Dashboard + AppShell fixtures; synthetic aggregates only, external network blocked.',
);
