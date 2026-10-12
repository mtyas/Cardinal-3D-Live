import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('real internet-mode relay accepts invited visitors and refuses missing keys while native control remains local',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cardinal-public-')),config=join(dir,'hosting.json'),session=join(dir,'session.json'),port=18881,invite='a'.repeat(48);
 await writeFile(config,JSON.stringify({public_origin:'https://live.example.org',invite_token:invite,bind:'127.0.0.1',port}));
 const server=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,CARDINAL_SHOW_HOSTING_CONFIG:config,CARDINAL_SHOW_SESSION_PATH:session},stdio:'ignore'});let guest,native,rejected,publicGuest;
 try{let metadata;for(let i=0;i<60;i++){try{metadata=JSON.parse(await readFile(session,'utf8'));break;}catch{await pause(50);}}assert.ok(metadata);assert.ok(metadata.visitor_url.includes('#invite='));
 rejected=new WebSocket(`ws://127.0.0.1:${port}/room`,{origin:'https://live.example.org'});await once(rejected,'error');
 guest=new WebSocket(`ws://127.0.0.1:${port}/room?invite=${invite}`,{origin:'https://live.example.org'});await once(guest,'open');
 native=new WebSocket(metadata.url);await once(native,'open');const health=await (await fetch(`http://127.0.0.1:${port}/health`)).json();assert.equal(health.nativeConnected,true);assert.equal(health.visitors,1);assert.equal(health.capacity,100);
 const info=()=>fetch(`http://127.0.0.1:${port}/show-info`).then(r=>r.json());
 let state=await info();assert.equal(state.live,false);assert.equal(state.publicOpen,false);assert.equal(state.profile.artist,'Performer');assert.deepEqual(state.profile.past,[]);assert.ok(!JSON.stringify(state).includes(invite));assert.ok(!JSON.stringify(state).includes(metadata.url));
 const html=await (await fetch(`http://127.0.0.1:${port}/`)).text();assert.ok(html.includes('/landing.js'));assert.ok(!html.includes('three.module'));const roomHtml=await (await fetch(`http://127.0.0.1:${port}/room.html`)).text();const app=roomHtml.match(/app.src='([^']+)'/)[1];assert.match(app,/^\/room-app-[a-f0-9]{16}\.js$/);const compiled=await fetch(`http://127.0.0.1:${port}${app}`);assert.equal(compiled.status,200);assert.ok(compiled.headers.get('content-type').startsWith('text/javascript'));assert.ok(!roomHtml.includes("import('/client.js')"));
 const show={type:'show',frame:0,sample_rate:48000,speakers:[],lights:[],public_show:true};native.send(JSON.stringify(show));await pause(80);state=await info();assert.equal(state.live,true);assert.equal(state.publicOpen,true);
 publicGuest=new WebSocket(`ws://127.0.0.1:${port}/room`,{origin:'https://live.example.org'});await once(publicGuest,'open');
 const closed=once(publicGuest,'close');native.send(JSON.stringify({...show,public_show:false}));await closed;assert.equal((await info()).publicOpen,false);assert.equal((await info()).profile.past.length,1);assert.equal(guest.readyState,WebSocket.OPEN);
 const disconnected=once(native,'close');native.close();await disconnected;await pause(30);assert.equal((await info()).live,false);
 }finally{publicGuest?.terminate();guest?.terminate();native?.terminate();rejected?.terminate();server.kill();await once(server,'exit');await rm(dir,{recursive:true,force:true});}
},{timeout:10000});
