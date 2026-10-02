// The ruled sheet: the page's ruling, engraved into the paper in brass and dark
// until the lamp reaches it. The pointer carries the lamp. Each groove catches it
// on the wall that faces it, a line aimed at it glints along its length, and the
// paper keeps a little of the light after the lamp has moved on.
// Progressive enhancement: without modules or WebGL, or after a lost context, the
// page and its CSS lamp behave exactly as they did before this file existed.
import * as THREE from 'three';

const root = document.documentElement;
const canvas = document.getElementById('sheetGL');
const lampEl = document.querySelector('.lamp');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* the look in one place: alpha at the hot core, and how much light each level needs */
const LOOK = {
  alpha: [0.26, 0.40, 0.46],         // minor, major, cross: the diffuse ruling at the hot core
  falloff: [1.0, 0.65, 0.45],        // how each level dims with the light (the marks hold on longest)
  dim: 0.5,                          // under body copy the ruling steps back to this
  form: 0.8,                         // the entry form keeps its own ledger lines: the sheet mostly steps out
  levels: [0.30, 0.56, 0.10, 0.24],  // minor lo/hi, major lo/hi (flat irradiance, 1 under the lamp)
  cross: [0.05, 0.1],                // the marks outlast the lines
  glow: 0.85, tau: 0.4,              // afterglow deposit, decay constant (s)
  height: 0.06,                      // lamp height, × viewport width (clamped 56–96px)
  sheen: 10, sheenGain: 0.5,         // aimed lines: how tightly they must aim, how hard they glint
  hotGain: 0.5,                      // the lamp's own reflection in the brass right under it
  litLip: 0.5, darkLip: 0.7,         // the walls: lit (far from the lamp), shadowed (near it)
  body: 1.8,                         // how much paper the unlit inlay hides
};
const N = 5;                         // a heavy line every fifth
const GS = 8;                        // afterglow texel, css px
const MAX_RECTS = 8;
const FLOOR = 1 / 255;               // the afterglow always reaches zero (8-bit feedback)

const VERT = `
precision highp float;
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/* the paper's memory, at 1/8 resolution: R afterglow (fed back, rides the scroll),
   G where body copy sits, B where the hero seal and its bench take over */
const GLOW = `
precision highp float;
precision highp int;
uniform sampler2D uPrev;
uniform vec2 uGlowCss;
uniform vec2 uShift;
uniform vec4 uSeg;
uniform vec4 uLight;
uniform vec4 uRects[${MAX_RECTS}];
uniform int uRectN;
uniform vec4 uSeal;
uniform vec4 uBench;
uniform vec4 uForm;
uniform float uFormK;
in vec2 vUv;
out vec4 o;
void main() {
  vec2 q = vec2(vUv.x, 1.0 - vUv.y) * uGlowCss;
  vec2 pq = q + uShift;
  vec2 puv = vec2(pq.x / uGlowCss.x, 1.0 - pq.y / uGlowCss.y);
  bool inside = puv.x >= 0.0 && puv.x <= 1.0 && puv.y >= 0.0 && puv.y <= 1.0;
  float keep = inside ? max(texture(uPrev, puv).r * uLight.z - uLight.w, 0.0) : 0.0;
  vec2 ab = uSeg.zw - uSeg.xy;
  float t = clamp(dot(q - uSeg.xy, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
  vec2 d = q - (uSeg.xy + ab * t);
  float c = uLight.x * inversesqrt(dot(d, d) + uLight.x * uLight.x);
  float e = c * c * c;
  /* only the lamp's hot core leaves a trace: a narrow wake, not a second pool */
  float glow = max(keep, e * e * uLight.y);
  float copy = 0.0;
  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (i >= uRectN) break;
    vec2 e = max(uRects[i].xy - q, q - uRects[i].zw);
    float sd = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0);
    copy = max(copy, 1.0 - smoothstep(-4.0, 10.0, sd));
  }
  float seal = 0.0;
  if (uSeal.w > 0.5) {
    seal = 1.0 - smoothstep(-24.0, 36.0, length(q - uSeal.xy) - uSeal.z);
    seal = max(seal, 1.0 - smoothstep(0.55, 1.0, length((q - uBench.xy) / uBench.zw)));
  }
  if (uFormK > 0.0) {
    vec2 e = max(uForm.xy - q, q - uForm.zw);
    seal = max(seal, uFormK * (1.0 - smoothstep(-6.0, 6.0, length(max(e, 0.0)) + min(max(e.x, e.y), 0.0))));
  }
  o = vec4(glow, copy, seal, 1.0);
}`;

/* the sheet itself, at full resolution inside the lit area only */
const MAIN = `
precision highp float;
uniform sampler2D uGlow;
uniform vec2 uGlowCss;
uniform vec2 uScale;
uniform float uBufH;
uniform vec2 uOrigin;
uniform vec4 uGrid;
uniform vec4 uLamp;
uniform vec4 uWidth;
uniform vec4 uAlpha;
uniform vec4 uLip;
uniform vec4 uLv;
uniform vec4 uLvC;
uniform vec4 uSheen;
uniform vec4 uFall;
uniform vec2 uCss;
uniform vec4 uFade;
out vec4 o;

