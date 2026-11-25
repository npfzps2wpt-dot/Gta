import * as THREE from '../lib/three.module.js';
import { Sound } from './audio.js';
import {
  N, BLOCK, ROAD, P, HALF, ISLAND, rnd, rint, pick, clamp, wrap, lerp,
  nodePos, nearestNode, neighbors, groundY, pushOut, hitInfo, rayWorld, lineClear,
  buildWorld, MAPR, MAP_PX,
} from './world.js';

const $ = (id) => document.getElementById(id);
const sound = new Sound();

// =====================================================================
// المشهد
// =====================================================================
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd8607a, 120, 760);
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2400);
scene.add(camera);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// الإضاءة
const hemi = new THREE.HemisphereLight(0xaaccff, 0x554466, 0.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d0, 1.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const SC = 85;
Object.assign(sun.shadow.camera, { left: -SC, right: SC, top: SC, bottom: -SC, near: 1, far: 500 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.3;
scene.add(sun, sun.target);

// السماء
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() } },
  vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 hor; void main(){ float h=normalize(vP).y; vec3 c=mix(hor,top,pow(clamp(h,0.0,1.0),0.55)); c=mix(c,hor*0.8,clamp(-h*4.0,0.0,1.0)); gl_FragColor=vec4(c,1.0);}',
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 24, 16), skyMat);
sky.renderOrder = -10;
scene.add(sky);
function glowTex(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.35, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,235,190,1)', 'rgba(255,120,90,0)'), fog: false, depthWrite: false, transparent: true }));
sunSprite.scale.set(700, 700, 1);
scene.add(sunSprite);
const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(235,240,255,1)', 'rgba(150,170,255,0)'), fog: false, depthWrite: false, transparent: true }));
moonSprite.scale.set(260, 260, 1);
scene.add(moonSprite);
const starGeo = new THREE.BufferGeometry();
{
  const a = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const u = Math.random() * 2 - 1, t = Math.random() * 6.283, r = Math.sqrt(1 - u * u);
    const y = Math.abs(u);
    a[i * 3] = Math.cos(t) * r * 1900; a[i * 3 + 1] = y * 1900; a[i * 3 + 2] = Math.sin(t) * r * 1900;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(a, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 5, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false }));
scene.add(stars);

// دورة النهار: [ساعة, سماء, أفق, ضباب, محيط, شمس, ليل]
const hex = (h) => new THREE.Color(h);
const KEYS = [
  [0, 0x050a1f, 0x1a1446, 0x140f38, 0.3, 0.25, 1],
  [5, 0x070d28, 0x2a1a55, 0x1c1445, 0.32, 0.25, 1],
  [6.5, 0x4a5f9f, 0xff9a7a, 0xd89a8a, 0.55, 0.8, 0.4],
  [9, 0x2f86e8, 0xa8dcff, 0xa8d4f0, 0.8, 1.6, 0],
  [16.5, 0x2f86e8, 0xa8dcff, 0xa8d4f0, 0.8, 1.6, 0],
  [18.5, 0x5a2f96, 0xff6a64, 0xd8607a, 0.6, 1.1, 0.3],
  [20, 0x1c1450, 0x7a2a7a, 0x4a1f5e, 0.42, 0.4, 0.85],
  [21.5, 0x050a1f, 0x1a1446, 0x140f38, 0.3, 0.25, 1],
  [24, 0x050a1f, 0x1a1446, 0x140f38, 0.3, 0.25, 1],
];
const cTop = new THREE.Color(), cHor = new THREE.Color(), cFog = new THREE.Color();
let nightF = 0;
let world;
const tmpC = new THREE.Color();
function applyTime(h, focus) {
  let k = 0;
  while (k < KEYS.length - 2 && h >= KEYS[k + 1][0]) k++;
  const a = KEYS[k], b = KEYS[k + 1];
  const f = (h - a[0]) / (b[0] - a[0]);
  cTop.copy(hex(a[1])).lerp(tmpC.copy(hex(b[1])), f);
  cHor.copy(hex(a[2])).lerp(tmpC.copy(hex(b[2])), f);
  cFog.copy(hex(a[3])).lerp(tmpC.copy(hex(b[3])), f);
  const amb = lerp(a[4], b[4], f), sunI = lerp(a[5], b[5], f);
  nightF = lerp(a[6], b[6], f);
  skyMat.uniforms.top.value.copy(cTop);
  skyMat.uniforms.hor.value.copy(cHor);
  scene.fog.color.copy(cFog);
  hemi.color.copy(cHor).lerp(hex(0xffffff), 0.35);
  hemi.intensity = amb;
  const ang = ((h - 5.5) / 13) * Math.PI;
  const sd = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.35).normalize();
  const dayLit = sd.y > -0.05;
  const L = dayLit ? sd : sd.clone().multiplyScalar(-1);
  sun.position.set(focus.x + L.x * 220, Math.max(40, L.y * 220), focus.z + L.z * 220);
  sun.target.position.set(focus.x, 0, focus.z);
  sun.intensity = dayLit ? sunI : 0.3;
  sun.color.set(dayLit ? (sd.y < 0.25 ? 0xffa070 : 0xfff0d8) : 0x8899ff);
  sunSprite.position.copy(camera.position).addScaledVector(sd, 1700);
  sunSprite.visible = sd.y > -0.12;
  const md = sd.clone().multiplyScalar(-1);
  moonSprite.position.copy(camera.position).addScaledVector(md, 1700);
  moonSprite.visible = md.y > 0 && nightF > 0.5;
  stars.material.opacity = clamp((nightF - 0.4) * 1.8, 0, 1);
  stars.position.copy(camera.position);
  sky.position.copy(camera.position);
  if (world) {
    const em = nightF * 1.1;
    for (const m of world.bldgMats) m.emissiveIntensity = em;
    world.lampMat.color.setRGB(0.3 + nightF * 1.0, 0.3 + nightF * 0.85, 0.2 + nightF * 0.4);
  }
}

// =====================================================================
// العالم
// =====================================================================
world = buildWorld(scene);
const miniStatic = world.minimapCanvas;

// =====================================================================
// أدوات: مواد ونماذج
// =====================================================================
const matCache = new Map();
function mat(color, extra) {
  const k = color + (extra ? JSON.stringify(extra) : '');
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra }));
  return matCache.get(k);
}
const basic = (c) => {
  const k = 'b' + c;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshBasicMaterial({ color: c }));
  return matCache.get(k);
};
const geoCache = new Map();
function box(w, h, d, ty = 0) {
  const k = [w, h, d, ty].join();
  if (!geoCache.has(k)) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ty) g.translate(0, ty, 0);
    geoCache.set(k, g);
  }
  return geoCache.get(k);
}
function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

const SKINS = [0xf1c8a0, 0xe0ac84, 0xc68863, 0x8d5a3b, 0x6b4128, 0xffdbb4];
const SHIRTS = [0xff5fa2, 0x3cc8ff, 0xffd23c, 0x7dff7d, 0xffffff, 0xff7a3c, 0xa56bff, 0x2ee6c5, 0xe84a4a, 0xf0f0f0];
const PANTS = [0x2b3a5a, 0x1c1c24, 0xd9d2c0, 0x3a2b2b, 0x4a5a7a, 0xeeeeee];

function makeHuman(shirt, pants, skin, hair, cap) {
  const g = new THREE.Group();
  const legs = [];
  for (const s of [-1, 1]) {
    const l = new THREE.Group();
    l.position.set(s * 0.17, 0.9, 0);
    l.add(mesh(box(0.28, 0.9, 0.3, -0.45), mat(pants)));
    g.add(l);
    legs.push(l);
  }
  g.add(mesh(box(0.64, 0.72, 0.36), mat(shirt), 0, 1.27, 0));
  g.add(mesh(box(0.32, 0.34, 0.32), mat(skin), 0, 1.8, 0));
  g.add(mesh(box(0.34, 0.12, 0.34), mat(cap || hair), 0, 1.99, 0));
  if (cap) g.add(mesh(box(0.34, 0.04, 0.2), mat(cap), 0, 1.95, 0.22));
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.43, 1.58, 0);
    a.add(mesh(box(0.2, 0.72, 0.22, -0.36), mat(shirt)));
    a.add(mesh(box(0.18, 0.18, 0.2, -0.78), mat(skin)));
    g.add(a);
    arms.push(a);
  }
  const gun = mesh(box(0.08, 0.14, 0.42), mat(0x111111), 0, -0.78, 0.2);
  arms[0].add(gun); // الذراع اليمنى (x=-0.43 في مجموعة تدور على y)
  gun.visible = false;
  return { group: g, legs, arms, gun };
}

const CAR_TYPES = {
  sedan: { body: [1.9, 0.72, 4.4], cab: [1.6, 0.58, 2.3, -0.25], max: 33, acc: 14, hp: 100 },
  sports: { body: [1.95, 0.55, 4.3], cab: [1.55, 0.46, 1.8, -0.35], max: 47, acc: 23, hp: 90 },
  suv: { body: [2.05, 0.95, 4.7], cab: [1.85, 0.72, 2.8, -0.3], max: 29, acc: 11, hp: 130 },
  van: { body: [2.05, 1.55, 4.9], cab: null, max: 25, acc: 9, hp: 140 },
  taxi: { body: [1.9, 0.72, 4.4], cab: [1.6, 0.58, 2.3, -0.25], max: 32, acc: 14, hp: 100 },
  police: { body: [1.95, 0.75, 4.5], cab: [1.65, 0.6, 2.3, -0.25], max: 40, acc: 18, hp: 120 },
};
const CAR_COLORS = [0xff3c5f, 0x2ee6e6, 0xffffff, 0x1c1c26, 0xffb02e, 0x3c7aff, 0x7dff7d, 0xa56bff, 0xe8e8e8, 0xff7a3c, 0x16a085, 0xcc2255];
const glassMat = new THREE.MeshStandardMaterial({ color: 0x0c1830, roughness: 0.15, metalness: 0.6 });
const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 12).rotateZ(Math.PI / 2);
const wheelMat = mat(0x111111);

