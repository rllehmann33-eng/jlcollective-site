// Prototype A — "The Machined Seal"
// The J2 seal as two real metals under a lamp that follows the pointer, casting a shadow onto the drafting sheet.
import { THREE, C, setup, buildSeal, worldAtNDC, pxPerUnit, ease, clamp01, reduced, isNarrow, bandCentreY, canHover } from './common.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const app = setup();
if (app) {
  const { renderer, pointer, size, onResize, start } = app;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);

  // environment: procedural room, so the metals have something to reflect (no downloads)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.42;
  scene.environmentRotation.set(0, Math.PI * 0.35, 0);

  // materials — two metals
  const matBrass = new THREE.MeshPhysicalMaterial({
    color: 0xC9A768, metalness: 1, roughness: 0.34,
    anisotropy: 0.55, anisotropyRotation: Math.PI / 2, clearcoat: 0.12, clearcoatRoughness: 0.5,
  });
  const matCream = new THREE.MeshPhysicalMaterial({
    color: 0xE9E3D6, metalness: 0.92, roughness: 0.28,
    anisotropy: 0.35, clearcoat: 0.08, clearcoatRoughness: 0.4,
  });

  const seal = buildSeal({ depth: 0.07, bevel: 0.014, letterDepth: 0.075, letterBevel: 0.007, matBrass, matCream });
  // the ring is brushed around its circumference: rotate anisotropy per-part is not possible, but the ring reads brushed enough
  const rig = new THREE.Group();     // placement (position, aspect)
  const tilt = new THREE.Group();    // pointer-driven tilt + idle
  tilt.add(seal); rig.add(tilt); scene.add(rig);

  // shadow catcher: shows the seal's shadow on the CSS drafting sheet behind
  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.55, color: 0x000000 }));
  catcher.receiveShadow = true; catcher.position.z = -0.35; scene.add(catcher);

  // the lamp
  const lamp = new THREE.SpotLight(0xFFF0D2, 0, 12, 0.62, 0.9, 1.6);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.bias = -0.00035; lamp.shadow.normalBias = 0.02; lamp.shadow.radius = 4;
  lamp.shadow.camera.near = 0.5; lamp.shadow.camera.far = 14;
  scene.add(lamp); scene.add(lamp.target);
  // cool rim from the upper left, so the far edges of the letters still read against navy
  const rim = new THREE.DirectionalLight(0xB9C9E8, 0.55); rim.position.set(-3, 3, 1.5); scene.add(rim);
  const fill = new THREE.HemisphereLight(0x8A94A8, 0x0A121F, 0.35); scene.add(fill);

  // post: bloom only where brass really flares
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.45, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // placement: seal centred at (72%, 40%) of the hero, diameter min(44vw, 440px); narrow screens tuck it upper-right
  const anchor = new THREE.Vector3();
  function place() {
    camera.aspect = size.w / size.h; camera.updateProjectionMatrix();
    composer.setSize(size.w, size.h);
    bloom.resolution.set(size.w, size.h);
    const narrow = isNarrow();
    const px = narrow ? 0.5 : 0.81, py = narrow ? bandCentreY(size.w, size.h) : 0.44;
    const diamPx = narrow ? size.w * 0.56 : Math.min(size.w * 0.44, 440);
    // world diameter of the seal is ~1.6 (ring r .75 + stroke) — scale rig so it renders at diamPx
    // static lamp on phones / no-hover: above-left of the seal
    if (narrow || !canHover) {
      pointer.tx = pointer.x = (px * 2 - 1) - 0.55; pointer.ty = pointer.y = (1 - py * 2) + 0.55;
      // keep the CSS sheet's lamp on the same spot as the 3D lamp
      app.hero.style.setProperty('--mx', ((pointer.x + 1) * 50).toFixed(1) + '%'); app.hero.style.setProperty('--my', ((1 - pointer.y) * 50).toFixed(1) + '%');
    }
    worldAtNDC(camera, px * 2 - 1, 1 - py * 2, new THREE.Vector3(0, 0, 0), anchor);
    rig.position.copy(anchor);
    const s = diamPx / (1.6 * pxPerUnit(camera, anchor, size.h));
    rig.scale.setScalar(s);
    catcher.position.z = -0.35 * s;
  }
  onResize(place);

  // intro
  const T0 = performance.now() / 1000;
  const lampWorld = new THREE.Vector3(), tmp = new THREE.Vector3();
  const introLen = reduced ? 0 : 1.9;

  start((t) => {
    // — intro: the seal comes up out of the sheet and settles
    const k = introLen ? clamp01((performance.now() / 1000 - T0) / introLen) : 1;
    const e = ease.outQuint(k);
    const s = rig.scale.x;
    tilt.position.z = (0.9 - 0.9 * e) * -1;                 // from behind the sheet plane forward to 0
    tilt.rotation.y = (1 - e) * -1.1;                       // swings in from the side
    tilt.rotation.z = (1 - e) * 0.25;
    seal.position.z = 0.02;
    lamp.intensity = 9 * (s * s) / (1.1 * 1.1) * ease.outCubic(clamp01((k - 0.15) / 0.6));
    if (k >= 1 && !reduced) {
      // idle: slow breathe + tilt toward the pointer
      tilt.rotation.x += ((-pointer.y * 0.16 + Math.sin(t * 0.55) * 0.02) - tilt.rotation.x) * 0.06;
      tilt.rotation.y += ((pointer.x * 0.22 + Math.cos(t * 0.42) * 0.02) - tilt.rotation.y) * 0.06;
      tilt.position.y = Math.sin(t * 0.7) * 0.012;
    }
    // — the lamp lives above the sheet at the pointer, aimed at the seal
    worldAtNDC(camera, pointer.x, pointer.y, anchor, lampWorld);
    lampWorld.z += 3.7 * s;
    lamp.position.copy(lampWorld);
    lamp.target.position.copy(anchor);
    lamp.distance = 14;
    // brass reads best when the light rakes: nudge lamp slightly toward camera as it nears the seal
    composer.render();
  });
}
