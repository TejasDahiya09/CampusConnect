/** Real Browse controller with isolated synthetic API responses, no production access. */
import { build } from 'esbuild';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { teamUpFixtureProject } from './teamup-fixture-data';

const output = process.argv[2];
if (!output) throw new Error('Supply a private temporary QA directory.');
await mkdir(output, { recursive: true });
const assets = await readdir(resolve('frontend/dist/assets'));
const css = ['index-', 'TeamUpPages-']
  .map((prefix) => {
    const file = assets.find((name) => name.startsWith(prefix) && name.endsWith('.css'));
    if (!file) throw new Error('Build frontend before generating TeamUp fixtures.');
    return `<link rel="stylesheet" href="/assets/${file}">`;
  })
  .join('');
const bundle = await build({
  stdin: {
    sourcefile: 'teamup-qa.tsx',
    resolveDir: resolve('frontend'),
    loader: 'tsx',
    contents: `
import {useEffect} from 'react';import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,useLocation,useNavigate} from 'react-router-dom';
import {TeamUpPage} from './src/features/teamup/TeamUpPages';
import {ApiClientError} from './src/services/api-client';
const params=new URLSearchParams(location.search),scenario=params.get('case')??'populated';
const base=${JSON.stringify(teamUpFixtureProject)};
const titles=['Campus resource exchange','Open-source study planner','Accessible campus navigation','Student sustainability research','Community podcast project','Peer learning toolkit','Campus event discovery','Collaborative design journal'];
const projects=Array.from({length:32},(_,index)=>({...base,id:String(index+1).padStart(8,'0')+'-1111-4111-8111-111111111111',title:titles[index%8],category:index===1?null:index%2?'Research & learning':'Student initiative',requiredSkills:index===2?[]:index%2?['Python','Research']:['React','UI/UX','Research'],deadline:index===3?null:'2026-12-'+String(index%20+1).padStart(2,'0'),createdAt:new Date(Date.UTC(2026,9,26)-index*86400000).toISOString(),status:index<24?'OPEN':index<28?'FULL':index<30?'COMPLETED':'ARCHIVED',currentMemberCount:index>=24&&index<28?4:index%3+1}));
if(scenario==='long')projects.forEach(project=>{project.title='Synthetic long project title '+ 'LongProjectTitle'.repeat(6);project.description='Long synthetic description '.repeat(35);project.category='LongCategory'.repeat(7);project.requiredSkills=['LongSkill'.repeat(5),'React','Research','Python','UI/UX','Testing'];});
if(scenario==='sparse')projects.forEach(project=>{project.category=null;project.deadline=null;project.requiredSkills=[];});
window.__qaCalls=[];window.__qaNetwork=0;window.__qaFailCatalog=scenario==='error';window.__qaFailRecommendations=scenario==='recommendation-error';window.__qaDelayKeyword=null;window.__qaAborted=0;
window.fetch=async()=>{window.__qaNetwork++;throw new Error('External requests disabled in synthetic TeamUp fixture.');};
window.__qaApi=async(path,init={})=>{
 const call={path,method:init.method??'GET',aborted:false};window.__qaCalls.push(call);init.signal?.addEventListener('abort',()=>{call.aborted=true;window.__qaAborted++;});
 await new Promise(done=>setTimeout(done,30));
 if(path==='/api/teamup/recommended-projects'){
  if(window.__qaFailRecommendations)throw new ApiClientError('UNAVAILABLE','Recommendations unavailable.',503);
  if(scenario==='recommendation-loading')await new Promise(done=>window.__qaReleaseRecommendations=done);
  return {projects:scenario==='empty'||scenario==='recommendation-empty'?[]:projects.slice(0,4).map(project=>({project,match:{label:'Relevant skill alignment',matchedSkills:['React'],missingSkills:['Research'],reasons:['Matches an approved profile skill: React.'],score:0.7,semanticAvailable:false}}))};
 }
 if(path.startsWith('/api/teamup/projects?')){
  const query=new URL(path,'https://fixture.test').searchParams;
  if(scenario==='loading')return new Promise(()=>{});
  if(window.__qaFailCatalog)throw new ApiClientError('UNAVAILABLE','Projects unavailable. Please retry.',503);
  if(window.__qaDelayKeyword!==null&&query.get('keyword')===window.__qaDelayKeyword)await new Promise(done=>window.__qaReleaseLate=done);
  let rows=scenario==='empty'?[]:projects.filter(project=>(!query.get('status')||project.status===query.get('status'))&&(!query.get('skill')||project.requiredSkills.includes(query.get('skill')))&&(!query.get('keyword')||(project.title+' '+project.description+' '+project.category).toLowerCase().includes(query.get('keyword').toLowerCase())||project.requiredSkills.includes(query.get('keyword'))));
  rows.sort((a,b)=>query.get('sort')==='oldest'?a.createdAt.localeCompare(b.createdAt):query.get('sort')==='deadline'?a.deadline===b.deadline?0:a.deadline===null?1:b.deadline===null?-1:a.deadline.localeCompare(b.deadline):b.createdAt.localeCompare(a.createdAt));
  const page=Number(query.get('page')??1),limit=Number(query.get('limit')??12);
  return {projects:rows.slice((page-1)*limit,page*limit),meta:{page,limit,total:rows.length,totalPages:Math.ceil(rows.length/limit)}};
 }
 throw new Error('Unexpected synthetic TeamUp API request: '+path);
};
function Probe(){const route=useLocation(),navigate=useNavigate();useEffect(()=>{window.__qaLocation=route.pathname+route.search;window.__qaBack=()=>navigate(-1);window.__qaForward=()=>navigate(1);},[route,navigate]);return null;}
createRoot(document.querySelector('main')).render(<MemoryRouter initialEntries={['/teamup'+(params.get('query')?'?'+params.get('query'):'')]}><Probe/><Routes><Route path="/teamup" element={<TeamUpPage/>}/><Route path="*" element={<p>Existing destination</p>}/></Routes></MemoryRouter>);window.__qaReady=true;
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
      name: 'isolated-teamup-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /services\/api-client$/ }, () => ({
          path: 'api',
          namespace: 'tu-qa',
        }));
        builder.onResolve({ filter: /auth\/useAuth$/ }, () => ({
          path: 'auth',
          namespace: 'tu-qa',
        }));
        builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'tu-qa' }));
        builder.onLoad({ filter: /.*/, namespace: 'tu-qa' }, ({ path }) => ({
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
    resolve(output, `${theme}.html`),
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic TeamUp Browse QA</title>${css}</head><body><div class="cc-app-shell min-h-screen"><main></main></div><script type="module" src="/fixture.js"></script></body></html>`,
  );
console.log(
  'Generated isolated TeamUp Browse fixtures. Synthetic records only; production requests disabled.',
);