function makeCarMesh(type, color) {
  const t = CAR_TYPES[type];
  const g = new THREE.Group();
  const [w, h, l] = t.body;
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 });
  const body = mesh(box(w, h, l), bodyMat, 0, 0.42 + h / 2, 0);
  g.add(body);
  if (t.cab) {
    const [cw, ch, cl, cz] = t.cab;
    const cab = mesh(box(cw, ch, cl), glassMat, 0, 0.42 + h + ch / 2, cz);
    g.add(cab);
    const roof = mesh(box(cw + 0.02, 0.06, cl * 0.8), bodyMat, 0, 0.42 + h + ch, cz);
    g.add(roof);
  } else {
    g.add(mesh(box(w - 0.1, 0.5, 0.05), glassMat, 0, 0.42 + h * 0.75, l / 2 + 0.01));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wh = mesh(wheelGeo, wheelMat, sx * (w / 2 - 0.05), 0.38, sz * l * 0.31);
    g.add(wh);
  }
  for (const sx of [-1, 1]) {
    g.add(mesh(box(0.36, 0.16, 0.06), basic(0xfff4c0), sx * (w / 2 - 0.35), 0.42 + h * 0.55, l / 2 + 0.02));
    g.add(mesh(box(0.36, 0.14, 0.06), basic(0xcc1122), sx * (w / 2 - 0.35), 0.42 + h * 0.55, -l / 2 - 0.02));
  }
  const extra = {};
  if (type === 'taxi') {
    g.add(mesh(box(0.7, 0.2, 0.3), basic(0xffffaa), 0, 0.42 + h + t.cab[1] + 0.12, t.cab[3]));
  }
  if (type === 'police') {
    const r = mesh(box(0.55, 0.16, 0.3), basic(0xff1133), -0.35, 0.42 + h + t.cab[1] + 0.1, t.cab[3]);
    const b = mesh(box(0.55, 0.16, 0.3), basic(0x1133ff), 0.35, 0.42 + h + t.cab[1] + 0.1, t.cab[3]);
    g.add(r, b);
    extra.lightR = r;
    extra.lightB = b;
    g.add(mesh(box(w + 0.02, 0.28, 2.0), mat(0xffffff), 0, 0.42 + h * 0.35, -0.2)); // باب أبيض
  }
  return { group: g, bodyMat, ...extra };
}

// =====================================================================
// الحالة العامة
// =====================================================================
const G = {
  started: false, running: false, hour: 18.3, heat: 0, stars: 0, unseen: 0,
  shake: 0, deadT: 0, cash: 800, time: 0, bannerT: 0, noLock: false, kills: 0,
};
const cars = [];
const peds = [];
const pickups = [];
const fxList = [];
const tracers = [];

const WEAPONS = [
  { name: 'القبضة', melee: true, dmg: 22, rate: 0.42 },
  { name: 'مسدس', dmg: 26, rate: 0.3, spread: 0.01, pellets: 1, snd: 0 },
  { name: 'رشاش', dmg: 14, rate: 0.085, spread: 0.035, pellets: 1, auto: true, snd: 1 },
  { name: 'بندقية صيد', dmg: 13, rate: 0.85, spread: 0.075, pellets: 8, snd: 2 },
];
const AMMO_PRICE = [0, 150, 300, 400];

const player = {
  pos: new THREE.Vector3(), vy: 0, heading: 0, hp: 100, inCar: null,
  weapon: 1, has: [true, true, false, false], ammo: [Infinity, 60, 0, 0],
  phase: 0, cd: 0, aimT: 0, punchT: 0, dead: false, hitFlash: 0, speed: 0,
};
const human = makeHuman(0xff5fa2, 0xf4f4f4, 0xe0ac84, 0x2a1a10);
human.gun.visible = true;
scene.add(human.group);

// الكاميرا
const cam = { yaw: 0, pitch: 0.28, idle: 0 };

// =====================================================================
// المدخلات
// =====================================================================
const keys = new Set();
const mouse = { l: false, r: false };
let pressed = new Set();
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  pressed.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); mouse.l = mouse.r = false; });
window.addEventListener('mousedown', (e) => {
  if (!G.running) return;
  if (e.button === 0) mouse.l = true;
  if (e.button === 2) mouse.r = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouse.l = false;
  if (e.button === 2) mouse.r = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('mousemove', (e) => {
  if (!G.running) return;
  if (document.pointerLockElement !== canvas && !G.noLock) return;
  if (G.noLock && !(e.buttons & 1) && !(e.buttons & 2)) return;
  cam.yaw -= e.movementX * 0.0024;
  cam.pitch = clamp(cam.pitch + e.movementY * 0.0022, -0.25, 1.25);
  cam.idle = 0;
});
window.addEventListener('wheel', (e) => {
  if (!G.running) return;
  cycleWeapon(e.deltaY > 0 ? 1 : -1);
});

function lockPointer() {
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => { G.noLock = true; });
  } catch (e) { G.noLock = true; }
}
document.addEventListener('pointerlockerror', () => { G.noLock = true; });
document.addEventListener('pointerlockchange', () => {
  if (!G.started) return;
  if (document.pointerLockElement === canvas) {
    G.running = true;
    $('pause').style.display = 'none';
  } else if (!G.noLock) {
    G.running = false;
    mouse.l = mouse.r = false;
    $('pause').style.display = 'flex';
    sound.engine(false, 0);
    sound.siren(0);
  }
});
$('start').addEventListener('click', () => {
  sound.init();
  $('menu').style.display = 'none';
  $('hud').classList.add('on');
  G.started = true;
  G.running = true;
  lockPointer();
  say('مرحباً في نيون سيتي! اقترب من الدائرة الصفراء لتبدأ مهمة', 4);
});
$('resume').addEventListener('click', () => { sound.init(); lockPointer(); G.running = true; $('pause').style.display = 'none'; });

// =====================================================================
// HUD
// =====================================================================
let toastT = 0;
function say(txt, t = 2.5) {
  const el = $('toast');
  el.textContent = txt;
  el.classList.add('on');
  toastT = t;
}
function banner(txt, cls = '', t = 3) {
  const b = $('big');
  b.style.display = 'flex';
  b.className = cls;
  $('bigtxt').textContent = txt;
  G.bannerT = t;
}
const mini = $('minimap');
const mg = mini.getContext('2d');

// =====================================================================
// تأثيرات
// =====================================================================
const sphereGeo = new THREE.SphereGeometry(1, 8, 6);
function addFx(color, pos, size, life, opts = {}) {
  if (fxList.length > 220) return;
  const m = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opts.op ?? 1, depthWrite: false }));
  m.position.copy(pos);
  m.scale.setScalar(size);
  scene.add(m);
  fxList.push({ m, life, max: life, vel: opts.vel || new THREE.Vector3(), grow: opts.grow || 0, op: opts.op ?? 1, grav: opts.grav || 0 });
}
function updateFx(dt) {
  for (let i = fxList.length - 1; i >= 0; i--) {
    const f = fxList[i];
    f.life -= dt;
    f.m.position.addScaledVector(f.vel, dt);
    f.vel.y -= f.grav * dt;
    if (f.grow) f.m.scale.addScalar(f.grow * dt);
    f.m.material.opacity = Math.max(0, (f.life / f.max) * f.op);
    if (f.life <= 0) {
      scene.remove(f.m);
      f.m.material.dispose();
      fxList.splice(i, 1);
    }
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      scene.remove(t.line);
      t.line.geometry.dispose();
      tracers.splice(i, 1);
    }
  }
}
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0 });
function addTracer(a, b) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(g, tracerMat);
  scene.add(line);
  tracers.push({ line, life: 0.06 });
}
const flashLight = new THREE.PointLight(0xffaa44, 0, 60);
scene.add(flashLight);
let flashT = 0;

function explosion(pos, power = 1) {
  G.shake = Math.max(G.shake, 0.9 * power);
  flashLight.position.copy(pos).add(new THREE.Vector3(0, 3, 0));
  flashLight.intensity = 400;
  flashT = 0.35;
  addFx(0xfff2a0, pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 1.2, 0.45, { grow: 14 * power });
  addFx(0xff7a1c, pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 1.0, 0.7, { grow: 11 * power, op: 0.9 });
  for (let i = 0; i < 12; i++) {
    const v = new THREE.Vector3(rnd(-5, 5), rnd(3, 11), rnd(-5, 5));
    addFx(pick([0xff9a2c, 0xffd23c, 0xff4a1c]), pos.clone().add(new THREE.Vector3(0, 1, 0)), rnd(0.3, 0.7), rnd(0.5, 1), { vel: v, grav: 12 });
  }
  for (let i = 0; i < 9; i++) {
    const v = new THREE.Vector3(rnd(-3, 3), rnd(3, 7), rnd(-3, 3));
    addFx(0x2a2a2e, pos.clone().add(new THREE.Vector3(0, 1.5, 0)), rnd(0.8, 1.6), rnd(1.6, 3), { vel: v, grow: 1.8, op: 0.8 });
  }
  sound.explode(clamp(1 - pos.distanceTo(camera.position) / 220, 0.15, 1));
  // ضرر محيطي
  const R = 11 * power;
  for (const c of cars) {
    if (c.exploded) continue;
    const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
    if (d < R && d > 0.1) {
      c.hp -= (1 - d / R) * 130;
      c.v.x += ((c.pos.x - pos.x) / d) * 8 * (1 - d / R);
      c.v.z += ((c.pos.z - pos.z) / d) * 8 * (1 - d / R);
    }
  }
  for (const p of peds) {
    if (p.dead) continue;
    const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
    if (d < R) damagePed(p, (1 - d / R) * 220, true, 'blast');
  }
  if (!player.inCar && !player.dead) {
    const d = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    if (d < R) hurtPlayer((1 - d / R) * 90);
  }
}

// =====================================================================
// السيارات
// =====================================================================
function spawnCar(type, x, z, heading, driver, color) {
  const t = CAR_TYPES[type];
  const col = color ?? (type === 'taxi' ? 0xffcc1a : type === 'police' ? 0x15171f : pick(CAR_COLORS));
  const m = makeCarMesh(type, col);
  scene.add(m.group);
  const car = {
    type, t, mesh: m.group, bodyMat: m.bodyMat, lightR: m.lightR, lightB: m.lightB,
    pos: new THREE.Vector3(x, groundY(x, z), z), v: { x: 0, z: 0 }, heading,
    hp: t.hp, driver, exploded: false, len: t.body[2], wid: t.body[0],
    nav: null, cruise: rnd(10, 15), stuck: 0, rev: 0, steerV: 0, speed: 0, smokeT: 0, age: 0, cops: 0, deadT: 0,
  };
  car.mesh.position.copy(car.pos);
  car.mesh.rotation.y = heading;
  cars.push(car);
  return car;
}
function removeCar(c) {
  scene.remove(c.mesh);
  const i = cars.indexOf(c);
  if (i >= 0) cars.splice(i, 1);
}
function carCircles(c) {
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  const o = c.len / 2 - 1.05;
  return [
    [c.pos.x + fx * o, c.pos.z + fz * o, c.wid / 2 + 0.05],
    [c.pos.x - fx * o, c.pos.z - fz * o, c.wid / 2 + 0.05],
  ];
}

