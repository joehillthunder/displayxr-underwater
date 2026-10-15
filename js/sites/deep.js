// 08 Deep Sea & Vents: East Pacific Rise. In a submersible with headlights, from the twilight zone
// (lanternfish) down through the midnight zone (vampire squid, giant squid, gulper eel, anglerfish)
// to a hydrothermal vent field: black smokers, giant tube worms, a dumbo octopus, marine snow.
// The depth gauge is squeezed: 600 m at the top of the volume, 2,500 m at the vents.

import { THREE, fbm, clamp, smooth, around } from './common.js';
import * as G from '../models.js';
import { TIME } from '../models.js';

const TOP = -4, FLOOR = -62;
const SMOKERS = [[0, -8], [-5, -14], [6, -16]];

export const env = {
  fog: '#020a16', density: 0.04, top: '#04122a', bottom: '#000000', sunGlow: '#000000',
  hemiSky: '#2a3a5a', hemiGround: '#000000', hemi: 0.35, light: 0, ambient: 0.05,
  surface: null, rays: 0, caustics: 0,
  particles: { color: '#e8eef0', size: 2.6, count: 2600, fall: 0.12, opacity: 0.55 },
  lamp: 1.4, sub: true, exposure: 1.3, bubbles: false,
  lightAt: (d) => (d < 1000 ? 0.5 : 0), // a trace of blue twilight above 1,000 m, then none
  tempAt: (p) => {
    let k = 0;
    for (const [x, z] of SMOKERS) k = Math.max(k, Math.exp(-((p.x - x) ** 2 + (p.z - z) ** 2 + (p.y - FLOOR - 3) ** 2) / 18));
    return 2 + k * 23;
  },
  edgeText: 'Sonar shows nothing but open water that way. Stay near the vents.',
};

const height = (x, z) => {
  const ridgeLine = -Math.abs(x * 0.15) * 0.8; // the rift valley
  return FLOOR + 2 + ridgeLine + fbm(x * 0.05, z * 0.05, 4) * 3 + fbm(x * 0.3, z * 0.3, 2) * 0.4;
};

