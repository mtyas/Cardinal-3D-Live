// SPDX-License-Identifier: GPL-3.0-or-later
// Isolated diagnostic listener; never publishes or edits a patch.
import {WebSocket} from 'ws';
import {audioBlocks} from './show-protocol.mjs';
const address=process.argv[2]||'ws://127.0.0.1:8778/room';
const duration=Number(process.argv[3]||25000),url=new URL(address);
const ws=new WebSocket(address,{origin:`http://${url.host}`});
let packets=0,frames=0,sources=new Set(),lights=false,peak=0,last=0,maxGap=0;
ws.on('open',()=>ws.send(JSON.stringify({type:'audio_codec',codec:'pcm'})));
ws.on('message',(bytes,binary)=>{
 if(binary){
  const now=performance.now();if(last)maxGap=Math.max(maxGap,now-last);last=now;
  for(const b of audioBlocks(bytes)){sources.add(b.id);frames+=b.samples;}
  packets++;if(bytes.length>32)peak=Math.max(peak,Math.abs(bytes.readFloatLE(32)));
 }else{const data=JSON.parse(bytes);if(data.show?.lights?.length===1)lights=true;}
});
ws.on('error',e=>{console.error(e.message);process.exitCode=1;});
setTimeout(()=>{
 ws.close();const result={packets,frames,sources:sources.size,lights,peak,maxGapMs:maxGap};
 if(packets<20||sources.size!==2||!lights||peak<.01||maxGap>500){console.error(result);process.exitCode=1;}
 else console.log('PASS: live visitor audio, CV light state and continuity through UI stall',JSON.stringify(result));
},duration);
