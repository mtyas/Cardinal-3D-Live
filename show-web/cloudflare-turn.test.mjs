import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudflareTurnProvider} from './cloudflare-turn.mjs';
import {RtcAudioRelay} from './rtc-audio-relay.mjs';

const config={key_id:'test-key-123',api_token_file:'private-token.txt'};
const payload={iceServers:[{urls:['stun:stun.cloudflare.com:3478']},{urls:['turn:turn.cloudflare.com:3478?transport=udp','turns:turn.cloudflare.com:443?transport=tcp','turn:turn.cloudflare.com:53?transport=udp'],username:'temporary-user',credential:'temporary-password',api_token:'should-not-be-forwarded'}]};

test('Cloudflare uses a fixed server-side endpoint and forwards only temporary ICE fields',async()=>{
 let count=0;
 const provider=cloudflareTurnProvider(config,{readToken:async path=>{assert.equal(path,config.api_token_file);return 'master-secret\n';},fetchImpl:async(url,options)=>{
  assert.equal(url,'https://rtc.live.cloudflare.com/v1/turn/keys/test-key-123/credentials/generate-ice-servers');
  assert.equal(options.headers.Authorization,'Bearer master-secret');assert.equal(options.headers['User-Agent'],'Cardinal3DLive/0.6');assert.equal(options.redirect,'error');assert.equal(JSON.parse(options.body).ttl,14400);count++;
  return Response.json(payload,{status:201});
 }});
 const a=await provider(),b=await provider();assert.equal(count,2,'each negotiation receives newly generated credentials');
 assert.equal(a[1].urls.length,2);assert.deepEqual(a,b);
 const result=JSON.stringify(a);for(const secret of ['master-secret','private-token.txt','test-key-123','should-not-be-forwarded'])assert.ok(!result.includes(secret));
});

test('provider rejects redirects, errors, malformed credentials and oversized responses without leaking details',async()=>{
 for(const response of [new Response('master-secret',{status:403}),Response.json({iceServers:[{urls:'turn:turn.cloudflare.com:3478'}]}),Response.json({iceServers:[{urls:'turn:evil.example:3478',username:'u',credential:'p'}]}),new Response('x'.repeat(65537))]){
  const provider=cloudflareTurnProvider(config,{readToken:async()=> 'master-secret',fetchImpl:async()=>response});
  await assert.rejects(provider(),{message:'Cloudflare TURN credentials unavailable'});
 }
 const provider=cloudflareTurnProvider(config,{readToken:async()=>{throw Error('private filesystem detail');}});
 await assert.rejects(provider(),{message:'Cloudflare TURN credentials unavailable'});
 assert.throws(()=>cloudflareTurnProvider({...config,key_id:'../../arbitrary'}));
 assert.throws(()=>cloudflareTurnProvider({...config,ttl_seconds:Infinity}));
});

test('pending TURN request is not restarted by scene ticks and cannot resurrect a disconnected peer',async()=>{
 let resolve,calls=0,created=0,signal;
 const pending=new Promise(r=>resolve=r),socket={},messages=[];
 const relay=new RtcAudioRelay({send:(s,m)=>messages.push(m),Peer:class{constructor(){created++;}},iceProvider:async options=>{calls++;signal=options.signal;return pending;}});
 const scene={frame:100,sample_rate:48000,speakers:[{id:'1'}]};
 try{
  relay.updateScene(scene);relay.request(socket);
  for(let frame=101;frame<120;frame++)relay.updateScene({...scene,frame});
  assert.equal(calls,1);relay.stop(socket);assert.equal(signal.aborted,true);
  resolve(payload.iceServers);await new Promise(setImmediate);
  assert.equal(created,0);assert.equal(relay.peers.size,0);assert.equal(messages.length,0);
 }finally{relay.close();}
});

test('TURN provider failure reports a safe fallback reason and releases peer capacity',async()=>{
 const socket={},messages=[],relay=new RtcAudioRelay({send:(s,m)=>messages.push(m),iceProvider:async()=>{throw Error('master-secret');}});
 try{
  relay.updateScene({frame:100,sample_rate:48000,speakers:[{id:'1'}]});relay.request(socket);await new Promise(setImmediate);
  assert.equal(relay.peers.size,0);assert.equal(messages.at(-1).reason,'turn_credentials_failed');assert.ok(!JSON.stringify(messages).includes('master-secret'));
 }finally{relay.close();}
});
