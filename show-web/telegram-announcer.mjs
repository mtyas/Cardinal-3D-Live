// SPDX-License-Identifier: GPL-3.0-or-later
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {join} from 'node:path';

export async function atomicJSON(path,data){
 await writeFile(path+'.next',JSON.stringify(data,null,2)+'\n',{mode:0o600});await rename(path+'.next',path);
}
export function channelLink(config){
 return /^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(config?.channel||'')?'https://t.me/'+config.channel.slice(1):null;
}
export class TelegramAnnouncer{
 constructor(directory,{fetcher=fetch,now=Date.now,origin='https://live.example.org'}={}){
  this.directory=directory;this.fetcher=fetcher;this.now=now;this.origin=origin;this.state={events:[]};this.busy=false;
 }
 async load(){await mkdir(this.directory,{recursive:true});try{this.state=JSON.parse(await readFile(join(this.directory,'announcements.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}}
 async config(){try{return JSON.parse(await readFile(join(this.directory,'telegram.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
 async publicSettings(){const c=await this.config();return {provider:'telegram',url:channelLink(c),enabled:Boolean(c.botToken&&channelLink(c))};}
 async save(){this.state.events=this.state.events.slice(-200);await atomicJSON(join(this.directory,'announcements.json'),this.state);}
 async observe(info){
  if(this.busy||!info?.live||!info.publicOpen||!info.showId)return;
  this.busy=true;
  try{
   const config=await this.config();if(!config.botToken||!channelLink(config))return;
   let event=this.state.events.find(e=>e.id===info.showId);
   if(event&&['sent','uncertain','failed'].includes(event.status))return;
   if(event&&this.now()<event.retryAt)return;
   if(!event){event={id:info.showId,status:'pending',attempts:0};this.state.events.push(event);}
   event.attempts++;event.status='sending';await this.save();
   // 'sending' is persisted before contacting Telegram: a restart cannot post twice.
   const title=String(info.profile?.title||'Cardinal 3D Live').slice(0,180);
   let response,body;
   try{
    response=await this.fetcher(`https://api.telegram.org/bot${config.botToken}/sendMessage`,{
     method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),
     body:JSON.stringify({chat_id:config.channel,text:`${String(info.profile?.artist||'The performer').slice(0,80)} is live now!\n\n${title}\nSpatial music, instruments and animated worlds — come inside.\n\n${this.origin}/`,link_preview_options:{is_disabled:true}})
    });body=await response.json();
   }catch{
    // Telegram has no idempotency key. An ambiguous delivery is not retried automatically.
    event.status='uncertain';event.error='Delivery could not be confirmed';await this.save();return;
   }
   if(response.ok&&body.ok){event.status='sent';event.sentAt=new Date(this.now()).toISOString();event.messageId=body.result?.message_id;delete event.error;}
   else if(body.ok===false&&(body.error_code===429||body.error_code>=500)&&event.attempts<4){
    event.status='pending';event.retryAt=this.now()+Math.max(30000,Math.min(3600000,(Number(body.parameters?.retry_after)||60)*1000));event.error=`Telegram ${body.error_code}`;
   }else{event.status='failed';event.error=`Telegram ${body.error_code||response.status}`;}
   await this.save();
  }finally{this.busy=false;}
 }
 async recover(){for(const event of this.state.events)if(event.status==='sending')event.status='uncertain';await this.save();}
}
