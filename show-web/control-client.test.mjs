import test from 'node:test';
import assert from 'node:assert/strict';
import {ControlClient} from './control-client.js';
function fixture(){
 let now=0;const sent=[];const client=new ControlClient(m=>{sent.push(m);return true;},()=>now);
 const frame={control_epoch:'e',control_revision:0,visuals:{panels:[{id:'1',name:'VCO',controls:[{id:2,kind:'knob',normalized:.5,label:'Frequency'}]}]}};
 const grant=()=>client.receive({type:'control_permission',enabled:true,epoch:'e',grant:'g'});
 const ack=(extra={})=>client.receive({type:'control_result',epoch:'e',grant:'g',sequence:sent.at(-1).sequence,ok:true,...extra});
 const step=ms=>{now+=ms;client.pump();};
 return {client,sent,frame,grant,ack,step};
}
test('read-only and wrong-epoch controls cannot begin; a matching baseline enables a target',()=>{
 const f=fixture();f.client.baseline(f.frame);assert.deepEqual(f.client.targets(),[]);assert.equal(f.client.begin({module:'1',parameter:2}),false);
 f.grant();f.client.baseline({...f.frame,control_epoch:'old'});assert.deepEqual(f.client.targets(),[]);
 f.client.baseline(f.frame);assert.equal(f.client.targets().length,1);assert.equal(f.client.begin(f.client.targets()[0]),true);assert.equal(f.sent[0].action,'begin');
});
test('coalesces movement with one request in flight and reconciles snapped values without an update loop',()=>{
 const f=fixture();f.grant();f.client.baseline(f.frame);f.client.begin(f.client.targets()[0]);
 f.client.move(.6);f.client.move(.71);assert.equal(f.sent.length,1);
 f.ack({lease:'l'});f.step(50);assert.equal(f.sent.at(-1).value,.71);
 f.client.end();assert.equal(f.sent.length,2);
 f.ack({value:.75,revision:1});f.step(50);assert.equal(f.sent.at(-1).action,'end');f.ack();
 assert.equal(f.client.gesture,null);assert.equal(f.client.presentation(f.frame).value,.75);
 assert.equal(f.client.presentation({...f.frame,control_revision:1}),null);
});
test('quick release waits for begin acknowledgment and then ends; stale replies do not advance it',()=>{
 const f=fixture();f.grant();f.client.baseline(f.frame);f.client.begin(f.client.targets()[0]);f.client.end();
 f.client.receive({type:'control_result',epoch:'e',grant:'wrong',sequence:1,ok:true,lease:'stale'});assert.equal(f.client.gesture.lease,null);
 f.ack({lease:'l'});f.step(50);assert.equal(f.sent.at(-1).action,'end');f.ack();assert.equal(f.client.gesture,null);
});
test('held controls renew, disconnects and revocation drop gestures, timeout abandons grant',()=>{
 const f=fixture();f.grant();f.client.baseline(f.frame);f.client.begin(f.client.targets()[0]);f.ack({lease:'l'});
 f.step(400);assert.equal(f.sent.at(-1).action,'update');
 f.step(2001);assert.equal(f.sent.at(-1).type,'control_abandon');assert.equal(f.client.permission,null);
 f.grant();f.client.baseline(f.frame);f.client.begin(f.client.targets()[0]);f.client.receive({type:'control_permission',enabled:false});assert.equal(f.client.gesture,null);
 f.client.disconnect();assert.equal(f.client.frame,null);
});
test('rate limiting retries with a fresh sequence; removal or new epoch stops an active gesture',()=>{
 const f=fixture();f.grant();f.client.baseline(f.frame);f.client.begin(f.client.targets()[0]);f.ack({ok:false,reason:'rate_limited'});
 f.step(120);assert.equal(f.sent.at(-1).sequence,2);f.ack({lease:'l'});
 f.client.baseline({...f.frame,visuals:{panels:[]}});assert.equal(f.client.gesture,null);assert.equal(f.sent.at(-1).type,'control_abandon');
 f.grant();f.client.baseline(f.frame);f.client.begin(f.client.targets()[0]);f.client.baseline({...f.frame,control_epoch:'new'});assert.equal(f.client.permission,null);
});

