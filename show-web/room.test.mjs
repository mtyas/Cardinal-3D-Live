// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from './room.mjs';
import { appearancePixels, blendAt } from './appearance.js';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {scenePatch,applyScenePatch} from './scene-delta.js';

test('new chat messages preserve the previous snapshot and reach delta clients immediately',()=>{
 const room=new Room(),visitor=room.join();
 for(let i=0;i<45;i++){
  const before=room.snapshot(),count=before.chat.length,previousLast=before.chat.at(-1)?.text;
  room.update(visitor.id,{type:'chat',text:'message '+i});
  const after=room.snapshot();
  assert.equal(before.chat.length,count);assert.equal(before.chat.at(-1)?.text,previousLast);
  const reconstructed=applyScenePatch(before,scenePatch(before,after));
  assert.equal(reconstructed.chat.at(-1).text,'message '+i);assert.ok(reconstructed.chat.length<=40);
 }
});
test('reactions expire, have a server cooldown and cannot target other visitors', () => {
  let now = 10000;
  const room = new Room(() => now), a = room.join(), b = room.join();
  room.update(a.id, { type: 'reaction', kind: 'sparkles', id: b.id, endsAt: Infinity });
  assert.equal(a.reaction.kind, 'sparkles'); assert.equal(a.reaction.endsAt, 13200); assert.equal(b.reaction, undefined);
  now += 100; room.update(a.id, { type: 'reaction', kind: 'grow' }); assert.equal(a.reaction.kind, 'sparkles');
  now = 13201; room.snapshot(); assert.equal(a.reaction, undefined);
  room.update(a.id, { type: 'reaction', kind: 'grow' }); assert.equal(a.reaction, undefined);
  now = 13500; room.update(a.id, { type: 'reaction', kind: 'grow' }); assert.equal(a.reaction.kind, 'grow');
  room.leave(a.id); assert.equal(room.reactionReady.has(a.id), false);
  room.update(b.id, { type: 'reaction', kind: 'invalid' }); assert.equal(b.reaction, undefined);
});
test('opening the HTML from disk explains how to enter instead of trying to connect', () => {
  const html = readFileSync(new URL('./room.html', import.meta.url), 'utf8');
  const boot = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const nodes = { status: {}, error: { appendChild(node) { this.link = node; } } };
  runInNewContext(boot, { location: { protocol: 'file:' }, document: { getElementById: id => nodes[id], createElement: () => ({}) } });
  assert.equal(nodes.status.textContent, 'Open the room through its launcher');
  assert.equal(nodes.error.link.href, 'http://localhost:8778/');
  assert.match(nodes.error.textContent, /Launch Show web preview/);
});
test('two-colour patterns are shared and invalid style fields are rejected', () => {
  const room = new Room(), visitor = room.join();
  room.update(visitor.id, { type: 'identity', color: '#ff6600', color2: '#4433ff', pattern: 'noise' });
  assert.equal(room.snapshot().members[0].pattern, 'noise'); assert.equal(visitor.color2, '#4433ff');
  room.update(visitor.id, { type: 'identity', color2: 'invalid', pattern: '../file' });
  assert.equal(visitor.pattern, 'noise'); assert.equal(visitor.color2, '#4433ff');
});
test('noise and marble wrap around the visitor sphere without a colour seam', () => {
  for (const pattern of ['solid', 'gradient', 'noise', 'marble']) {
    for (const v of [0, .3, .8, 1]) assert.ok(Math.abs(blendAt(pattern, 0, v) - blendAt(pattern, 1, v)) < 1e-10);
    const pixels = appearancePixels(pattern, '#000000', '#ffffff', 8);
    assert.equal(pixels.length, 8 * 8 * 4);
    for (let i = 3; i < pixels.length; i += 4) assert.equal(pixels[i], 255);
  }
});
test('visitor cannot claim the performer role or issue synth commands', () => {
  const room = new Room(), visitor = room.join();
  room.update(visitor.id, { type: 'identity', role: 'performer', name: 'Guest', color: '#ff99aa' });
  room.update(visitor.id, { type: 'synth', op: 'clear' });
  assert.equal(room.snapshot().members[0].role, 'visitor'); assert.equal(room.performer, null);
  const host = room.join(true); assert.throws(() => room.join(true)); room.leave(host.id); assert.doesNotThrow(() => room.join(true));
});
test('invalid poses do not poison shared scene state', () => {
  const room = new Room(), visitor = room.join();
  room.update(visitor.id, { type: 'pose', position: [NaN, 0, 1], yaw: Infinity });
  assert.deepEqual(visitor.position, [0, 1.65, 4]); assert.equal(visitor.yaw, 0);
  room.update(visitor.id, { type: 'pose', position: [1, 2, 3], yaw: 8 }); assert.deepEqual(visitor.position, [1, 2, 3]); assert.ok(Math.abs(visitor.yaw) <= Math.PI);
});
test('bounded chat keeps author identity and caps message history', () => {
  const room = new Room(), visitor = room.join();
  room.update(visitor.id, { type: 'identity', name: 'Alice\u0000', color: 'red' });
  for (let i = 0; i < 60; i++) room.update(visitor.id, { type: 'chat', text: 'x'.repeat(500), name: 'Impersonated' });
  assert.equal(room.chat.length, 40); assert.equal(room.chat[0].text.length, 400); assert.equal(room.chat[0].name, 'Alice'); assert.equal(visitor.color, '#65e7ff');
  room.leave(visitor.id); assert.equal(room.snapshot().members.length, 0);
});
