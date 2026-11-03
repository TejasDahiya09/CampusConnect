/** Isolated synthetic data only. Real controller, API adapter and presentation components. */
import { build } from 'esbuild';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { teamUpFixtureProject } from './teamup-fixture-data';
const output = process.argv[2];
if (!output) throw new Error('Supply a private temporary fixture directory.');
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
    sourcefile: 'detail-qa.tsx',
    resolveDir: resolve('frontend'),
    loader: 'tsx',
    contents: `
import {useEffect} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route,useLocation} from 'react-router-dom';
import {TeamUpDetailPage} from './src/features/teamup/TeamUpDetail';import {ApiClientError} from './src/services/api-client';
const scenario=new URLSearchParams(location.search).get('case')??'eligible';
window.__qaScenario=scenario;window.__qaCalls=[];window.__qaNetwork=0;window.__qaFail=scenario==='error';window.__qaApplyFail=scenario==='apply-error';window.__qaRefreshFail=false;
window.fetch=()=>{window.__qaNetwork++;return Promise.reject(new Error('External requests blocked'));};
const project=${JSON.stringify(teamUpFixtureProject)};
const member={id:'33333333-3333-4333-8333-333333333333',avatar:null,displayName:'Synthetic QA teammate',department:'Fixture department'};
project.members=[member];project.currentMemberCount=2;project.deadline='2099-12-01';
project.viewerIsOwner=['owner','owner-empty','review-refresh-error'].includes(scenario);project.viewerIsMember=['member','message-error'].includes(scenario);
if(['pending','accepted','rejected'].includes(scenario))project.viewerApplicationStatus=scenario.toUpperCase();
if(scenario==='full'){project.status='FULL';project.currentMemberCount=4;}
if(scenario==='closed')project.status='COMPLETED';if(scenario==='archived')project.status='ARCHIVED';if(scenario==='expired')project.deadline='2020-01-01';
if(scenario==='sparse'){project.category=null;project.description='';project.requiredSkills=[];project.members=[];project.currentMemberCount=1;project.deadline=null;}
if(scenario==='long'){project.title='Synthetic long project title '+ 'UnbrokenProjectTitle'.repeat(12);project.description=('A detailed synthetic project overview about student collaboration. '.repeat(50))+'\\n\\nOriginal final paragraph.';project.requiredSkills=Array.from({length:16},(_,i)=>'Long skill '+i+' '+ 'Skill'.repeat(10));}
if(scenario==='long'){project.owner.displayName='Synthetic owner '+ 'LongName'.repeat(10);member.displayName='Synthetic teammate '+ 'LongMemberName'.repeat(7);}
const applicant={...member,id:'44444444-4444-4444-8444-444444444444',displayName:'Synthetic QA applicant'};
let applications=scenario==='owner-empty'?[]:[{applicant,applicantId:applicant.id,id:'55555555-5555-4555-8555-555555555555',createdAt:project.createdAt,message:'Synthetic application note.',reviewedAt:null,reviewerId:null,status:'PENDING'}];
window.__qaUser={id:project.viewerIsOwner?project.ownerId:project.viewerIsMember?member.id:'fixture-visitor',role:'STUDENT',status:'ACTIVE'};
window.__qaApi=async(path,init={})=>{
 const method=init.method??'GET';window.__qaCalls.push({path,method,body:init.body});await new Promise(done=>setTimeout(done,80));
 if(path==='/api/teamup/projects/'+project.id){
  if(scenario==='loading')return new Promise(()=>{});
  if(window.__qaFail||window.__qaRefreshFail)throw new ApiClientError('UNAVAILABLE','Project information unavailable.',503);
  return {project:structuredClone(project)};
 }
 if(path.endsWith('/recommended-students'))return {recommendations:[]};
 if(path.endsWith('/applications')&&method==='GET')return {applications:structuredClone(applications)};
 if(path.endsWith('/applications')&&method==='POST'){
  if(window.__qaApplyFail)throw new ApiClientError('UNAVAILABLE','Application could not be submitted.',503);
  project.viewerApplicationStatus='PENDING';return {application:{status:'PENDING',id:'application',applicantId:'fixture-visitor'}};
 }
 if(path.includes('/applications/')&&method==='PATCH'){
  const status=JSON.parse(init.body).status;applications[0].status=status;
  if(status==='ACCEPTED'){project.members.push(applicant);project.currentMemberCount++;}
  if(scenario==='review-refresh-error')window.__qaRefreshFail=true;
  const {members,...summary}=project;const {applicant:omitted,...record}=applications[0];return {project:summary,application:record};
 }
 if(path.endsWith('/status')){project.status=JSON.parse(init.body).status;const {members,...summary}=project;return {project:summary};}
 if(path==='/api/messages/conversations'){
  if(scenario==='message-error')throw new ApiClientError('FORBIDDEN','Conversation unavailable.',403);
  return {conversation:{id:'fixture-conversation'}};
 }
 if(path==='/api/moderation/reports')return {report:{id:'fixture-report'}};
 throw new Error('Unexpected fixture request '+method+' '+path);
};
window.__qaClipboard=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>window.__qaClipboard.push(value)},configurable:true});
function Probe(){const route=useLocation();useEffect(()=>{window.__qaLocation=route.pathname;},[route]);return null;}
createRoot(document.querySelector('main')).render(<MemoryRouter initialEntries={['/teamup/'+project.id]}><Probe/><Routes><Route path="/teamup/:id" element={<TeamUpDetailPage/>}/><Route path="*" element={<p>Existing destination</p>}/></Routes></MemoryRouter>);
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
      name: 'isolated-detail-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /services\/api-client$/ }, () => ({
          path: 'api',
          namespace: 'detail-qa',
        }));
        builder.onResolve({ filter: /auth\/useAuth$/ }, () => ({
          path: 'auth',
          namespace: 'detail-qa',
        }));
        builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'detail-qa' }));
        builder.onLoad({ filter: /.*/, namespace: 'detail-qa' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === 'css'
              ? ''
              : path === 'auth'
                ? 'export const useAuth=()=>({applicationUser:window.__qaUser,isAuthenticated:true});'
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
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic TeamUp Details QA</title>${css}</head><body><div class="cc-app-shell min-h-screen"><main></main></div><script type="module" src="/fixture.js"></script></body></html>`,
  );
console.log('Generated isolated synthetic TeamUp Details fixtures; production requests blocked.');
