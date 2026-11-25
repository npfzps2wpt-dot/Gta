import * as THREE from '../lib/three.module.js';
import { mergeGeometries } from '../lib/jsm/utils/BufferGeometryUtils.js';

// مادة واحدة مشتركة بألوان رؤوس (vertex colors) + دمج الأجزاء = أوامر رسم قليلة
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05 });
const base = {
  leg: new THREE.CapsuleGeometry(0.115, 0.66, 3, 8),
  shoe: new THREE.BoxGeometry(0.19, 0.1, 0.38),
  torso: new THREE.CapsuleGeometry(0.2, 0.42, 3, 10),
  hip: new THREE.SphereGeometry(0.2, 10, 6),
  neck: new THREE.CylinderGeometry(0.06, 0.07, 0.1, 6),
  head: new THREE.SphereGeometry(0.15, 12, 9),
  cap: new THREE.SphereGeometry(0.165, 10, 6, 0, 6.283, 0, 1.45),
  brim: new THREE.BoxGeometry(0.2, 0.025, 0.14),
  hair: new THREE.SphereGeometry(0.16, 10, 6, 0, 6.283, 0, 1.7),
  eye: new THREE.BoxGeometry(0.03, 0.02, 0.02),
  shades: new THREE.BoxGeometry(0.28, 0.05, 0.04),
  up: new THREE.CapsuleGeometry(0.075, 0.26, 3, 6),
  lo: new THREE.CapsuleGeometry(0.06, 0.3, 3, 6),
  hand: new THREE.SphereGeometry(0.06, 6, 5),
  g1: new THREE.BoxGeometry(0.06, 0.1, 0.3),
  g2: new THREE.BoxGeometry(0.05, 0.14, 0.07),
};
const col = new THREE.Color();
const mtx = new THREE.Matrix4();
const q = new THREE.Quaternion();
function part(key, color, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const g = base[key].clone();
  mtx.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(mtx);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  col.set(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const out = g.toNonIndexed();
  g.dispose();
  return out;
}
function mesh(list, castShadow = true) {
  const m = new THREE.Mesh(mergeGeometries(list, false), MAT);
  m.castShadow = castShadow;
  list.forEach((g) => g.dispose());
  return m;
}

export function makeHuman(shirt, pants, skin, hair, cap, glasses) {
  const g = new THREE.Group();
  const legs = [];
  for (const s of [-1, 1]) {
    const l = new THREE.Group();
    l.position.set(s * 0.15, 0.95, 0);
    l.add(mesh([part('leg', pants, 0, -0.45, 0), part('shoe', 0xf2f2f2, 0, -0.9, 0.07)]));
    g.add(l);
    legs.push(l);
  }
  const body = [
    part('torso', shirt, 0, 1.3, 0, 1.25, 1, 0.8),
    part('hip', pants, 0, 0.98, 0, 1.15, 0.7, 0.8),
    part('neck', skin, 0, 1.66, 0),
    part('head', skin, 0, 1.8, 0, 0.95, 1.1, 1),
  ];
  if (cap) { body.push(part('cap', cap, 0, 1.84, 0), part('brim', cap, 0, 1.86, 0.17)); }
  else body.push(part('hair', hair, 0, 1.84, -0.01));
  if (glasses) body.push(part('shades', 0x050505, 0, 1.82, 0.14));
  else for (const s of [-1, 1]) body.push(part('eye', 0x111111, s * 0.055, 1.82, 0.14));
  g.add(mesh(body));
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.33, 1.56, 0);
    a.add(mesh([part('up', shirt, 0, -0.2, 0), part('lo', skin, 0, -0.58, 0), part('hand', skin, 0, -0.78, 0)]));
    g.add(a);
    arms.push(a);
  }
  const gun = mesh([part('g1', 0x1a1a1a, 0, 0, 0.12), part('g2', 0x1a1a1a, 0, -0.1, 0.02)], false);
  gun.position.set(0, -0.78, 0.06);
  arms[0].add(gun);
  gun.visible = false;
  return { group: g, legs, arms, gun };
}
