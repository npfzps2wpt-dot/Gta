// سماء فيزيائية + سحب + نجوم + قمر + وهج الشمس + إضاءة + خريطة بيئة للانعكاسات
import * as THREE from '../lib/three.module.js';
import { Sky } from '../lib/jsm/objects/Sky.js';
import { Lensflare, LensflareElement } from '../lib/jsm/objects/Lensflare.js';
import { glowTex, flareTex } from './textures.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hex = (h) => new THREE.Color(h);

// [ساعة, لون الضباب, محيط, شمس, ليل, لون الشمس]
const KEYS = [
  [0, 0x0e1230, 0.35, 0.35, 1, 0x6f86ff],
  [5, 0x16163a, 0.38, 0.35, 1, 0x6f86ff],
  [6.2, 0xc98a8a, 0.55, 1.4, 0.5, 0xffa070],
  [8.5, 0xa9cdee, 0.85, 4.2, 0, 0xfff1dc],
  [16.5, 0xa9cdee, 0.85, 4.2, 0, 0xfff1dc],
  [18.2, 0xe38a78, 0.7, 2.8, 0.15, 0xff9a60],
  [19.3, 0x7a3a70, 0.5, 1.0, 0.7, 0xff7a70],
  [20.5, 0x1c1a48, 0.38, 0.4, 1, 0x7f90ff],
  [24, 0x0e1230, 0.35, 0.35, 1, 0x6f86ff],
];