const vec3 BRASS  = vec3(0.784, 0.663, 0.416);   /* --brass */
const vec3 BRIGHT = vec3(0.851, 0.745, 0.522);   /* --brass-bright */
const vec3 DEEP   = vec3(0.627, 0.525, 0.314);   /* --brass-deep */
const vec3 CREAM  = vec3(0.965, 0.949, 0.918);   /* --cream */

float flatE(vec2 d) {
  float c = uLamp.z * inversesqrt(dot(d, d) + uLamp.z * uLamp.z);
  return c * c * c * uLamp.w;
}
vec2 glowUv(vec2 q) { return vec2(q.x / uGlowCss.x, 1.0 - q.y / uGlowCss.y); }
float snapC(float c, float w) { return mod(w, 2.0) > 0.5 ? floor(c) + 0.5 : floor(c + 0.5); }

/* nearest line on one axis: signed device-px distance to its snapped centre, heavy flag, document position */
vec3 nearest(float pDev, float docP, float o0, float originP, float scale) {
  float k = floor((docP - o0) / uGrid.z + 0.5);
  float heavy = 1.0 - step(0.5, mod(k, uGrid.w));
  float c = snapC((o0 + k * uGrid.z - originP) * scale, uWidth.x);
  return vec3(pDev - c, heavy, o0 + k * uGrid.z);
}

/* one groove. across: lamp minus line, along the line's normal; along: lamp minus pixel, along the line;
   ev: all the light here (lamp or memory); share: how much of it is the lamp's; copy: body copy here */
void groove(vec3 ln, float across, float along, float ev, float share, float copy, out vec4 lit, out float dark) {
  lit = vec4(0.0); dark = 0.0;
  float w = uWidth.x, d = abs(ln.x);
  if (d > w * 0.5 + 1.0) return;   /* off this groove and its lips: most of every cell */
  float vis = ln.y > 0.5 ? smoothstep(uLv.z, uLv.w, ev) : smoothstep(uLv.x, uLv.y, ev);
  if (vis <= 0.0) return;
  float H = uLamp.z, I = uLamp.w;
  float irho = inversesqrt(across * across + along * along + H * H);
  float c = H * irho, c2 = c * c, c4 = c2 * c2;
  float core = clamp(w * 0.5 + 0.5 - d, 0.0, 1.0);
  float lip = clamp(w * 0.5 + 1.5 - d, 0.0, 1.0) - core;
  /* the wall that faces the lamp is the one on the far side of the groove */
  float far = step(0.0, -ln.x * sign(across));
  /* how hard the light rakes here: not at all under the lamp, more as it lowers toward the line */
  float side = abs(across) * irho;
  float rake = side * c2 * I;
  /* a line aimed at the lamp glints along its length, like brushed brass */
  float a1 = across * irho * uSheen.x;
  float sheen = exp(-a1 * a1) * c4 * I;
  /* and the brass right under the lamp gives back its reflection */
  float hot = c4 * c4 * c4 * I;
  float base = vis * mix(uAlpha.x, uAlpha.y, ln.y) * pow(min(ev, 1.0), mix(uFall.x, uFall.y, ln.y));
  /* under body copy the glints step back further than the ruling, so no line reads as an underline */
  float hi = vis * (uSheen.y * sheen + uSheen.w * hot) * (1.0 - 0.65 * copy);
  float wall = vis * uLip.x * rake;
  /* two device pixels make two walls: the one facing the lamp takes the light, the other the shade.
     a single pixel can't split, so there the lit wall shows as a faint lip beside it */
  float split = step(1.5, w);
  float shadowed = split * (1.0 - far);
  float b = base * mix(1.0, mix(0.35, 0.7, ln.y) * (1.0 - 0.5 * side), shadowed);
  float hh = min(1.0, hi * mix(1.0, 0.45, shadowed) + wall * far * split);
  /* premultiplied: the diffuse brass is inlay (it hides more paper than it lights, so it stays warm
     over navy); the highlight is laid over it, and its hottest point warms toward cream, never past it */
  vec3 glint = mix(BRIGHT, CREAM, 0.5 * smoothstep(0.7, 1.0, hh));
  vec3 rgb = glint * hh + mix(DEEP, BRASS, share) * b * (1.0 - hh);
  float a = hh + min(1.0, b * uLip.w) * (1.0 - hh);
  float la = (1.0 - split) * lip * far * wall * 0.6;
  lit = vec4(rgb * core + BRIGHT * la, a * core + la);
  dark = uLip.y * rake * vis * lip * (1.0 - far);
}

