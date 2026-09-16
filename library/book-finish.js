import * as THREE from 'three';

const PAPER_BASE='./assets/book-realism-v21/paper/';
let sharedPaper;
function paperMaps(){
  if(sharedPaper)return sharedPaper;
  const loader=new THREE.TextureLoader();
  const load=(name,color=false)=>{const t=loader.load(PAPER_BASE+name);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;if(color)t.colorSpace=THREE.SRGBColorSpace;return t;};
  sharedPaper={map:load('paper-edge-albedo.png',true),roughnessMap:load('paper-edge-roughness.png'),normalMap:load('paper-edge-normal.png')};
  return sharedPaper;
}
function hash(id){let n=0;for(const c of id)n=(Math.imul(n,31)+c.charCodeAt(0))>>>0;return n;}
function paperMaterial(){return new THREE.MeshStandardMaterial({...paperMaps(),color:0xffffff,roughness:1,normalScale:new THREE.Vector2(.55,.55)});}

// Box vertices are still in a unit cube here; dimensions and the stacking axis
// belong to each book, before its shelf or desk transform is applied.
export function createShelfPaperMaterial(geometry,items){
  const spec=new Float32Array(items.length*4),phase=new Float32Array(items.length*2);
  items.forEach((s,i)=>{const b=Math.min(.0025,s.width*.08),west=s.wall==='West';
    spec.set(west?[s.depth-.012,s.height-.01,s.width-2*b,1]:[s.width-2*b,s.height-.01,s.depth-.012,0],i*4);
    const h=hash(s.bookId);phase.set([(h&1023)/1024,((h>>>10)&2047)/2048],i*2);
  });
  geometry.setAttribute('paperSpec',new THREE.InstancedBufferAttribute(spec,4));
  geometry.setAttribute('paperPhase',new THREE.InstancedBufferAttribute(phase,2));
  const material=paperMaterial();
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute vec4 paperSpec; attribute vec2 paperPhase;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      vec3 paperP=position*paperSpec.xyz;
      float paperStack=paperSpec.w<.5?paperP.x:paperP.z;
      float paperAcross=abs(normal.y)>.5?(paperSpec.w<.5?paperP.z:paperP.x):paperP.y;
      vec2 paperUV=vec2(paperAcross/.12,paperStack/.064)+paperPhase;
      #ifdef USE_MAP
        vMapUv=paperUV;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv=paperUV;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv=paperUV;
      #endif`);
  };
  material.customProgramCacheKey=()=> 'book-paper-physical-v21';
  return material;
}

