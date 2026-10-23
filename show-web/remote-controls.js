// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import {ControlClient} from './control-client.js';
export class RemoteControls {
 constructor({send,rack,canvas,camera,scene,panel,audio}){
  this.audio=audio;this.client=new ControlClient(send);this.rack=rack;this.camera=camera;this.ray=new THREE.Raycaster();this.input=null;this.targets=[];this.lastFrame=null;this.signature='';
  const section=document.createElement('section');section.className='remote-controls read-only';this.section=section;
  const title=document.createElement('strong');title.textContent='Collaborative controls';section.append(title);
  this.status=document.createElement('p');this.status.setAttribute('role','status');section.append(this.status);
  const fallback=document.createElement('details');const fallbackTitle=document.createElement('summary');fallbackTitle.textContent='Buffered fallback response';fallback.append(fallbackTitle);section.append(fallback);
  const audioLabel=document.createElement('label');audioLabel.textContent='Buffered fallback response';
  this.audioResponse=document.createElement('select');this.audioResponse.setAttribute('aria-label','Buffered fallback response');
  for(const [value,text] of [['responsive','Responsive - 80 ms buffer'],['stable','Stable - 180 ms buffer']]){const option=document.createElement('option');option.value=value;option.textContent=text;this.audioResponse.append(option);}
  try{this.audioResponse.value=localStorage.getItem('cardinal-show-performer-audio')||'responsive';}catch{}
  this.audioResponse.onchange=()=>{try{localStorage.setItem('cardinal-show-performer-audio',this.audioResponse.value);}catch{}this.audio?.setPerformer(Boolean(this.client.permission),this.audioResponse.value==='responsive');};
  audioLabel.append(this.audioResponse);fallback.append(audioLabel);const audioHint=document.createElement('p');audioHint.className='hint';audioHint.textContent='WebRTC is the preferred audio connection for everyone. These buffer settings apply only to the buffered stream fallback; check Audio connection above for status.';fallback.append(audioHint);
  const manual=document.createElement('details');const manualTitle=document.createElement('summary');manualTitle.textContent='Choose a control from a list';manual.append(manualTitle);section.append(manual);
  this.modules=document.createElement('select');this.modules.setAttribute('aria-label','Remote module');manual.append(this.modules);
  this.parameters=document.createElement('select');this.parameters.setAttribute('aria-label','Remote parameter');manual.append(this.parameters);
  this.slider=document.createElement('input');this.slider.type='range';this.slider.min='0';this.slider.max='1';this.slider.step='.001';this.slider.disabled=true;this.slider.setAttribute('aria-label','Remote parameter value');manual.append(this.slider);
  this.activateButton=document.createElement('button');this.activateButton.textContent='Press / toggle selected control';this.activateButton.disabled=true;manual.append(this.activateButton);
  this.activateButton.onpointerdown=e=>{if(e.button!==0)return;const t=this.selected();if(t?.kind==='switch'&&this.client.begin(t)){this.activateButton.setPointerCapture(e.pointerId);}};
  for(const event of ['pointerup','pointercancel','lostpointercapture'])this.activateButton.addEventListener(event,()=>this.release());
  this.activateButton.onclick=e=>{if(e.detail===0){const t=this.selected();if(t?.kind==='switch'&&this.client.begin(t))this.client.end();}};
  const cableActions=document.createElement('div');cableActions.className='secondary-actions';section.append(cableActions);
  const cancel=document.createElement('button');cancel.textContent='Cancel cable selection';cancel.onclick=()=>{this.cableSelection=null;this.client.status='Cable selection cancelled';};cableActions.append(cancel);
  const unplug=document.createElement('button');unplug.textContent='Disconnect selected cable';unplug.onclick=()=>this.disconnectCable();cableActions.append(unplug);
  const hint=document.createElement('p');hint.className='control-help';hint.textContent='Drag knobs up/down. Press buttons; click switches to cycle. Connect an output to an input by dragging or selecting each port. Select a cable or connected input to move it; select its input again to disconnect. VR: trigger selects, hold and raise/lower to turn knobs.';section.append(hint);panel.append(section);
  this.modules.onchange=()=>{this.release();this.populateParameters();};this.parameters.onchange=()=>{this.release();this.refreshSlider();};
  this.slider.addEventListener('input',()=>{const t=this.selected();if(t&&!this.client.gesture)this.client.begin(t);this.client.move(Number(this.slider.value));});
  this.slider.addEventListener('change',()=>this.release());this.slider.addEventListener('blur',()=>this.release());
  canvas.addEventListener('pointerdown',e=>{
   if(e.button!==0||this.input||!this.client.permission)return;
   const rect=canvas.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
   const target=rack.hitControl(this.ray);if(!target||!this.activate(target))return;
   e.preventDefault();e.stopImmediatePropagation();canvas.setPointerCapture(e.pointerId);this.input={pointer:e.pointerId,start:e.clientY,value:target.value,target};
  },true);
  canvas.addEventListener('pointermove',e=>{if(this.input?.pointer!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();if(['knob','slider'].includes(this.input.target.kind))this.client.move(this.input.value+(this.input.start-e.clientY)/240);},true);
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{if(this.input?.pointer===e.pointerId){e.stopImmediatePropagation();
   if(name==='pointerup'&&['port','cable'].includes(this.input.target.kind)){
    const rect=canvas.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
    const end=rack.hitControl(this.ray),start=this.input.target;
    if(end?.kind==='port'&&(start.kind==='cable'||end.module!==start.module||end.port!==start.port||end.direction!==start.direction))this.activate(end);
   }
   this.release();}},true);
  addEventListener('blur',()=>this.release());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.release();});
  const label=document.createElement('canvas');label.width=768;label.height=96;this.label=label;this.texture=new THREE.CanvasTexture(label);
  this.sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.texture,depthTest:false,transparent:true}));this.sprite.scale.set(1.25,.156,1);this.sprite.visible=false;scene.add(this.sprite);
 }
 activate(target){
  const client=this.client,frame=client.frame;
  if(!client.permission||client.pending||client.gesture||frame?.control_epoch!==client.permission.epoch)return false;
  if(!['port','cable'].includes(target.kind)){this.cableSelection=null;return client.begin(target);}
  if(typeof frame.wiring!=='string')return false;
  if(target.kind==='cable'){
   if(!frame.visuals.cables.some(c=>c.id===target.id))return false;
   this.cableSelection={cable:target,wiring:frame.wiring,epoch:frame.control_epoch};client.status='Cable selected - choose a port to move, or its input to disconnect';return true;
  }
  const visible=frame.visuals.panels.some(p=>p.id===target.module&&p.controls.some(c=>c.kind==='port'&&c.id===target.port&&c.direction===target.direction&&c.visible!==false));
  if(!visible)return false;
  const selection=this.cableSelection;
  if(selection){
   if(selection.wiring!==frame.wiring){this.cableSelection=null;return false;}
   const c=selection.cable;
   if(c&&target.direction==='input'&&target.module===c.input_module&&target.port===c.input_port){this.disconnectCable();return true;}
   const other=c?{module:c[target.direction==='input'?'output_module':'input_module'],port:c[target.direction==='input'?'output_port':'input_port'],direction:target.direction==='input'?'output':'input'}:selection.port;
   if(other.direction!==target.direction){
    const input=target.direction==='input'?target:other,output=target.direction==='output'?target:other;
    client.cable('cable_connect',{wiring:selection.wiring,input_module:input.module,input_port:input.port,output_module:output.module,output_port:output.port,...(c?{replace_cable:c.id}:{})});this.cableSelection=null;return true;
   }
  }
  const cable=target.direction==='input'?frame.visuals.cables.find(c=>c.input_module===target.module&&c.input_port===target.port):null;
  this.cableSelection={port:target,cable,wiring:frame.wiring,epoch:frame.control_epoch};client.status=cable?'Cable selected - choose another port or select this input again to disconnect':'Port selected - choose the other endpoint';return true;
 }
 disconnectCable(){const selection=this.cableSelection,c=selection?.cable;if(!c)return;this.client.cable('cable_disconnect',{wiring:selection.wiring,cable_id:c.id,input_module:c.input_module,input_port:c.input_port});this.cableSelection=null;}
 selected(){return this.targets.find(t=>t.module===this.modules.value&&String(t.parameter)===this.parameters.value);}
 populateParameters(){const selected=this.parameters.value;this.parameters.replaceChildren();for(const t of this.targets.filter(t=>t.module===this.modules.value)){const o=document.createElement('option');o.value=String(t.parameter);o.textContent=t.label;this.parameters.append(o);}if([...this.parameters.options].some(o=>o.value===selected))this.parameters.value=selected;this.refreshSlider();}
 refreshSlider(){const t=this.selected();this.slider.disabled=!t||!this.client.permission||t.kind==='switch';this.activateButton.disabled=!t||!this.client.permission||t.kind!=='switch';if(t&&!this.client.gesture)this.slider.value=String(t.value);}
 receive(message){this.client.receive(message);if(message.type==='control_permission'){this.lastFrame=null;this.section?.classList.toggle('read-only',!this.client.permission);this.audio?.setPerformer(Boolean(this.client.permission),this.audioResponse.value==='responsive');}if(!this.client.permission){this.input=null;this.cableSelection=null;this.slider.disabled=true;this.activateButton.disabled=true;}}
 disconnect(){this.section?.classList.add('read-only');this.audio?.setPerformer(false);this.client.disconnect();this.input=null;this.cableSelection=null;this.rack.needsUpdate=true;}
 release(controller){if(controller&&this.input?.controller!==controller)return;this.input=null;this.client.end();}
 select(controller,ray){if(this.input)return false;const target=this.rack.hitControl(ray);if(!target||!this.activate(target))return false;this.input={controller,start:controller.getWorldPosition(new THREE.Vector3()).y,value:target.value,target};return true;}
 update(frame,camera,vr){
  if(frame!==this.lastFrame){this.lastFrame=frame;this.client.baseline(frame);this.targets=this.client.targets();
   const signature=JSON.stringify(this.targets.map(t=>[t.module,t.parameter,t.label]));
   if(signature!==this.signature){this.signature=signature;const selected=this.modules.value;this.modules.replaceChildren();for(const module of new Set(this.targets.map(t=>t.module))){const o=document.createElement('option');o.value=module;o.textContent=this.targets.find(t=>t.module===module).label.split(' · ')[0];this.modules.append(o);}if([...this.modules.options].some(o=>o.value===selected))this.modules.value=selected;this.populateParameters();}
   this.refreshSlider();
  }
  if(this.input?.controller&&['knob','slider'].includes(this.input.target.kind))this.client.move(this.input.value+(this.input.controller.getWorldPosition(new THREE.Vector3()).y-this.input.start)*2);
  const preview=this.client.presentation(frame);
  if(preview){this.rack.previewControl(preview.target,preview.value);this.hadPreview=true;this.slider.value=String(preview.value);}
  else if(this.hadPreview){this.rack.needsUpdate=true;this.hadPreview=false;}
  if(!this.client.gesture&&!['port','cable'].includes(this.input?.target.kind))this.input=null;
  if(this.cableSelection&&(!this.client.permission||frame?.control_epoch!==this.cableSelection.epoch||frame?.wiring!==this.cableSelection.wiring)){this.cableSelection=null;this.client.status='Wiring changed - select ports again';}
  const text=this.client.status;
  if(this.status.textContent!==text){this.status.textContent=text;const ctx=this.label.getContext('2d');ctx.clearRect(0,0,768,96);ctx.fillStyle='rgba(8,18,28,.9)';ctx.fillRect(0,0,768,96);ctx.fillStyle='#bafbea';ctx.font='24px sans-serif';ctx.fillText(text.slice(0,62),18,55);this.texture.needsUpdate=true;}
  this.modules.disabled=this.parameters.disabled=Boolean(this.client.gesture)||!this.client.permission;
  this.audioResponse.disabled=!this.client.permission;
  this.sprite.visible=vr&&Boolean(this.client.permission);
  if(this.sprite.visible){camera.getWorldPosition(this.sprite.position);const q=camera.getWorldQuaternion(new THREE.Quaternion());this.sprite.position.add(new THREE.Vector3(0,-.32,-1).applyQuaternion(q));}
 }
}
