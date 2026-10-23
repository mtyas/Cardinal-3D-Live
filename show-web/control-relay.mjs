// SPDX-License-Identifier: GPL-3.0-or-later
import {randomUUID} from 'node:crypto';
// Authentication is provided by the existing /performer and /room sockets.
// This router never applies a parameter or promotes a client-supplied identity.
export class ControlRelay {
 constructor(send, now=Date.now){this.send=send;this.now=now;this.host=null;this.epoch='';this.peers=new Map();this.grants=new Map();this.tokens=4;this.at=now();}
 join(id,socket){this.peers.set(id,socket);}
 setHost(socket){this.reset();this.host=socket;}
 reset(){for(const id of [...this.grants.keys()])this.revoke(id,'session_reset');this.epoch='';}
 leave(id,socket){this.revoke(id,'disconnected');this.peers.delete(id);if(socket===this.host){this.reset();this.host=null;}}
 revoke(id,reason){const grant=this.grants.get(id);if(!grant)return;this.grants.delete(id);const message={type:'control_permission',actor:id,epoch:this.epoch,grant:grant.token,enabled:false,reason};this.send(this.peers.get(id),message);this.send(this.host,message);}
 tick(){for(const [id,g] of this.grants)if([...g.pending.values()].some(request=>this.now()-request.at>=1500))this.revoke(id,'host_timeout');}
 handle(socket,id,data){
  if(typeof data?.type!=='string'||!data.type.startsWith('control_'))return false;
  this.tick();
  if(socket===this.host){
   if(data.type==='control_session'){
    if(typeof data.epoch!=='string'||!data.epoch.length||data.epoch.length>96)return true;
    this.reset();this.epoch=data.epoch;this.send(socket,{type:'control_session',epoch:this.epoch});
   }else if(data.type==='control_revoke')this.revoke(data.actor,'host_revoked');
   else if(data.type==='control_grant'&&data.epoch===this.epoch&&this.epoch&&this.peers.has(data.actor)&&this.peers.get(data.actor)!==socket){
    if(this.grants.has(data.actor))return true;
    if(this.grants.size>=16)return true;
    const grant={token:randomUUID(),sequence:0,pending:new Map()};this.grants.set(data.actor,grant);
    const message={type:'control_permission',actor:data.actor,enabled:true,epoch:this.epoch,grant:grant.token,window:3};
    if(!this.send(socket,message)||!this.send(this.peers.get(data.actor),message))this.revoke(data.actor,'backpressure');
   }else if(data.type==='control_result'){
    const g=this.grants.get(data.actor);
    if(!g||g.token!==data.grant||data.epoch!==this.epoch||!g.pending.has(data.sequence))return true;
    g.pending.delete(data.sequence);
    if(!this.send(this.peers.get(data.actor),data))this.revoke(data.actor,'backpressure');
   }
   return true;
  }
  if(data.type==='control_abandon'){this.revoke(id,'client_stopped');return true;}
  if(data.type!=='control_action')return true;
  const g=this.grants.get(id);
  const reject=reason=>this.send(socket,{type:'control_result',ok:false,reason,epoch:this.epoch,sequence:Number.isSafeInteger(data.sequence)?data.sequence:0});
  if(!g||data.grant!==g.token){reject('read_only');return true;}
  if(data.epoch!==this.epoch){reject('stale_epoch');return true;}
  if(!Number.isSafeInteger(data.sequence)||data.sequence<=g.sequence||data.sequence>2147483647){reject('stale_sequence');return true;}
  const validId=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v);
  const port=v=>Number.isInteger(v)&&v>=0&&v<=65535;
  const cable=['cable_connect','cable_disconnect'].includes(data.action);
  if(cable){
   if(!validId(data.wiring)||!validId(data.input_module)||!port(data.input_port)||
    (data.action==='cable_connect'&&(!validId(data.output_module)||!port(data.output_port)||(data.replace_cable!==undefined&&!validId(data.replace_cable))))||
    (data.action==='cable_disconnect'&&!validId(data.cable_id))){reject('invalid_action');return true;}
  }else if(!['begin','update','end'].includes(data.action)||!validId(data.module)||!port(data.parameter)||
    (data.action!=='begin'&&(typeof data.lease!=='string'||data.lease.length>64))||
    (data.action==='update'&&(!Number.isFinite(data.value)||data.value<0||data.value>1))){reject('invalid_action');return true;}
  g.sequence=data.sequence;
  if(g.pending.size&&(g.pending.size>=3||data.action!=='update'||[...g.pending.values()].some(r=>r.action!=='update'||r.module!==data.module||r.parameter!==data.parameter||r.lease!==data.lease))){reject('await_ack');return true;}
  const now=this.now();this.tokens=Math.min(4,this.tokens+Math.max(0,now-this.at)*30/1000);this.at=now;
  if(this.tokens<1){reject('rate_limited');return true;}this.tokens--;
  const command={type:'control_action',actor:id,grant:g.token,epoch:this.epoch,sequence:data.sequence,action:data.action};
  const fields=cable?['wiring','input_module','input_port',...(data.action==='cable_connect'?['output_module','output_port','replace_cable']:['cable_id'])]:['module','parameter',...(data.action!=='begin'?['lease']:[]),...(data.action==='update'?['value']:[])];
  for(const field of fields)if(data[field]!==undefined)command[field]=data[field];
  g.pending.set(data.sequence,{sequence:data.sequence,at:now,action:data.action,module:data.module,parameter:data.parameter,lease:data.lease});
  if(!this.send(this.host,command))this.revoke(id,'backpressure');
  return true;
 }
}
