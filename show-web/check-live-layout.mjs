// Local native acceptance companion: no public sessions or personal patches.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
const session=JSON.parse(await readFile(process.argv[2],'utf8'));
const origin=new URL(session.visitor_url);
if(!['localhost','127.0.0.1'].includes(origin.hostname))throw Error('This check requires a separate local relay');
const endpoint=new URL('/room',origin);endpoint.protocol='ws:';
const receive=ws=>new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error('Named two-rack show did not arrive')),45000);
 const listener=bytes=>{const m=JSON.parse(bytes);if(m.type==='room'&&m.show?.session_title==='Layout test session'&&m.show.visuals?.cases?.length===2){clearTimeout(timer);ws.off('message',listener);resolve(m.show);}};
 ws.on('message',listener);ws.on('error',reject);
});
const first=new WebSocket(endpoint,{origin:origin.origin}),firstState=receive(first);let second;
try{
 const state=await firstState;
 assert.ok(state.visuals.cases.some(c=>Math.abs(c.matrix[0]-Math.cos(25*Math.PI/180))<.001),'Visitor must receive the rotated rack');
 second=new WebSocket(endpoint,{origin:origin.origin});const late=await receive(second);
 assert.equal(late.session_title,state.session_title,'New visitors must receive the title');
 assert.deepEqual(late.visuals.cases,state.visuals.cases,'New visitors must receive the complete rack layout');
 const info=await(await fetch(new URL('/show-info',origin))).json();
 assert.equal(info.publicOpen,false);assert.notEqual(info.profile.title,state.session_title,'Private names must not leak to the public homepage');
 const rejected=new Promise(resolve=>second.once('close',code=>resolve(code)));
 second.send(JSON.stringify({...state,type:'show',session_title:'Visitor must not rename'}));
 assert.equal(await rejected,1008,'Visitors cannot replace the authoritative show or title');
 console.log('PASS: late visitor receives named/rotated two-rack state; private title stays private; visitor renaming rejected');
}finally{first.close();second?.close();}
