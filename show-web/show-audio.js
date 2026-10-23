// SPDX-License-Identifier: GPL-3.0-or-later
import {OpusDecoderWebWorker} from 'opus-decoder';
const closeNative=decoder=>{try{if(decoder&&decoder.state!=='closed')decoder.close();}catch{}};
// Proxy stalls can deliver many 20ms packets together. Twelve packets only
// covered 240ms; retain up to 2.56s, matching the worklet recovery capacity.
const MAX_DECODE_PACKETS=128;
export class ShowAudio {
  sources = new Map(); anchor = null; context = null; ready = false; codec = 'pcm';
  bufferSeconds=.18;
  volume=1;
  setVolume(value){if(!Number.isFinite(value))return;this.volume=Math.max(0,Math.min(1,value));if(this.output)this.output.gain.setTargetAtTime(this.volume,this.context.currentTime,.015);}
  setLowData(enabled){this.lowData=enabled;this.updateBuffer();}
  setPerformer(enabled,responsive=true){this.performer=enabled;this.responsive=responsive;this.updateBuffer();this.onTransportPreference?.();}
  setBuffering(mode){this.buffering=mode==='stable'?'stable':'adaptive';this.updateBuffer();}
  updateBuffer(){const seconds=this.buffering==='stable'?2.5:this.lowData ? .3 : (this.performer && this.responsive ? .08 : .18);if(seconds===this.bufferSeconds)return;this.bufferSeconds=seconds;this.anchor=null;for(const source of this.sources.values()){source.clock=null;source.node.port.postMessage({bufferSeconds:seconds});}}
  async enable(forceWasm=false) {
    if (!this.context) this.context = new AudioContext({latencyHint:'interactive'});
    if(!this.output){this.output=this.context.createGain();this.output.gain.value=this.volume;this.output.connect(this.context.destination);}
    await this.context.resume();
    if(!forceWasm&&typeof AudioDecoder!=='undefined'){
      try{const supported=await AudioDecoder.isConfigSupported({codec:'opus',sampleRate:48000,numberOfChannels:1});if(supported.supported)this.codec='opus';}catch{}
    }
    if(forceWasm||this.codec!=='opus'){
      this.wasm=true;
      for(const source of this.sources.values()){closeNative(source.decoder);source.decoder=null;}
      if(!this.spareDecoder){this.spareDecoder=new OpusDecoderWebWorker({channels:1,sampleRate:48000});await this.spareDecoder.ready;}
      this.codec='opus';
    }
    if (!this.ready) { await this.context.audioWorklet.addModule('/show-worklet.js?v=queue-clock-2'); this.ready = true; }
  }
  configure(scene) {
    this.latestFrame=scene.frame;this.latestRate=scene.sample_rate;
    const live = new Set(scene.speakers.map(s => s.id));
    for (const [id, s] of this.sources) if (!live.has(id)) { s.node.disconnect(); s.gain?.disconnect(); s.panner.disconnect(); s.node.port.close(); closeNative(s.decoder); s.wasmDecoder?.free().catch(()=>{}); this.sources.delete(id); }
    if (!live.size) this.anchor = null;
    if (!this.ready) return;
    for (const s of scene.speakers) {
      let source = this.sources.get(s.id);
      if (!source) {
        const node = new AudioWorkletNode(this.context, 'cardinal-show-pcm', {numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1]});
        node.port.postMessage({bufferSeconds:this.bufferSeconds});
        const panner = new PannerNode(this.context, {panningModel:'HRTF',distanceModel:'inverse'});
        const gain=this.context.createGain();gain.gain.value=this.rtcActive?0:1;node.connect(gain).connect(panner).connect(this.output||this.context.destination); source = {node,panner,gain}; this.sources.set(s.id,source);
        node.port.onmessage = ({data}) => {
          if(data.anchor)source.clock={...data,observedAt:this.context.currentTime};
        };
      }
      const p = source.panner, t = this.context.currentTime, yaw = s.yaw * Math.PI / 180;
      [p.positionX,p.positionY,p.positionZ].forEach((a,i) => a.setTargetAtTime(s.position[i],t,.03));
      p.orientationX.value = Math.sin(yaw); p.orientationY.value = 0; p.orientationZ.value = Math.cos(yaw);
      p.refDistance = s.ref_distance; p.maxDistance = Math.max(s.max_distance,s.ref_distance); p.rolloffFactor = s.rolloff;
      p.coneInnerAngle = s.directional ? s.cone : 360; p.coneOuterAngle = s.directional ? Math.min(360,s.cone + 45) : 360; p.coneOuterGain = .15;
    }
    this.rtc?.attachPending?.();this.rtc?.update();
  }
  packet(buffer) {
    if (!this.ready) return;
    const v = new DataView(buffer); if (v.byteLength < 8) return;
    const compressed=v.getUint32(0,false)===0x4333444f;
    let offset = 8;
    for (let i = 0; i < v.getUint32(4,true); i++) {
      const id = v.getBigUint64(offset,true).toString(), frame = Number(v.getBigUint64(offset+8,true)), rate = v.getUint32(offset+16,true), count = v.getUint32(offset+20,true); offset += 24;
      if(compressed){
        const kbps=v.getUint32(offset,true);offset+=4;
        const source=this.sources.get(id),payload=new Uint8Array(buffer.slice(offset,offset+count));offset+=count;
        if(!source||this.codec!=='opus')continue;
        if(this.wasm){
          if(!source.wasmDecoder){source.wasmDecoder=this.spareDecoder||new OpusDecoderWebWorker({channels:1,sampleRate:48000});this.spareDecoder=null;source.pending=0;}
          if(source.pending>=MAX_DECODE_PACKETS)continue;
          const decoder=source.wasmDecoder;source.pending++;
          decoder.ready.then(()=>decoder.decodeFrame(payload)).then(result=>{
            if(this.sources.get(id)!==source||!result.samplesDecoded)return;
            const samples=result.channelData[0];source.node.port.postMessage({frame,rate:48000,samples},[samples.buffer]);
          }).catch(()=>{}).finally(()=>{source.pending--;});
          this.receivedQuality=kbps;continue;
        }
        if(!source.decoder){
          source.decoder=new AudioDecoder({output:data=>{
            const samples=new Float32Array(data.numberOfFrames);data.copyTo(samples,{planeIndex:0,format:'f32-planar'});
            source.node.port.postMessage({frame:Math.round(data.timestamp*48000/1e6),rate:48000,samples},[samples.buffer]);data.close();
          },error:()=>{if(!this.wasm){this.wasm=true;this.onCodecFallback?.();}}});
          source.decoder.configure({codec:'opus',sampleRate:48000,numberOfChannels:1});
        }
        if(source.decoder.state==='configured'&&source.decoder.decodeQueueSize<MAX_DECODE_PACKETS)source.decoder.decode(new EncodedAudioChunk({type:'key',timestamp:Math.round(frame/48000*1e6),data:payload}));
        this.receivedQuality=kbps;
        continue;
      }
      // A copy isolates the worklet from the network buffer's lifetime.
      const samples = new Float32Array(buffer.slice(offset,offset+count*4)); offset += count*4;
      this.sources.get(id)?.node.port.postMessage({frame,rate,samples},[samples.buffer]);
    }
  }
  frame(sampleRate=null) {
    if(this.rtcActive)return this.rtc?.frame(sampleRate)??null;
    if (!this.context || this.context.state !== 'running') return null;
    // One stable source owns the visual clock. A second source rebuffering must
    // not repeatedly pull all stage lights backwards or freeze them.
    const fresh=s=>s?.clock&&s.clock.playing!==false&&this.context.currentTime-s.clock.observedAt<.75;
    if(!fresh(this.sources.get(this.clockSource)))this.clockSource=[...this.sources].find(([,s])=>fresh(s))?.[0];
    const clock=this.sources.get(this.clockSource)?.clock;
    if(!fresh(this.sources.get(this.clockSource)))return null;
    this.anchor={...clock.anchor,rate:clock.rate};
    const audibleTime = this.context.currentTime - (this.context.outputLatency || this.context.baseLatency || 0);
    return (this.anchor.frame / this.anchor.rate + audibleTime - this.anchor.time) * (sampleRate || this.anchor.rate);
  }
  playbackStatus(){
    if(this.rtcActive)return this.rtc.playbackStatus();
    const clocks=[...this.sources.values()].map(s=>s.clock).filter(Boolean);
    if(!clocks.length)return 'buffering';
    const buffer=Math.max(...clocks.map(c=>c.bufferSeconds||this.bufferSeconds));
    const recovering=clocks.some(c=>c.playing===false);
    return `${Math.round(buffer*1000)} ms buffer${recovering?' · recovering':''} · audio r2`;
  }
  listener(position, forward, up) {
    if (!this.ready) return;
    const l = this.context.listener;
    [l.positionX,l.positionY,l.positionZ].forEach((a,i)=>a.value=position[i]);
    [l.forwardX,l.forwardY,l.forwardZ].forEach((a,i)=>a.value=forward[i]);
    [l.upX,l.upY,l.upZ].forEach((a,i)=>a.value=up[i]);
  }
  reset() { for (const s of this.sources.values()) { s.node.disconnect(); s.gain?.disconnect(); s.panner.disconnect(); s.node.port.close(); closeNative(s.decoder); s.wasmDecoder?.free().catch(()=>{}); } this.sources.clear(); this.anchor = null; }
}
