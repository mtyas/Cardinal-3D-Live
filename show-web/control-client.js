// SPDX-License-Identifier: GPL-3.0-or-later
// Device-independent gesture state. This client never owns or advances DSP.
export class ControlClient {
 constructor(send,now=()=>performance.now()){this.send=send;this.now=now;this.permission=null;this.frame=null;this.gesture=null;this.requests=new Map();this.preview=null;this.sequence=0;this.nextAt=0;this.status='Read-only · waiting for a host grant';}
 get pending(){return this.requests.values().next().value||null;}
 disconnect(reason='Disconnected'){this.permission=null;this.gesture=null;this.requests.clear();this.preview=null;this.frame=null;this.status=reason;}
 abandon(reason){if(this.permission)this.send({type:'control_abandon'});this.disconnect(reason);}
 receive(m){
  if(m.type==='control_permission'){
   if(!m.enabled){this.disconnect('Control access ended · ask the host to grant again');return;}
   if(typeof m.epoch!=='string'||typeof m.grant!=='string')return;
   this.gesture=null;this.requests.clear();this.preview=null;this.sequence=0;this.permission={epoch:m.epoch,grant:m.grant};this.window=Math.max(1,Math.min(3,Number.isInteger(m.window)?m.window:1));this.status='Control granted · waiting for the current rack';return;
  }
  if(m.type!=='control_result'||!this.requests.has(m.sequence)||m.epoch!==this.permission?.epoch)return;
  if(m.grant!==undefined&&m.grant!==this.permission.grant)return;
  const request=this.requests.get(m.sequence);this.requests.delete(m.sequence);this.roundTripMs=this.now()-request.at;
  if(request.action.startsWith('cable_')){this.status=m.ok?'Cable changed - waiting for the shared rack':'Cable not changed: '+String(m.reason||'rejected');return;}
  const g=this.gesture;if(!g)return;
  if(!m.ok){
   if(['rate_limited','await_ack'].includes(m.reason)){this.nextAt=this.now()+120;if(request.action==='update'&&request.sequence===g.lastUpdate)g.mustApply=true;return;}
   if(request.action==='begin'){this.gesture=null;this.preview=null;this.status='Control unavailable: '+String(m.reason||'rejected');return;}
   this.abandon('Grab ended: '+String(m.reason||'rejected'));return;
  }
  if(request.action==='begin'){
   if(typeof m.lease!=='string'){this.abandon('Invalid host acknowledgment');return;}
   g.lease=m.lease;this.status='Grabbed · drag to adjust';
   if(g.target.kind==='switch'){
    if(!Number.isFinite(m.value)||m.value<0||m.value>1){this.abandon('Invalid host switch value');return;}
    const steps=Math.max(1,Math.round(g.target.max-g.target.min));
    g.sent=m.value;g.value=g.target.momentary?1:(Math.round(m.value*steps)+1)%(steps+1)/steps;
    g.mustApply=true;
   }
  }else if(request.action==='update'){
   if(!Number.isFinite(m.value)||m.value<0||m.value>1){this.abandon('Invalid host value');return;}
   if(m.sequence<g.confirmedSequence){this.pump();return;}
   g.confirmedSequence=m.sequence;g.confirmed=m.value;
   if(m.sequence===g.lastUpdate){
    g.sent=m.value;g.mustApply=false;
    if(g.value===request.value)g.value=m.value;
   }
   this.preview={target:g.target,value:g.value,revision:m.revision,epoch:m.epoch,until:this.now()+2500};
   this.status='Host confirmed '+Math.round(m.value*100)+'%';
  }else{
   if(g.target.momentary)this.preview={target:g.target,value:0,revision:m.revision,epoch:m.epoch,until:this.now()+2500};
   this.gesture=null;this.status='Control granted - choose a control or port';
  }
  this.pump();
 }
 baseline(frame){
  this.frame=frame;
  if(!this.permission)return;
  if(frame?.control_epoch!==this.permission.epoch){
   if(this.gesture)this.abandon('Rack changed · ask the host to grant again');
   return;
  }
  if(this.gesture&&!this.targets().some(t=>t.module===this.gesture.target.module&&t.parameter===this.gesture.target.parameter))this.abandon('Control removed · ask the host to grant again');
  if(this.status==='Control granted · waiting for the current rack')this.status='Control granted · choose a control or port';
 }
 targets(){
  if(!this.permission||this.frame?.control_epoch!==this.permission.epoch)return [];
  const result=[];
  for(const p of this.frame.visuals?.panels||[])for(const c of p.controls||[]){
   if(!['knob','slider','switch'].includes(c.kind)||c.visible===false||!Number.isInteger(c.id)||c.id<0||c.id>65535||!Number.isFinite(c.normalized)||c.normalized<0||c.normalized>1||typeof p.id!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(p.id))continue;
   result.push({module:p.id,parameter:c.id,kind:c.kind,value:c.normalized,momentary:c.momentary===true,min:c.min??0,max:c.max??1,label:(p.name||p.id)+' · '+(c.label||c.kind+' '+c.id)});
  }
  return result;
 }
 begin(target){
  if(this.gesture||this.pending||!this.targets().some(t=>t.module===target.module&&t.parameter===target.parameter))return false;
  this.gesture={target:{...target},value:target.value,lastInput:target.value,sent:target.value,confirmed:target.value,lease:null,released:false,lastAt:this.now(),lastUpdate:0,confirmedSequence:0};
  this.status='Requesting control…';this.pump();return true;
 }
 move(value){if(!this.gesture||this.gesture.released||!Number.isFinite(value))return;value=Math.max(0,Math.min(1,value));if(value===this.gesture.lastInput)return;this.gesture.lastInput=value;this.gesture.value=value;this.preview={target:this.gesture.target,value:this.gesture.value,epoch:this.permission.epoch,until:this.now()+2500};this.pump();}
 end(){if(this.gesture){this.gesture.released=true;this.pump();}}
 pump(){
  const now=this.now(),g=this.gesture;
  if(this.pending&&now-this.pending.at>2000){this.abandon('Host response timed out · control stopped');return;}
  if(this.requests.size>=(this.window||1)||[...this.requests.values()].some(r=>r.action!=='update'))return;
  if(!g||!this.permission||now<this.nextAt)return;
  let action;
  if(!g.lease)action='begin';
  else if(g.mustApply||g.value!==g.sent)action='update';
  else if(g.released){if(this.requests.size)return;action='end';}
  else if(!this.requests.size&&now-g.lastAt>=400)action='update';
  else return;
  const message={type:'control_action',...this.permission,sequence:++this.sequence,action,module:g.target.module,parameter:g.target.parameter};
  if(g.lease)message.lease=g.lease;if(action==='update')message.value=g.value;
  this.requests.set(message.sequence,{...message,at:now});
  if(action==='update'){g.sent=g.value;g.lastUpdate=message.sequence;g.mustApply=false;}this.nextAt=now+50;g.lastAt=now;
  if(this.send(message)===false)this.abandon('Connection unavailable · control stopped');
 }
 cable(action,fields){
  if(!this.permission||this.pending||this.gesture||this.frame?.control_epoch!==this.permission.epoch||typeof this.frame.wiring!=='string')return false;
  if(!['cable_connect','cable_disconnect'].includes(action))return false;
  const message={type:'control_action',...fields,...this.permission,sequence:++this.sequence,action};
  this.requests.set(message.sequence,{...message,at:this.now()});this.status='Applying cable change...';
  if(this.send(message)===false)this.abandon('Connection unavailable - cable unchanged');
  return true;
 }
 presentation(frame){
  this.pump();
  if(!this.preview)return null;
  if(!this.gesture&&(frame?.control_epoch!==this.preview.epoch||frame.control_revision>=this.preview.revision||this.now()>this.preview.until)){this.preview=null;return null;}
  return this.preview;
 }
}
