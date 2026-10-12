import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {WebSocket,WebSocketServer} from 'ws';
import {createPortal} from './portal.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const listen=async server=>{server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port;};
test('welcome page survives performer shutdown and service restart, preserves history and forwards live media',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'cardinal-portal-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 let offline=false;const connections=[];
 const info={profile:{artist:'Performer',title:'Test performance',bio:'Test biography',telegram_channel:'@examplelive',
  past:[{title:'A past show',date:'2026-10-10T20:00:00Z'}],upcoming:[]},live:true,publicOpen:true,showId:'stable-id',visitors:2,capacity:100};
 const upstream=http.createServer((req,res)=>{
  if(offline){res.writeHead(503);res.end();return;}
  if(req.url==='/show-info'){assert.equal(req.headers['x-forwarded-proto'],'https');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(info));}
  else{res.end('live-room-asset');}
 });
 const wss=new WebSocketServer({noServer:true});
 upstream.on('upgrade',(req,socket,head)=>{
  assert.equal(req.headers.origin,'https://live.example.org');assert.equal(req.headers['x-forwarded-proto'],'https');
  wss.handleUpgrade(req,socket,head,ws=>{connections.push(ws);ws.on('message',(data,binary)=>ws.send(data,{binary}));});
 });
 const address=await listen(upstream);const portal=await createPortal({upstream:address,directory,root,pollMs:0});const base=await listen(portal.server);
 t.after(async()=>{for(const ws of connections)ws.terminate();await portal.close();wss.close();upstream.closeAllConnections();await new Promise(resolve=>upstream.close(resolve));});
 await portal.poll();assert.equal((await (await fetch(base+'/show-info')).json()).showId,'stable-id');
 assert.equal(await (await fetch(base+'/room-app-test.js')).text(),'live-room-asset');
 const ws=new WebSocket(base.replace('http:','ws:')+'/room?invite=visitor',{origin:'https://live.example.org'});
 await once(ws,'open');const echoed=once(ws,'message');ws.send(Buffer.from([1,2,3,4]));assert.deepEqual((await echoed)[0],Buffer.from([1,2,3,4]));ws.close();await once(ws,'close');
 const settings=await (await fetch(base+'/notifications')).json();assert.equal(settings.url,'https://t.me/examplelive');assert.equal(settings.enabled,false);
 const invalid=new WebSocket(base.replace('http:','ws:')+'/performer?host=secret',{origin:'https://live.example.org'});await new Promise(resolve=>invalid.once('error',resolve));
 offline=true;await portal.poll();
 const quiet=await (await fetch(base+'/show-info')).json();assert.equal(quiet.live,false);assert.equal(quiet.publicOpen,false);assert.equal(quiet.profile.past[0].title,'A past show');
 assert.match(await (await fetch(base+'/')).text(),/Let me know/);
 const restarted=await createPortal({upstream:address,directory,root,pollMs:0});const restartBase=await listen(restarted.server);
 try{const saved=await (await fetch(restartBase+'/show-info')).json();assert.equal(saved.live,false);assert.equal(saved.profile.title,'Test performance');assert.equal(saved.profile.past.length,1);}finally{await restarted.close();}
 const redirect=await fetch(base+'/room.html?test=1',{headers:{'x-forwarded-proto':'http'},redirect:'manual'});assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'https://live.example.org/room.html?test=1');
});
