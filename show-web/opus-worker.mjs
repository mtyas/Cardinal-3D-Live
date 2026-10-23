// SPDX-License-Identifier: GPL-3.0-or-later
import {parentPort} from 'node:worker_threads';
import {ShowEncoder} from './opus-encoder.mjs';
const encoder=new ShowEncoder();
parentPort.on('message',m=>{
 try{
  if(m.type==='reset')encoder.reset();
  else if(m.type==='retain')encoder.retain(m.ids);
  else if(m.type==='audio')for(const block of encoder.encode(Buffer.from(m.bytes),m.cap,m.qualities))parentPort.postMessage(block);
 }catch(error){encoder.reset();parentPort.postMessage({error:error.message});}
 finally{if(m.type==='audio')parentPort.postMessage({done:true});}
});
