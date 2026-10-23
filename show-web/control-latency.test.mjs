import test from 'node:test';
import assert from 'node:assert/strict';
import {ControlClient} from './control-client.js';
import {ControlRelay} from './control-relay.mjs';
function simulate(window){
 let now=0,events=[],value=.5,applied=[],maxPending=0,maxRelayPending=0;
 const guest={},host={};let relay;
 const later=(delay,fn)=>events.push({at:now+delay,fn});
 const client=new ControlClient(message=>{later(50,()=>relay.handle(guest,'guest',message));return true;},()=>now);
 relay=new ControlRelay((socket,message)=>{
  if(socket===guest)later(50,()=>client.receive({...message,...(message.type==='control_permission'?{window}:{})}));
  if(socket===host&&message.type==='control_action')later(16,()=>{
   if(message.action==='update'){value=message.value;applied.push({at:now,value});}
   relay.handle(host,'host',{...message,type:'control_result',ok:true,lease:'lease',value,revision:applied.length});
  });
  return true;
 },()=>now);
 relay.join('guest',guest);relay.setHost(host);relay.handle(host,'host',{type:'control_session',epoch:'epoch'});relay.handle(host,'host',{type:'control_grant',epoch:'epoch',actor:'guest'});
 const frame={control_epoch:'epoch',control_revision:0,visuals:{panels:[{id:'1',controls:[{id:2,kind:'knob',normalized:.5}]}]}};
 let started=false,ended=false;
 for(now=0;now<=3200;now+=5){
  for(let changed=true;changed;){changed=false;const ready=events.filter(e=>e.at<=now);events=events.filter(e=>e.at>now);for(const e of ready){e.fn();changed=true;}}
  if(!started&&client.permission){client.baseline(frame);client.begin(client.targets()[0]);started=true;}
  if(now>=200&&now<=2200&&now%20===0){client.move(.1+.8*(now-200)/2000);assert.equal(client.presentation(frame).value,.1+.8*(now-200)/2000,'Local motion must not wait for network replies');}
  if(now>=2200&&!ended){client.end();ended=true;}
  client.pump();relay.tick();maxPending=Math.max(maxPending,client.requests.size);maxRelayPending=Math.max(maxRelayPending,relay.grants.get('guest')?.pending.size||0);
 }
 assert.equal(client.gesture,null);assert.equal(client.pending,null);assert.ok(Math.abs(value-.9)<1e-8);assert.equal(relay.grants.size,1);
 const gaps=applied.slice(1).map((item,i)=>item.at-applied[i].at);gaps.sort((a,b)=>a-b);
 return {updates:applied.length,p95Gap:gaps[Math.floor(gaps.length*.95)],maxPending,maxRelayPending};
}
test('bounded update pipeline maintains motion at 116 ms round trip and drains the final value before release',()=>{
 const old=simulate(1),current=simulate(3);
 assert.ok(current.updates>=old.updates*1.7);assert.ok(current.p95Gap<old.p95Gap);assert.ok(current.maxPending<=3&&current.maxRelayPending<=3);
 console.log(JSON.stringify({simulatedRoundTripMs:116,stopAndWait:old,pipelined:current}));
});
