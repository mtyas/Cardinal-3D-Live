// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ShowScene} from './show-scene.js';
test('buffering shows current visuals and preserves history for delayed audio playback',()=>{
 let frame=null;const stage=new ShowScene(new THREE.Scene(),{configure(){},frame:()=>frame,reset(){}});
 for(let i=0;i<60;i++){stage.receive({frame:i*2400,sample_rate:48000,speakers:[],lights:[]});stage.update();}
 assert.equal(stage.displayed.frame,59*2400);assert.equal(stage.queue.length,60);
 frame=0;stage.update();assert.equal(stage.displayed.frame,0);
 frame=48000;stage.update();assert.equal(stage.displayed.frame,48000);
 frame=null;for(let i=60;i<200;i++){stage.receive({frame:i*2400,sample_rate:48000,speakers:[],lights:[]});stage.update();}
 assert.equal(stage.displayed.frame,199*2400);assert.equal(stage.queue.length,80);
 stage.clear();
});
