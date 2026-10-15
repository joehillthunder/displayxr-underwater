// 06 Open Ocean: off Tonga. No floor, just endless blue and sunbeams. A humpback mother and calf
// (with song), a whale shark, a sailfish working a sardine bait ball, an ocean sunfish, a Portuguese
// man o' war at the surface, spinner dolphins, and a glowing cloud of phytoplankton.

import { THREE, clamp, around } from './common.js';
import * as G from '../models.js';

export const env = {
  fog: '#1f6fcf', density: 0.021, top: '#8fd8ff', bottom: '#020b2a', sunGlow: '#c8f0ff',
  hemiSky: '#e0f4ff', hemiGround: '#0a2a5a', hemi: 1.2, light: 1.8, ambient: 0.12,
  surface: 0, surfaceSky: '#f0fbff', surfaceMirror: '#1a5ab8',
  rays: 1.4, caustics: 0, lightDepth: 30, song: true,
  particles: { color: '#e8f4ff', size: 1.4, count: 1400, fall: 0.01, opacity: 0.35 },
  exposure: 1.05, edgeText: 'The ocean goes on forever out here. Stay close to the action.',
};

export function build(ctx) {
  const r = ctx.r;
  ctx.caustics = false;

  // Humpback mother and calf, circling slowly.
  const humpGeo = (len) => G.mammalGeo({
    len, w: 0.2, h: 0.19, peak: 0.6, blunt: 0.5, fluke: 0.14, dorsal: [0.36, 0.025], pect: 0.3, pectZ: 0.7, pectDroop: 0.6, eye: 0.006,
    pectColor: (x, y, z, out) => out.set(Math.abs(x) > len * 0.2 ? '#e8ecee' : '#3a3e44'),
    flukeColor: '#2e3238',
    paint: (t, u, s, out) => {
      out.set('#2e3238');
      if (u < -0.25) out.set(t > 0.35 && t < 0.92 && Math.sin(s * 60) > 0 ? '#c8ccd0' : '#e8ecee'); // grooved white belly
    },
    extra: (p, L) => { for (let i = 0; i < 14; i++) G.ball(p, 0.008 * L, '#3a3e44', ((i % 4) - 1.5) * 0.02 * L, 0.045 * L, (0.42 + Math.floor(i / 4) * 0.02) * L, 1, 1, 1, 0, 6); },
  });
  const mom = ctx.swimmer(humpGeo(13), { mode: 'whale', freq: 0.7, amp: 0.06 }, { behave: 'circle', home: [0, -13, -20], range: 26, speed: 1.6, bob: 3, clear: 4, oval: 0.7 });
  const calf = ctx.swimmer(humpGeo(4.5), { mode: 'whale', freq: 1.1, amp: 0.07 }, { behave: 'circle', home: [0, -9, -20], range: 23, speed: 1.42, bob: 2.5, clear: 4, oval: 0.7 });
  calf.userData.swimmer.angle = mom.userData.swimmer.angle + 0.15;
  ctx.find('humpback', mom, 6);
  ctx.find('humpback', calf, 2.5);

  // Whale shark: wide flat head, mouth at the very front, white spots and stripes.
  const ws = G.fishGeo({
    len: 9, h: 0.15, w: 0.17, peak: 0.66, blunt: 0.42, tail: 'lunate', tailSize: 0.2, dorsal: [0.36, 0.5, 0.06], pect: 0.15, pectZ: 0.62, eye: 0.005, finColor: '#2a3a4a',
    paint: (t, u, s, out) => {
      out.set('#2c3c4c').lerp(new THREE.Color('#e0e4e4'), clamp(-u * 1.6 - 0.2, 0, 1));
      if (u > -0.3) { const sp = Math.sin(t * 120) * Math.sin(s * 14 + u * 10); if (sp > 0.82) out.set('#e8eef0'); if (Math.abs(Math.sin(t * 30)) < 0.05 && t > 0.2) out.set('#c0c8d0'); }
    },
  });
  const wsh = ctx.swimmer(ws, { mode: 'fish', freq: 1.0, amp: 0.05 }, { home: [18, -8, 6], range: 26, yMin: -14, yMax: -4, speed: 1.0, turn: 0.25, clear: 4, curious: true });
  ctx.find('whaleshark', wsh, 3.5);

  // Sardine bait ball, spinning, with a sailfish working it.
  const sardine = G.fishGeo({ len: 0.16, h: 0.2, w: 0.12, tail: 'fork', tailSize: 0.22, dorsal: [0.45, 0.6, 0.06], top: '#2a5a8a', belly: '#e8f0f8', finColor: '#7a9ab8', eye: 0.06 });
  const ball = ctx.school(sardine, { mode: 'fish', freq: 18, amp: 0.1, rough: 0.3, metal: 0.5 }, { count: 220, radius: 3.4, flat: 0.85, swirl: 0.6, home: [-14, -7, -6], range: 3, yMin: -9, yMax: -5, speed: 0.4, clear: 3, avoid: 2.6, scaleVar: 0.15 });
  ctx.find('sardines', ball, 3.6);
  const sail = G.fishGeo({
    len: 2.6, h: 0.12, w: 0.09, peak: 0.6, blunt: 0.6, tail: 'lunate', tailSize: 0.18, pect: 0.08, eye: 0.012, bill: 0.28, sail: 0.24, sailColor: '#1f3a9a',
    top: '#1a2a6a', belly: '#e8eef4', finColor: '#1a2a6a',
    paint: (t, u, s, out) => { out.set('#1a2a6a').lerp(new THREE.Color('#e8eef4'), clamp(-u * 1.4 + 0.1, 0, 1)); if (u > -0.3 && Math.abs(Math.sin(t * 50)) < 0.12) out.set('#6ab0ff'); },
  });
  const sf = ctx.swimmer(sail, { mode: 'fish', freq: 4, amp: 0.05 }, { behave: 'circle', home: [-14, -7, -6], range: 6.5, speed: 2.2, bob: 1.2, clear: 3 });
  ctx.find('sailfish', sf, 1.4);

  // Ocean sunfish: a tall disc with long fins top and bottom and a frilly back end.
  const molaP = new G.Parts();
  G.ball(molaP, 1, (x, y, z, out) => out.set('#8a9298').lerp(new THREE.Color('#d8dcdc'), clamp(-y + 0.3, 0, 1)), 0, 0, 0, 0.18, 0.62, 0.55, 0, 20);
  G.fin(molaP, [[-0.2, 0.45], [-0.45, 1.45], [-0.15, 1.35], [0.1, 0.45]], '#7a8288', 'zy', G.at(0, 0, 0));
  G.fin(molaP, [[-0.2, -0.45], [-0.45, -1.45], [-0.15, -1.35], [0.1, -0.45]], '#7a8288', 'zy', G.at(0, 0, 0));
  G.fin(molaP, [[-0.5, 0.4], [-0.68, 0.2], [-0.72, 0], [-0.68, -0.2], [-0.5, -0.4]], '#9aa0a4', 'zy', G.at(0, 0, 0));
  G.ball(molaP, 0.05, '#111', 0.08, 0.12, 0.36, 1, 1, 1, 0, 8);
  G.ball(molaP, 0.05, '#111', -0.08, 0.12, 0.36, 1, 1, 1, 0, 8);
  const mola = ctx.swimmer(molaP.build(), { mode: 'fish', freq: 1.4, amp: 0.04, len: 1.2 }, { home: [10, -5, -22], range: 10, yMin: -8, yMax: -2.5, speed: 0.35, turn: 0.3, clear: 3, curious: true }, { scale: 1.3 });
  ctx.find('mola', mola, 1.8);

  // Portuguese man o' war floating at the surface, tentacles trailing far below.
  const mow = G.jellyGeo({ r: 0.18, tall: 1.1, color: '#a8a0ff', rim: '#4a7aff', tentacles: 14, tlen: 35, tcolor: '#6a5aff', glow: 0.3, arms: true, armColor: '#d080ff' });
  for (const [x, z] of [[-3, -10], [6, -14]]) {
    const m = ctx.swimmer(mow, { mode: 'pulse', freq: 0.6, amp: 0.04, opacity: 0.85 }, { behave: 'drift', home: [x, -0.15, z], range: 3, bob: 0.03 }, { scale: 1.2 });
    ctx.find('manowar', m, 1.2);
  }

  // A pod of spinner dolphins.
  const spinner = G.mammalGeo({
    len: 1.9, w: 0.16, h: 0.17, peak: 0.55, blunt: 0.5, fluke: 0.14, dorsal: [0.47, 0.06], pect: 0.12, pectZ: 0.72, eye: 0.007, beak: 0.12, beakR: 0.03 * 1.9, beakColor: '#3a4048',
    paint: (t, u, s, out) => out.set(u > 0.35 ? '#3a4048' : u > -0.3 ? '#8a9098' : '#f0eef0'),
  });
  for (let i = 0; i < 5; i++) {
    const d = ctx.swimmer(spinner, { mode: 'whale', freq: 3.2, amp: 0.08 }, { behave: 'circle', home: [4 + i * 0.6, -4 - (i % 3), 4], range: 14 + i * 1.3, speed: 3.2, bob: 1.5, clear: 2, dirSign: -1 });
    d.userData.swimmer.angle = i * 0.22;
    ctx.find('spinner', d, 1.2);
  }

  // Phytoplankton: a swirl of tiny green-gold specks that glow faintly.
  const speck = new G.Parts();
  G.ball(speck, 0.012, '#9aff8a', 0, 0, 0, 1, 1, 1, 2.2, 6);
  const plank = ctx.school(speck.build(), { mode: 'none' }, { count: 260, radius: 2.2, flat: 1, swirl: 0.15, home: [22, -16, -24], range: 1, yMin: -17, yMax: -15, speed: 0.1, clear: 1, avoid: 0.5, scaleVar: 0.6 });
  ctx.find('plankton', plank, 2.4);

  // A few jacks for life.
  const jack = G.fishGeo({ len: 0.6, h: 0.32, w: 0.12, tail: 'lunate', dorsal: [0.4, 0.6, 0.08], anal: [0.3, 0.5, 0.06], top: '#4a6a8a', belly: '#e0e8f0', finColor: '#c0c870', eye: 0.035 });
  ctx.school(jack, { mode: 'fish', freq: 7, amp: 0.07, rough: 0.3, metal: 0.4 }, { count: 24, radius: 3, flat: 0.5, home: [8, -12, 12], range: 16, yMin: -18, yMax: -6, speed: 1.4, clear: 2 });

  ctx.start = { pos: [0, -6, 14], yaw: 0, pitch: -0.08 };
  ctx.bounds = { r: 55, yMin: -45, yMax: 0 };
  ctx.tour = [[0, -6, 12], [-12, -6, 2], [-10, -8, -14], [6, -10, -26], [20, -8, -6], [12, -5, 10]];
  void around; void r;
}
