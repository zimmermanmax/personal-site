import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EYE, places, stepPosition, floorAt, shelfAccess, shelfView, ladderView, setLadderY, getLadderY, configureNavigation, refreshMechanisms, validStandpoint, mechanismClear, ladderClear } from './navigation.js';
import {createMechanisms, attachMovingBooks} from './mechanisms.js';
import {applySnowMaterial} from './snow-material.js';
import { createBooks, createInspection } from './books.js';
import { createWoodland } from './woodland.js';
import { createLighting } from './lighting.js';
import { visibleBookHit } from './selection.js';
import {createReviewDiagnostics} from './review-diagnostics.js';

const $=id=>document.getElementById(id),canvas=$('room');
const parameters=new URLSearchParams(location.search);
const review=createReviewDiagnostics(['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&parameters.has('review'));
const previousFinish=false;
const materialReview=false;
const ROOM_BASE='./assets/carriage-v18/room/';
const CURRENT_ROOM_ASSET=ROOM_BASE+'carriage-room-v15.gltf';
let lightingRig,mechanisms,movingBooks,curation={},pendingPlace=null;
const shelfNames={'to-read':'Want to read','currently-reading':'Currently reading','read':'Read'};
let currentReads={links:{}},catalog=[],layout=[],books,room,ladder,renderer,scene,camera,weather,inspection;
let selected=null,activeShelf='all',yaw=0,pitch=0,feet={x:4.8,y:2.4,z:0},seated=false,ladderMode=false,ready=false;
let lastTime=0,time=0,hovered=null,hintUntil=0,drag=null,lastHover=0,returnView=null,bookSpin=0;
let hoverDirty=true;
const keys=new Set(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),lookEuler=new THREE.Euler(0,0,0,'YXZ');
const pendingKeyTaps=new Set();
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const loadJSON=async url=>{const r=await fetch(url);if(!r.ok)throw new Error(`Could not load ${url}: ${r.status}`);return r.json();};
function toast(message,duration=3300){$('hint').textContent=message;hintUntil=performance.now()+duration;}
function releaseMouse(){if(document.pointerLockElement)document.exitPointerLock();keys.clear();pendingKeyTaps.clear();}
function canWalk(){return ready&&selected===null&&!$('search-dialog').open&&!$('help-dialog').open&&!ladderMode&&!seated;}
function walkBy(f,s,dt){
  const length=Math.hypot(f,s);if(!length||!canWalk())return;
  hoverDirty=true;f/=length;s/=length;
  feet=stepPosition(feet,(-Math.sin(yaw)*f+Math.cos(yaw)*s)*dt*1.65,(Math.cos(yaw)*f+Math.sin(yaw)*s)*dt*1.65);
  camera.position.x=feet.x;camera.position.z=-feet.y;camera.position.y=THREE.MathUtils.damp(camera.position.y,feet.z+EYE,18,dt);
}
function setLook(target){camera.lookAt(...target);lookEuler.setFromQuaternion(camera.quaternion,'YXZ');yaw=lookEuler.y;pitch=lookEuler.x;hoverDirty=true;}
function updateLook(){pitch=THREE.MathUtils.clamp(pitch,-1.36,1.36);camera.quaternion.setFromEuler(lookEuler.set(pitch,yaw,0,'YXZ'));hoverDirty=true;}
function sizeRenderer(){
  // Bound GPU fill cost on large/retina displays while retaining source detail.
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.25,Math.sqrt(1100000/(innerWidth*innerHeight))));
  renderer.setSize(innerWidth,innerHeight);
}
function enterPlace(name){
  if(!ready||!places[name])return false;
  const place=places[name];
  if(place.requires==='secret'&&(mechanisms.current.secret!==1||mechanisms.target.secret!==1)){
    if(!mechanismClear('secret',feet)){toast('Step clear of the bookcase before opening it.');return false;}
    closeBook(false);pendingPlace=name;mechanisms.setTarget('secret',true);syncMovingParts();toast('Opening the bookcase…');return true;
  }
  const next={x:place.position[0],y:place.position[1],z:place.position[2]-(place.seated?1.17:EYE)};
  if(!place.seated){const h=floorAt(next.x,next.y,next.z);if(h===null){toast('This route is temporarily blocked.');return false;}next.z=h;}
  closeBook(false);releaseMouse();ladderMode=false;seated=!!place.seated;feet=next;
  camera.position.set(feet.x,feet.z+(seated?1.17:EYE),-feet.y);setLook([place.look[0],place.look[2],-place.look[1]]);
  $('ladder').textContent='Climb ladder';toast(seated?'Settle in. Choose a place to stand up.':name==='arrival'?'Follow the path to the porch. Use Doors & TV to open the entrance.':'Drag to look. Select a book on the shelf.');review.event(name);return true;
}
function openSearch(){releaseMouse();if(!$('search-dialog').open)$('search-dialog').showModal();renderResults();$('query').focus();}
function filteredBooks(query=$('query').value,shelf=activeShelf){const q=query.trim().toLocaleLowerCase();return catalog.filter(b=>(shelf==='all'||b.shelf===shelf)&&(!q||`${b.title} ${b.author} ${curation.sectionLabels?.[layout.find(s=>s.bookId===b.id)?.section]||''}`.toLocaleLowerCase().includes(q)));}
function textElement(tag,content,className){const e=document.createElement(tag);e.textContent=content;if(className)e.className=className;return e;}
function renderResults(){
  const result=filteredBooks();$('result-count').textContent=`${result.length.toLocaleString()} ${result.length===1?'book':'books'}`;const fragment=document.createDocumentFragment();
  if(!result.length)fragment.append(textElement('p','No books found. Try another title, author, or shelf.','muted'));
  for(const b of result){const button=document.createElement('button');button.className='result';button.setAttribute('aria-label',`${b.title}, by ${b.author}. ${shelfNames[b.shelf]}. Inspect book.`);
    if(b.cover){const image=document.createElement('img');image.src=b.cover;image.alt='';image.loading='lazy';image.width=38;image.height=57;image.addEventListener('error',()=>image.replaceWith(textElement('span',b.title.slice(0,1),'mini-cover')),{once:true});button.append(image);}else button.append(textElement('span',b.title.slice(0,1),'mini-cover'));
    const text=document.createElement('span');text.append(textElement('span',b.title,'result-title'),textElement('span',b.author,'result-author'));button.append(text,textElement('span',shelfNames[b.shelf],'result-shelf'));button.addEventListener('click',()=>selectBook(b.id));fragment.append(button);
  }$('results').replaceChildren(fragment);
}
function selectBook(id){
  const b=catalog.find(x=>x.id===String(id));if(!b)throw new Error('Book not found.');
  releaseMouse();$('search-dialog').close();if(selected===null&&camera)returnView={position:camera.position.clone(),yaw,pitch,feet:{...feet},seated,ladderMode};
  selected=b.id;inspection?.dispose();inspection=null;if(lightingRig)lightingRig.inspection.visible=true;
  $('book-title').textContent=b.title;$('book-author').textContent=`by ${b.author}`;$('book-shelf').textContent=shelfNames[b.shelf]||b.shelf;
  $('book-rating').textContent=b.rating?'★'.repeat(Math.max(0,Math.min(5,Number(b.rating))))+'☆'.repeat(5-Math.max(0,Math.min(5,Number(b.rating)))):'Not yet rated';
  const cover=$('book-cover');cover.replaceChildren();if(b.cover){const img=document.createElement('img');img.src=b.cover;img.alt=`Cover of ${b.title}`;img.addEventListener('error',()=>img.replaceWith(textElement('span','Cover unavailable','missing-cover')),{once:true});cover.append(img);}else cover.append(textElement('div','Original cover not yet recovered.','missing-cover'));
  const facts=$('book-facts');facts.replaceChildren();for(const [name,value] of [['Published',b.year],['Length',b.pages?`${b.pages} pages`:null],['Read',b.dateRead],['Added',b.dateAdded]]){if(value)facts.append(textElement('dt',name),textElement('dd',String(value)));}
  $('book-tags').textContent=b.tags?.length?b.tags.map(t=>t.replaceAll('_',' ')).join(' · '):'';
  const review=$('book-review');review.replaceChildren();if(b.review){if(b.spoiler){const button=textElement('button','Show review (contains spoilers)');button.onclick=()=>review.replaceChildren(textElement('p',b.review));review.append(button);}else review.append(textElement('p',b.review));}
  const slot=layout.find(x=>x.bookId===b.id);$('book-location').textContent=slot?`${curation.sectionLabels?.[slot.section]||'Classification pending'} · ${slot.access==='desk'?'Currently reading · Writing desk':slot.case===16&&slot.wall==='South'?'Upstairs favourites':slot.access==='gallery'?'Upper gallery':slot.access==='ladder'?'Ladder shelves':'Ground floor'}`:'Shelf location unavailable';
  const goodreads=$('goodreads-link');goodreads.href=`https://www.goodreads.com/book/show/${encodeURIComponent(b.id)}`;
  const readwise=$('readwise-link'),linked=currentReads.links?.[b.id];readwise.hidden=!linked;if(linked)readwise.href=linked.highlightsUrl;else readwise.removeAttribute('href');
  $('go-to-book').textContent=slot?.access==='desk'?'Take me to the desk':'Take me to its shelf';
  $('go-to-book').disabled=!ready;$('inspection-tip').textContent=ready?'Drag the book to turn it. Close to put it back.':'The collection is available here while the room loads.';
  if(ready){inspection=createInspection(b,slot);camera.add(inspection.group);bookSpin=0;positionInspection();books.select(books.items.findIndex(s=>s.bookId===b.id));}
  if(!$('book-dialog').open)$('book-dialog').show();document.body.classList.add('inspecting');$('put-back').focus();return {id:b.id,title:b.title,author:b.author,shelf:b.shelf};
}
function positionInspection(){if(!inspection)return;const mobile=innerWidth<700;inspection.group.position.set(mobile?0:-.27,mobile?.22:0,-1.35);inspection.group.scale.setScalar(mobile?.9:1);}
function validLadderPose(point){
  if(Math.abs(point.y-getLadderY())>.0001||point.z<.75||point.z>4.051)return false;
  const expected=ladderView(point.y,point.z+EYE);
  return Math.abs(point.x-expected.x)<.0001;
}
function safeLadderStage(y){
  const stage={x:1.98,y:ladderView(y).y,z:0};
  return validStandpoint(stage)&&ladderClear(getLadderY(),stage.y,stage)?stage:null;
}
function boardLadder(destination,stage){
  // Named shelf navigation is instantaneous. Leave the ladder's travel lane
  // before relocating it, then board only after its new transform is applied.
  feet=stage;camera.position.set(stage.x,EYE,-stage.y);
  setLadderY(stage.y);mechanisms.setLadderY(getLadderY());refreshMechanisms();renderer.shadowMap.needsUpdate=true;
  feet=destination;ladderMode=true;seated=false;
}
function closeBook(restore=true){
  if(selected===null)return;inspection?.dispose();inspection=null;selected=null;if(lightingRig)lightingRig.inspection.visible=previousFinish;books?.select(null);$('book-dialog').close();document.body.classList.remove('inspecting');
  if(restore&&returnView&&camera){if(returnView.seated||(returnView.ladderMode?validLadderPose(returnView.feet):validStandpoint(returnView.feet))){camera.position.copy(returnView.position);yaw=returnView.yaw;pitch=returnView.pitch;feet={...returnView.feet};seated=returnView.seated;ladderMode=returnView.ladderMode;updateLook();}else{feet={x:4.8,y:2.4,z:0};seated=false;ladderMode=false;camera.position.set(4.8,EYE,-2.4);setLook([3.8,2.5,-6.2]);}}returnView=null;canvas.focus({preventScroll:true});
}
function goToBook(){
  if(!ready||selected===null)return false;
  const index=books.items.findIndex(s=>s.bookId===selected),slot=layout.find(s=>s.bookId===selected);if(!slot)return false;
  let view=shelfView(slot),target=new THREE.Vector3().fromArray(slot.p);
  if(movingBooks.movingIds.has(slot.bookId)){
    if(mechanisms.current.secret!==mechanisms.target.secret){toast('Wait for the bookcase to stop, then approach the shelf.');return false;}
    target=movingBooks.worldCenter(index,new THREE.Vector3());
    const normal=new THREE.Vector3(1,0,0).transformDirection(mechanisms.delta('SecretDoor_v11_Root'));
    const anchor=target.clone().addScaledVector(normal,1.2);
    view={feet:{x:anchor.x,y:-anchor.z,z:3.2},ladder:false};
    if(mechanisms.current.secret===0)view.feet.y=shelfView(slot).feet.y;
  }
  if(!view.ladder&&!validStandpoint(view.feet)){
    const alternatives=slot.wall==='South'?[{...view.feet,y:view.feet.y+.8}]:[{...view.feet,x:1.98}];
    const safe=alternatives.find(validStandpoint);
    if(!safe){toast('Close the bookcase or TV doors to approach this shelf.');return false;}view.feet=safe;
  }
  const stage=view.ladder?safeLadderStage(view.feet.y):null;
  if(view.ladder&&!stage){toast('The ladder approach is blocked. Choose another shelf.');return false;}
  closeBook(false);releaseMouse();seated=false;ladderMode=view.ladder;feet=view.feet;
  if(ladderMode)boardLadder(view.feet,stage);
  camera.position.set(feet.x,feet.z+EYE,-feet.y);setLook(target.toArray());
  $('ladder').textContent=ladderMode?'Climb down':'Climb ladder';toast(ladderMode?'At the upper shelves · Choose Climb down to return.':slot.access==='desk'?'Your current read is on the desk. Select it to pick it up.':'Your book is here. Select its spine to pick it up.');review.event('book-shelf');return true;
}
function toggleLadder(){
  if(!ready)return;closeBook(false);releaseMouse();
  if(ladderMode){const next={x:1.98,y:getLadderY(),z:0};if(!validStandpoint(next)){toast('The ladder landing is blocked.');return;}ladderMode=false;seated=false;feet=next;camera.position.set(feet.x,EYE,-feet.y);setLook([.25,2.3,-feet.y]);$('ladder').textContent='Climb ladder';toast('Back on the library floor.');}
  else{const stage=safeLadderStage(feet.y);if(!stage){toast('The ladder approach is blocked.');return;}boardLadder(ladderView(stage.y),stage);camera.position.set(feet.x,feet.z+EYE,-feet.y);setLook([.22,4.8,-feet.y]);$('ladder').textContent='Climb down';toast('On the library ladder · Select a book, or climb down.');}
}
function syncMovingParts(){
  if(!mechanisms)return;movingBooks?.update();refreshMechanisms();hoverDirty=true;if(renderer)renderer.shadowMap.needsUpdate=true;
  for(const [id,key,label] of [['foyer-door','foyer','entrance door'],['secret-door','secret','secret bookcase'],['television','television','television']]){
    const open=mechanisms.target[key]===1;$(id).textContent=(key==='television'?(open?'Conceal ':'Reveal '):(open?'Close ':'Open '))+label;$(id).setAttribute('aria-pressed',String(open));
  }
}
function toggleMechanism(key){
  if(!ready)return;closeBook();releaseMouse();
  if(!mechanismClear(key,feet)){toast('Step clear of the moving doors first.');return;}
  mechanisms.setTarget(key,mechanisms.target[key]!==1);syncMovingParts();
}
function registerAgentTools(){
  const context=document.modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  const tools=[
    {name:'search_library_books',description:'Search Max’s current library catalog by title or author and Goodreads shelf.',inputSchema:{type:'object',properties:{query:{type:'string'},shelf:{type:'string',enum:['all','read','to-read','currently-reading']}},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input!=='object'||(input.query!==undefined&&typeof input.query!=='string')||(input.shelf!==undefined&&!['all','read','to-read','currently-reading'].includes(input.shelf)))throw new Error('Invalid search.');const matches=filteredBooks(input.query||'',input.shelf||'all');return {total:matches.length,books:matches.slice(0,100).map(b=>({id:b.id,title:b.title,author:b.author,shelf:b.shelf}))};}},
    {name:'inspect_library_book',description:'Open a book from the catalog in the visible book inspection panel.',inputSchema:{type:'object',properties:{bookId:{type:'string'}},required:['bookId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){if(typeof input?.bookId!=='string')throw new Error('A Goodreads book ID is required.');return selectBook(input.bookId);}},
    {name:'navigate_library_room',description:'Move the visible camera to a named place in the room.',inputSchema:{type:'object',properties:{place:{type:'string',enum:Object.keys(places)}},required:['place'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){if(!Object.hasOwn(places,input?.place)||!ready)throw new Error('Place unavailable.');enterPlace(input.place);return {place:input.place};}},
  ];for(const tool of tools){try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
}

$('foyer-door').onclick=()=>toggleMechanism('foyer');$('secret-door').onclick=()=>toggleMechanism('secret');$('television').onclick=()=>toggleMechanism('television');
$('find').onclick=openSearch;$('loading-search').onclick=openSearch;$('query').addEventListener('input',renderResults);
document.querySelectorAll('[data-shelf]').forEach(b=>b.onclick=()=>{activeShelf=b.dataset.shelf;document.querySelectorAll('[data-shelf]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderResults();});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
document.querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>enterPlace(b.dataset.place));
$('help').onclick=()=>{releaseMouse();$('help-dialog').showModal();};$('put-back').onclick=()=>closeBook();$('go-to-book').onclick=goToBook;$('ladder').onclick=toggleLadder;
$('walk').onclick=async()=>{if(!ready)return;if(selected!==null)closeBook();canvas.focus();try{await canvas.requestPointerLock();}catch{toast('Mouse lock is unavailable. Drag to look and use WASD to walk.');}};
document.addEventListener('pointerlockchange',()=>{hoverDirty=true;const locked=document.pointerLockElement===canvas;$('crosshair').hidden=!locked;$('walk').textContent=locked?'Esc to release mouse':'Walk with mouse';});
window.addEventListener('keydown',e=>{const isInput=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName);if(e.key==='Escape'){closeBook();keys.clear();pendingKeyTaps.clear();return;}if(isInput)return;if(e.key==='/'){e.preventDefault();openSearch();return;}if($('search-dialog').open||$('help-dialog').open)return;const key=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){e.preventDefault();if(!keys.has(key))pendingKeyTaps.add(key);keys.add(key);}});
window.addEventListener('keyup',e=>{
  const key=e.key.toLowerCase();
  // A quick tap can start and finish between two rendered frames.
  // Apply it once if the continuous movement loop has not consumed it.
  if(pendingKeyTaps.has(key)){
    const forward=(pendingKeyTaps.has('w')||pendingKeyTaps.has('arrowup')?1:0)-(pendingKeyTaps.has('s')||pendingKeyTaps.has('arrowdown')?1:0);
    const sideways=(pendingKeyTaps.has('d')||pendingKeyTaps.has('arrowright')?1:0)-(pendingKeyTaps.has('a')||pendingKeyTaps.has('arrowleft')?1:0);
    pendingKeyTaps.clear();walkBy(forward,sideways,.065);
  }
  keys.delete(key);
});window.addEventListener('blur',()=>{keys.clear();pendingKeyTaps.clear();drag=null;});
document.addEventListener('visibilitychange',()=>{keys.clear();pendingKeyTaps.clear();lastTime=0;});
document.querySelectorAll('[data-move]').forEach(b=>{const key={forward:'w',left:'a',back:'s',right:'d'}[b.dataset.move];b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(key);});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>keys.delete(key));});
canvas.addEventListener('pointerdown',e=>{if(!ready)return;canvas.focus();drag={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:0,id:e.pointerId};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!ready)return;hoverDirty=true;pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);
  const locked=document.pointerLockElement===canvas;if(!drag&&!locked)return;
  const dx=locked?e.movementX:e.clientX-drag.lastX,dy=locked?e.movementY:e.clientY-drag.lastY;
  if(drag){drag.lastX=e.clientX;drag.lastY=e.clientY;drag.moved+=Math.abs(dx)+Math.abs(dy);}
  if(inspection){inspection.group.rotation.y+=dx*.008;inspection.group.rotation.x=THREE.MathUtils.clamp(inspection.group.rotation.x+dy*.008,-1.35,1.35);}
  else{yaw-=dx*.003;pitch-=dy*.003;updateLook();}
});
canvas.addEventListener('pointerup',e=>{if(!ready)return;if(drag&&drag.moved<8&&selected===null){pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);const index=pickBook();if(index!==null)selectBook(books.items[index].bookId);}drag=null;});
canvas.addEventListener('pointercancel',()=>{drag=null;});
function pickBook(){
  if(!books)return null;camera.updateWorldMatrix(true,false);room?.updateWorldMatrix(true,true);if(document.pointerLockElement===canvas)pointer.set(0,0);raycaster.setFromCamera(pointer,camera);
  return visibleBookHit(raycaster,books.volumes,room);
}

