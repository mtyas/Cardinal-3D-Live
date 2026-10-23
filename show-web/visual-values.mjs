// SPDX-License-Identifier: GPL-3.0-or-later
// Preserve queued scene baselines: never mutate the previous canonical snapshot.
export function mergeVisualValues(previous,data){
 const result={...data};delete result.visual_values;
 const visual=data.visuals||previous?.visuals;if(!visual)return result;
 result.visuals=visual;
 if(!data.visual_values)return result;
 if(!Array.isArray(data.visual_values)||data.visual_values.length>4096)throw Error('Invalid live values');
 const groups=new Map();
 for(const entry of data.visual_values){
  const v=entry?.values;
  if(typeof entry?.module!=='string'||!v||!['knob','slider','switch','custom','light','meter'].includes(v.kind)||!['number','string'].includes(typeof v.id))throw Error('Invalid live control');
  for(const key of ['normalized','value','brightness','emission_r','emission_g','emission_b'])if(v[key]!==undefined&&!Number.isFinite(v[key]))throw Error('Invalid live number');
  if(v.levels!==undefined&&(!Array.isArray(v.levels)||v.levels.length!==6||!v.levels.every(n=>Number.isFinite(n)&&n>=0&&n<=1)))throw Error('Invalid meter levels');
  if(v.display!==undefined&&(typeof v.display!=='string'||v.display.length>1024))throw Error('Invalid live display');
  const fields={kind:v.kind,id:v.id};
  for(const key of ['normalized','value','brightness','emission_r','emission_g','emission_b','levels','display','visible'])if(v[key]!==undefined)fields[key]=v[key];
  if(!groups.has(entry.module))groups.set(entry.module,[]);groups.get(entry.module).push(fields);
 }
 let changed=false;
 const panels=visual.panels.map(p=>{
  const updates=groups.get(p.id);if(!updates)return p;
  const byKey=new Map(updates.map(v=>[v.kind+'/'+v.id,v]));let touched=false;
  const controls=p.controls.map(c=>{const v=byKey.get(c.kind+'/'+c.id);if(!v)return c;touched=true;return {...c,...v};});
  if(!touched)return p;changed=true;return {...p,controls};
 });
 if(changed)result.visuals={...visual,panels};
 return result;
}
