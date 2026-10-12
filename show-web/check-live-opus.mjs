// Diagnostic receiver for an actual native Show publisher; no synth operations.
import {WebSocket} from 'ws';
import {readFile} from 'node:fs/promises';
import OpusScript from 'opusscript';
const port=process.env.CARDINAL_SHOW_PORT||8778;
let base=`http://127.0.0.1:${port}`,wsAddress=`ws://127.0.0.1:${port}/room`,origin=`http://localhost:${port}`;
if(process.env.CARDINAL_PUBLIC_SESSION){const config=JSON.parse(await readFile(process.env.CARDINAL_PUBLIC_SESSION,'utf8')),invite=new URL(config.visitor_url);base=invite.origin;origin=invite.origin;wsAddress=`wss://${invite.host}/room?invite=${encodeURIComponent(new URLSearchParams(invite.hash.slice(1)).get('invite'))}`;}
const ws=new WebSocket(wsAddress,{origin});
const decoders=new Map();const objectKinds=new Set();let panels=false, scenery=false, artwork=false;let packets=0,peak=0,light=false,qualities=new Set(),last=0,maxGap=0;
ws.on('open',()=>{ws.send(JSON.stringify({type:'audio_codec',codec:'opus'}));ws.send(JSON.stringify({type:'audio_quality',quality:'96'}));});
let boardSeen=false;
ws.on('message',(b,binary)=>{
 if(!binary){const state=JSON.parse(b).show;if(process.env.CARDINAL_REQUIRE_CHAT_BOARD==='1'&&state?.boards?.length)boardSeen=true;if(state?.lights?.length)light=true;for(const o of state?.objects||[])objectKinds.add(o.kind);const v=state?.visuals;if(v){panels ||= v.panels.length>0;if(v.environment&&!scenery)fetch(`${base}/show-assets/${v.environment}`).then(async r=>{if(r.ok)scenery=Array.isArray(await r.json());});const panel=v.panels.find(p=>p.texture);if(panel&&!artwork)fetch(`${base}/show-assets/${panel.texture}`).then(async r=>{if(r.ok){const bytes=new Uint8Array(await r.arrayBuffer());artwork=bytes[0]===137&&bytes[1]===80;}});}return;}
 const now=performance.now();if(last)maxGap=Math.max(maxGap,now-last);last=now;
 if(b.toString('ascii',0,4)==='C3DA')return;
 if(b.toString('ascii',0,4)!=='C3DO')throw Error('Expected compressed audio');
 const id=b.readBigUInt64LE(8).toString();let d=decoders.get(id);if(!d){d=new OpusScript(48000,1,OpusScript.Application.AUDIO);decoders.set(id,d);}
 const pcm=d.decode(b.subarray(36));for(let i=0;i<pcm.length;i+=2)peak=Math.max(peak,Math.abs(pcm.readInt16LE(i)/32768));qualities.add(b.readUInt32LE(32));packets++;
});
ws.on('error',e=>{console.error(e.message);process.exitCode=1;});
setTimeout(()=>{ws.close();for(const d of decoders.values())d.delete();
 if((process.env.CARDINAL_REQUIRE_CHAT_BOARD==='1'&&!boardSeen)||(process.env.CARDINAL_REQUIRE_SHOW_OBJECTS==='1'&&objectKinds.size!==4)||(process.env.CARDINAL_REQUIRE_VISUALS==='1'&&(!panels||!scenery||!artwork))||packets<30||decoders.size<2||!light||peak<.01||(process.env.CARDINAL_MAX_AUDIO_GAP_MS&&maxGap>Number(process.env.CARDINAL_MAX_AUDIO_GAP_MS))){console.error({packets,sources:decoders.size,light,peak,maxGap});process.exitCode=1;}
 else console.log('PASS: real native performer -> Opus relay -> listener', {packets,sources:decoders.size,peak,qualities:[...qualities],objects:[...objectKinds],boardSeen,light,panels,scenery,artwork,maxGapMs:Math.round(maxGap)});
},Number(process.env.CARDINAL_LISTEN_MS||5000));
