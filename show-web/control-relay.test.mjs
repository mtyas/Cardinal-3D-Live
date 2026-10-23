import test from 'node:test';
import assert from 'node:assert/strict';
import {ControlRelay} from './control-relay.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {WebSocket} from 'ws';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function fixture(){
 let now=0;const messages=[];const host={},a={},b={};
 const relay=new ControlRelay((socket,data)=>{if(!socket||socket.blocked)return false;messages.push({socket,data});return true;},()=>now);
 relay.join('host',host);relay.join('a',a);relay.join('b',b);relay.setHost(host);
 const send=(socket,id,data)=>relay.handle(socket,id,data);
 const start=()=>send(host,'host',{type:'control_session',epoch:'epoch'});
 const grant=(id)=>{send(host,'host',{type:'control_grant',epoch:'epoch',actor:id});return relay.grants.get(id)?.token;};
 return {relay,messages,host,a,b,send,start,grant,advance:ms=>{now+=ms;relay.tick();}};
}
test('only the native host grants; relay binds identity and strips forged fields',()=>{
 const f=fixture();f.start();
 f.send(f.a,'a',{type:'control_grant',actor:'a',epoch:'epoch'});assert.equal(f.relay.grants.size,0);
 const grant=f.grant('a');assert.ok(grant);
 f.send(f.a,'a',{type:'control_action',grant,epoch:'epoch',sequence:1,action:'begin',module:'1',parameter:0,actor:'b',op:'load',path:'private'});
 const command=f.messages.at(-1);assert.equal(command.socket,f.host);assert.equal(command.data.actor,'a');assert.equal(command.data.op,undefined);assert.equal(command.data.path,undefined);
 f.send(f.b,'b',{...command.data,sequence:2});assert.equal(f.messages.at(-1).data.reason,'read_only');
 f.send(f.host,'host',{type:'control_result',actor:'a',grant,epoch:'epoch',sequence:1,ok:true,lease:'1'});
 assert.equal(f.messages.at(-1).socket,f.a);assert.equal(f.relay.grants.get('a').pending.size,0);
});
test('pending commands, replay, epoch changes, disconnect and host timeout fail closed',()=>{
 const f=fixture();f.start();const grant=f.grant('a');
 const command={type:'control_action',grant,epoch:'epoch',sequence:1,action:'begin',module:'1',parameter:0};
 f.send(f.a,'a',command);f.send(f.a,'a',command);assert.equal(f.messages.at(-1).data.reason,'stale_sequence');
 f.send(f.a,'a',{...command,sequence:2});assert.equal(f.messages.at(-1).data.reason,'await_ack');
 f.advance(1500);assert.equal(f.relay.grants.size,0);assert.equal(f.messages.at(-1).data.reason,'host_timeout');
 const fresh=f.grant('a');assert.notEqual(fresh,grant);f.send(f.a,'a',{...command,sequence:3});assert.equal(f.messages.at(-1).data.reason,'read_only');
 f.relay.leave('a',f.a);assert.equal(f.relay.grants.size,0);
 f.grant('b');f.relay.leave('host',f.host);assert.equal(f.relay.grants.size,0);assert.equal(f.relay.epoch,'');
});
test('invalid targets and values never reach host; backpressure revokes access',()=>{
 const f=fixture();f.start();const grant=f.grant('a');
 const base={type:'control_action',grant,epoch:'epoch',sequence:1,action:'update',module:'1',parameter:0,lease:'1',value:0.5};
 for(const fields of [{value:NaN},{value:true},{value:2},{parameter:0.5},{module:'01'},{action:'load'}]){
  f.send(f.a,'a',{...base,...fields});assert.equal(f.messages.at(-1).data.reason,'invalid_action');
 }
 f.host.blocked=true;f.send(f.a,'a',base);assert.equal(f.relay.grants.size,0);
});

