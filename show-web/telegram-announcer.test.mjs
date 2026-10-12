import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {TelegramAnnouncer,channelLink} from './telegram-announcer.mjs';

const publicShow={live:true,publicOpen:true,showId:'show-1',profile:{title:'A live performance'}};
async function fixture(t,fetcher){
 const directory=await mkdtemp(join(tmpdir(),'cardinal-announcements-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 await writeFile(join(directory,'telegram.json'),JSON.stringify({channel:'@examplelive',botToken:'test-token'}));
 const announcer=new TelegramAnnouncer(directory,{fetcher});await announcer.load();return {directory,announcer};
}
test('a public show posts once, including after service restart; private rehearsals never post',async t=>{
 const messages=[];const fetcher=async(url,options)=>{messages.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,result:{message_id:123}})};};
 const {directory,announcer}=await fixture(t,fetcher);
 await announcer.observe({...publicShow,publicOpen:false});assert.equal(messages.length,0);
 await announcer.observe(publicShow);await announcer.observe(publicShow);assert.equal(messages.length,1);
 assert.equal(messages[0].chat_id,'@examplelive');assert.match(messages[0].text,/https:\/\/live.example.org\//);
 const restarted=new TelegramAnnouncer(directory,{fetcher});await restarted.load();await restarted.recover();await restarted.observe(publicShow);assert.equal(messages.length,1);
 await restarted.observe({...publicShow,showId:'show-2'});assert.equal(messages.length,2);
 assert.equal((await restarted.publicSettings()).url,'https://t.me/examplelive');
 assert.ok(!JSON.stringify(await restarted.publicSettings()).includes('test-token'));
});
test('an uncertain delivery is not retried, and a crash during send does not duplicate a post',async t=>{
 let calls=0;const {directory,announcer}=await fixture(t,async()=>{calls++;throw Error('offline');});
 await announcer.observe(publicShow);await announcer.observe(publicShow);assert.equal(calls,1);
 assert.equal(JSON.parse(await readFile(join(directory,'announcements.json'),'utf8')).events[0].status,'uncertain');
 await writeFile(join(directory,'announcements.json'),JSON.stringify({events:[{id:'show-1',status:'sending',attempts:1}]}));
 const restarted=new TelegramAnnouncer(directory,{fetcher:async()=>{throw Error('must not send');}});
 await restarted.load();await restarted.recover();await restarted.observe(publicShow);
 assert.equal(restarted.state.events[0].status,'uncertain');
});
test('Telegram rate limits retry after the stated delay, without repeated polling posts',async t=>{
 let calls=0,time=1000;
 const {announcer}=await fixture(t,async()=>{calls++;return calls===1?{ok:false,json:async()=>({ok:false,error_code:429,parameters:{retry_after:60}})}:{ok:true,json:async()=>({ok:true,result:{message_id:1}})};});
 announcer.now=()=>time;await announcer.observe(publicShow);await announcer.observe(publicShow);assert.equal(calls,1);
 time+=61000;await announcer.observe(publicShow);await announcer.observe(publicShow);assert.equal(calls,2);
 assert.equal(announcer.state.events[0].status,'sent');
});
test('channel links cannot inject another URL',()=>{assert.equal(channelLink({channel:'@examplelive'}),'https://t.me/examplelive');assert.equal(channelLink({channel:'https://evil.test'}),null);});
