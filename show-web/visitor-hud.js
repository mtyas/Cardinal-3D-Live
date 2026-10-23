// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
export function keyboardRows(symbols=false,shift=false){
 const rows=symbols?['1234567890','!@#$%&*()+','.,?/:;"\'=_','[]{}<>-']:
 ['1234567890','qwertyuiop','asdfghjkl','zxcvbnm'];
 return [...rows.map(row=>[...row].map(k=>({label:shift&&!symbols?k.toUpperCase():k,value:shift&&!symbols?k.toUpperCase():k}))),
  [{label:'Shift',action:'shift'},{label:symbols?'ABC':'Symbols',action:'symbols'},{label:'Space',value:' '},{label:'⌫',action:'backspace'},{label:'Send',action:'send'}]];
}
export function editDraft(draft,action,value=''){
 if(action==='backspace')return [...draft].slice(0,-1).join('');
 return action==='text'?(draft+value).slice(0,400):draft;
}
export class VisitorHud{
 constructor(scene,{onSend,onReact,onAudio,onQuality,onHide,onDraft,onPlaced,document:doc=document}={}){
  this.callbacks={onSend,onReact,onAudio,onQuality,onHide,onDraft,onPlaced};this.scene=scene;this.group=new THREE.Group();scene.add(this.group);this.group.visible=false;
  this.draft='';this.keyboardOpen=false;this.symbols=false;this.shift=false;this.history=[];this.audioLabel='Enable spatial sound';this.dragging=null;this.hover=null;
  this.main=this.panel(doc,768,1024,.64,.853);this.keyboard=this.panel(doc,1024,420,.84,.345);this.keyboard.mesh.position.set(0,-.63,.005);this.keyboard.mesh.visible=false;
  this.draw();this.drawKeyboard();
 }
 panel(doc,width,height,w,h){const canvas=doc.createElement('canvas');canvas.width=width;canvas.height=height;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,depthTest:false,depthWrite:false}));mesh.renderOrder=100;this.group.add(mesh);return {canvas,texture,mesh,regions:[]};}
 button(panel,x,y,w,h,label,action,value){const ctx=panel.canvas.getContext('2d');const index=panel.regions.length;ctx.fillStyle=this.hover?.mesh===panel.mesh&&this.hover?.index===index?'#30453e':'#1d2a2e';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#607774';ctx.strokeRect(x+.5,y+.5,w-1,h-1);ctx.fillStyle='#ecfaff';ctx.font='28px system-ui';ctx.textAlign='center';ctx.fillText(label,x+w/2,y+h/2+10,w-12);ctx.textAlign='left';panel.regions.push({x,y,w,h,action,value});}
 draw(){const p=this.main,c=p.canvas.getContext('2d');p.regions=[];c.fillStyle='#141e21';c.fillRect(0,0,768,1024);c.fillStyle='#a4edcf';c.font='bold 36px system-ui';c.fillText('YOUR ROOM',30,65);c.font='20px system-ui';c.fillStyle='#a4b6b7';c.fillText(this.roleLabel||'Visitor · listen & explore',30,91);p.regions.push({x:0,y:0,w:650,h:90,action:'move'});this.button(p,675,20,64,64,'×','hide');
  this.button(p,30,108,708,64,this.audioLabel,'audio');this.button(p,30,184,490,50,this.qualityLabel||'Quality · Automatic','quality');this.button(p,540,184,198,50,'Recenter','recenter');c.fillStyle='#b8d2e0';c.font='22px system-ui';c.fillText('Hold header to move · stick up/down changes distance.',30,265,708);
  let y=290;for(const entry of this.history.slice(-3)){c.fillStyle=entry.color;c.font='bold 27px system-ui';c.fillText(entry.name,30,y,708);y+=31;c.fillStyle='#edf4ff';c.font='26px system-ui';for(const line of (entry.text.match(/.{1,44}/gu)||[]).slice(0,2)){c.fillText(line,30,y,708);y+=29;}y+=12;}
  ['Glow','Sparkles','Shake','Grow'].forEach((label,i)=>this.button(p,30+(i%2)*360,600+Math.floor(i/2)*64,348,54,label,'reaction',label.toLowerCase()));
  this.button(p,30,742,708,88,this.draft?this.draft.slice(-44):'Tap here to write a message','keyboard');
  this.button(p,30,850,340,64,this.keyboardOpen?'Hide keyboard':'Write a message','keyboard-toggle');this.button(p,398,850,340,64,'Send','send');
  this.button(p,30,932,340,56,'Hello everyone!','quick','Hello everyone!');this.button(p,398,932,340,56,'Sounds great!','quick','Sounds great!');p.texture.needsUpdate=true;
 }
 drawKeyboard(){const p=this.keyboard,c=p.canvas.getContext('2d');c.fillStyle='#141e21';c.fillRect(0,0,1024,420);p.regions=[];keyboardRows(this.symbols,this.shift).forEach((row,r)=>{const width=1004/row.length;row.forEach((key,i)=>this.button(p,10+i*width,12+r*78,width-6,68,key.label,key.action||'text',key.value));});p.texture.needsUpdate=true;}
 setRole(allowed){const label=allowed?'Collaborator · play the synth directly':'Visitor · listen & explore';if(this.roleLabel===label)return;this.roleLabel=label;this.draw();}
 setHistory(history){this.history=history;this.draw();}
 setAudio(label){this.audioLabel=label;this.draw();}
 setQuality(label){this.qualityLabel='Quality · '+label;this.draw();}
 setDraft(value){this.draft=value.slice(0,400);this.callbacks.onDraft?.(this.draft);this.draw();}
 showKeyboard(open){this.keyboardOpen=open;this.keyboard.mesh.visible=open;this.draw();}
 targets(){return this.group.visible?[this.main.mesh,...(this.keyboardOpen?[this.keyboard.mesh]:[])]:[];}
 hit(raycaster){const hit=raycaster.intersectObjects(this.targets())[0];if(!hit)return null;const panel=hit.object===this.main.mesh?this.main:this.keyboard;const x=hit.uv.x*panel.canvas.width,y=(1-hit.uv.y)*panel.canvas.height;const index=panel.regions.findIndex(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);return index<0?null:{...hit,region:panel.regions[index],index};}
 setHover(hit){const next=hit?{mesh:hit.object,index:hit.index}:null;if(next?.mesh===this.hover?.mesh&&next?.index===this.hover?.index)return;this.hover=next;this.draw();if(this.keyboardOpen)this.drawKeyboard();}
 activate(hit,controller){if(!hit)return;const {action,value}=hit.region;
  if(action==='move'){if(!this.dragging){controller.attach(this.group);this.dragging=controller;}return;}
  if(action==='hide')this.callbacks.onHide?.();
  else if(action==='audio')this.callbacks.onAudio?.();
  else if(action==='quality')this.callbacks.onQuality?.();
  else if(action==='reaction')this.callbacks.onReact?.(value);
  else if(action==='recenter')this.pendingPlacement=true;
  else if(action==='keyboard')this.showKeyboard(true);
  else if(action==='keyboard-toggle')this.showKeyboard(!this.keyboardOpen);
  else if(action==='quick')this.callbacks.onSend?.(value);
  else if(action==='send'){if(this.draft.trim()){this.callbacks.onSend?.(this.draft);this.setDraft('');}}
  else if(action==='shift'){this.shift=!this.shift;this.drawKeyboard();}
  else if(action==='symbols'){this.symbols=!this.symbols;this.drawKeyboard();}
  else if(action==='backspace')this.setDraft(editDraft(this.draft,'backspace'));
  else if(action==='text')this.setDraft(editDraft(this.draft,'text',value));
 }
 release(controller){if(this.dragging!==controller)return;this.scene.attach(this.group);this.dragging=null;this.callbacks.onPlaced?.(this.pose());}
 adjustDistance(axis,dt){if(!this.dragging)return;const distance=this.group.position.length(),next=THREE.MathUtils.clamp(distance+axis*dt,.45,3);this.group.position.multiplyScalar(next/(distance||1));}
 place(head){const position=new THREE.Vector3(),rotation=new THREE.Quaternion();head.getWorldPosition(position);head.getWorldQuaternion(rotation);const forward=new THREE.Vector3(0,0,-1).applyQuaternion(rotation);forward.y=0;forward.normalize();const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0));this.scene.attach(this.group);this.group.position.copy(position).addScaledVector(forward,1.25).addScaledVector(right,.32);this.group.lookAt(position);this.pendingPlacement=false;}
 pose(){return {position:this.group.position.toArray(),rotation:this.group.quaternion.toArray()};}
 restore(pose,head){if(!pose||!Array.isArray(pose.position)||pose.position.length!==3||!pose.position.every(n=>Number.isFinite(n)&&Math.abs(n)<100)||!Array.isArray(pose.rotation)||pose.rotation.length!==4||!pose.rotation.every(Number.isFinite))return false;const position=new THREE.Vector3();head.getWorldPosition(position);if(position.distanceTo(new THREE.Vector3(...pose.position))>4)return false;this.group.position.fromArray(pose.position);this.group.quaternion.fromArray(pose.rotation).normalize();return true;}
 handleKey(event){if(!this.keyboardOpen||!this.group.visible||event.ctrlKey||event.metaKey||event.altKey)return false;if(event.key==='Enter'){this.activate({region:{action:'send'}});return true;}if(event.key==='Backspace'){this.setDraft(editDraft(this.draft,'backspace'));return true;}if(event.key==='Escape'){this.showKeyboard(false);return true;}if([...event.key].length===1){this.setDraft(editDraft(this.draft,'text',event.key));return true;}return false;}
}