test('real relay keeps visitors read-only until native grant and routes correlated commands',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cardinal-controls-')),file=join(directory,'session.json'),port=19885;
 const server=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,CARDINAL_SHOW_PORT:String(port),CARDINAL_SHOW_SESSION_PATH:file,CARDINAL_SHOW_HOSTING_CONFIG:'',CARDINAL_SHOW_PUBLIC_ORIGIN:'',CARDINAL_SHOW_BIND:'127.0.0.1'},stdio:'ignore'});
 let native,guest;
 const receive=socket=>{const inbox=[];socket.on('message',(bytes,binary)=>{if(!binary)inbox.push(JSON.parse(bytes));});return async predicate=>{for(let i=0;i<100;i++){const n=inbox.findIndex(predicate);if(n>=0)return inbox.splice(n,1)[0];await pause(20);}throw Error('Expected control message did not arrive');};};
 try{
  let session;for(let i=0;i<100;i++){try{session=JSON.parse(await readFile(file,'utf8'));break;}catch{await pause(30);}}assert.ok(session);
  native=new WebSocket(session.url);const hostMessage=receive(native);
  await once(native,'open');guest=new WebSocket(`ws://127.0.0.1:${port}/room`,{origin:`http://localhost:${port}`});const guestMessage=receive(guest);await once(guest,'open');
  const welcome=await guestMessage(m=>m.type==='welcome');
  const send=(socket,data)=>socket.send(JSON.stringify(data));
  send(guest,{type:'control_action',sequence:1});assert.equal((await guestMessage(m=>m.type==='control_result')).reason,'read_only');
  send(native,{type:'control_session',epoch:'integration'});await hostMessage(m=>m.type==='control_session');
  send(native,{type:'control_grant',actor:welcome.id,epoch:'integration'});
  const permission=await guestMessage(m=>m.type==='control_permission');assert.equal(permission.enabled,true);
  send(guest,{type:'control_action',epoch:'integration',grant:permission.grant,sequence:1,action:'begin',module:'1',parameter:0,actor:'forged'});
  const action=await hostMessage(m=>m.type==='control_action');assert.equal(action.actor,welcome.id);
  send(native,{type:'control_result',actor:action.actor,grant:action.grant,epoch:action.epoch,sequence:action.sequence,ok:true,lease:'native-lease'});
  assert.equal((await guestMessage(m=>m.type==='control_result')).lease,'native-lease');
  send(native,{type:'control_revoke',actor:welcome.id});assert.equal((await guestMessage(m=>m.type==='control_permission'&&!m.enabled)).reason,'host_revoked');
  send(guest,{...action,sequence:2});assert.equal((await guestMessage(m=>m.type==='control_result')).reason,'read_only');
 }finally{native?.terminate();guest?.terminate();const stopped=once(server,'exit');server.kill();await stopped;await rm(directory,{recursive:true,force:true});}
},{timeout:10000});

test('cable edits use the same grant, correlation and field allowlist',()=>{
 const f=fixture();f.start();const grant=f.grant('a');
 const base={type:'control_action',grant,epoch:'epoch',sequence:1,action:'cable_connect',wiring:'1',input_module:'3',input_port:0,output_module:'2',output_port:1};
 for(const fields of [{wiring:'old'},{input_port:-1},{output_port:.5},{replace_cable:'oops'}]){f.send(f.a,'a',{...base,...fields});assert.equal(f.messages.at(-1).data.reason,'invalid_action');}
 f.send(f.a,'a',{...base,actor:'forged',op:'load',path:'private'});
 const command=f.messages.at(-1).data;assert.equal(command.actor,'a');assert.equal(command.output_port,1);assert.equal(command.op,undefined);assert.equal(command.path,undefined);
 f.send(f.host,'host',{type:'control_result',actor:'a',epoch:'epoch',grant,sequence:1,ok:true,wiring:'2'});
 f.send(f.a,'a',{...base,sequence:2,action:'cable_disconnect',cable_id:'44'});assert.equal(f.messages.at(-1).data.cable_id,'44');assert.equal(f.messages.at(-1).data.output_module,undefined);
});

test('pipeline bounds pending updates by target and rejects an end before outstanding replies',()=>{
 const f=fixture();f.start();const grant=f.grant('a');const base={type:'control_action',grant,epoch:'epoch',sequence:1,action:'begin',module:'1',parameter:0};
 f.send(f.a,'a',base);f.send(f.host,'host',{type:'control_result',actor:'a',grant,epoch:'epoch',sequence:1,ok:true,lease:'1'});
 for(let i=2;i<5;i++)f.send(f.a,'a',{...base,sequence:i,action:'update',lease:'1',value:i/10});
 assert.equal(f.relay.grants.get('a').pending.size,3);
 f.send(f.a,'a',{...base,sequence:5,action:'end',lease:'1'});assert.equal(f.messages.at(-1).data.reason,'await_ack');
 f.send(f.a,'a',{...base,sequence:6,action:'update',lease:'other',value:.5});assert.equal(f.messages.at(-1).data.reason,'await_ack');
 f.send(f.host,'host',{type:'control_result',actor:'a',grant,epoch:'epoch',sequence:3,ok:true,value:.3});assert.equal(f.relay.grants.get('a').pending.size,2);
 f.advance(1500);assert.equal(f.relay.grants.size,0);
});
