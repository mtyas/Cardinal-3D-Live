import test from 'node:test';
import assert from 'node:assert/strict';
import {validateShow} from './show-protocol.mjs';
const scene=()=>({type:'show',frame:0,sample_rate:48000,speakers:[],lights:[],visuals:{panels:[{id:'1',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,1,-3,1],width:.3,height:.76,texture:'a'.repeat(64),controls:[{kind:'knob',id:'0',x:25,y:78,normalized:.5}]}],cables:[],environment:'b'.repeat(64),hour:14,place:0}});
test('live rack matrices, artwork and controls are bounded',()=>{assert.equal(validateShow(scene()),true);const s=scene();s.visuals.panels[0].matrix[0]=NaN;assert.equal(validateShow(s),false);s.visuals.panels[0].matrix[0]=1;s.visuals.panels[0].controls[0]=null;assert.equal(validateShow(s),false);});
test('untrusted asset addresses and excessive rack lists are rejected',()=>{const s=scene();s.visuals.environment='../private';assert.equal(validateShow(s),false);s.visuals.environment='';s.visuals.panels=Array(129).fill(s.visuals.panels[0]);assert.equal(validateShow(s),false);});

import * as THREE from 'three';
import {RackScene} from './rack-scene.js';
test('rack renderer applies transforms, sliders and cables without rebuilding unchanged geometry',()=>{
 const scene3d=new THREE.Scene(), rack=new RackScene(scene3d), v=scene().visuals;v.environment='';v.panels[0].texture='';v.panels[0].controls.push({kind:'slider',id:'2',x:50,y:50,start_x:50,end_x:50,start_y:20,end_y:100,normalized:.75});v.cables=[{a:[0,1,-3],b:[.2,1,-3],color:'#65e7ff'}];
 rack.update(v);const panel=rack.panels.get('1');assert.equal(panel.matrix.elements[13],1);assert.ok(Math.abs(panel.userData.controls.get('slider/2/').position.y+.16)<1e-6);const cable=rack.cables.children[0];rack.update(v);assert.equal(rack.cables.children[0],cable);rack.clear();assert.equal(rack.panels.size,0);assert.equal(rack.root.children.length,2);
});


test('controls hide, recover and dispose when descriptors disappear; reused panels change dimensions',()=>{
 const rack=new RackScene(new THREE.Scene()),v=scene().visuals;v.environment='';v.panels[0].texture='';
 rack.update(v);const panel=rack.panels.get('1'),mesh=panel.userData.controls.get('knob/0/');
 v.panels[0].controls[0].visible=false;rack.update(v);assert.equal(mesh.visible,false);
 v.panels[0].controls[0].visible=true;rack.update(v);assert.equal(mesh.visible,true);
 let disposed=false;mesh.geometry.addEventListener('dispose',()=>{disposed=true;});
 v.panels[0].controls=[];rack.update(v);assert.equal(panel.userData.controls.size,0);assert.equal(disposed,true);assert.equal(mesh.parent,null);
 v.panels[0].width=.6;rack.update(v);assert.notEqual(rack.panels.get('1'),panel);assert.equal(rack.panels.get('1').userData.face.geometry.parameters.width,.6);
 rack.clear();
});

test('remote ray picking and provisional values leave immutable descriptors intact',()=>{
 const world=new THREE.Scene(),rack=new RackScene(world),v=scene().visuals;v.environment='';v.panels[0].texture='';v.panels[0].controls[0].id=2;
 rack.update(v);world.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(.05,1-.156,0),new THREE.Vector3(0,0,-1));
 const target=rack.hitControl(ray);assert.equal(target.parameter,2);assert.equal(target.module,'1');
 const mesh=rack.panels.get('1').userData.controls.get('knob/2/'),before=mesh.quaternion.clone();
 rack.previewControl(target,.9);assert.notDeepEqual(mesh.quaternion.toArray(),before.toArray());assert.equal(v.panels[0].controls[0].normalized,.5);
 rack.update(v);for(let i=0;i<30;i++)rack.animate(1/60);assert.deepEqual(mesh.quaternion.toArray(),before.toArray());
 v.panels[0].controls[0].visible=false;rack.update(v);assert.equal(rack.hitControl(ray),null);rack.clear();
});

