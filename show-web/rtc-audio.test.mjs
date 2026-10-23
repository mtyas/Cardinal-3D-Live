import test from 'node:test';
import assert from 'node:assert/strict';
import {RTCPeerConnection} from 'werift';
import {RtcAudioRelay,opusCodec,iceConfiguration} from './rtc-audio-relay.mjs';
import {ShowEncoder} from './opus-encoder.mjs';
import {RtcAudio} from './rtc-audio.js';
import {ControlRelay} from './control-relay.mjs';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,ms=8000){const end=Date.now()+ms;while(!check()){if(Date.now()>end)throw Error('timed out');await wait(10);}}

test('TURN credentials expire and are minted per authenticated actor without exposing the secret',()=>{
 const config=iceConfiguration({ice_servers:[],turn_urls:['turn:relay.example:3478'],turn_secret:'private'},'actor-1',1000000);
 assert.equal(config.iceServers[0].username,'4600:actor-1');assert.ok(config.iceServers[0].credential);assert.ok(!JSON.stringify(config).includes('private'));
});

test('automatic WebRTC is for everyone; buffered mode overrides it and closing restores a single audio path',()=>{
 const sent=[],audio={ready:true,performer:false,sources:new Map([['1',{gain:{gain:{value:1}}}]])};
 const rtc=new RtcAudio({audio,send:m=>sent.push(m),Peer:class{}});rtc.available=true;
 rtc.update();assert.equal(sent.at(-1).type,'rtc_request');audio.performer=true;rtc.update();assert.equal(sent.length,1);
 rtc.active(true);assert.equal(audio.sources.get('1').gain.gain.value,0);
 rtc.setMode('buffered');assert.equal(audio.sources.get('1').gain.gain.value,1);assert.equal(rtc.wanted(),false);assert.equal(rtc.requested,false);
 rtc.setMode('webrtc');assert.equal(rtc.requested,true);rtc.disconnect();assert.equal(rtc.requested,false);assert.equal(rtc.available,false);
});

test('waiting requests are bounded, cannot flood negotiations, and disconnect releases capacity',async()=>{
 let now=10000;const messages=[],relay=new RtcAudioRelay({config:{ice_servers:[],max_peers:1},now:()=>now,send:(s,m)=>messages.push(m)}),a={},b={};
 relay.request(a);assert.equal(messages.length,1);assert.equal(messages[0].type,'rtc_waiting');
 for(let i=0;i<20;i++)relay.updateScene({frame:i,sample_rate:48000,speakers:[]});assert.equal(messages.length,1);
 relay.request(b);assert.equal(messages.at(-1).reason,'capacity');
 relay.stop(a);relay.request(a);assert.equal(relay.peers.size,0,'stop/start cannot bypass the negotiation rate limit');assert.equal(messages.at(-1).reason,'retry_later','rapid route changes get an explicit response rather than hanging');
 now+=4000;relay.request(b);assert.equal(relay.peers.size,1);relay.close();assert.equal(relay.peers.size,0);
});

test('WebRTC visual clock unwraps the native RTP timestamp and expires stale synchronization',()=>{
 let now=200;const audio={rtcActive:true,latestFrame:2**32+96000,latestRate:48000,context:{outputLatency:0}},rtc=new RtcAudio({audio,now:()=>now});
 rtc.nodes.set('1',{receiver:{getSynchronizationSources:()=>[{timestamp:200,rtpTimestamp:95040}]}});
 assert.equal(rtc.frame(48000),2**32+95040);now=220;assert.equal(rtc.frame(48000),2**32+96000);now=500;assert.equal(rtc.frame(48000),null);
});

test('encoder bursts are paced instead of silently dropping packets during an asynchronous RTP send',async()=>{
 let now=1000;const sent=[],socket={},relay=new RtcAudioRelay({now:()=>now});
 const track={sender:{ssrc:1,sendRtp:async p=>{sent.push(p);await Promise.resolve();}},sequence:0,busy:false,queue:[],due:0,dropped:0};
 relay.peers.set(socket,{connected:true,tracks:new Map([['1',track]])});
 try{
  for(let i=0;i<5;i++){const packet=Buffer.alloc(39);packet.writeBigUInt64LE(1n,8);packet.writeBigUInt64LE(BigInt(i*960),16);relay.packet({kbps:64,packet});}
  assert.equal(sent.length,1);assert.equal(track.queue.length,4);
  for(let i=0;i<4;i++){await new Promise(setImmediate);now+=20;relay.drain();}
  assert.equal(sent.length,5);assert.equal(track.dropped,0);assert.deepEqual(sent.map(p=>p.header.timestamp),[0,960,1920,2880,3840]);
 }finally{relay.peers.clear();relay.close();}
});

