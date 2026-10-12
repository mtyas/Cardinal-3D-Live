import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VisitorHud,keyboardRows,editDraft} from './visitor-hud.js';
import {joystickAxis,dampAxis,TouchNavigation} from './touch-navigation.js';
import {scenePatch,applyScenePatch} from './scene-delta.js';

test('touch stick is radial, bounded and smoothly returns to rest at different frame rates',()=>{
 assert.deepEqual(joystickAxis(0,0),{x:0,z:0});assert.deepEqual(joystickAxis(1,1),{x:0,z:0});
 const diagonal=joystickAxis(100,100);assert.ok(Math.abs(Math.hypot(diagonal.x,diagonal.z)-1)<1e-10);
 let a=1,b=1;for(let i=0;i<60;i++)a=dampAxis(a,0,1/60);for(let i=0;i<30;i++)b=dampAxis(b,0,1/30);
 assert.ok(Math.abs(a-b)<1e-10&&a<1e-6);
});
test('two-finger navigation keeps walking and looking separate and clears cancelled gestures',()=>{
 const oldDocument=globalThis.document,oldListener=globalThis.addEventListener;globalThis.document={addEventListener(){}};globalThis.addEventListener=()=>{};
 const element=()=>({events:{},addEventListener(name,fn){this.events[name]=fn;},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:124,height:124};},classList:{add(){},remove(){}}});
 try{
  const canvas=element(),pad=element(),thumb={style:{}},look=[];const controls=new TouchNavigation(canvas,pad,thumb,(x,y)=>look.push([x,y]));
  const event=(id,x,y)=>({pointerId:id,clientX:x,clientY:y,pointerType:'touch',preventDefault(){},stopPropagation(){}});
  pad.events.pointerdown(event(1,62,14));canvas.events.pointerdown(event(2,200,200));canvas.events.pointermove(event(2,240,220));
  assert.deepEqual(look,[[40,20]]);assert.ok(controls.step(.05).z<-.5);
  canvas.events.pointerup(event(2,240,220));assert.equal(controls.look,null);assert.equal(controls.stick,1);
  pad.events.pointercancel(event(1,62,14));assert.deepEqual(controls.target,{x:0,z:0});controls.reset();assert.deepEqual(controls.current,{x:0,z:0});
 }finally{globalThis.document=oldDocument;globalThis.addEventListener=oldListener;}
});
test('scene patches preserve earlier queued frames and handle additions, deletion and topology changes',()=>{
 const old={show:{frame:1,visuals:{panels:[{id:'1',controls:[{normalized:.2},{normalized:.3}]}]}},members:[]};
 const next=structuredClone(old);next.show.frame=2;next.show.visuals.panels[0].controls[0].normalized=.8;next.show.visuals.panels[0].controls[1].normalized=.9;
 const patched=applyScenePatch(old,scenePatch(old,next));assert.deepEqual(patched,next);assert.equal(old.show.visuals.panels[0].controls[0].normalized,.2);
 const third={show:null,members:[{id:'new'}],chat:['hello']};assert.deepEqual(applyScenePatch(patched,scenePatch(patched,third)),third);
 assert.throws(()=>applyScenePatch(old,[[['__proto__'],{}]]));
});
test('a changing knob sends only its value, rather than repeating the rack geometry',()=>{
 const previous={show:{frame:1,visuals:{panels:Array.from({length:64},(_,i)=>({id:String(i),matrix:Array(16).fill(1),texture:'a'.repeat(64),controls:Array.from({length:80},(_,id)=>({id,kind:'knob',x:id*3,y:50,width:18,height:18,normalized:.5}))}))}}};
 const next=structuredClone(previous);next.show.frame=2;next.show.visuals.panels[30].controls[20].normalized=.6;
 const before=JSON.stringify(next).length,after=JSON.stringify(scenePatch(previous,next)).length;
 assert.ok(after<before*.01);console.log(`Rack update fixture: ${before} bytes full, ${after} bytes delta.`);
});
const fakeDocument={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};
test('VR HUD can be ray-selected, carried, moved in depth, released in world space and recentered',()=>{
 const scene=new THREE.Scene(),head=new THREE.Object3D(),controller=new THREE.Object3D();head.position.set(0,1.65,0);scene.add(head,controller);
 const hud=new VisitorHud(scene,{document:fakeDocument});hud.place(head);hud.group.visible=true;scene.updateMatrixWorld(true);
 const region=hud.main.regions.find(r=>r.action==='move');
 const point=new THREE.Vector3((region.x+region.w/2)/768*.64-.32,.853/2-(region.y+region.h/2)/1024*.853,0).applyMatrix4(hud.main.mesh.matrixWorld);
 const ray=new THREE.Raycaster(new THREE.Vector3(0,1.65,0),point.clone().sub(new THREE.Vector3(0,1.65,0)).normalize());
 const hit=hud.hit(ray);assert.equal(hit.region.action,'move');hud.activate(hit,controller);assert.equal(hud.group.parent,controller);
 controller.position.y+=.4;scene.updateMatrixWorld(true);const before=hud.group.getWorldPosition(new THREE.Vector3());hud.adjustDistance(-1,.5);assert.ok(hud.group.position.length()<before.length());
 hud.release(controller);assert.equal(hud.group.parent,scene);assert.equal(hud.dragging,null);
 hud.activate({region:{action:'recenter'}});assert.equal(hud.pendingPlacement,true);hud.place(head);assert.equal(hud.pendingPlacement,false);
 const pose=hud.pose();assert.equal(hud.restore(pose,head),true);assert.equal(hud.restore({position:[1000,0,0],rotation:[0,0,0,1]},head),false);
});
test('VR keyboard sends typed text, supports shift/symbols and keeps sound activation in the controller event',()=>{
 const sent=[],drafts=[];let audio=0;const hud=new VisitorHud(new THREE.Scene(),{document:fakeDocument,onSend:s=>sent.push(s),onDraft:s=>drafts.push(s),onAudio:()=>audio++});
 hud.group.visible=true;hud.activate({region:{action:'keyboard'}});assert.equal(hud.keyboardOpen,true);
 for(const character of 'Hello!')hud.activate({region:{action:'text',value:character}});
 hud.activate({region:{action:'backspace'}});assert.equal(hud.draft,'Hello');hud.activate({region:{action:'send'}});assert.deepEqual(sent,['Hello']);assert.equal(hud.draft,'');
 hud.activate({region:{action:'audio'}});assert.equal(audio,1);assert.ok(keyboardRows(false,true)[1].some(k=>k.value==='Q'));assert.ok(keyboardRows(true)[1].some(k=>k.value==='!'));
 assert.equal(editDraft('Hi 👋','backspace'),'Hi ');assert.equal(editDraft('a'.repeat(400),'text','b').length,400);
});
