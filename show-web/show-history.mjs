// SPDX-License-Identifier: GPL-3.0-or-later
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
export class ShowHistory {
 constructor(path,now=Date.now){this.path=path;this.now=now;this.records=[];this.active=null;this.pending=Promise.resolve();this.lastSaved=0;}
 async load(){
  try{const data=JSON.parse(await readFile(this.path,'utf8'));if(Array.isArray(data))this.records=data.slice(0,500);}catch(e){if(e.code!=='ENOENT')throw e;}
  // A server restart ends the previous record at its last confirmed heartbeat.
  for(const r of this.records)if(!r.endedAt){r.endedAt=r.lastSeen||r.date;r.interrupted=true;}
 }
 update(publicLive,title){
  const time=this.now(),iso=new Date(time).toISOString();
  if(publicLive&&!this.active){this.active={id:randomUUID(),title,date:iso,lastSeen:iso,automatic:true};this.records.unshift(this.active);this.records=this.records.slice(0,500);this.save();}
  if(publicLive&&this.active){this.active.lastSeen=iso;if(time-this.lastSaved>10000)this.save();}
  if(!publicLive&&this.active){this.active.endedAt=iso;this.active=null;this.save();}
 }
 completed(){return this.records.filter(r=>r.endedAt).map(r=>({...r,description:`${Math.max(1,Math.round((Date.parse(r.endedAt)-Date.parse(r.date))/60000))} minute${Math.max(1,Math.round((Date.parse(r.endedAt)-Date.parse(r.date))/60000))===1?'':'s'} · live electronic performance${r.interrupted?' · connection ended':''}`}));}
 save(){this.lastSaved=this.now();const data=JSON.stringify(this.records,null,2)+'\n';this.pending=this.pending.then(async()=>{await mkdir(dirname(this.path),{recursive:true});await writeFile(this.path+'.next',data);await rename(this.path+'.next',this.path);}).catch(e=>console.error('Could not save performance history:',e.message));return this.pending;}
}
