// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
export function surface(kind,color,metalness=0,roughness=.8){
 const base=new THREE.Color(color),bytes=new Uint8Array(64*64*4);
 for(let y=0;y<64;y++)for(let x=0;x<64;x++){const noise=((x*73+y*151+x*y*17)%97)/97;let shade=.82+noise*.3;
 if(kind==='grille')shade=x%4<2&&y%4<2?.35:.95;else if(kind==='stone')shade=y%16===0||(x+(Math.floor(y/16)%2?8:0))%16===0?.45:.78+noise*.35;else if(kind==='metal')shade=.85+(y%4)*.035+noise*.06;
 const i=(y*64+x)*4;bytes[i]=Math.min(255,Math.round(base.r*shade*255));bytes[i+1]=Math.min(255,Math.round(base.g*shade*255));bytes[i+2]=Math.min(255,Math.round(base.b*shade*255));bytes[i+3]=255;}
 const map=new THREE.DataTexture(bytes,64,64);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
 return new THREE.MeshStandardMaterial({map,metalness,roughness});
}
export function speaker(){
 const root=new THREE.Group(),cabinet=surface('grain','#263747',.1,.9),grille=surface('grille','#48515a',.55,.55),metal=surface('metal','#8b969e',.8,.3);
 const mesh=(g,m,p)=>{const n=new THREE.Mesh(g,m);n.position.fromArray(p);root.add(n);return n;};
 mesh(new THREE.BoxGeometry(.45,.7,.3),cabinet,[0,0,0]);mesh(new THREE.BoxGeometry(.39,.63,.009),grille,[0,0,-.155]);
 for(const y of [-.17,.16]){const cone=mesh(new THREE.CylinderGeometry(.105,.105,.014,24),cabinet,[0,y,-.163]);cone.rotation.x=Math.PI/2;mesh(new THREE.TorusGeometry(.114,.006,6,24),metal,[0,y,-.17]);}
 for(const x of [-.175,.175])for(const y of [-.28,.28])mesh(new THREE.SphereGeometry(.009,6,4),metal,[x,y,-.165]);
 for(const x of [-.23,.23])mesh(new THREE.BoxGeometry(.008,.13,.04),metal,[x,0,0]);mesh(new THREE.BoxGeometry(.10,.014,.004),new THREE.MeshStandardMaterial({color:'#65e7ff',emissive:'#65e7ff',emissiveIntensity:.6}),[0,-.29,-.168]);return root;
}
export function disposeStage(root){const mats=new Set();root.traverse(n=>{n.geometry?.dispose();if(n.material)mats.add(n.material);});for(const m of mats){m.map?.dispose();m.dispose();}root.removeFromParent();}
