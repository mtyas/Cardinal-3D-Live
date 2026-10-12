import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ShowHistory} from './show-history.mjs';
test('only public sessions enter durable history, with one record per performance and recovery on restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'show-history-'));let now=Date.now();const file=join(dir,'history.json');
 try{const history=new ShowHistory(file,()=>now);await history.load();history.update(false,'Private rehearsal');assert.equal(history.records.length,0);
 history.update(true,'Live music');now+=90000;history.update(true,'Live music');assert.equal(history.records.length,1);assert.equal(history.completed().length,0);history.update(false,'Live music');await history.pending;assert.equal(history.completed().length,1);
 const restored=new ShowHistory(file,()=>now);await restored.load();assert.equal(restored.completed()[0].title,'Live music');restored.update(true,'Another show');now+=30000;restored.update(true,'Another show');await restored.pending;
 const recovered=new ShowHistory(file,()=>now);await recovered.load();assert.equal(recovered.completed().length,2);assert.equal(recovered.completed()[0].interrupted,true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
