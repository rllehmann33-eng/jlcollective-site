// The seal: brass and cream metal over a navy engine-turned enamel face, machined in real time.
// It does one thing as the page scrolls: it leaves the cover, descends onto the cream paper,
// presses in, and hands off to the embossed impression that stays there. On the cover, hovering
// or touching it presses it. Nothing idles, nothing follows the pointer, nothing turns on its own.
// scene.js loads this module only at 960px and above with motion allowed, so phones never
// download it. Without WebGL2, after a lost context or a rejected shader, the engraved SVG seal
// and the embossed impression are the whole story and nothing is logged.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const root = document.documentElement;
const box = document.getElementById('heroSeal');
const imp = document.getElementById('impression');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wide = matchMedia('(min-width: 960px)');

/* ---------- the J2 seal from the kit's paths (viewBox 240 → unit space, y up) ---------- */
const J_PATH = 'M76.84 83.65 H107.75 V84.99 H97.09 V140.66 C97.09 156.66 92.09 158.66 82.09 158.66 C72.49 158.66 65.49 155.06 65.49 150.30 H67.49 C67.49 155.30 80.09 153.66 82.09 153.66 C88.09 153.66 87.49 152.26 87.49 140.66 V84.99 H76.84 Z';
const L_PATH = 'M116.00 150.66H126.66V84.99H116.00V83.65H146.91V84.99H136.26V150.66H153.34Q161.79 150.66 166.59 145.38Q171.39 140.10 173.60 130.98H174.66V152.00H116.00Z';
const RING_R = 90 / 120, RING_W = 6 / 120, TICK_W = 3 / 120, TICK_R0 = 84 / 120, TICK_R1 = 96 / 120;
const OUTER = RING_R + RING_W / 2;
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
function ringShape(inner = RING_R - RING_W / 2, outer = OUTER) {
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
  /* the rosette's centre is a singularity: flatten it so no bright pixel sits at the enamel's heart */
  const rc = size * 0.035, c0 = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { if (Math.hypot(x - c0, y - c0) < rc) { const i = (y * size + x) * 4; out[i] = 128; out[i + 1] = 128; out[i + 2] = 255; } }
  const tex = new THREE.DataTexture(out, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true; tex.anisotropy = 8; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
  return tex;
}
/** Brushed metal: a fine directional grain as a roughness map, so the brass is not a mirror. */
function brushedRoughness(size = 256, base = 0.26, grain = 0.10) {
  const data = new Uint8Array(size * size * 4);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const line = new Float32Array(size);
  for (let x = 0; x < size; x++) line[x] = rnd();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = base + (line[x] - 0.5) * grain + (rnd() - 0.5) * 0.02;
    const i = (y * size + x) * 4; const b = Math.max(0, Math.min(255, v * 255));
    data[i] = data[i + 1] = data[i + 2] = b; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 3); tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
  return tex;
}
/** cubic-bezier(0.2, 0, 0, 1), the page's easing, solved for y at x. */
function easeOut(x) {
  const bx = t => 3 * 0.2 * t * (1 - t) * (1 - t) + t * t * t;
  const by = t => 3 * t * t * (1 - t) + t * t * t;
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 24; i++) { t = (lo + hi) / 2; if (bx(t) < x) lo = t; else hi = t; }
  return by(t);
}
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = v => { v = clamp01(v); return v * v * v * (v * (v * 6 - 15) + 10); };
const lerp = (a, b, t) => a + (b - a) * t;