test('stationary continuous input preserves snapped acknowledgment until movement or renewal',()=>{
 const f=fixture();f.grant();f.client.baseline(f.frame);f.client.begin(f.client.targets()[0]);f.ack({lease:'l'});
 f.step(50);f.client.move(.71);f.ack({value:.75,revision:1});
 for(let i=0;i<10;i++){f.client.move(.71);f.step(16);}
 assert.equal(f.sent.length,2);assert.equal(f.client.gesture.value,.75);
 f.step(240);assert.equal(f.sent.at(-1).action,'update');assert.equal(f.sent.at(-1).value,.75);
 f.ack({value:.75,revision:2});f.client.end();f.client.move(.2);
 assert.equal(f.client.gesture.value,.75);f.step(50);assert.equal(f.sent.at(-1).action,'end');
});

test('momentary button quick release still presses once and returns to rest after host end',()=>{
 const f=fixture();Object.assign(f.frame.visuals.panels[0].controls[0],{kind:'switch',momentary:true,min:0,max:1,normalized:0});
 f.grant();f.client.baseline(f.frame);f.client.begin(f.client.targets()[0]);f.client.end();f.ack({lease:'button',value:0});
 f.step(50);assert.equal(f.sent.at(-1).value,1);f.ack({value:1,revision:1});f.step(50);
 assert.equal(f.sent.at(-1).action,'end');f.ack({revision:2});assert.equal(f.client.presentation(f.frame).value,0);
});
test('multi-position switch cycles from host value rather than stale displayed value',()=>{
 const f=fixture();Object.assign(f.frame.visuals.panels[0].controls[0],{kind:'switch',min:0,max:2,normalized:0});
 f.grant();f.client.baseline(f.frame);f.client.begin(f.client.targets()[0]);f.client.end();f.ack({lease:'switch',value:.5});
 f.step(50);assert.equal(f.sent.at(-1).value,1);f.ack({value:1,revision:1});f.step(50);f.ack({revision:2});
 f.client.begin(f.client.targets()[0]);f.step(50);f.ack({lease:'switch2',value:1});f.step(50);assert.equal(f.sent.at(-1).value,0);
});
test('cable commands require a grant, baseline, and no active gesture; failures are not replayed',()=>{
 const f=fixture(),fields={wiring:'1',input_module:'1',input_port:0,output_module:'2',output_port:0};
 assert.equal(f.client.cable('cable_connect',fields),false);
 f.grant();f.client.baseline({...f.frame,wiring:'1'});assert.equal(f.client.cable('cable_connect',fields),true);
 assert.equal(f.client.begin(f.client.targets()[0]),false);assert.equal(f.client.cable('cable_connect',fields),false);
 f.ack({ok:false,reason:'wiring_changed_or_invalid'});f.step(2000);assert.equal(f.sent.length,1);assert.ok(f.client.permission);
});


test('late pipeline acknowledgments never roll newer local movement backwards',()=>{
 const f=fixture();f.client.receive({type:'control_permission',enabled:true,epoch:'e',grant:'g',window:3});f.client.baseline(f.frame);f.client.begin(f.client.targets()[0]);f.ack({lease:'l'});
 for(const value of [.6,.7,.8]){f.step(50);f.client.move(value);}
 assert.equal(f.client.requests.size,3);
 const reply=(sequence,value)=>f.client.receive({type:'control_result',epoch:'e',grant:'g',sequence,ok:true,value,revision:sequence});
 reply(2,.6);assert.equal(f.client.presentation(f.frame).value,.8);
 reply(4,.8);reply(3,.7);assert.equal(f.client.presentation(f.frame).value,.8);
 f.client.end();f.step(50);assert.equal(f.sent.at(-1).action,'end');f.ack({revision:5});assert.equal(f.client.gesture,null);
});
