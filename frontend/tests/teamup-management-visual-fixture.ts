/** Synthetic API boundaries; real forms, workspace, review and consent components. */
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
    if (!file) throw new Error('Build frontend first.');
    return `<link rel="stylesheet" href="/assets/${file}">`;
  })
  .join('');
const bundle = await build({
  stdin: {
    sourcefile: 'management-qa.tsx',
    resolveDir: resolve('frontend'),
    loader: 'tsx',
    contents: `
import {useEffect} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';
import {TeamUpCreatePage,TeamUpEditPage} from './src/features/teamup/TeamUpProjectForm';import {MyProjectsPage} from './src/features/teamup/TeamUpWorkspace';import {ApiClientError} from './src/services/api-client';
const params=new URLSearchParams(location.search),view=params.get('view')??'create',scenario=params.get('case')??'populated';
const project={...${JSON.stringify(teamUpFixtureProject)},viewerIsOwner:true,featuredOnLanding:true,members:[],deadline:'2026-12-01'};
if(scenario==='non-owner')project.viewerIsOwner=false;if(scenario==='closed')project.status='COMPLETED';if(scenario==='consent-missing')delete project.featuredOnLanding;
const applicant={id:'33333333-3333-4333-8333-333333333333',displayName:'Synthetic QA applicant',avatar:null,department:'Fixture department'};
let applications=scenario==='review-empty'?[]:[{id:'44444444-4444-4444-8444-444444444444',applicant,applicantId:applicant.id,message:'Synthetic application note. I can contribute research and interface design.',createdAt:project.createdAt,reviewedAt:null,reviewerId:null,status:'PENDING'}];
if(scenario==='long'){project.title=('Synthetic student collaboration '+ 'LongProjectName'.repeat(10)).slice(0,180);applications[0].message='Synthetic application note. '+ 'LongUnbrokenApplicationNote'.repeat(20);}
const workspace=()=>({owned:scenario==='empty'?[]:[project,...['FULL','COMPLETED','ARCHIVED'].map((status,index)=>({...project,id:'55555555-5555-4555-8555-55555555555'+index,title:'Synthetic '+status.toLowerCase()+' project',status,currentMemberCount:status==='FULL'?4:2}))],joined:scenario==='empty'?[]:[{...project,id:'66666666-6666-4666-8666-666666666666',viewerIsOwner:false,viewerIsMember:true,title:'Synthetic joined project'}],applications:scenario==='empty'?[]:['PENDING','ACCEPTED','REJECTED'].map((status,index)=>({...applications[0],id:'app-'+index,status,project:{...project,viewerIsOwner:false,title:'Synthetic '+status.toLowerCase()+' application project'}}))});
window.__qaCalls=[];window.__qaNetwork=0;window.__qaFailRead=scenario==='error';window.__qaFailWrite=scenario==='submit-error';window.__qaRefreshFail=false;window.__qaReviewFail=scenario==='review-error';
window.fetch=()=>{window.__qaNetwork++;return Promise.reject(new Error('External requests blocked'));};
window.__qaApi=async(path,init={})=>{
 const method=init.method??'GET';window.__qaCalls.push({path,method,body:init.body});await new Promise(done=>setTimeout(done,120));
 if(method==='GET'&&(window.__qaFailRead||window.__qaRefreshFail))throw new ApiClientError('UNAVAILABLE','Project information is unavailable. Please retry.',503);
 if(scenario==='loading'&&method==='GET')return new Promise(()=>{});
 if(path==='/api/teamup/workspace')return structuredClone(workspace());
 if(path==='/api/teamup/projects'&&method==='POST'){
  if(window.__qaFailWrite)throw new ApiClientError('SAVE_FAILED','The project could not be saved. Please retry.',503);
  return {project:{...project,...JSON.parse(init.body)}};
 }
 if(path==='/api/teamup/projects/'+project.id){
  if(method==='PATCH'){
   if(window.__qaFailWrite)throw new ApiClientError('SAVE_FAILED','The project could not be saved. Please retry.',503);
   Object.assign(project,JSON.parse(init.body));
  }
  return {project:structuredClone(project)};
 }
 if(path.endsWith('/applications')&&method==='GET')return {applications:structuredClone(applications)};
 if(path.includes('/applications/')&&method==='PATCH'){
  if(window.__qaReviewFail)throw new ApiClientError('REVIEW_CONFLICT','The application cannot be reviewed right now.',409);
  const status=JSON.parse(init.body).status;applications[0].status=status;
  if(status==='ACCEPTED'){project.members=[applicant];project.currentMemberCount=2;}
  if(scenario==='refresh-error')window.__qaRefreshFail=true;
  const {applicant:omitted,...record}=applications[0];const {members,...summary}=project;return {application:record,project:summary};
 }
 throw new Error('Unexpected synthetic request '+method+' '+path);
};
function Probe(){const route=useLocation();useEffect(()=>{window.__qaLocation=route.pathname;},[route]);return null;}
const route=view==='create'?'/teamup/new':view==='edit'?'/teamup/'+project.id+'/edit':'/teamup/my-projects';
createRoot(document.querySelector('main')).render(<MemoryRouter initialEntries={[route]}><Probe/><Routes><Route path="/teamup/new" element={<TeamUpCreatePage/>}/><Route path="/teamup/:id/edit" element={<TeamUpEditPage/>}/><Route path="/teamup/my-projects" element={<MyProjectsPage/>}/><Route path="*" element={<p>Existing destination</p>}/></Routes></MemoryRouter>);
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
      name: 'management-api-boundary',
      setup(builder) {
        builder.onResolve({ filter: /services\/api-client$/ }, () => ({
          path: 'api',
          namespace: 'management-qa',
        }));
        builder.onResolve({ filter: /\.css$/ }, () => ({
          path: 'css',
          namespace: 'management-qa',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'management-qa' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === 'css'
              ? ''
              : 'export class ApiClientError extends Error{constructor(code,message,status){super(message);this.code=code;this.status=status;}}export const apiRequest=(...args)=>window.__qaApi(...args);export const apiRequestWithMeta=apiRequest;',
        }));
      },
    },
  ],
});
await writeFile(resolve(output, 'fixture.js'), bundle.outputFiles[0].text);
for (const theme of ['light', 'dark'])
  await writeFile(
    resolve(output, `${theme}.html`),
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic TeamUp Management QA</title>${css}</head><body><div class="cc-app-shell min-h-screen"><main></main></div><script type="module" src="/fixture.js"></script></body></html>`,
  );
console.log('Generated synthetic TeamUp management fixtures. No production requests or records.');