async function initialize(){
  try{
    const [data,locations,sections,reading]=await Promise.all([loadJSON('./data/books.json'),loadJSON('./data/layout-v18.json'),loadJSON('./data/curation-v15.json'),loadJSON('./data/current-reads.json')]);catalog=data.books;layout=locations.books;curation=sections;currentReads=reading;const ids=new Set(catalog.map(b=>b.id));if(ids.size!==967||layout.length!==967||new Set(layout.map(s=>s.bookId)).size!==967||layout.some(s=>!ids.has(s.bookId)))throw new Error('Catalog and shelf assignment mismatch');
    $('collection-count').textContent=`${catalog.length.toLocaleString()} books · A woodland sanctuary`;$('loading-search').hidden=false;renderResults();registerAgentTools();
  }catch(error){$('load-status').textContent='The collection could not load. Please refresh to try again.';console.error(error);return;}
  try{
    const [manifest,nativeMotion,instances,release]=await Promise.all([loadJSON(ROOM_BASE+'movement-manifest.json'),loadJSON(ROOM_BASE+'native-motion-samples.json'),loadJSON(ROOM_BASE+'catalog-instance-transforms-v15.json'),loadJSON('./data/release-v18.json')]);
    if(manifest.sourceSha256!==nativeMotion.sourceSha256||manifest.sourceSha256!==instances.sourceSha256||manifest.sourceSha256!==release.roomSourceSha256||instances.books.length!==967||manifest.associatedDoorBookIds.length!==93)throw new Error('The room asset bundle is inconsistent');
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});sizeRenderer();renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.type=previousFinish?THREE.PCFSoftShadowMap:THREE.PCFShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
    // Refraction is visible only through the small Endurance bottle. Keep the
    // main view at its display resolution and all source textures intact.
    renderer.transmissionResolutionScale=.5;
    scene=new THREE.Scene();scene.background=new THREE.Color(0x8e9a91);scene.fog=new THREE.FogExp2(0x8e9a91,.014);
    camera=new THREE.PerspectiveCamera(64,innerWidth/innerHeight,.045,130);scene.add(camera);
    lightingRig=createLighting(scene,camera,renderer,previousFinish);
    $('load-status').textContent='Bringing in the shelves and old leather…';
    const gltf=await new GLTFLoader().loadAsync(CURRENT_ROOM_ASSET,e=>{if(e.total)$('load-progress').value=10+e.loaded/e.total*80;});
    room=gltf.scene;room.traverse(o=>{if(!o.isMesh)return;o.receiveShadow=true;o.castShadow=true;const materials=Array.isArray(o.material)?o.material:[o.material];for(const m of materials){
      applySnowMaterial(m);
      for(const key of ['map','roughnessMap','metalnessMap','normalMap'])if(m[key])m[key].anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      if(m.transmission>0||m.name.includes('Glass')){o.castShadow=false;m.depthWrite=false;if(/clear (panes?|window)/i.test(m.name)){m.transmission=0;m.transparent=true;m.opacity=previousFinish?.065:.09;m.roughness=previousFinish?.03:.06;}else if(m.transmission){m.transmission=.7;m.roughness=.06;}}
    }});scene.add(room);ladder=room.getObjectByName('WEB_MOVABLE_LADDER');
    mechanisms=createMechanisms(room,manifest,nativeMotion,reduced);books=createBooks(scene,catalog,layout);movingBooks=attachMovingBooks(books,manifest,mechanisms);$('load-status').textContent='Snow is settling among the trees…';weather=await createWoodland(scene,release,ROOM_BASE);configureNavigation(mechanisms,weather.surfaces);syncMovingParts();try{lightingRig.prepareReflections();}catch(error){console.warn('Room reflections unavailable; direct lighting remains active.',error);}ready=true;enterPlace('entrance');
    if(materialReview){camera.fov=THREE.MathUtils.radToDeg(2*Math.atan((36/32/2)/camera.aspect));camera.updateProjectionMatrix();camera.position.set(4.10,1.42,-4.65);feet={x:4.10,y:4.65,z:0};setLook([6.40,.68,-6.88]);toast(previousFinish?'Previous finish · Same reading-corner viewpoint':'Reading corner · Material and light study');}
    renderer.shadowMap.needsUpdate=true;review.ready(renderer,()=>({feet:{...feet},camera:camera.position.toArray(),seated,ladderMode,ladderY:getLadderY(),mechanisms:{...mechanisms.current}}));
    $('load-progress').value=100;$('loading').hidden=true;
    if(selected!==null)selectBook(selected);requestAnimationFrame(frame);
  }catch(error){console.error(error);$('load-status').textContent='The 3D room could not open on this device. You can still browse every book.';$('loading-search').hidden=false;$('find').style.zIndex='10';}
}
function frame(now){
  if(!ready)return;const dt=lastTime?Math.min((now-lastTime)/1000,.05):0;lastTime=now;time+=dt;
  if(!document.hidden){
    if(mechanisms.update(dt,key=>mechanismClear(key,feet)))syncMovingParts();
    if(pendingPlace&&mechanisms.current.secret===1){const place=pendingPlace;pendingPlace=null;enterPlace(place);}
    if(canWalk()){let f=(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0),s=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0);
      if(dt>0){walkBy(f,s,dt);pendingKeyTaps.clear();}
    }
    if(!reduced)weather.update(dt,time);
    if(selected===null&&hoverDirty&&now-lastHover>130&&!drag){lastHover=now;hoverDirty=false;const index=pickBook();if(index!==hovered){hovered=index;canvas.style.cursor=index===null?'grab':'pointer';if(index!==null)toast(`${books.items[index].book.title} · Select to pick up`,600);}}
    if(now>hintUntil)$('hint').textContent='';renderer.render(scene,camera);review.frame(now);
  }requestAnimationFrame(frame);
}
window.addEventListener('resize',()=>{if(!renderer||!camera)return;hoverDirty=true;camera.aspect=innerWidth/innerHeight;if(materialReview)camera.fov=THREE.MathUtils.radToDeg(2*Math.atan((36/32/2)/camera.aspect));camera.updateProjectionMatrix();sizeRenderer();positionInspection();});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;releaseMouse();$('loading').hidden=false;$('load-status').textContent='The room paused. Refresh to reopen it, or browse the books below.';$('loading-search').hidden=false;});
initialize();
