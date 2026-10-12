import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ShowObjects} from './show-objects.js';
import {validateShow} from './show-protocol.mjs';
const object=(id,kind)=>({id,kind,values:[.8,1,1,.25,.75,1,0,0,-4,0,1,0],phase:.25,frequency:2});
test('all four meshes animate deterministically from the shared DSP phase and have bounded particle counts',()=>{const stage=new ShowObjects(new THREE.Scene()),items=['figure','fountain','particles','sculpture'].map((k,i)=>object(String(i+1),k));stage.update(items);assert.equal(stage.objects.size,4);assert.equal(stage.objects.get('2').userData.particles.count,128);assert.equal(stage.objects.get('3').userData.particles.count,192);const sculpture=stage.objects.get('4'),before=sculpture.userData.moving[0].rotation.x;stage.update(items,.1);assert.notEqual(sculpture.userData.moving[0].rotation.x,before);stage.clear();assert.equal(stage.objects.size,0);});
test('stage object protocol rejects invalid phase, CV values and kinds',()=>{const s={type:'show',frame:0,sample_rate:48000,speakers:[],lights:[],objects:[object('1','figure')]};assert.equal(validateShow(s),true);s.objects[0].phase=NaN;assert.equal(validateShow(s),false);s.objects[0].phase=.25;s.objects[0].values[2]=1000;assert.equal(validateShow(s),false);s.objects[0].values[2]=1;s.objects[0].kind='script';assert.equal(validateShow(s),false);});
