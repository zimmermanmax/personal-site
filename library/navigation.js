// Navigation is expressed in the Blender floor plan: x east, y north, z up.
export const EYE = 1.65;
export const places = {
  entrance:{position:[4.8,2.4,1.65],look:[3.8,6.2,2.5]},
  reading:{position:[6.45,7.18,1.185096],look:[3.4,6.4,1.4],seated:true},
  gallery:{position:[4.5,1.05,4.85],look:[3.1,5.6,3.1]},
  chess:{position:[3.55,6.6,1.65],look:[2.65,6.95,.7]},
};
const obstacles = [
  [3.91,4.09,1.66,1.84], [7.06,7.24,1.66,1.84], // gallery timber posts
  [2.8,5.2,3.45,4.55], // writing desk
  [3.74,4.26,2.825,3.37], // writing chair, including its back
  [5.125,7.675,6.93,7.93], // sofa
  [4.29,5.31,5.56,6.74], [7.35,8.37,5.56,6.74], // armchairs
  [5.66,7.04,5.755,6.545], // coffee table
  [2.20,3.10,6.50,7.40], [2.34,2.96,5.99,6.45], [2.34,2.96,7.45,7.98], // chess
  [7.715,8.385,7.17,7.79], // personal display table
];
const galleryGuards=[
  [[.46,1.85],[7.3,1.85]], [[8.57,1.85],[8.9,1.85]],
  [[7.3,2.98],[8.57,2.98]], [[8.57,1.85],[8.57,2.98]],
  [[7.3,1.85],[7.3,1.96]],
];
function nearGalleryGuard(x,y,feet){
  if(feet+1.83<=3.2||feet>=4.3)return false;
  return galleryGuards.some(([[ax,ay],[bx,by]])=>{
    const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
    return Math.hypot(x-ax-t*dx,y-ay-t*dy)<.19;
  });
}
export const LADDER = {minY:2.4,maxY:7.65,initialY:5.2};
let ladderY=LADDER.initialY;
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
export function setLadderY(y){ladderY=clamp(y,LADDER.minY,LADDER.maxY);return ladderY;}
export function getLadderY(){return ladderY;}
export function shelfAccess(slot){
  const [,h,z]=slot.p;
  if(slot.wall==='West'&&-z<=1.85)return h>=3.2?'gallery':'ground';
  return slot.wall==='West'&&h>2.1?'ladder':h>=3.2?'gallery':'ground';
}
export function ladderView(y,eyeHeight=4.75){
  y=clamp(y,LADDER.minY,LADDER.maxY);
  const eye=clamp(eyeHeight,2.4,5.7),z=eye-EYE;
  return {x:1.55-z/5.83*1.08+.22,y,z};
}
export function shelfView(slot){
  const [x,h,z]=slot.p,access=shelfAccess(slot),y=-z;
  if(slot.wall==='West'){
    if(access==='ladder')return {feet:ladderView(y,h+.1),ladder:true};
    return {feet:{x:access==='ground'&&Math.abs(y-ladderY)<.49?1.95:1.45,y:clamp(y,.8,access==='gallery'?1.55:7.9),z:access==='gallery'?3.2:0},ladder:false};
  }
  return {feet:{x:clamp(x,.8,8.6),y:1.15,z:access==='gallery'?3.2:0},ladder:false};
}
export function stairHeight(x,y) {
  const dx=x-7.3,dy=y-3.2,r=Math.hypot(dx,dy);
  const a=(Math.atan2(dy,dx)+Math.PI/6+Math.PI*2)%(Math.PI*2);
  if(r<.38||r>1.18||a>Math.PI*5/3) return null;
  return Math.min(18,Math.floor(a/(Math.PI*5/3/18))+1)*3.2/18;
}
export function floorAt(x,y,previous=0) {
  if(x<.63||x>8.72||y<.62||y>8.15) return null;
  if(nearGalleryGuard(x,y,previous))return null;
  const stair=stairHeight(x,y);
  const landing=x>=7.3&&x<=8.57&&y>=1.83&&y<=2.98;
  const gallery=y<=1.85;
  // Overlapping floor levels are selected from the current elevation.
  if(previous>2.82&&(landing||gallery)) return 3.2;
  if(stair!==null&&Math.abs(stair-previous)<.36) return stair;
  if(previous>.36) return null;
  if(Math.hypot(x-7.3,y-3.2)<.38) return null;
  if(stair!==null&&stair<2.25&&Math.abs(stair-previous)>=.36) return null;
  const radius=.16;
  if(obstacles.some(([x1,x2,y1,y2])=>x>x1-radius&&x<x2+radius&&y>y1-radius&&y<y2+radius)) return null;
  if(Math.hypot(x-3.75,y-5.2)<.57) return null;
  if(x>.65&&x<1.78&&Math.abs(y-ladderY)<.49) return null;
  return 0;
}
export function stepPosition(pos,dx,dy) {
  let next={...pos};
  for(const [mx,my] of [[dx,0],[0,dy]]) {
    const h=floorAt(next.x+mx,next.y+my,next.z);
    if(h!==null&&Math.abs(h-next.z)<.36) next={x:next.x+mx,y:next.y+my,z:h};
  }
  return next;
}
