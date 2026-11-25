// معالجة الصورة: GTAO + Bloom + تدرج لوني سينمائي + حبيبات + ضبابية حركة شعاعية
import * as THREE from '../lib/three.module.js';
import { EffectComposer } from '../lib/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../lib/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from '../lib/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from '../lib/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../lib/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from '../lib/jsm/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uSpeed: { value: 0 }, uNight: { value: 0 },
    uHit: { value: 0 }, uRain: { value: 0 }, uAspect: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `
    varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uTime, uSpeed, uNight, uHit, uRain, uAspect;
    float rnd(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+uTime)*43758.5453); }
    void main(){
      vec2 c=vUv-0.5;
      float r2=dot(c*vec2(uAspect,1.0),c*vec2(uAspect,1.0));
      // انحراف لوني خفيف عند الأطراف
      vec2 off=c*(0.0016+r2*0.006+uSpeed*0.004);
      vec3 col;
      // ضبابية حركة شعاعية عند السرعة
      if(uSpeed>0.02){
        vec3 s=vec3(0.0); float tot=0.0;
        for(int i=0;i<8;i++){ float t=float(i)/7.0; float w=1.0-t*0.5; vec2 d=c*t*uSpeed*0.075*smoothstep(0.05,0.5,length(c));
          s+=vec3(texture2D(tDiffuse,vUv-d+off).r,texture2D(tDiffuse,vUv-d).g,texture2D(tDiffuse,vUv-d-off).b)*w; tot+=w; }
        col=s/tot;
      } else {
        col=vec3(texture2D(tDiffuse,vUv+off).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-off).b);
      }
      // تدرج لوني: ظلال مزرقة/خضراء، إضاءات دافئة، تباين وتشبع
      float l=dot(col,vec3(0.2126,0.7152,0.0722));
      vec3 shadowTint=vec3(0.90,1.0,1.08), highTint=vec3(1.07,1.0,0.92);
      col*=mix(shadowTint,highTint,smoothstep(0.1,0.75,l));
      col=mix(vec3(l),col,1.18+uNight*0.1);
      col=(col-0.5)*1.07+0.5;
      // مطر: بهتان
      col=mix(col,vec3(l)*vec3(0.95,1.0,1.05),uRain*0.25);
      // فينيت
      col*=1.0-smoothstep(0.18,0.62,r2)*0.5;
      // إصابة
      col=mix(col,col*vec3(1.4,0.4,0.4),uHit*smoothstep(0.05,0.4,r2));
      // حبيبات فيلم
      col+= (rnd(vUv*vec2(1920.0,1080.0))-0.5)*0.028;
      gl_FragColor=vec4(max(col,0.0),1.0);
    }`,
};

export function createPost(renderer, scene, camera, overlay) {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  const renderPass = new RenderPass(scene, camera);
  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.2, thickness: 1.2, scale: 1.1, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
  // إخفاء الطبقات الشفافة/السماء أثناء حساب AO
  const origGtaoRender = gtao.render.bind(gtao);
  gtao.render = (...args) => {
    const vis = overlay.visible;
    overlay.visible = false;
    origGtaoRender(...args);
    overlay.visible = vis;
  };
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.55, 2.2);
  const output = new OutputPass();
  const grade = new ShaderPass(GradeShader);
  composer.addPass(renderPass);
  composer.addPass(gtao);
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(grade);
  const P = { composer, gtao, bloom, grade, level: 3 };
  P.setLevel = (lv) => {
    P.level = lv;
    gtao.enabled = lv >= 3;
    bloom.enabled = lv >= 1;
    bloom.strength = lv >= 2 ? 0.32 : 0.25;
  };
  P.resize = (w, h) => {
    const p = renderer.getPixelRatio();
    composer.setPixelRatio(p);
    composer.setSize(w, h);
    grade.uniforms.uAspect.value = w / h;
  };
  P.resize(size.x, size.y);
  return P;
}
