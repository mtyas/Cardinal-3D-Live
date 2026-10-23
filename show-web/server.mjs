// SPDX-License-Identifier: GPL-3.0-or-later
import http from 'node:http';
import { Worker } from 'node:worker_threads';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { authorizeUpgrade, publicOrigin, localAddress, validSecret, publicRedirect } from './hosting.mjs';
import {buildClient} from './build-client.mjs';
import { ShowHistory } from './show-history.mjs';
import {channelLink} from './telegram-announcer.mjs';
import {scenePatch} from './scene-delta.js';
import { Room } from './room.mjs';
import { ControlRelay } from './control-relay.mjs';
import {audioQuality} from './audio-quality.mjs';
import {RtcAudioRelay} from './rtc-audio-relay.mjs';
import {cloudflareTurnProvider} from './cloudflare-turn.mjs';
import {mergeVisualValues} from './visual-values.mjs';
const controls=new ControlRelay((socket,message)=>{
 if(rtc.sendControl(socket,message))return true;
 if(!socket||socket.readyState!==WebSocket.OPEN||socket.bufferedAmount>=65536)return false;
 socket.send(JSON.stringify(message));return true;
});
import { audioBlocks, validateShow } from './show-protocol.mjs';
const assets = new Map(); let assetBytes=0;
let nativePublisher = null, showState = null;
const sessionPath = process.env.CARDINAL_SHOW_SESSION_PATH || fileURLToPath(new URL('../.tools/show-room-session.json', import.meta.url));

