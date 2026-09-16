import {createHeightSampler} from './height-sampler.js';
export const EYE=1.65, RADIUS=.18;
const BODY=1.83, STEP=.22, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const places={
  entrance:{position:[4.8,2.4,EYE],look:[3.8,6.2,2.5]},
  arrival:{position:[6.5,-18,1.584252136716107],look:[3.2,.6,4.2]},
  foyer:{position:[4.92,-1.25,EYE],look:[4.6,3.6,2.4]},
  reading:{position:[6.45,7.18,1.185096],look:[3.4,6.4,1.4],seated:true},
  gallery:{position:[2.2,1.05,4.85],look:[3.8,1.8,4.0]},
  writingDesk:{position:[3.2,3.05,1.65],look:[3.8,4.1,.88]},
  upstairsReading:{position:[3.3075735569000244, 1.707573652267456, 4.349999904632568],look:[6.136000633239746, 4.5360002517700195, 4.170000076293945],seated:true},
  secret:{position:[-1.8,2.2,4.85],look:[-.4,1.0,4.6],requires:'secret'},
  chess:{position:[3.55,6.6,EYE],look:[2.65,6.95,.7]},
};
export const LADDER={minY:2.4,maxY:7.65,initialY:3.5};
let ladderY=LADDER.initialY, motion=null, outdoor=()=>null, dynamics=[];
const furniture=[
  [3.91,4.09,1.66,1.84],[7.06,7.24,1.66,1.84],
  [2.8,5.2,3.45,4.55],[3.74,4.26,2.825,3.37],
  [5.125,7.675,6.93,7.93],[4.29,5.31,5.56,6.74],
  [7.35,8.37,5.56,6.74],[5.66,7.04,5.755,6.545],
  [2.2,3.1,6.50,7.40],[2.34,2.96,5.99,6.45],[2.34,2.96,7.45,7.98],
  [7.715,8.385,7.17,7.79],
  [1.735,3.915,.02,.525], // fixed TV cabinet
  [.03,.56,3.11,5.44], // hearth body and projecting mantel
  [.43,1.66,0,.39], // retained lower south case
  [5.88,7.22,0,.25], // framed portrait bay
];
// Native v18 gallery guards and rotated furniture bounds in Blender XY metres.
const upstairsFurniture=[[2.726013422012329,3.9857282638549805,1.1260133981704712,2.385728359222412],[3.721230983734131,4.463693141937256,2.1212310791015625,2.8636932373046875]];
const guards=[[[0.46,1.85],[1.35,1.85]],[[1.35,1.85],[1.35,3.0]],[[1.35,3.0],[5.85,3.0]],[[5.85,3.0],[5.85,1.85]],[[5.85,1.85],[7.3,1.85]],[[8.57,1.85],[8.9,1.85]],[[7.3,2.98],[8.57,2.98]],[[8.57,1.85],[8.57,2.98]],[[7.3,1.85],[7.3,1.96]]];
const dynamicBoxes=[
  ['SecretDoor_v11_Root',[-.0275,.4225,3.2],[.3875,1.7075,5.8875]],
  ['FoyerDoor_v11_Root',[4.425,-2.957,.04],[5.425,-2.743,2.27]],
  ['TV_v15_Hinge_Left',[2.8375,.439,.683],[3.8625,.5295,1.843]],
  ['TV_v15_Hinge_Right',[1.7875,.439,.683],[2.8125,.5295,1.843]],
];
function distanceToSegment(x,y,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy),0,1);
  return Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t);
}
function discTouchesPolygon(x,y,points,r=RADIUS){
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[j],b=points[i];
    if(distanceToSegment(x,y,a,b)<r)return true;
    if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }
  return inside;
}
const rect=(x,y,a,r=RADIUS)=>x>a[0]-r&&x<a[1]+r&&y>a[2]-r&&y<a[3]+r;
function transformCorner(x,y,z,e){return [e[0]*x+e[4]*z-e[8]*y+e[12],-(e[2]*x+e[6]*z-e[10]*y+e[14])];}
export function refreshMechanisms(){
  dynamics=motion?dynamicBoxes.map(([name,lo,hi])=>{
    const e=motion.delta(name).elements;
    return {name,lo:lo[2],hi:hi[2],points:[[lo[0],lo[1]],[hi[0],lo[1]],[hi[0],hi[1]],[lo[0],hi[1]]].map(([x,y])=>transformCorner(x,y,lo[2],e))};
  }):[];
}
export function configureNavigation(mechanisms,surfaces){
  motion=mechanisms;const triangles=[];
  const roles=new Set(['gravel-drive','arrival-court','gravel-shoulder','court-return','entry-step','entry-paving']);
  for(const surface of Object.values(surfaces.surfaces)) if(roles.has(surface.role)){
    const vertices=surface.verticesGltf.map(([x,y,z])=>[x,-z,y]);
    for(const face of surface.triangles)triangles.push(face.map(i=>vertices[i]));
  }
  if(!triangles.length)throw new Error('Outdoor walking surfaces are missing');
  outdoor=createHeightSampler(triangles);refreshMechanisms();
}
export function setLadderY(y){ladderY=clamp(y,LADDER.minY,LADDER.maxY);return ladderY;}
export function getLadderY(){return ladderY;}
export function shelfAccess(slot){return slot.access||((slot.wall==='West'&&-slot.p[2]>1.85&&slot.p[1]>2.1)?'ladder':slot.p[1]>=3.2?'gallery':'ground');}
export function ladderView(y,eyeHeight=4.75){
  y=clamp(y,LADDER.minY,LADDER.maxY);const eye=clamp(eyeHeight,2.4,5.7),z=eye-EYE;
  return {x:1.55-(z-.09)/5.74*1.08+.22,y,z};
}
export function shelfView(slot){
  const [x,h,z]=slot.p,access=shelfAccess(slot),y=-z;
  if(access==='desk')return {feet:{x:3.2,y:3.05,z:0},ladder:false};
  if(slot.wall==='West'){
    if(access==='ladder')return {feet:ladderView(y,h+.1),ladder:true};
    return {feet:{x:access==='ground'&&Math.abs(y-ladderY)<.6?2.02:1.45,y:clamp(y,.8,access==='gallery'?1.55:7.9),z:access==='gallery'?3.2:0},ladder:false};
  }
  return {feet:{x:clamp(x,.8,8.6),y:1.15,z:access==='gallery'?3.2:0},ladder:false};
}
export function stairHeight(x,y){
  const dx=x-7.3,dy=y-3.2,r=Math.hypot(dx,dy),a=(Math.atan2(dy,dx)+Math.PI/6+Math.PI*2)%(Math.PI*2);
  if(r<.42||r>1.03||a>Math.PI*5/3)return null;
  return Math.min(18,Math.floor(a/(Math.PI*5/3/18))+1)*3.2/18;
}
function dynamicBlocked(x,y,z){return dynamics.some(o=>z<o.hi&&z+BODY>o.lo&&discTouchesPolygon(x,y,o.points));}
function guardBlocked(x,y,z){return z+BODY>3.2&&z<4.3&&guards.some(([a,b])=>distanceToSegment(x,y,a,b)<RADIUS+.02);}
function outsideHeight(x,y){
  let z=outdoor(x,y);
  if(z===null){ // Bridge only the narrow joints between the physical paving slabs.
    const a=outdoor(x,y-.03),b=outdoor(x,y+.03);
    if(a!==null&&b!==null)z=Math.max(a,b);
  }
  return z;
}
export function floorAt(x,y,previous=0){
  if(dynamicBlocked(x,y,previous)||guardBlocked(x,y,previous))return null;
  const secretOpen=motion?.current.secret===1&&motion?.target.secret===1;
  if(previous>2.82){
    if(upstairsFurniture.some(a=>rect(x,y,a)))return null;
    if(x>=1.53&&x<=5.67&&y>=1.62&&y<=2.82)return 3.2;
    if(x<=.62&&x>=-.42&&y>=.584&&y<=1.546)return secretOpen?3.2:null;
    if(x<-.42&&x>=-3.18&&y>=.23&&y<=2.87)return 3.2;
    if(x>=.62&&x<=8.72&&y>=.62&&y<=1.65)return 3.2;
    if(x>=7.3&&x<=8.35&&y>=1.83&&y<=2.76)return 3.2;
    if(x>=7.50&&x<=8.35&&y>=1.60&&y<=1.85)return 3.2;
  }
  // Framed inner opening and its small threshold, at ground level only.
  if(previous<.3&&y>=-.42&&y<=.32)return x>=4.49&&x<=5.36?0:null;
  if(previous<.3&&y<-.42){
    if(y>=-2.62&&x>=3.755&&x<=6.095)return 0;
    if(y>=-3.15&&y< -2.62){
      const open=motion?.current.foyer>=90/95&&motion?.target.foyer===1;
      return open&&x>=4.65&&x<=5.24?.011:null;
    }
    if(y< -3.15)return outsideHeight(x,y);
    return null;
  }
  if(x<.62||x>8.72||y<.32||y>8.15)return null;
  const stair=stairHeight(x,y);
  if(stair!==null&&Math.abs(stair-previous)<=STEP)return stair;
  if(previous>.3)return null;
  if(Math.hypot(x-7.3,y-3.2)<.42)return null;
  if(stair!==null&&stair<2.12)return null;
  if(furniture.some(a=>rect(x,y,a)))return null;
  if(Math.hypot(x-3.75,y-5.2)<.59)return null;
  if(x>.48&&x<1.84&&Math.abs(y-ladderY)<.59)return null;
  return 0;
}
export function stepPosition(pos,dx,dy){
  let next={...pos};const count=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.045));
  for(let i=0;i<count;i++)for(const [mx,my] of [[dx/count,0],[0,dy/count]]){
    const h=floorAt(next.x+mx,next.y+my,next.z);
    if(h!==null&&Math.abs(h-next.z)<=STEP)next={x:next.x+mx,y:next.y+my,z:h};
  }
  return next;
}
export function validStandpoint(feet){const h=floorAt(feet.x,feet.y,feet.z);return h!==null&&Math.abs(h-feet.z)<=STEP;}
export function mechanismClear(key,feet){
  if(key==='secret')return feet.z+BODY<=3.2||!rect(feet.x,feet.y,[-2.15,.40,.16,1.85]);
  if(key==='foyer')return feet.z>=2.27||!rect(feet.x,feet.y,[4.241,5.426,-2.958,-1.849]);
  if(key==='television')return feet.z>=1.843||!rect(feet.x,feet.y,[1.469,4.181,.438,1.486]);
  return true;
}
export function ladderClear(from,to,feet){
  return !rect(feet.x,feet.y,[.42,1.65,Math.min(from,to)-.41,Math.max(from,to)+.41]);
}
