// SPDX-License-Identifier: GPL-3.0-or-later
// Diagnostic listener; it cannot publish a scene or touch the patch.
import {WebSocket} from 'ws';
import {audioBlocks} from './show-protocol.mjs';
const ws=new WebSocket('ws://127.0.0.1:8778/room',{origin:'http://localhost:8778'});
let packets=0,frames=0,sources=new Set(),lights=false,peak=0;
ws.on('message',(bytes,binary)=>{
  if(binary){
    for(const b of audioBlocks(bytes)){sources.add(b.id);frames+=b.samples;}
    packets++;
    // Inspect one sample per packet without influencing the publisher.
    if(bytes.length>32)peak=Math.max(peak,Math.abs(bytes.readFloatLE(32)));
  }else{
    const data=JSON.parse(bytes);if(data.show?.lights?.length===1)lights=true;
  }
});
ws.on('error',e=>{console.error(e.message);process.exitCode=1;});
setTimeout(()=>{
  ws.close();
  if(packets<20||sources.size!==2||!lights||peak<.01){console.error({packets,frames,sources:sources.size,lights,peak});process.exitCode=1;}
  else console.log('PASS: live visitor received independent native audio streams and CV light state', {packets,frames,sources:sources.size,peak});
},25000);

