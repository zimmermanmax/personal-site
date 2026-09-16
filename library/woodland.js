import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {applySnowMaterial} from './snow-material.js';
import {createSnowfall} from './snowfall.js';
const read=async url=>{const r=await fetch(url);if(!r.ok)throw new Error(`Landscape asset unavailable: ${r.status}`);return r.json();};
const nativePoint=([x,y,z])=>[x,-z,y];
// Picture and window area fixtures belong inside the room. Evaluating their
// unshadowed light over the entire forest is costly and lights the wrong space.
const areaGuard='#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )';
if(THREE.ShaderChunk.lights_fragment_begin.split(areaGuard).length!==2)throw new Error('Unexpected outdoor lighting shader');
const outdoorLighting=THREE.ShaderChunk.lights_fragment_begin.replace(areaGuard,'#if 0');
function prepareOutdoorMaterial(material){
  applySnowMaterial(material);
  const previousCompile=material.onBeforeCompile,previousKey=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,renderer){
    previousCompile.call(this,shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',outdoorLighting);
  };
  material.customProgramCacheKey=()=>previousKey+'|outdoor-no-indoor-area-v1';material.needsUpdate=true;
}
export async function createWoodland(scene,release,roomBase){
  const base='./assets/carriage-v18/landscape/';
  const [environment,roomEnvironment,surfaces]=await Promise.all([
    read(base+'environment-manifest-v15.json'),read(roomBase+'environment-manifest-v15.json'),read(base+'runtime-surfaces-v15.json')
  ]);
  if(surfaces.sourceSha256!==release.landscapeSourceSha256)throw new Error('Landscape source does not match the room release');
  const gltf=await new GLTFLoader().loadAsync(base+'carriage-landscape-v15.gltf');
  const exterior=gltf.scene;
  const waterNodes=new Set(environment.water.batchNodes);
  const preparedMaterials=new WeakSet();
  exterior.traverse(o=>{
    if(!o.isMesh)return;o.receiveShadow=true;o.castShadow=!waterNodes.has(o.name);
    for(const material of Array.isArray(o.material)?o.material:[o.material])if(!preparedMaterials.has(material)){preparedMaterials.add(material);prepareOutdoorMaterial(material);}
  });
  scene.add(exterior);
  const fog=environment.fogSuggestion;
  scene.background=new THREE.Color(fog?.color||0xa8b4bc);
  scene.fog=new THREE.Fog(fog?.color||0xa8b4bc,fog?.near??14,fog?.far??65);
  const roofs=roomEnvironment.roofShelter.groups.flatMap(group=>group.parts.flatMap(part=>part.upwardTrianglesGltf.map(t=>t.map(nativePoint))));
  const terrain=[];
  for(const surface of Object.values(surfaces.surfaces)){
    const vertices=surface.verticesGltf.map(nativePoint);
    for(const indices of surface.triangles)terrain.push(indices.map(i=>vertices[i]));
  }
  const snowfall=createSnowfall(scene,roofs,terrain);
  const waterNormals=new Set();
  for(const name of waterNodes){const o=exterior.getObjectByName(name);if(!o)throw new Error('Water batch missing');for(const material of Array.isArray(o.material)?o.material:[o.material])if(material.normalMap)waterNormals.add(material.normalMap);}
  return {surfaces,exterior,update(dt,time){snowfall.update(dt,time);for(const normal of waterNormals){normal.offset.x=time*.012;normal.offset.y=-time*.018;}}};
}
