// SPDX-License-Identifier: GPL-3.0-or-later
import {randomUUID, randomInt, createHmac} from 'node:crypto';
import {RTCPeerConnection, MediaStreamTrack, RTCRtpCodecParameters, RtpPacket, RtpHeader} from 'werift';

export const opusCodec=()=>new RTCRtpCodecParameters({mimeType:'audio/opus',clockRate:48000,channels:2,payloadType:111,parameters:'minptime=10;useinbandfec=1;stereo=0'});

// Configuration is operator-owned. Never accept ICE servers or credentials from a guest.
export function iceConfiguration(config={}, actor='guest', now=Date.now()) {
 const servers=config.ice_servers || [{urls:'stun:stun.cloudflare.com:3478'}];
 const iceServers=servers.map(s=>({...s}));
 if(config.turn_secret&&config.turn_urls){
  const username=`${Math.floor(now/1000)+3600}:${actor}`;
  iceServers.push({urls:config.turn_urls,username,credential:createHmac('sha1',config.turn_secret).update(username).digest('base64')});
 }
 return {iceServers,iceTransportPolicy:config.relay_only?'relay':'all'};
}

// Reuse one encoded Opus packet per source/quality. Each guest has a separate
// encrypted UDP transport, never a second DSP engine or an audio WebSocket queue.
export class RtcAudioRelay {
 constructor({config={},send,quality=()=>64,Peer=RTCPeerConnection,now=Date.now,iceProvider}={}){
  this.config=config;this.send=send;this.quality=quality;this.Peer=Peer;this.now=now;this.iceProvider=iceProvider;this.peers=new Map();this.requestTimes=new WeakMap();this.scene=null;
  this.pacer=setInterval(()=>this.drain(),5);this.pacer.unref?.();
 }
 request(socket){
  if(this.config.enabled===false){this.send(socket,{type:'rtc_unavailable',reason:'disabled'});return;}
  const last=this.requestTimes.get(socket);if(last!==undefined&&this.now()-last<3000){this.send(socket,{type:'rtc_unavailable',reason:'retry_later'});return;}this.requestTimes.set(socket,this.now());
  const old=this.peers.get(socket);
  if(old&&this.now()-old.requestedAt<3000)return;
  if(!old&&this.peers.size>=(this.config.max_peers||16)){this.send(socket,{type:'rtc_unavailable',reason:'capacity'});return;}
  this.stop(socket);const peer={socket,requestedAt:this.now(),id:randomUUID(),tracks:new Map(),connected:false};
  this.peers.set(socket,peer);this.start(peer).catch(()=>this.fail(peer,'negotiation_failed'));
 }
 async start(peer){
  if(!this.scene?.speakers.length){this.send(peer.socket,{type:'rtc_waiting'});return;}
  const config=iceConfiguration(this.config,peer.socket.member?.id||'guest',this.now());
  peer.abort=new AbortController();
  peer.timeout=setTimeout(()=>{if(this.peers.get(peer.socket)===peer)this.fail(peer,'connection_timeout');},20000);peer.timeout.unref?.();
  if(this.iceProvider){
   try{config.iceServers.push(...await this.iceProvider({signal:peer.abort.signal}));}
   catch{this.fail(peer,'turn_credentials_failed');return;}
   // A disconnect or topology change can supersede the API request.
   if(this.peers.get(peer.socket)!==peer)return;
  }
  const pc=peer.pc=new this.Peer({...config,codecs:{audio:[opusCodec()],video:[]},bundlePolicy:'max-bundle',iceAdditionalHostAddresses:['127.0.0.1'],iceUseIpv6:true,iceStunGatherTimeout:3,icePortRange:this.config.port_range,iceUseTcp:false});
  peer.topology=this.scene.speakers.map(s=>s.id).join(',');
  pc.onconnectionstatechange=()=>{
   if(this.peers.get(peer.socket)!==peer)return;
   peer.connected=pc.connectionState==='connected';
   if(peer.connected){clearTimeout(peer.timeout);this.send(peer.socket,{type:'rtc_connected',id:peer.id});}
   if(['failed','closed'].includes(pc.connectionState))this.fail(peer,'connection_failed');
  };
  // The same authenticated socket/actor and ControlRelay validate every action.
  // This channel only avoids the public WebSocket's delivery queue.
  const channel=peer.channel=pc.createDataChannel('cardinal-controls',{ordered:true});
  channel.onmessage=event=>{
   if(this.peers.get(peer.socket)!==peer||typeof event.data!=='string'||event.data.length>4096)return;
   peer.socket.acceptRtcControl?.(event.data);
  };
  const tracks=[];
  for(const speaker of this.scene.speakers){
   const track=new MediaStreamTrack({kind:'audio'}),transceiver=pc.addTransceiver(track,{direction:'sendonly'});
   peer.tracks.set(speaker.id,{track,sender:transceiver.sender,sequence:randomInt(65536),busy:false,queue:[],due:0,dropped:0});
   tracks.push({id:speaker.id,transceiver});
  }
  try{
   await pc.setLocalDescription(await pc.createOffer());
   if(this.peers.get(peer.socket)!==peer)return;
   this.send(peer.socket,{type:'rtc_offer',id:peer.id,sdp:pc.localDescription.sdp,configuration:config,tracks:tracks.map(t=>({id:t.id,mid:t.transceiver.mid}))});
  }catch{this.fail(peer,'negotiation_failed');}
 }
 async answer(socket,message){
  const peer=this.peers.get(socket);
  if(!peer?.pc||message.id!==peer.id||peer.answered)return;
  if(typeof message.sdp!=='string'||message.sdp.length>65536||!message.sdp.startsWith('v=0')){this.fail(peer,'invalid_answer');return;}
  peer.answered=true;
  try{await peer.pc.setRemoteDescription({type:'answer',sdp:message.sdp});}catch{this.fail(peer,'invalid_answer');}
 }
 fail(peer,reason){if(this.peers.get(peer.socket)!==peer)return;this.stop(peer.socket);this.send(peer.socket,{type:'rtc_unavailable',reason});}
 stop(socket){
  const peer=this.peers.get(socket);if(!peer)return;this.peers.delete(socket);clearTimeout(peer.timeout);peer.abort?.abort();
  for(const {track}of peer.tracks.values())track.stop();
  peer.pc?.close().catch(()=>{});
 }
 updateScene(scene){
  const reset=this.scene&&scene&&(scene.frame<this.scene.frame||scene.sample_rate!==this.scene.sample_rate);
  this.scene=scene;const topology=scene?.speakers.map(s=>s.id).join(',');
  for(const [socket,peer]of [...this.peers]){
   if(!scene){this.fail(peer,'performance_ended');continue;}
   if((!peer.pc&&!peer.abort&&scene.speakers.length)||(peer.topology!==undefined&&topology!==peer.topology)||reset){this.stop(socket);const next={socket,requestedAt:this.now(),id:randomUUID(),tracks:new Map(),connected:false};this.peers.set(socket,next);this.start(next).catch(()=>this.fail(next,'negotiation_failed'));}
  }
 }
 qualities(){return [...new Set([...this.peers.values()].filter(p=>p.connected).map(p=>this.quality(p.socket)))];}
 sendControl(socket,message){const channel=this.peers.get(socket)?.channel;if(channel?.readyState!=='open'||channel.bufferedAmount>=16384)return false;try{channel.send(JSON.stringify(message));return true;}catch{return false;}}
 packet(message){
  const bytes=Buffer.from(message.packet),id=bytes.readBigUInt64LE(8).toString(),frame=Number(bytes.readBigUInt64LE(16));
  for(const peer of this.peers.values()){
   const t=peer.tracks.get(id);if(!peer.connected||!t||this.quality(peer.socket)!==message.kbps)continue;
   const packet=new RtpPacket(new RtpHeader({payloadType:111,sequenceNumber:t.sequence++%65536,timestamp:frame>>>0,ssrc:t.sender.ssrc}),bytes.subarray(36));
   t.queue.push(packet);while(t.queue.length>6){t.queue.shift();t.dropped++;}
  }
  this.drain();
 }
 drain(){
  const now=this.now();
  for(const peer of this.peers.values())for(const t of peer.tracks.values()){
   if(!peer.connected||t.busy||!t.queue.length||now<t.due)continue;
   // Smooth encoder bursts at the actual 20ms packet cadence. Keep at most
   // 120ms of work and never discard a packet merely because sendRtp is async.
   if(now-t.due>120)t.due=now;
   t.due+=20;t.busy=true;
   t.sender.sendRtp(t.queue.shift()).catch(()=>this.fail(peer,'media_failed')).finally(()=>{t.busy=false;});
  }
 }
 close(){clearInterval(this.pacer);for(const socket of [...this.peers.keys()])this.stop(socket);}
}
