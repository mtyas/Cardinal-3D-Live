// SPDX-License-Identifier: GPL-3.0-or-later
// Presentation only: no networking, audio graph or permission decisions here.
export class RoomInterface {
 constructor({document:doc=document,onPanelChange=()=>{}}={}){
  this.doc=doc;this.onPanelChange=onPanelChange;this.active=null;this.joined=false;this.hidden=false;
  this.buttons=[...doc.querySelectorAll('[data-panel]')];this.panels=[...doc.querySelectorAll('[data-room-panel]')];
  for(const button of this.buttons)button.addEventListener('click',()=>this.open(this.active===button.dataset.panel?null:button.dataset.panel,button));
  doc.getElementById('collapse').addEventListener('click',()=>this.open(null));
  doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&this.active){event.preventDefault();this.open(null);}});
 }
 open(name,trigger){
  if(name&&!this.panels.some(p=>p.dataset.roomPanel===name))return;
  const previous=this.active;this.active=name;
  if(trigger)this.returnFocus=trigger;
  for(const panel of this.panels)panel.hidden=panel.dataset.roomPanel!==name;
  for(const button of this.buttons)button.setAttribute('aria-expanded',String(button.dataset.panel===name));
  this.doc.getElementById('panel-title').textContent={chat:'Chat',sound:'Sound',play:'Play together',room:'Your room'}[name]||'Room';
  this.doc.body.classList.toggle('panel-open',Boolean(name)&&!this.hidden);
  if(name==='chat')this.doc.getElementById('chat-unread').hidden=true;
  if(name==='chat')this.buttons.find(b=>b.dataset.panel==='chat').setAttribute('aria-label','Chat');
  this.refresh();this.onPanelChange(name);
  if(name){const heading=this.doc.getElementById('panel-title');heading.tabIndex=-1;heading.focus({preventScroll:true});}
  else if(previous)this.returnFocus?.focus({preventScroll:true});
 }
 setJoined(value){this.joined=value;if(!value)this.open(null);this.refresh();}
 setHidden(value){this.hidden=value;if(value)this.open(null);this.refresh();}
 refresh(){
  for(const id of ['room-bar','room-dock'])this.doc.getElementById(id).hidden=!this.joined||this.hidden;
  this.doc.getElementById('chat').hidden=!this.joined||this.hidden||!this.active;
 }
 role(allowed){
  if(this.allowed===allowed)return;const was=this.allowed;this.allowed=allowed;
  const badge=this.doc.getElementById('room-role');badge.textContent=allowed?'Collaborator':'Visitor';badge.classList.toggle('performer',allowed);
  this.doc.getElementById('play-dot').hidden=!allowed;
  this.doc.getElementById('play-intro').textContent=allowed?'You’re invited to play. Use the synth directly: drag knobs, press buttons and connect cables.':'You’re listening as a visitor. The host can invite you to play.';
  if(was!==undefined)this.doc.getElementById('play-intro').setAttribute('role','status');
 }
 sound(ready,rtcActive,live,muted=false){
  const signature=[ready,rtcActive,live,muted].join(':');if(this.soundSignature===signature)return;this.soundSignature=signature;
  this.doc.getElementById('quick-audio').textContent=ready?(muted?'Muted':'Sound on'):'Enable sound';
  this.doc.getElementById('quick-audio').setAttribute('aria-label',ready?'Open sound settings':'Enable spatial sound');
  this.doc.getElementById('audio-summary').textContent=!ready?'Sound is off. Enable sound to listen.':muted?'Sound is muted on this device.':!live?'Sound is enabled. Waiting for the host.':rtcActive?'Real-time audio connected':'Sound enabled · check connection below if it stays delayed';
  this.doc.getElementById('mute-audio').disabled=!ready;
  this.doc.getElementById('mute-audio').textContent=muted?'Unmute':'Mute';
  this.doc.getElementById('fallback-settings').hidden=rtcActive;
 }
 unread(){if(this.active!=='chat'){this.doc.getElementById('chat-unread').hidden=false;this.buttons.find(b=>b.dataset.panel==='chat').setAttribute('aria-label','Chat, new messages');}}
}
