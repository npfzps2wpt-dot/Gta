import * as THREE from '../lib/three.module.js';
import { glowTex } from './textures.js';

// المواصفات الفيزيائية + الشكل
export const CAR_TYPES = {
  sedan:  { body: [1.88, 0.8, 4.5], L: 4.5, W: 1.88, belt: 1.0, cabH: 0.54, cabLen: 2.25, cabZ: -0.3, rake: 0.6, max: 33, acc: 14, hp: 100 },
  sports: { body: [1.95, 0.7, 4.4], L: 4.4, W: 1.95, belt: 0.88, cabH: 0.46, cabLen: 1.75, cabZ: -0.4, rake: 0.95, max: 47, acc: 23, hp: 90, spoiler: true },
  suv:    { body: [2.02, 1.0, 4.75], L: 4.75, W: 2.02, belt: 1.22, cabH: 0.74, cabLen: 3.0, cabZ: -0.35, rake: 0.35, max: 29, acc: 11, hp: 130 },
  van:    { body: [2.02, 1.5, 5.0], L: 5.0, W: 2.02, belt: 1.25, cabH: 0.95, cabLen: 3.8, cabZ: -0.45, rake: 0.25, max: 25, acc: 9, hp: 140 },
  taxi:   { body: [1.88, 0.8, 4.5], L: 4.5, W: 1.88, belt: 1.0, cabH: 0.54, cabLen: 2.25, cabZ: -0.3, rake: 0.6, max: 32, acc: 14, hp: 100 },
  police: { body: [1.94, 0.82, 4.55], L: 4.55, W: 1.94, belt: 1.02, cabH: 0.56, cabLen: 2.25, cabZ: -0.3, rake: 0.6, max: 40, acc: 18, hp: 120 },
};

const geoCache = new Map();
function bodyGeo(type) {
  if (geoCache.has(type)) return geoCache.get(type);
  const t = CAR_TYPES[type];
  const L = t.L, W = t.W, belt = t.belt;
  const bev = 0.1;
  // الجسم السفلي: مقطع جانبي (x = الأمام)
  const s = new THREE.Shape();
  s.moveTo(-L / 2 + 0.1, 0.5);
  s.lineTo(L / 2 - 0.1, 0.5);
  s.lineTo(L / 2, 0.66);
  s.lineTo(L / 2 - 0.02, belt - 0.2);
  s.lineTo(L / 2 - 0.55, belt - 0.03); // الغطاء
  s.lineTo(L / 2 - 1.2, belt);
  s.lineTo(-L / 2 + 0.6, belt + 0.02);
  s.lineTo(-L / 2 + 0.05, belt - 0.07);
  s.lineTo(-L / 2, 0.7);
  s.closePath();
  const ext = { depth: W - bev * 2 - 0.02, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 6 };
  const body = new THREE.ExtrudeGeometry(s, ext);
  body.rotateY(-Math.PI / 2);
  body.translate((W - bev * 2) / 2, 0, 0);
  body.computeVertexNormals();

  // المقصورة (زجاج)
  const cz = t.cabZ, cl = t.cabLen, ch = t.cabH, rk = t.rake;
  const c = new THREE.Shape();
  c.moveTo(cz - cl / 2, belt);
  c.lineTo(cz + cl / 2, belt);
  c.lineTo(cz + cl / 2 - rk, belt + ch);
  c.lineTo(cz - cl / 2 + rk * 0.55, belt + ch);
  c.closePath();
  const cw = W * 0.86;
  const cext = { depth: cw - 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 };
  const cab = new THREE.ExtrudeGeometry(c, cext);
  cab.rotateY(-Math.PI / 2);
  cab.translate((cw - 0.1) / 2, 0, 0);
  // السقف
  const roofLen = cl - rk * 1.55;
  const roof = new THREE.BoxGeometry(cw * 0.93, 0.045, Math.max(0.4, roofLen));
  roof.translate(0, belt + ch + 0.035, cz + (rk * 0.55 - rk) / 2 + 0.0);
  const res = { body, cab, roof };
  geoCache.set(type, res);
  return res;
}

const G = {
  tire: new THREE.CylinderGeometry(0.37, 0.37, 0.3, 24).rotateZ(Math.PI / 2),
  rim: new THREE.CylinderGeometry(0.255, 0.255, 0.31, 20).rotateZ(Math.PI / 2),
  spoke: new THREE.BoxGeometry(0.315, 0.05, 0.44),
  hub: new THREE.CylinderGeometry(0.06, 0.06, 0.33, 10).rotateZ(Math.PI / 2),
  light: new THREE.BoxGeometry(0.42, 0.14, 0.08),
  bar: new THREE.BoxGeometry(1.4, 0.09, 0.06),
  strip: new THREE.BoxGeometry(1.6, 0.16, 0.12),
  under: new THREE.BoxGeometry(1.7, 0.3, 3.9),
  plate: new THREE.BoxGeometry(0.5, 0.12, 0.03),
  mirror: new THREE.BoxGeometry(0.08, 0.1, 0.16),
};
export const beamGeo = new THREE.PlaneGeometry(6.5, 17).rotateX(-Math.PI / 2).translate(0, 0, 11);
const beamTex = glowTex('rgba(255,236,180,0.75)');
export const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

