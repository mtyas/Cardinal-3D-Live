// SPDX-License-Identifier: GPL-3.0-or-later
import OpusScript from 'opusscript';
import {audioBlocks} from './show-protocol.mjs';
export class ShowEncoder {
 sources=new Map();
 reset(){for(const s of this.sources.values())for(const e of s.encoders.values())e.delete();this.sources.clear();}
 retain(ids){for(const [id,s] of this.sources)if(!ids.includes(id)){for(const e of s.encoders.values())e.delete();this.sources.delete(id);}}
 encode(bytes,cap=128){
  const result=[];
  let offset=8;
  for(const b of audioBlocks(bytes)){
   offset+=24;
   let s=this.sources.get(b.id);
   if(s&&(s.rate!==b.rate||s.expected!==b.frame)){for(const e of s.encoders.values())e.delete();s=null;}
   if(!s){s={rate:b.rate,expected:b.frame,base:b.frame,next:b.frame,samples:new Float32Array(),encoders:new Map()};this.sources.set(b.id,s);}
   const incoming=new Float32Array(b.samples);
   for(let i=0;i<b.samples;i++)incoming[i]=bytes.readFloatLE(offset+i*4);
   const samples=new Float32Array(s.samples.length+incoming.length);samples.set(s.samples);samples.set(incoming,s.samples.length);s.samples=samples;s.expected=b.frame+b.samples;offset+=b.samples*4;
   const step=b.rate/48000;
   while(s.next+959*step+1<s.base+s.samples.length){
    const pcm=Buffer.alloc(1920);
    for(let i=0;i<960;i++){const p=s.next+i*step-s.base,j=Math.floor(p),t=p-j;const v=s.samples[j]*(1-t)+s.samples[j+1]*t;pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),i*2);}
    const frame=Math.round(s.next*48000/b.rate);
    for(const kbps of [64,96,128].filter(q=>q<=cap)){
     let e=s.encoders.get(kbps);if(!e){e=new OpusScript(48000,1,OpusScript.Application.AUDIO);e.encoderCTL(4002,kbps*1000);e.encoderCTL(4010,5);s.encoders.set(kbps,e);}
     const compressed=e.encode(pcm,960),packet=Buffer.alloc(36+compressed.length);
     packet.write('C3DO');packet.writeUInt32LE(1,4);packet.writeBigUInt64LE(BigInt(b.id),8);packet.writeBigUInt64LE(BigInt(frame),16);packet.writeUInt32LE(48000,24);packet.writeUInt32LE(compressed.length,28);packet.writeUInt32LE(kbps,32);compressed.copy(packet,36);result.push({kbps,packet});
    }
    s.next+=960*step;
   }
   const consume=Math.max(0,Math.floor(s.next)-s.base);s.samples=s.samples.slice(consume);s.base+=consume;
   for(const [quality,e]of s.encoders)if(quality>cap){e.delete();s.encoders.delete(quality);}
  }
  return result;
 }
}
