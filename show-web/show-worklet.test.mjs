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
  for(let i=0;i<200;i++)node.port.onmessage({data:{frame:24000+i*256,rate:24000,samples:new Float32Array(256)}});
  assert.ok(node.blocks.length<50,'Queued samples must remain bounded');
  node.port.onmessage({data:{reset:true}});assert.equal(node.blocks.length,0);assert.equal(node.anchor,null);
});
test('mobile buffering allows more jitter and reanchors a late radio burst instead of discarding it indefinitely',()=>{
 let Processor;const messages=[];const context={currentTime:0,sampleRate:48000,AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>messages.push(m)};}},registerProcessor:(_name,p)=>Processor=p};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('./show-worklet.js',import.meta.url),'utf8'),context);
 const node=new Processor(),output=new Float32Array(8);node.port.onmessage({data:{bufferSeconds:.3}});
 node.port.onmessage({data:{frame:0,rate:48000,samples:new Float32Array(960).fill(.2)}});assert.equal(messages[0].anchor.time,.3);
 context.currentTime=1;node.port.onmessage({data:{frame:24000,rate:48000,samples:new Float32Array(960).fill(.2)}});
 assert.equal(messages.length,2);assert.equal(messages[1].anchor.frame,24000);assert.equal(messages[1].anchor.time,1.3);
 context.currentTime=1.3;node.process([],[[output]]);assert.ok(output.every(sample=>sample>.19));
});