function stepCar(c, dt, throttle, steer, hand) {
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  let vf = c.v.x * fx + c.v.z * fz;
  let vl = c.v.x * fz - c.v.z * fx;
  const max = c.t.max;
  if (throttle > 0) {
    vf += c.t.acc * throttle * dt * clamp(1.15 - Math.max(vf, 0) / max, 0.05, 1);
  } else if (throttle < 0) {
    if (vf > 0.6) vf -= 30 * -throttle * dt;
    else vf += c.t.acc * 0.6 * throttle * dt * clamp(1 - Math.abs(vf) / (max * 0.3), 0, 1);
  } else {
    vf *= Math.exp(-0.45 * dt);
  }
  vf *= Math.exp(-0.06 * dt);
  const grip = hand ? 1.4 : 7.5;
  vl *= Math.exp(-grip * dt);
  if (hand) vf *= Math.exp(-0.9 * dt);
  const rate = (1.9 / (1 + Math.abs(vf) / 16)) * (hand ? 1.5 : 1);
  c.steerV = lerp(c.steerV, steer, 1 - Math.exp(-9 * dt));
  c.heading += c.steerV * rate * clamp(vf / 5, -1, 1) * dt;
  const nfx = Math.sin(c.heading), nfz = Math.cos(c.heading);
  c.v.x = nfx * vf + nfz * vl;
  c.v.z = nfz * vf - nfx * vl;
  c.pos.x += c.v.x * dt;
  c.pos.z += c.v.z * dt;
  c.speed = vf;
  c.lat = vl;
}

function carWorldCollide(c, dt) {
  let worst = 0;
  for (const [cx, cz, r] of carCircles(c)) {
    const p = { x: cx, z: cz };
    const pen = pushOut(p, r);
    if (pen > 0) {
      c.pos.x += p.x - cx;
      c.pos.z += p.z - cz;
      const vn = c.v.x * hitInfo.nx + c.v.z * hitInfo.nz;
      if (vn < 0) {
        c.v.x -= hitInfo.nx * vn * 1.25;
        c.v.z -= hitInfo.nz * vn * 1.25;
        worst = Math.max(worst, -vn);
      }
    }
  }
  if (worst > 4) {
    c.hp -= (worst - 4) * 2.4;
    if (c.driver === 'player') {
      sound.crash(worst / 20);
      G.shake = Math.max(G.shake, Math.min(0.5, worst / 40));
    }
  }
  const lim = ISLAND - 14;
  c.pos.x = clamp(c.pos.x, -lim, lim);
  c.pos.z = clamp(c.pos.z, -lim, lim);
}

function carCarCollide() {
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (Math.abs(a.pos.x - b.pos.x) > 6 || Math.abs(a.pos.z - b.pos.z) > 6) continue;
      for (const [ax, az, ar] of carCircles(a)) for (const [bx, bz, br] of carCircles(b)) {
        let dx = ax - bx, dz = az - bz;
        const d = Math.hypot(dx, dz);
        if (d >= ar + br || d < 1e-4) continue;
        dx /= d; dz /= d;
        const pen = ar + br - d;
        a.pos.x += dx * pen * 0.5; a.pos.z += dz * pen * 0.5;
        b.pos.x -= dx * pen * 0.5; b.pos.z -= dz * pen * 0.5;
        const rel = (a.v.x - b.v.x) * dx + (a.v.z - b.v.z) * dz;
        if (rel < 0) {
          const j2 = (-(1.3) * rel) / 2;
          a.v.x += dx * j2; a.v.z += dz * j2;
          b.v.x -= dx * j2; b.v.z -= dz * j2;
          const dmg = Math.max(0, -rel - 4) * 2.2;
          if (dmg > 0) {
            a.hp -= dmg; b.hp -= dmg;
            if (a.driver === 'player' || b.driver === 'player') {
              sound.crash(-rel / 18);
              G.shake = Math.max(G.shake, Math.min(0.5, -rel / 40));
              const other = a.driver === 'player' ? b : a;
              if (other.type === 'police' && -rel > 6) addHeat(18);
            }
            if (a.type === 'police' && b.driver === 'player') addHeat(0);
          }
        }
      }
    }
  }
}

function blowCar(c) {
  if (c.exploded) return;
  c.exploded = true;
  c.deadT = 0;
  const wasPlayer = c.driver === 'player';
  explosion(c.pos, 1);
  c.bodyMat.color.setHex(0x151515);
  c.bodyMat.metalness = 0;
  c.v.x *= 0.3; c.v.z *= 0.3;
  if (wasPlayer) {
    player.inCar = null;
    placePlayerBeside(c);
    player.vy = 7;
    hurtPlayer(35);
  }
  if (c.driver !== null && c.driver !== 'player') {
    // السائق يموت
    const dp = c.driver === 'police' ? 40 : 15;
    if (c.driver === 'police') addHeat(25);
    if (lastAttackByPlayer(c)) addHeat(dp);
  }
  if (lastAttackByPlayer(c)) addHeat(15);
  c.driver = null;
  c.hp = 0;
  if (c.lightR) { c.lightR.visible = false; c.lightB.visible = false; }
}
function lastAttackByPlayer(c) { return c.pos.distanceTo(player.pos) < 60; }

