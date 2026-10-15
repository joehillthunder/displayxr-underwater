// 03 Under the Arctic Ice: Lancaster Sound. A ceiling of sea ice with pressure-ridge keels and
// breathing holes where sunlight pours in. Narwhals and belugas pass, ringed seals and a polar bear
// use the holes, Arctic cod hide under the ice, a Greenland shark cruises below, sea angels drift,
// and a rubber duck is frozen into the ice.

import { THREE, fbm, clamp, smooth, around } from './common.js';
import * as G from '../models.js';

export const env = {
  fog: '#1d5a7e', density: 0.034, top: '#cfeeff', bottom: '#041a2c', sunGlow: '#ffffff',
  hemiSky: '#cfefff', hemiGround: '#1a3048', hemi: 1.0, light: 0.9, ambient: 0.18, sunColor: '#e8f6ff',
  surface: 0, surfaceSky: '#f4fbff', surfaceMirror: '#1a4a66',
  rays: 1.1, rayCenter: [0, -6], rayTop: 0, caustics: 0.25, causticFade: 10, lightDepth: 14,
  particles: { color: '#ffffff', size: 1.5, count: 1600, fall: 0.015, opacity: 0.4 },
  exposure: 1.0, edgeText: 'The ice goes on for kilometres. Head back toward the light.',
};

// Breathing holes: x, z, radius. The first is the big lead the bear and the sun come through.
const HOLES = [[0, -6, 5.5], [-22, 14, 2.2], [24, 18, 1.6], [18, -26, 2.4], [-30, -20, 1.8]];
const holeOpen = (x, z) => {
  let o = 0;
  for (const [hx, hz, r] of HOLES) o = Math.max(o, 1 - smooth(r * 0.75, r * 1.25, Math.hypot(x - hx, z - hz)));
  return o;
};
const iceAt = (x, z) => {
  const keel = Math.max(0, 1 - Math.abs(fbm(x * 0.02 + 5, z * 0.02, 3)) * 7) * 3.5; // pressure ridges
  const ice = -1.4 - fbm(x * 0.08, z * 0.08, 3) * 0.6 - keel;
  return ice + (0.4 - ice) * holeOpen(x, z);
};
const height = (x, z) => -36 + x * 0.22 + fbm(x * 0.03, z * 0.03, 4) * 4;

