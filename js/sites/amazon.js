// 05 Amazon River: the flooded forest (várzea) near Manaus. Tea-and-olive water between drowned tree
// trunks and buttress roots, giant water-lily pads on the surface above, pink river dolphins,
// piranhas, arapaima gulping air, an electric eel, a manatee, a river stingray and fruit-eating
// tambaqui under the trees.

import { THREE, fbm, clamp, smooth, around } from './common.js';
import * as G from '../models.js';

export const env = {
  fog: '#55602e', density: 0.06, top: '#c8d890', bottom: '#1e2410', sunGlow: '#f0f0a0',
  hemiSky: '#f0f0c0', hemiGround: '#3a3420', hemi: 1.1, light: 1.3, ambient: 0.16, sunColor: '#fff4c8',
  surface: 0, surfaceSky: '#f4f8d8', surfaceMirror: '#4a5226',
  rays: 0.8, rayColor: '#fff8c8', caustics: 0.35, causticFade: 5, lightDepth: 5,
  particles: { color: '#d8cfa0', size: 2.2, count: 2600, fall: 0.008, opacity: 0.45 },
  exposure: 1.15, edgeText: 'The flooded forest goes on for kilometres. Turn back toward the trees.',
};

const height = (x, z) => -9 + fbm(x * 0.03, z * 0.03, 4) * 2 + fbm(x * 0.15, z * 0.15, 2) * 0.3 - smooth(40, 70, Math.hypot(x, z)) * 3;

function treeGeo(seed) {
  const R = ctx_r(seed);
  const p = new G.Parts();
  const bark = (x, y, z, out) => out.set('#4a3a26').lerp(new THREE.Color('#7a6a4a'), clamp(0.5 + 0.5 * Math.sin(y * 3 + x * 9), 0, 1) * 0.5);
  const rad = 0.35 + R() * 0.3;
  G.rod(p, rad, rad * 0.85, 16, '#4a3a26', G.at(0, -1, 0), 10);
  // Buttress roots: thin vertical slabs flaring out at the base.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + R();
    const w = 1.2 + R();
    G.fin(p, [[0, 0], [w, 0], [0.1, 2.2 + R()], [0, 2.4]], '#5a4830', 'xy', G.at(Math.cos(a) * rad * 0.6, -0.3, Math.sin(a) * rad * 0.6, 0, -a, 0));
  }
  // Drowned branches and hanging roots.
  for (let i = 0; i < 4; i++) {
    const a = R() * Math.PI * 2, y = 3 + R() * 5;
    G.rod(p, 0.09, 0.03, 2 + R() * 2, '#4a3a26', G.at(Math.cos(a) * rad, y, Math.sin(a) * rad, Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1), 5);
  }
  for (let i = 0; i < 6; i++) {
    const a = R() * Math.PI * 2;
    G.rod(p, 0.015, 0.012, 4 + R() * 4, '#6a5a3a', G.at(Math.cos(a) * (rad + 0.5 + R()), 0.5, Math.sin(a) * (rad + 0.5 + R()), 0, 0, 0), 3);
  }
  const g = p.build();
  // Recolour with bark streaks.
  const pos = g.attributes.position, col = g.attributes.color, c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { bark(pos.getX(i), pos.getY(i), pos.getZ(i), c); col.setXYZ(i, c.r * 0.6 + col.getX(i) * 0.4, c.g * 0.6 + col.getY(i) * 0.4, c.b * 0.6 + col.getZ(i) * 0.4); }
  return g;
}
const ctx_r = (s) => { let k = s * 9301 + 49297; return () => ((k = (k * 9301 + 49297) % 233280) / 233280); };