(function boot() {
  const bail = () => root.classList.remove('stamp');   /* no stamp: the impression simply shows */
  if (!box || !imp || reduced || !wide.matches) { bail(); return; }
  if (typeof THREE.setConsoleFunction === 'function') THREE.setConsoleFunction(() => {});   /* the page logs nothing, lost context included */
  const canvas = document.createElement('canvas');
  canvas.id = 'heroGL'; canvas.className = 'seal-gl'; canvas.setAttribute('aria-hidden', 'true');
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
  if (!gl) { bail(); return; }
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, premultipliedAlpha: true, antialias: true }); } catch (e) { bail(); return; }
  document.body.appendChild(canvas);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.debug.onShaderError = () => shutdown();

  /* ---- scene ---- */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  camera.position.set(0, 0, 6); camera.lookAt(0, 0, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const buildEnv = () => { scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; };
  buildEnv();
  scene.environmentIntensity = 0.9;
  scene.environmentRotation.set(0, Math.PI * 1.75, 0);

  const matBrass = new THREE.MeshPhysicalMaterial({ color: 0xC9A768, metalness: 1, roughness: 1, roughnessMap: brushedRoughness(256, 0.26, 0.10), anisotropy: 0.7, anisotropyRotation: Math.PI / 2, clearcoat: 0.12, clearcoatRoughness: 0.4 });
  const matCream = new THREE.MeshPhysicalMaterial({ color: 0xEDE7DA, metalness: 0.95, roughness: 1, roughnessMap: brushedRoughness(256, 0.22, 0.08), anisotropy: 0.4, clearcoat: 0.08, clearcoatRoughness: 0.35 });
  const matEnamel = new THREE.MeshPhysicalMaterial({ color: 0x122038, metalness: 0.2, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, normalMap: guillocheNormalMap(512), normalScale: new THREE.Vector2(0.5, 0.5) });
  const matBack = new THREE.MeshPhysicalMaterial({ color: 0x3A3222, metalness: 1, roughness: 0.5 });

  const ex = (shape, d, b, segs = 5) => { const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: 0, bevelSegments: segs, curveSegments: 128 }); g.computeVertexNormals(); return g; };
  const metal = new THREE.Group();                 /* the parts that press: ring, letters, ticks */
  metal.add(new THREE.Mesh(ex(ringShape(), 0.09, 0.024), matCream));
  metal.add(new THREE.Mesh(ex(shapeFromPath(J_PATH), 0.085, 0.01, 3), matBrass));
  metal.add(new THREE.Mesh(ex(shapeFromPath(L_PATH), 0.085, 0.01, 3), matCream));
  tickShapes().forEach(s => metal.add(new THREE.Mesh(ex(s, 0.12, 0.009, 3), matBrass)));
  metal.children.forEach(m => { m.castShadow = true; });
  const face = new THREE.Mesh(new THREE.CylinderGeometry(RING_R - RING_W / 2 + 0.004, RING_R - RING_W / 2 + 0.004, 0.03, 160), matEnamel);
  face.rotation.x = Math.PI / 2; face.position.z = -0.011; face.receiveShadow = true;
  const back = new THREE.Mesh(new THREE.CylinderGeometry(OUTER + 0.02, OUTER + 0.02, 0.035, 160), matBack);
  back.rotation.x = Math.PI / 2; back.position.z = -0.0325;
  const seal = new THREE.Group(); seal.add(back, face, metal);
  const rig = new THREE.Group(); rig.add(seal); scene.add(rig);

  const key = new THREE.SpotLight(0xFFF1D6, 0, 16, 0.7, 0.8, 1.4);
  key.position.set(-1.8, 2.4, 3.8); key.target.position.set(0, 0, 0);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 16;
  scene.add(key); scene.add(key.target);
  const rim = new THREE.DirectionalLight(0xB9C9E8, 0.45); rim.position.set(-3, 3, 1.5); scene.add(rim);
  const fill = new THREE.HemisphereLight(0x9AA4B8, 0x0A1220, 0.28); scene.add(fill);

  /* ---- the window: a square canvas a little larger than the seal ever is, moved by transform ---- */
  const WIN = 450;
  const V = { dpr: 0, set: false };
  function fitWindow() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (V.set && dpr === V.dpr) return;
    V.dpr = dpr; V.set = true;
    canvas.style.width = WIN + 'px'; canvas.style.height = WIN + 'px';
    renderer.setPixelRatio(dpr); renderer.setSize(WIN, WIN, false);
    camera.aspect = 1; camera.updateProjectionMatrix();
  }
  const visibleH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.position.length();
  const pxPerUnit = () => WIN / visibleH;

  /* ---- the journey: p = 0 on the cover, p = 1 pressed into the paper ---- */
  const J = { p: 0, lastP: -1, cx: 0, cy: 0 };
  function measure() {
    const hr = box.getBoundingClientRect(), ir = imp.getBoundingClientRect();
    const impDocCenter = ir.top + scrollY + ir.height / 2;
    const heroDocCenter = hr.top + scrollY + hr.height / 2;
    const s1 = Math.max(innerHeight * 0.25, impDocCenter - heroDocCenter);   /* the journey is the distance between the two marks; never a jump */
    J.p = clamp01(scrollY / s1);
    const e = smooth(Math.min(1, J.p / 0.76));   /* at its mark by 0.76, then it presses in place */
    J.cx = lerp(hr.left + hr.width / 2, ir.left + ir.width / 2, e);
    J.cy = lerp(hr.top + hr.height / 2, ir.top + ir.height / 2, e);
    J.diam = lerp(hr.width, ir.width, e) * (93 / 120);
    J.e = e;
  }

  /* ---- the press on the cover: 0 at rest, 1 sunk 2–3 mm into the enamel ---- */
  const press = { v: 0, from: 0, to: 0, t0: 0, dur: 420 };
  const DEPTH = 0.045;
  let raf = 0, lost = false, painted = false;
  const kick = () => { if (!raf && !lost && !document.hidden) raf = requestAnimationFrame(frame); };
  function setTarget(to) {
    if (press.to === to) return;
    if (to === 1 && J.p > 0.05) return;   /* no new press once the seal has left the cover; a release always lands */
    press.from = press.v; press.to = to; press.t0 = performance.now(); kick();
  }
  function frame(now) {
    raf = 0;
    if (lost || document.hidden) return;
    try {
      fitWindow(); measure();
      if (J.p === 1 && J.lastP === 1 && press.v === press.to) return;   /* landed and still: nothing to do */
      let busy = false;
      if (press.v !== press.to) {
        const k = Math.min(1, (now - press.t0) / press.dur);
        press.v = press.from + (press.to - press.from) * easeOut(k);
        busy = k < 1;
      }
      const p = J.p, e = J.e;
      /* descent: the seal leans back as it leaves the cover and settles flat as it lands */
      seal.rotation.x = 0.10 * (1 - e) - 0.12 * Math.sin(Math.PI * e);
      seal.rotation.y = -0.16 * (1 - e);
      /* the press into the paper over the last stretch, then the hand-off to the impression */
      const q = clamp01((p - 0.76) / 0.16);
      const sink = Math.max(q, press.v);
      metal.position.z = -DEPTH * sink;
      rig.position.z = -0.10 * q;
      const scale = J.diam / (OUTER * 2 * pxPerUnit());
      rig.scale.setScalar(scale);
      key.intensity = 10 * scale * scale * (1 + 0.22 * sink);
      const shade = clamp01((p - 0.70) / 0.14);
      const land = clamp01((p - 0.84) / 0.10);
      const gone = clamp01((p - 0.92) / 0.08);
      imp.style.setProperty('--press', (shade * (1 - gone)).toFixed(3));
      imp.style.setProperty('--imp', land.toFixed(3));
      canvas.style.transform = 'translate3d(' + Math.round(J.cx - WIN / 2) + 'px,' + Math.round(J.cy - WIN / 2) + 'px,0)';
      canvas.style.opacity = (1 - gone).toFixed(3);
      if (gone < 1 || J.lastP !== p) renderer.render(scene, camera);
      J.lastP = p;
      if (lost) return;
      if (!painted) { painted = true; root.classList.add('gl', 'stamp'); setTimeout(() => { if (!lost) root.classList.add('gl-seal'); }, 60); setTimeout(() => { if (!lost) root.classList.add('gl-live'); }, 500); }
      if (busy) raf = requestAnimationFrame(frame);
    } catch (e) { shutdown(); }
  }
  function shutdown() {
    lost = true;
    if (raf) cancelAnimationFrame(raf); raf = 0;
    root.classList.remove('gl', 'gl-seal', 'gl-live', 'stamp');
    canvas.remove();
    imp.style.removeProperty('--imp'); imp.style.removeProperty('--press');
    box.removeAttribute('tabindex');
  }

  /* the impression is hidden until the seal lands; without us it simply shows */
  imp.style.setProperty('--imp', '0'); imp.style.setProperty('--press', '0');

  /* on the cover: hover, focus or touch presses; leaving releases */
  box.tabIndex = 0;
  box.addEventListener('pointerenter', () => setTarget(1));
  box.addEventListener('pointerleave', () => setTarget(0));
  box.addEventListener('pointerdown', () => setTarget(1));
  box.addEventListener('pointerup', () => { if (!box.matches(':hover')) setTarget(0); });
  box.addEventListener('pointercancel', () => setTarget(0));
  box.addEventListener('focus', () => setTarget(1));
  box.addEventListener('blur', () => setTarget(0));

  /* scrolling moves the seal; each scroll event draws one frame, nothing between */
  addEventListener('scroll', () => { if (!lost) kick(); }, { passive: true });
  addEventListener('resize', () => { if (!lost) kick(); }, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(() => { if (!lost) kick(); }).observe(document.body);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => kick(), () => {});
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); shutdown(); }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    if (!wide.matches || reduced) return;
    try { lost = false; painted = false; V.set = false; root.classList.add('stamp'); imp.style.setProperty('--imp', '0'); imp.style.setProperty('--press', '0'); box.tabIndex = 0; document.body.appendChild(canvas); buildEnv(); kick(); } catch (e) { shutdown(); }
  }, false);
  wide.addEventListener('change', e => { if (!e.matches) shutdown(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  kick();
})();