const NAV_LANE = 4.2;
function laneTarget(nav, off) {
  const a = nodePos(nav.a.i, nav.a.j), b = nodePos(nav.b.i, nav.b.j);
  let dx = b.x - a.x, dz = b.z - a.z;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  return { x: b.x + -dz * off, z: b.z + dx * off, dx, dz };
}
function nextNode(nav, goal) {
  const opts = neighbors(nav.b).filter((n) => !(n.i === nav.a.i && n.j === nav.a.j));
  if (!opts.length) return nav.a;
  if (goal) {
    let best = null, bd = Infinity;
    for (const n of opts) {
      const p = nodePos(n.i, n.j);
      const d = Math.hypot(p.x - goal.x, p.z - goal.z) + rnd(0, 25);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  // تفضيل الاستقامة
  const straight = opts.find((n) => n.i - nav.b.i === nav.b.i - nav.a.i && n.j - nav.b.j === nav.b.j - nav.a.j);
  if (straight && Math.random() < 0.55) return straight;
  return pick(opts);
}

function obstacleAhead(c, selfIsPlayer) {
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  let best = 99;
  const look = 9 + Math.abs(c.speed) * 0.7;
  const test = (x, z, w) => {
    const rx = x - c.pos.x, rz = z - c.pos.z;
    const ahead = rx * fx + rz * fz;
    if (ahead < 1 || ahead > look) return;
    const lat = Math.abs(rx * fz - rz * fx);
    if (lat < 1.9 + w) best = Math.min(best, ahead);
  };
  for (const o of cars) if (o !== c && !o.exploded) test(o.pos.x, o.pos.z, 0.6);
  for (const p of peds) if (!p.dead) test(p.pos.x, p.pos.z, 0.2);
  if (!player.inCar) test(player.pos.x, player.pos.z, 0.2);
  return best;
}

function aiCar(c, dt) {
  const police = c.type === 'police';
  const chase = police && G.stars > 0 && c.pos.distanceTo(player.pos) < 330;
  const pp = player.inCar ? player.inCar.pos : player.pos;
  if (!c.nav) {
    const a = nearestNode(c.pos.x, c.pos.z);
    c.nav = { a, b: pick(neighbors(a)) };
  }
  let tx, tz, target = chase ? 36 : c.cruise;
  const dToPlayer = Math.hypot(pp.x - c.pos.x, pp.z - c.pos.z);
  const direct = chase && dToPlayer < 45 && lineClear(c.pos.x, c.pos.z, pp.x, pp.z, 1.2);
  const footStop = chase && !player.inCar && dToPlayer < 22;
  if (direct) {
    tx = pp.x; tz = pp.z;
    if (footStop) target = 0;
  } else {
    let lt = laneTarget(c.nav, chase ? 0 : NAV_LANE);
    if (Math.hypot(lt.x - c.pos.x, lt.z - c.pos.z) < (chase ? 14 : 9)) {
      const n = nextNode(c.nav, chase ? pp : null);
      c.nav = { a: c.nav.b, b: n };
      lt = laneTarget(c.nav, chase ? 0 : NAV_LANE);
    }
    tx = lt.x; tz = lt.z;
  }
  const dx = tx - c.pos.x, dz = tz - c.pos.z;
  const diff = wrap(Math.atan2(dx, dz) - c.heading);
  let steer = clamp(diff * 2.4, -1, 1);
  if (Math.abs(diff) > 0.7) target = Math.min(target, chase ? 12 : 6);
  const obs = obstacleAhead(c);
  if (obs < 99) target = Math.min(target, Math.max(0, (obs - 5.5) * 1.4));
  let thr = clamp((target - c.speed) * 0.5, -1, 1);
  if (thr < 0) thr = Math.max(thr, c.speed > 0 ? thr : 0);
  // تعلّق
  if (c.rev > 0) {
    c.rev -= dt;
    thr = -1; steer = -steer || 1;
  } else if (Math.abs(c.speed) < 0.8 && target > 3 && !footStop) {
    c.stuck += dt;
    if (c.stuck > 2.5) { c.rev = 1.4; c.stuck = 0; }
  } else c.stuck = Math.max(0, c.stuck - dt);
  stepCar(c, dt, thr, steer, false);
  // أضواء الشرطة
  if (police) {
    const on = Math.floor(G.time * 6) % 2 === 0;
    c.lightR.material = basic(on ? 0xff1133 : 0x330008);
    c.lightB.material = basic(on ? 0x000a33 : 0x1a44ff);
  }
  // الشرطي ينزل
  if (footStop && Math.abs(c.speed) < 2 && c.cops < Math.min(4, 1 + G.stars) && Math.random() < dt * 0.8) {
    c.cops++;
    const side = new THREE.Vector3(Math.cos(c.heading), 0, -Math.sin(c.heading)).multiplyScalar(2.6);
    spawnPed('cop', c.pos.x + side.x, c.pos.z + side.z);
  }
}

// =====================================================================
// المشاة
// =====================================================================
function spawnPed(type, x, z) {
  let h;
  if (type === 'cop') h = makeHuman(0x1d2e78, 0x141a38, pick(SKINS), 0x111111, 0x0e1430);
  else if (type === 'gang') h = makeHuman(0xff8a1e, 0x222222, pick(SKINS), 0x111111, 0xcc2222);
  else h = makeHuman(pick(SHIRTS), pick(PANTS), pick(SKINS), pick([0x111111, 0x3a2412, 0xc9a24a, 0x777777]));
  if (type !== 'civ') h.gun.visible = true;
  const p = {
    type, h, mesh: h.group, pos: new THREE.Vector3(x, groundY(x, z), z), heading: rnd(0, 6.28), hp: type === 'civ' ? 60 : 100,
    dead: false, deadT: 0, flee: 0, fleeFrom: null, nav: null, side: Math.random() < 0.5 ? 1 : -1,
    speed: rnd(1.5, 2.4), phase: rnd(0, 6), shootT: rnd(0.5, 1.5), alert: false, stuck: 0, away: 0, vy: 0, kv: { x: 0, z: 0 },
  };
  p.mesh.position.copy(p.pos);
  scene.add(p.mesh);
  peds.push(p);
  return p;
}
function removePed(p) {
  scene.remove(p.mesh);
  const i = peds.indexOf(p);
  if (i >= 0) peds.splice(i, 1);
}
function damagePed(p, dmg, byPlayer, how) {
  if (p.dead) return;
  p.hp -= dmg;
  if (p.type === 'cop') { addHeat(how === 'blast' ? 0 : 35); }
  if (p.type === 'civ') { p.flee = 7; p.fleeFrom = { x: player.pos.x, z: player.pos.z }; }
  if (p.type === 'gang') p.alert = true;
  if (p.hp <= 0) {
    p.dead = true;
    p.deadT = 0;
    p.mesh.rotation.set(-Math.PI / 2, p.heading, 0);
    p.mesh.position.y = p.pos.y + 0.25;
    G.kills++;
    if (byPlayer) {
      if (p.type === 'civ') addHeat(how === 'car' ? 14 : 28);
      if (p.type === 'cop') addHeat(70);
      if (p.type === 'gang') addHeat(5);
    }
    if (p.type === 'civ' && Math.random() < 0.7) dropPickup('cash', p.pos.x, p.pos.z, rint(15, 120));
    if (p.type === 'cop' && Math.random() < 0.6) dropPickup('ammo', p.pos.x, p.pos.z, 20);
    if (p.type === 'gang') dropPickup('cash', p.pos.x, p.pos.z, rint(40, 140));
    // ذعر من حولك
    for (const o of peds) if (o.type === 'civ' && !o.dead && o.pos.distanceTo(p.pos) < 40) { o.flee = 8; o.fleeFrom = { x: p.pos.x, z: p.pos.z }; }
  }
}

function pedStep(p, dt) {
  if (p.dead) {
    p.deadT += dt;
    if (p.deadT > 14) removePed(p);
    return;
  }
  let dirx = 0, dirz = 0, spd = 0;
  const pp = player.inCar ? player.inCar.pos : player.pos;
  const dP = Math.hypot(pp.x - p.pos.x, pp.z - p.pos.z);

  if (p.type === 'civ') {
    if (p.flee > 0) {
      p.flee -= dt;
      const f = p.fleeFrom || pp;
      dirx = p.pos.x - f.x; dirz = p.pos.z - f.z;
      const l = Math.hypot(dirx, dirz) || 1;
      dirx /= l; dirz /= l;
      spd = 6.8;
      if (p.flee <= 0) p.nav = null;
    } else {
      if (!p.nav) {
        const a = nearestNode(p.pos.x, p.pos.z);
        p.nav = { a, b: pick(neighbors(a)) };
      }
      let lt = laneTarget(p.nav, p.side * 10.4);
      if (Math.hypot(lt.x - p.pos.x, lt.z - p.pos.z) < 2.5) {
        const n = nextNode(p.nav, null);
        p.nav = { a: p.nav.b, b: n };
        if (Math.random() < 0.3) p.side = -p.side;
        lt = laneTarget(p.nav, p.side * 10.4);
      }
      dirx = lt.x - p.pos.x; dirz = lt.z - p.pos.z;
      const l = Math.hypot(dirx, dirz) || 1;
      dirx /= l; dirz /= l;
      spd = p.speed;
    }
  } else {
    // شرطي / عصابة
    const active = p.type === 'cop' ? G.stars > 0 : (p.alert || dP < 55);
    if (active && !player.dead) {
      p.alert = true;
      const range = p.type === 'cop' ? 16 : 14;
      const los = dP < 60 && lineClear(p.pos.x, p.pos.z, pp.x, pp.z, 1.4);
      dirx = pp.x - p.pos.x; dirz = pp.z - p.pos.z;
      const l = Math.hypot(dirx, dirz) || 1;
      dirx /= l; dirz /= l;
      if (dP > range || !los) spd = p.type === 'cop' ? 6.2 : 5.2;
      else spd = 0;
      if (spd === 0 || dP < 40) p.heading = Math.atan2(dirx, dirz);
      p.shootT -= dt;
      if (los && dP < 38 && p.shootT <= 0) {
        p.shootT = rnd(0.55, 1.1);
        sound.gun(0, clamp(1 - dP / 70, 0.15, 0.6));
        const from = new THREE.Vector3(p.pos.x, p.pos.y + 1.4, p.pos.z);
        const to = new THREE.Vector3(pp.x + rnd(-1, 1), (player.inCar ? 1 : 1.3) + pp.y, pp.z + rnd(-1, 1));
        addTracer(from, to);
        const hitP = 0.3 + (G.stars > 2 ? 0.1 : 0) - Math.min(0.15, dP / 250);
        if (Math.random() < hitP) {
          if (player.inCar) { player.inCar.hp -= 3; hurtPlayer(2.5); } else hurtPlayer(rint(4, 8));
        }
      }
      // تأخير الشرطي بعد انتهاء الطلب
    } else if (p.type === 'cop') {
      p.away += dt;
      if (p.away > 10 || dP > 150) removePed(p);
      spd = 1.5;
      dirx = Math.sin(p.heading); dirz = Math.cos(p.heading);
    } else {
      spd = 0;
    }
    if (p.type === 'cop' && G.stars === 0) p.away += 0; else if (G.stars > 0) p.away = 0;
  }

  // حركة + تصادمات
  if (spd > 0) {
    if (p.type === 'civ' || spd > 0) p.heading = lerpAngle(p.heading, Math.atan2(dirx, dirz), 1 - Math.exp(-10 * dt));
    p.pos.x += dirx * spd * dt;
    p.pos.z += dirz * spd * dt;
  }
  p.pos.x += p.kv.x * dt; p.pos.z += p.kv.z * dt;
  p.kv.x *= Math.exp(-5 * dt); p.kv.z *= Math.exp(-5 * dt);
  const before = { x: p.pos.x, z: p.pos.z };
  const pen = pushOut(p.pos, 0.42);
  if (pen > 0 && spd > 0) {
    p.stuck += dt;
    if (p.stuck > 1.5) {
      p.stuck = 0;
      if (p.type === 'civ') { p.nav = null; p.side = -p.side; }
      p.heading += rnd(-2, 2);
    }
  } else p.stuck = 0;
  const lim = ISLAND - 8;
  p.pos.x = clamp(p.pos.x, -lim, lim);
  p.pos.z = clamp(p.pos.z, -lim, lim);
  const gy = groundY(p.pos.x, p.pos.z);
  p.pos.y = lerp(p.pos.y, gy, 1 - Math.exp(-20 * dt));
  p.phase += spd * dt * 1.7;
  p.mesh.position.copy(p.pos);
  p.mesh.rotation.set(0, p.heading, 0);
  animHuman(p.h, p.phase, spd, p.type !== 'civ' && spd < 0.5 ? 1 : 0);
}
function animHuman(h, phase, spd, aim) {
  const amp = clamp(spd / 5, 0, 1.2) * 0.9;
  const s = Math.sin(phase);
  h.legs[0].rotation.x = s * amp;
  h.legs[1].rotation.x = -s * amp;
  h.arms[0].rotation.x = aim ? -1.5 : -s * amp * 0.8;
  h.arms[1].rotation.x = aim ? -0.4 : s * amp * 0.8;
}
function lerpAngle(a, b, t) { return a + wrap(b - a) * t; }

// =====================================================================
// الشرطة والمطلوبية
// =====================================================================
const STAR_AT = [25, 75, 140, 230, 340];
function addHeat(n) {
  if (n <= 0) { G.unseen = 0; return; }
  G.heat = Math.min(420, G.heat + n);
  G.unseen = 0;
}
function starsFromHeat() {
  let s = 0;
  for (let i = 0; i < STAR_AT.length; i++) if (G.heat >= STAR_AT[i]) s = i + 1;
  return s;
}
function updateWanted(dt) {
  const prev = G.stars;
  G.stars = starsFromHeat();
  if (G.stars > prev) { say('مطلوب! ' + '★'.repeat(G.stars), 2); }
  if (prev > 0 && G.stars === 0) say('اختفيت من أنظار الشرطة', 2.5);
  if (G.stars > 0) {
    // هل الشرطة تراني؟
    let seen = false;
    const pp = player.inCar ? player.inCar.pos : player.pos;
    for (const c of cars) if (c.type === 'police' && !c.exploded && c.driver && c.pos.distanceTo(pp) < 75) seen = true;
    for (const p of peds) if (p.type === 'cop' && !p.dead && p.pos.distanceTo(pp) < 70) seen = true;
    if (seen) G.unseen = 0;
    else G.unseen += dt;
    if (G.unseen > 7) G.heat = Math.max(0, G.heat - dt * 7);
  }
}

// =====================================================================
// اللاعب
// =====================================================================
function hurtPlayer(d) {
  if (player.dead || d <= 0) return;
  player.hp -= d;
  player.hitFlash = 1;
  sound.hurt();
  if (player.hp <= 0) killPlayer();
}
function killPlayer() {
  player.dead = true;
  G.deadT = 0;
  banner('انتهت اللعبة', '', 4);
  if (player.inCar) { player.inCar.driver = null; player.inCar = null; }
  human.group.rotation.set(-Math.PI / 2, player.heading, 0);
  mouse.l = mouse.r = false;
  failMission(true);
}
function respawn() {
  const hosp = nodePos(2, 8);
  player.pos.set(hosp.x + 8, 0, hosp.z + 8);
  player.hp = 100;
  player.dead = false;
  player.vy = 0;
  G.cash = Math.max(0, G.cash - Math.min(500, Math.floor(G.cash * 0.1) + 100));
  G.heat = 0;
  $('big').style.display = 'none';
  say('تم إسعافك في المستشفى — دفعت الفاتورة', 4);
}
function placePlayerBeside(car) {
  const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
  player.pos.set(car.pos.x + side.x * 2.6, car.pos.y, car.pos.z + side.z * 2.6);
  for (let k = 0; k < 3; k++) {
    const p = { x: player.pos.x, z: player.pos.z };
    if (pushOut(p, 0.5) > 0) {
      player.pos.x = p.x; player.pos.z = p.z;
    } else break;
  }
  player.heading = car.heading;
  player.pos.y = groundY(player.pos.x, player.pos.z);
}
function tryEnterExit() {
  if (player.inCar) {
    const c = player.inCar;
    if (Math.abs(c.speed) > 14) { say('أبطئ قبل النزول!', 1.2); return; }
    c.driver = null;
    placePlayerBeside(c);
    player.inCar = null;
    sound.engine(false, 0);
    return;
  }
  let best = null, bd = 4.2;
  for (const c of cars) {
    if (c.exploded) continue;
    const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return;
  if (best.driver && best.driver !== 'player') {
    // سرقة السيارة
    const side = new THREE.Vector3(Math.cos(best.heading), 0, -Math.sin(best.heading)).multiplyScalar(-2.4);
    const was = best.driver;
    const dp = spawnPed(was === 'police' ? 'cop' : 'civ', best.pos.x + side.x, best.pos.z + side.z);
    if (was === 'police') { addHeat(60); dp.alert = true; } else { dp.flee = 8; dp.fleeFrom = { x: player.pos.x, z: player.pos.z }; addHeat(12); }
    best.v.x *= 0.3; best.v.z *= 0.3;
  }
  best.driver = 'player';
  best.nav = null;
  player.inCar = best;
  mouse.l = mouse.r = false;
  if (best.type === 'police') addHeat(10);
}

function cycleWeapon(dir) {
  let w = player.weapon;
  for (let k = 0; k < 4; k++) {
    w = (w + dir + 4) % 4;
    if (player.has[w]) break;
  }
  player.weapon = w;
  say(WEAPONS[w].name, 1);
}

function updatePlayer(dt) {
  if (player.dead) return;
  const kbd = (c) => keys.has(c);
  if (pressed.has('KeyF')) tryEnterExit();
  for (let i = 0; i < 4; i++) if (pressed.has('Digit' + (i + 1)) && player.has[i]) { player.weapon = i; say(WEAPONS[i].name, 1); }
  if (pressed.has('KeyM')) { sound.setMusic(!sound.musicOn); say(sound.musicOn ? 'الراديو: تشغيل' : 'الراديو: إيقاف', 1.2); }

  const inCar = player.inCar;
  if (inCar) {
    const thr = (kbd('KeyW') || kbd('ArrowUp') ? 1 : 0) - (kbd('KeyS') || kbd('ArrowDown') ? 1 : 0);
    const st = (kbd('KeyA') || kbd('ArrowLeft') ? 1 : 0) - (kbd('KeyD') || kbd('ArrowRight') ? 1 : 0);
    stepCar(inCar, dt, thr, st, kbd('Space'));
    if (pressed.has('KeyH')) sound.horn();
    player.pos.set(inCar.pos.x, inCar.pos.y, inCar.pos.z);
    human.group.visible = false;
    return;
  }
  human.group.visible = true;
  const f = { x: Math.sin(cam.yaw), z: Math.cos(cam.yaw) };
  const l = { x: Math.cos(cam.yaw), z: -Math.sin(cam.yaw) };
  let mx = 0, mz = 0;
  if (kbd('KeyW') || kbd('ArrowUp')) { mx += f.x; mz += f.z; }
  if (kbd('KeyS') || kbd('ArrowDown')) { mx -= f.x; mz -= f.z; }
  if (kbd('KeyA') || kbd('ArrowLeft')) { mx += l.x; mz += l.z; }
  if (kbd('KeyD') || kbd('ArrowRight')) { mx -= l.x; mz -= l.z; }
  const ml = Math.hypot(mx, mz);
  const aiming = mouse.r || player.aimT > 0;
  let spd = 0;
  if (ml > 0) {
    mx /= ml; mz /= ml;
    spd = kbd('ShiftLeft') || kbd('ShiftRight') ? 8.8 : 5.2;
    if (aiming) spd = 3;
    player.pos.x += mx * spd * dt;
    player.pos.z += mz * spd * dt;
    if (!aiming) player.heading = lerpAngle(player.heading, Math.atan2(mx, mz), 1 - Math.exp(-14 * dt));
  }
  if (aiming) player.heading = lerpAngle(player.heading, cam.yaw, 1 - Math.exp(-18 * dt));
  const gy = groundY(player.pos.x, player.pos.z);
  if (pressed.has('Space') && player.pos.y <= gy + 0.05) player.vy = 7.2;
  player.vy -= 24 * dt;
  player.pos.y += player.vy * dt;
  if (player.pos.y < gy) { player.pos.y = gy; player.vy = 0; }
  pushOut(player.pos, 0.45);
  const lim = ISLAND - 8;
  player.pos.x = clamp(player.pos.x, -lim, lim);
  player.pos.z = clamp(player.pos.z, -lim, lim);
  // سيارات تصدم اللاعب
  for (const c of cars) {
    if (Math.abs(c.pos.x - player.pos.x) > 5 || Math.abs(c.pos.z - player.pos.z) > 5) continue;
    for (const [cx, cz, r] of carCircles(c)) {
      let dx = player.pos.x - cx, dz = player.pos.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < r + 0.45 && d > 1e-4) {
        dx /= d; dz /= d;
        player.pos.x += dx * (r + 0.45 - d);
        player.pos.z += dz * (r + 0.45 - d);
        const sp = Math.hypot(c.v.x, c.v.z);
        if (sp > 4.5 && c.driver !== null) { hurtPlayer(sp * 2.2); }
      }
    }
  }
  player.speed = spd;
  player.phase += spd * dt * 1.7;

  // قتال
  player.cd -= dt;
  player.aimT = Math.max(0, player.aimT - dt);
  player.punchT = Math.max(0, player.punchT - dt);
  const w = WEAPONS[player.weapon];
  const wantFire = mouse.l && (w.auto || !player._held);
  if (mouse.l) player._held = true; else player._held = false;
  if (wantFire && player.cd <= 0 && G.running) playerFire(w);
  human.gun.visible = !w.melee;
  const meleePose = w.melee && player.punchT > 0;
  animHuman(human, player.phase, spd, 0);
  if (!w.melee && (aiming || player.aimT > 0)) { human.arms[0].rotation.x = -1.55 + (player.cd > w.rate - 0.06 ? 0.18 : 0); }
  if (meleePose) human.arms[0].rotation.x = -1.6 * Math.sin((player.punchT / 0.25) * Math.PI);
  human.group.position.copy(player.pos);
  human.group.rotation.set(0, player.heading, 0);
}

// أشعة
function rayPed(p, o, d, maxT) {
  const dx = d.x, dz = d.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-8) return Infinity;
  const fx = o.x - p.pos.x, fz = o.z - p.pos.z;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - 0.5 * 0.5;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > maxT) return Infinity;
  const y = o.y + d.y * t;
  if (y < p.pos.y || y > p.pos.y + 2.0) return Infinity;
  return t;
}
function rayCar(c, o, d, maxT) {
  // إلى الإحداثيات المحلية
  const s = Math.sin(-c.heading), co = Math.cos(-c.heading);
  const ox = o.x - c.pos.x, oz = o.z - c.pos.z;
  const lo = { x: ox * co + oz * s, y: o.y - c.pos.y, z: -ox * s + oz * co };
  const ld = { x: d.x * co + d.z * s, y: d.y, z: -d.x * s + d.z * co };
  const hx = c.wid / 2, hz = c.len / 2;
  let tmin = 0, tmax = maxT;
  for (const [oo, dd, lo2, hi] of [[lo.x, ld.x, -hx, hx], [lo.y, ld.y, 0, 1.9], [lo.z, ld.z, -hz, hz]]) {
    if (Math.abs(dd) < 1e-9) { if (oo < lo2 || oo > hi) return Infinity; } else {
      let t1 = (lo2 - oo) / dd, t2 = (hi - oo) / dd;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}
function castRay(o, d, maxT, ignoreCar) {
  let best = { t: rayWorld(o.x, o.y, o.z, d.x, d.y, d.z, maxT), kind: 'world' };
  if (best.t > maxT) best.t = Infinity;
  for (const p of peds) {
    if (p.dead) continue;
    const t = rayPed(p, o, d, Math.min(maxT, best.t));
    if (t < best.t) best = { t, kind: 'ped', obj: p };
  }
  for (const c of cars) {
    if (c === ignoreCar || c.exploded) continue;
    const t = rayCar(c, o, d, Math.min(maxT, best.t));
    if (t < best.t) best = { t, kind: 'car', obj: c };
  }
  return best;
}

function playerFire(w) {
  player.cd = w.rate;
  player.aimT = 0.8;
  if (w.melee) {
    player.punchT = 0.25;
    sound.punch();
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    for (const p of peds) {
      if (p.dead) continue;
      const dx = p.pos.x - player.pos.x, dz = p.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.1 && (dx * fx + dz * fz) / (d || 1) > 0.3) {
        damagePed(p, w.dmg, true, 'melee');
        p.kv.x = fx * 6; p.kv.z = fz * 6;
        if (p.type === 'civ') addHeat(4);
        break;
      }
    }
    return;
  }
  if (player.ammo[player.weapon] <= 0) {
    say('نفدت الذخيرة!', 1);
    player.cd = 0.4;
    return;
  }
  player.ammo[player.weapon]--;
  sound.gun(w.snd);
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  const camToP = camera.position.distanceTo(new THREE.Vector3(player.pos.x, camera.position.y, player.pos.z));
  const start = camera.position.clone().addScaledVector(fwd, Math.max(0, camToP - 0.2));
  const muzzle = new THREE.Vector3(player.pos.x, player.pos.y + 1.45, player.pos.z).add(new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading)).multiplyScalar(0.8));
  addFx(0xffe08a, muzzle, 0.22, 0.05, {});
  for (let k = 0; k < w.pellets; k++) {
    const d = fwd.clone().add(new THREE.Vector3(rnd(-w.spread, w.spread), rnd(-w.spread, w.spread), rnd(-w.spread, w.spread))).normalize();
    const res = castRay(start, d, 130, null);
    const end = start.clone().addScaledVector(d, Math.min(res.t, 130));
    addTracer(muzzle, end);
    if (res.kind === 'ped') {
      damagePed(res.obj, w.dmg, true, 'gun');
      addFx(0xcc1122, end, 0.18, 0.4, { vel: new THREE.Vector3(rnd(-1, 1), 1, rnd(-1, 1)), grav: 8 });
    } else if (res.kind === 'car') {
      res.obj.hp -= w.dmg * 0.9;
      addFx(0xffd060, end, 0.2, 0.2, {});
      if (res.obj.type === 'police') addHeat(20); else if (res.obj.driver && res.obj.driver !== 'player') addHeat(3);
      if (res.obj.driver && res.obj.driver !== 'player' && res.obj.type !== 'police') res.obj.cruise = 24;
    } else if (res.t < 130) {
      addFx(0xdddddd, end, 0.2, 0.25, { vel: new THREE.Vector3(0, 1.2, 0) });
    }
  }
  // يسمع الناس الطلقات
  for (const p of peds) {
    if (p.type === 'civ' && !p.dead && p.flee <= 0 && p.pos.distanceTo(player.pos) < 38) { p.flee = 6; p.fleeFrom = { x: player.pos.x, z: player.pos.z }; }
  }
  if (G.stars === 0) {
    for (const p of peds) if (p.type === 'cop' && p.pos.distanceTo(player.pos) < 60) addHeat(26);
    for (const c of cars) if (c.type === 'police' && c.pos.distanceTo(player.pos) < 60) addHeat(26);
  }
  G.shake = Math.max(G.shake, w.snd === 2 ? 0.2 : 0.06);
}

