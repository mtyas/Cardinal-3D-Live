import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {applyScenePatch} from './scene-delta.js';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('mobile relay sends no unwanted audio, reconstructs scene deltas, resyncs and uses 64kbps automatic audio',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cardinal-mobile-relay-')),file=join(directory,'session.json'),port=19884;
 const server=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,CARDINAL_SHOW_PORT:String(port),CARDINAL_SHOW_SESSION_PATH:file},stdio:'ignore'});
 let native,guest,timer,state,revision=0,full=0,deltas=0,binary=0,error=null;
 try{
  let session;for(let i=0;i<80;i++){try{session=JSON.parse(await readFile(file,'utf8'));break;}catch{await pause(30);}}assert.ok(session);
  native=new WebSocket(session.url);guest=new WebSocket(`ws://127.0.0.1:${port}/room`,{origin:`http://localhost:${port}`});
  guest.on('message',(bytes,isBinary)=>{try{
   if(isBinary){binary++;assert.equal(bytes.toString('ascii',0,4),'C3DO');assert.equal(bytes.readUInt32LE(32),64);return;}
   const data=JSON.parse(bytes);if(data.type==='room'){state=data;revision=data.revision;full++;}
   if(data.type==='room_delta'){assert.equal(data.base,revision);state=applyScenePatch(state,data.patches);revision=data.revision;deltas++;}
  }catch(e){error=e;}});
  await Promise.all([once(native,'open'),once(guest,'open')]);guest.send(JSON.stringify({type:'client_features',delta:true,lowData:true}));
  const speaker={id:'1',position:[0,1,-3],yaw:0,cone:90,ref_distance:1,max_distance:40,rolloff:1,directional:false};let frame=0;
  timer=setInterval(()=>{
   native.send(JSON.stringify({type:'show',frame,sample_rate:48000,speakers:[speaker],lights:[],max_audio_kbps:128}));
   const bytes=Buffer.alloc(32+960*4);bytes.write('C3DA');bytes.writeUInt32LE(1,4);bytes.writeBigUInt64LE(1n,8);bytes.writeBigUInt64LE(BigInt(frame),16);bytes.writeUInt32LE(48000,24);bytes.writeUInt32LE(960,28);native.send(bytes);frame+=960;
  },20);
  await pause(350);assert.equal(binary,0);assert.ok(deltas>1);assert.equal(state.show.sample_rate,48000);assert.ok(guest.extensions.includes('permessage-deflate'));
  const oldFull=full;guest.send(JSON.stringify({type:'scene_resync'}));await pause(180);assert.ok(full>oldFull);
  guest.send(JSON.stringify({type:'audio_codec',codec:'opus'}));await pause(400);assert.ok(binary>5);assert.equal(error,null);
  guest.send(JSON.stringify({type:'audio_codec',codec:'off'}));await pause(100);const paused=binary;await pause(150);assert.equal(binary,paused);
 }finally{clearInterval(timer);native?.terminate();guest?.terminate();server.kill();await once(server,'exit');await rm(directory,{recursive:true,force:true});}
},{timeout:10000});