export function build(ctx) {
  const r = ctx.r;
  ctx.caustics = false;
  const basalt = new THREE.Color('#22232a'), glass = new THREE.Color('#3a3a44'), mat = new THREE.Color('#d8d0a0');
  ctx.floor({
    size: 160, seg: 130, height,
    paint: (x, z, y, out) => {
      out.copy(basalt).lerp(glass, fbm(x * 0.4, z * 0.4) * 0.5 + 0.5);
      let v = 0;
      for (const [sx, sz] of SMOKERS) v = Math.max(v, 1 - Math.hypot(x - sx, z - sz) / 7);
      if (v > 0 && fbm(x * 0.7, z * 0.7, 2) > 0.1 - v * 0.4) out.lerp(mat, clamp(v * 1.2, 0, 0.8)); // bacterial mats
    },
  });
  ctx.scatter(G.rockGeo({ color: '#202128', color2: '#3a3a42', seed: 9, flat: 0.8 }), {}, 80, () => { const [x, z] = around(r, 2, 55); return { x, y: height(x, z) - 0.3, z, s: 0.5 + r() * 2.5, ry: r() * 6 }; });
  ctx.depthAt = (y) => 600 + clamp((TOP - y) / (TOP - FLOOR), 0, 1.05) * 1900;

  // Black smokers: rough chimneys belching black, mineral-rich water.
  const chim = new G.Parts();
  for (let i = 0; i < 9; i++) {
    const y = i * 0.7, rr = 0.75 - i * 0.06;
    G.ball(chim, rr, (x, yy, z, out) => out.set('#2a2622').lerp(new THREE.Color('#6a4a2a'), clamp(Math.sin(x * 9 + yy * 5) * 0.5, 0, 1) * 0.5), Math.sin(i * 2.1) * 0.12, y, Math.cos(i * 1.7) * 0.12, 1, 0.9, 1, 0, 9);
  }
  G.ball(chim, 0.22, '#ffb060', 0, 6.2, 0, 1, 0.3, 1, 0.8, 8);
  const chimGeo = chim.build();
  const smokeTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(20,18,16,0.9)');
    gr.addColorStop(1, 'rgba(20,18,16,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  SMOKERS.forEach(([x, z], i) => {
    const y = height(x, z) - 0.3;
    const s = 1 + (i === 0 ? 0.5 : 0);
    ctx.prop(chimGeo, { caustics: false }, x, y, z, { s });
    // The plume: soft dark puffs rising and spreading.
    const N = 70;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let k = 0; k < N; k++) seed[k] = k / N;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: TIME, uMap: { value: smokeTex }, uBase: { value: new THREE.Vector3(x, y + 6.3 * s, z) } },
      vertexShader: `attribute float seed; uniform float uTime; uniform vec3 uBase; varying float vA;
        void main() {
          float t = fract(seed + uTime * 0.12);
          vec3 p = uBase + vec3(sin(seed * 40.0 + uTime) * t * 1.5, t * 14.0, cos(seed * 31.0 + uTime * 0.8) * t * 1.5);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = (1.0 - t) * smoothstep(0.0, 0.06, t);
          gl_PointSize = (40.0 + t * 260.0) / max(-mv.z, 0.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D uMap; varying float vA; void main() { vec4 c = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(c.rgb, c.a * vA * 0.8); }`,
      transparent: true, depthWrite: false,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    ctx.group.add(pts);
    ctx.find('smoker', [x, y + 3.5 * s, z], 1.6 * s);
    // Giant tube worms crowd around each vent.
    const wy = height(x + 2.2, z + 1);
    ctx.prop(G.tubeWormsGeo({ seed: 11 + i, n: 26, spread: 0.9 }), { mode: 'sway', amp: 0.05, freq: 0.7, len: 2, caustics: false }, x + 2.2, wy - 0.05, z + 1);
    ctx.find('tubeworm', [x + 2.2, wy + 1, z + 1], 1.3);
    const wy2 = height(x - 1.8, z - 1.5);
    ctx.prop(G.tubeWormsGeo({ seed: 21 + i, n: 18, spread: 0.7 }), { mode: 'sway', amp: 0.05, freq: 0.8, len: 2, caustics: false }, x - 1.8, wy2 - 0.05, z - 1.5);
  });
  ctx.light('#ff9a50', 3, 8, SMOKERS[0][0], height(...SMOKERS[0]) + 1.5, SMOKERS[0][1]);

  // White vent crabs scuttling around.
  const crab = G.crabGeo({ r: 0.07, color: '#e8e4dc' });
  for (let i = 0; i < 8; i++) {
    const [sx, sz] = SMOKERS[i % 3];
    const [dx, dz] = around(r, 1, 4);
    ctx.swimmer(crab, { mode: 'none' }, { behave: 'crawl', home: [sx + dx, height(sx + dx, sz + dz), sz + dz], range: 2.5, speed: 0.12, turn: 1.5, lift: 0.05 });
  }

  // Lanternfish in the twilight zone, photophores glowing.
  const lantern = G.fishGeo({ len: 0.12, h: 0.24, w: 0.13, tail: 'fork', dorsal: [0.4, 0.6, 0.07], top: '#2a3240', belly: '#8a9aa8', finColor: '#3a4250', eye: 0.07, photophores: '#6ad8ff', rough: 0.4 });
  for (const [x, y, z] of [[0.5, -8, 2], [8, -14, -6]]) {
    const s = ctx.school(lantern, { mode: 'fish', freq: 13, amp: 0.1, glow: 1.4, metal: 0.4, rough: 0.35 }, { count: 60, radius: 3, flat: 0.5, home: [x, y, z], range: 8, yMin: y - 3, yMax: y + 3, speed: 0.5, clear: 4, avoid: 2.2 });
    ctx.find('lantern', s, 3);
  }

  // Vampire squid: deep red, webbed cape, big glowing blue eyes.
  const vamp = G.octopusGeo({ r: 0.13, color: '#5a0a18', color2: '#8a2030', web: '#3a0612', iris: '#5af0ff', eyeGlow: 1.5, arm: 2.2, curl: 0.3 });
  const vs = ctx.swimmer(vamp, { mode: 'pulse', freq: 1.4, amp: 0.12 }, { behave: 'drift', home: [-4, -26, -2], range: 3, bob: 1.5, tilt: 0.3 }, { scale: 1.6 });
  ctx.find('vampire', vs, 0.7);

  // Giant squid, cruising the dark.
  const gsq = G.squidGeo({ len: 7, color: '#a83a26', belly: '#e08a6a', eye: 0.025, tentacle: 1.2, arm: 0.35 });
  const gs = ctx.swimmer(gsq, { mode: 'fish', freq: 1.2, amp: 0.04 }, { behave: 'circle', home: [2, -24, -10], range: 15, speed: 1.0, bob: 3, clear: 4 });
  ctx.find('giantsquid', gs, 2.8);

  // Gulper eel: a whip of a body behind an enormous mouth, tail tip glowing.
  const gulp = G.eelGeo({ len: 1.3, w: 0.03, h: 0.035, top: '#0e0e10', belly: '#1e1e22', mouth: 0.2, tipGlow: '#ff4a9a', eye: 0.012 });
  const gu = ctx.swimmer(gulp, { mode: 'fish', freq: 3, amp: 0.12, glow: 1.5 }, { home: [6, -34, 0], range: 6, yMin: -38, yMax: -30, speed: 0.4, turn: 0.8, clear: 4 }, { scale: 1.4 });
  ctx.find('gulper', gu, 0.9);

  // Anglerfish: black, toothy, with a glowing lure.
  const angler = G.fishGeo({ len: 0.3, h: 0.72, w: 0.6, peak: 0.7, blunt: 0.4, tail: 'round', tailSize: 0.2, dorsal: [0.15, 0.3, 0.08], pect: 0.1, eye: 0.025, top: '#16120e', belly: '#2a221a', finColor: '#1a1612', teeth: true, lure: '#a8fff4' });
  const an = ctx.swimmer(angler, { mode: 'fish', freq: 3, amp: 0.06, glow: 1.6 }, { behave: 'hover', home: [-6, -44, -8], range: 2, yMin: -46, yMax: -42, speed: 0.15, turn: 0.8, clear: 3 }, { scale: 1.6 });
  ctx.find('angler', an, 0.6);
  const lureLight = new THREE.PointLight('#9afff0', 0.6, 2.5, 2);
  lureLight.position.set(0, 0.36 * 0.3, 0.5 * 0.3);
  an.add(lureLight);
  ctx.tick((dt, t) => { an.material.userData.u.uGlow.value = 1.3 + Math.sin(t * 3) * 0.5 + (Math.sin(t * 17) > 0.95 ? 0.8 : 0); });

  // Dumbo octopus flapping its ear fins over the vent field.
  const dumbo = G.octopusGeo({ r: 0.12, color: '#e8907a', color2: '#f8c0a0', web: '#e89a80', ears: true, arm: 1.5, curl: 0.2 });
  const db = ctx.swimmer(dumbo, { mode: 'pulse', freq: 1.8, amp: 0.1 }, { behave: 'drift', home: [4, FLOOR + 6, -4], range: 4, bob: 1.2, tilt: 0.2 }, { scale: 1.6 });
  ctx.find('dumbo', db, 0.6);

  // Marine snow: the white flakes everywhere. Aim at a thick patch of it.
  for (const [x, y, z] of [[0, -8, 4], [-3, -18, -2], [5, -30, -4], [-2, -50, -6]]) ctx.find('snow', [x, y, z], 1.6);

  // Bioluminescent sparks: comb jellies drifting, flashing blue (no fact card; just beauty).
  const comb = G.jellyGeo({ r: 0.06, tall: 1.4, color: '#c8e8ff', rim: '#6ac8ff', tentacles: 0, glow: 1.2 });
  for (let i = 0; i < 10; i++) {
    const [x, z] = around(r, 2, 20);
    ctx.swimmer(comb, { mode: 'pulse', freq: 2, amp: 0.05, opacity: 0.7, glow: 1.5 }, { behave: 'drift', home: [x, (i < 4 ? -6 : -10) - r() * (i < 4 ? 4 : 40), z], range: 2, bob: 1 }, { scale: 2 });
  }

  ctx.start = { pos: [0, -7, 10], yaw: 0, pitch: -0.15 };
  ctx.bounds = { r: 45, yMin: FLOOR - 4, yMax: -2 };
  ctx.tour = [[0, -7, 10], [-6, -14, 2], [6, -24, -6], [-4, -34, -2], [-6, -44, -4], [2, FLOOR + 7, 0], [8, FLOOR + 5, -12], [-6, FLOOR + 6, -16]];
}
