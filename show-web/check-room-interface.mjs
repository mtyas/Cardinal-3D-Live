// SPDX-License-Identifier: GPL-3.0-or-later
// Responsive room UI acceptance. Uses a disposable profile and a separate local test relay.
// node check-room-interface.mjs <isolated-local-session.json> <screenshot-directory>
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WebSocket} from 'ws';
const session=JSON.parse(await readFile(process.argv[2],'utf8'));
const url=new URL('/room.html',session.visitor_url);
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('UI grant tests require a separate local-only relay');
const hostUrl=new URL(session.url);
if(!['localhost','127.0.0.1','[::1]'].includes(hostUrl.hostname)||hostUrl.port!==url.port)throw Error('The test host must use the same isolated local relay');
const output=process.argv[3]||'../reports';
let host;
const testMessage='Interface test '+Date.now();
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
 const check=async(expression,message)=>{if(!await evaluate(expression))throw Error(message);};
 const until=async expression=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await wait(100);}throw Error('UI state did not arrive: '+expression+'; '+JSON.stringify(await evaluate(`({status:document.getElementById('status').textContent,error:document.getElementById('error').textContent,messages:document.getElementById('messages').textContent})`))+'; exceptions='+exceptions.join(','));};
 const screenshot=async name=>{const result=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(output,name+'.png'),Buffer.from(result.data,'base64'));};
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await call('Page.navigate',{url:url.href});
 await until(`document.getElementById('join')?.disabled===false`);
 await check(`document.documentElement.scrollWidth<=innerWidth`,'Phone welcome overflows horizontally');
 await screenshot('interface-phone-welcome');
 await evaluate(`document.getElementById('name').value='Interface test';document.getElementById('name').focus()`);
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter'});
 await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter'});
 await until(`!document.getElementById('room-dock').hidden`);
 await check(`document.getElementById('chat').hidden`,'Room must begin with the stage unobstructed');
 await evaluate(`document.querySelector('[data-panel="sound"]').click()`);
 await check(`[...document.querySelectorAll('[data-room-panel]')].filter(p=>!p.hidden).length===1`,'Only one panel may be visible');
 await check(`document.getElementById('chat').getBoundingClientRect().right<=innerWidth`,'Phone panel overflows');
 await screenshot('interface-phone-sound');
 await evaluate(`document.getElementById('enable-audio').click()`);
 await until(`document.getElementById('quick-audio').textContent==='Sound on'`);
 await evaluate(`const volume=document.getElementById('listening-volume');volume.value='.37';volume.dispatchEvent(new Event('input'));document.getElementById('mute-audio').click()`);
 await check(`document.getElementById('quick-audio').textContent==='Muted'&&Number(document.getElementById('listening-volume').value)===0`,'Mute must update the device volume and dock');
 await evaluate(`document.getElementById('mute-audio').click()`);
 await check(`Number(document.getElementById('listening-volume').value)===.37`,'Unmute must restore the chosen volume');

 await evaluate(`document.querySelector('[data-panel="play"]').click()`);
 await check(`document.getElementById('room-role').textContent==='Visitor'`,'Visitor role is unclear');
 await check(`getComputedStyle(document.querySelector('.remote-controls details')).display==='none'`,'Read-only visitors should not see editable selectors');
 host=new WebSocket(session.url);let hostRoom;
 host.on('message',bytes=>{const m=JSON.parse(bytes);if(m.type==='room')hostRoom=m;});
 await new Promise((resolve,reject)=>{host.once('open',resolve);host.once('error',reject);});
 for(let i=0;i<80&&!hostRoom?.members.some(m=>m.name==='Interface test');i++)await wait(100);
 const actor=hostRoom?.members.find(m=>m.name==='Interface test')?.id;if(!actor)throw Error('Test visitor missing');
 host.send(JSON.stringify({type:'control_session',epoch:'interface-test'}));
 await wait(100);host.send(JSON.stringify({type:'control_grant',epoch:'interface-test',actor}));
 await until(`document.getElementById('room-role').textContent==='Collaborator'`);
 await check(`!document.querySelector('.remote-controls').classList.contains('read-only')`,'Granted controls stay hidden');
 await screenshot('interface-phone-collaborator');
 host.send(JSON.stringify({type:'control_revoke',actor}));
 await until(`document.getElementById('room-role').textContent==='Visitor'`);
 await evaluate(`document.querySelector('[data-panel="chat"]').click();document.getElementById('message').value=${JSON.stringify(testMessage)};document.getElementById('chat-form').requestSubmit()`);
 await until(`document.getElementById('messages').textContent.includes(${JSON.stringify(testMessage)})`);
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
 await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
 await check(`document.getElementById('chat').hidden&&document.activeElement.dataset.panel==='chat'`,'Escape must close and restore focus');
 await evaluate(`document.getElementById('hud-toggle').click()`);
 await check(`document.getElementById('room-dock').hidden&&!document.getElementById('hud-toggle').hidden`,'Hidden HUD must remain recoverable');
 await evaluate(`document.getElementById('hud-toggle').click()`);
 await call('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
 await evaluate(`document.querySelector('[data-panel="room"]').click()`);
 await check(`document.getElementById('chat').getBoundingClientRect().bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth`,'Landscape panel overflows');
 await screenshot('interface-phone-landscape');
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await evaluate(`document.querySelector('[data-panel="chat"]').click()`);
 await screenshot('interface-desktop-chat');
 if(exceptions.length)throw Error('Browser exceptions: '+exceptions.join(', '));
 console.log('PASS: phone portrait/landscape and desktop layouts, volume/mute, real grant/revoke badges, fresh chat delivery, Escape focus and hide/restore');
}finally{
 host?.close();socket?.close();browser.kill();await new Promise(resolve=>{if(browser.exitCode!==null)resolve();else{browser.once('exit',resolve);setTimeout(resolve,3000).unref();}});
 for(let i=0;i<15;i++){try{await rm(profile,{recursive:true,force:true});break;}catch{await wait(200);}}
}
