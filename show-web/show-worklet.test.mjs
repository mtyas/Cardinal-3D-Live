// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('PCM playback respects sample-frame timing, resamples, and bounds queued audio',()=>{
  let Processor; const messages=[];
  const context={currentTime:0,sampleRate:48000,AudioWorkletProcessor:class {constructor(){this.port={postMessage:m=>messages.push(m)};}},registerProcessor:(_name,p)=>Processor=p};
  vm.createContext(context);vm.runInContext(readFileSync(new URL('./show-worklet.js',import.meta.url),'utf8'),context);
  const node=new Processor(),output=new Float32Array(4);
  node.port.onmessage({data:{frame:24000,rate:24000,samples:new Float32Array([0,1,0,-1,0])}});
  node.process([],[[output]]);assert.deepEqual([...output],[0,0,0,0]);
  context.currentTime=.18;node.process([],[[output]]);
  assert.deepEqual([...output],[0,.5,1,.5]);assert.equal(messages[0].anchor.frame,24000);
  for(let i=0;i<400;i++)node.port.onmessage({data:{frame:24000+i*256,rate:24000,samples:new Float32Array(256)}});
  assert.ok(node.blocks.at(-1).frame-node.blocks[0].frame<=24000*2.5,'Queued sample duration must remain bounded');
  node.port.onmessage({data:{reset:true}});assert.equal(node.blocks.length,0);assert.equal(node.anchor,null);
});
test('mobile buffering allows more jitter and reanchors a late radio burst instead of discarding it indefinitely',()=>{
 let Processor;const messages=[];const context={currentTime:0,sampleRate:48000,AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>messages.push(m)};}},registerProcessor:(_name,p)=>Processor=p};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('./show-worklet.js',import.meta.url),'utf8'),context);
 const node=new Processor(),output=new Float32Array(8);node.port.onmessage({data:{bufferSeconds:.3}});
 node.port.onmessage({data:{frame:0,rate:48000,samples:new Float32Array(960).fill(.2)}});assert.equal(messages[0].anchor.time,.3);
 context.currentTime=1;node.port.onmessage({data:{frame:24000,rate:48000,samples:new Float32Array(960).fill(.2)}});
 assert.equal(messages.length,2);assert.equal(messages[1].anchor.frame,24000);assert.equal(messages[1].anchor.time,1.38);
 context.currentTime=1.38;node.process([],[[output]]);assert.ok(output.every(sample=>sample>.19));
});

test('responsive performer buffering starts on time and tolerates a delayed packet within its budget',()=>{
 let Processor;const messages=[];const context={currentTime:0,sampleRate:48000,AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>messages.push(m)};}},registerProcessor:(_name,p)=>Processor=p};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('./show-worklet.js',import.meta.url),'utf8'),context);
 const node=new Processor(),out=new Float32Array(128);node.port.onmessage({data:{bufferSeconds:.08}});
 node.port.onmessage({data:{frame:0,rate:48000,samples:new Float32Array(960).fill(.2)}});assert.equal(messages[0].anchor.time,.08);
 context.currentTime=.06;node.port.onmessage({data:{frame:960,rate:48000,samples:new Float32Array(960).fill(.4)}});
 context.currentTime=.08;node.process([],[[out]]);assert.ok(Math.abs(out[0]-.2)<1e-6);
 context.currentTime=.10;node.process([],[[out]]);assert.ok(Math.abs(out[0]-.4)<1e-6);
});

test('trimming a burst larger than the queue moves playback to retained audio',()=>{
 let Processor;const context={currentTime:0,sampleRate:48000,AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},registerProcessor:(_name,p)=>Processor=p};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('./show-worklet.js',import.meta.url),'utf8'),context);
 const node=new Processor(),out=new Float32Array(128);
 for(let i=0;i<200;i++)node.port.onmessage({data:{frame:i*960,rate:48000,samples:new Float32Array(960).fill(.2)}});
 assert.ok(node.blocks.length<=126);context.currentTime=.18;node.process([],[[out]]);
 assert.ok(out.every(v=>v>.19),'Overflow must resume retained sound instead of chasing discarded samples');
});

test('repeated 220ms network bursts increase the buffer and stop recurring dropouts',()=>{
 let Processor;const messages=[],context={currentTime:0,sampleRate:48000,AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>messages.push(m)};}},registerProcessor:(_name,p)=>Processor=p};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('./show-worklet.js',import.meta.url),'utf8'),context);
 const node=new Processor(),out=new Float32Array(128),packets=[];node.port.onmessage({data:{bufferSeconds:.08}});
 for(let i=0;i<1000;i++){
  const time=i*.02,phase=time%1,arrival=time>=1&&phase<.22?Math.floor(time)+.22:time;
  packets.push({arrival,frame:i*960});
 }
 let received=0,lateSilence=0;
 for(let time=0;time<19;time+=128/48000){
  context.currentTime=time;
  while(received<packets.length&&packets[received].arrival<=time){node.port.onmessage({data:{frame:packets[received++].frame,rate:48000,samples:new Float32Array(960).fill(.2)}});}
  node.process([],[[out]]);if(time>5&&out.every(v=>v===0))lateSilence++;
 }
 assert.ok(node.rebuffers>0&&node.rebuffers<=3);
 assert.ok(node.targetBuffer>.08&&node.targetBuffer<=.6);
 assert.equal(lateSilence,0,'Playback should remain continuous once the buffer has adapted');
 assert.ok(messages.some(m=>m.playing===true&&m.starvedSamples>0));
});

for(const sampleRate of [44100,48000])for(const pause of [.6,.8,2])test(`${pause*1000}ms bursts cannot leave playback behind discarded blocks at ${sampleRate}Hz`,()=>{
 let Processor;const context={currentTime:0,sampleRate,AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},registerProcessor:(_name,p)=>Processor=p};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('./show-worklet.js',import.meta.url),'utf8'),context);
 const node=new Processor(),out=new Float32Array(128),events=[];
 for(let i=0;i<3000;i++){
  const time=i*.02,phase=time%3;
  events.push({at:time>=3&&phase<pause?Math.floor(time/3)*3+pause:time,frame:i*960});
 }
 let received=0,silentSamples=0,measuredSamples=0,maxBlocks=0;
 for(let time=0;time<59;time+=128/sampleRate){
  context.currentTime=time;
  while(received<events.length&&events[received].at<=time)node.port.onmessage({data:{frame:events[received++].frame,rate:48000,samples:new Float32Array(960).fill(.2)}});
  node.process([],[[out]]);maxBlocks=Math.max(maxBlocks,node.blocks.length);
  // Include ALL silence after warm-up, even when packets stopped arriving or
  // the worklet moved its anchor. These are exactly the audible interruptions.
  if(time>10){measuredSamples+=out.length;for(const value of out)if(value===0)silentSamples++;}
 }
 assert.ok(silentSamples/measuredSamples<.001,`Silence: ${(silentSamples/measuredSamples*100).toFixed(2)}%`);
 assert.ok(maxBlocks<=126,'Audio memory remains bounded');
 assert.ok(node.rebuffers<=3,'Recovery must settle rather than repeatedly restart');
});
