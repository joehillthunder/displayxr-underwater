// 07 Cenote Cave: Yucatán. A sunlit sinkhole opening into a flooded limestone cave full of Ice-Age
// stalactites, a shimmering halocline where fresh water floats on salt, blind cave fish and
// shrimp in the dark, catfish under the opening, Maya offerings, and Ice-Age bones in a deep pit.

import { THREE, fbm, clamp, smooth, around } from './common.js';
import * as G from '../models.js';
import { TIME } from '../models.js';

export const env = {
  fog: '#0d3a42', density: 0.026, top: '#7af0e0', bottom: '#02090c', sunGlow: '#ffffff',
  hemiSky: '#a8f0e8', hemiGround: '#101818', hemi: 0.35, light: 0.25, ambient: 0.1,
  surface: 0, surfaceSky: '#f8fff0', surfaceMirror: '#0d3a42',
  rays: 1.6, rayCenter: [0, 0], rayTop: 0, rayColor: '#f0fff0', caustics: 0.5, causticFade: 8, lightDepth: 12,
  particles: { color: '#e8fff8', size: 1.1, count: 700, fall: 0.004, opacity: 0.3 },
  lamp: 0.7, exposure: 1.15, edgeText: 'The cave passage narrows here. Divers never go further without a guideline.',
};

const HOLE = 7.5;
const ceilH = (x, z) => {
  const d = Math.hypot(x, z);
  const roof = -3.2 - fbm(x * 0.06, z * 0.06, 3) * 1.6 - smooth(10, 36, d) * 4;
  return roof + (1.0 - roof) * (1 - smooth(HOLE * 0.8, HOLE * 1.15, d + fbm(x * 0.3, z * 0.3) * 1.5));
};
const height = (x, z) => {
  const d = Math.hypot(x, z);
  const pit = -9 * Math.max(0, 1 - Math.hypot(x + 22, z + 16) / 7); // Hoyo Negro, the deep pit
  const floor = -20 + fbm(x * 0.05, z * 0.05, 4) * 3 + (1 - smooth(0, HOLE * 1.3, d)) * 5 + pit; // rubble cone under the hole
  return Math.min(floor + smooth(32, 42, d) * 30, ceilH(x, z) - 0.2);
};
const HALO = -13;

