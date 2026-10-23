// SPDX-License-Identifier: GPL-3.0-or-later
import {readFile} from 'node:fs/promises';

// Only the server reads the operator's API token. The result contains temporary
// ICE credentials, never the key ID, token, filename or provider error body.
export function cloudflareTurnProvider(config,{fetchImpl=fetch,readToken=path=>readFile(path,'utf8')}={}) {
 const {key_id:keyId,api_token_file:tokenFile}=config;
 const ttl=config.ttl_seconds??14400;
 if(typeof keyId!=='string'||!/^[a-zA-Z0-9_-]{8,128}$/.test(keyId)||typeof tokenFile!=='string'||!tokenFile||!Number.isInteger(ttl)||ttl<600||ttl>86400)throw Error('Invalid Cloudflare TURN configuration');
 return async function credentials({signal}={}) {
  try {
   const token=(await readToken(tokenFile)).trim();
   if(!token||token.length>4096||/[\r\n]/.test(token))throw Error();
   const response=await fetchImpl(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,{
    method:'POST',redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','User-Agent':'Cardinal3DLive/0.6','Accept':'application/json'},body:JSON.stringify({ttl}),
    signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)
   });
   if(!response.ok){await response.body?.cancel();throw Error();}
   // Bound even chunked responses; do not buffer an unbounded error/document.
   let bytes=0,text='';const decoder=new TextDecoder();
   for await(const chunk of response.body){bytes+=chunk.byteLength;if(bytes>65536)throw Error();text+=decoder.decode(chunk,{stream:true});}
   text+=decoder.decode();const result=JSON.parse(text);
   if(!Array.isArray(result.iceServers)||result.iceServers.length>8)throw Error();
   const servers=result.iceServers.map(server=>{
    const urls=(Array.isArray(server.urls)?server.urls:[server.urls]).filter(url=>{
     if(typeof url!=='string')return false;
     // No arbitrary endpoints, port 53 timeouts, or provider metadata.
     return /^(?:stun:stun|turns?:turn)\.cloudflare\.com:(?:3478|443|80|5349)(?:\?transport=(?:udp|tcp))?$/.test(url);
    });
    if(!urls.length)return null;
    if(urls.some(url=>url.startsWith('turn'))){
     if(typeof server.username!=='string'||!server.username||server.username.length>2048||typeof server.credential!=='string'||!server.credential||server.credential.length>2048)throw Error();
     return {urls,username:server.username,credential:server.credential};
    }
    return {urls};
   }).filter(Boolean);
   if(!servers.some(s=>s.username))throw Error();
   return servers;
  }catch{throw Error('Cloudflare TURN credentials unavailable');}
 };
}