// =====================================================================
// الأحداث العامة: المناطق، الأغراض، المهمات
// =====================================================================
function makeBeam(color, r = 2.4) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, 70, 20, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, fog: false })
  );
  beam.position.y = 35;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(r * 0.75, r, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.4;
  g.add(beam, ring);
  scene.add(g);
  return g;
}

const spots = [];
function addSpot(kind, i, j, ox, oz, color, r) {
  const p = nodePos(i, j);
  const s = { kind, x: p.x + ox, z: p.z + oz, r, color, beam: makeBeam(color, r), cd: 0 };
  s.beam.position.set(s.x, 0, s.z);
  spots.push(s);
  return s;
}
const hospital = nodePos(2, 8);
addSpot('ammo', 6, 4, 0, 0, 0xff8a1e, 3.4);
addSpot('spray', 3, 3, 0, 0, 0x4dff9a, 5);
addSpot('mission', 5, 6, 3, 3, 0xffd23c, 2.8);
addSpot('mission', 8, 2, 0, 0, 0xffd23c, 2.8);
addSpot('mission', 1, 5, 0, 0, 0xffd23c, 2.8);
addSpot('mission', 9, 9, 0, 0, 0xffd23c, 2.8);
addSpot('mission', 4, 1, 0, 0, 0xffd23c, 2.8);
addSpot('hospital', 2, 8, 8, 8, 0xff3355, 2.4);

