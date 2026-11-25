import * as THREE from '../lib/three.module.js';

export const N = 10; // عدد البلوكات في كل اتجاه
export const BLOCK = 64;
export const ROAD = 16;
export const P = BLOCK + ROAD;
export const HALF = (N * P) / 2; // 400
export const ISLAND = HALF + 110;

export const rnd = (a, b) => a + Math.random() * (b - a);
export const rint = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrap = (a) => {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
};
export const lerp = (a, b, t) => a + (b - a) * t;

export const nodePos = (i, j) => ({ x: (i - N / 2) * P, z: (j - N / 2) * P });
export const nearestNode = (x, z) => ({
  i: clamp(Math.round(x / P + N / 2), 0, N),
  j: clamp(Math.round(z / P + N / 2), 0, N),
});
export function neighbors(n) {
  const r = [];
  if (n.i > 0) r.push({ i: n.i - 1, j: n.j });
  if (n.i < N) r.push({ i: n.i + 1, j: n.j });
  if (n.j > 0) r.push({ i: n.i, j: n.j - 1 });
  if (n.j < N) r.push({ i: n.i, j: n.j + 1 });
  return r;
}

export function blockAt(x, z) {
  const u = x / P + N / 2;
  const v = z / P + N / 2;
  const i = Math.floor(u);
  const j = Math.floor(v);
  if (i < 0 || i >= N || j < 0 || j >= N) return null;
  const ox = (u - i - 0.5) * P;
  const oz = (v - j - 0.5) * P;
  if (Math.abs(ox) < BLOCK / 2 && Math.abs(oz) < BLOCK / 2) return { i, j };
  return null;
}
export const groundY = (x, z) => (blockAt(x, z) ? 0.3 : 0);

// ---------- التصادمات ----------
const CELL = 40;
const grid = new Map();
export const colliders = [];
const key = (cx, cz) => (cx + 100) * 1000 + (cz + 100);
function addCollider(c) {
  colliders.push(c);
  for (let cx = Math.floor(c.x0 / CELL); cx <= Math.floor(c.x1 / CELL); cx++) {
    for (let cz = Math.floor(c.z0 / CELL); cz <= Math.floor(c.z1 / CELL); cz++) {
      const k = key(cx, cz);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(c);
    }
  }
}
function near(x, z) {
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  const out = [];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const l = grid.get(key(cx + a, cz + b));
    if (l) for (const c of l) out.push(c);
  }
  return out;
}

// يدفع الدائرة خارج المباني؛ يرجع أقصى عمق اختراق (0 = لا تصادم)
export const hitInfo = { nx: 0, nz: 0 };
export function pushOut(p, r) {
  let worst = 0;
  const list = near(p.x, p.z);
  for (const c of list) {
    const cx = clamp(p.x, c.x0, c.x1);
    const cz = clamp(p.z, c.z0, c.z1);
    let dx = p.x - cx;
    let dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    let d = Math.sqrt(d2);
    let pen;
    if (d < 1e-5) {
      // المركز داخل الصندوق: ادفع لأقرب وجه
      const l = p.x - c.x0, rr = c.x1 - p.x, t = p.z - c.z0, b = c.z1 - p.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) { dx = -1; dz = 0; } else if (m === rr) { dx = 1; dz = 0; } else if (m === t) { dx = 0; dz = -1; } else { dx = 0; dz = 1; }
      pen = r + m;
      d = 1;
    } else {
      pen = r - d;
      dx /= d; dz /= d;
    }
    p.x += dx * pen;
    p.z += dz * pen;
    if (pen > worst) { worst = pen; hitInfo.nx = dx; hitInfo.nz = dz; }
  }
  return worst;
}

// شعاع ضد المباني، يرجع أقرب t أو Infinity
export function rayWorld(ox, oy, oz, dx, dy, dz, maxT) {
  let best = Infinity;
  // أرضية
  if (dy < -1e-6) {
    const t = -oy / dy;
    if (t > 0 && t < maxT) best = t;
  }
  for (const c of colliders) {
    let tmin = 0, tmax = Math.min(maxT, best);
    const axes = [
      [ox, dx, c.x0, c.x1],
      [oy, dy, 0, c.h],
      [oz, dz, c.z0, c.z1],
    ];
    let ok = true;
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { ok = false; break; }
      } else {
        let t1 = (lo - o) / d;
        let t2 = (hi - o) / d;
        if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok && tmin < best) best = tmin;
  }
  return best;
}

