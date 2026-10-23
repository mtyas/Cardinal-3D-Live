// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from 'three';
import { VRButton } from '/vendor/VRButton.js';
import { appearancePixels } from '/appearance.js';
import { ShowAudio } from '/show-audio.js';
import {RtcAudio} from './rtc-audio.js';
import { ShowScene } from '/show-scene.js';
import { PerformerHands } from '/performer-hands.js';
import {applyScenePatch} from '/scene-delta.js';
import {TouchNavigation} from '/touch-navigation.js';
import {VisitorHud} from '/visitor-hud.js';
import {RemoteControls} from '/remote-controls.js';
import {RoomInterface} from './room-interface.js';

const $ = id => document.getElementById(id);
const touchDevice=matchMedia('(pointer:coarse)').matches;
let lowData=touchDevice||Boolean(navigator.connection?.saveData);
try{const saved=localStorage.getItem('cardinal-show-low-data');if(saved!==null)lowData=saved==='true';}catch{}
$('data-saver').checked=lowData;
try {
  const identity = JSON.parse(localStorage.getItem('cardinal-show-identity') || '{}');
  if (typeof identity.name === 'string') $('name').value = identity.name.slice(0, 32);
  if (/^#[0-9a-f]{6}$/i.test(identity.color)) $('color').value = identity.color;
  if (/^#[0-9a-f]{6}$/i.test(identity.color2)) $('color2').value = identity.color2;
  if (['solid', 'gradient', 'noise', 'marble'].includes(identity.pattern)) $('pattern').value = identity.pattern;
} catch {}
function drawAppearancePreview(identity) {
  const pixels = appearancePixels(identity.pattern, identity.color, identity.color2, 128);
  for (const id of ['look-preview', 'profile-preview']) $(id).getContext('2d').putImageData(new ImageData(pixels, 128, 128), 0, 0);
}
function formLook(prefix = '') {
  return { color: $(prefix + 'color').value, color2: $(prefix + 'color2').value, pattern: $(prefix + 'pattern').value };
}
for (const prefix of ['', 'profile-']) for (const field of ['color', 'color2', 'pattern']) {
  $(prefix + field).addEventListener('input', () => drawAppearancePreview(formLook(prefix)));
}
drawAppearancePreview(formLook());
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio,lowData?1:1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);
const vrButton = VRButton.createButton(renderer, { optionalFeatures: ['local-floor', 'bounded-floor'] });
$('vr-entry').appendChild(vrButton);
vrButton.hidden = true;
const scene = new THREE.Scene();
const showAudio = new ShowAudio(), showScene = new ShowScene(scene, showAudio);
const rtcAudio=new RtcAudio({audio:showAudio,send});showAudio.rtc=rtcAudio;
rtcAudio.onActive=active=>{roomInterface.sound(showAudio.ready,active,liveShow,showAudio.volume===0);send({type:'audio_codec',codec:active?'off':showAudio.ready?showAudio.codec:'off'});$('audio-buffering').disabled=active;};
showAudio.onTransportPreference=()=>rtcAudio.update();
try{$('audio-route').value=localStorage.getItem('cardinal-show-audio-route')||'auto';}catch{}
rtcAudio.mode=$('audio-route').value;
$('audio-route').onchange=()=>{const mode=$('audio-route').value;try{localStorage.setItem('cardinal-show-audio-route',mode);}catch{}rtcAudio.setMode(mode);};
showAudio.setLowData(lowData);
try{$('audio-buffering').value=localStorage.getItem('cardinal-show-buffering')||'adaptive';}catch{}
showAudio.setBuffering($('audio-buffering').value);
$('audio-buffering').onchange=()=>{const mode=$('audio-buffering').value;try{localStorage.setItem('cardinal-show-buffering',mode);}catch{}showAudio.setBuffering(mode);};
showAudio.onCodecFallback=async()=>{try{await showAudio.enable(true);send({type:'audio_codec',codec:showAudio.rtcActive?'off':'opus'});$('enable-audio').textContent='Sound enabled';roomInterface.sound(true,showAudio.rtcActive,liveShow,showAudio.volume===0);visitorHud.setAudio('Spatial sound enabled');}catch{send({type:'audio_codec',codec:'off'});visitorHud.setAudio('Retry spatial sound');}};
let liveShow = false;
let enablingAudio=false;
async function enableAudio(){
 if(enablingAudio)return;enablingAudio=true;
 try { await showAudio.enable(); send({type:'audio_codec',codec:showAudio.rtcActive?'off':showAudio.codec}); if (showScene.latest) showAudio.configure(showScene.latest);rtcAudio.update(); $('enable-audio').textContent='Sound enabled';roomInterface.sound(true,showAudio.rtcActive,liveShow,showAudio.volume===0);visitorHud.setAudio('Spatial sound enabled'); }
 catch { $('enable-audio').textContent='Try enabling sound again';visitorHud.setAudio('Retry spatial sound'); }
 finally{enablingAudio=false;}
}
$('enable-audio').onclick=enableAudio;
$('name').addEventListener('keydown',event=>{if(event.key==='Enter'&&!$('join').disabled){event.preventDefault();$('join').click();}});
try { $('audio-quality').value = localStorage.getItem('cardinal-show-audio-quality') || 'auto'; } catch {}
$('audio-quality').onchange = () => {
  try { localStorage.setItem('cardinal-show-audio-quality', $('audio-quality').value); } catch {}
  send({type:'audio_quality',quality:$('audio-quality').value});
  send({type:'audio_codec',codec:showAudio.rtcActive?'off':showAudio.ready?showAudio.codec:'off'});
  visitorHud.setQuality($('audio-quality').selectedOptions[0].textContent);
};
$('data-saver').onchange=()=>{lowData=$('data-saver').checked;try{localStorage.setItem('cardinal-show-low-data',String(lowData));}catch{}renderer.setPixelRatio(Math.min(devicePixelRatio,lowData?1:1.5));showAudio.setLowData(lowData);send({type:'client_features',delta:true,lowData});};
scene.background = new THREE.Color('#080d18');
scene.fog = new THREE.Fog('#080d18', 45, 180);
const rig = new THREE.Group(); scene.add(rig);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.05, 300);
camera.position.set(0, 1.65, 0); rig.position.z = 4; rig.add(camera);
const decorations=new THREE.Group();scene.add(decorations);
scene.add(new THREE.HemisphereLight('#9fcfff', '#1a1425', 2));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#121c2b', roughness: 0.85 }));
floor.rotation.x = -Math.PI / 2; decorations.add(floor);
const grid = new THREE.GridHelper(40, 40, '#3f6572', '#253645'); decorations.add(grid);
const stage = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 0.25, 48), new THREE.MeshStandardMaterial({ color: '#253649' }));
stage.position.set(0, 0.12, -3); decorations.add(stage);
for (const x of [-3.2, 3.2]) {
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.25, 0.55), new THREE.MeshStandardMaterial({ color: '#233244' }));
  box.position.set(x, 0.85, -3); decorations.add(box);
  for (const y of [0.58, 1.07]) {
    const cone = new THREE.Mesh(new THREE.CircleGeometry(0.19, 24), new THREE.MeshStandardMaterial({ color: '#72b8c5', metalness: 0.6, roughness: 0.3 }));
    cone.position.set(x, y, -2.717); decorations.add(cone);
  }
  const light = new THREE.SpotLight(x < 0 ? '#74e6ff' : '#f282cf', 25, 15, 0.5, 0.7);
  light.position.set(x, 4, -2); light.target.position.set(0, 0, -3); decorations.add(light, light.target);
}
let socket, myId, joined = false, members = new Map(), history = [], historyKnown = false, yaw = 0, pitch = 0;
let networkState=null,networkRevision=0;
let serverOffset = 0, myReaction = null, reactionReadyAt = 0, reactionCaption = '';
const reactions = [{kind:'glow',label:'Glow'}, {kind:'sparkles',label:'Sparkles'}, {kind:'shake',label:'Shake'}, {kind:'grow',label:'Grow'}];
const keys = new Set(), clock = new THREE.Clock();
const roomInterface=new RoomInterface({onPanelChange:()=>{keys.clear();touchNavigation.reset();}});
let previousVolume=1;
function listeningVolume(value){showAudio.setVolume(value);$('listening-volume').value=String(value);if(value>0)previousVolume=value;roomInterface.sound(showAudio.ready,showAudio.rtcActive,liveShow,value===0);}
$('listening-volume').oninput=()=>listeningVolume(Number($('listening-volume').value));
$('mute-audio').onclick=()=>listeningVolume(showAudio.volume===0?previousVolume:0);
$('quick-audio').onclick=()=>showAudio.ready?roomInterface.open('sound',$('quick-audio')):enableAudio();
const worldPosition = new THREE.Vector3(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler(0, 0, 0, 'YXZ');
function send(data) { if (socket?.readyState !== WebSocket.OPEN)return false;if(data.type?.startsWith('control_')&&rtcAudio.sendControl(data))return true;if(socket.bufferedAmount>=65536)return false;socket.send(JSON.stringify(data));return true; }
function react(kind) { if (joined && Date.now() - serverOffset >= reactionReadyAt) send({ type: 'reaction', kind }); }
for (const item of reactions) $('react-' + item.kind).onclick = () => react(item.kind);
function updateIdentity(name, color, color2, pattern) {
  const identity = { name: name.trim().slice(0, 32) || 'Visitor', color, color2, pattern };
  send({ type: 'identity', ...identity });
  $('profile-name').value = identity.name; $('profile-color').value = identity.color;
  $('profile-color2').value = identity.color2; $('profile-pattern').value = identity.pattern;
  drawAppearancePreview(identity);
  try { localStorage.setItem('cardinal-show-identity', JSON.stringify(identity)); } catch {}
}
function label(text) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#102035'; ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = '32px system-ui'; ctx.fillText(text.slice(0, 32), 256, 61, 480);
  const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false });
  const sprite = new THREE.Sprite(material); sprite.scale.set(1.2, 0.225, 1); return sprite;
}
function createAvatar(member) {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: member.color, emissive: member.color, emissiveIntensity: 0.8, roughness: 0.4 });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(member.role === 'performer' ? 0.15 : 0.13, 16, 12), mat); root.add(sphere);
  if (member.role === 'performer') {
    root.userData.trackedHands=new PerformerHands(root);
    mat.emissiveIntensity=.08;mat.roughness=.75;
    const accent=new THREE.MeshStandardMaterial({color:'#142132',roughness:.65});
    const visor=new THREE.Mesh(new THREE.SphereGeometry(.125,20,12,0,Math.PI),new THREE.MeshStandardMaterial({color:'#10253c',metalness:.8,roughness:.2}));visor.scale.set(1,.6,1);visor.position.z=.045;root.add(visor);
    const collar=new THREE.Mesh(new THREE.TorusGeometry(.11,.025,8,20),accent);collar.rotation.x=Math.PI/2;collar.position.y=-.19;root.add(collar);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.35, 4, 12), mat); torso.position.y = -0.45; root.add(torso);
    for (const x of [-0.3, 0.3]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.38, 4, 8), mat); arm.position.set(x, -0.4, 0); root.add(arm);
      const hand=new THREE.Mesh(new THREE.SphereGeometry(.065,12,8),accent);hand.position.y=-.25;arm.add(hand);
      root.userData.arms ||= []; root.userData.arms.push(arm);
    }
    for (const x of [-.11,.11]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.065,.5,4,8),mat); leg.position.set(x,-1.02,0); root.add(leg);
      const boot=new THREE.Mesh(new THREE.BoxGeometry(.14,.10,.25),accent);boot.position.set(x,-1.35,.06);root.add(boot);
    }
  } else {
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: member.color, transparent: true, opacity: 0.13, depthWrite: false })); root.add(halo);
  }
  const title = label(member.name); title.position.y = 0.42; root.add(title);
  root.userData.title = title; root.userData.name = member.name; root.userData.role = member.role;
  root.userData.skin = mat;
  const body = new THREE.Group();
  for (const child of [...root.children]) if (child.isMesh) body.add(child);
  root.add(body); root.userData.body = body;
  applyAppearance(root, member);
  scene.add(root); return root;
}
function skinTexture(identity) {
  const texture = new THREE.DataTexture(appearancePixels(identity.pattern, identity.color, identity.color2 || '#bd83ff'), 128, 128);
  texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true; return texture;
}
function applyAppearance(object, member) {
  const signature = [member.color, member.color2, member.pattern].join(':');
  if (object.userData.appearance === signature) return;
  object.userData.appearance = signature;
  object.userData.primaryColor = member.color;
  object.userData.particles?.material.color.set(member.color);
  const mat = object.userData.skin;
  if(member.role==='performer'){mat.color.set(member.color);mat.emissive.set(member.color);mat.emissiveIntensity=.08;return;}
  mat.map?.dispose(); mat.map = skinTexture(member); mat.emissiveMap = mat.map;
  mat.color.set('#ffffff'); mat.emissive.set('#ffffff'); mat.emissiveIntensity = 0.7; mat.needsUpdate = true;
  object.traverse(n => { if (n.isMesh && n.material !== mat) n.material.color.set(member.color); });
}
function disposeObject(root) {
  root.traverse(node => {
    node.geometry?.dispose();
    for (const mat of node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : []) { mat.map?.dispose(); mat.dispose(); }
  });
  root.removeFromParent();
}
function updateRoom(data) {
  serverOffset = Date.now() - data.serverTime;
  liveShow = Boolean(data.nativeConnected); showScene.chat=data.chat||[];showScene.receive(data.show);
  const qualityCap = data.show?.max_audio_kbps || 128;
  for (const option of $('audio-quality').options) option.disabled = option.value !== 'auto' && Number(option.value) > qualityCap;
  $('status').textContent = liveShow ? 'Live performance' : 'Waiting for the host';
  roomInterface.role(Boolean(remoteControls.client.permission));visitorHud.setRole(Boolean(remoteControls.client.permission));roomInterface.sound(showAudio.ready,showAudio.rtcActive,liveShow,showAudio.volume===0);
  const people=data.members.filter(m=>m.role!=='performer').length;const count=`${people} ${people===1?'listener':'listeners'} in the room`;if($('room-count').textContent!==count)$('room-count').textContent=count;
  $('audio-transport').textContent = liveShow ? (!showAudio.ready?'Sound off · enable spatial sound to listen.':(showAudio.rtcActive?rtcAudio.playbackStatus():`Compressed audio · ${showAudio.receivedQuality||'waiting for'} kb/s per speaker · ${showAudio.playbackStatus()}${rtcAudio.status?' · '+rtcAudio.status:''}`)) : 'Waiting for performer audio.';
  const active = new Set();
  for (const member of data.members) {
    if (member.id === myId) {
      myReaction = member.reaction || null;
      if (myReaction) reactionReadyAt = myReaction.startedAt + 3500;
      continue;
    }
    active.add(member.id);
    let object = members.get(member.id);
    if (object && object.userData.role !== member.role) { disposeObject(object); object = null; }
    if (!object) { object = createAvatar(member); members.set(member.id, object); }
    object.userData.target = new THREE.Vector3(...member.position); object.userData.yaw = member.yaw;
    object.userData.handState=member.role==='performer'?(data.show?.performer_hands||{}):{};
    object.userData.reaction = member.reaction || null;
    applyAppearance(object, member);
    if (object.userData.name !== member.name) {
      disposeObject(object.userData.title); const title = label(member.name); title.position.y = 0.42; object.add(title);
      object.userData.title = title; object.userData.name = member.name;
    }
  }
  for (const [id, object] of members) if (!active.has(id)) { disposeObject(object); members.delete(id); }
  if (JSON.stringify(history) !== JSON.stringify(data.chat)) {
    if(historyKnown&&data.chat.length)roomInterface.unread();
    history = data.chat; $('messages').replaceChildren();
    for (const entry of history) {
      const p = document.createElement('p'), name = document.createElement('strong'); name.textContent = entry.name + ': '; name.style.color = entry.color;
      p.append(name, document.createTextNode(entry.text)); $('messages').appendChild(p);
    }
    $('messages').scrollTop = $('messages').scrollHeight;visitorHud.setHistory(history);
  }
  historyKnown=true;
}
$('join').onclick = () => {
  if (socket && socket.readyState < 2) return;
  const fragment=new URLSearchParams(location.hash.slice(1));
  const secret = fragment.get('host');
  let invite=fragment.get('invite');
  try{if(invite)sessionStorage.setItem('cardinal-show-invite',invite);else invite=sessionStorage.getItem('cardinal-show-invite');}catch{}
  if(invite)window.history.replaceState(null,'',location.pathname+location.search);
  socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/room${secret ? '?host=' + encodeURIComponent(secret) : invite?'?invite='+encodeURIComponent(invite):''}`);
  $('status').textContent = 'Joining the room…'; $('error').textContent = '';
  socket.binaryType = 'arraybuffer';
  const joiningSocket = socket;
  const joinTimeout = setTimeout(() => {
    if (!joined && socket === joiningSocket) { joiningSocket.close(); $('error').textContent = 'The room did not respond. Check the launcher window, then try Enter the room again.'; }
  }, 6000);
  socket.onmessage = event => {
    if (event.data instanceof ArrayBuffer) { showAudio.packet(event.data); return; }
    const data = JSON.parse(event.data);
    if(data.type?.startsWith('rtc_')){rtcAudio.handle(data).catch(()=>rtcAudio.fail('negotiation failed'));return;}
    if(typeof data.type==='string'&&data.type.startsWith('control_')){remoteControls.receive(data);roomInterface.role(Boolean(remoteControls.client.permission));visitorHud.setRole(Boolean(remoteControls.client.permission));return;}
    if (data.type === 'welcome') {
      clearTimeout(joinTimeout);
      myId = data.id; joined = true;historyKnown=false;
      send({type:'audio_quality',quality:$('audio-quality').value});
      send({type:'audio_codec',codec:showAudio.rtcActive?'off':showAudio.ready?showAudio.codec:'off'});
      send({type:'client_features',delta:true,lowData});networkState=null;networkRevision=0;
      if (data.role === 'performer') rig.position.set(0, 0.25, -3);
      updateIdentity($('name').value, $('color').value, $('color2').value, $('pattern').value);
      $('welcome').hidden = true;roomInterface.setJoined(true);vrButton.hidden = false;$('hud-toggle').hidden=false;setHudHidden(false);$('touch-controls').hidden=!touchDevice;
      $('status').textContent = `${data.role === 'performer' ? 'Performer preview' : 'Visitor'} · Show room · audio not connected`;
    } else if (data.type === 'room') {networkState=data;networkRevision=data.revision||0;updateRoom(data);}
    else if(data.type==='room_delta'){
      if(data.base!==networkRevision||!networkState){send({type:'scene_resync'});return;}
      try{networkState=applyScenePatch(networkState,data.patches);networkRevision=data.revision;updateRoom(networkState);}catch{send({type:'scene_resync'});}
    }
    else if(data.type==='connection_stats')$('data-rate').textContent=`Live stream ${(data.bytesPerSecond/1024).toFixed(1)} KB/s · audio ${((data.audioBytesPerSecond||0)/1024).toFixed(1)} KB/s · ${lowData?'data saver':'full updates'}`;
  };
  socket.onclose = event => { clearTimeout(joinTimeout); joined = false;roomInterface.setJoined(false);$('welcome').hidden=false;$('hud-toggle').hidden=true;$('touch-controls').hidden=true;remoteControls.disconnect();rtcAudio.disconnect();showScene.clear(); $('status').textContent = 'Disconnected · reload or try entering again'; $('error').textContent = event.reason || 'Connection closed. Check the launcher window and try again.'; };
  socket.onerror = () => { $('error').textContent = 'Cannot connect to the room.'; };
};
$('chat-form').onsubmit = event => { event.preventDefault(); send({ type: 'chat', text: $('message').value }); $('message').value = '';visitorHud.setDraft(''); };
$('message').addEventListener('input',()=>visitorHud.setDraft($('message').value));
$('profile-form').onsubmit = event => {
  event.preventDefault(); updateIdentity($('profile-name').value, $('profile-color').value, $('profile-color2').value, $('profile-pattern').value); $('profile').open = false;
};
let hudHidden=false;
function setHudHidden(hidden){if(hidden&&visitorHud.dragging)visitorHud.release(visitorHud.dragging);hudHidden=hidden;roomInterface.setHidden(hidden);visitorHud.group.visible=renderer.xr.isPresenting&&!hidden;$('hud-toggle').textContent=hidden?'Show interface · H':'Hide interface · H';$('hud-toggle').setAttribute('aria-pressed',String(hidden));}
$('hud-toggle').onclick=()=>setHudHidden(!hudHidden);
addEventListener('keydown', event => { if (!['INPUT', 'TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {if(renderer.xr.isPresenting&&visitorHud.handleKey(event)){event.preventDefault();return;}if(event.code==='KeyH'&&joined&&!event.repeat)setHudHidden(!hudHidden);else if(!roomInterface.active)keys.add(event.code);} });
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => { keys.clear(); });
const touchNavigation=new TouchNavigation(renderer.domElement,$('move-pad'),$('move-thumb'),(dx,dy)=>{
  if(renderer.xr.isPresenting||!joined)return;
  yaw -= dx * 0.003; pitch = THREE.MathUtils.clamp(pitch - dy * 0.003, -1.3, 1.3);
  rig.rotation.y = yaw; camera.rotation.x = pitch;
});

// Immersive world-placed chat, keyboard and sound controls.
const visitorHud=new VisitorHud(scene,{onSend:text=>send({type:'chat',text}),onReact:react,onAudio:enableAudio,onQuality:()=>{const menu=$('audio-quality'),options=[...menu.options].filter(o=>!o.disabled);menu.value=options[(options.findIndex(o=>o.value===menu.value)+1)%options.length].value;menu.onchange();},onHide:()=>setHudHidden(true),onDraft:text=>{$('message').value=text;},onPlaced:pose=>{try{localStorage.setItem('cardinal-show-vr-hud',JSON.stringify(pose));}catch{}}});
visitorHud.setQuality($('audio-quality').selectedOptions[0].textContent);
const raycaster = new THREE.Raycaster();
const remoteControls=new RemoteControls({send,rack:showScene.rack,canvas:renderer.domElement,camera,scene,panel:$('collaboration-panel'),audio:showAudio});
rtcAudio.onControl=message=>{remoteControls.receive(message);roomInterface.role(Boolean(remoteControls.client.permission));visitorHud.setRole(Boolean(remoteControls.client.permission));};
const controllers=[];
for (let i = 0; i < 2; i++) {
  const controller = renderer.xr.getController(i); rig.add(controller);controllers.push(controller);
  controller.addEventListener('connected',event=>{controller.userData.inputSource=event.data;});
  controller.addEventListener('disconnected',()=>{visitorHud.release(controller);remoteControls.release(controller);controller.userData.inputSource=null;});
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -3)]), new THREE.LineBasicMaterial({ color: '#83e7ff' })); controller.add(line);
  controller.addEventListener('selectstart', () => {
    controller.getWorldPosition(worldPosition); controller.getWorldQuaternion(quaternion);
    raycaster.set(worldPosition,new THREE.Vector3(0,0,-1).applyQuaternion(quaternion));
    const hudHit=visitorHud.hit(raycaster);
    if(hudHit)visitorHud.activate(hudHit,controller);else remoteControls.select(controller,raycaster);
  });
  controller.addEventListener('selectend',()=>{visitorHud.release(controller);remoteControls.release(controller);});
}
renderer.xr.addEventListener('sessionstart',()=>{document.body.classList.add('xr-active');roomInterface.open(null);pitch=0;camera.rotation.set(0,0,0);camera.position.set(0,0,0);visitorHud.pendingPlacement=true;visitorHud.restoreOnEnter=true;setHudHidden(false);$('touch-controls').hidden=true;touchNavigation.reset();keys.clear();});
renderer.xr.addEventListener('sessionend',()=>{document.body.classList.remove('xr-active');for(const controller of controllers)visitorHud.release(controller);remoteControls.release();camera.position.set(0,1.65,0);visitorHud.group.visible=false;$('touch-controls').hidden=!touchDevice||!joined;});

let elapsed = 0, poseTimer = 0;
const hudButtons=new WeakMap();
function reactionStrength(reaction, now) {
  if (!reaction || now >= reaction.endsAt) return 0;
  const phase = Math.max(0, (now - reaction.startedAt) / (reaction.endsAt - reaction.startedAt));
  return Math.sin(Math.PI * phase);
}
function animateReaction(object, now) {
  const reaction = object.userData.reaction, strength = reactionStrength(reaction, now), body = object.userData.body;
  body.position.set(0, 0, 0); body.scale.setScalar(1); object.userData.skin.emissiveIntensity = 0.7;
  if (object.userData.particles) object.userData.particles.visible = false;
  if (!strength) return;
  const age = (now - reaction.startedAt) / 1000;
  if (reaction.kind === 'glow') {
    object.userData.skin.emissiveIntensity = 0.7 + strength * 3;
    body.scale.setScalar(1 + strength * 0.12);
    for (const child of body.children) if (child.material?.transparent) child.material.opacity = 0.13 + strength * 0.3;
  } else if (reaction.kind === 'grow') body.scale.setScalar(1 + strength * 1.4);
  else if (reaction.kind === 'shake') body.position.set(Math.sin(age * 30) * 0.08 * strength, Math.sin(age * 23) * 0.04 * strength, 0);
  else if (reaction.kind === 'sparkles') {
    if (!object.userData.particles) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(36 * 3), 3));
      const material = new THREE.PointsMaterial({ color: object.userData.primaryColor, size: 0.035, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const points = new THREE.Points(geometry, material); object.add(points); object.userData.particles = points;
    }
    const points = object.userData.particles, positions = points.geometry.attributes.position;
    points.visible = true; points.material.opacity = strength;
    for (let i = 0; i < 36; i++) {
      const angle = i * 2.39996, rise = ((age * 0.45 + i / 36) % 1), radius = 0.2 + rise * 0.45;
      positions.setXYZ(i, Math.cos(angle) * radius, rise * 0.95 - 0.2, Math.sin(angle) * radius);
    }
    positions.needsUpdate = true;
    points.geometry.computeBoundingSphere();
  }
}
$('status').textContent = 'Show room preview · ready to enter';
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05); elapsed += dt; poseTimer += dt;
  if (joined) {
    let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    let z = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    const touchAxis=touchNavigation.step(dt);if(!renderer.xr.isPresenting){x+=touchAxis.x;z+=touchAxis.z;}
    const inputs = renderer.xr.getSession()?.inputSources || [];
    for (const input of inputs) {
      const hudPress=Boolean(input.gamepad?.buttons[5]?.pressed);if(hudPress&&!hudButtons.get(input)){if(input.gamepad?.buttons[1]?.pressed){visitorHud.pendingPlacement=true;visitorHud.restoreOnEnter=false;setHudHidden(false);}else setHudHidden(!hudHidden);}hudButtons.set(input,hudPress);
      const axes = input.gamepad?.axes, grip = input.gamepad?.buttons[1]?.pressed; if (!axes || axes.length < 2) continue;
      const sx = axes[axes.length - 2], sy = axes[axes.length - 1];
      if(visitorHud.dragging?.userData.inputSource===input){visitorHud.adjustDistance(Math.abs(sy)>.2?sy:0,dt);continue;}
      if (grip) { rig.rotation.y -= Math.abs(sx) > 0.2 ? sx * dt : 0; rig.position.y -= Math.abs(sy) > 0.2 ? sy * dt : 0; }
      else { x += Math.abs(sx) > 0.2 ? sx : 0; z += Math.abs(sy) > 0.2 ? sy : 0; }
    }
    const norm = Math.max(1, Math.hypot(x, z)), angle = rig.rotation.y;
    rig.position.x = THREE.MathUtils.clamp(rig.position.x + (x * Math.cos(angle) + z * Math.sin(angle)) / norm * dt * 1.8, -40, 40);
    rig.position.z = THREE.MathUtils.clamp(rig.position.z + (z * Math.cos(angle) - x * Math.sin(angle)) / norm * dt * 1.8, -40, 40);
    rig.position.y = THREE.MathUtils.clamp(rig.position.y, -1, 15);
    if (poseTimer >= (lowData ? .1 : .05)) {
      const head = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
      head.getWorldPosition(worldPosition); head.getWorldQuaternion(quaternion); euler.setFromQuaternion(quaternion);
      send({ type: 'pose', position: worldPosition.toArray(), yaw: euler.y }); poseTimer = 0;
    }
  }
  for (const object of members.values()) {
    if (object.userData.target) object.position.lerp(object.userData.target, 1 - Math.exp(-15 * dt));
    object.rotation.y = object.userData.yaw || 0;
    object.updateMatrixWorld(true);
    object.userData.trackedHands?.update(object.userData.handState||{},dt);
    object.userData.arms?.forEach((arm, i) => { arm.visible=!object.userData.handState?.[i===0?'left':'right'];arm.rotation.z = Math.sin(elapsed * 2 + i) * 0.2; });
    // Reset translucent shells even after a glow finishes.
    for (const child of object.userData.body.children) if (child.material?.transparent) child.material.opacity = 0.13;
    animateReaction(object, Date.now() - serverOffset);
  }
  const now = Date.now() - serverOffset, remaining = Math.max(0, Math.ceil((reactionReadyAt - now) / 1000));
  const activeReaction = myReaction && now < myReaction.endsAt;
  const caption = activeReaction ? `${reactions.find(item => item.kind === myReaction.kind)?.label} · ${Math.ceil((myReaction.endsAt - now) / 1000)}s` : remaining ? 'Ready again in ' + remaining + 's' : 'Express yourself';
  if (caption !== reactionCaption) { reactionCaption = caption; $('reaction-status').textContent = caption; }
  for (const item of reactions) $('react-' + item.kind).disabled = !joined || remaining > 0;
  showScene.update();showScene.rack.animate(dt); decorations.visible=!showScene.latest?.visuals?.environment;
  const listenerCamera = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  remoteControls.update(showScene.displayed,listenerCamera,renderer.xr.isPresenting);
  if(renderer.xr.isPresenting){
   if(visitorHud.pendingPlacement){let saved;try{saved=JSON.parse(localStorage.getItem('cardinal-show-vr-hud')||'null');}catch{}if(!visitorHud.restoreOnEnter||!visitorHud.restore(saved,listenerCamera))visitorHud.place(listenerCamera);visitorHud.pendingPlacement=false;visitorHud.restoreOnEnter=false;}
   scene.updateMatrixWorld(true);let hover=null;
   for(const controller of controllers){controller.getWorldPosition(worldPosition);controller.getWorldQuaternion(quaternion);raycaster.set(worldPosition,new THREE.Vector3(0,0,-1).applyQuaternion(quaternion));hover ||= visitorHud.hit(raycaster);}
   visitorHud.setHover(hover);
  }
  listenerCamera.getWorldPosition(worldPosition); listenerCamera.getWorldQuaternion(quaternion);
  showAudio.listener(worldPosition.toArray(), new THREE.Vector3(0,0,-1).applyQuaternion(quaternion).toArray(), new THREE.Vector3(0,1,0).applyQuaternion(quaternion).toArray());
  renderer.render(scene, camera);
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
