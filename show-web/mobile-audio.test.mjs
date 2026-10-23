import test from 'node:test';
import assert from 'node:assert/strict';
import {OpusDecoderWebWorker} from 'opus-decoder';
import {ShowEncoder} from './opus-encoder.mjs';

test('phone-compatible WASM worker decodes real compressed mono sources with correct sample counts',async()=>{
 const encoder=new ShowEncoder(),decoder=new OpusDecoderWebWorker({channels:1,sampleRate:48000});
 try{
  await decoder.ready;let total=0,energy=0;
  for(let frame=0;frame<960*8;frame+=960){
   const input=Buffer.alloc(32+960*4);input.write('C3DA');input.writeUInt32LE(1,4);input.writeBigUInt64LE(1n,8);input.writeBigUInt64LE(BigInt(frame),16);input.writeUInt32LE(48000,24);input.writeUInt32LE(960,28);
   for(let i=0;i<960;i++)input.writeFloatLE(.2*Math.sin((frame+i)*2*Math.PI*440/48000),32+i*4);
   for(const packet of encoder.encode(input,64)){const bytes=packet.packet||packet.bytes;const result=await decoder.decodeFrame(new Uint8Array(bytes.subarray(36)));assert.equal(result.errors.length,0);assert.equal(result.channelData.length,1);total+=result.samplesDecoded;for(const sample of result.channelData[0])energy+=sample*sample;}
  }
  assert.ok(total>=5760);assert.ok(energy/total>.01);
 }finally{encoder.reset();await decoder.free();}
},{timeout:10000});
import {ShowAudio} from './show-audio.js';

test('device volume is bounded and uses one smooth output gain for both audio transports',()=>{
 const audio=new ShowAudio(),changes=[];
 audio.setVolume(.37);assert.equal(audio.volume,.37);
 audio.context={currentTime:12};audio.output={gain:{setTargetAtTime:(...args)=>changes.push(args)}};
 audio.setVolume(0);assert.deepEqual(changes.at(-1),[0,12,.015]);
 audio.setVolume(2);assert.equal(audio.volume,1);
 audio.setVolume(NaN);assert.equal(audio.volume,1);
 assert.equal(changes.length,2);
});
test('performer buffering reduces response delay and restores stable visitor settings',()=>{
 const audio=new ShowAudio(),messages=[];audio.sources.set('1',{node:{port:{postMessage:m=>messages.push(m)}}});
 assert.equal(audio.bufferSeconds,.18);audio.setPerformer(true);assert.equal(audio.bufferSeconds,.08);
 audio.setLowData(true);assert.equal(audio.bufferSeconds,.3);
 audio.setLowData(false);assert.equal(audio.bufferSeconds,.08);
 audio.setPerformer(true,false);assert.equal(audio.bufferSeconds,.18);
 audio.setPerformer(false);assert.equal(audio.bufferSeconds,.18);
 assert.deepEqual(messages.map(m=>m.bufferSeconds),[.08,.3,.08,.18]);
});

test('extra stable playback is available to visitors and survives collaboration grants and data saver changes',()=>{
 const audio=new ShowAudio();audio.setBuffering('stable');assert.equal(audio.bufferSeconds,2.5);
 audio.setPerformer(true);audio.setLowData(true);assert.equal(audio.bufferSeconds,2.5);
 audio.setLowData(false);audio.setPerformer(false);assert.equal(audio.bufferSeconds,2.5);
 audio.setBuffering('adaptive');assert.equal(audio.bufferSeconds,.18);
});

test('a secondary speaker cannot reset the visual clock, and stalled audio releases the lights',()=>{
 const audio=new ShowAudio();audio.context={state:'running',currentTime:10,outputLatency:0};
 audio.sources.set('a',{clock:{anchor:{frame:480000,time:10},rate:48000,observedAt:10,playing:true}});
 audio.sources.set('b',{clock:{anchor:{frame:96000,time:10},rate:48000,observedAt:10,playing:true}});
 assert.equal(audio.frame(48000),480000);
 audio.sources.get('b').clock.anchor.frame=0;
 assert.equal(audio.frame(48000),480000);
 audio.sources.get('a').clock.playing=false;audio.sources.get('b').clock.playing=false;
 assert.equal(audio.frame(48000),null,'No playback means show current visuals rather than a frozen audio-aligned frame');
 audio.sources.get('a').clock.playing=true;audio.context.currentTime=11;
 assert.equal(audio.frame(),null,'A stale worklet clock must expire');
});

test('visitor decoder retains a two-second Opus burst instead of dropping packets beyond the old queue limit',async()=>{
 const encoder=new ShowEncoder(),decoder=new OpusDecoderWebWorker({channels:1,sampleRate:48000}),audio=new ShowAudio(),received=[];
 const source={node:{port:{postMessage:m=>received.push(m)}},wasmDecoder:decoder,pending:0};
 audio.ready=true;audio.codec='opus';audio.wasm=true;audio.sources.set('1',source);
 try{
  await decoder.ready;
  for(let frame=0;frame<960*102;frame+=960){
   const input=Buffer.alloc(32+960*4);input.write('C3DA');input.writeUInt32LE(1,4);input.writeBigUInt64LE(1n,8);input.writeBigUInt64LE(BigInt(frame),16);input.writeUInt32LE(48000,24);input.writeUInt32LE(960,28);
   for(let i=0;i<960;i++)input.writeFloatLE(.2,32+i*4);
   for(const {packet} of encoder.encode(input,64))audio.packet(packet.buffer.slice(packet.byteOffset,packet.byteOffset+packet.byteLength));
  }
  for(let i=0;i<200&&source.pending;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(source.pending,0);assert.equal(received.length,101);
  for(let i=0;i<received.length;i++)assert.equal(received[i].frame,i*960);
 }finally{encoder.reset();await decoder.free();}
},{timeout:10000});
