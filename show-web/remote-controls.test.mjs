import test from 'node:test';
import assert from 'node:assert/strict';
import {RemoteControls} from './remote-controls.js';
import {ControlClient} from './control-client.js';
function fixture(){
 const sent=[],client=new ControlClient(m=>sent.push(m),()=>0);
 const frame={control_epoch:'e',wiring:'1',visuals:{panels:[{id:'1',controls:[{kind:'port',id:0,direction:'output'}]},{id:'2',controls:[{kind:'port',id:0,direction:'input'},{kind:'port',id:1,direction:'input'}]}],cables:[]}};
 client.receive({type:'control_permission',enabled:true,epoch:'e',grant:'g'});client.baseline(frame);
 const ui=Object.create(RemoteControls.prototype);ui.client=client;
 const output={kind:'port',module:'1',port:0,direction:'output'},input={kind:'port',module:'2',port:0,direction:'input'};
 return {sent,client,frame,ui,output,input};
}
test('direct port selection connects once, with the displayed wiring version',()=>{
 const f=fixture();assert.ok(f.ui.activate(f.output));assert.equal(f.sent.length,0);assert.ok(f.ui.activate(f.input));
 assert.equal(f.sent.length,1);assert.equal(f.sent[0].action,'cable_connect');assert.equal(f.sent[0].output_module,'1');assert.equal(f.sent[0].input_module,'2');assert.equal(f.sent[0].wiring,'1');
 assert.equal(f.ui.activate(f.input),false);
});
test('selecting a connected input allows moving or disconnecting its cable',()=>{
 for(const disconnect of [false,true]){
  const f=fixture();f.frame.visuals.cables=[{id:'8',output_module:'1',output_port:0,input_module:'2',input_port:0}];
  f.ui.activate(f.input);f.ui.activate({...f.input,port:disconnect?0:1});
  assert.equal(f.sent[0].action,disconnect?'cable_disconnect':'cable_connect');
  assert.equal(f.sent[0][disconnect?'cable_id':'replace_cable'],'8');
 }
});
test('obsolete cable selections and read-only visitors cannot change wiring',()=>{
 const f=fixture();f.ui.activate(f.output);f.client.baseline({...f.frame,wiring:'2'});assert.equal(f.ui.activate(f.input),false);assert.equal(f.sent.length,0);
 f.client.disconnect();assert.equal(f.ui.activate(f.output),false);
});
