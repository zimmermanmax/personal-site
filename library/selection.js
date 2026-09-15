export function visibleBookHit(raycaster,volumes,room){
  const hit=raycaster.intersectObject(volumes,false)[0];
  if(!hit||hit.distance>=14)return null;
  const previousFar=raycaster.far;
  try{
    raycaster.far=hit.distance-.003;
    const blocked=room&&raycaster.intersectObject(room,true).some(h=>{
      const m=Array.isArray(h.object.material)?h.object.material[h.face?.materialIndex||0]:h.object.material;
      return m&&m.visible!==false&&!(m.transmission>.1)&&!(m.transparent&&m.opacity<.35);
    });
    return blocked?null:hit.instanceId;
  }finally{raycaster.far=previousFar;}
}
