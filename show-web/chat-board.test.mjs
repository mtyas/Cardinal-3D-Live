import test from 'node:test';
import assert from 'node:assert/strict';
import {boardLines} from './chat-board.js';
import {validateShow} from './show-protocol.mjs';
test('shared chat boards bound dimensions and show recent literal messages within the text budget',()=>{
 const values=[3,2,.065,.85,.95,1,.04,.08,.14,3,1.8,-3,0,1];
 const data={type:'show',frame:0,sample_rate:48000,speakers:[],lights:[],boards:[{id:'1',values}]};assert.equal(validateShow(data),true);
 const chat=Array.from({length:40},(_,i)=>({name:'Guest',text:`Message ${i} <script> literal text`}));
 const lines=boardLines(values,chat);assert.equal(lines[0],'MAIN CHAT');assert.ok(lines.at(-1).includes('39'));assert.ok(lines.length<25);assert.ok(lines.some(l=>l.includes('<script>')));
 values[2]=NaN;assert.equal(validateShow(data),false);values[2]=.065;data.boards.push(data.boards[0]);assert.equal(validateShow(data),false);
});
