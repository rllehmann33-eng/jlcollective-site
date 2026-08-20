// The jewel of the Standing Record: the inscribed seal becomes machined metal.
// Progressive enhancement — no WebGL, no JS, or reduced motion keep the engraved SVG seal.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
// Shared scaffold for the hero prototypes: renderer, pointer, resize/visibility, seal geometry.





const C = {
  navy0: 0x0A121F, navy1: 0x101A2B, navy2: 0x122038,
  cream: 0xF6F2EA, text1: 0xE8E2D6, text2: 0xB6BFCD,
  brass: 0xC8A96A, brassBright: 0xD9BE85, ink: 0x0E1828,
};

// The J2 seal, straight from the kit SVG (viewBox 240). Letters are the authored paths; ring/ticks are built.
const J_PATH = 'M76.84 83.65 H107.75 V84.99 H97.09 V140.66 C97.09 156.66 92.09 158.66 82.09 158.66 C72.49 158.66 65.49 155.06 65.49 150.30 H67.49 C67.49 155.30 80.09 153.66 82.09 153.66 C88.09 153.66 87.49 152.26 87.49 140.66 V84.99 H76.84 Z';
const L_PATH = 'M116.00 150.66H126.66V84.99H116.00V83.65H146.91V84.99H136.26V150.66H153.34Q161.79 150.66 166.59 145.38Q171.39 140.10 173.60 130.98H174.66V152.00H116.00Z';
const RING_R = 90 / 120;        // 0.75 in unit space (240 box -> [-1,1])
const RING_W = 6 / 120;         // 0.05
const TICK_W = 3 / 120;
const TICK_R0 = 84 / 120, TICK_R1 = 96 / 120;   // y 36..24 from the top edge
const TICK_ANGLES = [Math.PI / 2, -Math.PI / 6, Math.PI + Math.PI / 6]; // 0°, 120°, 240° clockwise from top

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = matchMedia('(hover: hover)').matches;
const isNarrow = () => innerWidth < 720;
/** On phones the object lives in a band under the copy: returns its centre as a fraction of hero height. */
const bandCentreY = (w, h) => 1 - (0.33 * w + 28) / h;

