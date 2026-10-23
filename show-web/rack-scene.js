// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import {controlMesh,poseControl,cableMesh,caseMeshes,panelBody,cablePlugMeshes} from './rack-hardware.js';
export class RackScene {
 constructor(scene){this.scene=scene;this.root=new THREE.Group();scene.add(this.root);this.panels=new Map();this.textures=new Map();this.environment=new THREE.Group();scene.add(this.environment);this.environmentHash='';this.cables=new THREE.Group();this.root.add(this.cables);this.cableSignature='';this.caseSignature='';this.cases=new THREE.Group();this.root.add(this.cases);this.sun=new THREE.DirectionalLight('#ffe4bd',1);this.scene.add(this.sun);this.generation=0;this.needsUpdate=false;this.animating=new Set();}
 texture(hash){if(!hash)return null;if(!this.textures.has(hash)){const t=new THREE.TextureLoader().load('/show-assets/'+hash,undefined,undefined,()=>{setTimeout(()=>{if(this.textures.get(hash)===t){this.textures.delete(hash);t.dispose();this.needsUpdate=true;for(const panel of this.panels.values())if(panel.userData.hash===hash)panel.userData.hash='';}},1000);});t.colorSpace=THREE.SRGBColorSpace;this.textures.set(hash,t);}return this.textures.get(hash);}
 clear(){this.animating.clear();this.generation++;this.environmentHash='';this.dispose(this.root);this.dispose(this.environment);this.root.add(this.cables,this.cases);this.caseSignature="";this.panels.clear();for(const t of this.textures.values())t.dispose();this.textures.clear();this.cableSignature='';}
 dispose(group){for(const child of [...group.children]){child.traverse(n=>{this.animating.delete(n);n.geometry?.dispose();if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])m.dispose();});group.remove(child);}}
 update(v){if(!v)return;this.needsUpdate=false;const present=new Set();
  for(const p of v.panels){present.add(p.id);let g=this.panels.get(p.id);const identity=[p.name||'',p.width,p.height].join('/');if(g&&g.userData.identity!==identity){this.disposeMesh(g);this.panels.delete(p.id);g=null;}if(!g){g=new THREE.Group();g.matrixAutoUpdate=false;const body=panelBody(p);body.position.set(p.width/2,-p.height/2,-.0035);g.add(body);const face=new THREE.Mesh(new THREE.PlaneGeometry(p.width,p.height),new THREE.MeshBasicMaterial({color:'#b5bdc2',side:THREE.DoubleSide}));face.position.set(p.width/2,-p.height/2,.001);g.add(face);g.userData.identity=identity;g.userData.face=face;g.userData.controls=new Map();this.root.add(g);this.panels.set(p.id,g);}g.matrix.fromArray(p.matrix);g.matrixWorldNeedsUpdate=true;
   if(g.userData.hash!==p.texture){g.userData.hash=p.texture;g.userData.face.material.map=this.texture(p.texture);g.userData.face.material.color.set(p.texture?'#ffffff':'#b5bdc2');g.userData.face.material.needsUpdate=true;}
   const controls=new Set();
   for(const c of p.controls){const key=[c.kind,c.id,c.direction].join('/');controls.add(key);let m=g.userData.controls.get(key);
    const visible=c.visible!==false&&Number.isFinite(c.x)&&Number.isFinite(c.y);
    if(m)m.visible=visible;if(!visible)continue;
    if(!m){if(!['knob','light','meter','slider','port','switch'].includes(c.kind))continue;
    m=controlMesh(c);g.add(m);g.userData.controls.set(key,m);}
    m.userData.pickThrough=['light','meter'].includes(c.kind);
    m.userData.controlTarget=['knob','slider','switch','port'].includes(c.kind)?{module:p.id,parameter:c.id,kind:c.kind,port:c.id,direction:c.direction,momentary:c.momentary===true,min:c.min??0,max:c.max??1,value:c.normalized,label:(p.name||p.id)+' · '+(c.label||c.kind),descriptor:c}:null;
    const value=Number(c.normalized||0),old=m.userData.shown;
    m.userData.descriptor=c;m.userData.targetValue=value;
    if(old!==undefined&&['knob','slider'].includes(c.kind)&&!c.snap&&Math.abs(old-value)>.0001){
     poseControl(m,c,old);this.animating.add(m);
    }else{poseControl(m,c,value);this.animating.delete(m);}

   }
   for(const [key,m] of g.userData.controls)if(!controls.has(key)){this.disposeMesh(m);g.userData.controls.delete(key);}
  }
  for(const [id,g] of this.panels)if(!present.has(id)){this.dispose(g);g.removeFromParent();this.panels.delete(id);}
  const caseSignature=JSON.stringify(v.cases||[]);if(caseSignature!==this.caseSignature){this.caseSignature=caseSignature;this.dispose(this.cases);for(const c of v.cases||[])this.cases.add(caseMeshes(c));}
  const signature=JSON.stringify(v.cables);if(signature!==this.cableSignature){this.cableSignature=signature;this.dispose(this.cables);for(const c of v.cables)this.cables.add(cableMesh(c,false));if(v.cables.length)this.cables.add(cablePlugMeshes(v.cables));}
  if(v.environment&&this.environmentHash!==v.environment){this.environmentHash=v.environment;const generation=++this.generation;fetch('/show-assets/'+v.environment).then(r=>{if(!r.ok)throw Error('Scenery not uploaded yet');return r.json();}).then(groups=>{if(generation!==this.generation||!Array.isArray(groups)||groups.length>512)return;this.dispose(this.environment);let count=0;for(const s of groups){if(!Array.isArray(s.transforms)||s.transforms.length>4096||(count+=s.transforms.length)>10000)continue;let geometry;if(s.kind==='box')geometry=new THREE.BoxGeometry(...s.size);else if(s.kind==='cylinder')geometry=new THREE.CylinderGeometry(s.top,s.bottom,s.height,12);else if(s.kind==='sphere'){geometry=new THREE.SphereGeometry(s.radius,12,8);geometry.scale(1,s.height/(s.radius*2),1);}else continue;const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color:s.color,roughness:.92}),s.transforms.length);for(let i=0;i<s.transforms.length;i++){if(s.transforms[i].length!==16||!s.transforms[i].every(Number.isFinite))continue;mesh.setMatrixAt(i,new THREE.Matrix4().fromArray(s.transforms[i]));}mesh.instanceMatrix.needsUpdate=true;this.environment.add(mesh);}}).catch(()=>{if(generation===this.generation){this.environmentHash='';this.needsUpdate=true;}});}
  const day=Math.max(0,Math.sin((v.hour-6)/12*Math.PI));this.sun.intensity=.15+day*1.2;this.sun.position.set(Math.sin((v.hour-12)*Math.PI/12)*8,2+day*10,5);this.scene.background=new THREE.Color().setRGB(.015+day*.15,.02+day*.22,.04+day*.3);if(this.scene.fog)this.scene.fog.color.copy(this.scene.background);
 }
 hitControl(ray){
  for(const hit of ray.intersectObject(this.root,true)){
   let node=hit.object,visible=true,target=hit.object.userData.cableTargets?.[hit.instanceId]||null;
   while(node){if(!node.visible)visible=false;if(node.userData.controlTarget)target=node.userData.controlTarget;node=node.parent;}
   if(visible&&hit.object.userData.pickThrough)continue;
   if(visible)return target;
  }
  return null;
 }
 previewControl(target,value){
  const panel=this.panels.get(target.module);if(!panel)return;
  const m=panel.userData.controls.get([target.kind,target.parameter,''].join('/'));if(!m||!m.visible)return;
  const c=m.userData.controlTarget?.descriptor;if(!c)return;
  poseControl(m,c,value);

 }
 animate(dt){
  const fraction=1-Math.exp(-Math.min(.05,dt)/.035);
  for(const mesh of this.animating){
   if(!mesh.parent){this.animating.delete(mesh);continue;}
   const shown=mesh.userData.shown,target=mesh.userData.targetValue;
   const next=Math.abs(shown-target)<.0001?target:shown+(target-shown)*fraction;
   poseControl(mesh,mesh.userData.descriptor,next);
   if(next===target)this.animating.delete(mesh);
  }
 }
 disposeMesh(mesh){this.animating.delete(mesh);mesh.traverse(n=>{n.geometry?.dispose();if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])m.dispose();});mesh.removeFromParent();}
}
