// 01 Coral Reef: Great Barrier Reef. Warm, bright, turquoise water over coral bommies (mounds)
// rising from white sand, with an anemone and its clownfish, a turtle, a manta, reef sharks,
// parrotfish, a school of blue tangs, giant clams and Endeavour's cannon hidden in a sand gully.

import { THREE, fbm, clamp, smooth, around } from './common.js';
import * as G from '../models.js';

export const env = {
  fog: '#1aa6c6', density: 0.028, top: '#9ff3ff', bottom: '#0a4d70', sunGlow: '#7fe8ff',
  hemiSky: '#d8fbff', hemiGround: '#3a6a6a', hemi: 1.25, light: 1.9, ambient: 0.15,
  surface: 0, surfaceSky: '#eaffff', surfaceMirror: '#1590b0',
  rays: 1, caustics: 0.9, causticFade: 16, lightDepth: 30,
  particles: { color: '#e8fff8', size: 1.6, count: 1200, fall: 0.02, opacity: 0.35 },
  exposure: 1.08,
};

// Coral mounds: x, z, radius, height.
const BOMMIES = [[-5, -2, 7, 5.5], [12, -15, 9, 6.5], [-21, -20, 10, 7.5], [25, 5, 8, 4.5], [-28, 11, 9, 5.5], [3, -33, 11, 8], [31, -29, 9, 6], [-13, 30, 8, 4], [-42, -8, 8, 6.5], [40, 26, 7, 4]];

function bump(x, z) {
  let b = 0;
  for (const [bx, bz, r, h] of BOMMIES) {
    const d = Math.hypot(x - bx, z - bz) / r;
    if (d < 1.4) b = Math.max(b, h * Math.pow(1 - smooth(0, 1.35, d), 1.4));
  }
  return b;
}
const height = (x, z) => {
  const d = Math.hypot(x, z);
  const b = bump(x, z);
  return -14 + fbm(x * 0.03, z * 0.03, 4) * 2.2 + b + (b > 0.3 ? fbm(x * 0.4, z * 0.4, 2) * 0.6 : 0) - smooth(55, 85, d) * 22;
};

