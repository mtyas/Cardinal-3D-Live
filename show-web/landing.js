// SPDX-License-Identifier: GPL-3.0-or-later
const $=id=>document.getElementById(id);
const fragment=new URLSearchParams(location.hash.slice(1));
const invitation=fragment.get('invite')||sessionStorage.getItem('cardinal-show-invite');
if(fragment.has('invite')){sessionStorage.setItem('cardinal-show-invite',invitation);history.replaceState(null,'',location.pathname);}
function events(id,items,empty){
 const target=$(id);target.replaceChildren();
 if(!items?.length){target.textContent=empty;return;}
 for(const item of items){const card=document.createElement('article'),title=document.createElement('h3'),date=document.createElement('p');title.textContent=item.title;const parsed=new Date(item.date);date.textContent=Number.isNaN(parsed.valueOf())?'Date to be announced':parsed.toLocaleString(undefined,{dateStyle:'long',timeStyle:'short'});card.append(title,date);if(item.description){const p=document.createElement('p');p.textContent=item.description;card.append(p);}target.append(card);}
}
async function refresh(){
 try{
  const response=await fetch('/show-info',{cache:'no-store'});if(!response.ok)throw Error();const info=await response.json();
  $('artist').textContent=info.profile.artist;$('bio').textContent=info.profile.bio;$('show-title').textContent=info.profile.title;
  events('past',info.profile.past,'No past shows listed yet.');events('upcoming',info.profile.upcoming,'The next show has not been announced yet. Check back soon.');
  $('live-status').textContent=info.live?(info.publicOpen?'Live now · come inside':'Private session in progress'):'Between performances';
  $('live-status').classList.toggle('live',info.live&&info.publicOpen);
  $('live-detail').textContent=info.live?`${info.visitors} visitors · ${info.capacity} places${info.publicOpen?' · live music and visuals':' · invitation required'}`:'The stage is quiet. Future performances will appear below.';
  const enter=$('enter'),allowed=info.publicOpen||Boolean(invitation)||info.localPreview;
  enter.hidden=!allowed;enter.textContent=info.live?'Enter the show':invitation?'Enter your invited room':'Explore the local preview';
  enter.href='/room.html'+(invitation?'#invite='+encodeURIComponent(invitation):'');
 }catch{$('live-status').textContent='Live status unavailable';$('live-detail').textContent='Please try again shortly.';$('enter').hidden=true;}
}
refresh();setInterval(refresh,10000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
async function notifications(){
 try{
  const response=await fetch('/notifications',{cache:'no-store'});if(!response.ok)return;
  const settings=await response.json();
  if(settings.provider==='telegram'&&/^https:\/\/t\.me\/[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(settings.url||'')){
   $('notify').href=settings.url;$('notify').hidden=false;
   $('notify-status').textContent='Opens Telegram · join the channel and enable its notifications.';
  }
 }catch{}
}
notifications();