function paperBlock(width,height,depth,id,physicalScale=1){
  const r=Math.min(.002,depth*.025),shape=new THREE.Shape();
  shape.moveTo(-width/2+r,-height/2+r);shape.lineTo(width/2-r,-height/2+r);shape.lineTo(width/2-r,height/2-r);shape.lineTo(-width/2+r,height/2-r);shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:depth-2*r,bevelEnabled:true,bevelThickness:r,bevelSize:r,bevelSegments:2,steps:1,curveSegments:1});
  g.translate(0,0,-depth/2+r);
  const pos=g.attributes.position,norm=g.attributes.normal,uv=g.attributes.uv,h=hash(id),a=(h&1023)/1024,b=((h>>>10)&2047)/2048;
  for(let i=0;i<pos.count;i++){
    const across=Math.abs(norm.getY(i))>.5?pos.getX(i):pos.getY(i);
    uv.setXY(i,across*physicalScale/.12+a,pos.getZ(i)*physicalScale/.064+b);
  }
  uv.needsUpdate=true;return g;
}
function wrapped(ctx,text,width){
  const lines=[];let line='';
  for(const word of text.split(/\s+/)){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>width){lines.push(line);line=word;}else line=next;}
  if(line)lines.push(line);return lines;
}
function readableInk(color){
  const luminance=value=>{const c=new THREE.Color(value);return .2126*c.r+.7152*c.g+.0722*c.b;};
  const bg=luminance(color),dark='#272921',light='#f3ead8',contrast=ink=>{const l=luminance(ink);return (Math.max(bg,l)+.05)/(Math.min(bg,l)+.05);};
  return contrast(dark)>contrast(light)?dark:light;
}
export function paintBookBack(canvas,book,color,aspect){
  if(!Number.isFinite(aspect)||aspect<=0)throw new Error('Invalid book board aspect: '+book.id);
  canvas.width=900;canvas.height=Math.round(900/aspect);
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,k=Math.min(1,h/1150),m=Math.round(78*k),ink=readableInk(color);
  ctx.fillStyle=color;ctx.fillRect(0,0,w,h);ctx.fillStyle='#00000014';ctx.fillRect(0,0,w,h);
  const border=Math.round(36*k);ctx.strokeStyle=ink;ctx.globalAlpha=.3;ctx.lineWidth=1.5;ctx.strokeRect(border,border,w-2*border,h-2*border);ctx.globalAlpha=1;
  ctx.textBaseline='top';ctx.fillStyle=ink;ctx.textAlign='left';
  const title=book.title.split(':')[0].replace(/\s*\([^)]*\)\s*$/,'');
  const titleSize=Math.max(34,46*k);ctx.font=`${titleSize}px Georgia`;const titleLines=wrapped(ctx,title,w-2*m);let y=110*k;
  for(const line of titleLines){ctx.fillText(line,m,y);y+=titleSize*1.22;}
  y+=18*k;ctx.font=`${Math.max(22,26*k)}px Georgia`;for(const line of wrapped(ctx,book.author,w-2*m)){ctx.fillText(line,m,y);y+=36*k;}
  y+=48*k;ctx.globalAlpha=.35;ctx.fillRect(m,y,w-2*m,1.5);ctx.globalAlpha=1;y+=46*k;
  const text=book.description?.reviewStatus==='reviewed'?book.description.text:'';
  const content=text||'A description is being prepared for this book.';
  const footerY=h-115*k;let fontSize=32,lines;
  do{ctx.font=`${fontSize}px Georgia`;lines=wrapped(ctx,content,w-2*m);if(y+lines.length*fontSize*1.46<footerY-35)break;fontSize-=1;}while(fontSize>=25);
  if(y+lines.length*fontSize*1.46>=footerY-35)throw new Error('Back description exceeds readable layout: '+book.id);
  for(const line of lines){ctx.fillText(line,m,y);y+=fontSize*1.46;}
  ctx.font='21px Georgia';ctx.globalAlpha=.65;ctx.fillText(text?'About this book':'Max’s library',m,footerY);
  canvas.dataset.bookId=book.id;canvas.dataset.descriptionWords=String(text?text.split(/\s+/).length:0);canvas.dataset.bodyFont=String(fontSize);
}
export function createDetailedInspection(book,slot,color){
  const height=.76,width=height*(slot?slot.depth/slot.height:2/3),depth=height*(slot?slot.width/slot.height:.06),board=Math.min(.007,depth*.08);
  const group=new THREE.Group(),binding=new THREE.Group();group.rotation.set(-.05,-.25,0);group.add(binding);
  const paper=paperMaterial(),leather=new THREE.MeshStandardMaterial({color,roughness:.8});
  const front=document.createElement('canvas');front.width=512;front.height=768;const c=front.getContext('2d');
  c.fillStyle=color;c.fillRect(0,0,512,768);c.strokeStyle='#d9cba2';c.lineWidth=2;c.strokeRect(26,26,460,716);c.fillStyle=readableInk(color);c.textAlign='center';c.font='34px Georgia';wrapped(c,book.title,400).slice(0,9).forEach((t,i)=>c.fillText(t,256,190+i*46,414));c.font='22px Georgia';c.fillText(book.author,256,660,410);c.font='13px sans-serif';c.globalAlpha=.65;c.fillText('TITLE COVER · ORIGINAL ARTWORK UNAVAILABLE',256,707,410);
  const texture=new THREE.CanvasTexture(front);texture.colorSpace=THREE.SRGBColorSpace;
  const frontMat=new THREE.MeshStandardMaterial({map:texture,roughness:.85});
  const backCanvas=document.createElement('canvas');paintBookBack(backCanvas,book,color,width/height);
  const backTexture=new THREE.CanvasTexture(backCanvas);backTexture.colorSpace=THREE.SRGBColorSpace;backTexture.anisotropy=8;
  const backMat=new THREE.MeshStandardMaterial({map:backTexture,roughness:.88});
  const spineCanvas=document.createElement('canvas');spineCanvas.width=128;spineCanvas.height=1024;const sc=spineCanvas.getContext('2d');sc.fillStyle=color;sc.fillRect(0,0,128,1024);sc.translate(64,512);sc.rotate(Math.PI/2);sc.fillStyle=readableInk(color);sc.textAlign='center';sc.font='38px Georgia';sc.fillText(book.title,0,-10,850);sc.font='22px sans-serif';sc.fillText(book.author,0,34,850);
  const spineTexture=new THREE.CanvasTexture(spineCanvas);spineTexture.colorSpace=THREE.SRGBColorSpace;const spineMat=new THREE.MeshStandardMaterial({map:spineTexture,roughness:.8});
  const meshes=[];const mesh=(geometry,material,x=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,0,z);binding.add(m);meshes.push(m);return m;};
  mesh(paperBlock(width-.026,height-.026,depth-2*board,book.id,slot?slot.height/height:1/3),paper,.006).name='Held paper | '+book.id;
  const box=(w,h,d,material,x=0,z=0)=>mesh(new THREE.BoxGeometry(w,h,d),material,x,z);
  box(width,height,board,[leather,leather,leather,leather,frontMat,leather],0,(depth-board)/2);
  box(width,height,board,[leather,leather,leather,leather,leather,backMat],0,-(depth-board)/2);
  box(.014,height-.005,depth,[leather,spineMat,leather,leather,leather,leather],-(width-.014)/2);
  const resources=[texture,spineTexture,backTexture];let disposed=false;
  if(book.cover)new THREE.TextureLoader().load(book.cover,t=>{if(disposed){t.dispose();return;}t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;resources.push(t);frontMat.map=t;frontMat.needsUpdate=true;
    // Fit original artwork within the existing board, keeping physical binding
    // proportions identical to the native/shelf book and leaving quiet margins.
    const ratio=t.image.width/t.image.height,artHeight=Math.min(height,width/ratio),artWidth=artHeight*ratio;
    frontMat.map=null;frontMat.color.set(color);frontMat.needsUpdate=true;
    const artMaterial=new THREE.MeshStandardMaterial({map:t,roughness:.85});
    const art=mesh(new THREE.PlaneGeometry(artWidth,artHeight),artMaterial,0,depth/2+.00001);art.name='Held front artwork | '+book.id;
    art.userData.ownedMaterial=true;
  },undefined,()=>{});
  return {group,backCanvas,dimensions:{width,height,depth},dispose(){disposed=true;group.removeFromParent();meshes.forEach(m=>{m.geometry.dispose();if(m.userData.ownedMaterial)m.material.dispose();});[paper,leather,frontMat,backMat,spineMat].forEach(m=>m.dispose());resources.forEach(t=>t.dispose());}};
}