export function createSky({ scene, renderer, camera, overlay }) {
  const S = {};
  // ----- السماء -----
  const sky = new Sky();
  sky.scale.setScalar(1500);
  sky.material.fog = false;
  overlay.add(sky);
  const U = sky.material.uniforms;
  U.turbidity.value = 4;
  U.rayleigh.value = 1.6;
  U.mieCoefficient.value = 0.005;
  U.mieDirectionalG.value = 0.82;

  // ----- نجوم -----
  const sg = new THREE.BufferGeometry();
  const a = new Float32Array(1400 * 3);
  const sizes = new Float32Array(1400);
  for (let i = 0; i < 1400; i++) {
    const u = Math.random(), t = Math.random() * 6.283, r = Math.sqrt(1 - u * u);
    a[i * 3] = Math.cos(t) * r * 1700; a[i * 3 + 1] = u * 1700 + 20; a[i * 3 + 2] = Math.sin(t) * r * 1700;
    sizes[i] = 0.6 + Math.random() * 1.6;
  }
  sg.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false }));
  stars.frustumCulled = false;
  overlay.add(stars);

  // ----- القمر -----
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(235,242,255,1)', false), fog: false, depthWrite: false, transparent: true, color: new THREE.Color(2, 2, 2.4) }));
  moon.scale.set(150, 150, 1);
  overlay.add(moon);

  // ----- سحب -----
  const cloudMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, fog: false,
    uniforms: {
      uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uLit: { value: new THREE.Color(1, 1, 1) },
      uDark: { value: new THREE.Color(0.5, 0.5, 0.6) }, uCover: { value: 0.5 }, uNight: { value: 0 },
    },
    vertexShader: 'varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z=gl_Position.w*0.9999; }',
    fragmentShader: `
      varying vec3 vD; uniform float uTime; uniform vec3 uSun; uniform vec3 uLit; uniform vec3 uDark; uniform float uCover; uniform float uNight;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*n(p); p=p*2.03+vec2(7.1,3.3); a*=0.5; } return s; }
      void main(){
        vec3 d=normalize(vD);
        if(d.y<0.02) discard;
        vec2 uv=d.xz/(d.y+0.12)*1.3 + vec2(uTime*0.012, uTime*0.004);
        float f=fbm(uv);
        float dens=smoothstep(1.0-uCover, 1.0-uCover+0.28, f);
        float edge=fbm(uv*1.9+3.0);
        float sunSide=pow(max(dot(d,normalize(uSun)),0.0),3.0);
        vec3 col=mix(uDark,uLit,clamp(0.45+ (f-edge)*1.4 + sunSide*0.9,0.0,1.0));
        col*= (1.0-uNight*0.85);
        float fade=smoothstep(0.02,0.22,d.y);
        gl_FragColor=vec4(col, dens*fade*0.92);
      }`,
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1600, 32, 16), cloudMat);
  clouds.renderOrder = -5;
  clouds.frustumCulled = false;
  overlay.add(clouds);

  // ----- الإضاءة -----
  const hemi = new THREE.HemisphereLight(0xbcd2ff, 0x4a3f55, 0.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 4);
  sun.castShadow = true;
  const SC = 80;
  Object.assign(sun.shadow.camera, { left: -SC, right: SC, top: SC, bottom: -SC, near: 1, far: 600 });
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.35;
  scene.add(sun, sun.target);
  S.sun = sun;
  S.hemi = hemi;

  // ----- وهج العدسة -----
  const flare = new Lensflare();
  flare.addElement(new LensflareElement(flareTex('main'), 230, 0, new THREE.Color(1, 0.85, 0.6)));
  flare.addElement(new LensflareElement(flareTex('soft'), 90, 0.35, new THREE.Color(0.5, 0.7, 1)));
  flare.addElement(new LensflareElement(flareTex('ring'), 120, 0.6, new THREE.Color(1, 0.6, 0.4)));
  flare.addElement(new LensflareElement(flareTex('soft'), 80, 0.8, new THREE.Color(0.7, 1, 0.8)));
  flare.addElement(new LensflareElement(flareTex('ring'), 180, 1.0, new THREE.Color(0.8, 0.6, 1)));
  scene.add(flare);
  S.flare = flare;

  // ----- خريطة البيئة للانعكاسات -----
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(100);
  envScene.add(envSky);
  const cloudEnv = new THREE.Mesh(new THREE.SphereGeometry(80, 16, 8), cloudMat);
  envScene.add(cloudEnv);
  let envRT = null;
  let envClock = 99;
  S.updateEnv = () => {
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) envSky.material.uniforms[k].value = U[k].value;
    envSky.material.uniforms.sunPosition.value.copy(U.sunPosition.value);
    const rt = pmrem.fromScene(envScene, 0.02);
    if (envRT) envRT.dispose();
    envRT = rt;
    scene.environment = rt.texture;
  };

  const cFog = new THREE.Color();
  const tmp = new THREE.Color();
  S.fogColor = cFog;
  S.nightF = 0;

  // rain: 0..1
  S.update = (hour, focus, dt, rain = 0, clockTime = 0) => {
    let k = 0;
    while (k < KEYS.length - 2 && hour >= KEYS[k + 1][0]) k++;
    const A = KEYS[k], B = KEYS[k + 1];
    const f = (hour - A[0]) / (B[0] - A[0]);
    cFog.copy(hex(A[1])).lerp(tmp.copy(hex(B[1])), f);
    const amb = lerp(A[2], B[2], f);
    let sunI = lerp(A[3], B[3], f);
    const night = lerp(A[4], B[4], f);
    S.nightF = night;
    const sunCol = hex(A[5]).lerp(tmp.copy(hex(B[5])), f);

    const ang = ((hour - 5.7) / 12.9) * Math.PI;
    const sd = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    U.sunPosition.value.copy(sd);
    U.turbidity.value = lerp(3.5, 16, rain);
    U.rayleigh.value = lerp(1.5, 0.7, rain);
    sky.position.copy(camera.position);
    clouds.position.copy(camera.position);
    stars.position.copy(camera.position);

    // لون الضباب يتأثر بالمطر
    cFog.lerp(tmp.setRGB(0.42, 0.45, 0.5).multiplyScalar(1 - night * 0.8), rain * 0.7);
    scene.fog.color.copy(cFog);
    scene.fog.density = lerp(0.00085, 0.0032, rain);

    const dayLit = sd.y > -0.04;
    const L = dayLit ? sd : sd.clone().multiplyScalar(-1);
    if (!dayLit) { sunI = 0.45; }
    sun.position.set(focus.x + L.x * 250, Math.max(50, L.y * 250), focus.z + L.z * 250);
    sun.target.position.set(focus.x, 0, focus.z);
    sun.intensity = sunI * (1 - rain * 0.75) * (dayLit ? clamp(sd.y * 12 + 0.45, 0.15, 1) : 1);
    sun.color.copy(dayLit ? sunCol : tmp.set(0x7f90ff));
    hemi.intensity = amb * 0.55 * (1 - rain * 0.3);
    hemi.color.copy(cFog).lerp(tmp.set(0xffffff), 0.4);

    // قمر
    const md = sd.clone().multiplyScalar(-1);
    moon.position.copy(camera.position).addScaledVector(md, 1500);
    moon.visible = md.y > 0.05 && night > 0.6 && rain < 0.6;
    stars.material.opacity = clamp((night - 0.55) * 2.2, 0, 1) * (1 - rain);

    // سحب
    const cm = cloudMat.uniforms;
    cm.uTime.value = clockTime;
    cm.uSun.value.copy(sd);
    cm.uCover.value = lerp(0.38, 0.9, rain);
    cm.uNight.value = night;
    cm.uLit.value.copy(sunCol).lerp(tmp.set(0xffffff), 0.5).multiplyScalar(lerp(1.5, 0.9, rain));
    cm.uDark.value.copy(cFog).multiplyScalar(0.8).lerp(tmp.set(0x606878), rain * 0.8);

    // وهج الشمس
    flare.position.copy(camera.position).addScaledVector(sd, 1400);
    flare.visible = S.flareOn !== false && dayLit && sd.y > 0.0 && rain < 0.5;

    envClock += dt;
    if (envClock > 25) { envClock = 0; S.updateEnv(); }
  };
  S.sunDir = (out, hour) => out;
  return S;
}
