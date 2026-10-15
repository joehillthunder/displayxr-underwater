// 10 Atlantis: the legend, built as Plato described it in Critias. Rings of land and water around
// a central island, walls clad in brass, tin and glowing red orichalcum, the silver Temple of
// Poseidon with golden statues, Poseidon in his chariot behind six winged horses. Real sea life
// lives in the ruins (octopus, moray, dolphins), and a real sunken-city statue lies outside.

import { THREE, fbm, clamp, smooth, around } from './common.js';
import * as G from '../models.js';

export const env = {
  fog: '#13708c', density: 0.024, top: '#9ff8ff', bottom: '#081c38', sunGlow: '#c8ffff',
  hemiSky: '#d8fbff', hemiGround: '#2a3a5a', hemi: 1.15, light: 1.6, ambient: 0.15,
  surface: 0, surfaceSky: '#f0ffff', surfaceMirror: '#126a88',
  rays: 1.3, caustics: 0.8, causticFade: 18, lightDepth: 30,
  particles: { color: '#e8fff8', size: 1.6, count: 1300, fall: 0.015, opacity: 0.4 },
  exposure: 1.08,
};

// Plato's rings (scaled): island, water, land, water, land, water.
const RINGS = [[0, 7, 'land'], [7, 10, 'water'], [10, 15, 'land'], [15, 19, 'water'], [19, 25, 'land'], [25, 29, 'water']];
const ringAt = (d) => RINGS.find(([a, b]) => d >= a && d < b)?.[2] ?? 'outer';
const height = (x, z) => {
  const d = Math.hypot(x, z);
  let h = -26 + fbm(x * 0.04, z * 0.04, 3) * 0.8;
  for (const [a, b, k] of RINGS) {
    if (k !== 'land') continue;
    const inside = smooth(a - 0.6, a + 0.6, d) * (1 - smooth(b - 0.6, b + 0.6, d));
    h += inside * (a === 0 ? 6 : 3.2);
  }
  if (d < 7) h += (1 - d / 7) * 1.5; // the hill the temple stands on
  return h - smooth(45, 70, d) * 6;
};

