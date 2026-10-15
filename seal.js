// The seal, machined in two metals over a navy enamel face, drawn once into the hero's own
// canvas at 960px and above. scene.js loads this module only when those gates pass, so a
// phone never downloads three.js at all. It does one thing: on hover, focus or touch it presses into the
// enamel, under 600 ms, and settles. Nothing idles; nothing follows the pointer; nothing turns.
// Progressive enhancement: below 960px, with reduced motion, without WebGL2, after a lost
// context or a rejected shader, the engraved SVG seal is the seal and nothing is logged.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const root = document.documentElement;
const box = document.getElementById('heroSeal');
const canvas = document.getElementById('heroGL');
const note = document.getElementById('pressNote');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wide = matchMedia('(min-width: 960px)');

/* ---------- the J2 seal from the kit's paths (viewBox 240 → unit space, y up) ---------- */
const J_PATH = 'M76.84 83.65 H107.75 V84.99 H97.09 V140.66 C97.09 156.66 92.09 158.66 82.09 158.66 C72.49 158.66 65.49 155.06 65.49 150.30 H67.49 C67.49 155.30 80.09 153.66 82.09 153.66 C88.09 153.66 87.49 152.26 87.49 140.66 V84.99 H76.84 Z';
const L_PATH = 'M116.00 150.66H126.66V84.99H116.00V83.65H146.91V84.99H136.26V150.66H153.34Q161.79 150.66 166.59 145.38Q171.39 140.10 173.60 130.98H174.66V152.00H116.00Z';
const RING_R = 90 / 120, RING_W = 6 / 120, TICK_W = 3 / 120, TICK_R0 = 84 / 120, TICK_R1 = 96 / 120;
const TICK_ANGLES = [Math.PI / 2, -Math.PI / 6, Math.PI + Math.PI / 6];

