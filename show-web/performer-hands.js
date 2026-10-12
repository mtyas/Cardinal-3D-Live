// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
const chains=[[1,2,3,4,5],[1,6,7,8,9,10],[1,11,12,13,14,15],[1,16,17,18,19,20],[1,21,22,23,24,25],[6,11,16,21]];
const edges=chains.flatMap(c=>c.slice(1).map((v,i)=>[c[i],v]));
export class PerformerHands {
 constructor(avatar){
  this.avatar=avatar;this.root=new THREE.Group();avatar.add(this.root);this.sides={};
  for(const side of ['left','right']){
   const group=new THREE.Group();this.root.add(group);
   const skin=new THREE.MeshStandardMaterial({color:'#a3e6ed',roughness:.5,emissive:'#347b89',emissiveIntensity:.2});
   const limb=()=>new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,1,8),skin);
   const upper=limb(),lower=limb();group.add(upper,lower);
   const palm=new THREE.Mesh(new THREE.BoxGeometry(.075,.045,.11),skin);group.add(palm);
   const joints=new THREE.InstancedMesh(new THREE.SphereGeometry(.009,6,4),skin,26);group.add(joints);
   const bones=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(new Float32Array(edges.length*6),3)),new THREE.LineBasicMaterial({color:'#c2f8ff'}));group.add(bones);
   group.visible=false;this.sides[side]={group,upper,lower,palm,joints,bones,wrist:new THREE.Vector3(),initialized:false};
  }
 }
 segment(mesh,a,b){mesh.position.copy(a).lerp(b,.5);mesh.scale.y=a.distanceTo(b);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());}
 update(state,dt){
  for(const side of ['left','right']){
   const s=this.sides[side],data=state[side];s.group.visible=Boolean(data);if(!data){s.initialized=false;continue;}
   const points=new Map((data.joints||[]).map(j=>[j.id,this.avatar.worldToLocal(new THREE.Vector3(...j.position))]));
   const target=data.source==='hand'?points.get(1):this.avatar.worldToLocal(new THREE.Vector3(...data.position));
   if(!target){s.group.visible=false;continue;}
   if(!s.initialized){s.wrist.copy(target);s.initialized=true;}else s.wrist.lerp(target,1-Math.exp(-22*dt));
   const shoulder=new THREE.Vector3(side==='left'?-.24:.24,-.28,0);
   const elbow=shoulder.clone().lerp(s.wrist,.52);elbow.y-=.16;elbow.x+=side==='left'?-.08:.08;
   this.segment(s.upper,shoulder,elbow);this.segment(s.lower,elbow,s.wrist);
   s.palm.position.copy(s.wrist);s.palm.visible=data.source==='controller';
   if(data.rotation){const world=new THREE.Quaternion(...data.rotation);s.palm.quaternion.copy(this.avatar.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));s.palm.scale.y=1-(data.grip||0)*.25;}
   s.joints.visible=s.bones.visible=data.source==='hand';
   if(data.source==='hand'){
    const matrix=new THREE.Matrix4();for(let i=0;i<26;i++){const point=points.get(i);matrix.makeScale(point?1:0,point?1:0,point?1:0);if(point)matrix.setPosition(point);s.joints.setMatrixAt(i,matrix);}s.joints.instanceMatrix.needsUpdate=true;
    const positions=s.bones.geometry.attributes.position;edges.forEach(([a,b],i)=>{const start=points.get(a)||s.wrist,end=points.get(b)||start;positions.setXYZ(i*2,...start.toArray());positions.setXYZ(i*2+1,...end.toArray());});positions.needsUpdate=true;s.bones.geometry.computeBoundingSphere();s.joints.computeBoundingSphere();
   }
  }
 }
}
