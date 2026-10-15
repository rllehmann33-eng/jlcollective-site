// One WebGL context for the whole site. A fixed canvas sits behind the page; each 3D exhibit
// is a "view": a DOM element whose box becomes a scissored viewport. Today there is one view,
// the hero: the firm's seal machined in two metals over a navy enamel face, set on the page's
// brass ruling, both lit by the same lamp. Nothing renders when nothing moves.
// Progressive enhancement: no modules, no WebGL2, a lost context or a rejected shader all
// leave the engraved SVG seal in place and log nothing.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const root = document.documentElement;
const canvas = document.getElementById('sceneGL');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = matchMedia('(hover: hover)').matches && !reduced;
const coarse = matchMedia('(pointer: coarse)').matches;

/* ---------- the J2 seal, from the kit's paths (viewBox 240 → unit space, y up) ---------- */
const J_PATH = 'M76.84 83.65 H107.75 V84.99 H97.09 V140.66 C97.09 156.66 92.09 158.66 82.09 158.66 C72.49 158.66 65.49 155.06 65.49 150.30 H67.49 C67.49 155.30 80.09 153.66 82.09 153.66 C88.09 153.66 87.49 152.26 87.49 140.66 V84.99 H76.84 Z';
const L_PATH = 'M116.00 150.66H126.66V84.99H116.00V83.65H146.91V84.99H136.26V150.66H153.34Q161.79 150.66 166.59 145.38Q171.39 140.10 173.60 130.98H174.66V152.00H116.00Z';
const RING_R = 90 / 120, RING_W = 6 / 120, TICK_W = 3 / 120, TICK_R0 = 84 / 120, TICK_R1 = 96 / 120;
const TICK_ANGLES = [Math.PI / 2, -Math.PI / 6, Math.PI + Math.PI / 6];