/** Absolute M L H V C Q Z only, which is all the kit uses. */
function shapeFromPath(d) {
  const tokens = d.match(/[MLHVCQZ]|-?\d*\.?\d+/g);
  const s = new THREE.Shape();
  const X = v => v / 120 - 1, Y = v => 1 - v / 120;
  let cmd = '', x = 0, y = 0, i = 0;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[MLHVCQZ]/.test(t)) { cmd = t; i++; if (cmd === 'Z') { s.closePath(); continue; } }
    if (cmd === 'M') { x = num(); y = num(); s.moveTo(X(x), Y(y)); cmd = 'L'; }
    else if (cmd === 'L') { x = num(); y = num(); s.lineTo(X(x), Y(y)); }
    else if (cmd === 'H') { x = num(); s.lineTo(X(x), Y(y)); }
    else if (cmd === 'V') { y = num(); s.lineTo(X(x), Y(y)); }
    else if (cmd === 'C') { const c1x = num(), c1y = num(), c2x = num(), c2y = num(); x = num(); y = num(); s.bezierCurveTo(X(c1x), Y(c1y), X(c2x), Y(c2y), X(x), Y(y)); }
    else if (cmd === 'Q') { const cx = num(), cy = num(); x = num(); y = num(); s.quadraticCurveTo(X(cx), Y(cy), X(x), Y(y)); }
    else { i++; }
  }
  return s;
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
/** Engine turning for the enamel: a rose-engine rosette drawn as height, turned into a normal map. */
function guillocheNormalMap(size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  g.lineWidth = 1.1; g.strokeStyle = 'rgba(255,255,255,0.85)';
  const cx = size / 2, cy = size / 2, R = size * 0.49;
  for (const [n, k] of [[48, 0.028], [36, 0.054], [24, 0.012]]) {
    const off = size * k;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, ox = cx + Math.cos(a) * off, oy = cy + Math.sin(a) * off;
      for (let r = size * 0.05; r < R; r += size * 0.0315) { g.beginPath(); g.arc(ox, oy, r, 0, Math.PI * 2); g.stroke(); }
    }
  }
  const img = g.getImageData(0, 0, size, size).data;
  const h = (x, y) => img[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  const out = new Uint8Array(size * size * 4), k = 1.6;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * k, dy = (h(x, y + 1) - h(x, y - 1)) * k, inv = 1 / Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    out[i] = (-dx * inv * 0.5 + 0.5) * 255; out[i + 1] = (dy * inv * 0.5 + 0.5) * 255; out[i + 2] = (inv * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(out, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true; tex.anisotropy = 4; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
  return tex;
}
/** cubic-bezier(0.2, 0, 0, 1), the page's easing, solved for y at x. */
function easeOut(x) {
  const bx = t => 3 * 0.2 * t * (1 - t) * (1 - t) + 3 * 0 * t * t * (1 - t) + t * t * t;
  const by = t => 3 * 0 * t * (1 - t) * (1 - t) + 3 * 1 * t * t * (1 - t) + t * t * t;
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (bx(t) < x) lo = t; else hi = t; }
  return by(t);
}

(function boot() {
  /* scene.js already checked the width and the motion preference; this is the belt to its braces */
  if (!box || !canvas || reduced || !wide.matches) return;
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
  if (!gl) return;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, premultipliedAlpha: true, antialias: true }); } catch (e) { return; }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.debug.onShaderError = () => shutdown();

  /* ---- scene ---- */
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
  const matEnamel = new THREE.MeshPhysicalMaterial({ color: 0x122038, metalness: 0.15, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, normalMap: guillocheNormalMap(512), normalScale: new THREE.Vector2(0.45, 0.45) });
  const matBack = matBrass.clone(); matBack.color.set(0x2A2416); matBack.roughness = 0.55;

  const ex = (shape, d, b, segs = 4) => { const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: 0, bevelSegments: segs, curveSegments: 96 }); g.computeVertexNormals(); return g; };
  const metal = new THREE.Group();                 /* the parts that press: ring, letters, ticks */
  const ring = new THREE.Mesh(ex(ringShape(), 0.09, 0.02), matCream); metal.add(ring);
  const jm = new THREE.Mesh(ex(shapeFromPath(J_PATH), 0.085, 0.008, 3), matBrass); metal.add(jm);
  const lm = new THREE.Mesh(ex(shapeFromPath(L_PATH), 0.085, 0.008, 3), matCream); metal.add(lm);
  tickShapes().forEach(s => metal.add(new THREE.Mesh(ex(s, 0.07, 0.009, 3), matBrass)));
  metal.children.forEach(m => { m.castShadow = true; });
  const face = new THREE.Mesh(new THREE.CylinderGeometry(RING_R - RING_W / 2 + 0.004, RING_R - RING_W / 2 + 0.004, 0.03, 128), matEnamel);
  face.rotation.x = Math.PI / 2; face.position.z = -0.011; face.receiveShadow = true;
  const back = new THREE.Mesh(new THREE.CylinderGeometry(RING_R + RING_W / 2 + 0.02, RING_R + RING_W / 2 + 0.02, 0.035, 128), matBack);
  back.rotation.x = Math.PI / 2; back.position.z = -0.0325;
  const seal = new THREE.Group(); seal.add(back, face, metal);
  const rig = new THREE.Group(); rig.add(seal); scene.add(rig);
  /* one fixed pose, never animated: a few degrees so the depth and the enamel read */
  seal.rotation.set(0.10, -0.16, 0);

  const key = new THREE.SpotLight(0xFFF1D6, 0, 14, 0.7, 0.8, 1.4);
  key.position.set(-1.6, 2.2, 3.6); key.target.position.set(0, 0, 0);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 14;
  scene.add(key); scene.add(key.target);
  const rim = new THREE.DirectionalLight(0xB9C9E8, 0.5); rim.position.set(-3, 3, 1.5); scene.add(rim);
  const fill = new THREE.HemisphereLight(0x9AA4B8, 0x0A1220, 0.3); scene.add(fill);

  /* ---- size and placement: the ring's outer edge lands on the drawing's, 93/120 of the box ---- */
  const V = { w: 0, h: 0, dpr: 1 };
  function fit() {
    const r = box.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(devicePixelRatio || 1, 1.75);
    if (w !== V.w || h !== V.h || dpr !== V.dpr) {
      V.w = w; V.h = h; V.dpr = dpr;
      renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    const dist = camera.position.length();
    const visibleH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist;
    const pxPerUnit = h / visibleH;
    rig.scale.setScalar((h * (93 / 120)) / ((RING_R + RING_W / 2) * 2 * pxPerUnit));
    key.intensity = 10 * rig.scale.x * rig.scale.x;
  }

  /* ---- the press: 0 = at rest, 1 = sunk 2–3 mm into the enamel ---- */
  const press = { v: 0, from: 0, to: 0, t0: 0, dur: 420 };
  const DEPTH = 0.045;
  let raf = 0, lost = false, painted = false, baseKey = 0;
  const kick = () => { if (!raf && !lost && !document.hidden) raf = requestAnimationFrame(frame); };
  function setTarget(to) {
    if (press.to === to) return;
    press.from = press.v; press.to = to; press.t0 = performance.now(); kick();
    if (to === 1 && note) note.classList.add('show');
  }
  function frame(now) {
    raf = 0;
    if (lost || document.hidden) return;
    try {
      fit();
      let busy = false;
      if (press.v !== press.to) {
        const k = Math.min(1, (now - press.t0) / press.dur);
        press.v = press.from + (press.to - press.from) * easeOut(k);
        busy = k < 1;
      }
      metal.position.z = -DEPTH * press.v;
      key.intensity = 10 * rig.scale.x * rig.scale.x * (1 + 0.22 * press.v);
      renderer.render(scene, camera);
      if (lost) return;   /* a rejected shader shut us down inside render(): leave the engraved seal alone */
      if (!painted) { painted = true; root.classList.add('gl'); setTimeout(() => { if (!lost) root.classList.add('gl-seal'); }, 60); }
      if (busy) raf = requestAnimationFrame(frame);
    } catch (e) { shutdown(); }
  }
  function shutdown() {
    lost = true;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    root.classList.remove('gl', 'gl-seal');
  }

  /* hover, focus or touch presses; leaving releases */
  box.tabIndex = 0;
  box.addEventListener('pointerenter', () => setTarget(1));
  box.addEventListener('pointerleave', () => setTarget(0));
  box.addEventListener('pointerdown', () => setTarget(1));
  box.addEventListener('pointerup', () => { if (!box.matches(':hover')) setTarget(0); });
  box.addEventListener('pointercancel', () => setTarget(0));
  box.addEventListener('focus', () => setTarget(1));
  box.addEventListener('blur', () => setTarget(0));

  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); shutdown(); }, false);
  canvas.addEventListener('webglcontextrestored', () => { try { lost = false; painted = false; V.w = 0; buildEnv(); kick(); } catch (e) { shutdown(); } }, false);
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (!lost) kick(); }).observe(box);
  wide.addEventListener('change', e => { if (!e.matches) shutdown(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  kick();
})();
