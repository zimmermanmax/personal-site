import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

// Keep the previous rig available for an honest same-view finish comparison.
export function createLighting(scene, camera, renderer, previous = false) {
  const lights = new THREE.Group();
  lights.name = previous ? 'Original browser light' : 'Winter daylight and warm reading lamps';
  renderer.toneMappingExposure = previous ? 1.22 : 1.12;
  scene.background = new THREE.Color(previous ? 0x8e9a91 : 0xc8d4e1);
  scene.fog = new THREE.FogExp2(previous ? 0x8e9a91 : 0xc8d4e1, previous ? .014 : .018);
  lights.add(new THREE.HemisphereLight(0xe2e9f4, 0x776342, previous ? 2.1 : .78));

  const daylight = new THREE.DirectionalLight(0xdce7ed, previous ? 2.4 : 1.3);
  daylight.position.set(13, 13, -15);
  daylight.target.position.set(3, 0, -2);
  daylight.castShadow = true;
  daylight.shadow.mapSize.set(2048, 2048);
  Object.assign(daylight.shadow.camera, {left:-12, right:12, top:12, bottom:-12, near:.5, far:45});
  daylight.shadow.normalBias = .02;
  daylight.shadow.bias = -.0001;
  daylight.shadow.radius = previous ? 1 : 3;
  lights.add(daylight, daylight.target);

  for (const [x,y,z,power,color] of [[4,4,-4,previous?40:28,0xffd199], [4.73,1.2,-4.12,8,0xffc58c], [7.8,1.3,-7.4,previous?9:13,0xffd69d], [2.8,4.8,-.9,10,0xffd9a8]]) {
    const light = new THREE.PointLight(color, power, 9, 2);
    light.position.set(x,y,z);
    lights.add(light);
  }
  if (!previous) {
    RectAreaLightUniformsLib.init();
    // Broad window sources bring soft winter daylight across the leather.
    for (const [p,target,w,h,intensity] of [[[4.8,3.1,-8.25],[4.8,1.2,-4],7.2,5.2,2.0], [[8.85,3.2,-4.5],[4.5,1.4,-4.5],6.4,5.1,1.25]]) {
      const window = new THREE.RectAreaLight(0xd6e2e3, intensity, w, h);
      window.position.fromArray(p);
      window.lookAt(...target);
      lights.add(window);
    }
    const overhead = new THREE.SpotLight(0xffd2a2, 22, 10, 1.1, .88, 2);
    overhead.position.set(4.1,4.05,-4.1);
    overhead.target.position.set(4.9,0,-5.2);
    overhead.castShadow = true;
    overhead.shadow.mapSize.set(1024,1024);
    overhead.shadow.camera.near = .15;
    overhead.shadow.camera.far = 11;
    overhead.shadow.normalBias = .012;
    overhead.shadow.bias = -.0001;
    overhead.shadow.radius = 3;
    lights.add(overhead,overhead.target);
    const porch = new THREE.PointLight(0xffd3a4, 7, 5, 2);
    porch.position.set(4.92,2.62,2.24);
    lights.add(porch);
    // Aim the picture and favourites-case lights at their own surfaces.
    for (const [p,target,width] of [
      [[.55,3.27,-4.275],[.24,2.43,-4.275],1.9],
      [[2.86,5.22,-.45],[2.86,4.65,-.15],1.9],
      [[2.825,3.02,-.45],[2.825,2.51,-.15],.8],
      [[6.55,2.56,-.45],[6.55,1.70,-.15],.85],
      [[4.925,5.80,-.54],[4.925,4.7,-.28],.50],
    ]) {
      const picture = new THREE.RectAreaLight(0xffdfb9, 2.4, width, .06);
      picture.position.fromArray(p);picture.lookAt(...target);lights.add(picture);
    }
  }
  scene.add(lights);
  const inspection = new THREE.PointLight(0xffeed4,3,3,2);
  inspection.position.set(0,.5,-.7);
  inspection.visible = previous;
  camera.add(inspection);

  return {
    inspection,
    prepareReflections() {
      if(previous) return;
      // Capture this room once, including its windows and timber, rather than
      // reflecting an unrelated studio. Reflection capture does not recur per frame.
      const generator = new THREE.PMREMGenerator(renderer);
      const environment = generator.fromScene(scene,.07,.1,100,{size:128,position:new THREE.Vector3(6.3,1.7,-6.1)});
      scene.environment = environment.texture;
      scene.environmentIntensity = .32;
      generator.dispose();
      return environment;
    }
  };
}
