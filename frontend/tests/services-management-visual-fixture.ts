/** Real Services management components and adapters; synthetic records only. */
import { build } from 'esbuild';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = process.argv[2];
const withShell = process.argv.includes('--shell');
if (!output) throw new Error('Supply temporary QA output.');
await mkdir(output, { recursive: true });
const assets = await readdir(resolve('frontend/dist/assets'));
const css = ['index-', 'services-management-']
  .map((prefix) => {
    const file = assets.find((name) => name.startsWith(prefix) && name.endsWith('.css'));
    if (!file) throw new Error('Build frontend first.');
    return `<link rel="stylesheet" href="/assets/${file}">`;
  })
  .join('');
const bundle = await build({
  stdin: {
    sourcefile: 'services-management-qa.tsx',
    resolveDir: resolve('frontend'),
    loader: 'tsx',
    contents: `
import {useEffect} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';
import {ServiceCreatePage,ServiceEditPage} from './src/features/services/ServiceOfferForm';import ServicesWorkspace from './src/features/services/ServicesWorkspace';import {ApiClientError} from './src/services/api-client';
${withShell ? "import {AppShell} from './src/app/AppShell';import {ThemeProvider} from './src/features/theme/ThemeProvider';localStorage.setItem('campusconnect-theme',document.documentElement.dataset.theme);" : ''}
const params=new URLSearchParams(location.search),scenario=params.get('case')??'populated',screen=params.get('screen')??'create';
const uid=i=>String(i).padStart(8,'0')+'-1111-4111-8111-111111111111';
const base={id:uid(1),title:'Design support for student projects',description:'Synthetic service for browser QA.\\n\\nGet thoughtful help with presentations, portfolio layouts and student initiatives.\\n[campusconnect-examiner-demo-v1]',category:'Creative & design',pricingType:'FIXED',price:'500.00',skills:['Design','Figma','Communication'],location:'Campus library',providerId:uid(20),provider:{id:uid(20),avatar:null,department:null,displayName:'Synthetic provider'},featuredOnLanding:true,status:'ACTIVE',createdAt:'2026-10-22T12:00:00Z',updatedAt:'2026-10-23T12:00:00Z',viewerIsProvider:true,viewerCanRequest:false,viewerRequestStatus:null,requestCount:0};
const provided=[{...base},{...base,id:uid(2),title:'Practical study support',status:'PAUSED',pricingType:'FREE',price:'0',featuredOnLanding:false},{...base,id:uid(3),title:'Portfolio feedback and planning',status:'ARCHIVED',pricingType:'NEGOTIABLE',price:null}];
const row=(i,status,service,received)=>({id:uid(i),status,service,requesterId:received?uid(30+i):uid(21),requester:{id:received?uid(30+i):uid(21),avatar:null,department:null,displayName:received?'Synthetic requester':'You'},message:'Synthetic request note. Please help with my next campus project.',createdAt:'2026-10-24T12:00:00Z',updatedAt:'2026-10-24T12:00:00Z',reviewedAt:status==='PENDING'?null:'2026-10-25T12:00:00Z'});
let received=['PENDING','ACCEPTED','REJECTED','COMPLETED'].map((status,i)=>row(100+i,status,provided[i===1?1:i===3?2:0],true));
let requested=['PENDING','ACCEPTED','REJECTED','COMPLETED'].map((status,i)=>row(200+i,status,{...base,id:uid(10+i),viewerIsProvider:false,providerId:uid(25),provider:{...base.provider,id:uid(25)},viewerRequestStatus:status},false));
if(scenario==='empty'){provided.length=0;received=[];requested=[];}
if(scenario==='redacted'){provided.forEach(s=>s.provider={...s.provider,displayName:'CampusConnect student'});requested.forEach(r=>r.service.provider={...r.service.provider,displayName:'CampusConnect student'});received.forEach(r=>r.requester={...r.requester,displayName:'CampusConnect student'});}
if(scenario==='long'){provided.forEach(s=>{s.title='LongServiceTitle'.repeat(12);s.category='LongCategory'.repeat(9);s.skills=['LongSkill'.repeat(6)];});received.forEach(r=>r.message='LongUnbrokenRequestMessage'.repeat(25));}
if(scenario==='archived')provided[0].status='ARCHIVED';if(scenario==='paused')provided[0].status='PAUSED';if(scenario==='nonowner')provided[0].viewerIsProvider=false;if(scenario==='missing-consent')delete provided[0].featuredOnLanding;
let wrote=false;window.__qaCalls=[];window.__qaNetwork=0;window.__qaAborted=0;window.__qaFailRead=scenario==='error';window.__qaFailWrite=scenario==='write-error';window.__qaFailRefresh=scenario==='refresh-error';window.__qaHold=false;window.__qaMessageFail=scenario==='message-error';
window.fetch=async()=>{window.__qaNetwork++;throw new Error('External network disabled in management fixture.');};
window.__qaApi=async(path,init={})=>{
 const call={path,method:init.method??'GET',body:init.body?JSON.parse(init.body):null,aborted:false};window.__qaCalls.push(call);init.signal?.addEventListener('abort',()=>{call.aborted=true;window.__qaAborted++;});await new Promise(done=>setTimeout(done,25));
 if(call.method==='GET'){
  if(scenario==='loading')return new Promise(()=>{});
  if(scenario==='notfound')throw new ApiClientError('SERVICE_NOT_FOUND','The service was not found.',404);
  if(scenario==='forbidden')throw new ApiClientError('ACCOUNT_UNAVAILABLE','This account is not available.',403);
  if(window.__qaFailRead||wrote&&window.__qaFailRefresh)throw new ApiClientError('UNAVAILABLE','Workspace unavailable. Try again.',503);
  if(path==='/api/services/workspace')return structuredClone({provided,received,requested});
  if(path==='/api/services/'+uid(1))return {service:structuredClone(provided[0])};
 }
 if(window.__qaHold)await new Promise(done=>window.__qaRelease=done);
 if(window.__qaFailWrite)throw new ApiClientError('SAVE_FAILED','The operation failed. Please retry.',503);
 if(scenario==='conflict'){
  if(path.endsWith('/review')){const item=received.find(r=>path.includes(r.id));if(item)item.status='REJECTED';}
  throw new ApiClientError('SERVICE_CONCURRENCY_CONFLICT','The service changed. Refresh and try again.',409);
 }
 if(path==='/api/services'&&call.method==='POST'){wrote=true;return {service:{...base,...call.body,id:uid(99)}};}
 if(path==='/api/services/'+uid(1)&&call.method==='PATCH'){wrote=true;Object.assign(provided[0],call.body);return {service:structuredClone(provided[0])};}
 if(path.endsWith('/status')){wrote=true;const service=provided.find(s=>path.includes(s.id));service.status=call.body.status;return {service:structuredClone(service)};}
 if(path.endsWith('/review')||path.endsWith('/complete')){wrote=true;const request=received.find(r=>path.includes(r.id));request.status=path.endsWith('/complete')?'COMPLETED':call.body.status;return {request:structuredClone(request),service:structuredClone(request.service)};}
 if(path==='/api/messages/conversations'){if(window.__qaMessageFail)throw new ApiClientError('MESSAGING_NOT_ALLOWED','Messaging is unavailable for these participants.',403);return {conversation:{id:'synthetic-conversation'}};}
 throw new Error('Unexpected management fixture API '+path);
};
function Probe(){const route=useLocation();useEffect(()=>{window.__qaLocation=route.pathname;},[route]);return null;}
const route=screen==='create'?'/services/new':screen==='edit'?'/services/'+uid(1)+'/edit':'/services/saved';
createRoot(document.querySelector('${withShell ? '#fixture-root' : 'main'}')).render(${withShell ? '<ThemeProvider>' : ''}<MemoryRouter initialEntries={[route]}><Probe/><Routes>${withShell ? '<Route element={<AppShell/>}>' : ''}<Route path="/services/new" element={<ServiceCreatePage/>}/><Route path="/services/:id/edit" element={<ServiceEditPage id={uid(1)}/>}/><Route path="/services/saved" element={<ServicesWorkspace/>}/><Route path="*" element={<p>Existing confirmed destination</p>}/>${withShell ? '</Route>' : ''}</Routes></MemoryRouter>${withShell ? '</ThemeProvider>' : ''});window.__qaReady=true;
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
      name: 'isolated-services-management-boundaries',
      setup(builder) {
        if (withShell) {
          builder.onResolve({ filter: /notifications-service$/ }, () => ({
            path: 'notifications',
            namespace: 'sm-qa',
          }));
        }
        builder.onResolve({ filter: /services\/api-client$/ }, () => ({
          path: 'api',
          namespace: 'sm-qa',
        }));
        builder.onResolve({ filter: /auth\/useAuth$/ }, () => ({
          path: 'auth',
          namespace: 'sm-qa',
        }));
        builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'sm-qa' }));
        builder.onLoad({ filter: /.*/, namespace: 'sm-qa' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === 'notifications'
              ? 'export const notificationsChangedEvent="synthetic-notifications-changed";export const announceNotificationsChanged=()=>{};export const mergeNotifications=(a,b)=>[b,...a];export const notificationActionState=()=>({clearAll:false,clearRead:false,markAllRead:false});export const notificationsService={list:async()=>({notifications:[],pagination:{total:0}}),count:async()=>0};export const connectNotificationSocket=async()=>({disconnect(){}});'
              : path === 'css'
                ? ''
                : path === 'auth'
                  ? 'export const useAuth=()=>({applicationUser:{id:"fixture",role:"STUDENT",status:"ACTIVE"},isAuthenticated:true});'
                  : 'export class ApiClientError extends Error {constructor(code,message,status){super(message);this.code=code;this.status=status;}} export const apiRequest=(...args)=>window.__qaApi(...args);export const apiRequestWithMeta=async(...args)=>{const {meta,...data}=await window.__qaApi(...args);return {data,meta};};',
        }));
      },
    },
  ],
});
await writeFile(resolve(output, 'fixture.js'), bundle.outputFiles[0].text);
for (const theme of ['light', 'dark'])
  await writeFile(
    resolve(output, theme + '.html'),
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SYNTHETIC Services Management QA</title>${css}</head><body>${withShell ? '<div id="fixture-root"></div>' : '<div class="cc-app-shell min-h-screen"><main></main></div>'}<script type="module" src="/fixture.js"></script></body></html>`,
  );
console.log('Generated real Services management components with isolated synthetic API responses.');
