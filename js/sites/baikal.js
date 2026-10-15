// 04 Lake Baikal: the clearest, oldest, deepest lake. A boulder slope that drops away into blue,
// forests of green Baikal sponges, nerpa seals, translucent golomyanka, silver omul, sculpins on the
// rocks, swarms of amphipods and copepods, and a legendary crate of the Tsar's gold.

import { THREE, fbm, clamp, smooth, around } from './common.js';
import * as G from '../models.js';
import { ridge } from '../util.js';

export const env = {
  fog: '#2b86a8', density: 0.019, top: '#bff2ff', bottom: '#06263a', sunGlow: '#c8f4ff',
  hemiSky: '#e0f8ff', hemiGround: '#2a4a50', hemi: 1.15, light: 1.6, ambient: 0.14,
  surface: 0, surfaceSky: '#f2fdff', surfaceMirror: '#1d6a8a',
  rays: 1, caustics: 0.75, causticFade: 14, lightDepth: 26,
  particles: { color: '#ffffff', size: 1.2, count: 900, fall: 0.01, opacity: 0.3 },
  exposure: 1.05,
};

const height = (x, z) => {
  const base = -9 + z * 0.33 + fbm(x * 0.03, z * 0.03, 4) * 2.5;
  const boulders = Math.max(0, ridge(x * 0.12, z * 0.12, 2) - 0.3) * 1.6;
  return Math.min(-1.2, base + boulders - smooth(40, 70, Math.hypot(x, z)) * 10);
};

