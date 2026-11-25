import * as THREE from '../lib/three.module.js';

const cache = new Map();
function mat(color, rough = 0.75, metal = 0) {
  const k = color + '_' + rough + '_' + metal;
  if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return cache.get(k);
}
const gcache = new Map();
function geo(key, make) {
  if (!gcache.has(key)) gcache.set(key, make());
  return gcache.get(key);
}
function m(g, ma, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const o = new THREE.Mesh(g, ma);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.castShadow = true;
  return o;
}

export function makeHuman(shirt, pants, skin, hair, cap, glasses) {
  const g = new THREE.Group();
  const legGeo = geo('leg', () => new THREE.CapsuleGeometry(0.115, 0.66, 4, 10));
  const shoeGeo = geo('shoe', () => new THREE.BoxGeometry(0.19, 0.1, 0.38));
  const legs = [];
  for (const s of [-1, 1]) {
    const l = new THREE.Group();
    l.position.set(s * 0.15, 0.95, 0);
    l.add(m(legGeo, mat(pants), 0, -0.45, 0));
    l.add(m(shoeGeo, mat(0xf2f2f2, 0.5), 0, -0.9, 0.07));
    g.add(l);
    legs.push(l);
  }
  // الجذع والأرداف
  g.add(m(geo('torso', () => new THREE.CapsuleGeometry(0.2, 0.42, 4, 12)), mat(shirt, 0.8), 0, 1.3, 0, 1.25, 1, 0.8));
  g.add(m(geo('hip', () => new THREE.SphereGeometry(0.2, 12, 8)), mat(pants), 0, 0.98, 0, 1.15, 0.7, 0.8));
  // الرقبة والرأس
  g.add(m(geo('neck', () => new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8)), mat(skin, 0.6), 0, 1.66, 0));
  g.add(m(geo('head', () => new THREE.SphereGeometry(0.15, 16, 12)), mat(skin, 0.55), 0, 1.8, 0, 0.95, 1.1, 1));
  if (cap) {
    g.add(m(geo('cap', () => new THREE.SphereGeometry(0.165, 14, 8, 0, 6.283, 0, 1.45)), mat(cap, 0.7), 0, 1.84, 0));
    g.add(m(geo('brim', () => new THREE.BoxGeometry(0.2, 0.025, 0.14)), mat(cap, 0.7), 0, 1.86, 0.17));
  } else {
    g.add(m(geo('hair', () => new THREE.SphereGeometry(0.16, 14, 8, 0, 6.283, 0, 1.7)), mat(hair, 0.9), 0, 1.84, -0.01));
  }
  const eyeGeo = geo('eye', () => new THREE.BoxGeometry(0.03, 0.02, 0.02));
  if (glasses) g.add(m(geo('shades', () => new THREE.BoxGeometry(0.28, 0.05, 0.04)), mat(0x050505, 0.1, 0.5), 0, 1.82, 0.14));
  else for (const s of [-1, 1]) g.add(m(eyeGeo, mat(0x111111), s * 0.055, 1.82, 0.14));
  // الأذرع
  const arms = [];
  const upGeo = geo('up', () => new THREE.CapsuleGeometry(0.075, 0.26, 4, 8));
  const loGeo = geo('lo', () => new THREE.CapsuleGeometry(0.06, 0.3, 4, 8));
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.33, 1.56, 0);
    a.add(m(upGeo, mat(shirt, 0.8), 0, -0.2, 0));
    a.add(m(loGeo, mat(skin, 0.55), 0, -0.58, 0));
    a.add(m(geo('hand', () => new THREE.SphereGeometry(0.06, 8, 6)), mat(skin, 0.55), 0, -0.78, 0));
    g.add(a);
    arms.push(a);
  }
  const gun = new THREE.Group();
  gun.add(m(geo('g1', () => new THREE.BoxGeometry(0.06, 0.1, 0.3)), mat(0x1a1a1a, 0.35, 0.8), 0, 0, 0.12));
  gun.add(m(geo('g2', () => new THREE.BoxGeometry(0.05, 0.14, 0.07)), mat(0x1a1a1a, 0.5, 0.5), 0, -0.1, 0.02));
  gun.position.set(0, -0.78, 0.06);
  arms[0].add(gun);
  gun.visible = false;
  return { group: g, legs, arms, gun };
}
