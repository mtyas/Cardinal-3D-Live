// SPDX-License-Identifier: GPL-3.0-or-later
// Exercises the real relay encoder, WASM decoder and playback worklet together.
import {WebSocket} from 'ws';
import {OpusDecoderWebWorker} from 'opus-decoder';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {applyScenePatch} from './scene-delta.js';
const mode=process.argv[2];
const publicSession=['--public-session','--public-uncompressed-session','--local-session','--portal-session'].includes(mode)?JSON.parse(readFileSync(process.argv[3],'utf8')):null;
const visitor=publicSession?new URL(publicSession.visitor_url):null;
const destination=mode==='--local-session'?`ws://${new URL(publicSession.url).host}`:mode==='--portal-session'?process.env.CARDINAL_SHOW_DIAGNOSTIC_PORTAL:visitor?.origin.replace('https:','wss:');
if(mode==='--portal-session'&&!destination)throw Error('Set CARDINAL_SHOW_DIAGNOSTIC_PORTAL to the proxy WebSocket origin for this diagnostic');
const address=visitor?`${destination}/room?invite=${new URLSearchParams(visitor.hash.slice(1)).get('invite')}`:process.argv[2]||'ws://127.0.0.1:8778/room',duration=Number(process.argv[publicSession?4:3]||25000);
const url=new URL(address),ws=new WebSocket(address,{origin:mode==='--portal-session'?visitor.origin:`${url.protocol==='wss:'?'https:':'http:'}//${url.host}`,perMessageDeflate:mode!=='--public-uncompressed-session',headers:{'User-Agent':'Mozilla/5.0'}});
const sources=new Map(),started=performance.now(),code=readFileSync(new URL('./show-worklet.js',import.meta.url),'utf8');
let meterChanges=0,meterCount=0,lastMeters='';
let packets=0,sceneBytes=0,audioBytes=0,lights=false,maxGap=0,errors=0,room=null,peakWireKB=0,peakAudioKB=0,gaps=[];
ws.on('open',()=>{for(const message of [{type:'client_features',delta:true},{type:'audio_quality',quality:'64'},{type:'audio_codec',codec:'opus'}])ws.send(JSON.stringify(message));});
ws.on('message',(bytes,binary)=>{
 if(!binary){sceneBytes+=bytes.length;const data=JSON.parse(bytes);if(data.type==='connection_stats'){peakWireKB=Math.max(peakWireKB,data.bytesPerSecond/1024);peakAudioKB=Math.max(peakAudioKB,data.audioBytesPerSecond/1024);}if(data.type==='room')room=data;else if(data.type==='room_delta'&&room)room={...applyScenePatch(room,data.patches),revision:data.revision};if(room?.show?.lights?.length)lights=true;const meters=room?.show?.visuals?.panels?.flatMap(p=>p.controls.filter(c=>c.kind==='meter'))||[];if(meters.length){meterCount=meters.length;const levels=JSON.stringify(meters.map(m=>m.levels));if(lastMeters&&levels!==lastMeters)meterChanges++;lastMeters=levels;}return;}
 audioBytes+=bytes.length;packets++;const id=bytes.readBigUInt64LE(8).toString(),frame=Number(bytes.readBigUInt64LE(16));
 let source=sources.get(id);
 if(!source){
  let Processor;const context={currentTime:(performance.now()-started)/1000,sampleRate:48000,AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},registerProcessor:(_name,p)=>Processor=p};
  vm.createContext(context);vm.runInContext(code,context);
  source={decoder:new OpusDecoderWebWorker({channels:1,sampleRate:48000}),node:new Processor(),context,last:0,end:0,gaps:0,silent:0,rendered:0,nextRender:context.currentTime,firstPlayback:null,chain:Promise.resolve()};sources.set(id,source);
  if(process.env.CARDINAL_SHOW_AUDIO_BUFFER)source.node.port.onmessage({data:{bufferSeconds:Number(process.env.CARDINAL_SHOW_AUDIO_BUFFER)}});
 }
 const now=performance.now();if(source.last){maxGap=Math.max(maxGap,now-source.last);if(now-source.last>200&&gaps.length<30)gaps.push([Math.round(now-started),Math.round(now-source.last)]);}source.last=now;
 if(source.end&&frame!==source.end)source.gaps++;
 source.end=frame+960;
 source.chain=source.chain.then(async()=>{
  await source.decoder.ready;const result=await source.decoder.decodeFrame(new Uint8Array(bytes.subarray(36)));
  errors+=result.errors.length;source.context.currentTime=(performance.now()-started)/1000;
  source.node.port.onmessage({data:{frame,rate:48000,samples:result.channelData[0]}});
  if(source.firstPlayback===null)source.firstPlayback=source.node.anchor.time;
 });
});
ws.on('error',()=>{errors++;});
const timer=setInterval(()=>{
 const now=(performance.now()-started)/1000;
 for(const s of sources.values()){
  while(s.nextRender+128/48000<=now){
   s.context.currentTime=s.nextRender;const out=new Float32Array(128);s.node.process([],[[out]]);
   // Count silence during network outages AND every recovery buffer refill.
   // Filtering by recent packets or the latest anchor hid the very cutouts this
   // test is intended to detect. Only initial startup and host shutdown are excluded.
   if(room?.nativeConnected&&room?.show&&s.firstPlayback!==null&&s.nextRender>s.firstPlayback+.25){s.rendered++;if(out.every(v=>v===0))s.silent++;}
   s.nextRender+=128/48000;
  }
 }
},5);
setTimeout(async()=>{
 clearInterval(timer);ws.close();for(const s of sources.values()){await s.chain;await s.decoder.free();}
 const result={packets,meterCount,meterChanges,sources:sources.size,lights,errors,maxGapMs:Math.round(maxGap),sceneKB:Math.round(sceneBytes/1024),audioKB:Math.round(audioBytes/1024),peakWireKB:Math.round(peakWireKB),peakAudioKB:Math.round(peakAudioKB),frameGaps:[...sources.values()].reduce((n,s)=>n+s.gaps,0),silentBlocks:[...sources.values()].reduce((n,s)=>n+s.silent,0),renderedBlocks:[...sources.values()].reduce((n,s)=>n+s.rendered,0)};
 console.log(JSON.stringify({...result,compression:ws.extensions.includes('permessage-deflate'),gaps}));
 if((process.env.CARDINAL_SHOW_EXPECT_METERS==='1'&&(meterCount!==25||meterChanges<10))||packets<50||sources.size!==2||!lights||errors||result.frameGaps||result.silentBlocks>result.renderedBlocks*.02)process.exitCode=1;
 else console.log('PASS: real Opus relay, WASM decode and worklet playback through host UI stall');
},duration);
