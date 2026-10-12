// SPDX-License-Identifier: GPL-3.0-or-later
// Ordered, immutable patches keep queued audio-synchronised scene frames intact.
export function scenePatch(previous,next,max=4096){
 const patches=[];
 function visit(a,b,path){
  if(Object.is(a,b))return;
  const objects=a!==null&&b!==null&&typeof a==='object'&&typeof b==='object';
  if(objects&&Array.isArray(a)===Array.isArray(b)&&(!Array.isArray(a)||a.length===b.length)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k))){
   for(const key of Object.keys(b))visit(a[key],b[key],[...path,Array.isArray(b)?Number(key):key]);
  }else patches.push([path,b]);
 }
 visit(previous,next,[]);return patches.length>max?null:patches;
}
export function applyScenePatch(previous,patches){
 if(!Array.isArray(patches)||patches.length>4096)throw Error('Invalid scene patch');
 let result=previous;
 const copies=new WeakMap(),created=new WeakSet();
 function copy(node){if(created.has(node))return node;if(copies.has(node))return copies.get(node);const clone=Array.isArray(node)?node.slice():{...node};copies.set(node,clone);created.add(clone);return clone;}
 for(const [path,value] of patches){
  if(!Array.isArray(path)||path.length>24||path.some(k=>!['string','number'].includes(typeof k)||['__proto__','prototype','constructor'].includes(k)))throw Error('Invalid patch path');
  function replace(node,depth){
   if(depth===path.length)return value;
   if(!node||typeof node!=='object'||!Object.hasOwn(node,path[depth]))throw Error('Scene baseline missing');
   const clone=copy(node);clone[path[depth]]=replace(node[path[depth]],depth+1);return clone;
  }
  result=replace(result,0);
 }
 return result;
}
