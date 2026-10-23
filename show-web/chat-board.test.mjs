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

test('session names wrap on shared boards and retain recent chat',()=>{
 const values=[3,2,.065,.85,.95,1,.04,.08,.14,3,1.8,-3,0,1];
 const title='An evening of modular music';
 assert.equal(boardLines(values,[],title)[0],title);
 const chat=[{name:'Guest',text:'Latest message'}];
 const small=[.5,.5,.065,...values.slice(3)];
 const lines=boardLines(small,chat,'A'.repeat(80));
 assert.ok(lines.length<=3);assert.ok(lines.at(-1).includes('age'));
 const data={type:'show',frame:0,sample_rate:48000,speakers:[],lights:[]};
 for(const name of [title,'\u{1f3b5}'.repeat(80),''])assert.equal(validateShow({...data,session_title:name}),true);
 for(const name of [null,12,'x'.repeat(81),'two\nlines','bad\u0000title'])assert.equal(validateShow({...data,session_title:name}),false);
});