// خط رؤية في المستوى الأفقي بين نقطتين
export function lineClear(x0, z0, x1, z1, h = 1.5) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.01) return true;
  return rayWorld(x0, h, z0, dx / len, 0, dz / len, len) === Infinity;
}

// ---------- النسيج ----------
const WALLS = ['#f2d6c9', '#e8b4c8', '#bfe3e8', '#d9d2c0', '#9db7c9', '#c8b6e2', '#f0e0a8', '#8e9aaf', '#ffd2b0', '#a9d8c4'];
function windowTextures(wall) {
  const S = 256;
  const a = document.createElement('canvas');
  a.width = a.height = S;
  const e = document.createElement('canvas');
  e.width = e.height = S;
  const g = a.getContext('2d');
  const h = e.getContext('2d');
  g.fillStyle = wall;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
    g.fillRect(Math.random() * S, Math.random() * S, 3, 3);
  }
  h.fillStyle = '#000';
  h.fillRect(0, 0, S, S);
  const c = S / 4;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = i * c + 12, y = j * c + 14, w = c - 24, hh = c - 30;
    const gr = g.createLinearGradient(x, y, x + w, y + hh);
    gr.addColorStop(0, '#2a4a6a');
    gr.addColorStop(1, '#0e1c33');
    g.fillStyle = gr;
    g.fillRect(x, y, w, hh);
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.fillRect(x, y, w, 5);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.fillRect(x - 3, y + hh, w + 6, 5);
    if (Math.random() < 0.5) {
      h.fillStyle = pick(['#ffd27a', '#ffe9b0', '#ffc15a', '#bfe6ff']);
      h.fillRect(x, y, w, hh);
    }
  }
  const mk = (cv) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: mk(a), emissiveMap: mk(e) };
}

