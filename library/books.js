import * as THREE from 'three';
import { shelfParts } from './book-shapes.js';
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
  const pages=new THREE.InstancedMesh(cube,new THREE.MeshStandardMaterial({color:0xd8d0ba,roughness:.98}),items.length);
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
  for(const mesh of [volumes,spines,boards,backs,pages]){mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);}
  const highlight=new THREE.Box3Helper(new THREE.Box3(),0xdfcca5);highlight.visible=false;scene.add(highlight);
  return {items,volumes,spines,highlight,select(index){if(index===null){highlight.visible=false;return;}const s=items[index],p=new THREE.Vector3().fromArray(s.p),d=new THREE.Vector3().fromArray(s.d).multiplyScalar(.55);highlight.box.set(p.clone().sub(d),p.clone().add(d));highlight.visible=true;}};
}
export function createInspection(book,slot){
  const height=.76,width=height*(slot?slot.depth/slot.height:2/3),depth=height*(slot?slot.width/slot.height:.06),board=Math.min(.007,depth*.08),group=new THREE.Group();group.rotation.set(-.05,-.25,0);
  const binding=new THREE.Group();group.add(binding);
  const paper=new THREE.MeshStandardMaterial({color:0xd6cdb6,roughness:1});
  const leather=new THREE.MeshStandardMaterial({color:coverColor(book),roughness:.8});
  const front=document.createElement('canvas');front.width=512;front.height=768;const c=front.getContext('2d');c.fillStyle=coverColor(book);c.fillRect(0,0,512,768);c.strokeStyle='#d9cba2';c.lineWidth=2;c.strokeRect(26,26,460,716);c.fillStyle=inkColor(coverColor(book));c.textAlign='center';c.font='34px Georgia';
  const words=book.title.split(' ');let line='',lines=[];for(const word of words){if(c.measureText(line+word).width>400&&line){lines.push(line.trim());line='';}line+=word+' ';}lines.push(line.trim());lines.slice(0,9).forEach((t,i)=>c.fillText(t,256,190+i*46,414));c.font='22px Georgia';c.fillText(book.author,256,660,410);c.font='13px sans-serif';c.globalAlpha=.65;c.fillText('TITLE COVER · ORIGINAL ARTWORK UNAVAILABLE',256,707,410);
  const texture=new THREE.CanvasTexture(front);texture.colorSpace=THREE.SRGBColorSpace;
  const frontMat=new THREE.MeshStandardMaterial({map:texture,roughness:.85});
  const spineCanvas=document.createElement('canvas');spineCanvas.width=128;spineCanvas.height=1024;const sc=spineCanvas.getContext('2d');sc.fillStyle=coverColor(book);sc.fillRect(0,0,128,1024);sc.translate(64,512);sc.rotate(Math.PI/2);sc.fillStyle=inkColor(coverColor(book));sc.textAlign='center';sc.font='38px Georgia';sc.fillText(book.title,0,-10,850);sc.font='22px sans-serif';sc.fillText(book.author,0,34,850);const spineTexture=new THREE.CanvasTexture(spineCanvas);spineTexture.colorSpace=THREE.SRGBColorSpace;const spineMat=new THREE.MeshStandardMaterial({map:spineTexture,roughness:.8});
  const meshes=[];
  const box=(w,h,d,material,x=0,z=0)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,0,z);binding.add(mesh);meshes.push(mesh);return mesh;};
  box(width-.026,height-.026,depth-2*board,paper,.006);
  box(width,height,board,[leather,leather,leather,leather,frontMat,leather],0,(depth-board)/2);
  box(width,height,board,leather,0,-(depth-board)/2);
  box(.014,height-.005,depth,[leather,spineMat,leather,leather,leather,leather],-(width-.014)/2);
  const resources=[texture,spineTexture];let disposed=false;
  if(book.cover)new THREE.TextureLoader().load(book.cover,t=>{if(disposed){t.dispose();return;}t.colorSpace=THREE.SRGBColorSpace;resources.push(t);frontMat.map=t;frontMat.needsUpdate=true;
    // Preserve the original artwork's aspect ratio without cropping it.
    const ratio=t.image.width/t.image.height,targetHeight=Math.min(.76,.62/ratio);binding.scale.set(targetHeight*ratio/width,targetHeight/height,1);
  },undefined,()=>{});
  return {group,dispose(){disposed=true;group.removeFromParent();meshes.forEach(m=>m.geometry.dispose());[paper,leather,frontMat,spineMat].forEach(m=>m.dispose());resources.forEach(t=>t.dispose());}};
}
