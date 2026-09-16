// Portable approximation of the native winter coating over retained PBR maps.
// The underlying texture/UV export is verified separately; this shader is not
// claimed to reproduce Blender's noise implementation or BSDF mixture exactly.
const declarations = `
varying vec3 vSnowPosition;
varying vec3 vSnowNormal;
float snowHash(vec3 p) {
  p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float snowNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(snowHash(i),snowHash(i+vec3(1,0,0)),f.x),
                 mix(snowHash(i+vec3(0,1,0)),snowHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(snowHash(i+vec3(0,0,1)),snowHash(i+vec3(1,0,1)),f.x),
                 mix(snowHash(i+vec3(0,1,1)),snowHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float snowFbm(vec3 p) {
  return (snowNoise(p) + 0.5*snowNoise(p*2.0) + 0.25*snowNoise(p*4.0))/1.75;
}
`;

export function applySnowMaterial(material) {
  const role = material.userData?.snowRole;
  if (!role) return false;
  if (role === 'pure-snow' || material.userData?.snowTreatment === 'pure-snow-pbr') return false;
  if (!['dust', 'bank', 'gravel'].includes(role)) throw new Error(`Unknown snow coating ${role}`);
  const gravel = role === 'gravel', bank = role === 'bank';
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec3 vSnowPosition; varying vec3 vSnowNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <defaultnormal_vertex>',
      '#include <defaultnormal_vertex>\nvSnowNormal = inverseTransformDirection(transformedNormal, viewMatrix);');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvSnowPosition = (modelMatrix * vec4(transformed,1.0)).xyz;');
    shader.fragmentShader = declarations + shader.fragmentShader;
    const factor = `
      vec3 snowBlenderPosition = vec3(vSnowPosition.x,-vSnowPosition.z,vSnowPosition.y);
      float retention = clamp((snowFbm(snowBlenderPosition*${gravel ? '1.8' : '3.2'})-0.30)/0.40,0.0,1.0);
      float snowCover = mix(${gravel ? '0.05,0.68' : '0.55,0.95'},retention);
      ${gravel ? '' : 'snowCover *= clamp((normalize(vSnowNormal).y-0.25)/0.55,0.0,1.0);'}
      ${bank ? 'snowCover *= clamp((vSnowPosition.y+0.24)/0.16,0.0,1.0);' : ''}
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.76,0.81,0.86), snowCover);
    `;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + factor);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor,0.88,snowCover);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>',
      '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0-snowCover;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>',
      '#include <normal_fragment_maps>\nnormal = normalize(mix(normal,nonPerturbedNormal,snowCover));');
  };
  material.customProgramCacheKey = () => `woodland-snow-v15-${role}`;
  material.needsUpdate = true;
  return true;
}
