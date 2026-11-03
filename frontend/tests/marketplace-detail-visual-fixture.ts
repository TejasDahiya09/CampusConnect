/** Generates isolated real-controller fixtures. All auth/API boundaries are test-only mocks. */
import { build } from 'esbuild';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { detailFixture } from './marketplace-detail-fixture-data';

const output = process.argv[2];
if (!output) throw new Error('Supply a private temporary output directory.');
await mkdir(output, { recursive: true });
const assets = await readdir(resolve('frontend/dist/assets'));
const css = ['index-', 'ListingDetailPage-']
  .map((prefix) => {
    const file = assets.find((name) => name.startsWith(prefix) && name.endsWith('.css'));
    if (!file) throw new Error('Build the frontend before generating detail fixtures.');
    return `<link rel="stylesheet" href="/assets/${file}">`;
  })
  .join('');
const client = await build({
  stdin: {
    resolveDir: resolve('frontend'),
    sourcefile: 'detail-qa.tsx',
    loader: 'tsx',
    contents: `
    import { createElement } from 'react';
    import { createRoot } from 'react-dom/client';
    import { MemoryRouter } from 'react-router-dom';
    import { ListingDetailPage } from './src/features/marketplace/ListingDetailPage';
    import { ApiClientError } from './src/services/api-client';
    const scenario=new URL(location.href).searchParams.get('case') ?? 'visitor';
    const listing=${JSON.stringify(detailFixture)};
    if(scenario==='reference') {
      listing.title='MacBook Air M1 13-inch';
      listing.description='Synthetic reference fixture — not a real student listing.\\n\\nA compact laptop for coursework with its original charger. Arrange an in-person inspection before exchanging money.';
      listing.price='42000.00';
    }
    if(scenario==='calculator') {
      listing.title='Casio FX-991ES Plus Scientific Calculator';
      listing.description='A clean, student-owned Casio FX-991ES Plus scientific calculator ready for an on-campus handover.\\n\\n[campusconnect-examiner-demo-v1]';
      listing.price='850.00';
      listing.category={id:'calculators',name:'Calculators',slug:'calculators',parentId:null};
      listing.media=[{id:'calculator',url:'/qa-calculator.svg',sortOrder:1,width:800,height:800,mimeType:'image/svg+xml'}];
    }
    if(scenario==='sold'||scenario==='owner-sold') listing.status='SOLD';
    if(scenario==='single') listing.media=listing.media.slice(0,1);
    if(scenario==='single-portrait') listing.media=listing.media.slice(1,2);
    if(scenario==='single-square') listing.media=listing.media.slice(2,3);
    if(scenario==='empty') listing.media=[];
    if(scenario==='failed') listing.media=listing.media.map((image,index)=>({...image,url:'/missing-'+index+'.png'}));
    if(scenario==='fallback') listing.media.unshift({...listing.media[0],id:'broken',url:'/missing-primary.png',sortOrder:0});
    if(scenario==='long') { listing.title='QA very long student listing title '.repeat(6); listing.description='[campusconnect-examiner-demo-v1]\\n'+('First line of a detailed student description.\\nSecond line.\\n\\n').repeat(15); listing.price='9999999999.99'; listing.location='Synthetic North Campus Academic Resource Centre, '+ 'LongLocationName'.repeat(8); }
    const owned=scenario.startsWith('owner');
    window.__qaUser={id:owned?listing.sellerId:'33333333-3333-4333-8333-333333333333',status:'ACTIVE',role:'STUDENT'};
    window.__qaCalls=[]; window.__qaNavigation=null; window.__qaNetwork=0; window.__qaFailBookmark=false;
    window.fetch=async()=>{window.__qaNetwork++;throw new Error('External application requests are disabled in this fixture.');};
    window.__qaApi=async(path,init={})=>{
      const method=init.method ?? 'GET'; window.__qaCalls.push({path,method,body:init.body?JSON.parse(init.body):null});
      if(scenario==='loading'&&method==='GET') return new Promise(()=>{});
      await new Promise(done=>setTimeout(done,60));
      if(path==='/api/marketplace/listings/'+listing.id&&method==='GET') {
        if(scenario==='unavailable') throw new ApiClientError('LISTING_NOT_FOUND','Unavailable',404);
        if(scenario==='error') throw new ApiClientError('SERVICE_UNAVAILABLE','Please try again later.',503);
        return {listing:structuredClone(listing)};
      }
      if(path.endsWith('/view')&&method==='POST') return {accepted:true};
      if(path.endsWith('/bookmark')&&['POST','DELETE'].includes(method)) {
        if(window.__qaFailBookmark) throw new ApiClientError('TEST_FAILURE','Saved state could not be updated.',500);
        listing.isBookmarked=method==='POST';return {bookmarked:listing.isBookmarked,removed:true};
      }
      if(path==='/api/messages/conversations'&&method==='POST') {
        if(scenario==='contact-error') throw new ApiClientError('TEST_FAILURE','Conversation could not be opened.',503);
        return {conversation:{id:'qa-conversation'}};
      }
      if(path==='/api/marketplace/listings/'+listing.id&&method==='PATCH') {
        if(scenario==='owner-error') throw new ApiClientError('TEST_FAILURE','The listing could not be updated.',409);
        listing.status='SOLD';return {listing:structuredClone(listing)};
      }
      if(path==='/api/marketplace/listings/'+listing.id&&method==='DELETE') return {deleted:true};
      if(path==='/api/moderation/reports'&&method==='POST') return {report:{id:'qa-report'}};
      throw new Error('Unexpected fixture request: '+method+' '+path);
    };
    createRoot(document.querySelector('main')).render(createElement(MemoryRouter,null,createElement(ListingDetailPage,{id:listing.id,navigate:path=>{window.__qaNavigation=path;}})));
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
      name: 'isolated-detail-boundaries',
      setup(builder) {
        builder.onResolve({ filter: /services\/api-client$/ }, () => ({
          path: 'api',
          namespace: 'detail-fixture',
        }));
        builder.onResolve({ filter: /auth\/useAuth$/ }, () => ({
          path: 'auth',
          namespace: 'detail-fixture',
        }));
        builder.onResolve({ filter: /\.css$/ }, () => ({
          path: 'css',
          namespace: 'detail-fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'detail-fixture' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === 'auth'
              ? 'export const useAuth=()=>({applicationUser:window.__qaUser});'
              : path === 'css'
                ? ''
                : `export class ApiClientError extends Error { constructor(code,message,status){super(message);this.code=code;this.status=status;} } export const apiRequest=(...args)=>window.__qaApi(...args); export const apiRequestWithMeta=async(...args)=>({data:await window.__qaApi(...args)});`,
        }));
      },
    },
  ],
});
await writeFile(resolve(output, 'fixture.js'), client.outputFiles[0].text);
for (const theme of ['light', 'dark'])
  await writeFile(
    resolve(output, `${theme}.html`),
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Listing Details QA — synthetic data</title>${css}</head><body><div class="cc-app-shell min-h-screen"><main></main></div><script type="module" src="/fixture.js"></script></body></html>`,
  );
console.log(
  'Generated isolated detail-controller fixtures; auth and API calls cannot reach application services.',
);