// أغراض
const pickupGeo = { health: new THREE.BoxGeometry(0.7, 0.7, 0.7), ammo: new THREE.BoxGeometry(0.8, 0.5, 0.5), cash: new THREE.BoxGeometry(0.9, 0.12, 0.5) };
const pickupMat = { health: basic(0xff2a5f), ammo: basic(0xffd23c), cash: basic(0x4dff7d) };
function dropPickup(kind, x, z, amount) {
  const m = new THREE.Mesh(pickupGeo[kind], pickupMat[kind]);
  m.position.set(x, groundY(x, z) + 0.9, z);
  scene.add(m);
  pickups.push({ kind, m, x, z, amount, respawn: kind !== 'cash' ? 1 : 0, life: kind === 'cash' ? 60 : 1e9, gy: groundY(x, z) });
}
function scatterPickups() {
  for (let k = 0; k < 24; k++) {
    const n = nodePos(rint(0, N), rint(0, N));
    const kind = k % 3 === 0 ? 'health' : k % 3 === 1 ? 'ammo' : 'cash';
    dropPickup(kind, n.x + rnd(-9, 9) + 11, n.z + rnd(-9, 9) + 11, kind === 'cash' ? rint(50, 200) : kind === 'ammo' ? 25 : 40);
  }
}
scatterPickups();
function updatePickups(dt) {
  const pp = player.inCar ? player.inCar.pos : player.pos;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.m.rotation.y += dt * 2;
    p.m.position.y = p.gy + 0.9 + Math.sin(G.time * 3 + p.x) * 0.15;
    p.life -= dt;
    if (p.life <= 0) { scene.remove(p.m); pickups.splice(i, 1); continue; }
    if (Math.abs(p.x - pp.x) < 2.2 && Math.abs(p.z - pp.z) < 2.2 && !player.dead) {
      if (p.kind === 'health') { if (player.hp >= 100) continue; player.hp = Math.min(100, player.hp + p.amount); say('+ صحة', 1); }
      if (p.kind === 'cash') { G.cash += p.amount; say('+$' + p.amount, 1); }
      if (p.kind === 'ammo') {
        let w = player.has[3] ? 3 : player.has[2] ? 2 : 1;
        player.ammo[w] = Math.min(999, player.ammo[w] + p.amount);
        say('+ ذخيرة', 1);
      }
      sound.pickup();
      if (p.kind !== 'cash') {
        // يعود لاحقاً
        const n = nodePos(rint(0, N), rint(0, N));
        const kind = p.kind;
        scene.remove(p.m);
        pickups.splice(i, 1);
        setTimeout(() => dropPickup(kind, n.x + rnd(-9, 9) + 11, n.z + rnd(-9, 9) + 11, kind === 'ammo' ? 25 : 40), 45000);
      } else { scene.remove(p.m); pickups.splice(i, 1); }
    }
  }
}

// ----- المهمات -----
let mission = null;
const objBeam = makeBeam(0xff3355, 3.2);
objBeam.visible = false;
const gangMembers = [];
function setObj(x, z) {
  objBeam.position.set(x, 0, z);
  objBeam.visible = true;
}
function startMission(giver) {
  const roll = Math.random();
  const gp = { x: giver.x, z: giver.z };
  const pickFar = (minD, maxD) => {
    for (let k = 0; k < 40; k++) {
      const n = nodePos(rint(0, N), rint(0, N));
      const d = Math.hypot(n.x - gp.x, n.z - gp.z);
      if (d > minD && d < maxD) return n;
    }
    return nodePos(rint(0, N), rint(0, N));
  };
  if (roll < 0.4) {
    const d = pickFar(260, 650);
    const dist = Math.hypot(d.x - gp.x, d.z - gp.z);
    mission = { type: 'courier', title: 'توصيل الطرد', dest: d, time: dist / 12 + 28, reward: Math.floor(dist * 0.9 + 250), start: gp };
    setObj(d.x, d.z);
    say('خذ الطرد واوصله قبل انتهاء الوقت — اسرق سيارة!', 4);
  } else if (roll < 0.7) {
    const c = pickFar(200, 600);
    mission = { type: 'gang', title: 'تصفية العصابة', dest: c, left: 5, reward: 900 };
    gangMembers.length = 0;
    for (let k = 0; k < 5; k++) {
      const gm = spawnPed('gang', c.x + rnd(-10, 10), c.z + rnd(-10, 10));
      gm.hp = 90;
      gangMembers.push(gm);
    }
    setObj(c.x, c.z);
    say('اقضِ على أفراد العصابة في الموقع المحدد', 4);
  } else {
    const pts = [];
    let cur = nearestNode(gp.x, gp.z);
    for (let k = 0; k < 6; k++) {
      let nx;
      for (let t = 0; t < 30; t++) {
        nx = { i: rint(0, N), j: rint(0, N) };
        const a = nodePos(cur.i, cur.j), b = nodePos(nx.i, nx.j);
        if (Math.hypot(a.x - b.x, a.z - b.z) > 180) break;
      }
      pts.push(nodePos(nx.i, nx.j));
      cur = nx;
    }
    const d0 = Math.hypot(pts[0].x - gp.x, pts[0].z - gp.z);
    mission = { type: 'race', title: 'سباق الشوارع', pts, idx: 0, time: d0 / 13 + 14, reward: 1500, dest: pts[0], needCar: true };
    setObj(pts[0].x, pts[0].z);
    say('سباق! مرّ بكل النقاط الحمراء بسيارتك بسرعة', 4);
  }
  mission.t0 = 0;
}
function failMission(silent) {
  if (!mission) return;
  for (const g of gangMembers) if (!g.dead) removePed(g);
  gangMembers.length = 0;
  mission = null;
  objBeam.visible = false;
  if (!silent) say('فشلت المهمة', 3);
}
function completeMission() {
  G.cash += mission.reward;
  banner('نجحت المهمة! +$' + mission.reward, 'win', 3);
  sound.pickup();
  mission = null;
  objBeam.visible = false;
  gangMembers.length = 0;
}
function updateMission(dt) {
  if (!mission) return;
  const pp = player.inCar ? player.inCar.pos : player.pos;
  if (mission.type === 'courier') {
    mission.time -= dt;
    if (mission.time <= 0) return failMission();
    if (Math.hypot(pp.x - mission.dest.x, pp.z - mission.dest.z) < 8) completeMission();
  } else if (mission.type === 'gang') {
    mission.left = gangMembers.filter((g) => !g.dead).length;
    if (mission.left === 0) completeMission();
  } else if (mission.type === 'race') {
    mission.time -= dt;
    if (mission.time <= 0) return failMission();
    if (!player.inCar) mission.time -= dt * 0.5;
    const d = mission.pts[mission.idx];
    if (Math.hypot(pp.x - d.x, pp.z - d.z) < 14 && player.inCar) {
      mission.idx++;
      sound.pickup();
      if (mission.idx >= mission.pts.length) return completeMission();
      const n = mission.pts[mission.idx];
      mission.dest = n;
      mission.time += Math.hypot(n.x - d.x, n.z - d.z) / 17 + 4;
      setObj(n.x, n.z);
    }
  }
}

