// SPDX-License-Identifier: GPL-3.0-or-later
class ShowPCM extends AudioWorkletProcessor {
  constructor() {
    super(); this.blocks = []; this.anchor = null; this.inputRate = 48000; this.bufferSeconds = .18;
    this.port.onmessage = ({data}) => {
      if(Number.isFinite(data.bufferSeconds)){this.bufferSeconds=Math.max(.12,Math.min(.45,data.bufferSeconds));this.blocks=[];this.anchor=null;return;}
      if (data.reset) { this.blocks = []; this.anchor = null; return; }
      if (!data.samples?.length) return;
      const late=this.anchor!==null&&data.frame+data.samples.length<this.playFrame()-data.rate*.04;
      if (this.anchor === null || this.inputRate !== data.rate || late || Math.abs(data.frame / data.rate - this.playFrame() / data.rate) > 1) {
        this.blocks = []; this.inputRate = data.rate; this.anchor = {frame:data.frame, time:currentTime + this.bufferSeconds};
        this.port.postMessage({anchor:this.anchor,rate:data.rate});
      }
      // Keep at most half a second of queued blocks, even after a tab stalls.
      this.blocks.push(data);
      while (this.blocks.length > 1 && this.blocks.at(-1).frame - this.blocks[0].frame > this.inputRate * .5) this.blocks.shift();
    };
  }
  playFrame() { return this.anchor ? this.anchor.frame + (currentTime - this.anchor.time) * this.inputRate : 0; }
  process(_inputs, outputs) {
    const out = outputs[0]?.[0]; if (!out || !this.anchor) return true;
    for (let i = 0; i < out.length; i++) {
      const frame = this.playFrame() + i * this.inputRate / sampleRate;
      while (this.blocks.length && this.blocks[0].frame + this.blocks[0].samples.length <= frame) this.blocks.shift();
      const b = this.blocks[0];
      if (!b || frame < b.frame) { out[i] = 0; continue; }
      const p = frame - b.frame, j = Math.floor(p), a = b.samples[j], next = b.samples[j + 1] ?? a;
      out[i] = a + (next - a) * (p - j);
    }
    return true;
  }
}
registerProcessor('cardinal-show-pcm', ShowPCM);
