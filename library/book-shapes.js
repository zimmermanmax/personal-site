// Illustrative binding geometry fitted to the existing, permanent shelf slot.
// Catalog dimensions are not known; these are not measurements of an edition.
export function shelfParts(slot){
  const {width:w,height:h,depth:d}=slot,b=Math.min(.0025,w*.08);
  const orient=([x,y,z])=>slot.wall==='West'?[z,y,x]:[x,y,z];
  const size=([x,y,z])=>slot.wall==='West'?[z,y,x]:[x,y,z];
  const part=(offset,dimensions)=>({p:orient(offset).map((n,i)=>n+slot.p[i]),d:size(dimensions)});
  const outward=slot.wall==='West'?1:-1;
  return {
    boards:[part([-(w-b)/2,0,0],[b,h,d]),part([(w-b)/2,0,0],[b,h,d])],
    paper:part([0,0,0],[w-2*b,h-.01,d-.012]),
    spine:part([0,0,outward*(d-.005)/2],[w-2*b,h,.005]),
  };
}
