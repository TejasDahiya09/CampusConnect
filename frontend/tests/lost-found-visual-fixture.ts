/** Real Lost & Found controllers, isolated auth/API boundaries and synthetic records only. */
import { build } from 'esbuild';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { lostFoundFixture } from './lost-found-fixture-data';

const output = process.argv[2];
if (!output) throw new Error('Supply a private temporary fixture directory.');
// Optional replay of real local FastAPI results for synthetic integration records only.
const liveAiQa: unknown = process.argv[3]
  ? JSON.parse(await readFile(process.argv[3], 'utf8'))
  : null;
await mkdir(output, { recursive: true });
const assets = await readdir(resolve('frontend/dist/assets'));
const css = ['index-', 'LostFoundPages-']
  .map((prefix) => {
    const file = assets.find((name) => name.startsWith(prefix) && name.endsWith('.css'));
    if (!file) throw new Error('Build frontend before generating Lost & Found fixtures.');
    return `<link rel="stylesheet" href="/assets/${file}">`;
  })
  .join('');
const bundle = await build({
  stdin: {
    resolveDir: resolve('frontend'),
    sourcefile: 'lost-found-qa.tsx',
    loader: 'tsx',
    contents: `
  import {useEffect} from 'react';import {createRoot} from 'react-dom/client';
  import {MemoryRouter,Routes,Route,useLocation,useNavigate} from 'react-router-dom';
  import {LostFoundPage,LostFoundDetailPage} from './src/features/lost-found/LostFoundPages';
  import {MyReportsPage} from './src/features/lost-found/MyReportsPage';
  import {MyListingsPage} from './src/features/marketplace/MyListingsPage';
  import {ApiClientError} from './src/services/api-client';
  const params=new URLSearchParams(location.search),scenario=params.get('case')??'lost',page=params.get('page')??'browse';
  const base=${JSON.stringify(lostFoundFixture)};
  const liveAiQa=${JSON.stringify(liveAiQa)};
  if(scenario==='owner-live-ai'&&liveAiQa)Object.assign(base,liveAiQa.source);
  const viewer='33333333-3333-4333-8333-333333333333';
  const owned=scenario.startsWith('owner');
  if(scenario==='found')base.type='FOUND';
  if(scenario==='resolved'||scenario==='owner-resolved'){base.status='RESOLVED';base.resolvedAt='2026-10-25T10:00:00Z';}
  if(scenario==='pending')base.status='CLAIM_PENDING';
  if(scenario==='matched')base.status='MATCHED';
  if(scenario==='archived')base.status='ARCHIVED';
  if(scenario==='removed')base.status='REMOVED';
  if(scenario==='single')base.images=base.images.slice(0,1);
  if(scenario==='no-images')base.images=[];
  if(scenario==='failed')base.images=base.images.map((image,index)=>({...image,url:'/missing-'+index+'.png'}));
  if(scenario==='fallback')base.images.unshift({...base.images[0],id:'broken',url:'/missing-primary.png',position:-1});
  if(scenario==='long'){base.title='Synthetic long report title '.repeat(7);base.description=('Long synthetic report description.\\nPreserve this paragraph.\\n\\n').repeat(30)+'[campusconnect-examiner-demo-v1]';base.location='Synthetic campus library '+ 'LongLocation'.repeat(8);}
  window.__qaUser={id:owned?base.reporterId:viewer,status:'ACTIVE',role:scenario==='moderator'?'MODERATOR':'STUDENT'};
  window.__qaCalls=[];window.__qaNetwork=0;window.__qaFailSave=false;window.__qaFailClaim=false;
  const claim={id:'44444444-4444-4444-8444-444444444444',claimantId:viewer,createdAt:'2026-10-25T11:00:00Z',message:'Synthetic private identifying evidence.',reviewedAt:null,reviewerId:null,status:'PENDING'};
  let claims=scenario==='pending'||owned||scenario==='moderator'||scenario==='claims-populated'?[claim]:[];
  if(scenario==='owner-empty')claims=[];
  let claimReads=0;
  const categories=['Accessories','Electronics','Identity card','Books','Clothing','Other'];
  const reports=Array.from({length:24},(_,index)=>({...structuredClone(base),id:index===0?base.id:String(index+1).padStart(8,'0')+'-1111-4111-8111-111111111111',type:index%2?'FOUND':'LOST',title:index%3?'Synthetic '+categories[index%6].toLowerCase()+' item':base.title,category:categories[index%6],location:index%2?'Student Centre':'Central Library',createdAt:new Date(Date.UTC(2026,9,25)-index*86400000).toISOString(),images:index===5?[]:index===11?[{...base.images[0],url:'/missing-card.png',position:0},...base.images]:base.images}));
  if(scenario==='long')reports.forEach(report=>{report.title=base.title;report.location=base.location;});
  window.fetch=async()=>{window.__qaNetwork++;throw new Error('External requests are disabled in this isolated fixture.');};
  window.__qaApi=async(path,init={})=>{
    const method=init.method??'GET',body=init.body?JSON.parse(init.body):null;
    window.__qaCalls.push({path,method,body});
    if(scenario==='loading'&&method==='GET')return new Promise(()=>{});
    await new Promise(done=>setTimeout(done,40));
    if(scenario==='error'&&method==='GET')throw new ApiClientError('SERVICE_UNAVAILABLE','Please try again later.',503);
    if(path==='/api/lost-found/my-reports')return {reports:scenario==='empty'?[]:reports};
    if(path.startsWith('/api/marketplace/my-listings?')){
      const page=Number(new URL(path,'https://fixture.test').searchParams.get('page'));
      const rows=scenario==='empty'?[]:reports.map(report=>({...report,price:'500.00',currency:'INR',condition:'GOOD',status:'ACTIVE',media:report.images,seller:report.reporter,sellerId:report.reporterId,category:{id:'books',name:'Books',slug:'books',parentId:null}}));
      return {listings:rows.slice((page-1)*12,page*12),meta:{page,limit:12,total:rows.length,totalPages:Math.ceil(rows.length/12)}};
    }
    if(path.startsWith('/api/lost-found/reports?')){
      const query=new URL(path,'https://fixture.test').searchParams;
      let rows=scenario==='empty'?[]:reports.filter(report=>['type','status','category'].every(key=>!query.get(key)||report[key].toLowerCase()===query.get(key).toLowerCase())&&(!query.get('location')||report.location.toLowerCase().includes(query.get('location').toLowerCase()))&&(!query.get('keyword')||(report.title+' '+report.description+' '+report.category+' '+report.location).toLowerCase().includes(query.get('keyword').toLowerCase()))&&(!query.get('dateFrom')||report.incidentDate>=query.get('dateFrom'))&&(!query.get('dateTo')||report.incidentDate<=query.get('dateTo')));
      rows.sort((a,b)=>query.get('sort')==='oldest'?a.createdAt.localeCompare(b.createdAt):query.get('sort')==='incident_newest'?b.incidentDate.localeCompare(a.incidentDate):b.createdAt.localeCompare(a.createdAt));
      const page=Number(query.get('page')??1),limit=Number(query.get('limit')??12);
      return {reports:structuredClone(rows.slice((page-1)*limit,page*limit)),meta:{page,limit,total:rows.length,totalPages:Math.ceil(rows.length/limit)}};
    }
    if(path.endsWith('/bookmark')){
      if(method==='GET')return {bookmarked:base.isBookmarked};
      if(window.__qaFailSave)throw new ApiClientError('TEST_FAILURE','Saved state could not be updated.',500);
      base.isBookmarked=method==='POST';return {bookmarked:base.isBookmarked,removed:true};
    }
    if(path.endsWith('/claims')&&method==='GET'){
      claimReads++;
      if(scenario==='claims-restricted')throw new ApiClientError('FORBIDDEN','Private server evidence must not render.',403);
      if(scenario==='claims-error'&&claimReads===1)throw new ApiClientError('SERVICE_UNAVAILABLE','Claims could not be loaded.',503);
      if(scenario==='claims-timeout'&&claimReads===1)return new Promise(()=>{});
      if(scenario==='claims-loading'&&claimReads===1)await new Promise(done=>{window.__qaReleaseClaims=done;});
      return {claims:structuredClone(owned||scenario==='moderator'?claims:claims.filter(item=>item.claimantId===viewer))};
    }
    if(path.endsWith('/claims')&&method==='POST'){
      if(window.__qaFailClaim)throw new ApiClientError('TEST_FAILURE','The claim could not be submitted.',503);
      claims=[{...claim,message:body.message}];return {claim:structuredClone(claims[0])};
    }
    if(path.endsWith('/review')){claims=claims.map(item=>({...item,status:body.status}));return {claim:claims[0]};}
    if(path.endsWith('/cancel')){claims=claims.map(item=>({...item,status:'CANCELLED'}));return {claim:claims[0]};}
    if(path.endsWith('/status')){base.status=body.status;return {report:structuredClone(base)};}
    if(path.endsWith('/matches')){
      if(window.__qaFailMatching)throw new ApiClientError('AI_MATCHING_UNAVAILABLE','Lost & Found matching is currently unavailable.',503);
      if(scenario==='owner-live-ai'&&liveAiQa)return structuredClone(window.__qaEmptyMatches?liveAiQa.empty:liveAiQa.matched);
      return {matcherVersion:'lf-semantic-v1',matches:[]};
    }
    if(path==='/api/moderation/reports'&&method==='POST')return {report:{id:'qa-moderation-report'}};
    if(path.startsWith('/api/lost-found/reports/')&&method==='GET'){
      if(scenario==='missing')throw new ApiClientError('LOST_FOUND_NOT_FOUND','This report is unavailable.',404);
      return {report:structuredClone(base)};
    }
    throw new Error('Unexpected fixture request '+method+' '+path);
  };
  function Probe(){const current=useLocation(),navigate=useNavigate();useEffect(()=>{window.__qaLocation=current.pathname+current.search;window.__qaBack=()=>navigate(-1);window.__qaForward=()=>navigate(1);},[current,navigate]);return null;}
  const initial=page==='my-listings'?'/marketplace/my-listings':page==='my-reports'?'/lost-found/my-reports':page==='browse'?'/lost-found'+(params.get('query')?'?'+params.get('query'):''):'/lost-found/'+base.id;
  createRoot(document.querySelector('main')).render(<MemoryRouter initialEntries={[initial]}><Probe/><Routes><Route path="/lost-found" element={<LostFoundPage/>}/><Route path="/lost-found/my-reports" element={<MyReportsPage/>}/><Route path="/marketplace/my-listings" element={<MyListingsPage/>}/><Route path="/lost-found/:id" element={<LostFoundDetailPage/>}/><Route path="*" element={<p>Existing destination</p>}/></Routes></MemoryRouter>);
  window.__qaReady=true;
`,
  },
  bundle: true,
  jsx: 'automatic',
  format: 'esm',
  write: false,
  platform: 'browser',
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'isolated-lost-found-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /services\/api-client$/ }, () => ({
          path: 'api',
          namespace: 'lf-fixture',
        }));
        builder.onResolve({ filter: /auth\/useAuth$/ }, () => ({
          path: 'auth',
          namespace: 'lf-fixture',
        }));
        builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'lf-fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'lf-fixture' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === 'auth'
              ? 'export const useAuth=()=>({applicationUser:window.__qaUser});'
              : path === 'css'
                ? ''
                : `export class ApiClientError extends Error {constructor(code,message,status){super(message);this.code=code;this.status=status;}} export const apiRequest=(...args)=>window.__qaApi(...args);export const apiRequestWithMeta=async(...args)=>{const {meta,...data}=await window.__qaApi(...args);return {data,meta};};`,
        }));
      },
    },
  ],
});
await writeFile(resolve(output, 'fixture.js'), bundle.outputFiles[0].text);
for (const theme of ['light', 'dark'])
  await writeFile(
    resolve(output, `${theme}.html`),
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Lost & Found QA — synthetic records</title>${css}</head><body><div class="cc-app-shell min-h-screen"><main></main></div><script type="module" src="/fixture.js"></script></body></html>`,
  );
console.log(
  'Generated isolated Lost & Found controller fixtures. Application requests and production writes are disabled.',
);