function updateSpots(dt) {
  const pp = player.inCar ? player.inCar.pos : player.pos;
  for (const s of spots) {
    s.cd -= dt;
    s.beam.children[0].material.opacity = 0.2 + 0.08 * Math.sin(G.time * 3);
    const d = Math.hypot(pp.x - s.x, pp.z - s.z);
    if (d > s.r + 0.5 || s.cd > 0 || player.dead) continue;
    if (s.kind === 'mission' && !mission && G.stars === 0) {
      s.cd = 25;
      startMission(s);
    } else if (s.kind === 'ammo' && !player.inCar) {
      s.cd = 3;
      let cost = 0;
      for (let w = 1; w < 4; w++) cost += player.has[w] ? (player.ammo[w] < 100 ? AMMO_PRICE[w] / 2 : 0) : AMMO_PRICE[w];
      if (cost === 0) { say('مخزونك كامل', 1.5); continue; }
      if (G.cash < cost) { say('تحتاج $' + cost + ' للتسلح', 2); continue; }
      G.cash -= cost;
      player.has = [true, true, true, true];
      player.ammo[1] = Math.max(player.ammo[1], 120);
      player.ammo[2] = Math.max(player.ammo[2], 300);
      player.ammo[3] = Math.max(player.ammo[3], 40);
      sound.pickup();
      say('تسلحت بالكامل! (-$' + cost + ')  اضغط 1-4', 3);
    } else if (s.kind === 'spray' && player.inCar) {
      s.cd = 6;
      if (G.cash < 100) { say('تحتاج $100', 2); continue; }
      G.cash -= 100;
      player.inCar.hp = player.inCar.t.hp;
      player.inCar.bodyMat.color.setHex(pick(CAR_COLORS));
      G.heat = 0;
      G.unseen = 0;
      sound.pickup();
      say('تم الطلاء والإصلاح — اختفت النجوم! (-$100)', 3);
    } else if (s.kind === 'hospital' && !player.inCar && player.hp < 100) {
      s.cd = 8;
      if (G.cash >= 50) { G.cash -= 50; player.hp = 100; sound.pickup(); say('عولجت (-$50)', 2); }
    }
  }
}

// =====================================================================
// التعداد السكاني للمدينة
// =====================================================================
function spawnTraffic(police) {
  const pp = player.inCar ? player.inCar.pos : player.pos;
  for (let k = 0; k < 12; k++) {
    const a = { i: rint(0, N), j: rint(0, N) };
    const np = nodePos(a.i, a.j);
    const d = Math.hypot(np.x - pp.x, np.z - pp.z);
    if (d < (police ? 120 : 90) || d > (police ? 230 : 240)) continue;
    const b = pick(neighbors(a));
    const nav = { a, b };
    const lt = laneTarget(nav, NAV_LANE);
    const bp = nodePos(b.i, b.j);
    const t = rnd(0.2, 0.7);
    const x = lerp(np.x, bp.x, t) + (lt.x - bp.x);
    const z = lerp(np.z, bp.z, t) + (lt.z - bp.z);
    if (cars.some((c) => Math.hypot(c.pos.x - x, c.pos.z - z) < 9)) continue;
    const type = police ? 'police' : pick(['sedan', 'sedan', 'sedan', 'suv', 'suv', 'sports', 'sports', 'van', 'taxi', 'taxi']);
    const c = spawnCar(type, x, z, Math.atan2(lt.dx, lt.dz), police ? 'police' : 'ai');
    c.nav = nav;
    return c;
  }
  return null;
}
function spawnCrowd() {
  const pp = player.inCar ? player.inCar.pos : player.pos;
  for (let k = 0; k < 10; k++) {
    const a = { i: rint(0, N), j: rint(0, N) };
    const np = nodePos(a.i, a.j);
    const d = Math.hypot(np.x - pp.x, np.z - pp.z);
    if (d < 50 || d > 190) continue;
    const b = pick(neighbors(a));
    const side = Math.random() < 0.5 ? 1 : -1;
    const lt = laneTarget({ a, b }, side * 10.4);
    const bp = nodePos(b.i, b.j);
    const t = rnd(0.1, 0.9);
    const p = spawnPed('civ', lerp(np.x, bp.x, t) + (lt.x - bp.x), lerp(np.z, bp.z, t) + (lt.z - bp.z));
    p.nav = { a, b };
    p.side = side;
    return p;
  }
}
let popT = 0;
function managePopulation(dt) {
  popT -= dt;
  if (popT > 0) return;
  popT = 0.25;
  const pp = player.inCar ? player.inCar.pos : player.pos;
  // إزالة البعيد
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    if (c === player.inCar) continue;
    const d = Math.hypot(c.pos.x - pp.x, c.pos.z - pp.z);
    if (c.exploded) { c.deadT += 0.25; if (c.deadT > 40 && d > 60) removeCar(c); continue; }
    if (d > 320 || (c.driver === null && d > 140 && c.age > 5)) removeCar(c);
    c.age += 0.25;
  }
  for (let i = peds.length - 1; i >= 0; i--) {
    const p = peds[i];
    if (p.type === 'gang' && mission && mission.type === 'gang') continue;
    if (p.type === 'cop') continue;
    if (Math.hypot(p.pos.x - pp.x, p.pos.z - pp.z) > 230) removePed(p);
  }
  const civ = peds.filter((p) => p.type === 'civ' && !p.dead).length;
  if (civ < 60) spawnCrowd();
  if (civ < 40) spawnCrowd();
  const traffic = cars.filter((c) => c.driver && c.driver !== 'player' && c.type !== 'police' && !c.exploded).length;
  if (traffic < 34) spawnTraffic(false);
  const cops = cars.filter((c) => c.type === 'police' && c.driver && !c.exploded).length;
  const wantCops = G.stars > 0 ? Math.min(9, 2 + G.stars * 1.4) : 2;
  if (cops < wantCops) spawnTraffic(true);
}

// =====================================================================
// الكاميرا
// =====================================================================
const camPos = new THREE.Vector3();
function updateCamera(dt) {
  const inCar = player.inCar;
  cam.idle += dt;
  if (inCar && cam.idle > 1.3 && inCar.speed > 2) cam.yaw = lerpAngle(cam.yaw, inCar.heading + (inCar.speed < -3 ? Math.PI : 0), 1 - Math.exp(-2.4 * dt));
  const base = inCar ? inCar.pos : player.pos;
  const aiming = !inCar && (mouse.r || player.aimT > 0.3);
  const tgt = new THREE.Vector3(base.x, base.y + (inCar ? 1.7 : 1.55), base.z);
  const sp = inCar ? Math.hypot(inCar.v.x, inCar.v.z) : 0;
  const dist = inCar ? 8.6 + sp * 0.07 : aiming ? 2.7 : 5.0;
  const shoulder = inCar ? 0 : aiming ? 0.85 : 0.65;
  const cp = Math.cos(cam.pitch), sp2 = Math.sin(cam.pitch);
  const f = { x: Math.sin(cam.yaw), z: Math.cos(cam.yaw) };
  const r = { x: -Math.cos(cam.yaw), z: Math.sin(cam.yaw) };
  tgt.x += r.x * shoulder; tgt.z += r.z * shoulder;
  const dir = new THREE.Vector3(-f.x * cp, sp2, -f.z * cp).normalize();
  const t = rayWorld(tgt.x, tgt.y, tgt.z, dir.x, dir.y, dir.z, dist + 0.4);
  const use = Math.min(dist, Math.max(0.8, t - 0.45));
  camPos.copy(tgt).addScaledVector(dir, use);
  camera.position.copy(camPos);
  if (G.shake > 0) {
    camera.position.x += rnd(-1, 1) * G.shake * 0.5;
    camera.position.y += rnd(-1, 1) * G.shake * 0.5;
    G.shake = Math.max(0, G.shake - dt * 1.6);
  }
  const look = tgt.clone().addScaledVector(dir, -1).add(new THREE.Vector3(0, 0, 0));
  camera.lookAt(look.x + f.x * 6 * 0, look.y, look.z);
  camera.up.set(0, 1, 0);
  const wantFov = inCar ? 62 + clamp(sp / 45, 0, 1) * 16 : aiming ? 48 : 62;
  camera.fov = lerp(camera.fov, wantFov, 1 - Math.exp(-6 * dt));
  camera.updateProjectionMatrix();
}

// =====================================================================
// HUD + الخريطة الصغيرة
// =====================================================================
const MINI_R = 105 * 2; // نصف قطر بكسل الكانفاس (420/2)
function drawMinimap() {
  const W = mini.width, C = W / 2;
  const base = player.inCar ? player.inCar.pos : player.pos;
  const th = player.inCar ? player.inCar.heading : cam.yaw;
  const range = 170; // متر
  const ppm = C / range;
  const s0 = MAP_PX / (MAPR * 2);
  mg.save();
  mg.clearRect(0, 0, W, W);
  mg.beginPath();
  mg.arc(C, C, C, 0, Math.PI * 2);
  mg.clip();
  mg.fillStyle = '#123';
  mg.fillRect(0, 0, W, W);
  mg.translate(C, C);
  mg.rotate(th - Math.PI);
  mg.scale(ppm / s0, ppm / s0);
  mg.translate(-(base.x + MAPR) * s0, -(base.z + MAPR) * s0);
  mg.drawImage(miniStatic, 0, 0);
  mg.restore();
  const toMini = (x, z, clampEdge) => {
    const rx = x - base.x, rz = z - base.z;
    const a = th - Math.PI;
    let sx = rx * Math.cos(a) - rz * Math.sin(a);
    let sy = rx * Math.sin(a) + rz * Math.cos(a);
    sx *= ppm; sy *= ppm;
    const d = Math.hypot(sx, sy);
    if (d > C - 14) {
      if (!clampEdge) return null;
      sx *= (C - 14) / d; sy *= (C - 14) / d;
    }
    return [C + sx, C + sy];
  };
  const dot = (x, z, col, r, edge, sq) => {
    const p = toMini(x, z, edge);
    if (!p) return;
    mg.fillStyle = '#000';
    mg.beginPath();
    if (sq) mg.rect(p[0] - r - 2, p[1] - r - 2, (r + 2) * 2, (r + 2) * 2); else mg.arc(p[0], p[1], r + 2, 0, 6.3);
    mg.fill();
    mg.fillStyle = col;
    mg.beginPath();
    if (sq) mg.rect(p[0] - r, p[1] - r, r * 2, r * 2); else mg.arc(p[0], p[1], r, 0, 6.3);
    mg.fill();
  };
  for (const s of spots) dot(s.x, s.z, '#' + s.color.toString(16).padStart(6, '0'), 9, true, s.kind !== 'mission');
  for (const c of cars) if (c.type === 'police' && c.driver && !c.exploded) dot(c.pos.x, c.pos.z, Math.floor(G.time * 5) % 2 ? '#ff2244' : '#2a66ff', 6, false);
  for (const p of peds) if (p.type === 'cop' && !p.dead) dot(p.pos.x, p.pos.z, '#4a8aff', 4, false);
  if (mission) {
    if (mission.type === 'gang') for (const g of gangMembers) { if (!g.dead) dot(g.pos.x, g.pos.z, '#ff8a1e', 5, true); }
    dot(mission.dest.x, mission.dest.z, '#ff3355', 10, true);
  }
  // اللاعب
  mg.save();
  mg.translate(C, C);
  mg.fillStyle = '#fff';
  mg.strokeStyle = '#000';
  mg.lineWidth = 3;
  mg.beginPath();
  mg.moveTo(0, -13); mg.lineTo(10, 11); mg.lineTo(0, 6); mg.lineTo(-10, 11); mg.closePath();
  mg.stroke(); mg.fill();
  mg.restore();
}

