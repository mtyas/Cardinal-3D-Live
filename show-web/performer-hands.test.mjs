import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {PerformerHands} from './performer-hands.js';
import {validateShow} from './show-protocol.mjs';
test('tracked hands match world space after avatar movement and invalid skeletons are rejected',()=>{
 const avatar=new THREE.Group();avatar.position.set(2,1.6,-4);avatar.rotation.y=1;avatar.updateMatrixWorld(true);const hands=new PerformerHands(avatar);
 const pose={left:{source:'controller',position:[2.5,1.2,-3.8],rotation:[0,0,0,1],grip:.5,trigger:0}};
 hands.update(pose,.05);const world=avatar.localToWorld(hands.sides.left.wrist.clone());assert.ok(world.distanceTo(new THREE.Vector3(...pose.left.position))<1e-8);
 const show={type:'show',frame:0,sample_rate:48000,speakers:[],lights:[],performer_hands:pose};assert.equal(validateShow(show),true);pose.left.rotation=[2,0,0,0];assert.equal(validateShow(show),false);
 pose.left={source:'hand',joints:[{id:1,position:[2.5,1.2,-3.8]},{id:6,position:[2.5,1.3,-3.8]}]};assert.equal(validateShow(show),true);hands.update(pose,.05);assert.equal(hands.sides.left.joints.visible,true);
 pose.left.joints.push(pose.left.joints[0]);assert.equal(validateShow(show),false);hands.update({},.05);assert.equal(hands.sides.left.group.visible,false);
});