export function build(ctx) {
  const r = ctx.r;
  const paving = new THREE.Color('#c8c0a8'), sand = new THREE.Color('#d8ccaa'), weed = new THREE.Color('#7a9a6a'), canal = new THREE.Color('#a89a7a');
  ctx.floor({
    size: 170, seg: 190, height,
    paint: (x, z, y, out) => {
      const d = Math.hypot(x, z), k = ringAt(d);
      if (k === 'land') { out.copy(paving); if ((Math.floor(x * 1.2) + Math.floor(z * 1.2)) % 2) out.multiplyScalar(0.92); }
      else out.copy(k === 'water' ? canal : sand);
      out.lerp(weed, clamp(fbm(x * 0.2, z * 0.2, 3) + 0.1, 0, 0.55));
    },
  });

  // Ring walls: brass on the outer land ring, tin on the middle, orichalcum around the citadel.
  const block = new THREE.BoxGeometry(1.6, 1.4, 0.6);
  block.deleteAttribute('uv');
  const blockGeo = new G.Parts().add(block, '#ffffff').build();
  const wall = (radius, color, opts) => {
    const n = Math.round((radius * Math.PI * 2) / 1.7);
    const keep = [];
    for (let i = 0; i < n; i++) if (r() > 0.22) keep.push(i); // ruined gaps
    return ctx.scatter(blockGeo, opts, keep.length, (k) => {
      const a = (keep[k] / n) * Math.PI * 2;
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      const fallen = r() < 0.15;
      return { x, y: height(x, z) + (fallen ? 0.2 : 0.6 + r() * 0.3), z, ry: -a + Math.PI / 2, rz: fallen ? 1.3 : (r() - 0.5) * 0.1, sy: 0.6 + r() * 0.8, c: color };
    });
  };
  wall(24.6, '#b5a050', { metal: 0.6, rough: 0.45 });
  wall(14.6, '#c4c8cc', { metal: 0.7, rough: 0.35 });
  const ori = wall(6.6, '#ff6a2a', { metal: 0.8, rough: 0.3, glow: 0.6 });
  ori.material.emissive = new THREE.Color('#ff5a1a');
  ori.material.emissiveIntensity = 0.55;
  for (const a of [0.3, 2.2, 4.1]) ctx.find('orichalcum', [Math.cos(a) * 6.6, height(Math.cos(a) * 6.6, Math.sin(a) * 6.6) + 1, Math.sin(a) * 6.6], 1.4);
  for (const [a, d] of [[1.2, 8.5], [3.6, 17], [5.3, 27], [0.4, 17]]) ctx.find('rings', [Math.cos(a) * d, height(Math.cos(a) * d, Math.sin(a) * d) + 2, Math.sin(a) * d], 2.5);

  // Bridges across the canals.
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    for (const [a0, b0] of [[7, 10], [15, 19], [25, 29]]) {
      const mid = (a0 + b0) / 2;
      const x = Math.cos(a) * mid, z = Math.sin(a) * mid;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(b0 - a0 + 1.6, 0.35, 2.2), new THREE.MeshStandardMaterial({ color: '#d0c8b0', roughness: 0.9 }));
      deck.position.set(x, height(Math.cos(a) * a0, Math.sin(a) * a0) + 0.2, z);
      deck.rotation.y = -a;
      ctx.group.add(deck);
    }
  }

  // Columns everywhere: standing, broken, toppled.
  const colP = new G.Parts();
  G.rod(colP, 0.32, 0.28, 4, '#ece6d6', G.at(0, 0, 0), 12);
  const cap = new THREE.BoxGeometry(0.9, 0.25, 0.9);
  cap.deleteAttribute('uv');
  colP.add(cap, '#e0d8c4', { m: G.at(0, 4.1, 0) });
  const base = cap.clone();
  colP.add(base, '#e0d8c4', { m: G.at(0, 0.1, 0) });
  const colGeo = colP.build();
  const columns = [];
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, ring = r.pick([12.5, 22, 21, 13]);
    columns.push([Math.cos(a) * ring, Math.sin(a) * ring]);
  }
  ctx.scatter(colGeo, {}, columns.length, (i) => {
    const [x, z] = columns[i];
    const fallen = r() < 0.3;
    return { x, y: height(x, z) + (fallen ? 0.3 : 0), z, ry: r() * 6, rz: fallen ? Math.PI / 2 : 0, sy: fallen ? 1 : 0.4 + r() * 0.6 };
  });

  // The Temple of Poseidon on the central island: silver walls, a colonnade, golden statues.
  const ty = height(0, 0);
  const temple = new THREE.Group();
  temple.position.set(0, ty - 0.3, 0);
  const silver = new THREE.MeshStandardMaterial({ color: '#d8dde4', metalness: 0.9, roughness: 0.28 });
  const goldM = new THREE.MeshStandardMaterial({ color: '#ffc840', metalness: 1, roughness: 0.25, emissive: '#6a4000', emissiveIntensity: 0.5 });
  const stone = new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.8 });
  const podium = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 7), stone);
  podium.position.y = 0.5;
  temple.add(podium);
  const cella = new THREE.Mesh(new THREE.BoxGeometry(7, 4, 3.6), silver);
  cella.position.set(0, 3, 0);
  temple.add(cella);
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 4.6, 12), stone);
    c.position.set(-5 + i * (10 / 6), 3.3, s * 2.9);
    temple.add(c);
  }
  for (const s of [-1, 1]) for (const z of [-1.4, 0, 1.4]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 4.6, 12), stone);
    c.position.set(s * 5.6, 3.3, z);
    temple.add(c);
  }
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 4.4, 1.6, 4, 1).rotateY(Math.PI / 4), silver);
  roof.scale.set(1.75, 1, 1);
  roof.position.y = 6.4;
  roof.rotation.z = 0.06; // settled a little after the sinking
  temple.add(roof);
  for (const x of [-5.4, 5.4, 0]) {
    const st = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 8), goldM);
    st.position.set(x, x === 0 ? 7.7 : 6.2, 0);
    temple.add(st);
  }
  ctx.group.add(temple);
  ctx.find('temple', [0, ty + 4, 0], 4);
  ctx.light('#ffd890', 4, 10, 0, ty + 3, 4.5);

  // Poseidon in his chariot behind six winged horses, in gold, in front of the temple.
  const statue = new THREE.Group();
  statue.position.set(0, ty + 0.7, 5.6);
  const horseP = new G.Parts();
  G.ball(horseP, 0.5, '#ffffff', 0, 0, 0, 0.45, 0.5, 1, 0, 12);
  G.ball(horseP, 0.18, '#ffffff', 0, 0.45, 0.55, 0.7, 0.8, 1.3, 0, 10);
  G.rod(horseP, 0.1, 0.09, 0.5, '#ffffff', G.at(0, 0.15, 0.4, -0.6, 0, 0), 6);
  for (const s of [-1, 1]) {
    G.rod(horseP, 0.06, 0.05, 0.6, '#ffffff', G.at(s * 0.15, -0.15, 0.3, Math.PI - 0.5, 0, 0), 5);
    G.rod(horseP, 0.06, 0.05, 0.6, '#ffffff', G.at(s * 0.15, -0.2, -0.35, Math.PI + 0.2, 0, 0), 5);
    G.fin(horseP, [[0, 0], [s * 1.1, 0.7], [s * 1.3, 0.35], [s * 0.9, 0.1], [s * 0.7, -0.15]], '#ffffff', 'xy', G.at(s * 0.2, 0.25, 0.1, 0, 0, 0));
  }
  const horseGeo = horseP.build();
  const golden = new THREE.MeshStandardMaterial({ vertexColors: true, color: '#ffc840', metalness: 1, roughness: 0.25, emissive: '#5a3800', emissiveIntensity: 0.45, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const h = new THREE.Mesh(horseGeo, golden);
    h.position.set((i % 2 ? 0.75 : -0.75), 0.9, 1.8 + Math.floor(i / 2) * 1.25);
    h.rotation.x = -0.25;
    statue.add(h);
  }
  const chariot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.6, 0.8, 12, 1, true, 0, Math.PI), goldM);
  chariot.position.set(0, 0.6, 0.6);
  chariot.rotation.y = -Math.PI / 2;
  statue.add(chariot);
  for (const s of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.06, 6, 16), goldM);
    wheel.position.set(s * 0.72, 0.45, 0.5);
    wheel.rotation.y = Math.PI / 2;
    statue.add(wheel);
  }
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 10), goldM);
  body.position.set(0, 1.6, 0.4);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), goldM);
  head.position.set(0, 2.6, 0.4);
  const trident = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 6), goldM);
  trident.position.set(0.5, 2.1, 0.5);
  statue.add(body, head, trident);
  for (const dx of [-0.15, 0, 0.15]) {
    const prong = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 5), goldM);
    prong.position.set(0.5 + dx, 3.75, 0.5);
    statue.add(prong);
  }
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 5.6), stone);
  plinth.position.set(0, 0.2, 1.8);
  statue.add(plinth);
  ctx.group.add(statue);
  ctx.find('statue', [0, ty + 2.2, 7.4], 2.4);

  // Sea grass and sponges reclaiming the city.
  ctx.scatter(G.grassGeo({ color: '#3a7a4a', color2: '#8ac870', h: 0.7 }), { mode: 'sway', amp: 0.2, freq: 0.9 }, 160, () => { const [x, z] = around(r, 2, 50); return { x, y: height(x, z), z, s: 0.8 + r(), ry: r() * 6 }; });
  ctx.scatter(G.branchGeo({ style: 'fan', color: '#a03a8a', tip: '#ff8ad0' }), { mode: 'sway', amp: 0.05, freq: 0.7 }, 40, () => { const [x, z] = around(r, 6, 40); return { x, y: height(x, z), z, s: 0.8 + r(), ry: r() * 6 }; });
  ctx.scatter(G.brainCoralGeo({ color: '#d8a060', color2: '#a0a050' }), {}, 40, () => { const [x, z] = around(r, 6, 40); return { x, y: height(x, z) - 0.1, z, s: 0.3 + r() * 0.5, ry: r() * 6 }; });

  // A common octopus exploring the ruins.
  const octo = G.octopusGeo({ r: 0.22, color: '#a8542a', color2: '#e0905a', arm: 2.8, curl: 0.15 });
  for (const [x, z] of [[4, 4], [-12, 6]]) {
    const o = ctx.swimmer(octo, { mode: 'pulse', freq: 1.2, amp: 0.05 }, { behave: 'crawl', home: [x, height(x, z), z], range: 3, speed: 0.15, turn: 0.8, lift: 0.3 });
    ctx.find('octopus', o, 0.8);
  }

  // Moray eels peering from the walls.
  const moray = G.eelGeo({ len: 1.6, w: 0.09, h: 0.11, top: '#3a5a2a', belly: '#6a8a3a', dorsalRibbon: 0.03, finColor: '#4a6a30', eye: 0.012,
    paint: (t, u, s, out) => { out.set('#3c5a2c'); if (Math.sin(t * 90 + s * 6) * Math.sin(u * 14) > 0.5) out.set('#c8c860'); } });
  for (const a of [1.0, 3.4]) {
    const x = Math.cos(a) * 14.2, z = Math.sin(a) * 14.2;
    const m = ctx.swimmer(moray, { mode: 'fish', freq: 2, amp: 0.05 }, { behave: 'hover', home: [x, height(x, z) + 0.5, z], range: 0.4, yMin: height(x, z) + 0.3, yMax: height(x, z) + 0.8, speed: 0.1, turn: 0.6, clear: 0.3 });
    ctx.find('moray', m, 0.8);
  }

  // Bottlenose dolphins.
  const dolphin = G.mammalGeo({
    len: 2.8, w: 0.18, h: 0.19, peak: 0.55, blunt: 0.5, fluke: 0.14, dorsal: [0.47, 0.07], pect: 0.12, pectZ: 0.72, eye: 0.006, beak: 0.07, beakR: 0.045 * 2.8, beakColor: '#7a8088',
    paint: (t, u, s, out) => out.set('#6a7078').lerp(new THREE.Color('#e8eaec'), clamp(-u * 1.4 - 0.1, 0, 1)),
  });
  for (let i = 0; i < 3; i++) {
    const d = ctx.swimmer(dolphin, { mode: 'whale', freq: 2.6, amp: 0.08 }, { behave: 'circle', home: [0, -12 - i, 0], range: 22 + i * 1.5, speed: 3, bob: 3, clear: 3 });
    d.userData.swimmer.angle = i * 0.25;
    ctx.find('dolphins', d, 1.6);
  }

  // Schools of silver fish swirling around the temple.
  const fish = G.fishGeo({ len: 0.3, h: 0.28, w: 0.12, tail: 'fork', dorsal: [0.4, 0.6, 0.08], top: '#4a7a9a', belly: '#e8f0f4', finColor: '#c8d8e0', eye: 0.045 });
  ctx.school(fish, { mode: 'fish', freq: 9, amp: 0.08, rough: 0.3, metal: 0.5 }, { count: 60, radius: 3.5, flat: 0.5, swirl: 0.25, home: [0, ty + 9, 0], range: 1, yMin: ty + 8, yMax: ty + 10, speed: 0.3, clear: 3 });
  const gold = G.fishGeo({ len: 0.18, h: 0.4, w: 0.12, tail: 'lunate', dorsal: [0.3, 0.75, 0.1], top: '#ffb030', belly: '#ffe090', finColor: '#ff9a20', eye: 0.05 });
  ctx.school(gold, { mode: 'fish', freq: 12, amp: 0.1 }, { count: 30, radius: 2, flat: 0.5, home: [-14, -20, -8], range: 10, yMin: -24, yMax: -16, speed: 0.6, clear: 1 });

  // Outside the city: a real sunken-city colossus, like the red granite giants of Thonis-Heracleion.
  const hx = 36, hz = -20, hy = height(hx, hz);
  const coloP = new G.Parts();
  const granite = (x, y, z, out) => out.set('#a8584a').lerp(new THREE.Color('#d8a090'), clamp(Math.sin(x * 23 + z * 19) * Math.sin(y * 17), 0, 1) * 0.5);
  G.ball(coloP, 1, granite, 0, 0, 0, 0.9, 0.55, 2.2, 0, 14);
  G.ball(coloP, 0.55, granite, 0, 0.15, 2.4, 1, 1.1, 1, 0, 14);
  const crown = new THREE.CylinderGeometry(0.35, 0.55, 1.0, 10).rotateX(Math.PI / 2);
  crown.deleteAttribute('uv');
  coloP.add(crown, granite, { m: G.at(0, 0.2, 3.3) });
  for (const s of [-1, 1]) G.rod(coloP, 0.3, 0.25, 2.2, granite, G.at(s * 0.5, -0.1, -1.4, -Math.PI / 2, 0, 0), 8);
  const colossus = ctx.prop(coloP.build(), {}, hx, hy + 0.3, hz, { ry: 2.2, s: 1.2 });
  ctx.find('heracleion', colossus, 2.6);

  ctx.start = { pos: [0, -12, 34], yaw: 0, pitch: -0.25 };
  ctx.bounds = { r: 52, yMin: -32, yMax: 0 };
  ctx.tour = [[0, -12, 32], [18, -14, 18], [24, -17, -2], [8, -14, -16], [-12, -15, -12], [-18, -12, 8], [-4, -10, 12], [0, -11, 4]];
}
