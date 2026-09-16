import * as THREE from 'three';
const BASE='./assets/book-realism-v25/shelf/';
export function createRoomArtwork(scene,items){
  const batches=[];
  const ready=(async()=>{const response=await fetch(BASE+'manifest.json');if(!response.ok)throw new Error('Book face artwork unavailable');const manifest=await response.json(),byId=new Map(items.map(s=>[s.bookId,s])),loader=new THREE.TextureLoader();
    for(let page=0;page<manifest.pages.length;page++){
      const faces=manifest.faces.filter(f=>f.page===page),g=new THREE.PlaneGeometry(1,1),uv=new Float32Array(faces.length*4),map=await loader.loadAsync(BASE+manifest.pages[page].file);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
      const material=new THREE.MeshStandardMaterial({map,roughness:.85,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
      material.onBeforeCompile=shader=>{shader.vertexShader='attribute vec4 artworkRect; varying vec4 vArtworkRect;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvArtworkRect=artworkRect;');shader.fragmentShader='varying vec4 vArtworkRect;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#ifdef USE_MAP\nvec4 sampledDiffuseColor=texture2D(map,vArtworkRect.xy+vMapUv*vArtworkRect.zw);\ndiffuseColor*=sampledDiffuseColor;\n#endif');};material.customProgramCacheKey=()=> 'library-book-faces-v23';
      const mesh=new THREE.InstancedMesh(g,material,faces.length),dummy=new THREE.Object3D(),rest=[];mesh.name='Book front and back faces '+page;mesh.receiveShadow=true;
      faces.forEach((f,i)=>{const s=byId.get(f.bookId);if(!s)throw new Error('Book face has no catalogue binding');const sign=f.role==='front'?-1:1,p=new THREE.Vector3().fromArray(s.p);dummy.position.copy(p);dummy.rotation.set(0,0,0);
        if(s.access==='desk'){const q=new THREE.Quaternion().fromArray(s.rotationGltf);dummy.position.add(new THREE.Vector3(sign*(s.width/2+.00008),0,0).applyQuaternion(q));dummy.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),sign*Math.PI/2));}
        else if(s.wall==='West'){dummy.position.z+=sign*(s.width/2+.00008);dummy.rotation.y=sign===1?0:Math.PI;}
        else{dummy.position.x+=sign*(s.width/2+.00008);dummy.rotation.y=sign*Math.PI/2;}
        dummy.scale.set(s.depth,s.height,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);rest.push({bookId:f.bookId,index:i,matrix:dummy.matrix.clone()});uv.set(f.uv,i*4);
      });g.setAttribute('artworkRect',new THREE.InstancedBufferAttribute(uv,4));mesh.computeBoundingSphere();scene.add(mesh);batches.push({mesh,rest});
    }
  })().catch(error=>{console.warn('Some shelf cover artwork could not load; book inspection and the room remain available.',error);});
  return {ready,batches,update(delta,ids){const transform=new THREE.Matrix4();for(const {mesh,rest}of batches){let changed=false;for(const r of rest)if(ids.has(r.bookId)){mesh.setMatrixAt(r.index,transform.multiplyMatrices(delta,r.matrix));changed=true;}if(changed){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}}}};
}
