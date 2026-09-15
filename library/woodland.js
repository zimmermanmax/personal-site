import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export async function createWoodland(scene,previous=false){
  if(previous)return createLegacyWoodland(scene);
  const response=await fetch('./assets/woodland-manifest-v10.json');if(!response.ok)throw new Error('Woodland description unavailable.');
  const spec=await response.json(),gltf=await new GLTFLoader().loadAsync('./assets/woodland-v10.glb');
  const exterior=gltf.scene;exterior.traverse(o=>{if(o.isMesh){o.receiveShadow=true;o.castShadow=!o.name.includes('Water');}});scene.add(exterior);
  scene.fog=new THREE.Fog(spec.fog_suggestion_three.color,spec.fog_suggestion_three.near,spec.fog_suggestion_three.far);
  const water=exterior.getObjectByName(spec.water.object),normal=water?.material?.normalMap;
  let seed=spec.seed;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const count=spec.rain.count,positions=new Float32Array(count*6),zones=[spec.rain.bounds_blender,spec.rain.east_bounds_blender];
  const zoneFor=i=>zones[i%2];
  function resetDrop(i,atTop=false){const [lo,hi]=zoneFor(i),x=lo[0]+random()*(hi[0]-lo[0]),y=atTop?hi[2]:lo[2]+random()*(hi[2]-lo[2]),z=-(lo[1]+random()*(hi[1]-lo[1]));positions.set([x,y,z,x-.035,y+.40,z],i*6);}
  for(let i=0;i<count;i++)resetDrop(i);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const rain=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xb9cac7,transparent:true,opacity:.16,depthWrite:false}));rain.frustumCulled=false;scene.add(rain);
  const rings=new THREE.Group(),ringGeometry=new THREE.RingGeometry(.96,1,32),[px,py,pz]=spec.water.pond_center_blender,[rx,ry]=spec.water.pond_radii_m;
  for(let i=0;i<14;i++){const a=random()*Math.PI*2,r=Math.sqrt(random())*.78,ring=new THREE.Mesh(ringGeometry,new THREE.MeshBasicMaterial({color:0xbaccc5,transparent:true,opacity:.1,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(px+Math.cos(a)*rx*r,pz+.006,-py+Math.sin(a)*ry*r);rings.add(ring);}scene.add(rings);
  const velocity=spec.rain.velocity_gltf_m_s;
  return {update(dt,time){
    for(let i=0;i<count;i++){const offset=i*6,[lo,hi]=zoneFor(i);for(let axis=0;axis<3;axis++){positions[offset+axis]+=velocity[axis]*dt;positions[offset+3+axis]+=velocity[axis]*dt;}
      if(positions[offset+1]<lo[2]||positions[offset]>hi[0]||positions[offset]<lo[0])resetDrop(i,true);
    }geometry.attributes.position.needsUpdate=true;
    if(normal){normal.offset.x=time*.012;normal.offset.y=-time*.018;}
    rings.children.forEach((ring,i)=>{const age=(time*.32+i/14)%1;ring.scale.setScalar(.03+age*.3);ring.material.opacity=(1-age)*.13;});
  }};
}
function createLegacyWoodland(scene) {
  let seed=3297;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const dummy=new THREE.Object3D();
  const earth=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshStandardMaterial({color:0x475044,roughness:1}));
  earth.rotation.x=-Math.PI/2;earth.position.set(5,-.18,-5);earth.receiveShadow=true;scene.add(earth);
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.14,.24,1,7),new THREE.MeshStandardMaterial({color:0x3b3e32,roughness:1}),130);
  const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0x435341,roughness:1}),390);
  let count=0;const positions=[];
  while(count<130){const x=random()*82-35,z=-(random()*72-8);if(x<11&&z>-11)continue;if(x>7&&x<16&&z<-12&&z>-27)continue;
    const h=8+random()*12,r=.8+random()*1.6;dummy.position.set(x,h/2,z);dummy.scale.set(r,h,r);dummy.rotation.set(0,random()*6,0);dummy.updateMatrix();trunks.setMatrixAt(count,dummy.matrix);
    for(let j=0;j<3;j++){dummy.position.set(x+(random()-.5)*2,h-1+j*1.3,z+(random()-.5)*2);dummy.scale.set(2+random()*2,2.5+random()*2,2+random()*2);dummy.updateMatrix();crowns.setMatrixAt(count*3+j,dummy.matrix);crowns.setColorAt(count*3+j,new THREE.Color().setHSL(.23+random()*.06,.10+random()*.13,.16+random()*.1));}positions.push([x,z]);count++;
  }
  trunks.castShadow=true;crowns.castShadow=true;scene.add(trunks,crowns);
  const waterMaterial=new THREE.MeshStandardMaterial({color:0x687d78,roughness:.24,metalness:.3,transparent:true,opacity:.9});
  const pond=new THREE.Mesh(new THREE.CircleGeometry(1,72),waterMaterial);pond.rotation.x=-Math.PI/2;pond.scale.set(4.2,2.9,1);pond.position.set(10,-.1,-17);scene.add(pond);
  const path=new THREE.CatmullRomCurve3([new THREE.Vector3(19,-.105,-48),new THREE.Vector3(11,-.105,-33),new THREE.Vector3(14,-.105,-26),new THREE.Vector3(10,-.105,-17),new THREE.Vector3(6,-.105,-13),new THREE.Vector3(13,-.105,-11),new THREE.Vector3(19,-.105,-5),new THREE.Vector3(28,-.105,-3)]);
  const verts=[],uv=[],indices=[],segments=110;
  for(let i=0;i<=segments;i++){const p=path.getPoint(i/segments),t=path.getTangent(i/segments),n=new THREE.Vector3(-t.z,0,t.x),width=.6+.2*Math.sin(i*.2);for(const sign of [-1,1]){verts.push(p.x+n.x*width*sign,p.y,p.z+n.z*width*sign);uv.push(i/segments,sign===1?1:0);}if(i<segments){let a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}}
  const streamGeometry=new THREE.BufferGeometry();streamGeometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));streamGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));streamGeometry.setIndex(indices);streamGeometry.computeVertexNormals();const stream=new THREE.Mesh(streamGeometry,waterMaterial);stream.material.side=THREE.DoubleSide;scene.add(stream);
  const stoneMat=new THREE.MeshStandardMaterial({color:0x626356,roughness:1}),stones=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),stoneMat,100);
  for(let i=0;i<100;i++){const t=i/100,p=path.getPoint(t),tan=path.getTangent(t),sign=i%2?1:-1;dummy.position.set(p.x-tan.z*.9*sign,-.05,p.z+tan.x*.9*sign);dummy.rotation.set(random(),random()*6,random());dummy.scale.set(.15+random()*.22,.12+random()*.16,.17+random()*.22);dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);}scene.add(stones);
  const rainCount=1250,rainPositions=new Float32Array(rainCount*6);
  for(let i=0;i<rainCount;i++){let x=random()*50-18,z=-(random()*48-5);if(x<9.4&&z>-8.8){z-=14;}const y=random()*23;rainPositions.set([x,y,z,x-.04,y+.45,z+.02],i*6);}
  const rainGeometry=new THREE.BufferGeometry();rainGeometry.setAttribute('position',new THREE.BufferAttribute(rainPositions,3));const rain=new THREE.LineSegments(rainGeometry,new THREE.LineBasicMaterial({color:0xb9cac7,transparent:true,opacity:.19,depthWrite:false}));scene.add(rain);
  const rings=new THREE.Group();const ringGeometry=new THREE.RingGeometry(.96,1,48);for(let i=0;i<9;i++){const ring=new THREE.Mesh(ringGeometry,new THREE.MeshBasicMaterial({color:0xc5d3c6,transparent:true,opacity:.15,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(8+random()*4,-.086,-16-random()*3);rings.add(ring);}scene.add(rings);
  return {update(dt,time){const a=rainGeometry.attributes.position;for(let i=0;i<rainCount;i++){let o=i*6;a.array[o+1]-=dt*8;a.array[o+4]-=dt*8;if(a.array[o+1]<0){a.array[o+1]+=23;a.array[o+4]+=23;}}a.needsUpdate=true;rings.children.forEach((r,i)=>{const k=(time*.25+i/9)%1;r.scale.setScalar(.1+k*1.2);r.material.opacity=(1-k)*.17;});}};
}
