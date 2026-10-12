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
