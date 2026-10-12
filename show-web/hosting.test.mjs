import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeUpgrade,publicOrigin,publicRedirect} from './hosting.mjs';
const config={proxyAddress:'100.64.0.10',publicOrigin:'https://live.example.org',origins:['https://live.example.org','http://localhost:8878'],inviteToken:'visitor-secret',hostToken:'performer-secret'};
const visitor={path:'/room',origin:config.publicOrigin,address:'100.64.0.10',host:null,invite:'visitor-secret'};
test('public visitor must present the invitation and approved origin',()=>{assert.equal(authorizeUpgrade(visitor,config),true);assert.equal(authorizeUpgrade({...visitor,invite:null},config),false);assert.equal(authorizeUpgrade({...visitor,address:'192.168.31.40'},config),false);assert.equal(authorizeUpgrade({...visitor,origin:'https://evil.test'},config),false);});
test('remote native publishers and remote host impersonation are blocked even with a host key',()=>{const native={path:'/performer',origin:undefined,address:'127.0.0.1',host:'performer-secret',invite:null};assert.equal(authorizeUpgrade(native,config),true);assert.equal(authorizeUpgrade({...native,address:'100.64.0.10'},config),false);assert.equal(authorizeUpgrade({...visitor,host:'performer-secret'},config),false);assert.equal(authorizeUpgrade({...native,origin:config.publicOrigin},config),false);});
test('HTTPS origin is explicit and cannot carry credentials or arbitrary paths',()=>{assert.equal(publicOrigin('https://live.example.org'),'https://live.example.org');assert.throws(()=>publicOrigin('http://live.example.org'));assert.throws(()=>publicOrigin('https://user:secret@live.example.org'));assert.throws(()=>publicOrigin('https://live.example.org/path'));});

test('public HTTP is redirected to the configured HTTPS origin without affecting localhost',()=>{
 assert.equal(publicRedirect({address:'100.64.0.10',forwardedProto:'http',url:'/room.html?x=1'},config),'https://live.example.org/room.html?x=1');
 assert.equal(publicRedirect({address:'100.64.0.10',forwardedProto:'https',url:'/'},config),null);
 assert.equal(publicRedirect({address:'127.0.0.1',forwardedProto:'http',url:'/'},config),null);
});
