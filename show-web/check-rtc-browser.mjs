// SPDX-License-Identifier: GPL-3.0-or-later
// Real Chromium media test. Uses a disposable browser profile, never a user's tabs.
// node check-rtc-browser.mjs <private-session.json> [milliseconds] [local|public]
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WebSocket} from 'ws';
const session=JSON.parse(await readFile(process.argv[2],'utf8')),duration=Number(process.argv[3]||35000),local=process.argv[4]==='local';
const requireRelay=process.env.CARDINAL_REQUIRE_TURN_RELAY==='1';
const url=new URL(session.visitor_url);if(local){url.protocol='http:';url.host=new URL(session.url).host;}url.pathname='/room.html';
const profile=await mkdtemp(join(tmpdir(),'cardinal-rtc-test-'));
const executable=process.env.CARDINAL_TEST_CHROME||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser=spawn(executable,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--disable-extensions','--no-default-browser-check','--autoplay-policy=no-user-gesture-required','--enable-unsafe-swiftshader','--use-angle=swiftshader','about:blank'],{stdio:'ignore',windowsHide:true});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));let socket;
try{
 let port;
 for(let i=0;i<100;i++){try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await wait(100);}}
 if(!port)throw Error('Disposable Chromium did not start');
 const tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket((tabs.find(t=>t.type==='page'&&t.url==='about:blank')||tabs.find(t=>t.type==='page')).webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
 let sequence=0;const pending=new Map(),exceptions=[];
 socket.on('message',bytes=>{const message=JSON.parse(bytes);if(message.id){const job=pending.get(message.id);pending.delete(message.id);if(message.error)job?.reject(Error(message.error.message));else job?.resolve(message.result);}else if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text);});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;};
 await call('Page.enable');await call('Runtime.enable');
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`window.testPeers=[];const NativePeer=window.RTCPeerConnection;window.RTCPeerConnection=class extends NativePeer{constructor(c){super(c);window.testPeers.push(this);}};window.testAudio=[];const NativeAudio=window.AudioContext;window.AudioContext=class extends NativeAudio{constructor(c){super(c);window.testAudio.push(this);}createMediaStreamSource(stream){const source=super.createMediaStreamSource(stream),analyser=this.createAnalyser();source.connect(analyser);window.testAnalysers??=[];window.testAnalysers.push(analyser);return source;}};`});
 const navigation=await call('Page.navigate',{url:url.href});if(navigation.errorText)throw Error('Browser navigation: '+navigation.errorText);
 let ready=false;
 for(let i=0;i<200;i++){ready=await evaluate(`!!document.getElementById('audio-route')&&document.getElementById('join').disabled===false`);if(ready)break;await wait(100);}
 if(!ready){console.log(JSON.stringify({loadFailure:await evaluate(`({title:document.title,body:document.body?.innerText.slice(0,350),scripts:[...document.scripts].map(s=>s.src.replace(/#.*/,''))})`),exceptions}));throw Error('Updated room did not load');}
 await evaluate(`document.getElementById('name').value='WebRTC integration check';document.getElementById('join').click();`);
 await wait(1500);
 await evaluate(`const route=document.getElementById('audio-route');route.value='webrtc';route.dispatchEvent(new Event('change'));document.getElementById('enable-audio').click();`);
 const samples=[],started=Date.now();let active=false;
 while(Date.now()-started<duration){
  const sample=await evaluate(`(async()=>{const pc=window.testPeers.at(-1);if(!pc)return {status:document.getElementById('audio-transport').textContent,room:document.getElementById('status').textContent,error:document.getElementById('error').textContent};const report=await pc.getStats();const all=[...report.values()];return {state:pc.connectionState,status:document.getElementById('audio-transport').textContent,tracks:all.filter(s=>s.type==='inbound-rtp'&&s.kind==='audio').map(s=>({packets:s.packetsReceived,lost:s.packetsLost,bytes:s.bytesReceived,samples:s.totalSamplesReceived,concealed:s.concealedSamples,bufferMs:s.jitterBufferEmittedCount?1000*s.jitterBufferDelay/s.jitterBufferEmittedCount:0})),pairs:all.filter(s=>s.type==='candidate-pair'&&s.state==='succeeded'&&s.nominated).map(s=>({rttMs:1000*s.currentRoundTripTime,local:report.get(s.localCandidateId)?.candidateType,remote:report.get(s.remoteCandidateId)?.candidateType})),contexts:window.testAudio.map(a=>({state:a.state,time:a.currentTime})),energy:(window.testAnalysers||[]).map(a=>{const values=new Float32Array(a.fftSize);a.getFloatTimeDomainData(values);return values.reduce((n,x)=>n+x*x,0)/values.length;})};})()`);
  samples.push(sample);if(sample.energy?.some(e=>e>1e-8)&&sample.state==='connected'&&sample.tracks?.length===2&&sample.tracks.every(s=>s.packets>50)&&sample.status.startsWith('WebRTC'))active=true;
  await wait(2000);
 }
 const healthy=samples.filter(s=>s.energy?.some(e=>e>1e-8)&&s.state==='connected'&&s.tracks?.length===2&&s.tracks.every(t=>t.packets>50)&&s.status.startsWith('WebRTC'));
 console.log(JSON.stringify({active,exceptions,measurements:samples.length,healthy:healthy.length,first:healthy[0],last:healthy.at(-1),final:samples.at(-1)}));
 if(!active||healthy.length<3||exceptions.length)throw Error('WebRTC browser playback failed');
 if(requireRelay&&!healthy.some(s=>s.pairs?.some(p=>p.local==='relay'||p.remote==='relay')))throw Error('TURN acceptance requires a nominated relay candidate, not a direct/local media route');
 console.log('PASS: real Chromium receives two WebRTC audio tracks over encrypted media');
 if(requireRelay)console.log('PASS: decoded browser audio uses a nominated TURN relay route');
}finally{
 socket?.close();browser.kill();await new Promise(resolve=>{if(browser.exitCode!==null)resolve();else{browser.once('exit',resolve);setTimeout(resolve,3000).unref();}});
 for(let i=0;i<15;i++){try{await rm(profile,{recursive:true,force:true});break;}catch{await wait(200);}}
}
