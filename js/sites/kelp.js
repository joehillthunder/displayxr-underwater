// 02 Kelp Forest: Monterey Bay. Green, cool water, giant kelp rising from rocky reef to a canopy at
// the surface, otters floating on their backs up top, seals that come to look at you, garibaldi,
// leopard sharks, purple urchins and sunflower sea stars on the rocks.

import { THREE, fbm, clamp, smooth, around } from './common.js';
import * as G from '../models.js';
import { ridge } from '../util.js';

export const env = {
  fog: '#2a7466', density: 0.045, top: '#9fe0b0', bottom: '#0c2a2a', sunGlow: '#b8ffcc',
  hemiSky: '#d8ffe0', hemiGround: '#2a4030', hemi: 1.1, light: 1.6, ambient: 0.12, sunColor: '#f0ffe0',
  surface: 0, surfaceSky: '#e8fff0', surfaceMirror: '#1d5a50',
  rays: 0.9, rayColor: '#e8ffd8', caustics: 0.6, causticFade: 12, lightDepth: 18,
  particles: { color: '#e0ffe8', size: 1.8, count: 1800, fall: 0.03, opacity: 0.45 },
  exposure: 1.1,
};

const height = (x, z) => {
  const d = Math.hypot(x, z);
  const rock = ridge(x * 0.045, z * 0.045, 4);
  return -16 + fbm(x * 0.025, z * 0.025, 4) * 3 + Math.max(0, rock) * 3.2 - smooth(50, 80, d) * 8;
};