void main() {
  vec2 dev = vec2(gl_FragCoord.x, uBufH - gl_FragCoord.y);
  vec2 q = dev / uScale;
  vec2 P = q + uOrigin;
  vec2 L = uLamp.xy + uOrigin;
  vec4 gs = texture(uGlow, glowUv(q));
  float ed = flatE(L - P);
  float ev = max(ed, gs.r);
  /* nothing can show here: the cheap way out for most of the sheet */
  if (ev < uLvC.x * 0.6) { o = vec4(0.0); return; }
  float share = clamp(ed / max(ev, 1e-4), 0.0, 1.0);

  vec4 litV, litH; float darkV, darkH;
  vec3 v = nearest(dev.x, P.x, uGrid.x, uOrigin.x, uScale.x);
  vec3 h = nearest(dev.y, P.y, uGrid.y, uOrigin.y, uScale.y);
  groove(v, L.x - v.z, L.y - P.y, ev, share, gs.g, litV, darkV);
  groove(h, L.y - h.z, L.x - P.x, ev, share, gs.g, litH, darkH);

  /* registration crosses where the heavy lines meet, lit whole by the light at their centre */
  float span = uGrid.z * uGrid.w;
  vec2 node = uGrid.xy + floor((P - uGrid.xy) / span + 0.5) * span;
  vec2 nc = (node - uOrigin) * uScale;
  nc = vec2(snapC(nc.x, uWidth.x), snapC(nc.y, uWidth.x));
  vec2 dn = abs(dev - nc);
  float cc = max(clamp(uWidth.x * 0.5 + 0.5 - dn.x, 0.0, 1.0) * step(dn.y, uWidth.z),
                 clamp(uWidth.x * 0.5 + 0.5 - dn.y, 0.0, 1.0) * step(dn.x, uWidth.z));
  vec4 litC = vec4(0.0);
  if (cc > 0.0) {
    float edn = flatE(L - node);
    float evn = max(edn, texture(uGlow, glowUv(node - uOrigin)).r);
    float a = smoothstep(uLvC.x, uLvC.y, evn) * uAlpha.z * pow(min(evn, 1.0), uFall.z) * cc;
    litC = vec4(mix(DEEP, BRASS, clamp(edn / max(evn, 1e-4), 0.0, 1.0)) * a, a);
  }
  vec4 lit = litV.a >= litH.a ? litV : litH;
  lit = litC.a > lit.a ? litC : lit;
  float dark = (1.0 - step(0.004, lit.a)) * max(darkV, darkH);
  float keep = mix(1.0, uLip.z, gs.g) * (1.0 - gs.b);
  /* the window's inner edges: a wake that runs past them fades instead of being cut */
  vec4 e = clamp(vec4(q, uCss - q) / max(uFade, vec4(1.0)), 0.0, 1.0);
  e = mix(e * e * (3.0 - 2.0 * e), vec4(1.0), step(uFade, vec4(0.0)));
  keep *= e.x * e.y * e.z * e.w;
  o = (lit + vec4(0.0, 0.0, 0.0, dark)) * keep;
}`;

function boot() {
  if (!canvas || !lampEl) return;
  let gl = null;
  try {
    gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  } catch (e) { gl = null; }
  if (!gl) return;   /* no WebGL2: the CSS lamp keeps the room, nothing is logged */

  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);

  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const camera = new THREE.Camera();
  const v4 = () => new THREE.Vector4();
  const glowU = {
    uPrev: { value: null }, uGlowCss: { value: new THREE.Vector2() }, uShift: { value: new THREE.Vector2() },
    uSeg: { value: v4() }, uLight: { value: v4() },
    uRects: { value: Array.from({ length: MAX_RECTS }, v4) }, uRectN: { value: 0 },
    uSeal: { value: v4() }, uBench: { value: v4() }, uForm: { value: v4() }, uFormK: { value: 0 },
  };
  const mainU = {
    uGlow: { value: null }, uGlowCss: glowU.uGlowCss, uScale: { value: new THREE.Vector2(1, 1) }, uBufH: { value: 1 },
    uOrigin: { value: new THREE.Vector2() }, uGrid: { value: v4() }, uLamp: { value: v4() },
    uWidth: { value: v4() }, uAlpha: { value: new THREE.Vector4(...LOOK.alpha, 0) },
    uLip: { value: new THREE.Vector4(LOOK.litLip, LOOK.darkLip, LOOK.dim, LOOK.body) },
    uLv: { value: new THREE.Vector4(...LOOK.levels) }, uLvC: { value: new THREE.Vector4(LOOK.cross[0], LOOK.cross[1], 0, 0) },
    uSheen: { value: new THREE.Vector4(LOOK.sheen, LOOK.sheenGain, 0, LOOK.hotGain) },
    uFall: { value: new THREE.Vector4(...LOOK.falloff, 0) },
    uCss: { value: new THREE.Vector2(1, 1) }, uFade: { value: v4() },
  };
  const mat = (fragmentShader, uniforms) => new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader, uniforms,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  const pass = (m) => { const s = new THREE.Scene(); const mesh = new THREE.Mesh(tri, m); mesh.frustumCulled = false; s.add(mesh); return s; };
  const glowScene = pass(mat(GLOW, glowU));
  const mainScene = pass(mat(MAIN, mainU));
  let rtA = null, rtB = null;

  /* ---------- the paper, measured from the DOM ---------- */
  const wrapEl = document.querySelector('.hero .wrap') || document.querySelector('.wrap');
  const heroEl = document.querySelector('.hero');
  const sealEl = document.querySelector('.hero-seal');
  const entryEls = Array.from(document.querySelectorAll('.hero, section.block[id], section.band'));
  const copyEls = Array.from(document.querySelectorAll('.stand, .cred-row, .sec-body > p, .vert p, .step p, .faq .a p, .band .attr, .cp-who, .contact-note, .ef-note, .vert-note, .posting p'));
  const formEl = document.getElementById('entryForm');
  const S = {
    cssW: 0, cssH: 0, dpr: 1, bufW: 0, bufH: 0, gw: 0, gh: 0,
    x0: 0, y0: 0, cell: 20, colL: 0, colR: 0, docW: 0, docH: 0, H: 80,
    entries: [], copy: [], seal: null, form: null,
    ox: 0, oy: 0, lastO: null, lastLamp: null, lastScroll: null, rest: { x: 0, y: 0 },
  };

  function measure() {
    const sy = scrollY;
    const wr = wrapEl.getBoundingClientRect(), ws = getComputedStyle(wrapEl);
    /* the column's rules are painted on the device pixels that enclose its box: register to those */
    const k = window.devicePixelRatio || 1;
    S.colL = Math.floor((wr.left + parseFloat(ws.paddingLeft)) * k + 0.01) / k;
    S.colR = Math.ceil((wr.right - parseFloat(ws.paddingRight)) * k - 0.01) / k;
    /* the column's two edges land on heavy lines: whole heavy cells across it, ~100px each */
    const span = S.colR - S.colL - 1;
    const heavy = Math.max(2, Math.round(span / 100));
    S.cell = span / (heavy * N);
    S.x0 = S.colL + 0.5;
    /* a heavy line rides the hero's top rule */
    S.y0 = (heroEl ? heroEl.getBoundingClientRect().top + sy : 0) + 0.5;
    S.docW = root.clientWidth;
    /* the page's own height, not scrollHeight: the canvas counts toward that, and would hold
       the page open after the content above it got shorter */
    S.docH = Math.max(document.body.offsetHeight, root.clientHeight);
    S.H = Math.min(96, Math.max(56, innerWidth * LOOK.height));
    /* each entry's heading: the lamp rests there, just inside the column's edge */
    S.entries = entryEls.map((el) => {
      const r = el.getBoundingClientRect();
      const a = el.querySelector('.sec-label') || el.querySelector('.kicker') || el;
      const ar = a.getBoundingClientRect();
      return { top: r.top + sy, x: S.colL + S.cell * 1.5, y: ar.top + sy + ar.height / 2 };
    });
    S.copy = copyEls.map((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? [r.left, r.top + sy, r.right, r.bottom + sy] : null;
    }).filter(Boolean);
    if (sealEl) {
      const r = sealEl.getBoundingClientRect();
      S.seal = r.width > 0 ? { x: r.left + r.width / 2, y: r.top + sy + r.height / 2, w: r.width } : null;
    }
    if (formEl) {
      const r = formEl.getBoundingClientRect();
      S.form = r.width > 0 ? [r.left, r.top + sy, r.right, r.bottom + sy] : null;
    }
  }

  /* the canvas is a window only as big as the light: the pool, its marks, and a margin for the wake.
     it is re-placed over the lamp on the paper, in whole memory texels, so the memory moves by whole texels */
  const margin = () => Math.max(56, 0.9 * S.H);
  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const half = Math.ceil((reach(1, LOOK.cross[0]) + 8 + margin()) / GS) * GS;
    const w = Math.max(GS, Math.min(2 * half, S.docW)), h = Math.max(GS, Math.min(2 * half, S.docH));
    if (w === S.cssW && h === S.cssH && dpr === S.dpr && rtA) return;
    S.cssW = w; S.cssH = h; S.dpr = dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    S.bufW = Math.floor(w * dpr); S.bufH = Math.floor(h * dpr);
    S.gw = Math.ceil(w / GS) + 1; S.gh = Math.ceil(h / GS) + 1;
    const opts = { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false };
    if (rtA) { rtA.dispose(); rtB.dispose(); }
    rtA = new THREE.WebGLRenderTarget(S.gw, S.gh, opts);
    rtB = new THREE.WebGLRenderTarget(S.gw, S.gh, opts);
    glowU.uGlowCss.value.set(S.gw * GS, S.gh * GS);
    mainU.uCss.value.set(w, h);
    S.lastO = null;   /* fresh buffers hold nothing to carry */
  }

  /* ---------- the lamp ---------- */
  const lamp = { x: innerWidth * 0.62, y: innerHeight * 0.32, vx: 0, vy: 0, tx: 0, ty: 0, mode: 'rest', I: reduced ? 1 : 0 };
  {
    /* start where the CSS lamp already is, so the hand-over doesn't jump */
    const lx = parseFloat(lampEl.style.getPropertyValue('--lx')), ly = parseFloat(lampEl.style.getPropertyValue('--ly'));
    if (isFinite(lx) && isFinite(ly)) { lamp.x = lx; lamp.y = ly; }
  }
  let tapUntil = 0, tapTimer = 0;
  const born = performance.now();

  /* between touches the lamp rests on the heading of the entry you're reading; once that heading
     has scrolled up out of the way it hangs at the top of the reading area and the paper slides under it */
  function restPoint(sy) {
    let i = 0;
    const line = sy + innerHeight * 0.42;
    for (let k = 0; k < S.entries.length; k++) if (S.entries[k].top <= line) i = k;
    const e = S.entries[i];
    if (!e) return;
    S.rest.x = e.x;
    S.rest.y = Math.min(innerHeight * 0.7, Math.max(innerHeight * 0.16, e.y - sy));
  }

  function spring(dt, w) {
    let t = dt;
    while (t > 1e-6) {
      const h = Math.min(t, 1 / 240); t -= h;
      lamp.vx += (w * w * (lamp.tx - lamp.x) - 2 * w * lamp.vx) * h;
      lamp.vy += (w * w * (lamp.ty - lamp.y) - 2 * w * lamp.vy) * h;
      lamp.x += lamp.vx * h; lamp.y += lamp.vy * h;
    }
    if (Math.abs(lamp.tx - lamp.x) + Math.abs(lamp.ty - lamp.y) < 0.08 && Math.abs(lamp.vx) + Math.abs(lamp.vy) < 2) {
      lamp.x = lamp.tx; lamp.y = lamp.ty; lamp.vx = lamp.vy = 0;
      return true;
    }
    return false;
  }

  /* how far out a level of light reaches on flat paper */
  function reach(I, th) {
    if (I <= th) return 0;
    const c = Math.cbrt(th / I), rho = S.H / c;
    return Math.sqrt(Math.max(0, rho * rho - S.H * S.H));
  }

  /* ---------- the frame ---------- */
  let raf = 0, last = 0, lost = false, glowMax = 0, wroteX = -1e9, wroteY = -1e9, hasPainted = false;
  /* the wake: where recent deposits are still visible (document css px), so the sheet only draws there */
  const wake = [];
  const kick = () => { if (!raf && !lost && !document.hidden) raf = requestAnimationFrame(frame); };

  function frame(now) {
    raf = 0;
    if (lost || document.hidden) return;
    try {
      const busy = step(now);
      if (busy) raf = requestAnimationFrame(frame); else last = 0;
    } catch (e) { shutdown(); }
  }

  function step(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    size();
    const sx = reduced ? 0 : scrollX, sy = reduced ? 0 : scrollY;
    const scrolled = S.lastScroll !== null && sy !== S.lastScroll;

    /* where the lamp wants to be */
    if (reduced) { restPoint(0); lamp.tx = lamp.x = S.rest.x; lamp.ty = lamp.y = S.rest.y; }
    else {
      restPoint(sy);
      if (lamp.mode === 'tap' && now > tapUntil) lamp.mode = 'rest';
      if (lamp.mode === 'rest') { lamp.tx = S.rest.x; lamp.ty = S.rest.y; }
    }
    const settled = reduced ? true : spring(dt, lamp.mode === 'pointer' ? 18 : 7);

    /* the lamp comes up after the headline has set */
    let fading = false;
    if (!reduced && lamp.I < 1) {
      const t = (now - born) / 1000;
      const k = Math.min(1, Math.max(0, (t - 0.9) / 1.1));
      lamp.I = k * k * (3 - 2 * k);
      fading = lamp.I < 1;
    }

    /* the CSS lamp follows the same light: one lamp */
    if (lamp.x !== wroteX || lamp.y !== wroteY) {
      lampEl.style.setProperty('--lx', lamp.x.toFixed(1) + 'px');
      lampEl.style.setProperty('--ly', lamp.y.toFixed(1) + 'px');
      wroteX = lamp.x; wroteY = lamp.y;
    }

    /* the window rides the paper under the lamp; on the paper, so the ruling can't swim against the text */
    const lx = lamp.x + sx, ly = lamp.y + sy;
    const ox = Math.min(Math.max(0, Math.round((lx - S.cssW / 2) / GS) * GS), Math.max(0, S.docW - S.cssW));
    const oy = Math.min(Math.max(0, Math.round((ly - S.cssH / 2) / GS) * GS), Math.max(0, S.docH - S.cssH));
    if (ox !== S.ox || oy !== S.oy || !hasPainted) canvas.style.transform = 'translate3d(' + ox + 'px,' + oy + 'px,0)';
    const shift = S.lastO === null ? null : { x: ox - S.lastO.x, y: oy - S.lastO.y };
    S.ox = ox; S.oy = oy;

    /* the lamp's path over the paper this frame, in canvas px (a jump of the page isn't a path) */
    const cur = { x: lx - ox, y: ly - oy };
    let from = S.lastLamp ? { x: S.lastLamp.x - ox, y: S.lastLamp.y - oy } : cur;
    if (Math.abs(from.x - cur.x) + Math.abs(from.y - cur.y) > innerHeight * 0.5) from = cur;
    const moved = Math.abs(from.x - cur.x) + Math.abs(from.y - cur.y) > 0.05 || fading || shift === null;
    const deposit = reduced ? 0 : lamp.I * LOOK.glow;
    const decay = Math.exp(-dt / LOOK.tau);
    const th = LOOK.cross[0] * 0.6;
    if (moved && deposit > th) {
      glowMax = deposit;
      /* the wake keeps a deposit for as long as it can still be seen (deposits go as the light squared) */
      const r = reach(1, Math.sqrt(th / deposit)) + 12;
      wake.push({
        x0: Math.min(from.x, cur.x) + ox - r, x1: Math.max(from.x, cur.x) + ox + r,
        y0: Math.min(from.y, cur.y) + oy - r, y1: Math.max(from.y, cur.y) + oy + r,
        until: now + LOOK.tau * Math.log(deposit / th) * 1000,
      });
    } else {
      glowMax = Math.max(0, glowMax * decay - FLOOR * 0.5);
    }
    while (wake.length && (wake[0].until < now || wake.length > 240)) wake.shift();

    draw(from, cur, shift || { x: 0, y: 0 }, decay, deposit);
    S.lastO = { x: ox, y: oy };
    S.lastLamp = { x: lx, y: ly };
    S.lastScroll = sy;
    hasPainted = true;

    if (reduced) return false;
    return !settled || fading || glowMax > 0 || scrolled;
  }

  function draw(from, cur, shift, decay, deposit) {
    const ox = S.ox, oy = S.oy, W = S.cssW, Hc = S.cssH;
    /* paper memory */
    glowU.uPrev.value = rtA.texture;
    glowU.uShift.value.set(shift.x, shift.y);
    glowU.uSeg.value.set(from.x, from.y, cur.x, cur.y);
    glowU.uLight.value.set(S.H, deposit, decay, FLOOR);
    const hits = (r) => r[2] > ox && r[0] < ox + W && r[3] > oy && r[1] < oy + Hc;
    const dist = (r) => Math.hypot((r[0] + r[2]) / 2 - ox - cur.x, (r[1] + r[3]) / 2 - oy - cur.y);
    const rects = S.copy.filter(hits).sort((a, b) => dist(a) - dist(b)).slice(0, MAX_RECTS);
    rects.forEach((r, i) => glowU.uRects.value[i].set(r[0] - ox, r[1] - oy, r[2] - ox, r[3] - oy));
    glowU.uRectN.value = rects.length;
    if (S.seal && root.classList.contains('gl')) {
      glowU.uSeal.value.set(S.seal.x - ox, S.seal.y - oy, S.seal.w * 0.45, 1);
      glowU.uBench.value.set(S.seal.x - ox, S.seal.y - oy + S.seal.w * 0.5, S.seal.w * 0.95, S.seal.w * 0.3);
    } else glowU.uSeal.value.set(0, 0, 0, 0);
    if (S.form && hits(S.form)) {
      glowU.uForm.value.set(S.form[0] - ox, S.form[1] - oy, S.form[2] - ox, S.form[3] - oy);
      glowU.uFormK.value = LOOK.form;
    } else glowU.uFormK.value = 0;
    renderer.setRenderTarget(rtB);
    renderer.render(glowScene, camera);
    renderer.setRenderTarget(null);
    const t = rtA; rtA = rtB; rtB = t;

    /* the sheet, only where light can reach */
    const kx = S.bufW / W, ky = S.bufH / Hc;
    mainU.uGlow.value = rtA.texture;
    mainU.uScale.value.set(kx, ky);
    mainU.uBufH.value = S.bufH;
    mainU.uOrigin.value.set(ox, oy);
    mainU.uGrid.value.set(S.x0, S.y0, S.cell, N);
    mainU.uLamp.value.set(cur.x, cur.y, S.H, lamp.I);
    /* a groove is two device pixels (two walls, one css px) wherever there is room for them */
    mainU.uWidth.value.set(kx >= 1.5 ? 2 : 1, 0, Math.round(5 * kx), 0);
    /* the window's inner edges fade, so a wake it can't hold leaves softly; edges on the page's own edge don't */
    const f = Math.min(64, margin());
    mainU.uFade.value.set(ox > 0 ? f : 0, oy > 0 ? f : 0, ox + W < S.docW ? f : 0, oy + Hc < S.docH ? f : 0);

    const r = reach(lamp.I, LOOK.cross[0] * 0.6) + 12;
    let x0 = cur.x - r, x1 = cur.x + r, y0 = cur.y - r, y1 = cur.y + r;
    if (lamp.I <= 0) { x0 = y0 = 1e9; x1 = y1 = -1e9; }
    for (const w of wake) {
      x0 = Math.min(x0, w.x0 - ox); x1 = Math.max(x1, w.x1 - ox);
      y0 = Math.min(y0, w.y0 - oy); y1 = Math.max(y1, w.y1 - oy);
    }
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(Hc, Math.ceil(y1));
    renderer.setScissorTest(true);
    if (x1 > x0 && y1 > y0) renderer.setScissor(x0, Hc - y1, x1 - x0, y1 - y0);
    else renderer.setScissor(0, 0, 1, 1);   /* still draw: an untouched canvas would keep its last picture */
    renderer.render(mainScene, camera);
    renderer.setScissorTest(false);
  }

  /* ---------- hand-over and teardown ---------- */
  function shutdown() {
    lost = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    root.classList.remove('sheet', 'sheet-still');   /* the inline lamp takes the light back */
  }
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); shutdown(); }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    try {
      rtA = rtB = null;   /* their GL objects went with the old context: let them go, don't delete them */
      S.cssW = 0; lost = false; hasPainted = false;
      root.classList.add('sheet');
      if (reduced) root.classList.add('sheet-still');
      kick();
    } catch (e) { shutdown(); }
  }, false);

  root.classList.add('sheet');
  if (reduced) root.classList.add('sheet-still');
  measure();
  size();
  lamp.tx = lamp.x; lamp.ty = lamp.y;

  const relayout = () => { if (lost) return; measure(); kick(); };
  addEventListener('resize', relayout, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(document.body);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout, () => {});
  document.addEventListener('visibilitychange', () => { last = 0; kick(); });
  addEventListener('pageshow', () => { last = 0; kick(); });

  if (!reduced) {
    addEventListener('scroll', kick, { passive: true });
    /* the pointer carries the lamp */
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      lamp.mode = 'pointer'; lamp.tx = e.clientX; lamp.ty = e.clientY; kick();
    }, { passive: true });
    /* when it leaves, the lamp settles back on the entry you're reading */
    const leave = () => { if (lamp.mode === 'pointer') { lamp.mode = 'rest'; kick(); } };
    root.addEventListener('pointerleave', leave, { passive: true });
    document.addEventListener('mouseleave', leave, { passive: true });
    document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) leave(); }, { passive: true });
    /* no cursor: the lamp rests on the heading you're reading and the paper slides beneath it;
       a tap carries it to what you touched, then it drifts back */
    let down = null;
    document.addEventListener('pointerdown', (e) => {
      down = e.pointerType === 'touch' && e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    }, { passive: true });
    document.addEventListener('pointercancel', () => { down = null; }, { passive: true });
    document.addEventListener('pointerup', (e) => {
      if (!down || e.pointerType !== 'touch') return;
      const d = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 600;
      down = null;
      if (d > 12 || !quick) return;
      lamp.mode = 'tap'; lamp.tx = e.clientX; lamp.ty = e.clientY;
      tapUntil = performance.now() + 2600;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(kick, 2650);
      kick();
    }, { passive: true });
  }
  kick();
}

try { boot(); } catch (e) {
  /* anything unexpected: hand the lamp back and stay out of the way */
  root.classList.remove('sheet', 'sheet-still');
}