function letterShapes() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><path d="${J_PATH}"/><path d="${L_PATH}"/></svg>`;
  const data = new SVGLoader().parse(svg);
  const toUnit = new THREE.Matrix3().set(1 / 120, 0, -1, 0, -1 / 120, 1, 0, 0, 1);
  const out = data.paths.map(p => p.toShapes(true).map(shape => {
    const tx = pts => pts.forEach(v => v.applyMatrix3(toUnit));
    const pts = shape.getPoints(24); tx(pts);
    const ns = new THREE.Shape(pts);
    shape.holes.forEach(h => { const hp = h.getPoints(24); tx(hp); ns.holes.push(new THREE.Path(hp)); });
    return ns;
  }));
  return { j: out[0], l: out[1] };
}
function ringShape(inner = RING_R - RING_W / 2, outer = RING_R + RING_W / 2) {
  const s = new THREE.Shape(); s.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const h = new THREE.Path(); h.absarc(0, 0, inner, 0, Math.PI * 2, true);
  s.holes.push(h); return s;
}
function tickShapes(w = TICK_W, r0 = TICK_R0, r1 = TICK_R1) {
  return TICK_ANGLES.map(a => {
    const s = new THREE.Shape(); const len = r1 - r0, hw = w / 2;
    s.moveTo(-hw, 0); s.lineTo(-hw, len); s.absarc(0, len, hw, Math.PI, 0, true); s.lineTo(hw, 0); s.absarc(0, 0, hw, 0, Math.PI, true);
    const pts = s.getPoints(8).map(p => {
      const c = Math.cos(a - Math.PI / 2), sn = Math.sin(a - Math.PI / 2);
      return new THREE.Vector2(p.x * c - (p.y + r0) * sn, p.x * sn + (p.y + r0) * c);
    });
    return new THREE.Shape(pts);
  });
}
/** The seal as solid geometry: ring, letters, ticks, and the enamel face they sit on. */
function buildSeal({ matBrass, matCream, matEnamel }) {
  const g = new THREE.Group();
  const ex = (shape, d, b, segs = 4) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: 0, bevelSegments: segs, curveSegments: 96 });
    geo.computeVertexNormals(); return geo;
  };
  const ring = new THREE.Mesh(ex(ringShape(), 0.09, 0.02), matCream); ring.name = 'ring'; g.add(ring);
  const { j, l } = letterShapes();
  const jm = new THREE.Mesh(ex(j[0], 0.085, 0.008, 3), matBrass); jm.name = 'j'; g.add(jm);
  const lm = new THREE.Mesh(ex(l[0], 0.085, 0.008, 3), matCream); lm.name = 'l'; g.add(lm);
  tickShapes().forEach((s, i) => { const t = new THREE.Mesh(ex(s, 0.07, 0.009, 3), matBrass); t.name = 'tick' + i; g.add(t); });
  /* the enamel face: a shallow navy disc inside the ring, engine-turned under its clearcoat */
  const face = new THREE.Mesh(new THREE.CylinderGeometry(RING_R - RING_W / 2 + 0.004, RING_R - RING_W / 2 + 0.004, 0.03, 128), matEnamel);
  face.rotation.x = Math.PI / 2; face.position.z = -0.015 + 0.004; face.name = 'face'; g.add(face);
  /* the back plate: a darker metal disc the ring is set into */
  const back = new THREE.Mesh(new THREE.CylinderGeometry(RING_R + RING_W / 2 + 0.02, RING_R + RING_W / 2 + 0.02, 0.035, 128), matBrass.clone());
  back.material.color.set(0x2A2416); back.material.roughness = 0.55; back.rotation.x = Math.PI / 2; back.position.z = -0.0325; back.name = 'back'; g.add(back);
  [jm, lm, ring, ...g.children.filter(m => m.name.startsWith('tick'))].forEach(m => { m.castShadow = true; });
  face.receiveShadow = true;
  return g;
}

/** Engine turning: a rose-engine rosette drawn as height, turned into a tangent-space normal map. */
function guillocheNormalMap(size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  g.lineWidth = 1.1; g.strokeStyle = 'rgba(255,255,255,0.85)';
  const cx = size / 2, cy = size / 2, R = size * 0.49;
  const rings = [[48, 0.028], [36, 0.054], [24, 0.012]];
  for (const [n, k] of rings) {
    const off = size * k;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, ox = cx + Math.cos(a) * off, oy = cy + Math.sin(a) * off;
      for (let r = size * 0.05; r < R; r += size * 0.0315) {
        g.beginPath(); g.arc(ox, oy, r, 0, Math.PI * 2); g.stroke();
      }
    }
  }
  const img = g.getImageData(0, 0, size, size).data;
  const h = (x, y) => img[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  const out = new Uint8Array(size * size * 4);
  const k = 1.6;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * k, dy = (h(x, y + 1) - h(x, y - 1)) * k;
    const inv = 1 / Math.hypot(dx, dy, 1);
    const i = (y * size + x) * 4;
    out[i] = (-dx * inv * 0.5 + 0.5) * 255; out[i + 1] = (dy * inv * 0.5 + 0.5) * 255; out[i + 2] = (inv * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(out, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 4;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
  return tex;
}

/* ---------- the ruling: the page's grid in brass, analytic, lit by the lamp ---------- */
const VERT = `precision highp float; in vec3 position; void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const RULING = `
precision highp float;
uniform vec4 uVp;        /* viewport in device px: x, top-y (from the canvas top), w, h */
uniform float uBufH;     /* canvas device height */
uniform float uDpr;
uniform vec4 uGrid;      /* x0, y0 (view css px), cell, heavy-every-N */
uniform vec4 uLamp;      /* x, y (view css px), height, intensity */
uniform vec4 uRects[6];  /* copy boxes to step back under (view css px) */
uniform int uRectN;
uniform vec4 uSeal;      /* cx, cy, r, on */
uniform float uEdge;     /* fade at the view's bottom edge, css px */
uniform float uViewH;
out vec4 o;
const vec3 BRASS = vec3(0.784, 0.663, 0.416);
const vec3 BRIGHT = vec3(0.851, 0.745, 0.522);
const vec3 DEEP = vec3(0.627, 0.525, 0.314);
float flatE(vec2 d){ float c = uLamp.z * inversesqrt(dot(d, d) + uLamp.z * uLamp.z); return c * c * c * uLamp.w; }
/* nearest line on one axis: signed distance (css px) to it, and whether it is a heavy one */
vec2 nearest(float p, float o0){ float k = floor((p - o0) / uGrid.z + 0.5); float heavy = 1.0 - step(0.5, mod(k, uGrid.w)); return vec2(p - (o0 + k * uGrid.z), heavy); }
void main(){
  vec2 dev = vec2(gl_FragCoord.x - uVp.x, (uBufH - gl_FragCoord.y) - uVp.y);
  vec2 q = dev / uDpr;
  vec2 L = uLamp.xy;
  float ev = flatE(L - q);
  if (ev < 0.02) { o = vec4(0.0); return; }
  float copy = 0.0;
  for (int i = 0; i < 6; i++) { if (i >= uRectN) break; vec2 e = max(uRects[i].xy - q, q - uRects[i].zw); float sd = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0); copy = max(copy, 1.0 - smoothstep(-4.0, 12.0, sd)); }
  float seal = uSeal.w > 0.5 ? 1.0 - smoothstep(-20.0, 40.0, length(q - uSeal.xy) - uSeal.z) : 0.0;
  vec2 v = nearest(q.x, uGrid.x), h = nearest(q.y, uGrid.y);
  float w = 1.0 / uDpr;            /* one device pixel wide */
  float av = clamp(w * 0.5 + 0.5 / uDpr - abs(v.x), 0.0, 1.0) * uDpr;
  float ah = clamp(w * 0.5 + 0.5 / uDpr - abs(h.x), 0.0, 1.0) * uDpr;
  av = min(av, 1.0); ah = min(ah, 1.0);
  /* a line aimed at the lamp glints along its length, like brushed brass */
  vec2 dl = L - q;
  float irho = inversesqrt(dot(dl, dl) + uLamp.z * uLamp.z);
  float c = uLamp.z * irho, c4 = c * c * c * c;
  float glintV = exp(-pow(dl.x * irho * 9.0, 2.0)) * c4 * uLamp.w;
  float glintH = exp(-pow(dl.y * irho * 9.0, 2.0)) * c4 * uLamp.w;
  float eh = pow(min(ev, 1.0), 0.9);
  float aV = av * mix(0.22, 0.38, v.y) * eh, aH = ah * mix(0.22, 0.38, h.y) * eh;
  float gV = av * 0.55 * glintV, gH = ah * 0.55 * glintH;
  float a = max(aV, aH), gl = max(gV, gH);
  /* registration crosses where heavy lines meet */
  float span = uGrid.z * uGrid.w;
  vec2 node = uGrid.xy + floor((q - uGrid.xy) / span + 0.5) * span;
  vec2 dn = abs(q - node);
  float cross = max(step(dn.x, w) * step(dn.y, 5.0), step(dn.y, w) * step(dn.x, 5.0));
  float ac = cross * 0.5 * pow(min(flatE(L - node), 1.0), 0.6);
  a = max(a, ac);
  float keep = mix(1.0, 0.45, copy) * (1.0 - seal);
  keep *= smoothstep(0.0, uEdge, uViewH - q.y);
  vec3 rgb = mix(DEEP, BRASS, eh) * a + BRIGHT * gl;
  float alpha = min(1.0, a + gl);
  o = vec4(rgb, alpha) * keep;
}`;

