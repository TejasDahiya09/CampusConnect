/** Isolated actual Services Browse; synthetic responses only, all network disabled. */
import { build } from 'esbuild';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = process.argv[2];
if (!output) throw new Error('Supply private temporary QA output.');
await mkdir(output, { recursive: true });
const assets = await readdir(resolve('frontend/dist/assets'));
const css = ['index-', 'ServicesBrowse-']
  .map((prefix) => {
    const file = assets.find((name) => name.startsWith(prefix) && name.endsWith('.css'));
    if (!file) throw new Error('Build frontend first.');
    return `<link rel="stylesheet" href="/assets/${file}">`;
  })
  .join('');
const bundle = await build({
  stdin: {
    sourcefile: 'services-qa.tsx',
    resolveDir: resolve('frontend'),
    loader: 'tsx',
    contents: `
import {useEffect} from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,useLocation,useNavigate} from 'react-router-dom';
import ServicesBrowse from './src/features/services/ServicesBrowse';
import {ApiClientError} from './src/services/api-client';
const params=new URLSearchParams(location.search),scenario=params.get('case')??'populated';
const titles=['Visual design for your student project','One-to-one calculus revision','Get your first portfolio online','Presentation design & storytelling','Python debugging and code review','Student event photography'];
const rows=Array.from({length:25},(_,i)=>({id:String(i+1).padStart(8,'0')+'-1111-4111-8111-111111111111',title:titles[i%6],description:'Synthetic QA example. Get practical support for your next campus task, with a clear scope agreed together before starting.',category:i%2?'Tutoring':'Creative & design',pricingType:i%3===0?'FREE':i%3===1?'FIXED':'NEGOTIABLE',price:i%3===0?'0':i%3===1?String(200+i*20):null,providerId:'fixture',provider:{id:'fixture',avatar:null,department:null,displayName:i%4===0?'CampusConnect student':'Synthetic student'},skills:i%2?['Mathematics','Problem solving']:['Design','Figma','Communication'],location:i%3?'Campus library':null,status:'ACTIVE',createdAt:new Date(Date.UTC(2026,9,26)-i*86400000).toISOString(),updatedAt:'',viewerIsProvider:false,viewerRequestStatus:null,requestCount:0}));
if(scenario==='long')rows.forEach(row=>{row.title='LongSyntheticTitle'.repeat(12);row.category='VeryLongCategory'.repeat(7);row.skills=['LongSkill'.repeat(10),'Research','Design'];row.location='LongLocation'.repeat(10);row.provider.displayName='LongProviderName'.repeat(8);row.price='10000000';row.pricingType='FIXED';});
window.__qaCalls=[];window.__qaNetwork=0;window.__qaFail=scenario==='error';window.__qaDelay=null;window.__qaAborted=0;
window.fetch=async()=>{window.__qaNetwork++;throw new Error('Network disabled in isolated Services QA.');};
window.__qaApi=async(path,init={})=>{
 const call={path,aborted:false};window.__qaCalls.push(call);init.signal?.addEventListener('abort',()=>{call.aborted=true;window.__qaAborted++;});
 await new Promise(done=>setTimeout(done,20));
 if(scenario==='loading')return new Promise(()=>{});
 if(window.__qaFail)throw new ApiClientError('UNAVAILABLE','Services unavailable. Please retry.',503);
 const query=new URL(path,'https://fixture.test').searchParams;
 if(window.__qaDelay!==null&&query.get('search')===window.__qaDelay)await new Promise(done=>window.__qaRelease=done);
 let items=scenario==='empty'?[]:rows.filter(row=>(!query.get('search')||(row.title+' '+row.description+' '+row.category).toLowerCase().includes(query.get('search').toLowerCase())||row.skills.includes(query.get('search')))&&(!query.get('category')||row.category.toLowerCase()===query.get('category').toLowerCase())&&(!query.get('pricingType')||row.pricingType===query.get('pricingType'))&&(!query.get('minPrice')||row.price!==null&&Number(row.price)>=Number(query.get('minPrice')))&&(!query.get('maxPrice')||row.price!==null&&Number(row.price)<=Number(query.get('maxPrice'))));
 const sort=query.get('sort');if(sort==='oldest')items.reverse();else if(sort==='price_asc'||sort==='price_desc')items.sort((a,b)=>a.price===null?1:b.price===null?-1:(Number(a.price)-Number(b.price))*(sort==='price_desc'?-1:1));
 const total=items.length,limit=12,page=Number(query.get('page')??1);return {services:items.slice((page-1)*limit,page*limit),meta:{page,limit,total,totalPages:Math.ceil(total/limit)}};
};
function Probe(){const route=useLocation(),navigate=useNavigate();useEffect(()=>{window.__qaLocation=route.pathname+route.search;window.__qaBack=()=>navigate(-1);window.__qaForward=()=>navigate(1);},[route,navigate]);return null;}
createRoot(document.querySelector('main')).render(<MemoryRouter initialEntries={['/services'+(params.get('query')?'?'+params.get('query'):'')]}><Probe/><Routes><Route path="/services" element={<ServicesBrowse/>}/><Route path="*" element={<p>Existing destination</p>}/></Routes></MemoryRouter>);window.__qaReady=true;
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
      name: 'isolated-services-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /services\/api-client$/ }, () => ({
          path: 'api',
          namespace: 'sv-qa',
        }));
        builder.onResolve({ filter: /auth\/useAuth$/ }, () => ({
          path: 'auth',
          namespace: 'sv-qa',
        }));
        builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'sv-qa' }));
        builder.onLoad({ filter: /.*/, namespace: 'sv-qa' }, ({ path }) => ({
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
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SYNTHETIC Campus Services Browse QA</title>${css}</head><body><div class="cc-app-shell min-h-screen"><main></main></div><script type="module" src="/fixture.js"></script></body></html>`,
  );
console.log('Generated actual Services Browse with synthetic data; external network disabled.');