export function build(ctx) {
  const r = ctx.r;
  const sand = new THREE.Color('#9a8e6e'), rock = new THREE.Color('#5a554a'), pink = new THREE.Color('#b0607a'), green = new THREE.Color('#4a6a3a');
  ctx.floor({
    size: 180, seg: 150, height,
    paint: (x, z, y, out) => {
      const rk = Math.max(0, ridge(x * 0.045, z * 0.045, 4));
      out.copy(sand).lerp(rock, clamp(rk * 1.6, 0, 1));
      const n = fbm(x * 0.3, z * 0.3, 2);
      if (rk > 0.2 && n > 0.1) out.lerp(pink, 0.5); // coralline algae
      else if (rk > 0.2 && n < -0.25) out.lerp(green, 0.5);
    },
  });

  // Giant kelp: rooted on rock, reaching the surface.
  const kelpA = G.kelpGeo({ h: 16, seed: 3 }), kelpB = G.kelpGeo({ h: 16, seed: 8, blade: '#7a6a1a', blade2: '#a8962e' });
  const spots = [];
  for (let i = 0; i < 400 && spots.length < 170; i++) {
    const [x, z] = around(r, 3, 58);
    if (Math.hypot(x - 2, z - 16) < 7) continue; // clearing at the start
    if (fbm(x * 0.05 + 3, z * 0.05, 2) < -0.15) continue; // sandy glades between groves
    spots.push([x, z]);
  }
  const half = Math.ceil(spots.length / 2);
  for (const [geo, list] of [[kelpA, spots.slice(0, half)], [kelpB, spots.slice(half)]]) {
    ctx.scatter(geo, { mode: 'sway', amp: 0.06, freq: 0.45, caustics: false }, list.length, (i) => {
      const [x, z] = list[i];
      const y = height(x, z);
      return { x, y, z, sx: 1, sy: (-y - 0.3) / 16, sz: 1, ry: r() * 6 };
    });
  }
  for (const [x, z] of spots.slice(0, 8)) ctx.find('kelp', [x, height(x, z) * 0.5, z], 1.6);

  // The canopy: blades lying on the surface.
  const blade = G.leafGeo(1.4, 0.22).rotateX(-Math.PI / 2);
  const bp = new G.Parts().add(blade, (x, y, z, out) => out.set('#8a7a24').lerp(new THREE.Color('#b8a43a'), Math.abs(x) * 4)).build();
  ctx.scatter(bp, { mode: 'none', caustics: false, rough: 0.9 }, 900, (i) => {
    const [x, z] = spots[i % spots.length];
    return { x: x + (r() - 0.5) * 3, y: -0.25 - r() * 0.2, z: z + (r() - 0.5) * 3, ry: r() * 6, s: 0.8 + r() * 0.8, c: r.pick(['#ffffff', '#d8c880', '#c0b060']) };
  });

  // Rocks, urchins, sea stars.
  ctx.scatter(G.rockGeo({ color: '#4e4a42', color2: '#7a6a5a', seed: 4 }), {}, 60, () => { const [x, z] = around(r, 2, 56); return { x, y: height(x, z) - 0.3, z, s: 0.4 + r() * 1.4, ry: r() * 6 }; });
  const urchinGeo = G.urchinGeo({ color: '#4a1a5a', spine: '#7a2a9a', r: 0.06 });
  const urchinSpots = [];
  ctx.scatter(urchinGeo, {}, 120, () => {
    const [x, z] = around(r, 2, 50);
    const y = height(x, z);
    if (urchinSpots.length < 6 && Math.hypot(x, z) < 30) urchinSpots.push([x, y, z]);
    return { x, y, z, s: 1.5 + r() * 1.2 };
  });
  for (const [x, y, z] of urchinSpots) ctx.find('urchin', [x, y + 0.1, z], 0.45);
  ctx.scatter(G.grassGeo({ color: '#5a3a2a', color2: '#b05a3a', h: 0.4, w: 0.06, seed: 3 }), { mode: 'sway', amp: 0.2, freq: 1 }, 120, () => { const [x, z] = around(r, 2, 55); return { x, y: height(x, z), z, s: 0.8 + r(), ry: r() * 6 }; });

  const sunstarGeo = G.starGeo({ arms: 20, r: 0.45, inner: 0.55, color: '#c0502a', color2: '#e89060' });
  for (const [x, z, c] of [[-4, 6, null], [10, -8, '#9a4aa0'], [-14, -14, null]]) {
    const st = ctx.swimmer(sunstarGeo, { mode: 'none' }, { behave: 'crawl', home: [x, height(x, z), z], range: 4, speed: 0.06, turn: 0.3, lift: 0.02 });
    if (c) st.material.color.set(c);
    ctx.find('sunstar', st, 0.6);
  }

  // Sea otters, floating on their backs in the canopy.
  const otterGeo = G.mammalGeo({
    len: 1.2, w: 0.22, h: 0.2, peak: 0.6, blunt: 0.5, flukes: 'seal', fluke: 0.12, pect: 0.08, pectZ: 0.78, eye: 0.018,
    paint: (t, u, s, out) => { out.set('#4a321e').lerp(new THREE.Color('#6a4a2e'), u * -0.5 + 0.5); if (t > 0.84) out.set('#c8b090'); },
  });
  otterGeo.rotateZ(Math.PI); // belly up
  for (const [x, z] of [[-6, -4], [8, 4], [-1, 2]]) {
    const o = ctx.swimmer(otterGeo, { mode: 'whale', freq: 1.2, amp: 0.03 }, { behave: 'surface', home: [x, 0, z], range: 8, speed: 0.2, turn: 0.5, float: 0.12, bob: 0.06, surfaceY: 0 });
    ctx.find('otter', o, 1.0);
  }

  // Harbor seals: curious, they come to check on the diver.
  const sealGeo = G.mammalGeo({
    len: 1.6, w: 0.24, h: 0.22, peak: 0.62, blunt: 0.5, flukes: 'seal', fluke: 0.12, pect: 0.09, pectZ: 0.74, eye: 0.022,
    paint: (t, u, s, out) => { out.set('#8a8a82').lerp(new THREE.Color('#c8c4b4'), clamp(-u * 0.8 + 0.3, 0, 1)); if (Math.sin(t * 47 + s * 5) * Math.sin(u * 13) > 0.7) out.set('#3a3a36'); },
  });
  for (const [x, z] of [[-12, 8], [14, -14]]) {
    const s = ctx.swimmer(sealGeo, { mode: 'fish', freq: 3, amp: 0.1 }, { home: [x, -7, z], range: 18, yMin: -13, yMax: -2, speed: 1.2, turn: 1.1, clear: 1.2, curious: true });
    ctx.find('seal', s, 1.1);
  }

  // Garibaldi guarding their patches.
  const gari = G.fishGeo({ len: 0.3, h: 0.5, w: 0.16, peak: 0.55, tail: 'round', tailSize: 0.22, dorsal: [0.2, 0.8, 0.1], anal: [0.2, 0.45, 0.08], pect: 0.13, eye: 0.04, top: '#ff6a10', belly: '#ff8a20', finColor: '#ff6a10' });
  for (const [x, z] of [[-3, 9], [6, -2], [-9, -6], [12, 8]]) {
    const y = height(x, z);
    const g = ctx.swimmer(gari, { mode: 'fish', freq: 9, amp: 0.1 }, { behave: 'hover', home: [x, y + 0.9, z], range: 1.5, yMin: y + 0.4, yMax: y + 1.8, speed: 0.4, turn: 2.5, clear: 0.4 });
    ctx.find('garibaldi', g, 0.5);
  }

  // Leopard sharks cruising low.
  const leo = G.fishGeo({
    len: 1.4, h: 0.13, w: 0.13, peak: 0.62, blunt: 0.5, tail: 'shark', tailSize: 0.22, dorsal: [0.42, 0.56, 0.08], pect: 0.14, pectZ: 0.64, eye: 0.013, finColor: '#8a8478',
    paint: (t, u, s, out) => {
      out.set('#9a9284').lerp(new THREE.Color('#e8e0d0'), clamp(-u * 1.2 + 0.1, 0, 1));
      if (u > -0.1 && (Math.sin(t * 34) > 0.75 || Math.sin(t * 61 + s * 4) * Math.sin(u * 9) > 0.8)) out.set('#2a2622');
    },
  });
  for (const [x, z] of [[0, -10], [-16, 12]]) {
    const y = height(x, z);
    const s = ctx.swimmer(leo, { mode: 'fish', freq: 3.5, amp: 0.08 }, { home: [x, y + 1, z], range: 20, yMin: y + 0.5, yMax: y + 2.5, speed: 0.9, clear: 0.7, shy: 3 });
    ctx.find('leopard', s, 1.0);
  }

  // Blue rockfish and señoritas, just for life.
  const rockfish = G.fishGeo({ len: 0.3, h: 0.36, w: 0.16, tail: 'round', dorsal: [0.25, 0.85, 0.1], top: '#3a4a6a', belly: '#8a9ab0', finColor: '#3a4a6a', eye: 0.045 });
  const senorita = G.fishGeo({ len: 0.2, h: 0.22, w: 0.12, tail: 'round', dorsal: [0.2, 0.8, 0.05], top: '#d8a030', belly: '#f0d070', finColor: '#e0b040', eye: 0.035 });
  ctx.school(rockfish, { mode: 'fish', freq: 7, amp: 0.08 }, { count: 30, radius: 3, flat: 0.6, home: [-8, -8, -10], range: 15, yMin: -12, yMax: -4, speed: 0.6, clear: 1.5 });
  ctx.school(senorita, { mode: 'fish', freq: 10, amp: 0.1 }, { count: 22, radius: 2, flat: 0.5, home: [10, -11, 4], range: 12, yMin: -14, yMax: -7, speed: 0.7, clear: 1 });

  ctx.start = { pos: [2, -6, 18], yaw: 0, pitch: -0.05 };
  ctx.bounds = { r: 60, yMin: -30, yMax: 0 };
  ctx.tour = [[2, -6, 16], [-8, -9, 4], [-6, -3, -10], [8, -2, -6], [14, -10, -16], [16, -7, 6]];
}
