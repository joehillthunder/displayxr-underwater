// 09 Mariana Trench: down the trench wall to the Challenger Deep. Total darkness, a submersible's
// headlights, translucent snailfish on the upper wall (about 8,000 m), and on the floor (10,935 m):
// a baited science lander swarmed by amphipods, xenophyophores, sea cucumbers, dropped ballast
// weights, and a plastic bag. The depth gauge squeezes 3 km into the swimmable volume.

import { THREE, fbm, clamp, smooth, around } from './common.js';
import * as G from '../models.js';

const TOP = -2, FLOOR = -70;

export const env = {
  fog: '#01060c', density: 0.045, top: '#020814', bottom: '#000000', sunGlow: '#000000',
  hemiSky: '#22304a', hemiGround: '#000000', hemi: 0.3, light: 0, ambient: 0.04,
  surface: null, rays: 0, caustics: 0,
  particles: { color: '#d8e0e4', size: 2.2, count: 1600, fall: 0.06, opacity: 0.45 },
  lamp: 1.5, sub: true, exposure: 1.35, bubbles: false, lightAt: () => 0, tempAt: () => 2.4,
  edgeText: 'The trench is only about 70 km wide, but that is still far beyond your lights. Stay near the wall.',
};

const height = (x, z) => {
  const wall = Math.max(0, -x - 6) * 7 + fbm(x * 0.08, z * 0.08, 3) * 3 * smooth(-6, -14, x);
  const far = Math.max(0, x - 28) * 0.9;
  return Math.min(-0.5, FLOOR + fbm(x * 0.03, z * 0.03, 3) * 1.2 + wall + far);
};