export function build(ctx) {
  const r = ctx.r;
  const sand = new THREE.Color('#ecdfc0'), sand2 = new THREE.Color('#cdbf9c'), rock = new THREE.Color('#8f7d68'), algae = new THREE.Color('#7a8a52');
  ctx.floor({
    size: 200, seg: 170, height,
    paint: (x, z, y, out) => {
      const b = bump(x, z);
      out.copy(sand).lerp(sand2, fbm(x * 0.1, z * 0.1, 3) * 0.5 + 0.5);
      if (b > 0.2) out.lerp(rock, clamp(b / 1.2, 0, 0.92)).lerp(algae, clamp(fbm(x * 0.5, z * 0.5) + 0.3, 0, 0.6));
    },
  });

  // Points on the bommies for coral.
  const onReef = (minB = 0.6) => {
    for (let i = 0; i < 60; i++) {
      const [x, z] = around(r, 0, 52);
      if (bump(x, z) > minB) return [x, height(x, z), z];
    }
    return [0, height(0, 0), 0];
  };

  const brainCols = ['#d8a85a', '#b8c060', '#c27b5a', '#9fa86a', '#d2b06a'];
  ctx.scatter(G.brainCoralGeo(), {}, 150, () => { const [x, y, z] = onReef(); return { x, y: y - 0.1, z, s: 0.4 + r() * 0.8, ry: r() * 6, c: r.pick(brainCols) }; });
  const stagCols = ['#b07ad8', '#7ab0e8', '#f0c060', '#e88a9a', '#9ad8a0', '#ff9a6a'];
  // Soft corals: squat sponge-like branches in hot colours.
  ctx.scatter(G.branchGeo({ style: 'sponge', color: '#d06a40', tip: '#ffb080', depth: 2, r: 0.07, trunk: 0.25, seed: 6 }), { mode: 'sway', amp: 0.05, freq: 1 }, 90, () => { const [x, y, z] = onReef(); return { x, y: y - 0.05, z, s: 0.7 + r() * 0.9, ry: r() * 6, c: r.pick(['#ff7ab0', '#ffd060', '#ff9050', '#c080ff']) }; });
  ctx.scatter(G.branchGeo({ color: '#c49a7a', tip: '#ffffff', depth: 3, seed: 2 }), {}, 280, () => { const [x, y, z] = onReef(); return { x, y: y - 0.05, z, s: 0.6 + r() * 0.9, ry: r() * 6, c: r.pick(stagCols) }; });
  ctx.scatter(G.branchGeo({ style: 'table', color: '#8aa070', tip: '#c8d8a0' }), {}, 45, () => { const [x, y, z] = onReef(1.2); return { x, y, z, s: 0.8 + r() * 1.2, ry: r() * 6, c: r.pick(['#ffffff', '#d0e8ff', '#ffe0c0']) }; });
  ctx.scatter(G.branchGeo({ style: 'fan', color: '#a02a6a', tip: '#ff6ab0' }), { mode: 'sway', amp: 0.04, freq: 0.8 }, 60, () => { const [x, y, z] = onReef(); return { x, y: y - 0.05, z, s: 0.8 + r() * 1.2, ry: r() * 6, c: r.pick(['#ffffff', '#ffd0a0', '#c0a0ff']) }; });
  ctx.scatter(G.grassGeo({ color: '#3e7a3a', color2: '#8cc060', h: 0.5 }), { mode: 'sway', amp: 0.18, freq: 1.1 }, 80, () => { const [x, z] = around(r, 6, 50); return { x, y: height(x, z), z, s: 0.8 + r() * 0.8, ry: r() * 6 }; });
  ctx.scatter(G.rockGeo({ color: '#8a7a68', color2: '#a49680' }), {}, 40, () => { const [x, z] = around(r, 4, 55); return { x, y: height(x, z) - 0.2, z, s: 0.3 + r() * 0.9, ry: r() * 6 }; });
  ctx.scatter(G.urchinGeo({ color: '#151515', spine: '#222' }), {}, 30, () => { const [x, y, z] = onReef(); return { x, y, z, s: 1.2 + r() }; });
  ctx.scatter(G.starGeo({ color: '#2a5adf', color2: '#6a9aff', r: 0.15 }), {}, 14, () => { const [x, z] = around(r, 4, 45); return { x, y: height(x, z) + 0.02, z, ry: r() * 6 }; });

  // A big brain coral by the start, for the "coral" find.
  const coralPos = [-1.5, height(-1.5, 4.5), 4.5];
  ctx.prop(G.brainCoralGeo({ color: '#c79a52', color2: '#8a9a3a' }), {}, coralPos[0], coralPos[1] - 0.2, coralPos[2], { s: 1.6 });
  ctx.find('coral', [coralPos[0], coralPos[1] + 0.6, coralPos[2]], 1.6);

  // The anemone with its clownfish family, on the main bommie.
  const ap = [-3.5, height(-3.5, -0.5), -0.5];
  const anem = ctx.prop(G.anemoneGeo({ r: 0.55, base: '#c8402a', color: '#efe0a8', tip: '#d4f080' }), { mode: 'sway', amp: 0.18, freq: 1.4, len: 0.6, caustics: false }, ap[0], ap[1] - 0.05, ap[2]);
  ctx.find('anemone', [ap[0], ap[1] + 0.2, ap[2]], 0.7);
  const clownGeo = G.fishGeo({
    len: 0.14, h: 0.44, w: 0.2, peak: 0.55, blunt: 0.5, tail: 'round', tailSize: 0.22, dorsal: [0.25, 0.82, 0.12], anal: [0.18, 0.4, 0.1], pect: 0.16, finColor: '#ff8c2a', eye: 0.045,
    paint: (t, u, s, out) => {
      out.set('#ff7a14');
      for (const c of [0.84, 0.53, 0.1]) {
        const d = Math.abs(t - c);
        if (d < 0.055) out.set('#ffffff');
        else if (d < 0.075) out.set('#151515');
      }
    },
  });
  for (let i = 0; i < 3; i++) {
    const f = ctx.swimmer(clownGeo, { mode: 'fish', freq: 14, amp: 0.1 }, { behave: 'hover', home: [ap[0], ap[1] + 0.85, ap[2]], range: 0.45, yMin: ap[1] + 0.65, yMax: ap[1] + 1.15, speed: 0.35, turn: 4, clear: 0.2 }, { scale: i === 0 ? 1.3 : 1 });
    ctx.find('clownfish', f, 0.35);
  }

  // Giant clams on the sand.
  for (const [x, z] of [[4, 2], [-15, 6]]) {
    const y = height(x, z);
    ctx.prop(G.clamGeo({ size: 1.1 }), { caustics: false }, x, y - 0.15, z, { ry: r() * 6 });
    ctx.find('clam', [x, y + 0.3, z], 0.9);
  }

  // Green sea turtle, cruising the reef.
  const turtle = ctx.swimmer(G.turtleGeo({ len: 1.0 }), { mode: 'flap', freq: 1.6, amp: 0.25, span0: 0.25 }, { home: [-6, -8, -8], range: 20, yMin: -10, yMax: -3, speed: 0.7, turn: 0.5, clear: 1.5, curious: true });
  ctx.find('turtle', turtle, 1.0);

  // Reef manta, gliding in a wide loop.
  const manta = ctx.swimmer(G.rayGeo({ span: 3.6, top: '#16181e', belly: '#f2f2f0', tail: 0.4, paint: (u, v, c) => { if (v > 0.5 && Math.abs(u) > 0.12 && Math.abs(u) < 0.45) c.lerp(new THREE.Color('#d8d8d8'), 0.85); } }),
    { mode: 'flap', freq: 1.1, amp: 0.22, span0: 0.25 }, { behave: 'circle', home: [8, -6, -12], range: 15, speed: 1.3, bob: 1.5, clear: 2, oval: 0.7 });
  ctx.find('manta', manta, 2.2);

  // Blacktip reef sharks patrolling.
  const blacktip = (seed) => G.fishGeo({
    len: 1.5, h: 0.17, w: 0.15, peak: 0.6, blunt: 0.5, tail: 'shark', tailSize: 0.24, dorsal: [0.44, 0.6, 0.12], pect: 0.17, pectZ: 0.64, eye: 0.012, top: '#8b918c', belly: '#f2f2ec',
    dorsalColor: (x, y, z, out) => out.set(y > 0.24 ? '#0d0d0d' : '#7d837e'),
    finColor: '#7d837e', tailColor: (x, y, z, out) => out.set(y > 0.18 || y < -0.1 ? '#111' : '#7d837e'),
  });
  for (const [i, h] of [[0, [14, -9, 8]], [1, [-18, -8, -6]]]) {
    const g = blacktip(i);
    const s = ctx.swimmer(g, { mode: 'fish', freq: 3.2, amp: 0.07 }, { behave: 'circle', home: h, range: 13 + i * 5, speed: 1.4, bob: 2, clear: 2, dirSign: i ? -1 : 1 });
    ctx.find('blacktip', s, 1.1);
  }

  // Parrotfish grazing close to the coral.
  const parrot = G.fishGeo({
    len: 0.6, h: 0.34, w: 0.18, peak: 0.55, tail: 'lunate', tailSize: 0.2, dorsal: [0.2, 0.8, 0.07], anal: [0.18, 0.45, 0.06], pect: 0.13, finColor: '#e86aa8', eye: 0.03,
    paint: (t, u, s, out) => {
      out.set('#18b8a0').lerp(new THREE.Color('#4ad0f0'), 0.5 + 0.5 * u);
      if (Math.sin(t * 70) * Math.sin(u * 9 + s * 9) > 0.55) out.set('#f08ab8');
      if (t > 0.93) out.set('#e8f0e0');
    },
  });
  for (let i = 0; i < 4; i++) {
    const [x, z] = BOMMIES[i % 4];
    const s = ctx.swimmer(parrot, { mode: 'fish', freq: 7, amp: 0.08 }, { home: [x, height(x, z) + 1.5, z], range: 7, yMin: height(x, z) + 0.6, yMax: height(x, z) + 3, speed: 0.6, clear: 0.6, shy: 2.5 });
    ctx.find('parrotfish', s, 0.6);
  }

  // A school of blue tangs.
  const tang = G.fishGeo({
    len: 0.25, h: 0.5, w: 0.12, peak: 0.55, blunt: 0.55, tail: 'lunate', tailSize: 0.2, dorsal: [0.15, 0.85, 0.08], anal: [0.15, 0.55, 0.07], pect: 0.12, eye: 0.04,
    finColor: '#0d2aa0', tailColor: '#ffd21a',
    paint: (t, u, s, out) => {
      out.set('#1a4ae0');
      if (t < 0.14) out.set('#ffd21a');
      else if (u > 0.05 && t > 0.2 && t < 0.86 && Math.abs(u - 0.45 - (t - 0.55) * 0.5) < 0.14) out.set('#0a0a1a');
      if (t > 0.3 && t < 0.62 && Math.abs(u - 0.15) < 0.12 && t < 0.7) out.set('#0a0a1a');
    },
  });
  const tangs = ctx.school(tang, { mode: 'fish', freq: 11, amp: 0.1 }, { count: 24, radius: 2.2, flat: 0.45, home: [12, -8, -12], range: 14, yMin: -11, yMax: -4, speed: 0.9, clear: 1 });
  ctx.find('tang', tangs, 2.4);

  // Colour without facts: anthias and chromis clouds hovering over the coral.
  const anthias = G.fishGeo({ len: 0.09, h: 0.36, w: 0.14, tail: 'lunate', dorsal: [0.25, 0.8, 0.1], top: '#ff7a3a', belly: '#ffb070', finColor: '#ff9a50', eye: 0.05 });
  const chromis = G.fishGeo({ len: 0.08, h: 0.38, w: 0.14, tail: 'fork', dorsal: [0.25, 0.8, 0.08], top: '#4ae0d0', belly: '#a8f8ff', finColor: '#6ae8e0', eye: 0.05 });
  [[anthias, -21, -20], [chromis, -5, -2], [anthias, 3, -33], [chromis, 25, 5], [anthias, -28, 11]].forEach(([g, x, z], i) => {
    const y = height(x, z) + 2.5;
    ctx.school(g, { mode: 'fish', freq: 16, amp: 0.1 }, { count: 40, radius: 2.6, flat: 0.6, home: [x, y, z], range: 3, yMin: y - 1, yMax: y + 1.2, speed: 0.5, clear: 1, avoid: 1.8, scaleVar: 0.3 });
  });
  const yellow = G.fishGeo({ len: 0.18, h: 0.6, w: 0.1, tail: 'round', dorsal: [0.2, 0.8, 0.1], anal: [0.2, 0.5, 0.08], top: '#ffe02a', belly: '#fff07a', finColor: '#ffd000', eye: 0.04,
    paint: (t, u, s, out) => { out.set('#ffe23a'); if (Math.abs(t - 0.78) < 0.05 && u > -0.2) out.set('#111'); } });
  for (let i = 0; i < 6; i++) {
    const [x, z] = BOMMIES[(i * 3) % BOMMIES.length];
    ctx.swimmer(yellow, { mode: 'fish', freq: 9, amp: 0.08 }, { home: [x + 2, height(x, z) + 1.2, z], range: 5, yMin: height(x, z) + 0.6, yMax: height(x, z) + 3, speed: 0.4, clear: 0.6, shy: 2 });
  }

  // Endeavour's cannon, half sunk in a sand gully away from the reef.
  const cx = 30, cz = 40, cy = height(cx, cz);
  const cannon = new THREE.Group();
  cannon.position.set(cx, cy + 0.12, cz);
  cannon.rotation.set(0.05, 0.7, 0.1);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 1.6, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#4a4a3a', roughness: 1 }));
  const breech = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), barrel.material);
  breech.position.x = -0.82;
  const crust = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: '#9a6a8a', roughness: 1 }));
  crust.position.set(0.2, 0.12, 0);
  crust.scale.set(1.6, 0.5, 1);
  cannon.add(barrel, breech, crust);
  ctx.group.add(cannon);
  ctx.find('cannon', cannon, 1.0);

  ctx.start = { pos: [2, -7, 16], yaw: 0.1, pitch: -0.18 };
  ctx.bounds = { r: 62, yMin: -40, yMax: 0 };
  ctx.tour = [[2, -7, 14], [-10, -6, 4], [-14, -8, -12], [0, -5, -26], [18, -7, -22], [24, -6, 0], [12, -4, 12]];
}
