// Isolated integration probe; never joins the configured public show.
import {WebSocket} from 'ws';
import {readFileSync} from 'node:fs';
import {ControlClient} from './control-client.js';
let url=process.argv[2],origin;
if(url==='--public-session'){
 const session=JSON.parse(readFileSync(process.argv[3],'utf8')),visitor=new URL(session.visitor_url);
 if(visitor.protocol!=='https:')throw Error('Explicit public probe requires HTTPS');
 const invite=new URLSearchParams(visitor.hash.slice(1)).get('invite');if(!invite)throw Error('Invitation missing');
 origin=visitor.origin;visitor.protocol='wss:';visitor.pathname='/room';visitor.hash='';visitor.search=new URLSearchParams({invite}).toString();url=visitor.href;
}else{
 const parsed=new URL(url);if(parsed.hostname!=='127.0.0.1')throw Error('Control probe requires a loopback relay or explicit --public-session');
 origin=`http://localhost:${parsed.port}`;
}
const ws=new WebSocket(url,{origin,headers:{'User-Agent':'Mozilla/5.0'}});
const client=new ControlClient(message=>{if(ws.readyState!==WebSocket.OPEN)return false;ws.send(JSON.stringify(message));return true;});
let completed=false,failure=null,frame=null,lastReply=null;
const pump=setInterval(()=>client.pump(),16);
ws.on('message',(bytes,binary)=>{
 if(binary)return;const m=JSON.parse(bytes);client.receive(m);
 if(m.type==='room'&&m.show){frame=m.show;client.baseline(frame);}
 if(m.type==='control_result'){lastReply=m;if(!m.ok)failure=Error('Control rejected: '+m.reason);}
});
ws.on('error',error=>{failure=error;});
const wait=async (predicate,timeout=10000)=>{const until=performance.now()+timeout;while(!predicate()){if(failure)throw failure;if(performance.now()>until)throw Error('Probe timed out: '+client.status);await new Promise(r=>setTimeout(r,20));}};
try{
 await wait(()=>client.permission&&frame?.control_epoch===client.permission.epoch,45000);
 const knob=client.targets().find(t=>t.kind==='knob'&&t.module==='1');
 if(!client.begin(knob))throw Error('Missing knob');client.move(.6);client.end();
 await wait(()=>!client.gesture&&!client.pending);
 if(!client.begin(client.targets().find(t=>t.module===knob.module&&t.parameter===knob.parameter)))throw Error('Unable to begin moving gesture');
 await wait(()=>client.gesture?.lease);
 for(let i=0;i<16;i++){client.move(.2+i/30);await new Promise(resolve=>setTimeout(resolve,50));if(client.requests.size>3)throw Error('Unbounded control pipeline');}
 client.end();await wait(()=>!client.gesture&&!client.pending);
 console.log('PASS: continuous control motion with bounded acknowledgments');
 const button=client.targets().find(t=>t.kind==='switch'&&t.momentary);
 if(!button||!client.begin(button))throw Error('Missing button');client.end();
 await wait(()=>!client.gesture&&!client.pending);
 await wait(()=>frame.control_revision>=lastReply.revision);
 const output=frame.visuals.panels.find(p=>p.id==='1').controls.find(c=>c.kind==='port'&&c.direction==='output');
 const inputs=frame.visuals.panels.find(p=>p.id==='2').controls.filter(c=>c.kind==='port'&&c.direction==='input');
 const wire={input_module:'2',input_port:inputs[0].id,output_module:'1',output_port:output.id};
 if(!client.cable('cable_connect',{...wire,wiring:frame.wiring}))throw Error('Unable to connect');
 await wait(()=>!client.pending);await wait(()=>frame.control_revision>=lastReply.revision);
 if(frame.visuals.cables.length!==1)throw Error('Cable not created');
 const old=frame.visuals.cables[0].id;
 client.cable('cable_connect',{...wire,input_port:inputs[1].id,replace_cable:old,wiring:frame.wiring});
 await wait(()=>!client.pending);await wait(()=>frame.control_revision>=lastReply.revision);
 if(frame.visuals.cables.length!==1||frame.visuals.cables[0].input_port!==inputs[1].id)throw Error('Cable not moved');
 client.cable('cable_disconnect',{input_module:'2',input_port:inputs[1].id,cable_id:frame.visuals.cables[0].id,wiring:frame.wiring});
 await wait(()=>!client.pending);await wait(()=>frame.control_revision>=lastReply.revision);
 if(frame.visuals.cables.length)throw Error('Cable not disconnected');
 // Leave a held momentary button to verify host disconnect cleanup.
 if(!client.begin(client.targets().find(t=>t.module===button.module&&t.parameter===button.parameter)))throw Error('Unable to hold button');
 await wait(()=>client.gesture?.confirmed===1&&!client.pending);
 completed=true;console.log('PASS: real visitor gestures, momentary button, cable connect/move/disconnect and held-button disconnect');
}catch(error){console.error(error);process.exitCode=1;}
finally{clearInterval(pump);ws.close();client.disconnect();}
ws.on('close',()=>{if(!completed)process.exitCode=1;});

