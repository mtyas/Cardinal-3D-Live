import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {Worker} from 'node:worker_threads';
import {resolveObjectURL} from 'node:buffer';
import {createContext,runInContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {ShowEncoder} from './opus-encoder.mjs';

test('minified browser decoder worker remains self-contained and decodes actual audio',async t=>{
 const workers=[];
 class BrowserWorker{
  constructor(url){this.thread=resolveObjectURL(url).text().then(source=>{
   const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;self.postMessage=(data,transfer)=>parentPort.postMessage(data,transfer);parentPort.on('message',data=>self.onmessage({data}));\n${source}`,{eval:true});
   workers.push(worker);worker.on('message',data=>this.onmessage?.({data}));worker.on('error',e=>{this.failure=e;});return worker;
  });}
  postMessage(data){this.thread.then(worker=>worker.postMessage(data));}
  terminate(){this.thread.then(worker=>worker.terminate());}
 }
 t.after(async()=>{await Promise.all(workers.map(worker=>worker.terminate()));});
 const result=await build({stdin:{contents:"export {OpusDecoderWebWorker} from 'opus-decoder';",resolveDir:fileURLToPath(new URL('.',import.meta.url))},bundle:true,write:false,platform:'browser',format:'iife',globalName:'DecoderLibrary',target:'es2020',minify:true});
 const context=createContext({Blob,URL,Worker:BrowserWorker,WebAssembly,console,Uint8Array,Float32Array,ArrayBuffer,setTimeout,clearTimeout});
 runInContext(result.outputFiles[0].text,context);const decoder=new context.DecoderLibrary.OpusDecoderWebWorker({channels:1,sampleRate:48000});
 let timeout;await Promise.race([decoder.ready,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Browser worker did not initialise')),4000);})]);clearTimeout(timeout);
 const encoder=new ShowEncoder();try{
  const bytes=Buffer.alloc(32+1920*4);bytes.write('C3DA');bytes.writeUInt32LE(1,4);bytes.writeBigUInt64LE(1n,8);bytes.writeUInt32LE(48000,24);bytes.writeUInt32LE(1920,28);for(let i=0;i<1920;i++)bytes.writeFloatLE(.2*Math.sin(i*.06),32+i*4);
  const packet=encoder.encode(bytes,64)[0].packet;const decoded=await decoder.decodeFrame(new Uint8Array(packet.subarray(36)));assert.equal(decoded.samplesDecoded,960);assert.equal(decoded.errors.length,0);
 }finally{encoder.reset();await decoder.free();}
},{timeout:10000});
