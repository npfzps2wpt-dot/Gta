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

// ---------- بناء العالم ----------
import { Reflector } from '../lib/jsm/objects/Reflector.js';
import { asphaltTex, concreteTex, grassTex, barkTex, frondTex, facadeSet, storefrontTex, billboardTex, glowTex, waterNormalTex } from './textures.js';

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

const WALLS = ['#e9d3c4', '#e0aac0', '#b5dbe2', '#d9d2c0', '#98b0c4', '#c3b0de', '#efdca0', '#8d98ad', '#ffcfa8', '#a4d4be', '#c9c2b8', '#d8836f'];

export function buildWorld(scene, overlay) {
  const world = { bldgMats: [], blocks: [], parkBlocks: [], lampMat: null, emissiveMats: [], nightMats: [] };
  const dummy = new THREE.Object3D();

  // ----- مواد الأرض -----
  const asphalt = asphaltTex();
  asphalt.repeat.set((HALF * 2 + ROAD) / 7, (HALF * 2 + ROAD) / 7);
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, bumpMap: asphalt, bumpScale: 1.2, color: 0xb0b0b8, roughness: 0.55, metalness: 0.05 });
  world.roadMat = roadMat;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + ROAD, HALF * 2 + ROAD), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.receiveShadow = true;
  scene.add(road);

  // انعكاس الشوارع المبللة (يُضاف فوق الإسفلت)
  const reflShader = {
    name: 'WetRoad',
    uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uWet: { value: 0.5 }, uTime: { value: 0 }, uIntensity: { value: 1 } },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
      void main(){ vUv=textureMatrix*vec4(position,1.0); vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uWet; uniform float uTime; uniform float uIntensity; varying vec4 vUv; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){
        vec2 p=vW.xz;
        float puddle=smoothstep(0.28,0.7,n(p*0.045)*0.6+n(p*0.13)*0.4);
        float wet=clamp(uWet*(0.35+0.9*puddle),0.0,1.0);
        vec2 dist=(vec2(n(p*2.2+uTime*0.05),n(p*2.2+19.0))-0.5)*0.05*(1.2-puddle*0.8);
        vec4 uv=vUv; uv.xy+=dist*uv.w;
        vec3 refl=texture2DProj(tDiffuse,uv).rgb;
        vec3 V=normalize(cameraPosition-vW);
        float fres=pow(1.0-clamp(V.y,0.0,1.0),3.0);
        float k=(0.08+0.92*fres)*wet*uIntensity;
        gl_FragColor=vec4(refl*k,1.0);
      }`,
  };
  const refl = new Reflector(new THREE.PlaneGeometry(HALF * 2 + ROAD, HALF * 2 + ROAD), {
    textureWidth: Math.floor(window.innerWidth * 0.55), textureHeight: Math.floor(window.innerHeight * 0.55), clipBias: 0.003, shader: reflShader, multisample: 0,
  });
  refl.rotation.x = -Math.PI / 2;
  refl.position.y = 0.025;
  refl.material.transparent = true;
  refl.material.blending = THREE.AdditiveBlending;
  refl.material.depthWrite = false;
  refl.renderOrder = 2;
  overlay.add(refl);
  world.reflector = refl;

  // رمل + شاطئ + ماء
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(ISLAND * 2, ISLAND * 2), new THREE.MeshStandardMaterial({ color: 0xe6d3a0, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.position.y = -0.02; sand.receiveShadow = true;
  scene.add(sand);
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(ISLAND * 2 + 80, ISLAND * 2 + 80), new THREE.MeshStandardMaterial({ color: 0xa89868, roughness: 0.9 }));
  wet.rotation.x = -Math.PI / 2; wet.position.y = -0.22;
  scene.add(wet);
  const wn = waterNormalTex();
  wn.repeat.set(220, 220);
  const wn2 = wn.clone(); wn2.needsUpdate = true; wn2.repeat.set(97, 97);
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x0a5f86, roughness: 0.06, metalness: 0.1, normalMap: wn, normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 1.6, clearcoat: 0.6, clearcoatRoughness: 0.05 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.y = -0.8;
  overlay.add(water);
  world.water = water;
  world.waterNormal = wn;

  // ----- مواد المباني -----
  const styles = [];
  for (let k = 0; k < 8; k++) {
    const st = facadeSet(k < 5 ? 'concrete' : 'brick', WALLS[k % WALLS.length]);
    styles.push(st);
  }
  for (let k = 0; k < 4; k++) styles.push(facadeSet('glass'));
  const mkFacade = (st, glass) => {
    const m = new THREE.MeshStandardMaterial({
      map: st.map, aoMap: st.orm, roughnessMap: st.orm, metalnessMap: st.orm, roughness: 1, metalness: 1,
      bumpMap: st.bump, bumpScale: 1.5, emissiveMap: st.emissive, emissive: 0xffffff, emissiveIntensity: 0,
      envMapIntensity: glass ? 1.6 : 1.0,
    });
    world.bldgMats.push(m);
    return m;
  };
  const concreteMats = styles.slice(0, 8).map((s) => mkFacade(s, false));
  const glassMats = styles.slice(8).map((s) => mkFacade(s, true));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6e717a, roughness: 0.95 });

  // نماذج اللافتات والأسطح (مجمّعة)
  const props = []; // أجهزة تكييف على الأسطح
  const tanks = [];
  const bills = [];
  const shops = []; // واجهات المحلات

  function addBox(cx, cz, w, d, h, y0, mat, towerLike) {
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleUV(geo, w, h, d);
    // الـ AO uv2 غير مطلوب في r160 (يستخدم uv)
    const mesh = new THREE.Mesh(geo, [mat, mat, roofMat, roofMat, mat, mat]);
    mesh.position.set(cx, y0 + h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function addBuilding(cx, cz, w, d, h, tall) {
    const glass = tall && Math.random() < 0.4;
    const mat = glass ? pick(glassMats) : pick(concreteMats);
    let topY = 0.3, curW = w, curD = d, curX = cx, curZ = cz;
    const tiers = tall && h > 38 ? (h > 80 ? 3 : 2) : 1;
    let remaining = h;
    for (let t = 0; t < tiers; t++) {
      const th = t === tiers - 1 ? remaining : remaining * (t === 0 ? 0.55 : 0.6);
      addBox(curX, curZ, curW, curD, th, topY, mat);
      topY += th; remaining -= th;
      if (t < tiers - 1) {
        // سطح الطابق مع إفريز
        const lip = new THREE.Mesh(new THREE.BoxGeometry(curW + 0.5, 0.5, curD + 0.5), roofMat);
        lip.position.set(curX, topY + 0.1, curZ); lip.castShadow = true;
        scene.add(lip);
        curW *= 0.78; curD *= 0.78;
        curX += rnd(-1.2, 1.2); curZ += rnd(-1.2, 1.2);
      }
    }
    addCollider({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, h: h + 0.3 });
    // تفاصيل السطح
    const roofY = topY;
    const nProps = rint(2, 5);
    for (let k = 0; k < nProps; k++) props.push([curX + rnd(-curW * 0.35, curW * 0.35), roofY, curZ + rnd(-curD * 0.35, curD * 0.35), rnd(1.2, 3), rnd(0.8, 1.8), rnd(1.2, 3)]);
    if (Math.random() < 0.35) tanks.push([curX + rnd(-curW * 0.3, curW * 0.3), roofY, curZ + rnd(-curD * 0.3, curD * 0.3)]);
    if (tall && h > 60) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 20, 6), new THREE.MeshStandardMaterial({ color: 0x888d99, metalness: 0.8, roughness: 0.4 }));
      ant.position.set(curX, roofY + 10, curZ); ant.castShadow = true;
      scene.add(ant);
      const bl = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.2, 0.3) }));
      bl.position.set(curX, roofY + 20.2, curZ);
      scene.add(bl);
      world.blink = world.blink || [];
      world.blink.push(bl);
    }
    // لوحة إعلانية على السطح
    if (h > 22 && Math.random() < 0.22) bills.push([cx + rnd(-w / 4, w / 4), roofY, cz + (Math.random() < 0.5 ? 1 : -1) * (d / 2 - 1.2), Math.random() < 0.5 ? 0 : Math.PI]);
    // واجهات المحلات على الجانبين المطلين على الشارع
    const sides = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [sx, sz] of sides) {
      const len = sx === 0 ? w : d;
      const n = Math.floor(len / 6.2);
      for (let k = 0; k < n; k++) {
        if (Math.random() < 0.2) continue;
        const off = (k - (n - 1) / 2) * (len / n);
        const px = cx + (sx === 0 ? off : sx * (w / 2 + 0.04));
        const pz = cz + (sz === 0 ? off : sz * (d / 2 + 0.04));
        shops.push([px, 0.3, pz, Math.atan2(sx, sz)]);
      }
    }
  }

  // ----- البلوكات -----
  const slabGeo = new THREE.BoxGeometry(BLOCK, 0.3, BLOCK);
  const conc = concreteTex(); conc.repeat.set(8, 8);
  const grass = grassTex(); grass.repeat.set(6, 6);
  const slabMat = new THREE.MeshStandardMaterial({ map: conc, bumpMap: conc, bumpScale: 0.6, roughness: 0.85 });
  const grassMat = new THREE.MeshStandardMaterial({ map: grass, roughness: 1 });
  const nBlocks = N * N;
  const slabs = new THREE.InstancedMesh(slabGeo, slabMat, nBlocks);
  const parkSlabs = new THREE.InstancedMesh(slabGeo, grassMat, nBlocks);
  slabs.receiveShadow = parkSlabs.receiveShadow = true;
  let si = 0, pi = 0;
  const palms = [];
  const bushes = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const c = nodePos(i + 0.5, j + 0.5);
    const distC = Math.hypot(c.x, c.z) / HALF;
    let type = 'normal';
    const r = Math.random();
    if (r < 0.14) type = 'park';
    else if (distC < 0.55 && r < 0.52) type = 'tower';
    world.blocks.push({ i, j, x: c.x, z: c.z, type });
    dummy.position.set(c.x, 0.15, c.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    if (type === 'park') parkSlabs.setMatrixAt(pi++, dummy.matrix); else slabs.setMatrixAt(si++, dummy.matrix);
    if (type === 'park') {
      world.parkBlocks.push({ x: c.x, z: c.z });
      const n = rint(10, 15);
      for (let k = 0; k < n; k++) palms.push([c.x + rnd(-27, 27), c.z + rnd(-27, 27)]);
      for (let k = 0; k < 22; k++) bushes.push([c.x + rnd(-29, 29), c.z + rnd(-29, 29), rnd(0.6, 1.4)]);
      for (let k = 0; k < 3; k++) {
        const bx = c.x + rnd(-20, 20), bz = c.z + rnd(-20, 20);
        const bench = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 0.6), new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.8 }));
        bench.position.set(bx, 0.7, bz); bench.castShadow = true;
        const legs = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.5), new THREE.MeshStandardMaterial({ color: 0x333 }));
        legs.position.set(bx, 0.5, bz);
        scene.add(bench, legs);
      }
      const fo = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 0.9, 28), new THREE.MeshStandardMaterial({ color: 0xcfcac0, roughness: 0.7 }));
      fo.position.set(c.x, 0.75, c.z); fo.castShadow = true; fo.receiveShadow = true;
      const fw = new THREE.Mesh(new THREE.CircleGeometry(4.6, 28), new THREE.MeshPhysicalMaterial({ color: 0x1b8fd0, roughness: 0.04, metalness: 0.2, clearcoat: 1 }));
      fw.rotation.x = -Math.PI / 2; fw.position.set(c.x, 1.18, c.z);
      scene.add(fo, fw);
      addCollider({ x0: c.x - 5.2, x1: c.x + 5.2, z0: c.z - 5.2, z1: c.z + 5.2, h: 1.2 });
    } else if (type === 'tower') {
      const s = rnd(38, 50);
      addBuilding(c.x + rnd(-4, 4), c.z + rnd(-4, 4), s, rnd(36, 50), rnd(80, 150) * (1.15 - distC * 0.5), true);
    } else {
      const base = distC < 0.7 ? 1.9 : distC < 1 ? 1.2 : 0.7;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        if (Math.random() < 0.08) continue;
        const w = rnd(18, 26), d = rnd(18, 26);
        const h = rnd(10, 32) * base * (Math.random() < 0.15 ? 1.8 : 1);
        addBuilding(c.x + sx * 14.5, c.z + sz * 14.5, w, d, Math.max(8, h), h > 30);
      }
    }
  }
  slabs.count = si; parkSlabs.count = pi;
  slabs.instanceMatrix.needsUpdate = true; parkSlabs.instanceMatrix.needsUpdate = true;
  scene.add(slabs, parkSlabs);

  // ----- أجهزة السطح -----
  const propMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x8b9099, roughness: 0.6, metalness: 0.5 }), props.length);
  props.forEach(([x, y, z, w, h, d], i) => {
    dummy.position.set(x, y + h / 2, z); dummy.scale.set(w, h, d); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); propMesh.setMatrixAt(i, dummy.matrix);
  });
  propMesh.castShadow = true;
  scene.add(propMesh);
  const tankMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.4, 1.4, 2.6, 12), new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 0.8 }), tanks.length);
  tanks.forEach(([x, y, z], i) => { dummy.position.set(x, y + 3.2, z); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); tankMesh.setMatrixAt(i, dummy.matrix); });
  tankMesh.castShadow = true;
  scene.add(tankMesh);

  // ----- لوحات إعلانية -----
  for (let k = 0; k < 5; k++) {
    const t = billboardTex();
    const bm = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(2.4, 2.4, 2.4), toneMapped: true });
    world.nightMats.push({ m: bm, base: 1.0 });
    const list = bills.filter((_, i) => i % 5 === k);
    list.forEach(([x, y, z, rot]) => {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), bm);
      pl.position.set(x, y + 8.5, z); pl.rotation.y = rot;
      const back = new THREE.Mesh(new THREE.BoxGeometry(14.4, 7.4, 0.3), new THREE.MeshStandardMaterial({ color: 0x1a1a22 }));
      back.position.set(x, y + 8.5, z + (rot ? 0.2 : -0.2)); back.castShadow = true;
      scene.add(pl, back);
      for (const sx of [-4, 4]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5, 0.4), new THREE.MeshStandardMaterial({ color: 0x333 }));
        p.position.set(x + sx, y + 2.5, z); scene.add(p);
      }
    });
  }

  // ----- واجهات المحلات -----
  const shopGeo = new THREE.PlaneGeometry(6, 4.5).translate(0, 2.25, 0);
  const SHOP_TYPES = 6;
  const shopBuckets = Array.from({ length: SHOP_TYPES }, () => []);
  shops.forEach((s) => shopBuckets[Math.floor(Math.random() * SHOP_TYPES)].push(s));
  shopBuckets.forEach((list) => {
    const t = storefrontTex();
    const m = new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.5, metalness: 0.2 });
    world.nightMats.push({ m, shop: true });
    const im = new THREE.InstancedMesh(shopGeo, m, list.length);
    list.forEach(([x, y, z, rot], i) => { dummy.position.set(x, y, z); dummy.rotation.set(0, rot, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.receiveShadow = true;
    scene.add(im);
  });

  // ----- شجيرات -----
  const bushMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x2c7a38, roughness: 0.9 }), bushes.length);
  bushes.forEach(([x, z, s], i) => { dummy.position.set(x, 0.3 + s * 0.5, z); dummy.scale.set(s, s * 0.8, s); dummy.rotation.set(0, rnd(0, 6), 0); dummy.updateMatrix(); bushMesh.setMatrixAt(i, dummy.matrix); });
  bushMesh.castShadow = true;
  scene.add(bushMesh);

  // ----- خطوط الطريق -----
  const dashGeo = new THREE.BoxGeometry(0.32, 0.02, 3.4);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf2e6a0, roughness: 0.6 });
  const dashes = [];
  for (let k = 0; k <= N; k++) {
    const c = (k - N / 2) * P;
    for (let t = -HALF + 4; t < HALF; t += 8) {
      const d = (((t + HALF) % P) + P) % P;
      if (Math.min(d, P - d) < 11) continue;
      dashes.push([t, c, false]);
      dashes.push([c, t, true]);
    }
  }
  const dm = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
  dashes.forEach(([x, z, alongZ], i) => { dummy.position.set(x, 0.03, z); dummy.rotation.set(0, alongZ ? 0 : Math.PI / 2, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); dm.setMatrixAt(i, dummy.matrix); });
  scene.add(dm);
  const zebra = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const p = nodePos(i, j);
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if ((i === 0 && ax < 0) || (i === N && ax > 0) || (j === 0 && az < 0) || (j === N && az > 0)) continue;
      for (let s = -6; s <= 6; s += 1.8) zebra.push([p.x + ax * 11.5 + (az !== 0 ? s : 0), p.z + az * 11.5 + (ax !== 0 ? s : 0), ax !== 0]);
    }
  }
  const zm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.02, 3.4), new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.55 }), zebra.length);
  zebra.forEach(([x, z, alongX], i) => { dummy.position.set(x, 0.035, z); dummy.rotation.set(0, alongX ? 0 : Math.PI / 2, 0); dummy.updateMatrix(); zm.setMatrixAt(i, dummy.matrix); });
  scene.add(zm);

  // ----- نخيل حقيقي -----
  for (let k = 0; k < 150; k++) {
    const a = rnd(0, Math.PI * 2), r = rnd(HALF + 30, ISLAND - 10);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) > HALF + 22 || Math.abs(z) > HALF + 22) palms.push([x, z]);
  }
  for (let t = -HALF; t <= HALF; t += 20) palms.push([t, -HALF - 14], [t, HALF + 14], [-HALF - 14, t], [HALF + 14, t]);
  // على أرصفة الشوارع الرئيسية
  for (let i = 0; i <= N; i++) for (let t = -HALF + 14; t < HALF; t += 40) {
    const c = (i - N / 2) * P;
    if (Math.abs(((t + HALF) % P)) < 14 || Math.abs(((t + HALF) % P) - P) < 14) continue;
    if (Math.random() < 0.5) palms.push([t, c + (Math.random() < 0.5 ? 9.2 : -9.2)]); else palms.push([c + (Math.random() < 0.5 ? 9.2 : -9.2), t]);
  }
  const trunkG = new THREE.CylinderGeometry(0.2, 0.34, 7, 8, 12, true);
  {
    const p = trunkG.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 3.5; p.setZ(i, p.getZ(i) + 0.03 * y * y); p.setY(i, y); }
    trunkG.computeVertexNormals();
  }
  const bark = barkTex(); bark.repeat.set(1, 3);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ map: bark, roughness: 1 }), palms.length);
  const frondG = new THREE.PlaneGeometry(1.7, 4.6, 1, 10).rotateX(-Math.PI / 2).translate(0, 0, 2.3);
  {
    const p = frondG.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      p.setY(i, -0.085 * z * z);
      p.setX(i, p.getX(i) * (1 - 0.65 * (z / 4.6)));
    }
    frondG.computeVertexNormals();
  }
  const fMap = frondTex();
  const frondMat = new THREE.MeshStandardMaterial({ map: fMap, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7, color: 0xffffff });
  const FR = 10;
  const fronds = new THREE.InstancedMesh(frondG, frondMat, palms.length * FR);
  trunks.castShadow = fronds.castShadow = true;
  const M1 = new THREE.Matrix4(), M2 = new THREE.Matrix4(), E = new THREE.Euler(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3();
  let fi = 0;
  palms.forEach(([x, z], i) => {
    const sc = rnd(0.85, 1.3), yaw = rnd(0, 6.28), gy = groundY(x, z);
    dummy.position.set(x, gy, z); dummy.rotation.set(0, yaw, 0); dummy.scale.setScalar(sc); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    M1.copy(dummy.matrix);
    for (let k = 0; k < FR; k++) {
      V.set(0, 7, 0.03 * 49);
      E.set(rnd(-0.1, 0.25) - (k % 2 ? 0.25 : 0), (k * Math.PI * 2) / FR + rnd(-0.15, 0.15), 0, 'YXZ');
      Q.setFromEuler(E); SC.set(1, 1, rnd(0.85, 1.1));
      M2.compose(V, Q, SC);
      M2.premultiply(M1);
      fronds.setMatrixAt(fi++, M2);
    }
    addCollider({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4, h: 8 });
  });
  scene.add(trunks, fronds);

  // ----- أعمدة إنارة + بقع الضوء -----
  const lampPos = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const p = nodePos(i, j);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lampPos.push([p.x + sx * 9.5, p.z + sz * 9.5, Math.atan2(-sx, -sz)]);
  }
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.15, 6.8, 8), new THREE.MeshStandardMaterial({ color: 0x3d4048, roughness: 0.5, metalness: 0.7 }), lampPos.length);
  poles.castShadow = true;
  world.lampMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
  const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.16, 0.45), world.lampMat, lampPos.length);
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex('rgba(255,190,110,0.9)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, fog: false }), lampPos.length);
  world.poolMat = pools.material;
  lampPos.forEach(([x, z, rot], i) => {
    dummy.scale.set(1, 1, 1);
    dummy.position.set(x, 3.4, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 6.9, z); dummy.rotation.set(0, rot, 0); dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x - Math.sin(rot) * 3, 0.32, z - Math.cos(rot) * 3); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); pools.setMatrixAt(i, dummy.matrix);
  });
  scene.add(poles, heads, pools);

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