export function build(ctx) {
  const r = ctx.r;
  ctx.caustics = false;
  const ooze = new THREE.Color('#8a7e6a'), rock = new THREE.Color('#3a3630'), dark = new THREE.Color('#5a5244');
  ctx.floor({
    size: 170, seg: 160, height,
    paint: (x, z, y, out) => {
      const steep = clamp((-x - 6) / 4, 0, 1);
      out.copy(ooze).lerp(dark, fbm(x * 0.2, z * 0.2) * 0.5 + 0.5).lerp(rock, steep * (0.6 + 0.4 * fbm(x * 0.5, z * 0.5)));
    },
  });
  ctx.scatter(G.rockGeo({ color: '#2e2b26', color2: '#4a443a', seed: 2, flat: 0.9 }), {}, 90, () => {
    const z = (r() - 0.5) * 100, x = -6.5 - r() * 10;
    return { x, y: height(x, z) - 0.3, z, s: 0.4 + r() * 1.2, ry: r() * 6, rz: (r() - 0.5) * 0.6 };
  });
  ctx.depthAt = (y) => 7800 + clamp((TOP - y) / (TOP - FLOOR), 0, 1) * 3135;
  for (const [x, z] of [[-12, 0], [-16, -14], [-14, 12]]) ctx.find('trenchwall', [x + 1.5, height(x, z) + 1, z], 2.5);

  // Mariana snailfish on the upper wall: pale pink, see-through, tadpole-shaped.
  const snail = G.fishGeo({
    len: 0.14, h: 0.3, w: 0.24, peak: 0.78, blunt: 0.45, tail: 'round', tailSize: 0.12, dorsal: [0.05, 0.6, 0.06], anal: [0.05, 0.5, 0.06], pect: 0.22, pectZ: 0.72, eye: 0.03,
    top: '#f0c8c8', belly: '#ffe0dc', finColor: '#f8d8d8',
  });
  for (let i = 0; i < 5; i++) {
    const z = -8 + i * 4, y = -9 - i * 2.5;
    const x = -6 - (y - FLOOR) / 7 + 1.4; // just off the cliff face
    const s = ctx.swimmer(snail, { mode: 'fish', freq: 4, amp: 0.12, opacity: 0.7 }, { home: [x, y, z], range: 2, yMin: y - 2, yMax: y + 2, speed: 0.15, turn: 0.8, clear: 0.6 }, { scale: 2 });
    ctx.find('snailfish', s, 0.45);
  }

  // The science lander on the floor, lights on, a bait bag swarmed by amphipods.
  const lx = 8, lz = -6, ly = height(lx, lz);
  const lander = new THREE.Group();
  lander.position.set(lx, ly, lz);
  const frame = new THREE.MeshStandardMaterial({ color: '#c8ccd0', metalness: 0.7, roughness: 0.4 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#ffb81a', roughness: 0.5 });
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), frame);
    leg.position.set(x, 1.1, z);
    lander.add(leg);
  }
  for (const y of [0.3, 2.1]) {
    const ring = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 1.3), frame);
    ring.position.y = y;
    lander.add(ring);
  }
  for (const [x, z] of [[-0.3, 0], [0.3, 0], [0, 0.3]]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), yellow);
    f.position.set(x, 2.45, z);
    lander.add(f);
  }
  const cam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 10).rotateZ(Math.PI / 2), frame);
  cam.position.set(0, 1.5, 0.6);
  lander.add(cam);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#e8f4ff' }));
  lamp.position.set(0.35, 1.6, 0.62);
  lander.add(lamp);
  const bait = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshStandardMaterial({ color: '#8a6a5a', roughness: 1 }));
  bait.position.set(0, 0.35, 1.3);
  lander.add(bait);
  const spot = new THREE.SpotLight('#e8f4ff', 60, 14, 0.6, 0.5, 1.3);
  spot.position.set(0.35, 1.6, 0.62);
  spot.target.position.set(0, -0.5, 2.5);
  lander.add(spot, spot.target);
  ctx.group.add(lander);
  ctx.find('lander', [lx, ly + 1.4, lz], 1.4);

  const amph = G.shrimpGeo({ len: 0.05, color: '#f2e6d8', curl: 1.3 });
  const sw = ctx.school(amph, { mode: 'fish', freq: 16, amp: 0.2 }, { count: 70, radius: 0.7, flat: 0.6, swirl: 0.8, home: [lx, ly + 0.5, lz + 1.3], range: 0.3, yMin: ly + 0.3, yMax: ly + 0.7, speed: 0.1, clear: 0.15, avoid: 0.5, scaleVar: 0.4 });
  ctx.find('hadal-amphipod', sw, 1.0);
  const sw2 = ctx.school(amph, { mode: 'fish', freq: 16, amp: 0.2 }, { count: 25, radius: 1.2, flat: 0.2, home: [-2, height(-2, 6) + 0.2, 6], range: 3, yMin: height(-2, 6) + 0.1, yMax: height(-2, 6) + 0.4, speed: 0.2, clear: 0.1, avoid: 0.6 });
  ctx.find('hadal-amphipod', sw2, 1.3);

  // Xenophyophores scattered on the ooze.
  const xeno = G.xenoGeo();
  for (let i = 0; i < 9; i++) {
    const [x, z] = around(r, 2, 16);
    const y = height(x + 4, z);
    ctx.prop(xeno, {}, x + 4, y - 0.02, z, { s: 1.4 + r() * 1.4, ry: r() * 6 });
    if (i < 5) ctx.find('xeno', [x + 4, y + 0.1, z], 0.45);
  }

  // Sea cucumbers inching across the floor, see-through pink.
  const cuc = G.cucumberGeo({ len: 0.18, color: '#e8a0a8', belly: '#f8d0d0', color2: '#f8c0c8' });
  for (let i = 0; i < 5; i++) {
    const [x, z] = around(r, 1, 14);
    const c = ctx.swimmer(cuc, { mode: 'fish', freq: 1, amp: 0.05, opacity: 0.75 }, { behave: 'crawl', home: [x + 2, height(x + 2, z), z], range: 3, speed: 0.03, turn: 0.4, lift: 0.04 }, { scale: 2 });
    ctx.find('cucumber', c, 0.45);
  }

  // Ballast weights dropped by submersibles on their way back up.
  const steel = new THREE.MeshStandardMaterial({ color: '#4a4440', roughness: 0.8, metalness: 0.5 });
  const wx = -3, wz = 10, wy = height(wx, wz);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), steel);
    b.position.set(wx + (i % 2) * 0.7, wy + 0.06, wz + Math.floor(i / 2) * 0.5);
    b.rotation.set(0.05, i * 0.4, 0.04);
    ctx.group.add(b);
  }
  ctx.find('explorers', [wx + 0.35, wy + 0.2, wz + 0.25], 1.0);

  // The plastic bag: the deepest litter ever recorded.
  const bagP = new G.Parts();
  const sheet = new THREE.PlaneGeometry(0.35, 0.45, 6, 6);
  const sp = sheet.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setZ(i, Math.sin(sp.getX(i) * 14) * 0.03 + Math.cos(sp.getY(i) * 11) * 0.03);
  sheet.translate(0, 0.22, 0);
  bagP.add(sheet, '#f0f2f0', { glow: 0.05 });
  for (const s of [-1, 1]) G.rod(bagP, 0.012, 0.012, 0.12, '#f0f2f0', G.at(s * 0.1, 0.44, 0, 0, 0, s * 0.3), 4);
  const bx = 18, bz = 10, by = height(bx, bz);
  const bag = ctx.prop(bagP.build(), { mode: 'sway', amp: 0.1, freq: 0.5, len: 0.5, opacity: 0.75 }, bx, by, bz, { rx: -0.4, ry: 1 });
  ctx.find('bag', bag, 0.5);

  ctx.start = { pos: [-7.5, -8, 5], yaw: Math.PI / 2 - 0.5, pitch: -0.2 };
  ctx.bounds = { r: 42, cx: 2, yMin: FLOOR - 4, yMax: -2 };
  ctx.tour = [[-12, -6, 2], [-13, -14, -6], [-10, -26, 4], [-6, -42, -2], [4, FLOOR + 5, -2], [10, FLOOR + 3, 2], [16, FLOOR + 4, 10], [0, FLOOR + 4, 10]];
}
