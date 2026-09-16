import * as THREE from 'three';

const sourceName=material=>material.userData?.source_material||material.name.replace(/^WEB \| /,'');
const bottleNames=new Set(['Cozy artifacts | clear thin bottle glass','Cozy v20 | clear neutral Endurance bottle glass']);

// Call before the app's general glass/window branch; true means handled here.
export function prepareBottleGlass(material){
  if(!bottleNames.has(sourceName(material)))return false;
  material.color.setRGB(.995,.997,1);
  material.transmission=1;
  material.roughness=.018;
  material.ior=1.45;
  material.thickness=.001344;
  material.attenuationColor.setRGB(1,1,1);
  material.attenuationDistance=Infinity;
  material.transparent=false;
  material.opacity=1;
  material.depthWrite=false;
  material.side=THREE.FrontSide;
  material.envMapIntensity=.65;
  material.needsUpdate=true;
  return true;
}

// Install after the room loads and before its single reflection capture.
// The native geometry supplies every flame/ember; this supplies local light.
export function createHearthFire(scene,room,{reducedMotion=false}={}){
  const materials=new Map();
  room.traverse(object=>{
    if(!object.isMesh)return;
    const list=Array.isArray(object.material)?object.material:[object.material];
    for(const material of list){
      const name=sourceName(material);
      if(name.startsWith('Cozy v20 | fire flame ')){
        material.transparent=true;material.depthWrite=false;material.needsUpdate=true;
      }
      if(name.startsWith('Cozy v20 | fire ')&&material.emissiveIntensity>0&&material.emissive?.getHex()!==0)
        materials.set(material,{base:material.emissiveIntensity,phase:materials.size*.61});
    }
    if(list.every(m=>sourceName(m).startsWith('Cozy v20 | fire flame ')))object.castShadow=false;
  });
  if(!materials.size)throw new Error('The v20 fireplace emissive materials are missing');
  const light=new THREE.PointLight(0xff7b2f,16,4.2,2);
  light.name='Cozy v20 | hearth warm pool';light.position.set(.39,.43,-4.275);
  light.castShadow=true;light.shadow.mapSize.set(512,512);
  light.shadow.camera.near=.05;light.shadow.camera.far=4.2;
  light.shadow.normalBias=.006;light.shadow.bias=-.00008;
  // The renderer caches shadows globally; allow explicit door/ladder refreshes.
  light.shadow.autoUpdate=true;light.shadow.needsUpdate=true;
  scene.add(light);
  return {light,materialCount:materials.size,
    update(time){
      if(reducedMotion)return;
      const glow=1+.075*Math.sin(time*3.7)+.035*Math.sin(time*8.3+.8);
      light.intensity=16*glow;
      for(const [material,{base,phase}]of materials)
        material.emissiveIntensity=base*(1+.075*Math.sin(time*4.1+phase)+.025*Math.sin(time*9.7-phase));
    },
    dispose(){
      for(const [material,{base}]of materials)material.emissiveIntensity=base;
      scene.remove(light);light.shadow.map?.dispose();
    }
  };
}
