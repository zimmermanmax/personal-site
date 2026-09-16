import * as THREE from 'three';
import {createRoomArtwork} from './book-room-artwork.js';
import { shelfParts } from './book-shapes.js';
import {createShelfPaperMaterial,createDetailedInspection} from './book-finish.js';
const palette=['#374033','#564332','#5f392f','#3e4847','#776548','#3b3742','#555044','#243f3c'];
function hash(s){let h=0;for(const c of s)h=(Math.imul(h,31)+c.charCodeAt(0))>>>0;return h;}
function coverColor(book){return book.artwork?.spineColor||book.color||palette[hash(book.id)%palette.length];}
function inkColor(color){const c=new THREE.Color(color);return c.r*.299+c.g*.587+c.b*.114>.46?'#272921':'#eee3c6';}
function fitText(ctx,text,width,size,min=8){while(size>min){ctx.font=`${size}px Georgia`;if(ctx.measureText(text).width<=width)break;size--;}return size;}
export function createBooks(scene,records,layout){
  const byId=new Map(records.map(b=>[b.id,b])),items=layout.map(s=>({...s,book:byId.get(s.bookId)}));
  const cube=new THREE.BoxGeometry(1,1,1),bindingMaterial=new THREE.MeshStandardMaterial({roughness:.82});
  const volumes=new THREE.InstancedMesh(cube,new THREE.MeshBasicMaterial({visible:false}),items.length);
  const boards=new THREE.InstancedMesh(cube,bindingMaterial,items.length*2);
  const backs=new THREE.InstancedMesh(cube,bindingMaterial,items.length);
  const paperGeometry=cube.clone();
  const pages=new THREE.InstancedMesh(paperGeometry,createShelfPaperMaterial(paperGeometry,items),items.length);
  const atlas=document.createElement('canvas');atlas.width=2048;atlas.height=4096;const ctx=atlas.getContext('2d');const columns=64,cellW=32,cellH=256;
  const plane=new THREE.PlaneGeometry(1,1),offsets=new Float32Array(items.length*4),dummy=new THREE.Object3D();
  const setPart=(mesh,i,part,color)=>{dummy.position.fromArray(part.p);dummy.rotation.set(0,0,0);dummy.scale.fromArray(part.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(color)mesh.setColorAt(i,color);};
  items.forEach((s,i)=>{setPart(volumes,i,s);const parts=shelfParts(s),binding=new THREE.Color(coverColor(s.book));parts.boards.forEach((p,j)=>setPart(boards,i*2+j,p,binding));setPart(backs,i,parts.spine,binding);setPart(pages,i,parts.paper);
    const x=(i%columns)*cellW,y=Math.floor(i/columns)*cellH,color=coverColor(s.book),ink=s.book.artwork?.spineInk||inkColor(color);
    ctx.fillStyle=color;ctx.fillRect(x,y,cellW,cellH);ctx.fillStyle='#00000025';ctx.fillRect(x,y,3,cellH);ctx.fillStyle=ink;ctx.globalAlpha=.5;ctx.fillRect(x+5,y+14,22,1);ctx.fillRect(x+5,y+cellH-15,22,1);ctx.globalAlpha=1;
    ctx.save();ctx.translate(x+cellW/2,y+cellH/2);ctx.rotate(Math.PI/2);ctx.textAlign='center';ctx.textBaseline='middle';fitText(ctx,s.book.title,cellH-45,13,8);ctx.fillText(s.book.title,0,-5,cellH-45);ctx.font='7px sans-serif';ctx.globalAlpha=.8;ctx.fillText(s.book.author,0,8,cellH-48);ctx.restore();
    offsets.set([x/atlas.width,1-(y+cellH)/atlas.height,cellW/atlas.width,cellH/atlas.height],i*4);
  });
  const texture=new THREE.CanvasTexture(atlas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  plane.setAttribute('atlasRect',new THREE.InstancedBufferAttribute(offsets,4));
  const spineMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:.9});
  spineMaterial.onBeforeCompile=shader=>{shader.vertexShader='attribute vec4 atlasRect; varying vec4 vAtlasRect;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvAtlasRect=atlasRect;');shader.fragmentShader='varying vec4 vAtlasRect;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP\nvec4 sampledDiffuseColor=texture2D(map,vAtlasRect.xy+vMapUv*vAtlasRect.zw);\ndiffuseColor*=sampledDiffuseColor;\n#endif`);};
  spineMaterial.customProgramCacheKey=()=> 'library-spine-atlas-v1';
  const spines=new THREE.InstancedMesh(plane,spineMaterial,items.length);
  items.forEach((s,i)=>{dummy.position.fromArray(s.p);if(s.wall==='West'){dummy.position.x+=s.depth/2+.001;dummy.rotation.set(0,Math.PI/2,0);}else{dummy.position.z-=s.depth/2+.001;dummy.rotation.set(0,Math.PI,0);}dummy.scale.set(s.width,s.height,1);dummy.updateMatrix();spines.setMatrixAt(i,dummy.matrix);});
  // Current reads use the same catalog instances, rotated onto the desk.
  const deskDeltas=new Map();
  items.forEach((s,i)=>{
    if(s.access!=='desk')return;
    const p=new THREE.Vector3().fromArray(s.p),q=new THREE.Quaternion().fromArray(s.rotationGltf);
    const delta=new THREE.Matrix4().makeTranslation(...s.p).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-p.x,-p.y,-p.z));
    deskDeltas.set(i,delta);
    for(const [mesh,stride] of [[volumes,1],[spines,1],[boards,2],[backs,1],[pages,1]])for(let j=0;j<stride;j++){
      const index=i*stride+j,m=new THREE.Matrix4();mesh.getMatrixAt(index,m);mesh.setMatrixAt(index,m.premultiply(delta));mesh.instanceMatrix.needsUpdate=true;
    }

  });
  for(const mesh of [volumes,spines,boards,backs,pages]){mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);}
  const highlight=new THREE.Box3Helper(new THREE.Box3(),0xdfcca5);highlight.visible=false;scene.add(highlight);
  const artwork=createRoomArtwork(scene,items);
  return {items,volumes,spines,boards,backs,pages,highlight,artwork,select(index){if(index===null){highlight.visible=false;return;}const s=items[index],p=new THREE.Vector3().fromArray(s.p),d=new THREE.Vector3().fromArray(s.d).multiplyScalar(.55);highlight.box.set(p.clone().sub(d),p.clone().add(d));if(deskDeltas.has(index))highlight.box.applyMatrix4(deskDeltas.get(index));highlight.visible=true;}};
}
export function createInspection(book,slot){return createDetailedInspection(book,slot,coverColor(book));}
