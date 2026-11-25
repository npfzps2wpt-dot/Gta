// خامات إجرائية عالية الدقة (تُولَّد في المتصفح)
import * as THREE from '../lib/three.module.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function cv(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function tex(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
function noiseFill(g, w, h, amt, size = 1) {
  for (let i = 0; i < (w * h) / (size * size) / 2; i++) {
    const v = Math.random();
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * amt})` : `rgba(0,0,0,${(0.5 - v) * amt})`;
    g.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

export function asphaltTex() {
  const S = 512, c = cv(S), g = c.getContext('2d');
  g.fillStyle = '#34363e';
  g.fillRect(0, 0, S, S);
  noiseFill(g, S, S, 0.22, 1);
  noiseFill(g, S, S, 0.18, 2);
  // رقع إسفلت وشقوق
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd(0.08, 0.18)})`;
    g.fillRect(rnd(0, S), rnd(0, S), rnd(40, 120), rnd(30, 90));
  }
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  for (let i = 0; i < 7; i++) {
    g.lineWidth = rnd(0.6, 1.4);
    g.beginPath();
    let x = rnd(0, S), y = rnd(0, S);
    g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += rnd(-30, 30); y += rnd(-30, 30); g.lineTo(x, y); }
    g.stroke();
  }
  return tex(c);
}

export function concreteTex() {
  const S = 512, c = cv(S), g = c.getContext('2d');
  g.fillStyle = '#c9c5bc';
  g.fillRect(0, 0, S, S);
  noiseFill(g, S, S, 0.2, 1);
  noiseFill(g, S, S, 0.12, 3);
  g.fillStyle = 'rgba(70,60,50,0.07)';
  for (let i = 0; i < 12; i++) g.fillRect(rnd(0, S), rnd(0, S), rnd(20, 90), rnd(20, 90));
  g.strokeStyle = 'rgba(40,36,32,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, S); g.stroke();
    g.beginPath(); g.moveTo(0, i * 128); g.lineTo(S, i * 128); g.stroke();
  }
  return tex(c);
}

export function grassTex() {
  const S = 512, c = cv(S), g = c.getContext('2d');
  g.fillStyle = '#3f8a3c';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const l = rnd(30, 62);
    g.fillStyle = `hsla(${rnd(90, 125)},${rnd(45, 65)}%,${l}%,0.6)`;
    g.fillRect(Math.random() * S, Math.random() * S, 1.5, rnd(2, 5));
  }
  for (let i = 0; i < 60; i++) {
    g.fillStyle = pick(['#fff3a0', '#ffffff', '#ff9ac8']);
    g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  return tex(c);
}

export function barkTex() {
  const c = cv(64, 256), g = c.getContext('2d');
  g.fillStyle = '#7b5a3a';
  g.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 7) {
    g.fillStyle = `rgba(30,18,8,${rnd(0.25, 0.5)})`;
    g.fillRect(0, y, 64, 2);
  }
  noiseFill(g, 64, 256, 0.3, 1);
  return tex(c);
}

export function frondTex() {
  const W = 128, H = 512, c = cv(W, H), g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.strokeStyle = '#2d6e2b';
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
  for (let y = 6; y < H - 10; y += 5) {
    const len = (W / 2 - 2) * (1 - (y / H) * 0.55) * rnd(0.85, 1);
    for (const s of [-1, 1]) {
      g.strokeStyle = `hsl(${rnd(100, 125)},${rnd(50, 62)}%,${rnd(26, 38)}%)`;
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(W / 2, y);
      g.quadraticCurveTo(W / 2 + s * len * 0.5, y + 8, W / 2 + s * len, y + 26 + rnd(0, 8));
      g.stroke();
    }
  }
  return tex(c, { repeat: false });
}