function scaleUV(geo, w, h, d) {
  const uv = geo.attributes.uv;
  const T = 12;
  for (let i = 0; i < uv.count; i++) {
    const face = Math.floor(i / 4);
    let su, sv;
    if (face < 2) { su = d / T; sv = h / T; }
    else if (face < 4) { su = w / T; sv = d / T; }
    else { su = w / T; sv = h / T; }
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
}

// ---------- بناء العالم ----------
export function buildWorld(scene) {
  const world = { bldgMats: [], blocks: [], parkBlocks: [], lampMat: null };

  // أرضية
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(ISLAND * 2, ISLAND * 2),
    new THREE.MeshStandardMaterial({ color: 0xe9d9a6, roughness: 1 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.02;
  sand.receiveShadow = true;
  scene.add(sand);
  const wet = new THREE.Mesh(
    new THREE.PlaneGeometry(ISLAND * 2 + 60, ISLAND * 2 + 60),
    new THREE.MeshStandardMaterial({ color: 0xb9a87a, roughness: 1 })
  );
  wet.rotation.x = -Math.PI / 2;
  wet.position.y = -0.2;
  scene.add(wet);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ color: 0x1a78b8, roughness: 0.25, metalness: 0.2 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.7;
  scene.add(water);
  world.water = water;

  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2 + ROAD, HALF * 2 + ROAD),
    new THREE.MeshStandardMaterial({ color: 0x2c2e38, roughness: 0.95 })
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.receiveShadow = true;
  scene.add(asphalt);

  // خطوط الطريق
  const dashGeo = new THREE.BoxGeometry(0.35, 0.03, 3.6);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf2e6a0 });
  const dashes = [];
  for (let k = 0; k <= N; k++) {
    const c = (k - N / 2) * P;
    for (let t = -HALF + 4; t < HALF; t += 8) {
      const d = (((t + HALF) % P) + P) % P;
      if (Math.min(d, P - d) < 11) continue;
      dashes.push([t, c, false]); // على طول x عند z=c
      dashes.push([c, t, true]);
    }
  }
  const dm = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
  const dummy = new THREE.Object3D();
  dashes.forEach(([x, z, alongZ], i) => {
    dummy.position.set(x, 0.03, z);
    dummy.rotation.set(0, alongZ ? 0 : Math.PI / 2, 0);
    dummy.updateMatrix();
    dm.setMatrixAt(i, dummy.matrix);
  });
  scene.add(dm);

  // ممرات المشاة
  const zebra = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const p = nodePos(i, j);
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if ((i === 0 && ax < 0) || (i === N && ax > 0) || (j === 0 && az < 0) || (j === N && az > 0)) continue;
      for (let s = -6; s <= 6; s += 1.8) {
        zebra.push([p.x + ax * 11.5 + (az !== 0 ? s : 0), p.z + az * 11.5 + (ax !== 0 ? s : 0), ax !== 0]);
      }
    }
  }
  const zm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.03, 3.4), new THREE.MeshBasicMaterial({ color: 0xdddddd }), zebra.length);
  zebra.forEach(([x, z, alongX], i) => {
    dummy.position.set(x, 0.035, z);
    dummy.rotation.set(0, alongX ? 0 : Math.PI / 2, 0);
    dummy.updateMatrix();
    zm.setMatrixAt(i, dummy.matrix);
  });
  scene.add(zm);

  // مواد المباني
  const mats = WALLS.map((w) => {
    const t = windowTextures(w);
    const m = new THREE.MeshStandardMaterial({
      map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.75,
    });
    world.bldgMats.push(m);
    return m;
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x777b85, roughness: 1 });
  const neonCols = [0xff3ca8, 0x2ef3ff, 0xffb02e, 0xa56bff, 0x4dff9a];
  const neonMats = neonCols.map((c) => new THREE.MeshBasicMaterial({ color: c }));

  function addBuilding(cx, cz, w, d, h) {
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleUV(geo, w, h, d);
    const m = pick(mats);
    const mesh = new THREE.Mesh(geo, [m, m, roofMat, roofMat, m, m]);
    mesh.position.set(cx, 0.3 + h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    addCollider({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h: h + 0.3 });
    // لافتات نيون
    if (Math.random() < 0.55) {
      const nm = pick(neonMats);
      const side = pick([0, 1, 2, 3]);
      const sy = rnd(4, Math.min(12, h - 2));
      const strip = new THREE.Mesh(
        side < 2 ? new THREE.BoxGeometry(w * 0.7, 0.5, 0.35) : new THREE.BoxGeometry(0.35, 0.5, d * 0.7),
        nm
      );
      const off = 0.25;
      if (side === 0) strip.position.set(cx, 0.3 + sy, cz + d / 2 + off);
      if (side === 1) strip.position.set(cx, 0.3 + sy, cz - d / 2 - off);
      if (side === 2) strip.position.set(cx + w / 2 + off, 0.3 + sy, cz);
      if (side === 3) strip.position.set(cx - w / 2 - off, 0.3 + sy, cz);
      scene.add(strip);
    }
    // أبراج: هوائي
    if (h > 55) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 14, 5), new THREE.MeshBasicMaterial({ color: 0xff2244 }));
      ant.position.set(cx, 0.3 + h + 7, cz);
      scene.add(ant);
    }
  }

  // البلوكات
  const slabGeo = new THREE.BoxGeometry(BLOCK, 0.3, BLOCK);
  const slabs = new THREE.InstancedMesh(slabGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), N * N);
  slabs.receiveShadow = true;
  const palms = [];
  let idx = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const c = nodePos(i + 0.5, j + 0.5);
    const distC = Math.hypot(c.x, c.z) / HALF; // 0 مركز .. 1.4 الأطراف
    let type = 'normal';
    const r = Math.random();
    if (r < 0.14) type = 'park';
    else if (distC < 0.55 && r < 0.5) type = 'tower';
    world.blocks.push({ i, j, x: c.x, z: c.z, type });
    dummy.position.set(c.x, 0.15, c.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    slabs.setMatrixAt(idx, dummy.matrix);
    slabs.setColorAt(idx, new THREE.Color(type === 'park' ? 0x4fa65a : 0xc4c0b8));
    idx++;
    if (type === 'park') {
      world.parkBlocks.push({ x: c.x, z: c.z });
      const n = rint(10, 16);
      for (let k = 0; k < n; k++) palms.push([c.x + rnd(-27, 27), c.z + rnd(-27, 27)]);
      // مقاعد
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0x8a5a33 }));
        b.position.set(c.x + rnd(-20, 20), 0.55, c.z + rnd(-20, 20));
        scene.add(b);
      }
      // مسبح/نافورة
      const fo = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0x3aa8ff, roughness: 0.2 }));
      fo.position.set(c.x, 0.5, c.z);
      scene.add(fo);
      addCollider({ x0: c.x - 5, x1: c.x + 5, z0: c.z - 5, z1: c.z + 5, h: 1 });
    } else if (type === 'tower') {
      const s = rnd(38, 50);
      addBuilding(c.x + rnd(-4, 4), c.z + rnd(-4, 4), s, rnd(36, 50), rnd(70, 140) * (1.15 - distC * 0.5));
    } else {
      const base = distC < 0.7 ? 1.9 : distC < 1 ? 1.2 : 0.7;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        if (Math.random() < 0.08) continue;
        const w = rnd(18, 26), d = rnd(18, 26);
        const h = rnd(10, 32) * base * (Math.random() < 0.15 ? 1.8 : 1);
        addBuilding(c.x + sx * 14.5, c.z + sz * 14.5, w, d, Math.max(8, h));
      }
    }
  }
  slabs.instanceMatrix.needsUpdate = true;
  slabs.instanceColor.needsUpdate = true;
  scene.add(slabs);

  // نخيل على الشاطئ
  for (let k = 0; k < 140; k++) {
    const a = rnd(0, Math.PI * 2);
    const r = rnd(HALF + 30, ISLAND - 10);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) > HALF + 22 || Math.abs(z) > HALF + 22) palms.push([x, z]);
  }
  // نخيل على أطراف الشوارع الخارجية
  for (let t = -HALF; t <= HALF; t += 22) {
    palms.push([t, -HALF - 14], [t, HALF + 14], [-HALF - 14, t], [HALF + 14, t]);
  }
  // instanced palms
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.5, 6);
  trunkGeo.translate(0, 3.25, 0);
  const leafGeo = new THREE.BoxGeometry(1.1, 0.07, 3.8);
  leafGeo.translate(0, 0, 1.9);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x7d5a3a, roughness: 1 }), palms.length);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x2f9a52, roughness: 0.8, side: THREE.DoubleSide }), palms.length * 7);
  trunks.castShadow = true;
  leaves.castShadow = true;
  let li = 0;
  palms.forEach(([x, z], i) => {
    const sc = rnd(0.85, 1.3);
    const gy = groundY(x, z);
    dummy.position.set(x, gy, z);
    dummy.rotation.set(0, rnd(0, 6.28), 0);
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 7; k++) {
      dummy.position.set(x, gy + 6.4 * sc, z);
      dummy.rotation.order = 'YXZ';
      dummy.rotation.set(0.55 + rnd(-0.15, 0.15), (k * Math.PI * 2) / 7 + rnd(-0.2, 0.2), 0);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      leaves.setMatrixAt(li++, dummy.matrix);
    }
    dummy.rotation.order = 'XYZ';
    addCollider({ x0: x - 0.45, x1: x + 0.45, z0: z - 0.45, z1: z + 0.45, h: 8 });
  });
  dummy.scale.setScalar(1);
  scene.add(trunks, leaves);

  // أعمدة إنارة
  const lampPos = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const p = nodePos(i, j);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lampPos.push([p.x + sx * 9.5, p.z + sz * 9.5]);
  }
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 6.5, 6), new THREE.MeshStandardMaterial({ color: 0x4a4d55 }), lampPos.length);
  world.lampMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.2, 0.5), world.lampMat, lampPos.length);
  lampPos.forEach(([x, z], i) => {
    dummy.position.set(x, 3.55, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 6.7, z);
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  scene.add(poles, heads);

  world.minimapCanvas = buildMinimap(world);
  return world;
}

export const MAPR = ISLAND;
export const MAP_PX = 1200;
function buildMinimap(world) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = MAP_PX;
  const g = cv.getContext('2d');
  const s = MAP_PX / (MAPR * 2);
  const X = (x) => (x + MAPR) * s;
  g.fillStyle = '#2b78a8';
  g.fillRect(0, 0, MAP_PX, MAP_PX);
  g.fillStyle = '#d8c98f';
  g.fillRect(X(-ISLAND + 6), X(-ISLAND + 6), (ISLAND * 2 - 12) * s, (ISLAND * 2 - 12) * s);
  g.fillStyle = '#4a4d5a';
  g.fillRect(X(-HALF - ROAD / 2), X(-HALF - ROAD / 2), (HALF * 2 + ROAD) * s, (HALF * 2 + ROAD) * s);
  for (const b of world.blocks) {
    g.fillStyle = b.type === 'park' ? '#5cb866' : '#a49f96';
    g.fillRect(X(b.x - BLOCK / 2), X(b.z - BLOCK / 2), BLOCK * s, BLOCK * s);
  }
  g.fillStyle = '#7e7a74';
  for (const c of colliders) {
    if (c.h < 6) continue;
    g.fillRect(X(c.x0), X(c.z0), (c.x1 - c.x0) * s, (c.z1 - c.z0) * s);
  }
  return cv;
}
