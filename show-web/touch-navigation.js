// SPDX-License-Identifier: GPL-3.0-or-later
export const joystickAxis=(dx,dy,radius=48)=>{
 const length=Math.hypot(dx,dy),amount=Math.min(1,length/radius);
 if(amount<.08)return {x:0,z:0};const scale=((amount-.08)/.92)/(length||1);
 return {x:dx*scale,z:dy*scale};
};
export function dampAxis(current,target,dt){return current+(target-current)*(1-Math.exp(-18*dt));}
export class TouchNavigation{
 constructor(canvas,pad,thumb,onLook){
  this.canvas=canvas;this.pad=pad;this.thumb=thumb;this.onLook=onLook;this.target={x:0,z:0};this.current={x:0,z:0};this.stick=null;this.look=null;
  pad.addEventListener('pointerdown',e=>{if(this.stick!==null)return;e.preventDefault();e.stopPropagation();this.stick=e.pointerId;pad.setPointerCapture(e.pointerId);pad.classList.add('active');this.move(e);});
  pad.addEventListener('pointermove',e=>{if(e.pointerId===this.stick){e.preventDefault();this.move(e);}});
  const release=e=>{if(e.pointerId===this.stick){this.stick=null;this.target={x:0,z:0};thumb.style.transform='translate(0px,0px)';pad.classList.remove('active');}};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(name,release);
  canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;if(this.look)return;this.look={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!this.look||e.pointerId!==this.look.id)return;const dx=e.clientX-this.look.x,dy=e.clientY-this.look.y;this.look.x=e.clientX;this.look.y=e.clientY;onLook(dx,dy);});
  const stop=e=>{if(this.look?.id===e.pointerId)this.look=null;};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,stop);
  addEventListener('blur',()=>this.reset());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset();});
 }
 move(e){const r=this.pad.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);this.target=joystickAxis(dx,dy);const n=Math.max(1,Math.hypot(dx,dy)/48);this.thumb.style.transform=`translate(${dx/n}px,${dy/n}px)`;}
 step(dt){for(const k of ['x','z'])this.current[k]=dampAxis(this.current[k],this.target[k],dt);return this.current;}
 reset(){this.stick=null;this.look=null;this.target={x:0,z:0};this.current={x:0,z:0};this.thumb.style.transform='translate(0px,0px)';this.pad.classList.remove('active');}
}
