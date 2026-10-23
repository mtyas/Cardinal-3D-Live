import test from 'node:test';
import assert from 'node:assert/strict';
import OpusScript from 'opusscript';
import {ShowEncoder} from './opus-encoder.mjs';
function packet(frame,rate=48000,silent=false){
 const count=1024,b=Buffer.alloc(32+count*4);b.write('C3DA');b.writeUInt32LE(1,4);b.writeBigUInt64LE(1n,8);b.writeBigUInt64LE(BigInt(frame),16);b.writeUInt32LE(rate,24);b.writeUInt32LE(count,28);
 for(let i=0;i<count;i++)b.writeFloatLE(silent?0:.3*Math.sin(2*Math.PI*440*(frame+i)/rate),32+i*4);return b;
}
test('Opus really encodes all three quality levels and decodes the tone with continuous clocks',()=>{
 const e=new ShowEncoder(),out=[];
 for(let frame=0;frame<48000;frame+=1024)out.push(...e.encode(packet(frame)));
 for(const quality of [64,96,128]){
  const blocks=out.filter(p=>p.kbps===quality),decoder=new OpusScript(48000,1,OpusScript.Application.AUDIO);
  let energy=0,n=0;
  for(let i=0;i<blocks.length;i++){
   const b=blocks[i].packet;assert.equal(b.toString('ascii',0,4),'C3DO');assert.equal(Number(b.readBigUInt64LE(16)),i*960);
   assert.equal(b.readUInt32LE(32),quality);const pcm=decoder.decode(b.subarray(36));assert.equal(pcm.length,1920);
   for(let j=0;j<pcm.length;j+=2){const v=pcm.readInt16LE(j)/32768;energy+=v*v;n++;}
  }
  assert.ok(Math.sqrt(energy/n)>.18);assert.ok(blocks.reduce((n,b)=>n+b.packet.length,0)<quality*1000/8*1.5);decoder.delete();
 }
 assert.ok(out.filter(b=>b.kbps===128).reduce((n,b)=>n+b.packet.length,0)>out.filter(b=>b.kbps===64).reduce((n,b)=>n+b.packet.length,0));e.reset();
});
test('44.1kHz input resamples to 48kHz; ceiling, silence and discontinuity are handled',()=>{
 const e=new ShowEncoder(),out=[];
 for(let frame=0;frame<44100;frame+=1024)out.push(...e.encode(packet(frame,44100,true),64));
 assert.ok(out.length>=45);assert.ok(out.every(b=>b.kbps===64));
 for(let i=1;i<out.length;i++)assert.equal(Number(out[i].packet.readBigUInt64LE(16))-Number(out[i-1].packet.readBigUInt64LE(16)),960);
 const decoder=new OpusScript(48000,1,OpusScript.Application.AUDIO);assert.ok(decoder.decode(out[0].packet.subarray(36)).every(v=>v===0));decoder.delete();
 const restarted=e.encode(packet(96000),96);assert.equal(Number(restarted[0].packet.readBigUInt64LE(16)),96000);e.retain([]);assert.equal(e.sources.size,0);e.reset();
});

test('only requested audio qualities are encoded, with continuous source clocks across quality changes',()=>{
 const e=new ShowEncoder();
 try{
  const first=e.encode(packet(0),128,[64]);assert.deepEqual(first.map(p=>p.kbps),[64]);
  assert.deepEqual([...e.sources.get('1').encoders.keys()],[64]);
  const next=e.encode(packet(1024),128,[96,128]);assert.deepEqual(next.map(p=>p.kbps),[96,128]);
  assert.ok(next.every(p=>Number(p.packet.readBigUInt64LE(16))===960));
  assert.deepEqual([...e.sources.get('1').encoders.keys()],[96,128]);
 }finally{e.reset();}
});
