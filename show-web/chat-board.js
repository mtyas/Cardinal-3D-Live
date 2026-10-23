// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
export function boardLines(values,chat,title=''){
 const columns=Math.max(2,Math.min(150,Math.floor((values[0]-.2)/(values[2]*.6)))),budget=Math.max(3,Math.min(82,Math.floor((values[1]-.2)/(values[2]*1.3)))),lines=[];
 const wrap=text=>{const chars=Array.from(text),rows=[];while(chars.length>columns)rows.push(chars.splice(0,columns).join(''));rows.push(chars.join(''));return rows;};
 const heading=wrap(title||'MAIN CHAT').slice(0,budget-2);
 for(const m of chat.slice(-40))lines.push(...wrap(m.name+': '+m.text));
 return [...heading,'',...lines.slice(-(budget-heading.length-1))];
}
export class ChatBoards {
 constructor(scene){this.scene=scene;this.boards=new Map();}
 update(items,chat,title=''){
  const present=new Set();for(const item of items){present.add(item.id);let board=this.boards.get(item.id);
   if(!board){const root=new THREE.Group(),canvas=document.createElement('canvas');canvas.width=2048;canvas.height=2048;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const back=new THREE.Mesh(new THREE.BoxGeometry(1,1,.06),new THREE.MeshBasicMaterial());const text=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide}));text.position.z=.034;root.add(back,text);this.scene.add(root);board={root,canvas,texture,back,text,signature:''};this.boards.set(item.id,board);}
   const v=item.values;board.root.position.set(v[9],v[10],v[11]);board.root.rotation.y=v[12]*Math.PI/180;board.root.visible=v[13]>.5;board.back.scale.set(v[0],v[1],1);board.text.scale.set(v[0],v[1],1);board.back.material.color.setRGB(v[6],v[7],v[8]);
   const lines=boardLines(v,chat,title),signature=JSON.stringify([v.slice(0,9),lines]);if(signature===board.signature)continue;board.signature=signature;
   const ctx=board.canvas.getContext('2d');ctx.clearRect(0,0,2048,2048);ctx.fillStyle=new THREE.Color(v[3],v[4],v[5]).getStyle();const font=v[2]/v[1]*2048;ctx.font=`${font}px system-ui`;ctx.textBaseline='top';
   lines.forEach((line,i)=>ctx.fillText(line,.1/v[0]*2048,.1/v[1]*2048+i*font*1.3));board.texture.needsUpdate=true;
  }
  for(const [id,b] of this.boards)if(!present.has(id)){b.root.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});b.texture.dispose();b.root.removeFromParent();this.boards.delete(id);}
 }
 clear(){this.update([],[]);}
}
