// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
const scale=.002;
const color=value=>/^#[a-f0-9]{6,8}$/i.test(value)?value.slice(0,7):'#596572';
export function panelBody(p){
 return new THREE.Mesh(new RoundedBoxGeometry(Math.max(.001,p.width-.0006),Math.max(.001,p.height-.0006),.008,1,.0008),new THREE.MeshStandardMaterial({color:'#79838b',metalness:.85,roughness:.45}));
}
export function controlMesh(c){
 const width=Math.max(.001,Number(c.width||12)*scale),height=Math.max(.001,Number(c.height||c.width||12)*scale);
 if(c.kind==='meter'){
  const uniforms={levels:{value:new THREE.Vector4()},holds:{value:new THREE.Vector2()},gap:{value:c.gap??.125},red:{value:c.red??.7937},peakColor:{value:new THREE.Color(...(c.peak_color||[.2,.5,.25]))},rmsColor:{value:new THREE.Color(...(c.rms_color||[.4,.95,.45]))}};
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:'varying vec2 uvMeter;void main(){uvMeter=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`varying vec2 uvMeter;uniform vec4 levels;uniform vec2 holds;uniform float gap;uniform float red;uniform vec3 peakColor;uniform vec3 rmsColor;
   void main(){float y=uvMeter.y;bool right=uvMeter.x>.5;float peak=right?levels.y:levels.x;float rms=right?levels.w:levels.z;float hold=right?holds.y:holds.x;bool bar=abs(uvMeter.x-.5)>gap*.5;vec3 color=vec3(.015);if(bar&&y<peak)color=peakColor;if(bar&&y<rms)color=rmsColor;if(bar&&y<peak&&y>red)color=mix(vec3(.9,.75,.1),vec3(1.,.1,.08),clamp((y-red)/max(.01,1.-red),0.,1.));if(bar&&hold>.001&&abs(y-hold)<.003)color=max(color,rmsColor);gl_FragColor=vec4(color,1.);}`,side:THREE.DoubleSide});
  return new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);
 }
 let geometry,depth;
 if(c.kind==='switch'){
  depth=.012;geometry=new RoundedBoxGeometry(width*.8,height*.8,depth,1,Math.min(.002,width*.1,height*.1));
 }else if(c.kind==='slider'){
  depth=.016;geometry=new RoundedBoxGeometry(Math.max(.002,Number(c.handle_width||c.width||12)*scale),Math.max(.002,Number(c.handle_height||6)*scale),depth,1,.001);
 }else{
  depth=c.kind==='knob'?.023:.004;
  const radius=Math.max(c.kind==='knob'?.005:.002,width/2*(c.kind==='light'?.65:1));
  geometry=new THREE.CylinderGeometry(radius,radius,depth,24);geometry.rotateX(Math.PI/2);
 }
 // Custom/composite switches keep their native painted face and get an exact-size hit volume.
 const surface=c.kind==='switch'&&c.physical===false;
 const material=new THREE.MeshStandardMaterial({color:c.kind==='port'?'#252a30':color(c.body_color),metalness:c.kind==='port'?.8:.1,roughness:.38,colorWrite:!surface,depthWrite:!surface});
 const mesh=new THREE.Mesh(geometry,material);mesh.userData.surface=surface;mesh.userData.depth=depth;
 if(c.kind==='knob'){
  const radius=width/2,mark=new THREE.Mesh(new THREE.BoxGeometry(radius*.16,radius*.57,.002),new THREE.MeshBasicMaterial({color:new THREE.Color(material.color).getHSL({}).l>.5?'#111820':'#ffffff'}));
  mark.position.set(0,radius*.58,depth/2+.002);mesh.add(mark);
 }
 if(surface){
  const indicator=new THREE.Mesh(new THREE.BoxGeometry(width*.55,.0015,.001),new THREE.MeshBasicMaterial({color:'#83e7ff'}));indicator.position.set(0,-height*.42,.008);indicator.visible=false;mesh.add(indicator);mesh.userData.indicator=indicator;
 }
 return mesh;
}
export function poseControl(mesh,c,value){
 const x=Number(c.x)*scale,y=-Number(c.y)*scale;
 mesh.position.set(x,y,c.kind==='knob'?.014:c.kind==='switch'?.014:.008);mesh.rotation.set(0,0,0);
 if(c.kind==='meter'){const v=c.levels||[0,0,0,0,0,0];mesh.material.uniforms.levels.value.fromArray(v);mesh.material.uniforms.holds.value.set(v[4],v[5]);}
 if(c.kind==='knob')mesh.rotation.z=-((c.min_angle??-2.6)+value*((c.max_angle??2.6)-(c.min_angle??-2.6)));
 else if(c.kind==='slider')mesh.position.set(((c.start_x??c.x)*(1-value)+(c.end_x??c.x)*value)*scale,-((c.start_y??c.y)*(1-value)+(c.end_y??c.y)*value)*scale,.014);
 else if(c.kind==='switch'){
  if(c.momentary)mesh.position.z=value>0?.009:.014;else mesh.rotation.x=-.3+.6*value;
  if(mesh.userData.indicator)mesh.userData.indicator.visible=value>0;
 }
 if(c.kind==='light'){
  mesh.material.color.setRGB(Number(c.emission_r??1),Number(c.emission_g??.2),Number(c.emission_b??.1));mesh.material.emissive.copy(mesh.material.color);mesh.material.emissiveIntensity=Number(c.brightness||0);
 }
 mesh.userData.shown=value;
}
export function cableMesh(c,withPlugs=true){
 const a=new THREE.Vector3().fromArray(c.a),b=new THREE.Vector3().fromArray(c.b);
 const na=new THREE.Vector3().fromArray(c.normal_a||[0,0,1]).normalize(),nb=new THREE.Vector3().fromArray(c.normal_b||[0,0,1]).normalize();
 const length=a.distanceTo(b),reach=Math.min(.24,Math.max(.05,length*.35)),sag=Math.min(.2,length*.3);
 const curve=new THREE.CubicBezierCurve3(a,a.clone().addScaledVector(na,reach).add(new THREE.Vector3(0,-sag,0)),b.clone().addScaledVector(nb,reach).add(new THREE.Vector3(0,-sag,0)),b);
 const group=new THREE.Group();group.userData.controlTarget={kind:'cable',...c};
 const material=new THREE.MeshStandardMaterial({color:color(c.color),roughness:.32});
 const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(24,Math.min(64,Math.ceil(length/.025))),.003,12,false),material);group.add(tube);
 if(!withPlugs)return group;
 const metal=new THREE.MeshStandardMaterial({color:'#bbc3ca',metalness:.95,roughness:.2});
 for(const [point,normal] of [[a,na],[b,nb]]){
  const plug=new THREE.Group();plug.position.copy(point);plug.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),normal);
  const sleeve=new THREE.Mesh(new THREE.CylinderGeometry(.0052,.0052,.012,16),metal);sleeve.position.y=.003;plug.add(sleeve);
  const boot=new THREE.Mesh(new THREE.CylinderGeometry(.005,.006,.018,16),material);boot.position.y=.016;plug.add(boot);group.add(plug);
 }
 return group;
}
// Two instanced draw calls for every cable's sleeves/boots, rather than four per cable.
export function cablePlugMeshes(cables){
 const group=new THREE.Group(),count=cables.length*2;if(!count)return group;
 const specs=[{radius:.0052,bottom:.0052,height:.012,offset:.003,metallic:.95},{radius:.005,bottom:.006,height:.018,offset:.016,metallic:0}];
 for(const spec of specs){
  const mesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(spec.radius,spec.bottom,spec.height,16),new THREE.MeshStandardMaterial({color:spec.metallic?'#bbc3ca':'#ffffff',metalness:spec.metallic,roughness:.32}),count);
  mesh.userData.cableTargets=[];
  let index=0;
  for(const c of cables)for(const [point,normal] of [[c.a,c.normal_a||[0,0,1]],[c.b,c.normal_b||[0,0,1]]]){
   const direction=new THREE.Vector3().fromArray(normal).normalize(),position=new THREE.Vector3().fromArray(point).addScaledVector(direction,spec.offset);
   mesh.setMatrixAt(index,new THREE.Matrix4().compose(position,new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction),new THREE.Vector3(1,1,1)));
   if(!spec.metallic)mesh.setColorAt(index,new THREE.Color(color(c.color)));
   mesh.userData.cableTargets.push({kind:'cable',...c});index++;
  }
  mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);
 }
 return group;
}
export function caseMeshes(c){
 const group=new THREE.Group();group.matrixAutoUpdate=false;group.matrix.fromArray(c.matrix);
 if(c.parts){
  for(const part of c.parts){
   let geometry;
   if(part.kind==='box')geometry=new RoundedBoxGeometry(...part.size,1,Math.min(part.bevel||.001,Math.min(...part.size)*.4));
   else geometry=new THREE.CylinderGeometry(part.top??part.radius,part.radius,part.height,16);
   const material=new THREE.MeshStandardMaterial({color:color(part.color),metalness:part.metallic??.5,roughness:part.roughness??.4});
   const mesh=new THREE.InstancedMesh(geometry,material,part.transforms.length);
   for(let i=0;i<part.transforms.length;i++)mesh.setMatrixAt(i,new THREE.Matrix4().fromArray(part.transforms[i]));
   mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);
  }
 }else{
  // Backwards compatibility for 0.5 publishers which only export bounds.
  const [x,y,w,h]=c.bounds;
  for(const [sx,sy,px,py]of [[w,.024,x+w/2,y],[w,.024,x+w/2,y-h],[.035,h,x,y-h/2],[.035,h,x+w,y-h/2]]){
   const rail=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,.09),new THREE.MeshStandardMaterial({color:'#454d56',metalness:.7,roughness:.4}));rail.position.set(px,py,-.045);group.add(rail);
  }
 }
 return group;
}