test('real ICE/DTLS/SRTP carries original Opus packets and DSP timestamps to two tracks without a second engine',async()=>{
 const socket={member:{id:'listener'}},messages=[],encoder=new ShowEncoder();
 const relay=new RtcAudioRelay({config:{ice_servers:[]},send:(s,m)=>messages.push(m)});
 const host={},forwarded=[],controlMessages=[];const controls=new ControlRelay((s,m)=>{if(s===host){forwarded.push(m);return true;}return relay.sendControl(s,m);});controls.join('listener',socket);controls.setHost(host);socket.acceptRtcControl=text=>controls.handle(socket,'listener',JSON.parse(text));let channel;
 const pc=new RTCPeerConnection({iceServers:[],iceAdditionalHostAddresses:['127.0.0.1'],iceUseIpv6:false,codecs:{audio:[opusCodec()],video:[]},bundlePolicy:'max-bundle'}),received=new Map();
 pc.ondatachannel=e=>{channel=e.channel;channel.onmessage=e=>controlMessages.push(JSON.parse(e.data));};
 pc.ontrack=e=>{const list=[];received.set(e.transceiver.mid,list);e.track.onReceiveRtp.subscribe(packet=>list.push(packet));};
 try{
  relay.updateScene({frame:0,sample_rate:48000,speakers:[{id:'1'},{id:'2'}]});relay.request(socket);
  await until(()=>messages.some(m=>m.type==='rtc_offer'));const offer=messages.find(m=>m.type==='rtc_offer');
  assert.equal(offer.tracks.length,2);assert.ok(offer.sdp.includes('a=sendonly'));assert.ok(!offer.sdp.includes('m=video'));
  await pc.setRemoteDescription({type:'offer',sdp:offer.sdp});await pc.setLocalDescription(await pc.createAnswer());await relay.answer(socket,{id:offer.id,sdp:pc.localDescription.sdp});
  await until(()=>relay.peers.get(socket)?.connected&&channel?.readyState==='open');assert.deepEqual(relay.qualities(),[64]);
  channel.send(JSON.stringify({type:'control_action',sequence:1}));await until(()=>controlMessages.length);assert.equal(controlMessages.pop().reason,'read_only');
  controls.handle(host,'host',{type:'control_session',epoch:'rtc-test'});controls.handle(host,'host',{type:'control_grant',epoch:'rtc-test',actor:'listener'});
  await until(()=>controlMessages.some(m=>m.type==='control_permission'));const permission=controlMessages.find(m=>m.type==='control_permission');
  channel.send(JSON.stringify({type:'control_action',actor:'forged',epoch:'rtc-test',grant:permission.grant,sequence:1,action:'begin',module:'1',parameter:0}));await until(()=>forwarded.some(m=>m.type==='control_action'));const action=forwarded.find(m=>m.type==='control_action');assert.equal(action.actor,'listener');
  controls.handle(host,'host',{type:'control_result',actor:'listener',grant:permission.grant,epoch:'rtc-test',sequence:1,ok:true,lease:'lease'});await until(()=>controlMessages.some(m=>m.type==='control_result'));assert.equal(controlMessages.find(m=>m.type==='control_result').ok,true);
  controlMessages.length=0;controls.handle(host,'host',{type:'control_revoke',actor:'listener'});await until(()=>controlMessages.length);assert.equal(controlMessages.pop().enabled,false);
  channel.send(JSON.stringify({...action,sequence:2}));await until(()=>controlMessages.length);assert.equal(controlMessages.pop().reason,'read_only');
  const expected=[];
  for(let j=0;j<15;j++){
   const frame=j*960,input=Buffer.alloc(8+2*(24+960*4));input.write('C3DA');input.writeUInt32LE(2,4);let offset=8;
   for(const id of [1n,2n]){input.writeBigUInt64LE(id,offset);input.writeBigUInt64LE(BigInt(frame),offset+8);input.writeUInt32LE(48000,offset+16);input.writeUInt32LE(960,offset+20);for(let i=0;i<960;i++)input.writeFloatLE(.2*Math.sin((frame+i)*2*Math.PI*440/48000),offset+24+i*4);offset+=24+960*4;}
   for(const m of encoder.encode(input,64,[64])){expected.push(m);relay.packet(m);}await wait(20);
  }
  await until(()=>[...received.values()].every(p=>p.length>=10));
  for(const {id,mid} of offer.tracks){const packets=received.get(mid);assert.ok(packets.length>=13);for(const packet of packets){const original=expected.find(e=>e.packet.readBigUInt64LE(8).toString()===id&&Number(e.packet.readBigUInt64LE(16))===packet.header.timestamp);assert.ok(original,'native DSP frame preserved');assert.deepEqual(packet.payload,original.packet.subarray(36));}}
  const old=relay.peers.get(socket),count=messages.length;
  relay.updateScene({frame:15*960,sample_rate:48000,speakers:[{id:'1'}]});
  await until(()=>messages.slice(count).some(m=>m.type==='rtc_offer'));const replacement=messages.slice(count).find(m=>m.type==='rtc_offer');assert.notEqual(replacement.id,offer.id);assert.equal(replacement.tracks.length,1);assert.equal(old.pc.connectionState,'closed');
  await relay.answer(socket,{id:offer.id,sdp:pc.localDescription.sdp});assert.ok(!relay.peers.get(socket).answered,'old answers cannot attach to a replacement session');
  relay.stop(socket);assert.equal(relay.peers.size,0);assert.deepEqual(relay.qualities(),[]);
 }finally{relay.close();encoder.reset();await pc.close();}
},{timeout:20000});
