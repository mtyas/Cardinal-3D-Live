// SPDX-License-Identifier: GPL-3.0-or-later
import {OpusDecoderWebWorker} from 'opus-decoder';
const closeNative=decoder=>{try{if(decoder&&decoder.state!=='closed')decoder.close();}catch{}};
export class ShowAudio {
  sources = new Map(); anchor = null; context = null; ready = false; codec = 'pcm';
  bufferSeconds=.18;
  setLowData(enabled){const seconds=enabled ? .3 : .18;if(seconds===this.bufferSeconds)return;this.bufferSeconds=seconds;this.anchor=null;for(const source of this.sources.values())source.node.port.postMessage({bufferSeconds:seconds});}
  async enable(forceWasm=false) {
    if (!this.context) this.context = new AudioContext({latencyHint:'interactive'});
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
    if (!this.ready) { await this.context.audioWorklet.addModule('/show-worklet.js'); this.ready = true; }
  }
  configure(scene) {
    const live = new Set(scene.speakers.map(s => s.id));
    for (const [id, s] of this.sources) if (!live.has(id)) { s.node.disconnect(); s.panner.disconnect(); s.node.port.close(); closeNative(s.decoder); s.wasmDecoder?.free().catch(()=>{}); this.sources.delete(id); }
    if (!live.size) this.anchor = null;
    if (!this.ready) return;
    for (const s of scene.speakers) {
      let source = this.sources.get(s.id);
      if (!source) {
        const node = new AudioWorkletNode(this.context, 'cardinal-show-pcm', {numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1]});
        node.port.postMessage({bufferSeconds:this.bufferSeconds});
        const panner = new PannerNode(this.context, {panningModel:'HRTF',distanceModel:'inverse'});
        node.connect(panner).connect(this.context.destination); source = {node,panner}; this.sources.set(s.id,source);
        node.port.onmessage = ({data}) => { if (data.anchor) this.anchor = {...data.anchor,rate:data.rate}; };
      }
      const p = source.panner, t = this.context.currentTime, yaw = s.yaw * Math.PI / 180;
      [p.positionX,p.positionY,p.positionZ].forEach((a,i) => a.setTargetAtTime(s.position[i],t,.03));
      p.orientationX.value = Math.sin(yaw); p.orientationY.value = 0; p.orientationZ.value = Math.cos(yaw);
      p.refDistance = s.ref_distance; p.maxDistance = Math.max(s.max_distance,s.ref_distance); p.rolloffFactor = s.rolloff;
      p.coneInnerAngle = s.directional ? s.cone : 360; p.coneOuterAngle = s.directional ? Math.min(360,s.cone + 45) : 360; p.coneOuterGain = .15;
    }
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
          if(source.pending>=12)continue;
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
        if(source.decoder.state==='configured'&&source.decoder.decodeQueueSize<25)source.decoder.decode(new EncodedAudioChunk({type:'key',timestamp:Math.round(frame/48000*1e6),data:payload}));
        this.receivedQuality=kbps;
        continue;
      }
      // A copy isolates the worklet from the network buffer's lifetime.
      const samples = new Float32Array(buffer.slice(offset,offset+count*4)); offset += count*4;
      this.sources.get(id)?.node.port.postMessage({frame,rate,samples},[samples.buffer]);
    }
  }
  frame(sampleRate=null) {
    if (!this.anchor || !this.context || this.context.state !== 'running') return null;
    const audibleTime = this.context.currentTime - (this.context.outputLatency || this.context.baseLatency || 0);
    return (this.anchor.frame / this.anchor.rate + audibleTime - this.anchor.time) * (sampleRate || this.anchor.rate);
  }
  listener(position, forward, up) {
    if (!this.ready) return;
    const l = this.context.listener;
    [l.positionX,l.positionY,l.positionZ].forEach((a,i)=>a.value=position[i]);
    [l.forwardX,l.forwardY,l.forwardZ].forEach((a,i)=>a.value=forward[i]);
    [l.upX,l.upY,l.upZ].forEach((a,i)=>a.value=up[i]);
  }
  reset() { for (const s of this.sources.values()) { s.node.disconnect(); s.panner.disconnect(); s.node.port.close(); closeNative(s.decoder); s.wasmDecoder?.free().catch(()=>{}); } this.sources.clear(); this.anchor = null; }
}
