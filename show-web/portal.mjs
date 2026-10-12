// SPDX-License-Identifier: GPL-3.0-or-later
// Always-on Umbrel welcome page. Live media remains on the performer's Windows PC.
import http from 'node:http';
import net from 'node:net';
import {readFile,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {TelegramAnnouncer,atomicJSON} from './telegram-announcer.mjs';

export async function createPortal({upstream='http://100.64.0.20:8878',origin='https://live.example.org',
 directory='/data',root=dirname(fileURLToPath(import.meta.url)),pollMs=5000,fetcher=fetch,now=Date.now}={}){
 const remote=new URL(upstream);if(remote.protocol!=='http:'||remote.username||remote.password)throw Error('Invalid upstream');
 await mkdir(directory,{recursive:true});
 let profile=JSON.parse(await readFile(join(root,'show-profile.json'),'utf8'));
 try{profile=JSON.parse(await readFile(join(directory,'show-info.json'),'utf8')).profile||profile;}catch(e){if(e.code!=='ENOENT')throw e;}
 let savedProfile=JSON.stringify(profile);
 let info={profile,live:false,publicOpen:false,localPreview:false,visitors:0,capacity:100},lastSeen=0,polling=false;
 const announcer=new TelegramAnnouncer(directory,{fetcher,now,origin});await announcer.load();await announcer.recover();
 async function poll(){
  if(polling)return;polling=true;
  try{
   const response=await fetcher(new URL('/show-info',remote),{headers:{'X-Forwarded-Proto':'https'},signal:AbortSignal.timeout(2500)});
   if(!response.ok)throw Error('Performer offline');const next=await response.json();
   if(!next.profile||typeof next.live!=='boolean')throw Error('Invalid performer status');
   // Persist only public landing information, never visitor identities or invitation keys.
   info={profile:next.profile,live:next.live,publicOpen:Boolean(next.publicOpen),localPreview:false,
    visitors:Math.max(0,Number(next.visitors)||0),capacity:Number(next.capacity)||100,showId:next.showId||null};lastSeen=now();
   const serialized=JSON.stringify(info.profile);
   if(serialized!==savedProfile){await atomicJSON(join(directory,'show-info.json'),{profile:info.profile});savedProfile=serialized;}
   // Notification failures must never change the live room's availability.
   announcer.observe(info).catch(()=>console.error('Announcement configuration needs attention.'));
  }catch{lastSeen=0;info={...info,live:false,publicOpen:false,visitors:0,showId:null};}
  finally{polling=false;}
 }
 const timer=pollMs?setInterval(poll,pollMs):null;
 const routes=new Map([['/',['index.html','text/html']],['/landing.css',['landing.css','text/css']],['/landing.js',['landing.js','text/javascript']]]);
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.headers['x-forwarded-proto']?.split(',')[0].trim()==='http'){
   res.writeHead(308,{Location:origin+url.pathname+url.search,'Cache-Control':'no-store'});res.end();return;
  }
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  const json=data=>{res.writeHead(200,{...headers,'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  try{
   if(req.method==='GET'&&url.pathname==='/health'){json({app:'cardinal-3d-welcome',performerAvailable:now()-lastSeen<15000&&lastSeen>0});return;}
   if(req.method==='GET'&&url.pathname==='/show-info'){
    json(now()-lastSeen<15000?info:{...info,live:false,publicOpen:false,visitors:0,showId:null});return;
   }
   if(req.method==='GET'&&url.pathname==='/notifications'){
    const settings=await announcer.publicSettings();
    if(!settings.url&&/^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(info.profile.telegram_channel||''))settings.url='https://t.me/'+info.profile.telegram_channel.slice(1);
    json(settings);return;
   }
   if(req.method==='GET'&&routes.has(url.pathname)){
    const [name,type]=routes.get(url.pathname);res.writeHead(200,{...headers,'Content-Type':type+'; charset=utf-8'});res.end(await readFile(join(root,name)));return;
   }
   if(req.method!=='GET'||url.pathname==='/performer'||url.pathname==='/room'){
    res.writeHead(404,headers);res.end('Not found');return;
   }
   const outgoing=http.request(new URL(url.pathname+url.search,remote),{method:'GET',headers:{...req.headers,host:remote.host,'x-forwarded-proto':'https'},timeout:5000},reply=>{
    res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
   });
   outgoing.on('timeout',()=>outgoing.destroy());
   outgoing.on('error',()=>{
    if(res.headersSent){res.destroy();return;}
    res.writeHead(503,{...headers,'Content-Type':'text/html; charset=utf-8'});
    res.end('<!doctype html><title>Between performances</title><h1>The stage is resting</h1><p>The welcome page is always here. Come back when Matthew starts a show.</p><a href="/">Back to the welcome page</a>');
   });outgoing.end();
  }catch{if(!res.headersSent)res.writeHead(503,headers);res.end('Please try again shortly.');}
 });
 // Forward visitor sockets only. Performer credentials never cross this public proxy.
 server.on('upgrade',(req,socket,head)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname!=='/room'||req.headers.origin!==origin||url.searchParams.has('host')){socket.destroy();return;}
  const upstreamSocket=net.connect({host:remote.hostname,port:Number(remote.port)||80});
  upstreamSocket.setTimeout(5000,()=>upstreamSocket.destroy());
  upstreamSocket.on('connect',()=>{
   upstreamSocket.setTimeout(0);const headers={...req.headers,host:remote.host,'x-forwarded-proto':'https'};
   // Reconstruct CRLF-delimited headers; HTTP's parser has already rejected invalid values.
   upstreamSocket.write(`${req.method} ${url.pathname+url.search} HTTP/1.1\r\n`+Object.entries(headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');
   if(head.length)upstreamSocket.write(head);socket.pipe(upstreamSocket);upstreamSocket.pipe(socket);
  });
  upstreamSocket.on('error',()=>socket.destroy());socket.on('error',()=>upstreamSocket.destroy());
  socket.on('close',()=>upstreamSocket.destroy());upstreamSocket.on('close',()=>socket.destroy());
 });
 return {server,poll,close:()=>{if(timer)clearInterval(timer);server.closeAllConnections();return new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const portal=await createPortal({upstream:process.env.SHOW_UPSTREAM,origin:process.env.PUBLIC_ORIGIN,directory:process.env.DATA_DIR});
 portal.server.listen(Number(process.env.PORT)||8788,'0.0.0.0',()=>console.log('Cardinal welcome service ready.'));
 portal.poll();
}
