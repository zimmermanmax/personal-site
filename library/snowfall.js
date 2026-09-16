import * as THREE from 'three';
import {createHeightSampler} from './height-sampler.js';

export function createSnowfall(scene, roofTriangles, terrainTriangles) {
  const roofHeight = createHeightSampler(roofTriangles), groundHeight = createHeightSampler(terrainTriangles);
  const count = 1500, positions = new Float32Array(count*3), speed = new Float32Array(count);
  let seed=151509;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const surfaceAt=(x,y)=>Math.max(roofHeight(x,y)??-5,groundHeight(x,y)??-5);
  function reset(i,top=false) {
    const x=-12+random()*40, y=-15+random()*45, base=surfaceAt(x,y)+.14;
    positions.set([x,top?15.5:base+random()*(15.5-base),-y],i*3);
    speed[i]=.48+random()*.6;
  }
  for(let i=0;i<count;i++) reset(i);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material=new THREE.PointsMaterial({color:0xeaf1f5,size:.037,transparent:true,opacity:.74,depthWrite:false});
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\nfloat flakeRadius=length(gl_PointCoord-vec2(0.5)); if(flakeRadius>0.5) discard; diffuseColor.a*=1.0-smoothstep(0.28,0.5,flakeRadius);');
  };
  material.customProgramCacheKey=()=> 'woodland-snowflakes-v15';
  const snow=new THREE.Points(geometry,material);snow.name='Quiet snowfall';snow.frustumCulled=false;scene.add(snow);
  return {
    groundHeight,
    update(dt,time) {
      for(let i=0;i<count;i++) {
        const k=i*3;
        positions[k]+=(.065+.045*Math.sin(time*.4+i))*dt;
        positions[k+2]+=.025*Math.cos(time*.3+i*.47)*dt;
        positions[k+1]-=speed[i]*dt;
        // Recheck horizontal drift against the actual roof footprint every frame.
        // Flakes reset before reaching a sheltered interior or the ground.
        if(positions[k]>28||positions[k]<-12||positions[k+2]<-30||positions[k+2]>15||positions[k+1]<surfaceAt(positions[k],-positions[k+2])+.12) reset(i,true);
      }
      geometry.attributes.position.needsUpdate=true;
    },
  };
}