export function build(ctx) {
  const r = ctx.r;
  const lime = new THREE.Color('#c8bc98'), white = new THREE.Color('#e8e0c8'), dark = new THREE.Color('#5a5446');
  ctx.floor({ size: 110, seg: 140, height, paint: (x, z, y, out) => out.copy(lime).lerp(white, fbm(x * 0.2, z * 0.2) * 0.5 + 0.5).lerp(dark, clamp((-y - 18) / 10, 0, 0.7)) });
  const roof = ctx.ceiling({ size: 110, seg: 140, height: ceilH, paint: (x, z, y, out) => out.copy(lime).lerp(dark, clamp(fbm(x * 0.15, z * 0.15) + 0.3, 0, 0.8)) });
  roof.material.roughness = 1;

  // Light through the opening: a spotlight from the sinkhole.
  const sun = new THREE.SpotLight('#fffbe8', 900, 60, 0.42, 0.6, 1.4);
  sun.position.set(0, 4, 0);
  sun.target.position.set(0, -20, 0);
  ctx.group.add(sun, sun.target);

  // Stalactites and stalagmites (and the columns where they meet).
  const cone = new THREE.ConeGeometry(0.25, 2, 7, 3);
  cone.deleteAttribute('uv');
  const pos = cone.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * (1 + 0.15 * Math.sin(pos.getY(i) * 9)));
  cone.computeVertexNormals();
  const stal = new G.Parts().add(cone, (x, y, z, out) => out.set('#d8ccb0').lerp(new THREE.Color('#a89878'), clamp(0.5 - y * 0.3, 0, 1))).build();
  const tites = [], mites = [];
  for (let i = 0; i < 600 && tites.length < 230; i++) {
    const [x, z] = around(r, HOLE * 1.2, 38);
    const c = ceilH(x, z), f = height(x, z);
    if (c - f < 2.5) continue;
    tites.push([x, c, z, 0.4 + r() * 1.6]);
    if (r() < 0.5) mites.push([x + (r() - 0.5) * 0.4, f, z + (r() - 0.5) * 0.4, 0.3 + r() * 1.1]);
  }
  ctx.scatter(stal, { caustics: false }, tites.length, (i) => { const [x, y, z, s] = tites[i]; return { x, y: y - s * 0.9, z, sx: s * 0.8, sy: s, sz: s * 0.8, rx: Math.PI, ry: r() * 6 }; });
  ctx.scatter(stal, { caustics: false }, mites.length, (i) => { const [x, y, z, s] = mites[i]; return { x, y: y + s * 0.9, z, sx: s, sy: s, sz: s, ry: r() * 6 }; });
  for (const [x, y, z, s] of tites.filter((t) => Math.hypot(t[0], t[2]) < 18).slice(0, 6)) ctx.find('stalactites', [x, y - s, z], 1.2);
  ctx.scatter(G.rockGeo({ color: '#a89a78', color2: '#d8ccb0', seed: 3 }), {}, 70, () => { const [x, z] = around(r, 0, HOLE * 1.4); return { x, y: height(x, z) - 0.2, z, s: 0.4 + r() * 1.2, ry: r() * 6 }; });

  // The halocline: a shimmering layer. Swimming through it blurs your view.
  const haloMat = new THREE.ShaderMaterial({
    uniforms: { uTime: TIME },
    vertexShader: 'varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec3 vW; uniform float uTime;
      void main() {
        float n = sin(vW.x * 1.7 + uTime * 0.8) * sin(vW.z * 1.3 - uTime * 0.6) + sin((vW.x - vW.z) * 3.1 + uTime * 1.3) * 0.5;
        float fade = 1.0 - smoothstep(10.0, 30.0, length(vW.xz - cameraPosition.xz));
        gl_FragColor = vec4(vec3(0.75, 0.95, 1.0), (0.07 + 0.06 * n) * fade);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), haloMat);
  halo.position.y = HALO;
  ctx.group.add(halo);
  for (const [x, z] of [[0, 10], [-12, -4], [10, -10], [14, 6]]) ctx.find('halocline', [x, HALO, z], 2.5);
  const canvas = document.getElementById('stage');
  ctx.tick((dt, t, w) => {
    const d = Math.abs(w.player.y - HALO);
    canvas.style.filter = d < 0.8 ? `blur(${((0.8 - d) * 3).toFixed(2)}px)` : '';
  });

  // The opening itself (part of the ring of cenotes around the Chicxulub crater).
  ctx.find('chicxulub', [0, -1.5, 0], 4);

  // Blind cave fish in the dark passages.
  const brotula = G.eelGeo({ len: 0.16, w: 0.12, h: 0.13, top: '#e8d0c8', belly: '#f4e4dc', ribbon: 0.03, dorsalRibbon: 0.03, finColor: '#f0dcd4', eye: 0 });
  for (const [x, z] of [[-20, 10], [18, -18], [24, 10]]) {
    const y = height(x, z) + 0.6;
    const f = ctx.swimmer(brotula, { mode: 'fish', freq: 6, amp: 0.12 }, { home: [x, y, z], range: 4, yMin: y - 0.3, yMax: y + 1, speed: 0.15, turn: 1, clear: 0.3, shy: 1.2 }, { scale: 2 });
    ctx.find('brotula', f, 0.5);
  }

  // Cave shrimp: see-through specks hovering in the dark.
  const shrimp = G.shrimpGeo({ len: 0.02, color: '#f4f0e8', curl: 0.6, glow: 0.15 });
  for (const [x, z] of [[-16, -12], [20, 2]]) {
    const y = height(x, z) + 1.2;
    const s = ctx.school(shrimp, { mode: 'fish', freq: 12, amp: 0.2, opacity: 0.6 }, { count: 30, radius: 1, flat: 0.8, home: [x, y, z], range: 1, yMin: y - 0.3, yMax: y + 0.3, speed: 0.06, clear: 0.5, avoid: 0.6 });
    s.mesh.scale.setScalar(1);
    ctx.find('shrimp', s, 1.2);
  }

  // Catfish under the opening, where food falls in.
  const cat = G.fishGeo({ len: 0.3, h: 0.16, w: 0.16, peak: 0.7, blunt: 0.5, tail: 'fork', dorsal: [0.55, 0.7, 0.08], anal: [0.1, 0.35, 0.05], pect: 0.12, eye: 0.025, top: '#6a5a48', belly: '#c8b8a0', finColor: '#5a4a3a', barbels: '#3a3028' });
  for (let i = 0; i < 3; i++) {
    const [x, z] = around(r, 2, HOLE);
    const y = height(x, z) + 0.6;
    const c = ctx.swimmer(cat, { mode: 'fish', freq: 5, amp: 0.08 }, { home: [x, y, z], range: 5, yMin: y - 0.3, yMax: y + 1.5, speed: 0.25, turn: 1, clear: 0.4, shy: 1.5 });
    ctx.find('catfish', c, 0.5);
  }

  // Maya offerings: pots and a jade bead necklace resting among the rubble.
  const potPts = [[0, 0], [0.12, 0.01], [0.17, 0.08], [0.15, 0.2], [0.09, 0.27], [0.1, 0.32], [0.08, 0.33]].map(([a, b]) => new THREE.Vector2(a, b));
  const potGeo = new THREE.LatheGeometry(potPts, 14);
  potGeo.deleteAttribute('uv');
  const pot = new G.Parts().add(potGeo, (x, y, z, out) => out.set(Math.abs(y - 0.17) < 0.025 ? '#2a1a10' : '#b0603a')).build();
  const mx = 3.5, mz = -2.5, my = height(mx, mz);
  ctx.prop(pot, {}, mx, my - 0.03, mz, { s: 1.4, rz: 0.15 });
  ctx.prop(pot, {}, mx + 0.6, my - 0.05, mz + 0.3, { s: 1.1, rz: 1.4, ry: 1 });
  ctx.prop(pot, {}, mx - 0.4, my - 0.02, mz + 0.5, { s: 0.9 });
  const jade = new G.Parts();
  for (let i = 0; i < 12; i++) G.ball(jade, 0.025, '#2fa86a', Math.cos(i / 2) * 0.18, 0.02, Math.sin(i / 2) * 0.15, 1, 1, 1, 0.1, 8);
  ctx.prop(jade.build(), {}, mx + 0.2, my + 0.02, mz - 0.4);
  ctx.find('maya', [mx + 0.2, my + 0.2, mz], 1.0);

  // Ice-Age bones at the bottom of the deep pit: a gomphothere skull with tusks, ribs.
  const bx = -22, bz = -16, by = height(bx, bz);
  const bone = '#e8dcc0';
  const bones = new G.Parts();
  G.ball(bones, 0.35, bone, 0, 0.25, 0, 1.2, 0.8, 1, 0, 12);
  G.ball(bones, 0.08, '#2a2418', -0.18, 0.32, 0.25, 1, 1, 1, 0, 6);
  G.ball(bones, 0.08, '#2a2418', 0.18, 0.32, 0.25, 1, 1, 1, 0, 6);
  for (const s of [-1, 1]) G.rod(bones, 0.05, 0.02, 1.1, bone, G.at(s * 0.2, 0.15, 0.2, 1.2, s * 0.25, 0), 6);
  for (let i = 0; i < 6; i++) G.rod(bones, 0.025, 0.02, 0.8, bone, G.at(0.9 + i * 0.18, 0.05, -0.3, 0.2, 0, 1.1 - i * 0.05), 5);
  const skull = ctx.prop(bones.build(), { caustics: false }, bx, by, bz, { ry: 0.7 });
  ctx.light('#9ff0ff', 2, 6, bx, by + 2, bz);
  ctx.find('bones', skull, 1.3);

  ctx.depthAt = (y) => Math.max(0, -y);
  ctx.start = { pos: [0, -4, 4], yaw: 0, pitch: -0.4 };
  ctx.bounds = { r: 36, yMin: -32, yMax: 0 };
  ctx.tour = [[0, -4, 4], [-6, -10, 10], [-16, -14, 2], [-12, -16, -12], [4, -14, -16], [16, -12, -4], [10, -8, 10]];
}
