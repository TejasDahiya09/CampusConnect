/** Actual MessagesPage + AppShell; isolated synthetic transport, identity and records only. */
import { build } from 'esbuild';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = process.argv[2];
if (!output) throw new Error('Supply private QA output directory.');
await mkdir(output, { recursive: true });
const assets = await readdir(resolve('frontend/dist/assets'));
const css = ['index-', 'MessagesPage-']
  .map((prefix) => {
    const file = assets.find((name) => name.startsWith(prefix) && name.endsWith('.css'));
    if (!file) throw new Error('Build frontend first: missing ' + prefix);
    return `<link rel="stylesheet" href="/assets/${file}">`;
  })
  .join('');
const bundle = await build({
  stdin: {
    sourcefile: 'messaging-qa.tsx',
    resolveDir: resolve('frontend'),
    loader: 'tsx',
    contents: `
import {useEffect} from 'react'; import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route,useNavigate,useLocation} from 'react-router-dom';
import {MessagesPage} from './src/features/messaging/MessagesPage';import {AppShell} from './src/app/AppShell';import {ThemeProvider} from './src/features/theme/ThemeProvider';import {ApiClientError} from './src/services/api-client';
localStorage.setItem('campusconnect-theme',document.documentElement.dataset.theme);
window.fetch=()=>Promise.reject(new Error('External network blocked in synthetic fixture'));
const params=new URLSearchParams(location.search),scenario=params.get('case')||'populated';
window.__qaCalls=[];window.__qaUid='fixture';window.__qaFailSend=false;window.__qaDelaySend=false;window.__qaDelayHistory=false;
window.__qaListeners=new Map();window.__qaSocketCount=0;window.__qaUnread=6;window.__qaSockets=[];
const message=(n,c='a')=>({id:'message-'+c+'-'+String(n).padStart(3,'0'),conversationId:c,senderId:n%3===0?'fixture':'other',text:n===118?'A longer synthetic message.\\nLine breaks remain intact.\\n'+('unbroken'.repeat(30)):'Synthetic campus conversation message '+n,sentAt:new Date(Date.UTC(2026,9,30,10,n)).toISOString(),read:false});
window.__qaMessages={a:Array.from({length:120},(_,i)=>message(i+1)),b:[message(1,'b')]};
const person={id:'other',displayName:scenario==='redacted'?'Campus student':'Synthetic student',avatar:null,department:null};
const conversations=['a','b'].map((id,i)=>({id,contextId:'context-'+id,contextType:i?'TEAMUP':'MARKETPLACE',contextLabel:scenario==='redacted'?'Context unavailable':i?'Student research project':'Campus study essentials',contextPath:scenario==='redacted'?null:i?'/teamup/project':'/marketplace/listing',createdAt:'2026-10-30T10:00:00Z',updatedAt:'2026-10-30T12:00:00Z',otherParticipant:{...person,displayName:i?'Synthetic project lead':person.displayName},lastMessage:window.__qaMessages[id].at(-1),unreadCount:3}));
window.__qaApi=async(path,init={})=>{
 const method=init.method||'GET', body=init.body?JSON.parse(init.body):undefined;window.__qaCalls.push({path,method,body});
 const url=new URL(path,'http://fixture'),cid=url.pathname.split('/')[3];
 if(url.pathname.startsWith('/api/notifications'))return url.pathname.endsWith('/unread-count')?{count:0}:{notifications:[],pagination:{total:0,totalPages:1}};
 if(url.pathname==='/api/messages'){
  if(scenario==='inbox-error')throw new ApiClientError('ERROR','Synthetic inbox failure',403);
  const ctx=url.searchParams.get('contextType'),q=url.searchParams.get('search')?.toLowerCase();
  return {conversations:scenario==='empty'?[]:conversations.filter(c=>(!ctx||ctx===c.contextType)&&(!q||(c.otherParticipant.displayName+' '+c.contextLabel).toLowerCase().includes(q))),unread:{total:window.__qaUnread,byContext:{DIRECT:0,MARKETPLACE:3,TEAMUP:3,SERVICE:0}}};
 }
 if(url.pathname.endsWith('/updates')){const all=url.searchParams.get('mode')==='recent'?[...(window.__qaMessages[cid]||[])].filter(m=>!url.searchParams.get('floor')||m.sentAt>=(window.__qaMessages[cid].find(n=>n.id===url.searchParams.get('floor'))?.sentAt||'')).reverse():window.__qaMessages[cid]||[],after=url.searchParams.get('after'),start=after==='start'?0:all.findIndex(m=>m.id===after)+1,items=all.slice(start,start+100);return {messages:items,hasMore:start+100<all.length,nextCursor:items.at(-1)?.id||after,readReceipt:'signed-updates-'+cid+'-'+start};}
 if(path.endsWith('/read')){if(scenario==='read-error')throw new ApiClientError('ERROR','Read failed',403);return {updated:1};}
 if(method==='POST'){
  if(window.__qaDelaySend)await new Promise(done=>window.__qaFinishSend=done);
  if(window.__qaFailSend)throw new ApiClientError('NETWORK','Synthetic send not confirmed',503);
  let existing=window.__qaMessages[cid].find(m=>m.id===body.clientMessageId);
  if(existing)return {message:existing};
  const item={...message(130,cid),id:body.clientMessageId,senderId:'fixture',text:body.text,sentAt:'2026-11-01T00:00:00Z'};window.__qaMessages[cid].push(item);if(window.__qaLoseResponseOnce){window.__qaLoseResponseOnce=false;throw new ApiClientError('NETWORK','Synthetic response lost after commit',503);}return {message:item};
 }
 if(scenario==='loading')await new Promise(()=>{});
 if(scenario==='history-error')throw new ApiClientError('ERROR','Synthetic conversation unavailable',403);
 if(window.__qaDelayHistory)await new Promise(done=>window.__qaFinishHistory=done);
 const page=Number(url.searchParams.get('page')||1),limit=Number(url.searchParams.get('limit')||50),all=window.__qaMessages[cid]||[];
 const items=scenario==='empty-thread'?[]:all.slice(Math.max(0,all.length-page*limit),all.length-(page-1)*limit);
 return {messages:items,readReceipt:'signed-fixture-'+cid+'-'+page};
};
function Probe(){const navigate=useNavigate(),route=useLocation();useEffect(()=>{window.__qaNavigate=navigate;window.__qaLocation=route.pathname;},[navigate,route]);return null;}
createRoot(document.querySelector('#fixture-root')).render(<ThemeProvider><MemoryRouter initialEntries={[params.get('inbox')?'/messages':'/messages/a']}><Probe/><Routes><Route element={<AppShell/>}><Route path="/messages" element={<MessagesPage/>}/><Route path="/messages/:id" element={<MessagesPage/>}/></Route></Routes></MemoryRouter></ThemeProvider>);
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
      name: 'isolated-messaging-boundaries',
      setup(builder) {
        const boundaries: Record<string, string> = {
          'services/api-client': 'api',
          'auth/useAuth': 'auth',
          'lib/supabase': 'supabase',
          'socket.io-client': 'socket',
        };
        for (const [suffix, path] of Object.entries(boundaries))
          builder.onResolve({ filter: new RegExp(suffix.replaceAll('/', '\\/') + '$') }, () => ({
            path,
            namespace: 'msg-qa',
          }));
        builder.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'msg-qa' }));
        builder.onLoad({ filter: /.*/, namespace: 'msg-qa' }, ({ path }) => ({
          loader: 'js',
          resolveDir: resolve('frontend'),
          contents:
            path === 'css'
              ? ''
              : path === 'api'
                ? 'export class ApiClientError extends Error {constructor(code,message,status){super(message);this.code=code;this.status=status;}} export const apiRequest=(...args)=>window.__qaApi(...args);'
                : path === 'auth'
                  ? `import {useState,useEffect} from 'react';export function useAuth(){const [id,set]=useState(window.__qaUid);useEffect(()=>{const fn=()=>set(window.__qaUid);window.addEventListener('qa-account',fn);return ()=>window.removeEventListener('qa-account',fn)},[]);return {applicationUser:{id,role:'STUDENT',status:'ACTIVE'},isAuthenticated:true,logout:async()=>{}};}`
                  : path === 'supabase'
                    ? 'export const getSupabaseClient=()=>({auth:{getSession:async()=>({data:{session:window.__qaUid?{user:{id:window.__qaUid},access_token:window.__qaToken||"synthetic-only",expires_at:Date.now()/1000+3600}:null}}),onAuthStateChange(fn){const handler=()=>fn("TOKEN_REFRESHED",window.__qaUid?{user:{id:window.__qaUid},access_token:window.__qaToken||"synthetic-only",expires_at:Date.now()/1000+3600}:null);window.addEventListener("qa-auth",handler);return {data:{subscription:{unsubscribe(){window.removeEventListener("qa-auth",handler)}}}};}}});'
                    : path === 'socket'
                      ? `export function io(_url,options){window.__qaSocketCount++;const callbacks=new Map();const socket={connected:false,active:true,io:{on(){},off(){}},on(event,fn){callbacks.set(event,fn);window.__qaListeners.set(event,fn);return socket;},connect(){options.auth(credentials=>{if(credentials.token){socket.connected=true;callbacks.get('connect')?.();}});return socket;},removeAllListeners(){for(const [event,fn] of callbacks)if(window.__qaListeners.get(event)===fn)window.__qaListeners.delete(event);callbacks.clear();},disconnect(){socket.connected=false;}};window.__qaSockets.push(socket);return socket;}`
                      : 'export const notificationsChangedEvent="qa-notifications";export const announceNotificationsChanged=()=>{};export const mergeNotifications=(a,b)=>[b,...a];export const notificationActionState=()=>({});export const notificationsService={list:async()=>({notifications:[],pagination:{total:0}}),count:async()=>0};export const connectNotificationSocket=async()=>({disconnect(){}});',
        }));
      },
    },
  ],
});
await writeFile(resolve(output, 'fixture.js'), bundle.outputFiles[0].text);
for (const theme of ['light', 'dark'])
  await writeFile(
    resolve(output, theme + '.html'),
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SYNTHETIC Messaging QA</title>${css}</head><body><div id="fixture-root"></div><script type="module" src="/fixture.js"></script></body></html>`,
  );
console.log('Isolated Messaging + AppShell fixtures generated. Synthetic data only.');
