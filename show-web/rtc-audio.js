// SPDX-License-Identifier: GPL-3.0-or-later
// Browser-native Opus decoding, jitter buffering and packet-loss concealment.
// No microphone/camera permission: every transceiver only receives engine audio.
export class RtcAudio {
 constructor({audio,send,Peer=globalThis.RTCPeerConnection,now=()=>performance.now()}={}){
  this.audio=audio;this.send=send;this.Peer=Peer;this.now=now;this.mode='auto';this.available=false;this.nodes=new Map();this.pending=new Map();this.status='';this.generation=0;
 }
 wanted(){return this.mode!=='buffered';}
 update(){
  if(this.wanted()&&this.audio.ready&&this.available&&this.Peer&&(!this.retryAt||this.now()>=this.retryAt)){if(!this.requested){this.requested=true;this.status='WebRTC connecting';this.send({type:'rtc_request'});}}
  else if(this.requested){this.stop();this.send({type:'rtc_stop'});}
 }
 setMode(mode){this.retryAt=0;this.mode=['webrtc','buffered'].includes(mode)?mode:'auto';this.stop();this.send({type:'rtc_stop'});this.update();}
 active(value){if(this.audio.rtcActive===value)return;this.audio.rtcActive=value;for(const s of this.audio.sources.values()){if(s.gain)s.gain.gain.value=value?0:1;if(!value)s.node?.port.postMessage({bufferSeconds:this.audio.bufferSeconds});}this.audio.anchor=null;this.onActive?.(value);}
 stop(){
  this.generation++;clearTimeout(this.timeout);clearInterval(this.statsTimer);const pc=this.pc;this.pc=null;this.channel=null;pc?.close();this.attachPending=null;
  for(const n of this.nodes.values()){n.source.disconnect();n.gain.disconnect();n.element.pause();n.element.srcObject=null;n.element.remove();}this.nodes.clear();this.pending.clear();this.requested=false;this.active(false);this.stats=null;
 }
 disconnect(){this.available=false;this.stop();this.status='';}
 fail(reason){this.stop();this.retryAt=this.now()+10000;this.status=`WebRTC unavailable (${reason}) · buffered audio`;this.send({type:'rtc_stop'});}
 async handle(message){
  if(message.type==='rtc_available'){this.available=message.enabled;this.update();return true;}
  if(!message.type?.startsWith('rtc_'))return false;
  if(message.type==='rtc_waiting'){this.status='WebRTC waiting for speakers';return true;}
  if(message.type==='rtc_unavailable'){this.fail(message.reason);return true;}
  if(message.type!=='rtc_offer'||!this.wanted()||!this.audio.ready||!this.Peer)return true;
  this.stop();this.requested=true;this.status='WebRTC connecting';const generation=this.generation;
  const pc=this.pc=new this.Peer({...message.configuration,bundlePolicy:'max-bundle'});
  const tracks=new Map(message.tracks.map(t=>[String(t.mid),t.id]));
  this.timeout=setTimeout(()=>{if(this.pc===pc)this.fail('connection timeout; TURN may be required');},20000);
  pc.ondatachannel=event=>{
   if(event.channel.label!=='cardinal-controls'){event.channel.close();return;}
   this.channel=event.channel;
   event.channel.onmessage=e=>{if(this.pc!==pc||typeof e.data!=='string'||e.data.length>4096)return;try{const message=JSON.parse(e.data);if(message.type?.startsWith('control_'))this.onControl?.(message);}catch{}};
  };
  this.attachPending=()=>{for(const [id,event] of this.pending){const target=this.audio.sources.get(id);if(!target)continue;this.pending.delete(id);
   const stream=new MediaStream([event.track]),source=this.audio.context.createMediaStreamSource(stream),gain=this.audio.context.createGain();
   // Chromium needs a media-element consumer to pump remote audio into WebAudio
   // (Chromium issue 40094084). Keep it muted: only the spatial graph is audible.
   const element=document.createElement('audio');element.muted=true;element.autoplay=true;element.hidden=true;element.srcObject=stream;document.body.append(element);element.play().catch(()=>{});
   gain.gain.value=0;source.connect(gain).connect(target.panner);this.nodes.set(id,{source,gain,receiver:event.receiver,track:event.track,element});
   const playing=()=>{if(this.pc!==pc)return;const ready=[...this.nodes.values()].filter(n=>!n.track.muted);if(ready.length!==tracks.size)return;clearTimeout(this.timeout);for(const n of ready)n.gain.gain.value=1;this.active(true);this.status='WebRTC real-time audio';};
   event.track.onunmute=playing;playing();
  }};
  pc.ontrack=event=>{const id=tracks.get(String(event.transceiver.mid));if(id){this.pending.set(id,event);this.attachPending();}};
  pc.onconnectionstatechange=()=>{if(this.pc!==pc)return;if(['failed','closed'].includes(pc.connectionState))this.fail('connection failed; TURN may be required');};
  try{
   await pc.setRemoteDescription({type:'offer',sdp:message.sdp});
   for(const t of pc.getTransceivers()){t.direction='recvonly';try{t.receiver.jitterBufferTarget=40;}catch{}}
   await pc.setLocalDescription(await pc.createAnswer());
   await new Promise(resolve=>{
    if(pc.iceGatheringState==='complete'){resolve();return;}
    const timer=setTimeout(done,5000);function done(){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',changed);resolve();}function changed(){if(pc.iceGatheringState==='complete')done();}pc.addEventListener('icegatheringstatechange',changed);
   });
   if(this.generation!==generation)return true;
   this.send({type:'rtc_answer',id:message.id,sdp:pc.localDescription.sdp});
   this.statsTimer=setInterval(()=>this.pollStats(pc),2000);
  }catch{if(this.pc===pc)this.fail('negotiation failed');}
  return true;
 }
 async pollStats(pc){
  if(this.pc!==pc)return;
  try{
   const report=await pc.getStats();if(this.pc!==pc)return;let jitter=0,buffer=0,rtt=null,lost=0,received=0,bytes=0,route='';
   for(const s of report.values()){
    if(s.type==='inbound-rtp'&&s.kind==='audio'){jitter=Math.max(jitter,s.jitter||0);buffer=Math.max(buffer,s.jitterBufferEmittedCount?s.jitterBufferDelay/s.jitterBufferEmittedCount:0);lost+=s.packetsLost||0;received+=s.packetsReceived||0;bytes+=s.bytesReceived||0;}
    if(s.type==='candidate-pair'&&s.state==='succeeded'&&s.nominated){rtt=s.currentRoundTripTime;const local=report.get(s.localCandidateId),remote=report.get(s.remoteCandidateId);route=local?.candidateType==='relay'||remote?.candidateType==='relay'?'TURN relay':'direct';}
   }
   const at=this.now(),previous=this.stats;this.stats={jitter,buffer,rtt,lost,received,bytes,route,at,kbps:previous?(bytes-previous.bytes)*8/Math.max(.001,(at-previous.at)/1000)/1000:0};
   // A connected ICE transport alone does not establish that media is arriving.
   if(this.audio.rtcActive&&previous&&bytes===previous.bytes)this.fail('audio stopped');
  }catch{}
 }
 frame(sampleRate){
  if(!this.audio.rtcActive||this.audio.latestFrame===undefined)return null;
  for(const n of this.nodes.values()){
   const source=n.receiver.getSynchronizationSources?.()[0];if(!source||!Number.isFinite(source.rtpTimestamp)||this.now()-source.timestamp>250)continue;
   const near=this.audio.latestFrame*48000/this.audio.latestRate,wrap=2**32;
   const frame=source.rtpTimestamp+Math.round((near-source.rtpTimestamp)/wrap)*wrap;
   return (frame/48000+Math.max(0,this.now()-source.timestamp)/1000-(this.audio.context.outputLatency||0))*(sampleRate||this.audio.latestRate);
  }
  return null;
 }
 playbackStatus(){
  if(!this.audio.rtcActive)return this.status;
  const s=this.stats;if(!s)return 'WebRTC real-time audio · measuring';
  return `WebRTC · ${s.route||'connected'} · ${Math.round(s.buffer*1000)} ms mean jitter buffer${s.rtt===null?'':` · ${Math.round(s.rtt*1000)} ms network RTT`} · ${s.lost} lost packets`;
 }
 sendControl(message){if(this.channel?.readyState!=='open'||this.channel.bufferedAmount>=16384)return false;try{this.channel.send(JSON.stringify(message));return true;}catch{return false;}}
}
