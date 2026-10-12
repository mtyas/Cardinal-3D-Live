// SPDX-License-Identifier: GPL-3.0-or-later
import {timingSafeEqual} from 'node:crypto';
export const localAddress=address=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
export function validSecret(candidate,expected){if(typeof candidate!=='string'||typeof expected!=='string')return false;const a=Buffer.from(candidate),b=Buffer.from(expected);return a.length===b.length&&a.length>0&&timingSafeEqual(a,b);}
export function publicOrigin(value){if(!value)return null;const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('The public show address must be an HTTPS origin, e.g. https://live.example.org');return u.origin;}
export function authorizeUpgrade({path,origin,address,host,invite},config){
 if(!['/room','/performer'].includes(path))return false;
 const local=localAddress(address);
 if(config.publicOrigin&&!local&&config.proxyAddress&&!([config.proxyAddress,`::ffff:${config.proxyAddress}`].includes(address)))return false;
 if(path==='/performer')return local&&!origin&&validSecret(host,config.hostToken);
 if(!origin||!config.origins.includes(origin))return false;
 if(host!==null)return local&&validSecret(host,config.hostToken);
 return !config.publicOrigin||config.publicOpen===true||validSecret(invite,config.inviteToken);
}

export function publicRedirect({address,forwardedProto,url},config){
 if(!config.publicOrigin||localAddress(address)||forwardedProto?.split(',')[0].trim()!=='http')return null;
 const path=new URL(url,'http://localhost');return config.publicOrigin+path.pathname+path.search;
}
