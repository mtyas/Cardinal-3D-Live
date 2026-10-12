import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('real relay honours visitor quality and performer ceiling while preserving scene snapshots',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cardinal-opus-')),file=join(dir,'session.json'),port=18878;
 const server=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,CARDINAL_SHOW_PORT:String(port),CARDINAL_SHOW_SESSION_PATH:file},stdio:'ignore'});
 let native,guest,timer;
 try{
  let session;for(let i=0;i<60;i++){try{session=JSON.parse(await readFile(file,'utf8'));break;}catch{await pause(50);}}
  assert.ok(session,'relay failed to start');native=new WebSocket(session.url);guest=new WebSocket(`ws://127.0.0.1:${port}/room`,{origin:`http://localhost:${port}`});
  await Promise.all([once(native,'open'),once(guest,'open')]);
  const speaker={id:'1',position:[0,1,-3],yaw:0,cone:90,ref_distance:1,max_distance:40,rolloff:1,directional:false};
  let cap=128,frame=0,snapshots=0,packets=[];
  guest.on('message',(b,binary)=>{if(binary){assert.equal(b.toString('ascii',0,4),'C3DO');packets.push(b.readUInt32LE(32));}else if(JSON.parse(b).show)snapshots++;});
  guest.send(JSON.stringify({type:'audio_codec',codec:'opus'}));guest.send(JSON.stringify({type:'audio_quality',quality:'64'}));
  timer=setInterval(()=>{
   native.send(JSON.stringify({type:'show',frame,sample_rate:48000,speakers:[speaker],lights:[],max_audio_kbps:cap}));
   const b=Buffer.alloc(32+960*4);b.write('C3DA');b.writeUInt32LE(1,4);b.writeBigUInt64LE(1n,8);b.writeBigUInt64LE(BigInt(frame),16);b.writeUInt32LE(48000,24);b.writeUInt32LE(960,28);
   for(let i=0;i<960;i++)b.writeFloatLE(.2*Math.sin((frame+i)*.04),32+i*4);native.send(b);frame+=960;
  },20);
  await pause(500);assert.ok(packets.length>5);assert.ok(packets.every(q=>q===64));
  guest.send(JSON.stringify({type:'audio_quality',quality:'128'}));await pause(350);assert.ok(packets.includes(128));
  cap=64;await pause(100);packets=[];await pause(350);assert.ok(packets.length>5&&packets.every(q=>q===64));assert.ok(snapshots>5);
 }finally{clearInterval(timer);native?.terminate();guest?.terminate();server.kill();await once(server,'exit');await rm(dir,{recursive:true,force:true});}
},{timeout:10000});
