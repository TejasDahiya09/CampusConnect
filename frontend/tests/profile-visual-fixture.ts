/** Actual Profile, AppShell, API client contract and theme; synthetic records only. */
import { build } from 'esbuild';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const output = process.argv[2];
if (!output) throw new Error('Supply a private local QA directory.');
await mkdir(output, { recursive: true });
const assets = await readdir(resolve('frontend/dist/assets'));
const css = ['index-', 'ProfilePage-']
  .map((prefix) => {
    const asset = assets.find((name) => name.startsWith(prefix) && name.endsWith('.css'));
    if (!asset) throw new Error('Build frontend before Profile QA.');
    return `<link rel="stylesheet" href="/assets/${asset}">`;
  })
  .join('');
const bundle = await build({
  stdin: {
    sourcefile: 'profile-qa.tsx',
    resolveDir: resolve('frontend'),
    loader: 'tsx',
    contents: `
import {useEffect} from 'react';import {ProfileDraftProvider} from './src/features/profile/profile-drafts';import {useProfileDraft} from './src/features/profile/profile-draft-state';import {createRoot} from 'react-dom/client';import {BrowserRouter,MemoryRouter,Routes,Route,useLocation,useNavigate} from 'react-router-dom';
import {AppShell} from './src/app/AppShell';import {ProfilePage} from './src/features/profile/ProfilePage';import {ThemeProvider} from './src/features/theme/ThemeProvider';
import {profileFixture} from './tests/fixtures/profile-fixtures';
const params=new URLSearchParams(location.search),scenario=params.get('case')||'populated';
window.__qaUser='synthetic-profile-a';window.__qaRole=params.get('role')||'STUDENT';window.__qaStatus=scenario==='inactive'?'SUSPENDED':'ACTIVE';window.__qaCalls=[];window.__qaFail=false;window.__qaHold=false;window.__qaAbort=0;
localStorage.setItem('campusconnect-theme',document.documentElement.dataset.theme);
window.fetch=()=>Promise.reject(new Error('External network blocked in isolated Profile fixture'));
let current=structuredClone(profileFixture);
if(scenario==='empty')current={...current,bio:null,skills:[],interests:[],achievements:[],portfolioLinks:[],department:null,departmentId:null,year:null,location:null,avatar:null,completion:undefined};
if(scenario==='minimal')current={...current,displayName:'Alex',bio:null,skills:[],interests:[],achievements:[],portfolioLinks:[],department:null,departmentId:null,year:null,location:null,avatar:null,completion:{completed:2,total:10,percentage:20,criteria:{displayName:true,avatar:false,bio:false,department:false,year:false,skill:false,interest:false,achievement:false,portfolioLink:false,universityVerified:true}}};
if(scenario==='many-achievements')current.achievements=Array.from({length:12},(_,i)=>({id:'synthetic-achievement-'+i,title:'Synthetic milestone '+(i+1),description:'Student-written notes about a completed project and its outcome.',awardedAt:i%2===0?'2026-10-01':null}));
if(scenario==='no-linkedin')current.portfolioLinks=current.portfolioLinks.filter(link=>!link.url.includes('linkedin.com'));
if(scenario==='long'){current.displayName='Avery Morgan - Student Building Accessible and Collaborative Campus Experiences';current.bio=(current.bio+'\\n\\n').repeat(4);current.skills.push({id:'long',name:'A very long skill name demonstrating responsive accessible content presentation',proficiency:3});}
let professional={available:scenario==='native-professional'||scenario==='long',details:scenario==='native-professional'||scenario==='long'?{headline:scenario==='long'?'Student exploring accessible software, collaborative research and thoughtful product design across campus communities':'Student building accessible software',education:[{institution:'Synthetic College',qualification:'Computing student'}],experience:[{role:'Student project contributor',organization:'Synthetic campus team',description:scenario==='long'?'A long student-supplied experience description. '.repeat(15):'Built accessible interfaces with a student team.'}]}:null};
if(scenario==='professional-empty')professional={available:true,details:null};
professional.version=professional.available?'a'.repeat(64):null;
window.__qaProfessional=professional;window.__qaProfessionalStatus=scenario==='professional-retry'?503:0;window.__qaProfessionalDelay=0;
if(scenario==='gate-disabled-with-data')professional={available:false,details:{headline:'Must not display while disabled',education:[],experience:[]}};

const photoMode=scenario.startsWith('photo-');let photo={available:photoMode&&scenario!=='photo-disabled',avatar:null,version:photoMode&&scenario!=='photo-disabled'?'b'.repeat(64):null};window.__qaPhotoFail='';
if(photoMode){window.XMLHttpRequest=class{constructor(){this.upload={};this.status=0;}open(){}setRequestHeader(){}abort(){this.onabort?.();}send(blob){window.__qaPhotoBlob=blob;this.upload.onprogress?.({lengthComputable:true,loaded:blob.size/2,total:blob.size});if(window.__qaPhotoHoldUpload)return;setTimeout(()=>{this.status=window.__qaPhotoFail==='upload'?500:200;this.onload?.();},30);}};}
window.__qaApi=async(path,init={})=>{
 window.__qaCalls.push({path,method:init.method||'GET'});
 if(path.startsWith('/api/profile/me/photo')){
  const input=init.body?JSON.parse(init.body):{};
  if(path==='/api/profile/me/photo'&&!init.method)return {photo:structuredClone(photo)};
  if(!photo.available)throw Object.assign(new Error('Photo saving is not enabled.'),{status:503});
  if(path.endsWith('/uploads/complete')){if(window.__qaPhotoFail==='complete')throw Object.assign(new Error('Synthetic storage failure. Reload your profile.'),{status:503});photo={available:true,avatar:{type:'photo',id:'11111111-1111-4111-8111-111111111111',url:'https://cdn.example.test/profile-photos/11111111-1111-4111-8111-111111111111.png'},version:'c'.repeat(64)};current.avatar=photo.avatar;return {photo:structuredClone(photo)};}
  if(path.endsWith('/uploads'))return init.method==='DELETE'?{cancelled:true}:{ticket:'synthetic-owner-ticket',uploadUrl:'https://synthetic.s3.amazonaws.com/synthetic.png',requiredHeaders:{'content-type':'image/png'},expiresAt:new Date(Date.now()+300000).toISOString()};
  if(init.method==='DELETE'){photo={available:true,avatar:null,version:'d'.repeat(64)};current.avatar=null;return {photo:structuredClone(photo)};}
 }

 if(path==='/api/profile/me/professional'){
  if(window.__qaMalformedProfessional)return {professional:{available:true,details:{}}};
  if(scenario==='professional-loading'&&!window.__qaProfessionalReleased)await new Promise(r=>window.__qaProfessionalRelease=()=>{window.__qaProfessionalReleased=true;r();});
  if(scenario==='professional-network')throw new Error('Synthetic network failure');
  if(scenario==='professional-auth')throw Object.assign(new Error('Synthetic auth failure'),{status:401});
  if(scenario==='professional-server')throw Object.assign(new Error('Synthetic server failure'),{status:503});
  if(window.__qaProfessionalDelay)await new Promise(r=>setTimeout(r,window.__qaProfessionalDelay));
  if(window.__qaProfessionalStatus)throw Object.assign(new Error('Synthetic professional failure'),{status:window.__qaProfessionalStatus});
  if(window.__qaFail)throw Object.assign(new Error('Synthetic storage unavailable'),{status:503});
  professional=window.__qaProfessional;
  if(init.method==='PUT'){if(new Headers(init.headers).get('if-match')!=='"'+professional.version+'"')throw Object.assign(new Error('Synthetic conflict'),{status:409});professional={available:true,version:crypto.randomUUID().replaceAll('-','').repeat(2),details:JSON.parse(init.body)};window.__qaProfessional=professional;}
  return {professional:structuredClone(professional)};
 }
 if(scenario==='loading')return new Promise(()=>{});
 if(scenario==='error'||window.__qaFail)throw Object.assign(new Error('Synthetic profile unavailable'),{status:503});
 if(path==='/api/profile/options')return {options:{departments:[{id:'Computer Science',code:'CS',name:'Computer Science'}],interests:[],skills:[]}};
 if(path==='/api/profile/resume/analyze')return {status:'completed',skills:[{name:'Testing',category:'Computer Science',confidence:'high',method:'explicit_mention',evidence:'Synthetic document mentions Testing.'}]};
 if(path==='/api/profile/me'&&!init.method)return {profile:structuredClone(current)};
 const body=init.body?JSON.parse(init.body):{},id=path.split('/').at(-1),newId=crypto.randomUUID();
 if(path==='/api/profile/me')Object.assign(current,body);
 else if(path.includes('/skills')){if(init.method==='POST')current.skills.push({id:newId,...body});else if(init.method==='DELETE')current.skills=current.skills.filter(item=>item.id!==id);else current.skills=current.skills.map(item=>item.id===id?{...item,...body}:item);}
 else if(path.includes('/interests')){if(init.method==='POST')current.interests.push({id:newId,...body});else current.interests=current.interests.filter(item=>item.id!==id);}
 else {const key=path.includes('/achievements')?'achievements':'portfolioLinks';if(init.method==='POST')current[key].push({id:newId,...body});else if(init.method==='DELETE')current[key]=current[key].filter(item=>item.id!==id);else current[key]=current[key].map(item=>item.id===id?{...item,...body}:item);}
 return {profile:structuredClone(current)};
};
function DraftProbe(){const navigate=useNavigate();useProfileDraft('synthetic-draft',true);useEffect(()=>{window.__qaScopedNavigate=navigate;},[navigate]);return <h1>SYNTHETIC navigation guard</h1>;}
function Probe(){const location=useLocation(),navigate=useNavigate();useEffect(()=>{window.__qaPath=location.pathname+location.search;window.__qaNavigate=navigate;},[location,navigate]);return null;}
const nativeHistory=params.has('native-history');
if(nativeHistory){history.replaceState({idx:0,key:'home'},'', '/home');history.pushState({idx:1,key:'profile'},'', '/profile');}
const FixtureRouter=nativeHistory?BrowserRouter:MemoryRouter;
createRoot(document.querySelector('#fixture-root')).render(<ThemeProvider><FixtureRouter {...(nativeHistory?{}:{initialEntries:['/profile']})}><Probe/><Routes><Route element={<AppShell/>}><Route path="/profile" element={scenario==='navigation-guard'?<ProfileDraftProvider><DraftProbe/></ProfileDraftProvider>:<ProfilePage/>}/><Route path="*" element={<section className="cc-page"><h1>Verified existing destination</h1></section>}/></Route></Routes></FixtureRouter></ThemeProvider>);
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
      name: 'isolated-profile-boundaries',
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
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Synthetic Profile QA</title>${css}</head><body><div id="fixture-root"></div><script type="module" src="/fixture.js"></script></body></html>`,
  );
console.log(
  'Generated actual owner Profile + AppShell fixtures; synthetic DTOs only, external network blocked.',
);