// وحدة واجهات مباني: 4 نوافذ × 4 طوابق
export function facadeSet(style, wall) {
  const S = 512, cell = S / 4;
  const map = cv(S), orm = cv(S), emi = cv(S), bump = cv(S);
  const g = map.getContext('2d'), o = orm.getContext('2d'), e = emi.getContext('2d'), b = bump.getContext('2d');
  const glass = style === 'glass';
  g.fillStyle = glass ? '#16283a' : wall;
  g.fillRect(0, 0, S, S);
  if (!glass) {
    noiseFill(g, S, S, 0.16, 1);
    noiseFill(g, S, S, 0.1, 4);
    if (style === 'brick') {
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.lineWidth = 1;
      for (let y = 0; y < S; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); for (let x = (y / 8) % 2 ? 0 : 8; x < S; x += 16) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); } }
    }
  }
  o.fillStyle = glass ? 'rgb(255,18,230)' : 'rgb(255,215,0)';
  o.fillRect(0, 0, S, S);
  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);
  b.fillStyle = 'rgb(130,130,130)';
  b.fillRect(0, 0, S, S);

  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x0 = i * cell, y0 = j * cell;
    const ix = glass ? 4 : 18, iy = glass ? 4 : 16, w = cell - ix * 2, h = cell - iy * 2 - (glass ? 0 : 10);
    const x = x0 + ix, y = y0 + iy;
    // الزجاج
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    if (glass) { gr.addColorStop(0, '#3d86b0'); gr.addColorStop(0.5, '#1c4466'); gr.addColorStop(1, '#0c2236'); }
    else { gr.addColorStop(0, '#31567a'); gr.addColorStop(1, '#0b1a30'); }
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
    // انعكاس شريطي
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.beginPath(); g.moveTo(x, y + h * 0.55); g.lineTo(x + w * 0.6, y); g.lineTo(x + w, y); g.lineTo(x, y + h); g.closePath(); g.fill();
    // إطار
    g.strokeStyle = glass ? '#9fb4c4' : '#e8e8e8';
    g.lineWidth = glass ? 3 : 4;
    g.strokeRect(x, y, w, h);
    if (!glass) {
      g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.stroke();
      // عتبة
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 4, y + h, w + 8, 6);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x - 4, y + h, w + 8, 2);
    }
    // خريطة الخشونة/المعدن للزجاج
    o.fillStyle = glass ? 'rgb(255,10,255)' : 'rgb(235,22,170)';
    o.fillRect(x, y, w, h);
    // ظل محيط النافذة
    if (!glass) { o.fillStyle = 'rgb(150,215,0)'; o.fillRect(x - 5, y - 5, w + 10, 5); }
    // نتوء
    b.fillStyle = 'rgb(40,40,40)'; b.fillRect(x, y, w, h);
    b.fillStyle = 'rgb(210,210,210)'; b.fillRect(x - 4, y + h, w + 8, 8);
    // الإضاءة
    const r = Math.random();
    if (r < 0.5) {
      const col = pick(['#ffd27a', '#ffe0a0', '#ffc15a', '#ffd9a0', '#ffe9b0', '#ffcf8a', '#bfe0ff', '#ffb070']);
      e.fillStyle = col;
      const part = Math.random() < 0.3 ? 0.5 : 1;
      e.fillRect(x, y + (1 - part) * h * Math.random(), w, h * part);
      // ستارة
      if (Math.random() < 0.4) { e.fillStyle = 'rgba(0,0,0,0.45)'; e.fillRect(x, y, w * rnd(0.2, 0.5), h); }
    }
  }
  // حواف الطوابق
  if (!glass) {
    for (let j = 0; j < 4; j++) {
      const y = j * cell + cell - 10;
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y, S, 4);
      b.fillStyle = 'rgb(200,200,200)'; b.fillRect(0, y - 2, S, 8);
    }
  }
  return {
    map: tex(map, { aniso: 8 }),
    orm: tex(orm, { srgb: false }),
    emissive: tex(emi),
    bump: tex(bump, { srgb: false }),
  };
}

