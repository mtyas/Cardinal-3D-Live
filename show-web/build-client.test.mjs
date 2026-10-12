import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {buildClient} from './build-client.mjs';
test('entire visitor client, chat boards and glow preview compile into a standalone script',async()=>{
 const bundle=await buildClient(),code=bundle.bytes.toString();new Script(code);
 assert.match(bundle.path,/^\/room-app-[a-f0-9]{16}\.js$/);
 assert.ok(code.includes('look-preview'));assert.ok(code.includes('MAIN CHAT'));assert.ok(code.includes('profile-preview'));
 assert.ok(!code.includes("from '/chat-board.js'"));assert.ok(!code.includes("from '/show-scene.js'"));
});