/** Letter shapes in unit space (centre 0,0, y up). */
function letterShapes() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><path d="${J_PATH}"/><path d="${L_PATH}"/></svg>`;
  const data = new SVGLoader().parse(svg);
  const toUnit = new THREE.Matrix3().set(1 / 120, 0, -1, 0, -1 / 120, 1, 0, 0, 1);
  const out = data.paths.map(p => p.toShapes(true).map(shape => {
    // transform shape + holes into unit space
    const tx = (pts) => pts.forEach(v => v.applyMatrix3(toUnit));
    // Path curves are objects; easiest is to rebuild from points
    const pts = shape.getPoints(24); tx(pts);
    const ns = new THREE.Shape(pts);
    shape.holes.forEach(h => { const hp = h.getPoints(24); tx(hp); ns.holes.push(new THREE.Path(hp)); });
    return ns;
  }));
  return { j: out[0], l: out[1] };
}

/** Ring annulus + tick capsule shapes (2D, unit space). */
function ringShape(inner = RING_R - RING_W / 2, outer = RING_R + RING_W / 2) {
  const s = new THREE.Shape(); s.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const h = new THREE.Path(); h.absarc(0, 0, inner, 0, Math.PI * 2, true);
  s.holes.push(h); return s;
}
function tickShapes(w = TICK_W, r0 = TICK_R0, r1 = TICK_R1) {
  return TICK_ANGLES.map(a => {
    const s = new THREE.Shape();
    const len = r1 - r0, hw = w / 2;
    // capsule along +y from 0..len, then rotate/translate
    s.moveTo(-hw, 0); s.lineTo(-hw, len); s.absarc(0, len, hw, Math.PI, 0, true); s.lineTo(hw, 0); s.absarc(0, 0, hw, 0, Math.PI, true);
    const pts = s.getPoints(8).map(p => {
      const c = Math.cos(a - Math.PI / 2), sn = Math.sin(a - Math.PI / 2);
      return new THREE.Vector2(p.x * c - (p.y + r0) * sn, p.x * sn + (p.y + r0) * c);
    });
    return new THREE.Shape(pts);
  });
}

/**
 * Build the seal as solid geometry. Returns a Group with children named ring/j/l/tick0..2.
 * All parts lie in the XY plane, extruded toward +z, front face at z=depth.
 */
function buildSeal({ depth = 0.06, bevel = 0.012, letterDepth = 0.06, letterBevel = 0.006, matBrass, matCream, curveSegments = 96 } = {}) {
  const g = new THREE.Group();
  const ex = (shape, d, b) => {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelOffset: 0, bevelSegments: 3, curveSegments });
    geo.computeVertexNormals();
    return geo;
  };
  const ring = new THREE.Mesh(ex(ringShape(), depth, bevel), matCream); ring.name = 'ring'; g.add(ring);
  const { j, l } = letterShapes();
  const jm = new THREE.Mesh(ex(j[0], letterDepth, letterBevel), matBrass); jm.name = 'j'; g.add(jm);
  const lm = new THREE.Mesh(ex(l[0], letterDepth, letterBevel), matCream); lm.name = 'l'; g.add(lm);
  tickShapes().forEach((s, i) => { const t = new THREE.Mesh(ex(s, depth * 0.8, bevel * 0.5), matBrass); t.name = 'tick' + i; g.add(t); });
  g.children.forEach(m => { m.castShadow = true; m.receiveShadow = true; });
  return g;
}

/** Polylines (unit space) for line-art versions: ring, ticks, J outline, L outline. */
function sealPolylines() {
  const ring = []; for (let i = 0; i <= 256; i++) { const a = i / 256 * Math.PI * 2; ring.push(new THREE.Vector3(Math.cos(a) * RING_R, Math.sin(a) * RING_R, 0)); }
  const ticks = TICK_ANGLES.map(a => [new THREE.Vector3(Math.cos(a) * TICK_R0, Math.sin(a) * TICK_R0, 0), new THREE.Vector3(Math.cos(a) * TICK_R1, Math.sin(a) * TICK_R1, 0)]);
  const { j, l } = letterShapes();
  const toV3 = pts => pts.map(p => new THREE.Vector3(p.x, p.y, 0));
  const jl = toV3(j[0].getPoints(24)); jl.push(jl[0].clone());
  const ll = toV3(l[0].getPoints(24)); ll.push(ll[0].clone());
  return { ring, ticks, j: jl, l: ll };
}

/** Renderer + pointer + loop scaffold bound to the hero canvas. */
function setup({ antialias = true, maxDpr = 2 } = {}) {
  const hero = document.querySelector('.hero');
  const canvas = document.getElementById('heroGL');
  if (!hero || !canvas) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias, alpha: true, powerPreference: 'high-performance', premultipliedAlpha: true });
  } catch (e) { console.warn('[proto] no WebGL', e); return null; }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // pointer in NDC-ish space (-1..1), default = the static lamp position (72%, 38%)
  const pointer = { x: 0.44, y: 0.24, tx: 0.44, ty: 0.24, px: 0.72, py: 0.38, active: false };
  if (canHover && !reduced) {
    hero.addEventListener('pointermove', e => {
      const r = hero.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      pointer.px = px; pointer.py = py; pointer.tx = px * 2 - 1; pointer.ty = 1 - py * 2; pointer.active = true;
    }, { passive: true });
    hero.addEventListener('pointerleave', () => { pointer.tx = 0.44; pointer.ty = 0.24; pointer.active = false; }, { passive: true });
  }

  const size = { w: 1, h: 1, dpr: renderer.getPixelRatio() };
  const resizeFns = [];
  const doResize = () => {
    size.w = hero.clientWidth; size.h = hero.clientHeight;
    renderer.setSize(size.w, size.h, false);
    resizeFns.forEach(f => f(size));
  };
  new ResizeObserver(doResize).observe(hero);

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.02 }).observe(hero);

  let last = performance.now() / 1000, t = 0, raf = 0;
  const start = (frame) => {
    doResize();
    document.documentElement.classList.add('gl');
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now() / 1000; let dt = Math.min(0.05, now - last); last = now;
      if (!visible || document.hidden) return;
      t += dt;
      // ease pointer
      const k = 1 - Math.pow(0.001, dt);
      pointer.x += (pointer.tx - pointer.x) * k * 0.9;
      pointer.y += (pointer.ty - pointer.y) * k * 0.9;
      frame(t, dt);
    };
    loop();
  };
  return { renderer, hero, canvas, pointer, size, onResize: f => resizeFns.push(f), start };
}

/** World position on the plane (through `depthPoint`, facing the camera) that projects to the given NDC. */
function worldAtNDC(camera, ndcX, ndcY, depthPoint, out = new THREE.Vector3()) {
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dir, depthPoint);
  const ray = new THREE.Ray();
  ray.origin.copy(camera.position);
  ray.direction.copy(new THREE.Vector3(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize());
  return ray.intersectPlane(plane, out) || out.copy(depthPoint);
}

/** Pixel size of one world unit at a depth point (for sizing objects to CSS px). */
function pxPerUnit(camera, depthPoint, heightPx) {
  const d = new THREE.Vector3().subVectors(depthPoint, camera.position).length();
  const visibleH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * d;
  return heightPx / visibleH;
}

const ease = {
  outCubic: x => 1 - Math.pow(1 - x, 3),
  outQuint: x => 1 - Math.pow(1 - x, 5),
  inOut: x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2,
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
};
const clamp01 = x => Math.max(0, Math.min(1, x));

/* ---- the scene: the inscribed drawing becomes metal ---- */
const app = setup();
const svgSeal = document.querySelector('.hero-seal svg');
const foilEl = document.querySelector('.hero-seal .foil');
if (app && svgSeal) {
  const { renderer, hero, pointer, size, onResize, start } = app;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;
  scene.environmentRotation.set(0, Math.PI * 0.35, 0);

  const matBrass = new THREE.MeshPhysicalMaterial({
    color: 0xC9A768, metalness: 1, roughness: 0.34,
    anisotropy: 0.55, anisotropyRotation: Math.PI / 2, clearcoat: 0.12, clearcoatRoughness: 0.5,
  });
  const matCream = new THREE.MeshPhysicalMaterial({
    color: 0xE9E3D6, metalness: 0.92, roughness: 0.28,
    anisotropy: 0.35, clearcoat: 0.08, clearcoatRoughness: 0.4,
  });

  const seal = buildSeal({ depth: 0.07, bevel: 0.014, letterDepth: 0.075, letterBevel: 0.007, matBrass, matCream });
  const rig = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.add(seal); rig.add(tilt); scene.add(rig);

  /* the seal's shadow falls onto the ledger paper behind it */
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.5, color: 0x000000 }));
  catcher.receiveShadow = true; catcher.position.z = -0.35; scene.add(catcher);

  const lamp = new THREE.SpotLight(0xFFF0D2, 0, 12, 0.62, 0.9, 1.6);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.bias = -0.00035; lamp.shadow.normalBias = 0.02; lamp.shadow.radius = 4;
  lamp.shadow.camera.near = 0.5; lamp.shadow.camera.far = 14;
  scene.add(lamp); scene.add(lamp.target);
  const rim = new THREE.DirectionalLight(0xB9C9E8, 0.55); rim.position.set(-3, 3, 1.5); scene.add(rim);
  const fill = new THREE.HemisphereLight(0x8A94A8, 0x080D14, 0.35); scene.add(fill);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.45, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  /* placement: the metal takes the exact spot of the inscribed drawing */
  const anchor = new THREE.Vector3();
  function place() {
    camera.aspect = size.w / size.h; camera.updateProjectionMatrix();
    composer.setSize(size.w, size.h);
    bloom.resolution.set(size.w, size.h);
    const hr = hero.getBoundingClientRect();
    const r = svgSeal.getBoundingClientRect();
    const cx = r.left + r.width / 2 - hr.left;
    const cy = r.top + r.height / 2 - hr.top;
    const ndcX = (cx / size.w) * 2 - 1, ndcY = 1 - (cy / size.h) * 2;
    worldAtNDC(camera, ndcX, ndcY, new THREE.Vector3(0, 0, 0), anchor);
    rig.position.copy(anchor);
    const diamPx = r.width * 0.8;           /* svg box 240 <-> world 2.0; the object spans 1.6 */
    const s = diamPx / (1.6 * pxPerUnit(camera, anchor, size.h));
    rig.scale.setScalar(s);
    catcher.position.z = -0.35 * s;
    if (!canHover || reduced) {
      pointer.tx = pointer.x = ndcX - 0.5; pointer.ty = pointer.y = ndcY + 0.5;
    }
  }
  onResize(place);

  /* handoff: wait for the SVG to finish inscribing itself, then the drawing becomes metal */
  const T0 = performance.now() / 1000;
  const holdoff = reduced ? 0 : Math.max(0, 3.3 - T0);
  const introLen = reduced ? 0 : 0.9;
  let began = false;
  const lampWorld = new THREE.Vector3();

  setTimeout(function () {
    document.documentElement.classList.add('gl-seal');
    start(function (t) {
      if (!began) { began = true; }
      const k = introLen ? clamp01((performance.now() / 1000 - T0 - holdoff) / introLen) : 1;
      const e = ease.outCubic(k);
      const s = rig.scale.x;
      tilt.scale.setScalar(0.96 + 0.04 * e);
      tilt.rotation.z = (1 - e) * 0.04;
      lamp.intensity = 9 * (s * s) / (1.21) * e;
      if (k >= 1 && !reduced) {
        tilt.rotation.x += ((-pointer.y * 0.16 + Math.sin(t * 0.55) * 0.02) - tilt.rotation.x) * 0.06;
        tilt.rotation.y += ((pointer.x * 0.22 + Math.cos(t * 0.42) * 0.02) - tilt.rotation.y) * 0.06;
        tilt.position.y = Math.sin(t * 0.7) * 0.012;
      }
      worldAtNDC(camera, pointer.x, pointer.y, anchor, lampWorld);
      lampWorld.z += 3.7 * rig.scale.x;
      lamp.position.copy(lampWorld);
      lamp.target.position.copy(rig.position);
      composer.render();
    });
  }, holdoff * 1000);
}
