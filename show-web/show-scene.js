// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import { ShowObjects } from './show-objects.js';
import {speaker,disposeStage} from './stage-materials.js';
import {ChatBoards} from './chat-board.js';
import { RackScene } from './rack-scene.js';
export class ShowScene {
  speakers = new Map(); lights = new Map(); queue = []; latest = null; lastVisuals = null;
  constructor(scene, audio) { this.scene = scene; this.audio = audio; this.chat=[];this.boards=new ChatBoards(scene);this.rack=new RackScene(scene); this.objects=new ShowObjects(scene); }
  receive(data) {
    if (!data) { this.clear(); return; }
    this.audio.configure(data);
    if (this.latest && (data.frame < this.latest.frame || data.sample_rate !== this.latest.sample_rate)) this.queue = [];
    this.latest = data;
    if (this.queue.at(-1)?.frame !== data.frame) this.queue.push(data);
    // Retain visual history for the audio worklet's bounded recovery window.
    while (this.queue.length > 80) this.queue.shift();
  }
  clear() {
    for (const m of this.speakers.values()) { disposeStage(m); }
    for (const l of this.lights.values()) { l.traverse(n=>{n.geometry?.dispose();n.material?.dispose();}); l.target.removeFromParent(); l.removeFromParent(); l.dispose(); }
    this.boards.clear();this.rack.clear(); this.objects.clear();
    this.speakers.clear(); this.lights.clear(); this.queue = []; this.latest = null; this.displayed=null;this.lastVisuals = null; this.audio.reset();
  }
  update() {
    if (!this.latest) return;
    const frame = this.audio.frame(this.latest.sample_rate);
    // Show live state while sound is buffering, but preserve history so lights
    // can synchronize immediately when delayed playback starts or recovers.
    while (this.queue.length > 1 && frame !== null && this.queue[1].frame <= frame) this.queue.shift();
    const state = frame===null?this.latest:(this.queue[0] || this.latest);this.displayed=state;
    this.boards.update(state.boards||[],this.chat,state.session_title||'');
    if(state.visuals!==this.lastVisuals||this.rack.needsUpdate){this.rack.update(state.visuals);this.lastVisuals=state.visuals;}
    this.objects.update(state.objects||[],frame===null?0:(frame-state.frame)/state.sample_rate);
    const ids = new Set();
    for (const s of state.speakers) {
      ids.add(s.id); let m = this.speakers.get(s.id);
      if (!m) { m = speaker(); this.scene.add(m); this.speakers.set(s.id,m); }
      m.position.fromArray(s.position); m.rotation.y = s.yaw * Math.PI / 180;
    }
    for (const [id,m] of this.speakers) if (!ids.has(id)) { disposeStage(m); this.speakers.delete(id); }
    ids.clear();
    for (const s of state.lights) {
      ids.add(s.id); let l = this.lights.get(s.id);
      if (!l) { l = new THREE.SpotLight('#ffffff',0,30,.5,.7); this.scene.add(l,l.target); this.lights.set(s.id,l);
       const body=new THREE.Mesh(new THREE.CylinderGeometry(.16,.19,.32,16),new THREE.MeshStandardMaterial({color:'#202735',metalness:.7,roughness:.3}));body.rotation.x=Math.PI/2;l.add(body);
       const lens=new THREE.Mesh(new THREE.CircleGeometry(.14,20),new THREE.MeshBasicMaterial({color:'#ffffff',side:THREE.DoubleSide}));lens.position.z=-.17;l.add(lens);l.userData.lens=lens;
       }
      const [brightness,r,g,b,width,x,y,z,yaw] = s.values;
      l.color.setRGB(r,g,b); l.intensity = brightness * 30; l.angle = Math.min(Math.PI/2-.01,width*Math.PI/360);
      l.position.set(x,y,z); l.userData.lens.material.color.copy(l.color); l.rotation.set(-Math.PI/4,yaw*Math.PI/180+Math.PI,0); l.target.position.set(x+Math.sin(yaw*Math.PI/180)*2,y-2,z+Math.cos(yaw*Math.PI/180)*2);
    }
    for (const [id,l] of this.lights) if (!ids.has(id)) { l.traverse(n=>{n.geometry?.dispose();n.material?.dispose();}); l.target.removeFromParent(); l.removeFromParent(); l.dispose(); this.lights.delete(id); }
  }
}
