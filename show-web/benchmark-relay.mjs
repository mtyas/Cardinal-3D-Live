// SPDX-License-Identifier: GPL-3.0-or-later
// Local relay load probe. Reports application bytes, not compressed wire traffic.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
import net from 'node:net';
import {WebSocket} from 'ws';
const count=Number(process.argv[2]||16),seconds=Number(process.argv[3]||5),report=process.argv[4];
if(!Number.isInteger(count)||count<1||count>63||seconds<1||seconds>300)throw Error('Usage: node benchmark-relay.mjs [1..63 visitors] [1..300 seconds] [report.json]');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const reservation=net.createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
const dir=await mkdtemp(join(tmpdir(),'cardinal-load-')),session=join(dir,'session.json');
const processStart=performance.now();const server=spawn(process.execPath,[process.env.CARDINAL_BENCHMARK_SERVER||'server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,CARDINAL_SHOW_PORT:String(port),CARDINAL_SHOW_SESSION_PATH:session},stdio:['ignore','ignore','pipe']});let serverLog='';server.stderr.on('data',b=>serverLog+=b);
const guests=[];let host,timer;
try{
 let info;for(let i=0;i<200;i++){try{info=JSON.parse(await readFile(session,'utf8'));break;}catch{await pause(25);}}
 if(!info)throw Error('Relay startup failed: '+serverLog);
 const startupMs=performance.now()-processStart;host=new WebSocket(info.url);await once(host,'open');
 let hostBytes=0,sceneBytes=0,audioBytes=0,scenePackets=0,audioPackets=0,maxPublisherQueue=0,fullEquivalentBytes=0;const audioByGuest=Array(count).fill(0);
 host.on('message',(bytes,binary)=>{if(!binary)hostBytes+=bytes.length;});
 for(let i=0;i<count;i++){
  const guest=new WebSocket(`ws://127.0.0.1:${port}/room`,{origin:`http://localhost:${port}`});guests.push(guest);
  guest.on('message',(bytes,binary)=>{if(binary){audioBytes+=bytes.length;audioPackets++;audioByGuest[i]++;}else{sceneBytes+=bytes.length;scenePackets++;}});
  await once(guest,'open');guest.send(JSON.stringify({type:'client_features',delta:true,lowData:i%2===0}));guest.send(JSON.stringify({type:'audio_codec',codec:'opus'}));guest.send(JSON.stringify({type:'audio_quality',quality:'64'}));
 }
 const speakers=[1,2].map(id=>({id:String(id),position:[id,1,-3],yaw:0,cone:90,ref_distance:1,max_distance:40,rolloff:1,directional:false}));
 const visuals={cases:[],panels:Array.from({length:64},(_,i)=>({id:String(i),matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],width:.2,height:.76,texture:'',controls:Array.from({length:40},(_,id)=>({id,kind:'knob',x:id*2,y:50,width:10,normalized:.5}))})),cables:[],environment:'',hour:14,place:7};
 let frame=0,tick=0;
 timer=setInterval(()=>{
  if(tick++%3===0){visuals.panels[0].controls[0].normalized=(tick%100)/100;const show=JSON.stringify({type:'show',frame,sample_rate:48000,speakers,lights:[],max_audio_kbps:64,visuals});host.send(show);fullEquivalentBytes+=Buffer.byteLength(show);}
  const bytes=Buffer.alloc(8+2*(24+960*4));bytes.write('C3DA');bytes.writeUInt32LE(2,4);let at=8;
  for(let id=1;id<=2;id++){bytes.writeBigUInt64LE(BigInt(id),at);bytes.writeBigUInt64LE(BigInt(frame),at+8);bytes.writeUInt32LE(48000,at+16);bytes.writeUInt32LE(960,at+20);for(let i=0;i<960;i++)bytes.writeFloatLE(.1*Math.sin((frame+i)*.04*id),at+24+i*4);at+=24+960*4;}
  host.send(bytes);frame+=960;maxPublisherQueue=Math.max(maxPublisherQueue,host.bufferedAmount);
 },20);
 await pause(seconds*1000);clearInterval(timer);
 const result={visitors:count,seconds,sources:2,panels:64,controls:2560,startup_ms:startupMs,host_return_bytes:hostBytes,full_show_input_bytes:fullEquivalentBytes,visitor_scene_bytes:sceneBytes,visitor_audio_bytes:audioBytes,scene_packets:scenePackets,audio_packets:audioPackets,min_audio_packets_per_visitor:Math.min(...audioByGuest),max_publisher_buffer_bytes:maxPublisherQueue,connected_visitors:guests.filter(g=>g.readyState===WebSocket.OPEN).length,scope:'localhost, synthetic publisher, application bytes; no headset/internet capacity certification'};
 if(result.connected_visitors!==count||!result.min_audio_packets_per_visitor)throw Error('Delivery failed: '+JSON.stringify(result));
 if(report)await writeFile(resolve(report),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{clearInterval(timer);host?.terminate();for(const guest of guests)guest.terminate();const exited=once(server,'exit');server.kill();await exited;await rm(dir,{recursive:true,force:true});}
