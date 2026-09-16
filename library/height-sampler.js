// Upward projected triangle heights in the Blender floor plan (x,y,z-up).
// A spatial index keeps snow respawns and outdoor footsteps inexpensive.
export function createHeightSampler(triangles, cellSize = 3) {
  const cells = new Map();
  for (const t of triangles) {
    const [a,b,c] = t;
    const determinant = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if (Math.abs(determinant) < 1e-10) continue;
    const row = {a,b,c,determinant};
    const minX = Math.floor(Math.min(a[0],b[0],c[0])/cellSize), maxX = Math.floor(Math.max(a[0],b[0],c[0])/cellSize);
    const minY = Math.floor(Math.min(a[1],b[1],c[1])/cellSize), maxY = Math.floor(Math.max(a[1],b[1],c[1])/cellSize);
    for (let x=minX;x<=maxX;x++) for(let y=minY;y<=maxY;y++) {
      const key = `${x},${y}`;
      if(!cells.has(key)) cells.set(key,[]);
      cells.get(key).push(row);
    }
  }
  return (x,y) => {
    const rows = cells.get(`${Math.floor(x/cellSize)},${Math.floor(y/cellSize)}`) || [];
    let highest = null;
    for (const {a,b,c,determinant} of rows) {
      const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/determinant;
      const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/determinant;
      if(u < -1e-7 || v < -1e-7 || u+v > 1+1e-7) continue;
      const z = u*a[2]+v*b[2]+(1-u-v)*c[2];
      highest = highest===null ? z : Math.max(highest,z);
    }
    return highest;
  };
}
