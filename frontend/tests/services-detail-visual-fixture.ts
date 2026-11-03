/** Real Service Details component and API adapters; synthetic data only, all external requests blocked. */
import { build } from 'esbuild';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = process.argv[2];
if (!output) throw new Error('Supply a private temporary fixture directory.');
await mkdir(output, { recursive: true });
const assets = await readdir(resolve('frontend/dist/assets'));
const css = ['index-', 'ServiceDetail-']
  .map((prefix) => {
    const file = assets.find((name) => name.startsWith(prefix) && name.endsWith('.css'));
    if (!file) throw new Error('Build frontend first.');
    return `<link rel="stylesheet" href="/assets/${file}">`;
  })
  .join('');
const bundle = await build({
  stdin: {
    sourcefile: 'services-detail-qa.tsx',
    resolveDir: resolve('frontend'),
    loader: 'tsx',
    contents: `
import {useEffect} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';
import ServiceDetail from './src/features/services/ServiceDetail';import {ApiClientError} from './src/services/api-client';
const params=new URLSearchParams(location.search),scenario=params.get('case')??'eligible';
const id='10000000-1111-4111-8111-111111111111',requestId='20000000-1111-4111-8111-111111111111';
const service={id,title:'Design that brings your student project to life',category:'Creative & design',description:'Synthetic QA service. Thoughtful design support for student presentations, project portfolios and campus initiatives.\\n\\nTell me what you are working on and the kind of help you need. We can discuss the scope after your request is accepted.\\n\\n[campusconnect-examiner-demo-v1]',skills:['Visual design','Figma','Presentation design','Communication'],pricingType:'FIXED',price:'500.00',location:'Campus library',createdAt:'2026-10-20T12:00:00Z',updatedAt:'2026-10-21T12:00:00Z',providerId:'30000000-1111-4111-8111-111111111111',provider:{id:'30000000-1111-4111-8111-111111111111',avatar:null,department:'Design',displayName:'Synthetic provider'},requestCount:0,status:'ACTIVE',viewerIsProvider:false,viewerCanRequest:true,viewerRequestStatus:null};
if(['pending','accepted','rejected','completed'].includes(scenario)){service.viewerRequestStatus=scenario.toUpperCase();service.viewerCanRequest=['rejected','completed'].includes(scenario);}
if(['message-error','workspace-error','hidden-history'].includes(scenario)){service.viewerRequestStatus='ACCEPTED';service.viewerCanRequest=false;}
if(['paused','archived'].includes(scenario)){service.status=scenario.toUpperCase();service.viewerRequestStatus='ACCEPTED';service.viewerCanRequest=false;}
if(scenario.startsWith('owner')){service.viewerIsProvider=true;service.viewerCanRequest=false;if(scenario==='owner-archived')service.status='ARCHIVED';}
if(scenario==='redacted'||scenario==='hidden-history')service.provider={...service.provider,displayName:'CampusConnect student',department:null};
if(scenario==='free'){service.pricingType='FREE';service.price='0';}if(scenario==='negotiable'){service.pricingType='NEGOTIABLE';service.price=null;}
if(scenario==='sparse'){service.skills=[];service.location=null;service.createdAt='';service.updatedAt='';service.provider={...service.provider,displayName:'CampusConnect student',department:null};}
if(scenario==='long'){service.title='LongSyntheticTitle'.repeat(12);service.description='LongUnbrokenDescription'.repeat(80)+'\\n\\nOriginal final paragraph.';service.skills=Array.from({length:12},(_,i)=>'Skill'+i+'LongSkill'.repeat(5));service.location='LongLocation'.repeat(12);service.provider.displayName='LongProviderName'.repeat(8);}
let submitted=false;window.__qaCalls=[];window.__qaNetwork=0;window.__qaAborted=0;window.__qaFailGet=scenario==='error';window.__qaFailRefresh=scenario==='refresh-error';window.__qaFailWorkspace=scenario==='workspace-error';window.__qaRequestFail=scenario==='request-error';window.__qaMessageFail=scenario==='message-error'||scenario==='hidden-history';window.__qaHold=false;
window.fetch=async()=>{window.__qaNetwork++;throw new Error('Network disabled in isolated Services Details fixture.');};
const request=()=>({id:requestId,service:{...service},requesterId:'40000000-1111-4111-8111-111111111111',requester:{id:'40000000-1111-4111-8111-111111111111',avatar:null,department:null,displayName:'Synthetic requester'},status:service.viewerRequestStatus??'PENDING',message:null,createdAt:'2026-10-22T12:00:00Z',updatedAt:'2026-10-22T12:00:00Z',reviewedAt:null});
window.__qaApi=async(path,init={})=>{
 const call={path,method:init.method??'GET',body:init.body?JSON.parse(init.body):null,aborted:false};window.__qaCalls.push(call);init.signal?.addEventListener('abort',()=>{call.aborted=true;window.__qaAborted++;});await new Promise(done=>setTimeout(done,25));
 if(path==='/api/services/'+id){
  if(scenario==='loading')return new Promise(()=>{});
  if(scenario==='notfound'||scenario==='hidden')throw new ApiClientError('SERVICE_NOT_FOUND','The service was not found.',404);
  if(scenario==='forbidden')throw new ApiClientError('ACCOUNT_UNAVAILABLE','This account is not available.',403);
  if(window.__qaFailGet||submitted&&window.__qaFailRefresh)throw new ApiClientError('UNAVAILABLE','Services unavailable. Please retry.',503);
  return {service:{...service}};
 }
 if(path==='/api/services/'+id+'/requests'){
  if(window.__qaHold)await new Promise(done=>window.__qaRelease=done);
  if(window.__qaRequestFail)throw new ApiClientError('UNAVAILABLE','Your request could not be submitted.',503);
  if(scenario==='conflict'){service.viewerRequestStatus='PENDING';service.viewerCanRequest=false;throw new ApiClientError('SERVICE_REQUEST_EXISTS','You already have an active request.',409);}
  submitted=true;service.viewerRequestStatus='PENDING';service.viewerCanRequest=false;return {request:request()};
 }
 if(path==='/api/services/workspace'){
  if(window.__qaFailWorkspace)throw new ApiClientError('UNAVAILABLE','Requests unavailable.',503);
  return {provided:[],received:[],requested:[request()]};
 }
 if(path==='/api/services/'+id+'/status'){service.status='ARCHIVED';return {service:{...service}};}
 if(path==='/api/messages/conversations'){if(window.__qaMessageFail)throw new ApiClientError('MESSAGING_NOT_ALLOWED','Messaging is not available for these participants and context.',403);return {conversation:{id:'fixture-conversation'}};}
 if(path==='/api/moderation/reports')return {report:{id:'fixture-report'}};
 throw new Error('Unexpected fixture API '+path);
};
function Probe(){const route=useLocation();useEffect(()=>{window.__qaLocation=route.pathname;},[route]);return null;}
createRoot(document.querySelector('main')).render(<MemoryRouter initialEntries={['/services/'+(scenario==='invalid-link'?'invalid':id)]}><Probe/><Routes><Route path="/services/:id" element={<ServiceDetail id={scenario==='invalid-link'?'invalid':id}/>}/><Route path="*" element={<p>Existing destination</p>}/></Routes></MemoryRouter>);window.__qaReady=true;
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
      name: 'isolated-services-detail-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /services\/api-client$/ }, () => ({
          path: 'api',
          namespace: 'sd-qa',
        }));
        builder.onResolve({ filter: /auth\/useAuth$/ }, () => ({
          path: 'auth',
          namespace: 'sd-qa',
        }));
        builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'sd-qa' }));
        builder.onLoad({ filter: /.*/, namespace: 'sd-qa' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === 'css'
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
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SYNTHETIC Campus Services Details QA</title>${css}</head><body><div class="cc-app-shell min-h-screen"><main></main></div><script type="module" src="/fixture.js"></script></body></html>`,
  );
console.log(
  'Generated actual Services Details fixtures; synthetic data and local API adapter only.',
);