export function build(ctx) {
  const r = ctx.r;
  const mud = new THREE.Color('#5a4a30'), leaf = new THREE.Color('#6a4a22'), silt = new THREE.Color('#7a6e4a');
  ctx.floor({ size: 170, seg: 130, height, paint: (x, z, y, out) => { out.copy(mud).lerp(silt, fbm(x * 0.1, z * 0.1) * 0.5 + 0.5); if (fbm(x * 0.8, z * 0.8, 2) > 0.2) out.lerp(leaf, 0.6); } });
  // Leaf litter and fallen branches.
  const twig = new THREE.CylinderGeometry(0.04, 0.05, 2.4, 5).rotateZ(Math.PI / 2);
  twig.deleteAttribute('uv');
  ctx.scatter(new G.Parts().add(twig, '#4a3a26').build(), {}, 60, () => { const [x, z] = around(r, 2, 50); return { x, y: height(x, z) + 0.05, z, ry: r() * 6, s: 0.5 + r() * 1.3, rz: (r() - 0.5) * 0.3 }; });

  // The drowned forest.
  const trees = [];
  for (let i = 0; i < 120 && trees.length < 46; i++) {
    const [x, z] = around(r, 4, 58);
    if (Math.hypot(x, z - 12) < 6 || trees.some(([a, b]) => Math.hypot(a - x, b - z) < 5)) continue;
    trees.push([x, z]);
  }
  const variants = [treeGeo(1), treeGeo(2), treeGeo(3)];
  variants.forEach((g, k) => {
    const list = trees.filter((_, i) => i % 3 === k);
    ctx.scatter(g, {}, list.length, (i) => { const [x, z] = list[i]; return { x, y: height(x, z), z, s: 0.9 + r() * 0.4, ry: r() * 6 }; });
  });
  for (const [x, z] of trees.slice(0, 6)) ctx.find('varzea', [x, -4, z], 1.4);
  // Trunks are solid: the diver slides around them.
  ctx.obstacles = trees.map(([x, z]) => [x, z, 1.0]);
  ctx.scatter(G.grassGeo({ color: '#3a5a20', color2: '#7a9a40', h: 0.9, seed: 2, blades: 7 }), { mode: 'sway', amp: 0.2, freq: 0.6 }, 60, () => { const [x, z] = around(r, 2, 45); return { x, y: height(x, z), z, s: 0.8 + r(), ry: r() * 6 }; });

  // Giant water lilies on the surface: spiny red undersides you can see from below.
  const lilyP = new G.Parts();
  const disc = new THREE.CircleGeometry(1.4, 36).rotateX(Math.PI / 2);
  lilyP.add(disc, (x, y, z, out) => out.set('#7a1a2a').lerp(new THREE.Color('#b03a3a'), Math.abs(Math.sin(Math.atan2(z, x) * 16)) * 0.6));
  const rim = new THREE.TorusGeometry(1.4, 0.06, 6, 40).rotateX(Math.PI / 2);
  lilyP.add(rim, '#5a8a2a');
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; G.rod(lilyP, 0.03, 0.01, 1.35, '#a0303a', G.at(0, -0.02, 0, 0, -a, Math.PI / 2), 4); }
  for (let i = 0; i < 40; i++) { const a = (i * 2.4) % (Math.PI * 2), d = 0.2 + (i % 7) * 0.17; const g = new THREE.ConeGeometry(0.015, 0.09, 4).rotateX(Math.PI); g.deleteAttribute('uv'); lilyP.add(g, '#e0a0a0', { m: G.at(Math.cos(a) * d, -0.08, Math.sin(a) * d) }); }
  G.rod(lilyP, 0.025, 0.025, 9, '#6a3a2a', G.at(0.2, -9, 0.1), 5);
  const lilyGeo = lilyP.build();
  const lilies = [[6, -4], [8, -8], [3, -9], [10, -3], [-12, 4]];
  lilies.forEach(([x, z], i) => {
    const l = ctx.prop(lilyGeo, { caustics: false, rough: 0.8 }, x, -0.08, z, { ry: i, s: 0.8 + (i % 3) * 0.25 });
    if (i < 3) ctx.find('lily', [x, -0.4, z], 1.5);
    void l;
  });

  // Pink river dolphins (botos), weaving between the trunks.
  const boto = G.mammalGeo({
    len: 2.3, w: 0.2, h: 0.21, peak: 0.55, blunt: 0.5, fluke: 0.13, dorsal: [0.48, 0.03], pect: 0.13, pectZ: 0.74, eye: 0.006, beak: 0.16, beakR: 0.035 * 2.3,
    paint: (t, u, s, out) => out.set('#e898a8').lerp(new THREE.Color('#9a8a92'), clamp(u * 0.7 + (1 - t) * 0.2, 0, 0.6)),
    beakColor: '#e8a0b0', extra: (p, len) => G.ball(p, 0.07 * len, '#f0a8b8', 0, 0.035 * len, 0.43 * len, 1, 0.8, 0.9, 0, 12),
  });
  for (const [x, z] of [[-6, -6], [8, 6]]) {
    const b = ctx.swimmer(boto, { mode: 'whale', freq: 2.2, amp: 0.08 }, { home: [x, -4, z], range: 18, yMin: -7, yMax: -1, speed: 1.3, turn: 1.4, clear: 1, curious: true });
    ctx.find('boto', b, 1.4);
  }

  // Red-bellied piranhas, in a nervous shoal.
  const piranha = G.fishGeo({
    len: 0.28, h: 0.5, w: 0.15, peak: 0.6, blunt: 0.55, tail: 'fork', tailSize: 0.18, dorsal: [0.4, 0.6, 0.08], anal: [0.15, 0.4, 0.1], pect: 0.12, eye: 0.04, finColor: '#4a4a4a', teeth: true,
    paint: (t, u, s, out) => { out.set('#7a8088').lerp(new THREE.Color('#d83a2a'), clamp(-u * 1.5 - 0.1, 0, 1)); if (Math.sin(t * 80) * Math.sin(u * 20) > 0.7) out.lerp(new THREE.Color('#c0c8d0'), 0.5); },
  });
  for (const [x, z] of [[-4, 2], [12, -10]]) {
    const sc = ctx.school(piranha, { mode: 'fish', freq: 9, amp: 0.09, rough: 0.4, metal: 0.25 }, { count: 26, radius: 2.4, flat: 0.5, home: [x, -6, z], range: 10, yMin: -8, yMax: -3, speed: 0.8, clear: 1, avoid: 2.2 });
    ctx.find('piranha', sc, 2.4);
  }

  // Arapaima: huge, armoured, red toward the tail; rises to gulp air.
  const arapaima = G.fishGeo({
    len: 2.4, h: 0.17, w: 0.15, peak: 0.6, blunt: 0.55, tail: 'round', tailSize: 0.14, dorsal: [0.08, 0.3, 0.06], anal: [0.08, 0.3, 0.06], pect: 0.07, eye: 0.012, finColor: '#6a2a1a',
    paint: (t, u, s, out) => { out.set('#4a5040').lerp(new THREE.Color('#a8402a'), clamp(1.3 - t * 2.2, 0, 1)); if (Math.sin(t * 160) * Math.sin(u * 30 + s * 30) > 0.5) out.multiplyScalar(0.75); },
  });
  for (const [x, z] of [[-14, -14], [14, 14]]) {
    const a = ctx.swimmer(arapaima, { mode: 'fish', freq: 2.2, amp: 0.06 }, { home: [x, -6, z], range: 16, yMin: -8, yMax: -3, speed: 0.6, turn: 0.6, clear: 1.2 });
    ctx.find('arapaima', a, 1.4);
    // Every so often it heads up to the surface for a breath.
    let t0 = 10 + r() * 15;
    const sw = a.userData.swimmer;
    ctx.tick((dt) => {
      t0 -= dt;
      if (t0 <= 0) { t0 = 35 + r() * 20; sw.target.set(a.position.x + 2, -0.3, a.position.z + 2); sw.timer = 9; sw.o.yMax = -0.3; }
      else if (t0 < 26) sw.o.yMax = -3;
    });
  }

  // An electric eel (really a knifefish) hanging low over the mud.
  const eel = G.eelGeo({ len: 2.0, w: 0.07, h: 0.08, top: '#3a3628', belly: '#c88a3a', ribbon: 0.03, finColor: '#4a4030', eye: 0.008 });
  const ee = ctx.swimmer(eel, { mode: 'fish', freq: 2.5, amp: 0.05 }, { home: [-2, height(-2, -10) + 0.8, -10], range: 8, yMin: height(-2, -10) + 0.4, yMax: height(-2, -10) + 1.5, speed: 0.3, turn: 0.6, clear: 0.4 });
  ctx.find('eel', ee, 1.0);

  // Amazonian manatee grazing near the surface.
  const manatee = G.mammalGeo({
    len: 2.6, w: 0.32, h: 0.28, peak: 0.55, blunt: 0.4, flukes: 'paddle', fluke: 0.14, pect: 0.1, pectZ: 0.76, eye: 0.006,
    paint: (t, u, s, out) => { out.set('#5a5650'); if (u < -0.3 && t > 0.4 && t < 0.75) out.set('#d8c8c0'); if (Math.sin(t * 50 + u * 9) > 0.8) out.multiplyScalar(0.85); },
  });
  const mn = ctx.swimmer(manatee, { mode: 'whale', freq: 1.0, amp: 0.06 }, { home: [-8, -2.5, 8], range: 10, yMin: -4, yMax: -1.2, speed: 0.35, turn: 0.4, clear: 1, curious: true });
  ctx.find('manatee', mn, 1.5);

  // Ocellate river stingray gliding over the bottom.
  const ray = G.rayGeo({
    span: 0.6, kind: 'disc', top: '#6a5034', belly: '#f0e8e0', tail: 0.5, thick: 0.08,
    paint: (u, v, c) => { const k = Math.sin(u * 22) * Math.sin(v * 26); if (k > 0.6) c.set('#e88a2a'); else if (k > 0.45) c.set('#1a1410'); },
  });
  for (const [x, z] of [[4, 4], [-10, -2]]) {
    const s = ctx.swimmer(ray, { mode: 'flap', freq: 3, amp: 0.15 }, { behave: 'crawl', home: [x, height(x, z), z], range: 8, speed: 0.3, turn: 0.8, lift: 0.08 });
    ctx.find('stingray', s, 0.6);
  }

  // Tambaqui waiting under the trees for fruit to drop.
  const tamb = G.fishGeo({ len: 0.8, h: 0.5, w: 0.16, peak: 0.55, blunt: 0.5, tail: 'fork', tailSize: 0.16, dorsal: [0.4, 0.6, 0.07], anal: [0.15, 0.4, 0.08], pect: 0.11, eye: 0.03, top: '#2e3228', belly: '#a8a080', finColor: '#22261e' });
  for (let i = 0; i < 3; i++) {
    const [x, z] = trees[i * 2];
    const t = ctx.swimmer(tamb, { mode: 'fish', freq: 5, amp: 0.08 }, { behave: 'hover', home: [x + 1.5, -2.5, z], range: 2.5, yMin: -4, yMax: -1.2, speed: 0.35, turn: 1.5, clear: 1 });
    ctx.find('tambaqui', t, 0.7);
  }
  // Fruit drifting down from the canopy.
  const fruit = ctx.scatter(new G.Parts().add(new THREE.SphereGeometry(0.06, 8, 6), '#8a5a1a').build(), { caustics: false }, 12, (i) => { const [x, z] = trees[(i * 5) % trees.length]; return { x: x + 1.5, y: -2, z: z + 0.5 }; });
  const fm = new THREE.Matrix4(), fp = new THREE.Vector3();
  ctx.tick((dt, t) => {
    for (let i = 0; i < 12; i++) {
      const [x, z] = trees[(i * 5) % trees.length];
      const y = -((t * 0.15 + i * 0.7) % 8);
      fm.makeTranslation(fp.set(x + 1.5 + Math.sin(t + i) * 0.2, y, z + 0.5));
      fruit.setMatrixAt(i, fm);
    }
    fruit.instanceMatrix.needsUpdate = true;
  });
  fruit.frustumCulled = false;

  // Small fry for life.
  const tetra = G.fishGeo({ len: 0.06, h: 0.3, w: 0.12, tail: 'fork', dorsal: [0.4, 0.6, 0.08], top: '#4a8aa0', belly: '#d83a3a', finColor: '#c0c0c0', eye: 0.06 });
  ctx.school(tetra, { mode: 'fish', freq: 18, amp: 0.1 }, { count: 50, radius: 1.6, flat: 0.5, home: [2, -3, 6], range: 6, yMin: -5, yMax: -1.5, speed: 0.5, clear: 1, avoid: 1.5 });

  ctx.start = { pos: [0, -3.5, 12], yaw: 0, pitch: -0.05 };
  ctx.bounds = { r: 50, yMin: -20, yMax: 0 };
  ctx.tour = [[0, -3.5, 10], [-8, -5, 0], [-4, -4, -14], [10, -3, -8], [12, -5, 8]];
}