test('editable wiring metadata and switch semantics are bounded',()=>{
 const s=scene();s.wiring='2';s.control_epoch='epoch';s.control_revision=1;
 s.visuals.cables=[{id:'3',input_module:'1',input_port:0,output_module:'2',output_port:1,a:[0,0,0],b:[1,1,1],color:'#ffffff'}];assert.equal(validateShow(s),true);
 s.visuals.cables[0].input_port=-1;assert.equal(validateShow(s),false);s.visuals.cables=[];
 s.wiring='bad';assert.equal(validateShow(s),false);s.wiring='2';s.visuals.panels[0].controls[0].momentary='yes';assert.equal(validateShow(s),false);
});
test('buttons, ports and cables are directly pickable; light overlays do not block buttons',()=>{
 const world=new THREE.Scene(),rack=new RackScene(world),v=scene().visuals;v.environment='';v.panels[0].texture='';
 v.panels[0].controls=[{kind:'switch',id:3,x:25,y:78,normalized:0,momentary:true,min:0,max:1},{kind:'light',id:0,x:25,y:78,width:4,brightness:1},{kind:'port',id:1,direction:'output',x:75,y:78}];
 rack.update(v);world.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(new THREE.Vector3(.05,1-.156,0),new THREE.Vector3(0,0,-1));
 assert.equal(rack.hitControl(ray).kind,'switch');ray.ray.origin.x=.15;assert.equal(rack.hitControl(ray).direction,'output');
 v.cables=[{id:'5',input_module:'2',input_port:0,output_module:'1',output_port:1,a:[.4,1,-2],b:[.8,1,-2],color:'#65e7ff'}];rack.update(v);world.updateMatrixWorld(true);
 ray.ray.origin.set(.6,.91,0);assert.equal(rack.hitControl(ray).id,'5');rack.clear();
});

test('native-sized switches, slider handles and module bodies keep their actual proportions',()=>{
 const rack=new RackScene(new THREE.Scene()),v=scene().visuals;v.environment='';v.panels[0].texture='';
 v.panels[0].controls=[{kind:'switch',id:1,x:20,y:20,width:30,height:12,normalized:0},{kind:'slider',id:2,x:50,y:50,width:30,height:100,handle_width:8,handle_height:6,normalized:.5},{kind:'knob',id:3,x:80,y:50,width:40,height:40,normalized:.5}];
 rack.update(v);const controls=rack.panels.get('1').userData.controls;
 const bounds=mesh=>{mesh.geometry.computeBoundingBox();return mesh.geometry.boundingBox.getSize(new THREE.Vector3());};
 assert.ok(Math.abs(bounds(controls.get('switch/1/')).x-.048)<1e-6);assert.ok(Math.abs(bounds(controls.get('switch/1/')).y-.0192)<1e-6);
 assert.ok(Math.abs(bounds(controls.get('slider/2/')).x-.016)<1e-6);assert.ok(Math.abs(bounds(controls.get('knob/3/')).x-.08)<1e-6);
 assert.ok(rack.panels.get('1').children.some(mesh=>mesh.geometry?.parameters?.depth===.008));rack.clear();
});
test('native enclosure parts render in bounded instanced groups; unchanged cables are retained',()=>{
 const rack=new RackScene(new THREE.Scene()),v=scene().visuals;v.environment='';v.panels[0].texture='';
 const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 v.cases=[{matrix:identity,bounds:[0,0,1,1],parts:[{kind:'box',size:[1,1,.012],bevel:0,color:'#22282d',metallic:.7,roughness:.4,transforms:[identity]},{kind:'box',size:[.04,1,.23],bevel:.006,color:'#63351b',metallic:0,roughness:.45,transforms:[identity,identity]}]}];
 assert.equal(validateShow({type:'show',frame:0,sample_rate:48000,speakers:[],lights:[],visuals:v}),true);
 rack.update(v);assert.deepEqual(rack.cases.children[0].children.map(m=>m.count),[1,2]);assert.equal(rack.cases.children[0].children.every(m=>m.isInstancedMesh),true);
 v.cases[0].parts[0].transforms.push([1]);assert.equal(validateShow({type:'show',frame:0,sample_rate:48000,speakers:[],lights:[],visuals:v}),false);rack.clear();
});
test('unsnapped remote control motion interpolates at render rate without modifying snapshots',()=>{
 const rack=new RackScene(new THREE.Scene()),v=scene().visuals;v.environment='';v.panels[0].texture='';rack.update(v);
 const mesh=rack.panels.get('1').userData.controls.get('knob/0/');v.panels[0].controls[0].normalized=.9;rack.update(v);rack.animate(1/90);
 assert.ok(mesh.userData.shown>.5&&mesh.userData.shown<.9);assert.equal(v.panels[0].controls[0].normalized,.9);
 for(let i=0;i<90;i++)rack.animate(1/90);assert.equal(mesh.userData.shown,.9);rack.clear();assert.equal(rack.animating.size,0);
});

test('cable plugs batch into two draws and remain pickable by cable identity',()=>{
 const world=new THREE.Scene(),rack=new RackScene(world),v=scene().visuals;v.environment='';v.panels[0].texture='';
 v.cables=[{id:'5',input_module:'2',input_port:0,output_module:'1',output_port:1,a:[.4,1,-2],b:[.8,1,-2],color:'#65e7ff'},{id:'6',input_module:'2',input_port:1,output_module:'1',output_port:1,a:[1.4,1,-2],b:[1.8,1,-2],color:'#f5827f'}];
 rack.update(v);world.updateMatrixWorld(true);const plugs=rack.cables.children.at(-1);
 assert.equal(plugs.children.length,2);assert.equal(plugs.children.every(m=>m.isInstancedMesh&&m.count===4),true);
 const ray=new THREE.Raycaster(new THREE.Vector3(1.4,1,0),new THREE.Vector3(0,0,-1));assert.equal(rack.hitControl(ray).id,'6');rack.clear();
});