export function build(ctx) {
  const r = ctx.r;
  const mud = new THREE.Color('#4a5560'), stone = new THREE.Color('#6a7078');
  ctx.floor({ size: 180, seg: 110, height, caustics: false, paint: (x, z, y, out) => out.copy(mud).lerp(stone, fbm(x * 0.2, z * 0.2) * 0.5 + 0.5) });
  ctx.scatter(G.rockGeo({ color: '#505860', color2: '#7a8088' }), { caustics: false }, 50, () => { const [x, z] = around(r, 2, 60); return { x, y: height(x, z) - 0.3, z, s: 0.5 + r() * 2, ry: r() * 6 }; });

  const ice = new THREE.Color('#d6ecf6'), blue = new THREE.Color('#8fc4e0'), algae = new THREE.Color('#8a7a3a');
  const roof = ctx.ceiling({
    size: 180, seg: 140, height: iceAt,
    paint: (x, z, y, out) => {
      out.copy(ice).lerp(blue, clamp(-(y + 1.4) / 3, 0, 1));
      const a = fbm(x * 0.15 + 2, z * 0.15, 3);
      if (a > 0.15 && y > -2.5) out.lerp(algae, clamp((a - 0.15) * 2.5, 0, 0.7)); // ice algae
    },
  });
  roof.material.emissive.set('#5f95b8');
  roof.material.emissiveIntensity = 0.55;
  roof.material.roughness = 0.4;
  for (const [x, z] of [[6, 4], [-10, -2], [3, 14]]) ctx.find('icealgae', [x, iceAt(x, z) - 0.2, z], 1.6);
  ctx.depthAt = (y) => Math.max(0, -y);

  // Narwhals: a little pod passing under the ice.
  const narwhal = G.mammalGeo({
    len: 4.2, w: 0.2, h: 0.2, peak: 0.6, blunt: 0.5, fluke: 0.13, pect: 0.07, pectZ: 0.76, eye: 0.008,
    paint: (t, u, s, out) => { out.set('#8a8e92').lerp(new THREE.Color('#e4e4e0'), clamp(-u + 0.2 + (1 - t) * 0.2, 0, 1)); if (Math.sin(t * 90 + s * 7) * Math.sin(u * 17) > 0.6) out.multiplyScalar(0.55); },
    extra: (p, len) => {
      const tusk = new THREE.ConeGeometry(0.03 * len * 0.4, 0.5 * len, 8, 6);
      tusk.deleteAttribute('uv');
      const pos = tusk.attributes.position;
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const a = y * 24; pos.setX(i, pos.getX(i) * (1 + 0.15 * Math.sin(a))); }
      tusk.rotateX(Math.PI / 2);
      p.add(tusk, '#efe6cc', { m: G.at(-0.02 * len, 0.01 * len, 0.74 * len) });
    },
  });
  for (let i = 0; i < 3; i++) {
    const n = ctx.swimmer(narwhal, { mode: 'whale', freq: 1.6, amp: 0.06 }, { behave: 'circle', home: [-4 + i * 1.5, -9 - i * 1.4, -4], range: 20 + i * 2.5, speed: 1.3, bob: 1, clear: 3, oval: 0.8 }, { scale: i === 2 ? 0.8 : 1 });
    n.userData.swimmer.angle = i * 0.35;
    ctx.find('narwhal', n, 2.2);
  }

  // Belugas: white, with a bulging melon and no dorsal fin.
  const beluga = G.mammalGeo({
    len: 4.4, w: 0.25, h: 0.24, peak: 0.6, blunt: 0.45, fluke: 0.12, pect: 0.08, pectZ: 0.78, eye: 0.009, top: '#f2f2ec', belly: '#ffffff', finColor: '#e8e8e0',
    extra: (p, len) => G.ball(p, 0.1 * len, '#f8f8f4', 0, 0.03 * len, 0.41 * len, 1, 0.85, 0.9, 0, 14),
  });
  for (let i = 0; i < 2; i++) {
    const b = ctx.swimmer(beluga, { mode: 'whale', freq: 1.5, amp: 0.07 }, { home: [10, -10, -10 + i * 6], range: 22, yMin: -14, yMax: -5, speed: 1.0, turn: 0.5, clear: 3, curious: i === 0 });
    ctx.find('beluga', b, 2.2);
  }

  // Ringed seals near the holes, curious about the diver.
  const sealGeo = G.mammalGeo({
    len: 1.4, w: 0.26, h: 0.24, flukes: 'seal', fluke: 0.12, pect: 0.08, pectZ: 0.74, eye: 0.025,
    paint: (t, u, s, out) => { out.set('#5a5e60').lerp(new THREE.Color('#b8bcbc'), clamp(-u + 0.2, 0, 1)); const k = Math.sin(t * 40 + s * 3) * Math.sin(u * 12 + t * 9); if (k > 0.5 && k < 0.75) out.set('#d8dcdc'); },
  });
  for (const [hx, hz] of [[-22, 14], [18, -26]]) {
    const s = ctx.swimmer(sealGeo, { mode: 'fish', freq: 3, amp: 0.1 }, { home: [hx, -4, hz], range: 9, yMin: -8, yMax: -1, speed: 1.1, clear: 1, curious: true });
    ctx.find('ringed', s, 1.0);
  }

  // A polar bear swimming in the big lead, paddling with its front paws.
  const bearP = new G.Parts();
  G.ball(bearP, 0.5, '#f2ead6', 0, 0, 0, 0.75, 0.7, 1.6, 0, 16);
  G.ball(bearP, 0.22, '#f2ead6', 0, 0.12, 0.9, 1, 0.95, 1.3, 0, 12);
  G.ball(bearP, 0.07, '#111', 0, 0.12, 1.18, 1, 1, 1, 0, 6);
  for (const s of [-1, 1]) {
    G.ball(bearP, 0.06, '#e8e0cc', s * 0.12, 0.3, 0.86, 1, 1, 0.6, 0, 6);
    G.ball(bearP, 0.025, '#111', s * 0.09, 0.2, 1.08, 1, 1, 1, 0, 6);
    G.rod(bearP, 0.11, 0.09, 0.7, '#ece4d0', G.at(s * 0.25, -0.15, 0.45, Math.PI * 0.75, 0, 0), 8);
    G.rod(bearP, 0.1, 0.08, 0.6, '#ece4d0', G.at(s * 0.22, -0.15, -0.55, Math.PI * 0.85, 0, 0), 8);
  }
  const bear = ctx.swimmer(bearP.build(), { mode: 'fish', freq: 2.2, amp: 0.05 }, { behave: 'surface', home: [0, 0, -6], range: 2.8, speed: 0.35, turn: 0.4, float: 0.3, bob: 0.08, surfaceY: 0 }, { scale: 1.15 });
  ctx.find('bear', bear, 1.4);

  // Arctic cod tucked under the ice.
  const cod = G.fishGeo({ len: 0.22, h: 0.2, w: 0.13, tail: 'fork', dorsal: [0.3, 0.75, 0.06], anal: [0.2, 0.5, 0.05], top: '#6a6450', belly: '#d8d4c4', finColor: '#7a7460', eye: 0.05 });
  for (const [x, z] of [[8, -2], [-12, 4]]) {
    const top = iceAt(x, z);
    const sc = ctx.school(cod, { mode: 'fish', freq: 11, amp: 0.1 }, { count: 30, radius: 2, flat: 0.4, home: [x, top - 1.2, z], range: 6, yMin: top - 2, yMax: top - 0.6, speed: 0.4, clear: 0.6, avoid: 2 });
    ctx.find('cod', sc, 2.2);
  }

  // A Greenland shark, slow and ancient, down in the gloom.
  const gshark = G.fishGeo({
    len: 4.2, h: 0.18, w: 0.18, peak: 0.55, blunt: 0.45, tail: 'shark', tailSize: 0.16, dorsal: [0.38, 0.48, 0.04], pect: 0.09, pectZ: 0.68, eye: 0.006, top: '#4a4842', belly: '#6a6860', finColor: '#3e3c36',
    paint: (t, u, s, out) => { out.set('#4e4b44').lerp(new THREE.Color('#6a665c'), clamp(-u, 0, 1)); if (Math.sin(t * 120 + s * 11) * Math.sin(u * 23) > 0.7) out.multiplyScalar(0.7); },
  });
  const gs = ctx.swimmer(gshark, { mode: 'fish', freq: 1.0, amp: 0.05 }, { behave: 'circle', home: [8, -20, 6], range: 16, speed: 0.4, bob: 2, clear: 2.5 });
  ctx.find('greenland', gs, 2.4);

  // Sea angels: tiny, see-through, flapping.
  const angelP = new G.Parts();
  G.ball(angelP, 0.012, '#e8f4ff', 0, 0.01, 0, 0.7, 1.8, 0.7, 0.4, 8);
  G.ball(angelP, 0.007, '#ff7a2a', 0, 0.004, 0, 1, 1.4, 1, 1.5, 6);
  for (const s of [-1, 1]) G.fin(angelP, [[0, 0], [s * 0.025, 0.012], [s * 0.03, -0.004], [s * 0.006, -0.008]], '#d8ecff', 'xy', G.at(0, 0.018, 0), 0.4);
  const angelGeo = angelP.build();
  for (let i = 0; i < 8; i++) {
    const [x, z] = around(r, 2, 14);
    const a = ctx.swimmer(angelGeo, { mode: 'flap', freq: 9, amp: 0.6, span: 0.03, span0: 0.004, opacity: 0.8 }, { behave: 'drift', home: [x, -3 - r() * 4, z + 6], range: 1.5, bob: 0.6 }, { scale: 3 });
    ctx.find('angel', a, 0.35);
  }

  // The rubber duck, frozen into the underside of the ice.
  const duckP = new G.Parts();
  G.ball(duckP, 0.05, '#ffd21a', 0, 0, 0, 1.1, 0.8, 1.3, 0.15, 12);
  G.ball(duckP, 0.032, '#ffd21a', 0, 0.045, 0.04, 1, 1, 1, 0.15, 10);
  G.ball(duckP, 0.015, '#ff7a10', 0, 0.04, 0.075, 1.4, 0.5, 1.2, 0.1, 8);
  for (const s of [-1, 1]) G.ball(duckP, 0.006, '#111', s * 0.018, 0.055, 0.06, 1, 1, 1, 0, 6);
  const dx = 27, dz = -6;
  const duck = ctx.prop(duckP.build(), { caustics: false }, dx, iceAt(dx, dz) - 0.1, dz, { s: 1.6, rz: 0.25, ry: 2 });
  ctx.find('duck', duck, 0.4);

  ctx.start = { pos: [0, -6, 12], yaw: 0, pitch: 0.12 };
  ctx.bounds = { r: 55, yMin: -40, yMax: 0 };
  ctx.tour = [[0, -5, 10], [-10, -7, 2], [-18, -4, 12], [-6, -12, -10], [12, -6, -20], [20, -9, 2], [8, -4, 6]];
}
