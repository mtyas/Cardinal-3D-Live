// SPDX-License-Identifier: GPL-3.0-or-later
// Both transports use the native DSP sample frame, never the wall clock.
export function audioBlocks(bytes) {
  const b = Buffer.from(bytes);
  if (b.length < 8 || b.toString('ascii', 0, 4) !== 'C3DA') throw Error('Invalid audio header');
  const count = b.readUInt32LE(4);
  if (count > 32) throw Error('Too many sources');
  let offset = 8;
  const blocks = [];
  for (let i = 0; i < count; i++) {
    if (offset + 24 > b.length) throw Error('Truncated audio header');
    const id = b.readBigUInt64LE(offset).toString();
    const frame = Number(b.readBigUInt64LE(offset + 8));
    const rate = b.readUInt32LE(offset + 16), samples = b.readUInt32LE(offset + 20);
    offset += 24;
    if (!Number.isSafeInteger(frame) || rate < 8000 || rate > 192000 || !samples || samples > 4096 || offset + samples * 4 > b.length) throw Error('Invalid audio block');
    for (let j = 0; j < samples; j++) if (!Number.isFinite(b.readFloatLE(offset + j * 4))) throw Error('Invalid audio sample');
    blocks.push({ id, frame, rate, samples }); offset += samples * 4;
  }
  if (offset !== b.length) throw Error('Trailing audio data');
  return blocks;
}
const finite = (v, low, high) => typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high;
export function validateShow(data) {
  if (data?.type !== 'show' || !Number.isSafeInteger(data.frame) || data.frame < 0 || !finite(data.sample_rate, 8000, 192000)) return false;
  if (!Array.isArray(data.speakers) || data.speakers.length > 32 || !Array.isArray(data.lights) || data.lights.length > 32) return false;
  const ids = new Set();
  for (const s of data.speakers) {
    if (!/^[0-9]{1,20}$/.test(s.id) || ids.has(s.id) || !Array.isArray(s.position) || s.position.length !== 3 || !s.position.every(v => finite(v, -100, 100))) return false;
    if (!finite(s.yaw, -180, 180) || !finite(s.cone, 15, 180) || !finite(s.ref_distance, .1, 10) || !finite(s.max_distance, 1, 100) || !finite(s.rolloff, 0, 4) || typeof s.directional !== 'boolean') return false;
    ids.add(s.id);
  }
  for (const l of data.lights) {
    if (!/^[0-9]{1,20}$/.test(l.id) || ids.has(l.id) || !Array.isArray(l.values) || l.values.length !== 9 || !l.values.every(v => finite(v, -180, 180))) return false;
    ids.add(l.id);
  }
  if(data.objects!==undefined){
    if(!Array.isArray(data.objects)||data.objects.length>64)return false;
    const low=[0,.05,.1,0,0,0,-20,0,-20,-180,.05,0],high=[1,4,4,1,1,1,20,10,20,180,3,2];
    for(const o of data.objects){if(!o||!/^[0-9]{1,20}$/.test(o.id)||ids.has(o.id)||!['figure','fountain','particles','sculpture'].includes(o.kind)||!Array.isArray(o.values)||o.values.length!==12||!o.values.every((n,i)=>finite(n,low[i]-.0001,high[i]+.0001))||!finite(o.phase,0,1)||!finite(o.frequency,0,80))return false;ids.add(o.id);}
  }
  if(data.performer_pose!==undefined){const p=data.performer_pose;if(!p||!Array.isArray(p.position)||p.position.length!==3||!p.position.every(n=>finite(n,-100,100))||!finite(p.yaw,-20,20))return false;}
  if(data.boards!==undefined){
   const low=[.5,.5,.025,0,0,0,0,0,0,-20,0,-20,-180,0],high=[8,6,.2,1,1,1,1,1,1,20,10,20,180,1];
   if(!Array.isArray(data.boards)||data.boards.length>16)return false;
   for(const b of data.boards){if(!b||!/^[0-9]{1,20}$/.test(b.id)||ids.has(b.id)||!Array.isArray(b.values)||b.values.length!==14||!b.values.every((n,i)=>finite(n,low[i]-.0001,high[i]+.0001)))return false;ids.add(b.id);}
  }
  if(data.performer_hands!==undefined){
    const hands=data.performer_hands;if(!hands||typeof hands!=='object'||Array.isArray(hands)||Object.keys(hands).some(k=>!['left','right'].includes(k)))return false;
    const point=a=>Array.isArray(a)&&a.length===3&&a.every(n=>finite(n,-100,100));
    for(const h of Object.values(hands)){
      if(!h||!['hand','controller'].includes(h.source))return false;
      if(h.source==='controller'){if(!point(h.position)||!Array.isArray(h.rotation)||h.rotation.length!==4||!h.rotation.every(n=>finite(n,-1,1))||Math.abs(h.rotation.reduce((s,n)=>s+n*n,0)-1)>.02||!finite(h.grip,0,1)||!finite(h.trigger,0,1))return false;}
      else {if(!Array.isArray(h.joints)||h.joints.length>26||!h.joints.some(j=>j?.id===1))return false;const ids=new Set();for(const j of h.joints){if(!j||!Number.isInteger(j.id)||j.id<0||j.id>25||ids.has(j.id)||!point(j.position))return false;ids.add(j.id);}}
    }
  }
  if (data.visuals !== undefined) {
    const v=data.visuals, matrix=a=>Array.isArray(a)&&a.length===16&&a.every(n=>finite(n,-10000,10000)), hash=h=>h===''||/^[a-f0-9]{64}$/.test(h);
    if(!v||!Array.isArray(v.panels)||v.panels.length>128||!Array.isArray(v.cables)||v.cables.length>512||!hash(v.environment)||!finite(v.hour,0,24)||!Number.isInteger(v.place)||v.place<0||v.place>7)return false;
    if(v.cases!==undefined&&(!Array.isArray(v.cases)||v.cases.length>32||v.cases.some(c=>!matrix(c.matrix)||!Array.isArray(c.bounds)||c.bounds.length!==4||!c.bounds.every(n=>finite(n,-1000,1000)))))return false;
    for(const p of v.panels)if(typeof p.id!=='string'||p.id.length>32||!matrix(p.matrix)||!finite(p.width,.001,20)||!finite(p.height,.001,20)||!hash(p.texture)||!Array.isArray(p.controls)||p.controls.length>2048)return false;
    for(const p of v.panels)for(const c of p.controls){
      if(!c||typeof c!=='object'||typeof c.kind!=='string'||c.kind.length>24||!['string','number'].includes(typeof c.id))return false;
      for(const key of ['x','y','width','height','normalized','brightness','emission_r','emission_g','emission_b','start_x','start_y','end_x','end_y','min_angle','max_angle'])if(c[key]!==undefined&&!finite(c[key],-100000,100000))return false;
    }
    for(const c of v.cables)if(![c.a,c.b].every(a=>Array.isArray(a)&&a.length===3&&a.every(n=>finite(n,-1000,1000)))||typeof c.color!=='string'||c.color.length>32)return false;
  }
  return true;
}