/* ---------- renderer ---------- */
function makeRenderer() {
  if (!canvas) return null;
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
  if (!gl) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, premultipliedAlpha: true, antialias: true });
  } catch (e) { return null; }
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

function worldAtNDC(camera, ndcX, ndcY, depthPoint, out = new THREE.Vector3()) {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dir, depthPoint);
  const ray = new THREE.Ray();
  ray.origin.copy(camera.position);
  ray.direction.copy(new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize());
  return ray.intersectPlane(plane, out) || out.copy(depthPoint);
}
function pxPerUnit(camera, depthPoint, heightPx) {
  const d = new THREE.Vector3().subVectors(depthPoint, camera.position).length();
  return heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * d);
}
const clamp01 = x => Math.max(0, Math.min(1, x));
const easeOut = x => 1 - Math.pow(1 - x, 3);

/* ---------- boot ---------- */
(function boot() {
  const heroEl = document.querySelector('.hero');
  const sealEl = document.getElementById('heroSeal');
  const wrapEl = heroEl && heroEl.querySelector('.wrap');
  const copyEls = heroEl ? Array.from(heroEl.querySelectorAll('.kicker, h1, .stand, .cta-row, .cred-row')) : [];
  if (!heroEl || !sealEl || !wrapEl) return;
  const renderer = makeRenderer();
  if (!renderer) return;
  const maxDpr = coarse ? 1.5 : 1.75;
  renderer.debug.onShaderError = () => shutdown();

  /* the lamp: css px inside the hero. The pointer carries it on hover devices; otherwise it rests by the seal */
  const lamp = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, I: 0 };
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };

  /* ---- the seal scene ---- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  camera.position.set(0, 0, 6); camera.lookAt(0, 0, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const buildEnv = () => { scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; };
  buildEnv();
  scene.environmentIntensity = 0.55;
  scene.environmentRotation.set(0, Math.PI * 0.35, 0);

  const matBrass = new THREE.MeshPhysicalMaterial({ color: 0xC9A768, metalness: 1, roughness: 0.3, anisotropy: 0.5, anisotropyRotation: Math.PI / 2, clearcoat: 0.15, clearcoatRoughness: 0.45 });
  const matCream = new THREE.MeshPhysicalMaterial({ color: 0xE9E3D6, metalness: 0.92, roughness: 0.26, anisotropy: 0.3, clearcoat: 0.1, clearcoatRoughness: 0.4 });
  const matEnamel = new THREE.MeshPhysicalMaterial({
    color: 0x122038, metalness: 0.15, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12,
    normalMap: guillocheNormalMap(512), normalScale: new THREE.Vector2(0.45, 0.45), clearcoatNormalMap: null,
  });
  matEnamel.normalMap.needsUpdate = true;
  const seal = buildSeal({ matBrass, matCream, matEnamel });
  const rig = new THREE.Group(); const lean = new THREE.Group();
  lean.add(seal); rig.add(lean); scene.add(rig);

  const key = new THREE.SpotLight(0xFFF1D6, 0, 14, 0.7, 0.8, 1.4);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 14;
  scene.add(key); scene.add(key.target);
  const rim = new THREE.DirectionalLight(0xB9C9E8, 0.5); rim.position.set(-3, 3, 1.5); scene.add(rim);
  const fill = new THREE.HemisphereLight(0x9AA4B8, 0x0A1220, 0.3); scene.add(fill);

  /* ---- the ruling pass ---- */
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const v4 = () => new THREE.Vector4();
  const rU = {
    uVp: { value: v4() }, uBufH: { value: 1 }, uDpr: { value: 1 }, uGrid: { value: v4() }, uLamp: { value: v4() },
    uRects: { value: Array.from({ length: 6 }, v4) }, uRectN: { value: 0 }, uSeal: { value: v4() }, uEdge: { value: 120 }, uViewH: { value: 1 },
  };
  const rulingScene = new THREE.Scene();
  const rulingMesh = new THREE.Mesh(tri, new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: RULING, uniforms: rU, depthTest: false, depthWrite: false, blending: THREE.NoBlending }));
  rulingMesh.frustumCulled = false; rulingScene.add(rulingMesh);
  const flatCam = new THREE.Camera();

  /* ---- measure: the hero's box, the seal's box, the column's edges, the copy ---- */
  const V = { x: 0, y: 0, w: 1, h: 1, dpr: 1, bufW: 0, bufH: 0, sealCx: 0, sealCy: 0, sealW: 1, x0: 0, y0: 0, cell: 24, rects: [], rest: { x: 0, y: 0 } };
  const anchor = new THREE.Vector3();
  function measure() {
    const hr = heroEl.getBoundingClientRect();
    V.x = hr.left; V.y = hr.top; V.w = Math.max(1, hr.width); V.h = Math.max(1, hr.height);
    const sr = sealEl.getBoundingClientRect();
    V.sealCx = sr.left + sr.width / 2 - hr.left; V.sealCy = sr.top + sr.height / 2 - hr.top; V.sealW = sr.width;
    const wr = wrapEl.getBoundingClientRect(), ws = getComputedStyle(wrapEl);
    const colL = wr.left + parseFloat(ws.paddingLeft) - hr.left, colR = wr.right - parseFloat(ws.paddingRight) - hr.left;
    const span = colR - colL; const heavy = Math.max(2, Math.round(span / 110));
    V.cell = span / (heavy * 5); V.x0 = colL + 0.5; V.y0 = 0.5;
    V.rects = copyEls.map(el => { const r = el.getBoundingClientRect(); return r.width > 0 ? [r.left - hr.left, r.top - hr.top, r.right - hr.left, r.bottom - hr.top] : null; }).filter(Boolean).slice(0, 6);
    /* where the lamp rests: up and to the left of the seal, a little over half a diameter away */
    const narrow = matchMedia('(max-width: 880px)').matches;
    V.rest.x = narrow ? V.sealCx - V.sealW * 0.45 : V.sealCx - V.sealW * 0.62;
    V.rest.y = narrow ? V.sealCy - V.sealW * 0.55 : V.sealCy - V.sealW * 0.58;
  }
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, maxDpr);
    const w = innerWidth, h = innerHeight;
    if (w !== V.cw || h !== V.ch || dpr !== V.dpr) {
      V.cw = w; V.ch = h; V.dpr = dpr;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      V.bufW = Math.floor(w * dpr); V.bufH = Math.floor(h * dpr);
    }
  }
  function place() {
    camera.aspect = V.w / V.h; camera.updateProjectionMatrix();
    const ndcX = (V.sealCx / V.w) * 2 - 1, ndcY = 1 - (V.sealCy / V.h) * 2;
    worldAtNDC(camera, ndcX, ndcY, new THREE.Vector3(0, 0, 0), anchor);
    rig.position.copy(anchor);
    /* the ring's outer edge lands exactly on the drawing's: 93/120 of the box per side */
    const s = (V.sealW * (93 / 120)) / ((RING_R + RING_W / 2) * 2 * pxPerUnit(camera, anchor, V.h));
    rig.scale.setScalar(s);
  }

  /* ---- interaction ---- */
  let pointerOn = false;
  if (canHover) {
    heroEl.addEventListener('pointermove', e => {
      const hr = heroEl.getBoundingClientRect();
      lamp.tx = e.clientX - hr.left; lamp.ty = e.clientY - hr.top; pointerOn = true; kick();
    }, { passive: true });
    heroEl.addEventListener('pointerleave', () => { pointerOn = false; kick(); }, { passive: true });
  }

  /* ---- the frame: on demand ---- */
  let raf = 0, last = 0, lost = false, painted = false, inView = true, lastScroll = -1;
  const born = performance.now();
  const kick = () => { if (!raf && !lost && !document.hidden) raf = requestAnimationFrame(frame); };
  function frame(now) {
    raf = 0;
    if (lost || document.hidden) return;
    try {
      const busy = step(now);
      if (busy) raf = requestAnimationFrame(frame); else last = 0;
    } catch (e) { shutdown(); }
  }
  function spring(dt, w) {
    let t = dt;
    while (t > 1e-6) {
      const h = Math.min(t, 1 / 240); t -= h;
      lamp.vx += (w * w * (lamp.tx - lamp.x) - 2 * w * lamp.vx) * h;
      lamp.vy += (w * w * (lamp.ty - lamp.y) - 2 * w * lamp.vy) * h;
      lamp.x += lamp.vx * h; lamp.y += lamp.vy * h;
    }
    if (Math.abs(lamp.tx - lamp.x) + Math.abs(lamp.ty - lamp.y) < 0.1 && Math.abs(lamp.vx) + Math.abs(lamp.vy) < 2) {
      lamp.x = lamp.tx; lamp.y = lamp.ty; lamp.vx = lamp.vy = 0; return true;
    }
    return false;
  }
  const lampWorld = new THREE.Vector3();
  function step(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60; last = now;
    resize(); measure();
    const scrolledPx = -V.y;
    const scrolled = clamp01(scrolledPx / Math.max(V.h, 1));
    inView = V.y < innerHeight && V.y + V.h > 0;
    if (!inView) { if (painted) { renderer.setScissorTest(false); renderer.clear(); painted = false; } return false; }

    /* targets */
    if (!pointerOn) { lamp.tx = V.rest.x; lamp.ty = V.rest.y; }
    if (!painted) { lamp.x = lamp.tx; lamp.y = lamp.ty; }
    let settled = reduced ? true : spring(dt, pointerOn ? 16 : 6);
    const intro = reduced ? 1 : clamp01((now - born - 150) / 900);
    const e = easeOut(intro);
    lamp.I = e;

    /* the seal turns toward the lamp and leans back as the cover scrolls away */
    const ax = (lamp.x - V.sealCx) / Math.max(V.sealW, 1), ay = (lamp.y - V.sealCy) / Math.max(V.sealW, 1);
    tilt.tx = Math.max(-0.3, Math.min(0.3, ay * 0.22)) + scrolled * 0.45;
    tilt.ty = Math.max(-0.3, Math.min(0.3, -ax * 0.22));
    if (reduced) { tilt.x = tilt.tx; tilt.y = tilt.ty; }
    else {
      const k = 1 - Math.pow(0.002, dt);
      tilt.x += (tilt.tx - tilt.x) * k; tilt.y += (tilt.ty - tilt.y) * k;
      if (Math.abs(tilt.tx - tilt.x) + Math.abs(tilt.ty - tilt.y) > 0.0008) settled = false;
    }
    place();
    lean.rotation.x = -tilt.x; lean.rotation.y = -tilt.y;
    lean.scale.setScalar(0.96 + 0.04 * e);
    lean.position.y = scrolled * 0.6 * rig.scale.x * 0 + scrolled * 0.35;
    lean.position.z = -scrolled * 0.8;

    /* one light for both: the key light stands over the lamp's spot on the page */
    const ndcX = (lamp.x / V.w) * 2 - 1, ndcY = 1 - (lamp.y / V.h) * 2;
    worldAtNDC(camera, ndcX, ndcY, anchor, lampWorld);
    lampWorld.z += 3.4 * rig.scale.x;
    key.position.copy(lampWorld); key.target.position.copy(rig.position);
    key.intensity = 10 * rig.scale.x * rig.scale.x * e;

    draw(e);
    if (lost) return false;   /* a rejected shader shut us down mid-draw: leave the engraved seal alone */
    const movedByScroll = scrolledPx !== lastScroll; lastScroll = scrolledPx;
    if (!painted) { painted = true; root.classList.add('gl'); setTimeout(() => root.classList.add('gl-seal'), 60); }
    if (reduced) return false;
    return !settled || intro < 1 || movedByScroll;
  }
  function draw(e) {
    /* the view's viewport is the whole hero box, even the part outside the window: GL accepts a
       viewport beyond the drawable and the scissor keeps the drawing inside it. clamping the
       viewport would squash the projection whenever the hero is taller than the window.
       three takes these in css px and scales by the pixel ratio itself; the shader gets device px */
    const dpr = V.dpr, cw = V.cw, ch = V.ch;
    const vx = V.x, vyTop = V.y, vw = Math.max(1, V.w), vh = Math.max(1, V.h);
    const vy = ch - vyTop - vh;   /* GL counts from the bottom */
    const sx0 = Math.max(0, vx), sy0 = Math.max(0, vy), sx1 = Math.min(cw, vx + vw), sy1 = Math.min(ch, vy + vh);
    renderer.setScissorTest(false);
    renderer.clear();
    if (sx1 <= sx0 || sy1 <= sy0) return;
    renderer.setViewport(vx, vy, vw, vh);
    renderer.setScissor(sx0, sy0, sx1 - sx0, sy1 - sy0);
    renderer.setScissorTest(true);
    /* the ruling */
    rU.uVp.value.set(vx * dpr, vyTop * dpr, vw * dpr, vh * dpr); rU.uBufH.value = V.bufH; rU.uDpr.value = dpr;
    rU.uGrid.value.set(V.x0, V.y0, V.cell, 5);
    rU.uLamp.value.set(lamp.x, lamp.y, Math.min(110, Math.max(64, V.w * 0.07)), 1.1 * e);
    V.rects.forEach((r, i) => rU.uRects.value[i].set(r[0], r[1], r[2], r[3])); rU.uRectN.value = V.rects.length;
    rU.uSeal.value.set(V.sealCx, V.sealCy, V.sealW * 0.47, 1); rU.uViewH.value = V.h;
    renderer.render(rulingScene, flatCam);
    /* the metal */
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
  }

  /* ---- hand-over and teardown ---- */
  function shutdown() {
    lost = true;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    root.classList.remove('gl', 'gl-seal');
  }
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); shutdown(); }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    try { lost = false; painted = false; V.cw = 0; buildEnv(); root.classList.add('gl'); kick(); } catch (e) { shutdown(); }
  }, false);

  const relayout = () => { if (lost) return; last = 0; kick(); };
  addEventListener('resize', relayout, { passive: true });
  addEventListener('scroll', () => { if (!lost) kick(); }, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(heroEl);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout, () => {});
  document.addEventListener('visibilitychange', () => { last = 0; kick(); });
  kick();
})();