const el = {
  cash: $('cash'), clock: $('clock'), hp: $('hp'), wanted: $('wanted'), weapon: $('weapon'),
  mission: $('mission'), prompt: $('prompt'), speed: $('speed'), spd: $('spd'), carhp: $('carhp'), carhpbar: $('carhpbar'),
  cross: $('cross'), dmg: $('dmg'), toast: $('toast'),
};
function updateHud(dt) {
  el.cash.textContent = '$' + Math.floor(G.cash).toLocaleString('en-US');
  const h = Math.floor(G.hour), m = Math.floor((G.hour - h) * 60);
  el.clock.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  el.hp.style.width = clamp(player.hp, 0, 100) + '%';
  let st = '';
  for (let i = 0; i < 5; i++) st += i < G.stars ? '<b>★</b>' : '★';
  el.wanted.innerHTML = st;
  el.wanted.className = G.stars > 0 && G.unseen > 0.5 ? 'flash' : '';
  const w = WEAPONS[player.weapon];
  el.weapon.textContent = w.melee ? w.name : w.name + '  ' + player.ammo[player.weapon];
  const c = player.inCar;
  el.speed.style.display = c ? 'block' : 'none';
  el.carhp.style.display = c ? 'block' : 'none';
  if (c) {
    el.spd.textContent = Math.round(Math.hypot(c.v.x, c.v.z) * 3.6);
    el.carhpbar.style.width = clamp((c.hp / c.t.hp) * 100, 0, 100) + '%';
  }
  el.cross.classList.toggle('on', !c && !player.dead && (WEAPONS[player.weapon].melee ? false : true));
  el.dmg.style.opacity = player.hitFlash > 0 ? 0.6 * player.hitFlash : (player.hp < 30 ? 0.25 + 0.15 * Math.sin(G.time * 6) : 0);
  player.hitFlash = Math.max(0, player.hitFlash - dt * 2);
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.classList.remove('on'); }
  if (G.bannerT > 0) { G.bannerT -= dt; if (G.bannerT <= 0) $('big').style.display = 'none'; }

  // المهمة
  const mt = el.mission.querySelector('.t'), md = el.mission.querySelector('.d');
  if (mission) {
    mt.textContent = mission.title;
    const pp = c ? c.pos : player.pos;
    const dd = Math.round(Math.hypot(mission.dest.x - pp.x, mission.dest.z - pp.z));
    if (mission.type === 'gang') md.textContent = 'العصابة المتبقية: ' + mission.left + ' — المسافة ' + dd + 'م';
    else if (mission.type === 'race') md.textContent = 'النقطة ' + (mission.idx + 1) + '/' + mission.pts.length + ' — الوقت ' + Math.max(0, Math.ceil(mission.time)) + 'ث';
    else md.textContent = 'الوقت ' + Math.max(0, Math.ceil(mission.time)) + 'ث — المسافة ' + dd + 'م — الجائزة $' + mission.reward;
  } else { mt.textContent = ''; md.textContent = ''; }

  // تلميحات
  let pr = '';
  if (!player.dead) {
    if (c) pr = '';
    else {
      for (const cc of cars) if (!cc.exploded && Math.hypot(cc.pos.x - player.pos.x, cc.pos.z - player.pos.z) < 4.2) { pr = 'اضغط F لركوب السيارة'; break; }
    }
  }
  el.prompt.textContent = pr;
  el.prompt.style.display = pr ? 'block' : 'none';
}

// =====================================================================
// الحلقة الرئيسية
// =====================================================================
function lastStep(dt) {
  // صوت
  const c = player.inCar;
  if (c) sound.engine(true, Math.hypot(c.v.x, c.v.z) / c.t.max);
  else sound.engine(false, 0);
  let siren = 0;
  const pp = c ? c.pos : player.pos;
  for (const k of cars) if (k.type === 'police' && k.driver && !k.exploded && G.stars > 0) siren = Math.max(siren, 1 - k.pos.distanceTo(pp) / 160);
  sound.siren(Math.max(0, siren));
}

function update(dt) {
  G.time += dt;
  G.hour = (G.hour + dt / 2.2 / 60) % 24; // يوم كامل = 52 دقيقة تقريباً
  if (player.dead) {
    G.deadT += dt;
    if (G.deadT > 4) respawn();
  }
  updatePlayer(dt);
  // السيارات
  for (const c of cars) {
    if (c === player.inCar) {
      // لا شيء إضافي
    } else if (c.exploded) {
      c.v.x *= Math.exp(-2 * dt); c.v.z *= Math.exp(-2 * dt);
      c.pos.x += c.v.x * dt; c.pos.z += c.v.z * dt;
    } else if (c.driver) {
      aiCar(c, dt);
    } else {
      // مهجورة
      c.v.x *= Math.exp(-1.2 * dt); c.v.z *= Math.exp(-1.2 * dt);
      c.pos.x += c.v.x * dt; c.pos.z += c.v.z * dt;
    }
    if (!c.exploded && c.driver === 'police' && G.stars === 0) { /* دوريات */ }
    carWorldCollide(c, dt);
  }
  carCarCollide();
  // دهس المشاة والتأثيرات على السيارات
  for (const c of cars) {
    const sp = Math.hypot(c.v.x, c.v.z);
    c.pos.y = lerp(c.pos.y, groundY(c.pos.x, c.pos.z), 1 - Math.exp(-14 * dt));
    if (!c.exploded && sp > 4) {
      for (const p of peds) {
        if (p.dead) continue;
        if (Math.abs(p.pos.x - c.pos.x) > 5 || Math.abs(p.pos.z - c.pos.z) > 5) continue;
        for (const [cx, cz, r] of carCircles(c)) {
          if (Math.hypot(p.pos.x - cx, p.pos.z - cz) < r + 0.5) {
            damagePed(p, sp * 9, c.driver === 'player', 'car');
            p.kv.x = c.v.x * 0.6; p.kv.z = c.v.z * 0.6;
            if (p.dead) { sound.crash(0.3); p.mesh.rotation.set(-Math.PI / 2, Math.atan2(c.v.x, c.v.z), 0); }
            break;
          }
        }
      }
    }
    if (!c.exploded) {
      if (c.hp < 35) {
        c.smokeT -= dt;
        if (c.smokeT <= 0) {
          c.smokeT = c.hp < 15 ? 0.06 : 0.14;
          const o = c.pos.clone(); o.y += 1.4;
          addFx(c.hp < 15 ? 0xff7a1c : 0x555555, o, rnd(0.3, 0.6), 0.9, { vel: new THREE.Vector3(rnd(-0.5, 0.5), rnd(1.5, 3), rnd(-0.5, 0.5)), grow: 1.4, op: 0.7 });
        }
      }
      if (c.hp <= 0) blowCar(c);
    }
    c.mesh.position.copy(c.pos);
    c.mesh.rotation.y = c.heading;
    // ميلان خفيف
    c.mesh.rotation.z = clamp(-(c.lat || 0) * 0.012, -0.08, 0.08);
  }
  for (const p of peds.slice()) pedStep(p, dt);
  updateWanted(dt);
  updatePickups(dt);
  updateSpots(dt);
  updateMission(dt);
  managePopulation(dt);
  updateFx(dt);
  if (flashT > 0) { flashT -= dt; flashLight.intensity = Math.max(0, flashT / 0.35) * 400; } else flashLight.intensity = 0;
  lastStep(dt);
  updateCamera(dt);
  applyTime(G.hour, player.inCar ? player.inCar.pos : player.pos);
  if (human.group.visible && !player.dead) { /* المجسم */ }
  world.water.position.y = -0.7 + Math.sin(G.time * 0.8) * 0.08;
  pressed = new Set();
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.started && G.running) {
    update(dt);
    updateHud(dt);
    drawMinimap();
  } else if (!G.started) {
    // مشهد القائمة: كاميرا تدور
    G.time += dt;
    G.hour = 18.3;
    const a = G.time * 0.08;
    camera.position.set(Math.cos(a) * 160, 70, Math.sin(a) * 160);
    camera.lookAt(0, 30, 0);
    applyTime(G.hour, { x: 0, z: 0 });
  }
  renderer.render(scene, camera);
}

// البداية
function initWorld() {
  const sp = nodePos(5, 5);
  player.pos.set(sp.x + 11, 0.3, sp.z + 11);
  player.heading = Math.PI;
  cam.yaw = Math.PI;
  // سيارة للاعب بالقرب
  const c = spawnCar('sports', sp.x + 6, sp.z + 4, Math.PI / 2, null, 0xff3ca8);
  c.age = -999;
  for (let i = 0; i < 30; i++) { spawnCrowd(); }
  for (let i = 0; i < 26; i++) spawnTraffic(false);
  for (let i = 0; i < 2; i++) spawnTraffic(true);
  applyTime(G.hour, player.pos);
}
initWorld();
requestAnimationFrame(frame);

// واجهة للاختبار والتصحيح
window.__game = { G, player, cars, peds, scene, camera, mouse, keys, startMission, spots, addHeat, get mission() { return mission; } };