export function build(ctx) {
  const r = ctx.r;
  const sand = new THREE.Color('#a8a088'), stone = new THREE.Color('#6a6a66'), dark = new THREE.Color('#3e4244');
  ctx.floor({
    size: 180, seg: 150, height,
    paint: (x, z, y, out) => {
      const b = Math.max(0, ridge(x * 0.12, z * 0.12, 2) - 0.3);
      out.copy(sand).lerp(stone, clamp(b * 3, 0, 1)).lerp(dark, clamp(-(y + 12) / 18, 0, 0.6));
    },
  });
  ctx.scatter(G.rockGeo({ color: '#5e5e5a', color2: '#8a8a82', seed: 6 }), {}, 110, () => { const [x, z] = around(r, 2, 55); return { x, y: height(x, z) - 0.3, z, s: 0.3 + r() * 1.6, ry: r() * 6 }; });

  // Baikal sponge forests: bright green branching sponges.
  const sponge = G.branchGeo({ style: 'sponge', color: '#2f8a3a', tip: '#7ad84a', depth: 3, r: 0.06, trunk: 0.4, seed: 12 });
  const spongeSpots = [];
  ctx.scatter(sponge, {}, 220, () => {
    let x, z;
    for (let k = 0; k < 20; k++) { [x, z] = around(r, 2, 45); if (fbm(x * 0.06 + 7, z * 0.06) > -0.05) break; }
    const y = height(x, z);
    if (spongeSpots.length < 6 && Math.hypot(x - 2, z - 6) < 22) spongeSpots.push([x, y, z]);
    return { x, y: y - 0.05, z, s: 0.8 + r() * 1.6, ry: r() * 6, c: r.pick(['#ffffff', '#c8ffb0', '#a0e080']) };
  });
  for (const [x, y, z] of spongeSpots) ctx.find('sponge', [x, y + 0.7, z], 1.0);
  ctx.scatter(G.grassGeo({ color: '#4a7a2a', color2: '#9ac850', h: 0.35, seed: 4 }), { mode: 'sway', amp: 0.15, freq: 0.9 }, 80, () => { const [x, z] = around(r, 2, 40); return { x, y: height(x, z), z, s: 0.7 + r(), ry: r() * 6 }; });

  // Nerpa: plump silver seals, curious.
  const nerpa = G.mammalGeo({
    len: 1.3, w: 0.3, h: 0.28, peak: 0.6, blunt: 0.45, flukes: 'seal', fluke: 0.12, pect: 0.08, pectZ: 0.74, eye: 0.03,
    paint: (t, u, s, out) => out.set('#6a7078').lerp(new THREE.Color('#b8c0c4'), clamp(-u * 0.9 + 0.2, 0, 1)),
  });
  for (const [x, z] of [[-8, -6], [10, -12], [0, 4]]) {
    const n = ctx.swimmer(nerpa, { mode: 'fish', freq: 3, amp: 0.1 }, { home: [x, -6, z], range: 16, yMin: -14, yMax: -1.5, speed: 1.2, turn: 1.2, clear: 1.2, curious: true });
    ctx.find('nerpa', n, 1.0);
  }

  // Golomyanka: see-through, pinkish, with big wing-like pectoral fins; in the deeper water.
  const golo = G.fishGeo({ len: 0.18, h: 0.2, w: 0.12, peak: 0.6, tail: 'round', tailSize: 0.16, dorsal: [0.25, 0.6, 0.05], anal: [0.1, 0.5, 0.06], pect: 0.32, pectZ: 0.7, eye: 0.05, top: '#f0d8d8', belly: '#ffe8e0', finColor: '#f8f0f0' });
  for (const [x, z] of [[-6, -26], [10, -32]]) {
    const y = height(x, z) + 4;
    const s = ctx.school(golo, { mode: 'fish', freq: 7, amp: 0.1, opacity: 0.55 }, { count: 18, radius: 2.5, flat: 0.8, home: [x, y, z], range: 6, yMin: y - 2, yMax: y + 2, speed: 0.3, clear: 2, avoid: 1.6 });
    ctx.find('golomyanka', s, 2.5);
  }

  // Omul: a silver school in mid-water.
  const omul = G.fishGeo({ len: 0.4, h: 0.22, w: 0.13, tail: 'fork', tailSize: 0.22, dorsal: [0.5, 0.65, 0.08], anal: [0.2, 0.35, 0.05], top: '#5a6a7a', belly: '#e8eef2', finColor: '#7a8a96', eye: 0.04 });
  const om = ctx.school(omul, { mode: 'fish', freq: 8, amp: 0.08, rough: 0.35, metal: 0.4 }, { count: 36, radius: 3, flat: 0.5, home: [4, -10, -10], range: 16, yMin: -14, yMax: -5, speed: 1.0, clear: 2 });
  ctx.find('omul', om, 3);

  // Sculpins sitting on the rocks.
  const sculpin = G.fishGeo({
    len: 0.22, h: 0.22, w: 0.22, peak: 0.75, blunt: 0.5, tail: 'round', dorsal: [0.3, 0.8, 0.08], pect: 0.24, pectZ: 0.72, pectY: 0.05, eye: 0.06, finColor: '#6a5a40',
    paint: (t, u, s, out) => { out.set('#6a5a40').lerp(new THREE.Color('#c8b890'), clamp(-u, 0, 1)); if (Math.sin(t * 40 + s * 3) * Math.sin(u * 9) > 0.45) out.multiplyScalar(0.55); },
  });
  for (let i = 0; i < 5; i++) {
    const [x, z] = around(r, 3, 20);
    const s = ctx.swimmer(sculpin, { mode: 'fish', freq: 5, amp: 0.05 }, { behave: 'crawl', home: [x, height(x, z), z + 6], range: 3, speed: 0.08, turn: 0.6, lift: 0.04 });
    ctx.find('sculpin', s, 0.45);
  }

  // Amphipods: colourful crowds scuttling over the floor.
  const amph = G.shrimpGeo({ len: 0.05, color: '#ffffff', curl: 1.5 });
  for (const [x, z, c] of [[-3, 8, '#e06a3a'], [6, 0, '#7a9a3a'], [-10, -4, '#c04a8a']]) {
    const y = height(x, z);
    const s = ctx.school(amph, { mode: 'fish', freq: 14, amp: 0.15 }, { count: 30, radius: 1.2, flat: 0.15, home: [x, y + 0.2, z], range: 2.5, yMin: y + 0.1, yMax: y + 0.3, speed: 0.25, clear: 0.12, avoid: 0.8, scaleVar: 0.5 });
    s.mesh.material.color.set(c);
    ctx.find('amphipod', s, 1.3);
  }

  // Epischura copepods: specks drifting in a cloud (scaled up so you can see them).
  const cope = G.shrimpGeo({ len: 0.012, color: '#f8f0e0', curl: 0.4 });
  for (const [x, y, z] of [[-4, -4, 0], [6, -6, 8]]) {
    const s = ctx.school(cope, { mode: 'fish', freq: 20, amp: 0.2, opacity: 0.85 }, { count: 90, radius: 1.6, flat: 1, home: [x, y, z], range: 2, yMin: y - 0.5, yMax: y + 0.5, speed: 0.1, clear: 1, avoid: 0.6, swirl: 0.3, scaleVar: 0.5 });
    ctx.find('epischura', s, 1.6);
  }

  // LEGEND: a crate of gold bars lying in the deep blue, far down the slope.
  const gx = -18, gz = -38, gy = height(gx, gz);
  const crate = new THREE.Group();
  crate.position.set(gx, gy + 0.2, gz);
  crate.rotation.set(0.15, 0.6, 0.08);
  const wood = new THREE.MeshStandardMaterial({ color: '#5a4630', roughness: 1 });
  const gold = new THREE.MeshStandardMaterial({ color: '#ffcc40', metalness: 1, roughness: 0.25, emissive: '#5a3a00', emissiveIntensity: 0.6 });
  for (const [w, h, d, x, y, z] of [[1.2, 0.08, 0.7, 0, 0, 0], [1.2, 0.4, 0.06, 0, 0.2, 0.33], [1.2, 0.4, 0.06, 0, 0.2, -0.33], [0.06, 0.4, 0.7, 0.6, 0.2, 0], [0.06, 0.3, 0.7, -0.6, 0.15, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
    m.position.set(x, y, z);
    crate.add(m);
  }
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.12), gold);
    m.position.set(-0.4 + (i % 4) * 0.27, 0.1 + Math.floor(i / 4) * 0.08, -0.12 + (i % 2) * 0.2);
    crate.add(m);
  }
  ctx.group.add(crate);
  ctx.light('#ffd070', 3, 4, gx, gy + 1.2, gz);
  ctx.find('gold', crate, 1.0);

  ctx.start = { pos: [2, -4, 14], yaw: 0, pitch: -0.2 };
  ctx.bounds = { r: 55, yMin: -40, yMax: 0 };
  ctx.tour = [[2, -4, 12], [-8, -6, 2], [-6, -9, -12], [6, -12, -22], [14, -8, -8], [10, -4, 6]];
}
