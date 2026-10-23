import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {mergeVisualValues} from './visual-values.mjs';
import {RackScene} from './rack-scene.js';

test('live meter and LED values preserve static metadata and queued immutable baselines',()=>{
 const previous={visuals:{panels:[{id:'1',controls:[{kind:'meter',id:'meter-0',width:10,levels:[0,0,0,0,0,0]},{kind:'light',id:2,brightness:0}]}],cables:[]}};
 const next=mergeVisualValues(previous,{frame:1,visual_values:[{module:'1',values:{kind:'meter',id:'meter-0',levels:[.8,.6,.4,.3,.8,.6],path:'forbidden'}},{module:'1',values:{kind:'light',id:2,brightness:.7}}]});
 assert.equal(previous.visuals.panels[0].controls[0].levels[0],0);assert.equal(next.visuals.panels[0].controls[0].levels[0],.8);assert.equal(next.visuals.panels[0].controls[0].width,10);assert.equal(next.visuals.panels[0].controls[0].path,undefined);assert.equal(next.visual_values,undefined);
 assert.equal(mergeVisualValues(next,{frame:2}).visuals,next.visuals);
 assert.throws(()=>mergeVisualValues(previous,{visual_values:[{module:'1',values:{kind:'meter',id:'meter-0',levels:[Infinity]}}]}));
});

test('a mixer meter updates shader levels without replacing geometry or requiring another panel texture',()=>{
 const rack=new RackScene(new THREE.Scene());const control={kind:'meter',id:'meter-0',x:12,y:40,width:8,height:100,levels:[0,0,0,0,0,0]};
 const visual={panels:[{id:'1',name:'Mixer',width:.5,height:.3,texture:'',matrix:new THREE.Matrix4().toArray(),controls:[control]}],cables:[],hour:14};
 rack.update(visual);const mesh=rack.panels.get('1').userData.controls.get('meter/meter-0/'),geometry=mesh.geometry;assert.ok(mesh.userData.pickThrough);
 rack.update({...visual,panels:[{...visual.panels[0],controls:[{...control,levels:[.8,.7,.4,.3,.9,.8]}]}]});
 assert.equal(mesh.geometry,geometry);assert.deepEqual(mesh.material.uniforms.levels.value.toArray(),[.8,.7,.4,.3]);rack.clear();
});
