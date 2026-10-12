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