const M = {
  tire: new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.9 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xcfd3da, roughness: 0.22, metalness: 1 }),
  rimDark: new THREE.MeshStandardMaterial({ color: 0x2a2c32, roughness: 0.4, metalness: 0.8 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x070d18, roughness: 0.04, metalness: 0.95, envMapIntensity: 1.6 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x0f1013, roughness: 0.6, metalness: 0.2 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xf2f2e8, roughness: 0.6 }),
  head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 0.8, roughness: 0.2 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x550008, emissive: 0xff0818, emissiveIntensity: 1.2, roughness: 0.3 }),
  brake: new THREE.MeshStandardMaterial({ color: 0x660008, emissive: 0xff0818, emissiveIntensity: 6, roughness: 0.3 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.35, metalness: 0.4 }),
  sirenR: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1133, emissiveIntensity: 5 }),
  sirenRoff: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1133, emissiveIntensity: 0.1 }),
  sirenB: new THREE.MeshStandardMaterial({ color: 0x000022, emissive: 0x2255ff, emissiveIntensity: 5 }),
  sirenBoff: new THREE.MeshStandardMaterial({ color: 0x000022, emissive: 0x2255ff, emissiveIntensity: 0.1 }),
  taxiSign: new THREE.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffe066, emissiveIntensity: 2.5 }),
};
export const CAR_MATS = M;

export function makeCarMesh(type, color) {
  const t = CAR_TYPES[type];
  const { body, cab, roof } = bodyGeo(type);
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.32, metalness: 0.65, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.25,
  });
  const add = (geo, mat, x = 0, y = 0, z = 0, cast = true) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.castShadow = cast;
    g.add(o);
    return o;
  };
  add(body, paint);
  add(cab, M.glass);
  add(roof, type === 'taxi' || type === 'police' ? M.white : paint);
  add(G.under, M.trim, 0, 0.42, 0, false);
  const { L, W, belt } = t;
  // الشبك الأمامي ومصدات
  add(G.strip, M.trim, 0, 0.58, L / 2 - 0.02);
  add(new THREE.BoxGeometry(W * 0.62, 0.17, 0.04), M.trim, 0, belt - 0.32, L / 2 + 0.01);
  add(G.strip, M.trim, 0, 0.6, -L / 2 + 0.02);
  // أضواء أمامية
  const hx = W / 2 - 0.34;
  for (const s of [-1, 1]) add(G.light, M.head, s * hx, belt - 0.27, L / 2 - 0.01, false);
  // أضواء خلفية (تتغير عند الفرملة)
  const tails = [];
  for (const s of [-1, 1]) tails.push(add(G.light, M.tail, s * hx, belt - 0.2, -L / 2 + 0.01, false));
  tails.push(add(G.bar, M.tail, 0, belt - 0.2, -L / 2 + 0.012, false));
  // لوحة
  add(G.plate, M.plate, 0, 0.7, -L / 2 - 0.0, false);
  add(G.plate, M.plate, 0, 0.62, L / 2 + 0.0, false);
  // مرايا
  for (const s of [-1, 1]) add(G.mirror, paint, s * (W / 2 + 0.02), belt + 0.12, t.cabZ + t.cabLen / 2 - 0.45, false);
  // العجلات
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const steer = new THREE.Group();
    steer.position.set(sx * (W / 2 - 0.12), 0.37, sz * L * 0.31);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(G.tire, M.tire); tire.castShadow = true;
    const rim = new THREE.Mesh(G.rim, M.rim);
    rim.scale.set(1, 1, 1);
    spin.add(tire, rim, new THREE.Mesh(G.hub, M.rimDark));
    for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(G.spoke, M.rimDark); sp.rotation.x = (k * Math.PI) / 3; spin.add(sp); }
    steer.add(spin);
    // الإطار يميل للخارج (يبدو أعرض)
    g.add(steer);
    wheels.push({ steer, spin, front: sz > 0 });
  }
  const out = { group: g, paint, wheels, tails, taillightsOn: false };
  if (t.spoiler) {
    add(new THREE.BoxGeometry(W * 0.9, 0.05, 0.38), M.trim, 0, belt + 0.2, -L / 2 + 0.2);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.2, 0.3), M.trim, s * W * 0.38, belt + 0.1, -L / 2 + 0.2, false);
  }
  if (type === 'taxi') add(new THREE.BoxGeometry(0.75, 0.2, 0.32), M.taxiSign, 0, belt + t.cabH + 0.17, t.cabZ);
  if (type === 'police') {
    out.lightR = add(new THREE.BoxGeometry(0.6, 0.16, 0.3), M.sirenR, -0.36, belt + t.cabH + 0.14, t.cabZ, false);
    out.lightB = add(new THREE.BoxGeometry(0.6, 0.16, 0.3), M.sirenB, 0.36, belt + t.cabH + 0.14, t.cabZ, false);
    // طلاء أبيض على الأبواب
    add(new THREE.BoxGeometry(W + 0.02, 0.3, 1.9), M.white, 0, belt - 0.42, -0.15);
  }
  if (type === 'van') add(new THREE.BoxGeometry(W - 0.06, 0.02, 1.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }), 0, belt + 0.5, -0.5, false);
  // بقعة ضوء المصابيح على الأرض (ليلاً)
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 0.05;
  beam.visible = false;
  g.add(beam);
  out.beam = beam;
  return out;
}
