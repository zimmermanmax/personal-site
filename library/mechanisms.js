import * as THREE from 'three';

// The native sidecar uses row-major matrices; Matrix4.set accepts that order.
const matrix = rows => new THREE.Matrix4().set(...rows.flat());
const parts = rows => {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  matrix(rows).decompose(p, q, s);
  return {p, q, s};
};
const clamp = v => Math.max(0, Math.min(1, v));
const names = {
  secret: ['SecretDoor_v11_Carriage', 'SecretDoor_v11_Root'],
  television: ['TV_v15_Hinge_Left', 'TV_v15_Hinge_Right'],
  foyer: ['FoyerDoor_v11_Root'],
};

export function createMechanisms(room, manifest, nativeMotion, reducedMotion = false) {
  const groups = new Map();
  for (const [name, spec] of Object.entries(manifest.groups)) {
    const node = room.getObjectByName(name);
    if (!node) throw new Error(`Missing moving assembly: ${name}`);
    const rest = parts(spec.restLocalGltf);
    groups.set(name, {node, rest, inverseRestWorld: matrix(spec.restWorldGltf).invert()});
  }
  const samples = new Map(nativeMotion.samples.map(row => [row.frame,
    new Map(Object.entries(row.localGltf).map(([name, rows]) => [name, parts(rows)]))]));
  for (let f = 1; f <= 120; f++) if (!samples.has(f)) throw new Error(`Missing native motion frame ${f}`);
  const current = {secret: 0, television: 0, foyer: 0};
  const target = {...current}, duration = {secret: 2.2, television: 1.4, foyer: 1.1};
  const worldDelta = new THREE.Matrix4(), yAxis = new THREE.Vector3(0, 1, 0);
  function applySample(name, frame) {
    const lo = Math.floor(frame), hi = Math.min(120, Math.ceil(frame));
    const a = samples.get(lo).get(name), b = samples.get(hi).get(name);
    const node = groups.get(name).node, t = frame - lo;
    node.position.lerpVectors(a.p, b.p, t);
    node.quaternion.slerpQuaternions(a.q, b.q, t);
    node.scale.lerpVectors(a.s, b.s, t);
    node.updateMatrix();
  }
  function applyControl(key) {
    if (key === 'foyer') {
      const {node, rest} = groups.get(names.foyer[0]);
      node.position.copy(rest.p); node.scale.copy(rest.s);
      node.quaternion.copy(rest.q).multiply(new THREE.Quaternion().setFromAxisAngle(yAxis, current.foyer * Math.PI * 95 / 180));
      node.updateMatrix();
    } else {
      const frame = key === 'secret' ? 1 + 44 * current.secret : 60 + 30 * current.television;
      for (const name of names[key]) applySample(name, frame);
    }
  }
  function setProgress(key, value) {
    if (!(key in current)) throw new Error('Unknown room mechanism');
    current[key] = target[key] = clamp(value); applyControl(key); room.updateMatrixWorld(true);
  }
  return {
    current, target,
    setProgress,
    setTarget(key, open) {
      if (!(key in current)) throw new Error('Unknown room mechanism');
      target[key] = open ? 1 : 0;
      if (reducedMotion) setProgress(key, target[key]);
    },
    setLadderY(y) {
      const node = groups.get('WEB_MOVABLE_LADDER').node;
      node.position.z = -y; node.updateMatrix(); room.updateMatrixWorld(true);
    },
    delta(name, result = worldDelta) {
      const group = groups.get(name);
      if (!group) throw new Error(`Unknown moving book owner: ${name}`);
      room.updateMatrixWorld(true);
      return result.multiplyMatrices(group.node.matrixWorld, group.inverseRestWorld);
    },
    update(dt, canAdvance = () => true) {
      let changed = false;
      for (const key of Object.keys(current)) {
        if (current[key] === target[key]) continue;
        if (!canAdvance(key)) continue;
        const step = dt / duration[key];
        current[key] += Math.sign(target[key] - current[key]) * Math.min(step, Math.abs(target[key] - current[key]));
        applyControl(key); changed = true;
      }
      if (changed) room.updateMatrixWorld(true);
      return changed;
    },
  };
}

// Keep every visual binding part, pick volume and selection box with its owner.
// Rest matrices are captured once, so transforms never accumulate numerical drift.
export function attachMovingBooks(bookSet, manifest, mechanism) {
  const ids = new Set(manifest.associatedDoorBookIds);
  const indices = bookSet.items.flatMap((slot, i) => ids.has(slot.bookId) ? [i] : []);
  if (indices.length !== ids.size || ids.size !== 93) throw new Error('Secret-door book assignment mismatch');
  const channels = [[bookSet.volumes, 1], [bookSet.boards, 2], [bookSet.backs, 1], [bookSet.pages, 1], [bookSet.spines, 1]];
  const rest = channels.map(([mesh, stride]) => {
    if (!mesh) throw new Error('Book binding channel missing');
    return indices.flatMap(i => Array.from({length: stride}, (_, j) => {
      const index = i * stride + j, value = new THREE.Matrix4(); mesh.getMatrixAt(index, value);
      return {index, value};
    }));
  });
  const transformed = new THREE.Matrix4(), delta = new THREE.Matrix4();
  const centers = new Map(indices.map(i => [i, new THREE.Vector3().fromArray(bookSet.items[i].p)]));
  const corner = new THREE.Vector3();
  let selectedIndex = null;
  function highlight(index) {
    selectedIndex = index;
    if (index === null || !ids.has(bookSet.items[index].bookId)) return;
    const s = bookSet.items[index], box = bookSet.highlight.box;
    box.makeEmpty();
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      corner.set(s.p[0] + x * s.d[0] * .55, s.p[1] + y * s.d[1] * .55, s.p[2] + z * s.d[2] * .55).applyMatrix4(delta);
      box.expandByPoint(corner);
    }
  }
  const originalSelect = bookSet.select.bind(bookSet);
  bookSet.select = index => {originalSelect(index); highlight(index);};
  function update() {
    mechanism.delta('SecretDoor_v11_Root', delta);
    channels.forEach(([mesh], channel) => {
      for (const entry of rest[channel]) mesh.setMatrixAt(entry.index, transformed.multiplyMatrices(delta, entry.value));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere(); mesh.computeBoundingBox();
    });
    highlight(selectedIndex);
  }
  update();
  return {
    update,
    movingIds: ids,
    worldCenter(index, target = new THREE.Vector3()) {
      return centers.has(index) ? target.copy(centers.get(index)).applyMatrix4(delta) : target.fromArray(bookSet.items[index].p);
    },
  };
}
