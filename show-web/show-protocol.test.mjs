// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {audioBlocks,validateShow} from './show-protocol.mjs';
test('Audio validates complete frames and rejects corrupt packets',()=>{
  const b=Buffer.alloc(8+24+8); b.write('C3DA'); b.writeUInt32LE(1,4); b.writeBigUInt64LE(42n,8); b.writeBigUInt64LE(96000n,16); b.writeUInt32LE(48000,24); b.writeUInt32LE(2,28); b.writeFloatLE(.25,32); b.writeFloatLE(-.25,36);
  assert.deepEqual(audioBlocks(b),[{id:'42',frame:96000,rate:48000,samples:2}]);
  assert.throws(()=>audioBlocks(b.subarray(0,39)));
  b.writeFloatLE(NaN,32);assert.throws(()=>audioBlocks(b));
});
test('Show source positions, limits and identifiers are checked',()=>{
  const s={type:'show',frame:0,sample_rate:48000,speakers:[{id:'42',position:[-2,1.5,-3],yaw:0,cone:90,ref_distance:1,max_distance:40,rolloff:1,directional:false}],lights:[]};
  assert.ok(validateShow(s));s.speakers.push(s.speakers[0]);assert.equal(validateShow(s),false);s.speakers.pop();s.speakers[0].position[1]=NaN;assert.equal(validateShow(s),false);
});