let hosting={};
if(process.env.CARDINAL_SHOW_HOSTING_CONFIG)hosting=JSON.parse(await readFile(process.env.CARDINAL_SHOW_HOSTING_CONFIG,'utf8'));
const cfTurn=hosting.webrtc?.cloudflare_turn;
const iceProvider=cfTurn?cloudflareTurnProvider({...cfTurn,api_token_file:resolve(dirname(process.env.CARDINAL_SHOW_HOSTING_CONFIG),cfTurn.api_token_file)}):undefined;
const rtc=new RtcAudioRelay({config:hosting.webrtc||{},iceProvider,send:(socket,message)=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));},quality:socket=>audioQuality(socket,showState?.max_audio_kbps||64)});
const publicAddress=publicOrigin(process.env.CARDINAL_SHOW_PUBLIC_ORIGIN||hosting.public_origin);
const bindAddress=process.env.CARDINAL_SHOW_BIND||hosting.bind||'127.0.0.1';
if(bindAddress!=='127.0.0.1'&&!publicAddress)throw Error('A public HTTPS origin and invitation are required for non-local hosting');
const inviteToken=hosting.invite_token||randomBytes(24).toString('hex');
if(publicAddress&&!/^[a-f0-9]{48}$/.test(inviteToken))throw Error('Invalid invitation key');
const room = new Room(Date.now,publicAddress?101:64);
const encoder = new Worker(new URL('./opus-worker.mjs', import.meta.url));
let encodingJobs=0, encoderReady=true;
encoder.on('error', error=>{encoderReady=false;console.error('Audio encoder stopped:',error.message);});
encoder.on('message', m=>{
 if(m.done){encodingJobs=Math.max(0,encodingJobs-1);return;}
 if(m.error){console.error('Audio encoding failed:',m.error);return;}
 if(!showState||!m.packet)return;
 const sourceId=Buffer.from(m.packet).readBigUInt64LE(8).toString();
 if(!showState.speakers.some(s=>s.id===sourceId))return;
 rtc.packet(m);
 const cap=showState.max_audio_kbps;
 for(const guest of wss.clients){
  if(guest.audioCodec!=='opus'||guest.readyState!==WebSocket.OPEN||guest.bufferedAmount>=128*1024)continue;
  const quality=audioQuality(guest,cap);
  if(m.kbps===quality){guest.send(m.packet,{binary:true,compress:false});guest.audioBytes+=m.packet.length;}
 }
});
const token = randomBytes(24).toString('hex');
const port = Number(process.env.CARDINAL_SHOW_PORT || hosting.port || 8778);
const access={proxyAddress:hosting.proxy_address||'100.64.0.10',publicOrigin:publicAddress,inviteToken,hostToken:token,origins:[`http://localhost:${port}`,`http://127.0.0.1:${port}`,...(publicAddress?[publicAddress]:[])]};
const profilePath=process.env.CARDINAL_SHOW_PROFILE_PATH||fileURLToPath(new URL('./show-profile.json',import.meta.url));
const profile=JSON.parse(await readFile(profilePath,'utf8'));
access.publicOpen=false;
const showHistory=new ShowHistory(process.env.CARDINAL_SHOW_HISTORY_PATH||join(dirname(sessionPath),'show-history.json'));
await showHistory.load();
const relayVersion=JSON.parse(await readFile(new URL('./package.json',import.meta.url),'utf8')).version;
const clientBundle=await buildClient();
const root = fileURLToPath(new URL('.', import.meta.url));
const routes = new Map([
  ['/', ['index.html', 'text/html']], ['/room.html',['room.html','text/html']], ['/landing.js',['landing.js','text/javascript']], ['/landing.css',['landing.css','text/css']], ['/client.js', ['client.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']],
  ['/chat-board.js',['chat-board.js','text/javascript']],
  ['/stage-materials.js',['stage-materials.js','text/javascript']],
  ['/performer-hands.js',['performer-hands.js','text/javascript']],
  ['/appearance.js', ['appearance.js', 'text/javascript']],
  ['/show-audio.js', ['show-audio.js', 'text/javascript']],
  ['/show-worklet.js', ['show-worklet.js', 'text/javascript']],
  ['/show-objects.js', ['show-objects.js', 'text/javascript']],
  ['/rack-scene.js', ['rack-scene.js', 'text/javascript']],
  ['/show-scene.js', ['show-scene.js', 'text/javascript']],
  ['/vendor/three.module.js', ['node_modules/three/build/three.module.js', 'text/javascript']],
  ['/vendor/three.core.js', ['node_modules/three/build/three.core.js', 'text/javascript']],
  ['/vendor/VRButton.js', ['node_modules/three/examples/jsm/webxr/VRButton.js', 'text/javascript']],
]);
const server = http.createServer(async (req, res) => {
  if(publicAddress&&!localAddress(req.socket.remoteAddress)&&![access.proxyAddress,`::ffff:${access.proxyAddress}`].includes(req.socket.remoteAddress)){res.writeHead(403);res.end('Use the public show address.');return;}
  const secure=publicRedirect({address:req.socket.remoteAddress,forwardedProto:req.headers['x-forwarded-proto'],url:req.url},access);
  if(secure){res.writeHead(308,{'Location':secure,'Cache-Control':'no-store'});res.end();return;}
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ app: 'cardinal-3d-show-preview', version:relayVersion, webrtc:hosting.webrtc?.enabled!==false, webrtcPeers:rtc.peers.size, nativeConnected: Boolean(nativePublisher), visitors:room.members.size-(room.performer?1:0), capacity:publicAddress?100:63, publicOrigin:publicAddress })); return;
  }
  if(req.method==='GET'&&pathname==='/show-info'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({profile:{...profile,title:access.publicOpen?(showState?.session_title||profile.title):profile.title,past:[...showHistory.completed(),...(profile.past||[])]},live:Boolean(nativePublisher&&showState),publicOpen:access.publicOpen,showId:access.publicOpen?showHistory.active?.id||null:null,localPreview:!publicAddress,visitors:room.members.size-(room.performer?1:0),capacity:publicAddress?100:63}));return;}
  if(req.method==='GET'&&pathname==='/notifications'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({provider:'telegram',url:channelLink({channel:profile.telegram_channel}),enabled:false}));return;}
  if(req.method==='GET'&&pathname===clientBundle.path){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'});res.end(clientBundle.bytes);return;}
  const cached=assets.get(pathname.slice('/show-assets/'.length));
  if(req.method==='GET'&&pathname.startsWith('/show-assets/')&&cached){res.writeHead(200,{'Content-Type':cached.media,'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=31536000, immutable'});res.end(cached.bytes);return;}
  const route = routes.get(pathname);
  if (req.method !== 'GET' || !route) { res.writeHead(404); res.end(); return; }
  try {
    let bytes = await readFile(root + route[0]);
    if(route[0]==='room.html')bytes=Buffer.from(bytes.toString('utf8').replace('__ROOM_BUILD__',clientBundle.path));
    res.writeHead(200, { 'Content-Type': route[1] + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    res.end(bytes);
  } catch { res.writeHead(503); res.end('Run npm install in show-web first.'); }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024,
 perMessageDeflate:{threshold:1024,serverNoContextTakeover:true,clientNoContextTakeover:true,zlibDeflateOptions:{level:3},concurrencyLimit:4} });
function receiveAudio(ws,bytes){
 if (!showState) return;
        const blocks = audioBlocks(bytes);
        const sources = new Set(showState.speakers.map(s => s.id));
        if (blocks.some(b => !sources.has(b.id) || b.rate !== showState.sample_rate)) return;
        const qualities=new Set(rtc.qualities());
        for (const guest of wss.clients) {
         if(guest.audioCodec==='opus'&&guest.readyState===WebSocket.OPEN)qualities.add(audioQuality(guest,showState.max_audio_kbps));
         if(guest!==ws&&guest.audioCodec==='pcm'&&guest.readyState===WebSocket.OPEN&&guest.bufferedAmount<256*1024){guest.send(bytes,{binary:true,compress:false});guest.audioBytes+=bytes.length;}
        }
        if(qualities.size&&encoderReady&&encodingJobs<12){encodingJobs++;encoder.postMessage({type:'audio',bytes:Uint8Array.from(bytes),cap:showState.max_audio_kbps,qualities:[...qualities]});}
}
let nativeAudio=null;
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  const origin = req.headers.origin;
  if(!authorizeUpgrade({path:url.pathname,origin,address:req.socket.remoteAddress,host:url.searchParams.get('host'),invite:url.searchParams.get('invite')},access)){socket.destroy();return;}
  const isHost=url.searchParams.has('host');
  wss.handleUpgrade(req,socket,head,ws=>{ws.transport=socket;wss.emit('connection',ws,isHost,url.pathname==='/performer',validSecret(url.searchParams.get('invite'),inviteToken),url.pathname==='/performer-audio');});
});
wss.on('connection', (ws, isHost, isNative, invited, isNativeAudio) => {
  if(isNativeAudio){
   if(nativeAudio){ws.close(1008,'Audio publisher already connected');return;}
   nativeAudio=ws;ws.isNativeAudio=true;ws.alive=true;ws.on('pong',()=>{ws.alive=true;});
   let budget=240;const replenish=setInterval(()=>{budget=240;},1000);
   ws.on('message',(bytes,binary)=>{try{if(!binary||--budget<0)throw Error('Invalid audio');receiveAudio(ws,bytes);}catch{ws.close(1008,'Invalid native audio');}});
   ws.on('error',()=>{});ws.on('close',()=>{clearInterval(replenish);if(nativeAudio===ws)nativeAudio=null;});return;
  }
  let member;
  if(publicAddress&&!isHost&&room.members.size-(room.performer?1:0)>=100){ws.close(1008,'Room is full');return;}
  try { member = room.join(isHost); } catch (e) { ws.close(1008, e.message); return; }
  ws.invited=invited;ws.isNative=isNative;ws.isHost=isHost;
  ws.member=member;ws.audioCodec='off';ws.audioBytes=0;ws.sceneSending=false;ws.sceneRevision=-1;ws.lastSceneAt=0;ws.wireAt=Date.now();ws.wireBytes=ws.transport.bytesWritten;
  if (isNative) { encoder.postMessage({type:'reset'});nativePublisher = ws; room.update(member.id,{type:'identity',name:profile.artist});room.update(member.id, {type:'pose',position:[0,1.65,-3],yaw:0}); }
  ws.send(JSON.stringify({ type: 'welcome', id: member.id, role: member.role }));
  if(!isNative)ws.send(JSON.stringify({type:'rtc_available',enabled:hosting.webrtc?.enabled!==false}));
  controls.join(member.id,ws);if(isNative)controls.setHost(ws);
  let budget = isNative ? 240 : 60, chatAt = 0;
  if(!isNative)ws.acceptRtcControl=text=>{
   if(ws.readyState!==WebSocket.OPEN||--budget<0){ws.close(1008,'Too many messages');return;}
   try{const message=JSON.parse(text);if(message?.type?.startsWith('control_'))controls.handle(ws,member.id,message);}catch{ws.close(1008,'Invalid control message');}
  };
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  const replenish = setInterval(() => { budget = isNative ? 240 : 60; }, 1000);
  ws.on('message', (bytes, binary) => {
    if (--budget < 0) { ws.close(1008, 'Too many messages'); return; }
    try {
      if (!isNative && (binary || bytes.length > 65536)) throw Error('Visitor packet too large');
      if (binary) {
        if (!isNative) throw Error('Audio requires a native show');
        receiveAudio(ws,bytes);
        return;
      }
      const data = JSON.parse(bytes);
      if(!isNative&&data?.type==='rtc_answer'){rtc.answer(ws,data);return;}
      if(!isNative&&bytes.length>4096)throw Error('Visitor packet too large');
      if(!isNative&&data?.type==='rtc_request'){rtc.request(ws);return;}
      if(!isNative&&data?.type==='rtc_stop'){rtc.stop(ws);return;}
      if(typeof data?.type==='string'&&data.type.startsWith('control_')&&bytes.length>4096)throw Error('Control packet too large');
      if(controls.handle(ws,member.id,data))return;
      if(data.type==='asset'){
        if(!isNative || !/^[a-f0-9]{64}$/.test(data.id) || !['image/png','application/json'].includes(data.media) || typeof data.data!=='string'||data.data.length>700000)throw Error('Invalid asset');
        const payload=Buffer.from(data.data,'base64');
        if(payload.length>512*1024||createHash('sha256').update(payload).digest('hex')!==data.id)throw Error('Invalid asset hash');
        if(!assets.has(data.id)&&assetBytes+payload.length<=64*1024*1024){assets.set(data.id,{bytes:payload,media:data.media});assetBytes+=payload.length;}
        return;
      }
      if (data.type === 'show') {
        if (!isNative || bytes.length > 512 * 1024 || !validateShow(data)) throw Error('Invalid show');
        data.max_audio_kbps = [64,96,128].includes(data.max_audio_kbps) ? data.max_audio_kbps : 128;
        if(data.performer_pose)room.update(member.id,{type:'pose',...data.performer_pose});
        const wasPublic=access.publicOpen;access.publicOpen=data.public_show===true;
        if(publicAddress&&wasPublic&&!access.publicOpen)for(const guest of wss.clients)if(!guest.isNative&&!guest.isHost&&!guest.invited)guest.close(1008,'This session is now invitation-only');
        showHistory.update(access.publicOpen,data.session_title||profile.title);
        showState = mergeVisualValues(showState,data);rtc.updateScene(showState);encoder.postMessage({type:'retain',ids:data.speakers.map(s=>s.id)});return;
      }
      if (!data || typeof data !== 'object') return;
      if(data.type==='audio_codec'){ws.audioCodec=data.codec==='opus'&&encoderReady?'opus':data.codec==='pcm'?'pcm':'off';return;}
      if(data.type==='client_features'){ws.deltaScene=data.delta===true;ws.lowData=data.lowData===true;ws.sceneRevision=-1;ws.sceneBaseline=null;return;}
      if(data.type==='scene_resync'){ws.sceneRevision=-1;ws.sceneBaseline=null;return;}
      if (data.type === 'chat') { if (Date.now() - chatAt < 500) return; chatAt = Date.now(); }
      room.update(member.id, data);
    } catch { ws.close(1008, 'Invalid message'); }
  });
  ws.on('error', () => {});
  ws.on('close', () => { clearInterval(replenish);rtc.stop(ws); controls.leave(member.id,ws);room.leave(member.id); if (nativePublisher === ws) { nativePublisher = null;nativeAudio?.close(); showState = null;rtc.updateScene(null);access.publicOpen=false;showHistory.update(false,profile.title);encoder.postMessage({type:'reset'}); } });
});
let previousSnapshot=null,sceneRevision=0,lastFullLength=0;
const broadcast = setInterval(() => {
  controls.tick();
  const snapshot={...room.snapshot(),show:showState,nativeConnected:Boolean(nativePublisher)};
  // Room members mutate in place; retain an independent baseline for the next diff.
  snapshot.members=snapshot.members.map(m=>({...m,position:[...m.position],...(m.reaction?{reaction:{...m.reaction}}:{})}));
  const base=sceneRevision++;const patches=previousSnapshot?scenePatch(previousSnapshot,snapshot):null;
  let full=null;const fullPacket=()=>{if(full===null){full=JSON.stringify({...snapshot,revision:sceneRevision});lastFullLength=full.length;}return full;};
  const delta=patches?JSON.stringify({type:'room_delta',base,revision:sceneRevision,patches}):null;
  const now=Date.now();
  const audience=JSON.stringify({type:'room',serverTime:snapshot.serverTime,members:snapshot.members,chat:snapshot.chat,nativeConnected:snapshot.nativeConnected,revision:sceneRevision});
  for (const ws of wss.clients) if(!ws.isNativeAudio&&ws.readyState===WebSocket.OPEN&&!ws.sceneSending&&ws.bufferedAmount<16*1024&&now-ws.lastSceneAt>=(ws.lowData?95:0)){
    if(ws.isNative){ws.send(audience);ws.lastSceneAt=now;continue;}
    // Low-data clients skip frames: use their own baseline rather than sending full scenes again.
    let packet=null;
    if(ws.deltaScene&&ws.sceneBaseline){const localPatch=ws.sceneRevision===base?patches:scenePatch(ws.sceneBaseline,snapshot);if(localPatch){const encoded=ws.sceneRevision===base?delta:JSON.stringify({type:'room_delta',base:ws.sceneRevision,revision:sceneRevision,patches:localPatch});if(!lastFullLength||encoded.length<lastFullLength)packet=encoded;}}
    // Coalesce visual updates while compression/socket writes are in progress.
    // Otherwise async compression can queue stale scenes ahead of live audio.
    ws.sceneSending=true;ws.send(packet??fullPacket(),()=>{ws.sceneSending=false;});ws.sceneRevision=sceneRevision;ws.lastSceneAt=now;ws.sceneBaseline=ws.deltaScene?snapshot:null;
    if(ws.deltaScene&&now-ws.wireAt>=2000){const bytes=ws.transport.bytesWritten;ws.send(JSON.stringify({type:'connection_stats',bytesPerSecond:(bytes-ws.wireBytes)*1000/(now-ws.wireAt),audioBytesPerSecond:ws.audioBytes*1000/(now-ws.wireAt)}));ws.wireAt=now;ws.wireBytes=bytes;ws.audioBytes=0;}
  }
  previousSnapshot=snapshot;
}, 50);
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } }
}, 15000);
server.on('error', async error => {
  clearInterval(broadcast); clearInterval(heartbeat);encoder.terminate();
  if (error.code === 'EADDRINUSE') {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
      const data = await response.json();
      if (data.app === 'cardinal-3d-show-preview') {
        console.log(`The Show preview is already running. Open http://localhost:${port}`);
        console.log('Keep the original server window open; its private performer address remains valid.');
        process.exitCode = 0; return;
      }
    } catch {}
    console.error(`Port ${port} is used by another application. Set CARDINAL_SHOW_PORT to another port and launch again.`);
  } else console.error('Could not start the Show preview: ' + error.message);
  process.exitCode = 1;
});
server.listen(port, bindAddress, async () => {
  await mkdir(fileURLToPath(new URL('../.tools/', import.meta.url)), {recursive:true});
  await writeFile(sessionPath, JSON.stringify({url:`ws://127.0.0.1:${port}/performer?host=${token}`,visitor_url:publicAddress?`${publicAddress}/#invite=${inviteToken}`:`http://localhost:${port}`}), {mode:0o600});
  console.log(publicAddress?`Visitor invitation: ${publicAddress}/#invite=${inviteToken}`:`Visitor preview: http://localhost:${port}`);
  if(!publicAddress)console.log(`Performer preview: http://localhost:${port}/#host=${token}`);
  console.log('Native Show audio and visuals can connect. Internet mode requires the configured HTTPS proxy; public capacity is not yet load-certified.');
});
process.on('SIGINT', () => { rtc.close();encoder.terminate(); clearInterval(broadcast); clearInterval(heartbeat); for (const ws of wss.clients) ws.terminate(); wss.close(); server.close(); });