const SHOP_WORDS = ['CAFE', 'PIZZA', 'BAR', 'HOTEL', 'MOTEL', 'CLUB', '24H', 'DINER', 'SUSHI', 'LIQUOR', 'مطعم', 'قهوة', 'فندق', 'مخبز', 'مول', 'BURGER', 'NAILS', 'TACOS'];
const NEONS = ['#ff3ca8', '#2ef3ff', '#ffb02e', '#a56bff', '#4dff9a', '#ff5252'];
export function storefrontTex() {
  const W = 512, H = 384, map = cv(W, H), emi = cv(W, H);
  const g = map.getContext('2d'), e = emi.getContext('2d');
  const wallCol = pick(['#2b2f3a', '#3a2b33', '#1f3a3a', '#40352a', '#2a2a2a']);
  g.fillStyle = wallCol; g.fillRect(0, 0, W, H);
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  // اللافتة
  const neon = pick(NEONS);
  g.fillStyle = '#111'; g.fillRect(20, 14, W - 40, 80);
  const word = pick(SHOP_WORDS);
  for (const ctx of [g, e]) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 62px "Segoe UI", Tahoma, Arial, sans-serif';
    ctx.fillStyle = neon;
    ctx.shadowColor = neon; ctx.shadowBlur = ctx === e ? 16 : 6;
    ctx.fillText(word, W / 2, 56);
    ctx.shadowBlur = 0;
  }
  // المظلة
  const aw = pick([['#c8283c', '#f4f4f4'], ['#1c6e9a', '#f4f4f4'], ['#e0a020', '#2a2a2a'], ['#2a8a4a', '#f4f4f4']]);
  for (let x = 0; x < W; x += 32) { g.fillStyle = aw[(x / 32) % 2]; g.fillRect(x, 100, 32, 34); }
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 134, W, 8);
  // الواجهة الزجاجية + الباب
  const warm = pick(['#ffd8a0', '#fff0c8', '#ffc0e0', '#c8f0ff']);
  g.fillStyle = '#0d1824'; g.fillRect(24, 150, W - 48, H - 160);
  e.fillStyle = warm; e.fillRect(30, 156, 270, H - 172); e.fillRect(330, 156, 150, H - 172);
  g.fillStyle = '#0d1824'; g.fillRect(30, 156, 270, H - 172);
  // أثاث وظلال
  for (let i = 0; i < 5; i++) { e.fillStyle = 'rgba(0,0,0,0.5)'; e.fillRect(40 + i * 52, rnd(260, 300), 20, rnd(40, 80)); }
  g.strokeStyle = '#ccd'; g.lineWidth = 5;
  g.strokeRect(30, 156, 270, H - 172); g.strokeRect(330, 156, 150, H - 172);
  g.beginPath(); g.moveTo(315, 150); g.lineTo(315, H); g.stroke();
  return { map: tex(map), emissive: tex(emi) };
}

export function billboardTex() {
  const W = 512, H = 256, c = cv(W, H), g = c.getContext('2d');
  const a = pick(NEONS), b = pick(NEONS);
  g.fillStyle = '#05030a'; g.fillRect(0, 0, W, H);
  const words = pick([['NEON', 'CITY'], ['VICE', 'NIGHTS'], ['HOTEL', 'PARADISE'], ['نيون', 'سيتي'], ['LIVE', 'TONIGHT'], ['SUN', 'BEACH'], ['CASINO', '777'], ['FAST', 'CARS']]);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 100px "Segoe UI", Tahoma, Arial';
  g.shadowBlur = 30; g.shadowColor = a; g.fillStyle = a; g.fillText(words[0], W / 2, 80);
  g.shadowColor = b; g.fillStyle = b; g.fillText(words[1], W / 2, 185);
  g.shadowBlur = 0; g.strokeStyle = a; g.lineWidth = 8; g.strokeRect(10, 10, W - 20, H - 20);
  return tex(c, { repeat: false });
}

export function glowTex(inner = 'rgba(255,255,255,1)', soft = true) {
  const S = 128, c = cv(S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, inner);
  gr.addColorStop(soft ? 0.25 : 0.5, inner.replace(/[\d.]+\)$/, '0.55)'));
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return tex(c, { repeat: false, aniso: 1 });
}

export function waterNormalTex() {
  const S = 256, c = cv(S), g = c.getContext('2d');
  const waves = [];
  for (let i = 0; i < 14; i++) waves.push([Math.floor(rnd(1, 9)), Math.floor(rnd(1, 9)) * (Math.random() < 0.5 ? -1 : 1), rnd(0, 6.28), rnd(0.3, 1) / (1 + i * 0.4)]);
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let h = 0;
    for (const [kx, ky, ph, a] of waves) h += a * Math.sin(((kx * x + ky * y) / S) * 6.2832 + ph);
    H[y * S + x] = h;
  }
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const hx = H[y * S + ((x + 1) % S)] - H[y * S + ((x + S - 1) % S)];
    const hy = H[((y + 1) % S) * S + x] - H[((y + S - 1) % S) * S + x];
    let nx = -hx * 1.6, ny = -hy * 1.6, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const i = (y * S + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255;
    img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
    img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}

export function flareTex(kind) {
  const S = 128, c = cv(S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  if (kind === 'main') { gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,230,180,0.6)'); gr.addColorStop(1, 'rgba(255,160,80,0)'); }
  else if (kind === 'ring') { gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,200,150,0.0)'); gr.addColorStop(0.9, 'rgba(255,180,120,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); }
  else { gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,200,150,0)'); }
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return tex(c, { repeat: false, aniso: 1 });
}
