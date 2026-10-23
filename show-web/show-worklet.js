// SPDX-License-Identifier: GPL-3.0-or-later
class ShowPCM extends AudioWorkletProcessor {
  constructor() {
    super(); this.blocks = []; this.anchor = null; this.inputRate = 48000; this.bufferSeconds = .18; this.targetBuffer=.18; this.rebuffers=0; this.missing=0; this.starved=0; this.reportAt=0; this.receivedEnd=null;
    this.port.onmessage = ({data}) => {
      if(Number.isFinite(data.bufferSeconds)){this.bufferSeconds=Math.max(.08,Math.min(2.5,data.bufferSeconds));this.targetBuffer=this.bufferSeconds;this.blocks=[];this.anchor=null;this.missing=0;return;}
      if (data.reset) { this.blocks = []; this.anchor = null; this.missing=0; return; }
      if (!data.samples?.length) return;
      const late=this.anchor!==null&&(data.frame+data.samples.length<this.playFrame()-data.rate*.04||this.missing>data.rate*.02);
      // A continuous burst is not a source-clock reset, even if playback is
      // temporarily over a second behind it while filling the recovery buffer.
      const discontinuity=this.receivedEnd!==null&&Math.abs(data.frame-this.receivedEnd)>data.rate;
      this.receivedEnd=data.frame+data.samples.length;
      if (this.anchor === null || this.inputRate !== data.rate || late || discontinuity) {
        if(late){this.targetBuffer=Math.max(this.bufferSeconds,Math.min(.6,this.targetBuffer+.08));this.rebuffers++;}
        this.blocks = []; this.missing=0; this.inputRate = data.rate; this.anchor = {frame:data.frame, time:currentTime + this.targetBuffer};
        this.port.postMessage({anchor:this.anchor,rate:data.rate});
      }
      // If a burst exceeds the queue limit, move the playback clock with the
      // retained audio. Discarding unplayed blocks without moving the clock
      // otherwise leaves it chasing the front of the queue in perpetual silence.
      this.blocks.push(data);
      let trimmed=false;
      // A measured tunnel stall lasted almost two seconds. Keep enough bounded
      // history for recovery without imposing this latency on a healthy link.
      while (this.blocks.length > 1 && this.blocks.at(-1).frame - this.blocks[0].frame > this.inputRate * 2.5) {this.blocks.shift();trimmed=true;}
      if(trimmed&&this.blocks[0].frame>this.playFrame()){
        this.anchor={frame:this.blocks[0].frame,time:currentTime};
        this.missing=0;
        this.port.postMessage({anchor:this.anchor,rate:this.inputRate});
      }
    };
  }
  playFrame() { return this.anchor ? this.anchor.frame + (currentTime - this.anchor.time) * this.inputRate : 0; }
  process(_inputs, outputs) {
    const out = outputs[0]?.[0]; if (!out || !this.anchor) return true;
    for (let i = 0; i < out.length; i++) {
      const frame = this.playFrame() + i * this.inputRate / sampleRate;
      while (this.blocks.length && this.blocks[0].frame + this.blocks[0].samples.length <= frame) this.blocks.shift();
      const b = this.blocks[0];
      if (!b || frame < b.frame) {
        out[i] = 0;
        if(currentTime>=this.anchor.time){this.missing++;this.starved++;}
        continue;
      }
      this.missing=0;
      const p = frame - b.frame, j = Math.floor(p), a = b.samples[j], next = b.samples[j + 1] ?? a;
      out[i] = a + (next - a) * (p - j);
    }
    if(currentTime>=this.reportAt){
      this.reportAt=currentTime+.25;
      const tail=this.blocks.at(-1);
      const queued=tail?Math.max(0,(tail.frame+tail.samples.length-this.playFrame())/this.inputRate):0;
      this.port.postMessage({anchor:this.anchor,rate:this.inputRate,playing:this.missing===0&&currentTime>=this.anchor.time,bufferSeconds:Math.max(this.targetBuffer,queued),rebuffers:this.rebuffers,starvedSamples:this.starved});
    }
    return true;
  }
}
registerProcessor('cardinal-show-pcm', ShowPCM);
