// Procedural models for every creature, plant and prop. No downloaded assets: each model is built
// from a few parametric parts (a body tube, flat fins, spheres, cones), merged into ONE geometry
// with vertex colours, so a creature is one draw call and a school is one instanced draw call.
//
// Animation runs on the GPU. swimMat() patches a MeshStandardMaterial so the vertex shader bends
// the body: fish wag side to side, whales and dolphins pump up and down, rays and turtles flap,
// jellyfish pulse, kelp sways. Instances of a mesh get their own phase from gl_InstanceID.
//
// Convention: head at +z, back at +y, length along z centred on 0. A `glow` value per part makes
// it light up (lures, photophores, eyes in the dark), scaled at runtime by the material's uGlow.

import * as THREE from 'three';
import { clamp, rng } from './util.js';

export const TIME = { value: 0 };
const C = (c) => new THREE.Color(c);
const tmpC = new THREE.Color();

// ── swim material ───────────────────────────────────────────────────────────────────────────────

const MODES = { none: -1, fish: 0, whale: 1, flap: 2, pulse: 3, sway: 4 };

/**
 * opts: mode, freq (rad/s), amp, len (body length), span/span0 (flap: wing tip / where flapping
 * starts, in |x|), phase, rough, opacity, glow, side.
 */
export function swimMat(opts = {}) {
  const o = { mode: 'fish', freq: 6, amp: 0.08, len: 1, span: 1, span0: 0, phase: 0, rough: 0.6, glow: 1, ...opts };
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: o.rough,
    metalness: o.metal ?? 0,
    side: o.side ?? THREE.DoubleSide,
    transparent: o.opacity != null && o.opacity < 1,
    opacity: o.opacity ?? 1,
    depthWrite: !(o.opacity != null && o.opacity < 1),
  });
  const u = (m.userData.u = {
    uTime: TIME,
    uFreq: { value: o.freq },
    uAmp: { value: o.amp },
    uLen: { value: o.len },
    uSpan: { value: o.span },
    uSpan0: { value: o.span0 },
    uPhase: { value: o.phase },
    uGlow: { value: o.glow },
  });
  m.defines = { SWIM_MODE: MODES[o.mode] ?? -1 };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime, uFreq, uAmp, uLen, uSpan, uSpan0, uPhase;
        attribute float glow;
        varying float vGlow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGlow = glow;
        float ph = uPhase;
        #ifdef USE_INSTANCING
          ph += float(gl_InstanceID) * 2.399;
        #endif
        float tt = uTime * uFreq + ph;
        #if SWIM_MODE == 0
          float k = clamp((uLen * 0.42 - position.z) / uLen, 0.0, 1.2);
          transformed.x += sin(tt - k * 4.0) * uAmp * uLen * k * k;
        #elif SWIM_MODE == 1
          float k = clamp((uLen * 0.3 - position.z) / uLen, 0.0, 1.2);
          transformed.y += sin(tt - k * 3.0) * uAmp * uLen * k * k;
        #elif SWIM_MODE == 2
          float s = clamp((abs(position.x) - uSpan0) / max(uSpan - uSpan0, 0.001), 0.0, 1.0);
          transformed.y += sin(tt - position.z * 2.0 / uLen) * uAmp * uSpan * s * s;
        #elif SWIM_MODE == 3
          float c = 0.5 + 0.5 * sin(tt);
          float bell = smoothstep(-0.05 * uLen, 0.15 * uLen, position.y);
          transformed.xz *= 1.0 - uAmp * c * bell;
          transformed.y += uAmp * 0.25 * uLen * c * bell;
          float hang = clamp(-position.y / uLen, 0.0, 4.0);
          transformed.x += sin(uTime * 1.3 + ph + position.y * 2.5 / uLen) * 0.12 * uLen * hang;
          transformed.z += cos(uTime * 1.1 + ph + position.y * 2.0 / uLen) * 0.12 * uLen * hang;
        #elif SWIM_MODE == 4
          float hgt = clamp(position.y / uLen, 0.0, 1.0);
          float sw = sin(uTime * uFreq + ph - position.y * 0.35);
          transformed.x += sw * uAmp * uLen * hgt * hgt;
          transformed.z += cos(uTime * uFreq * 0.73 + ph * 1.3 - position.y * 0.3) * uAmp * 0.6 * uLen * hgt * hgt;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uGlow;
        varying float vGlow;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vColor.rgb * vGlow * uGlow;`);
  };
  m.customProgramCacheKey = () => 'swim' + m.defines.SWIM_MODE;
  return m;
}

// ── geometry assembly ───────────────────────────────────────────────────────────────────────────

/** Collects parts (any BufferGeometry), colours them and merges them into one geometry. */
export class Parts {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.glw = [];
  }
  /** color: a colour, or fn(x, y, z, out:Color) in the part's final coordinates. */
  add(geo, color, { m, glow = 0 } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal;
    const fixed = typeof color === 'function' ? null : C(color);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      this.pos.push(x, y, z);
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      if (fixed) tmpC.copy(fixed);
      else color(x, y, z, tmpC);
      this.col.push(tmpC.r, tmpC.g, tmpC.b);
      this.glw.push(glow);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(this.glw, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const M = () => new THREE.Matrix4();
const at = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  M().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

/**
 * A body tube along z, head at +len/2. prof(t) → [rx, ry, yOffset] in units of len, t from 0
 * (tail) to 1 (head). Coloured by paint(t, up, side, out) where up/side are -1..1 on the ring.
 */
export function tube(len, prof, paint, rings = 22, seg = 16) {
  const pos = [], idx = [], cols = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const [rx, ry, yo] = prof(t);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const s = Math.cos(a), u = Math.sin(a);
      pos.push(s * rx * len, (u * ry + (yo || 0)) * len, (t - 0.5) * len);
      paint(t, u, s, tmpC);
      cols.push(tmpC.r, tmpC.g, tmpC.b);
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Add a tube whose colours were painted per vertex (keeps them through Parts). */
function addTube(parts, g, opts) {
  const ng = g.toNonIndexed();
  const c = ng.attributes.color;
  let i = 0;
  parts.add(ng, (x, y, z, out) => { out.setRGB(c.getX(i), c.getY(i), c.getZ(i)); i++; }, opts);
  g.dispose();
}

/** A flat fin from 2D points. plane: 'zy' (dorsal/tail), 'xz' (pectoral/flukes), 'xy'. */
function fin(parts, pts, color, plane, m, glow = 0) {
  const shape = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ShapeGeometry(shape);
  g.deleteAttribute('uv');
  if (plane === 'zy') g.rotateY(-Math.PI / 2);
  else if (plane === 'xz') g.rotateX(Math.PI / 2);
  parts.add(g, color, { m, glow });
}

function ball(parts, r, color, x, y, z, sx = 1, sy = sx, sz = sx, glow = 0, seg = 10) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0));
  g.deleteAttribute('uv');
  parts.add(g, color, { m: at(x, y, z, 0, 0, 0, sx, sy, sz), glow });
}

function rod(parts, r0, r1, len, color, m, seg = 6, glow = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.deleteAttribute('uv');
  g.translate(0, len / 2, 0);
  parts.add(g, color, { m, glow });
}

/** Eyes on both sides of the head at (z, y) with radius r, as fractions of len. */
function eyes(parts, len, z, y, x, r, iris = '#111', glow = 0) {
  for (const s of [-1, 1]) {
    ball(parts, r * len, '#f2f2ee', s * x * len, y * len, z * len, 0.6, 1, 1, 0, 8);
    ball(parts, r * 0.7 * len, iris, s * (x + r * 0.35) * len, y * len, z * len, 0.5, 1, 1, glow, 8);
  }
}

// Profiles: rx, ry, yOffset per t (tail 0 → head 1), all in units of length.
const spindle = (w, h, peak = 0.6, blunt = 0.6) => (t) => {
  const k = Math.log(0.5) / Math.log(peak);
  const s = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(t, k))), blunt);
  const r = 0.04 + 0.96 * s;
  return [w * r * 0.5, h * r * 0.5, 0];
};

const mix = (a, b, t, out) => out.copy(C(a)).lerp(C(b), clamp(t, 0, 1));
const counter = (top, belly, edge = 0) => (t, u, s, out) => mix(belly, top, (u + 0.25 - edge) * 1.6, out);

// ── fish ───────────────────────────────────────────────────────────────────────────────────────

/**
 * A ray-finned fish (or a shark with tail: 'shark'). Most species are this with options.
 *   len, h, w (fractions of len), peak, blunt, paint(t, up, side, out), tail: 'fork' | 'round'
 *   | 'lunate' | 'shark' | 'none', tailSize, finColor, dorsal [from, to, height], anal, pect,
 *   eye, bill, sail, lure, photophores, barbels, teeth.
 */
export function fishGeo(o) {
  const len = o.len ?? 1;
  const p = new Parts();
  const prof = o.prof ?? spindle(o.w ?? 0.16, o.h ?? 0.3, o.peak ?? 0.6, o.blunt ?? 0.6);
  addTube(p, tube(len, prof, o.paint ?? counter(o.top ?? '#4a6a8a', o.belly ?? '#dfe6ea'), o.rings ?? 22, o.seg ?? 14));
  const fc = o.finColor ?? o.top ?? '#4a6a8a';
  const ts = (o.tailSize ?? 0.22) * len;
  const tz = -0.5 * len + 0.02 * len;
  const tc = o.tailColor ?? fc;
  if (o.tail === 'fork' || !o.tail) fin(p, [[0, 0], [-ts * 0.9, ts * 0.85], [-ts * 0.55, 0], [-ts * 0.9, -ts * 0.85]], tc, 'zy', at(0, 0, tz));
  else if (o.tail === 'round') fin(p, [[0, 0], [-ts * 0.6, ts * 0.6], [-ts * 0.95, ts * 0.3], [-ts, 0], [-ts * 0.95, -ts * 0.3], [-ts * 0.6, -ts * 0.6]], tc, 'zy', at(0, 0, tz));
  else if (o.tail === 'lunate') fin(p, [[0, 0], [-ts * 0.5, ts * 1.1], [-ts * 0.35, 0], [-ts * 0.5, -ts * 1.1]], tc, 'zy', at(0, 0, tz));
  else if (o.tail === 'shark') fin(p, [[0.05 * len, 0], [-ts * 1.05, ts * 1.1], [-ts * 0.75, ts * 0.5], [-ts * 0.3, -ts * 0.15], [-ts * 0.55, -ts * 0.55], [0, -0.02 * len]], tc, 'zy', at(0, 0, tz));
  if (o.dorsal) {
    const [a, b, hgt] = o.dorsal;
    const ry = prof(0.5)[1];
    const z0 = (a - 0.5) * len, z1 = (b - 0.5) * len, top = (ry * 0.9) * len;
    const pts = o.tail === 'shark' || o.pointy
      ? [[z1, top], [z1 - (z1 - z0) * 0.55, top + hgt * len], [z0, top + hgt * len * 0.25], [z0 + 0.02 * len, top]]
      : [[z1, top], [z1 - (z1 - z0) * 0.2, top + hgt * len], [z0 + (z1 - z0) * 0.15, top + hgt * len * 0.9], [z0, top + hgt * len * 0.15], [z0, top]];
    fin(p, pts.map(([z, y]) => [z, y]), o.dorsalColor ?? fc, 'zy', at(0, 0, 0));
  }
  if (o.anal) {
    const [a, b, hgt] = o.anal;
    const ry = prof(0.4)[1];
    const z0 = (a - 0.5) * len, z1 = (b - 0.5) * len, bot = -(ry * 0.85) * len;
    fin(p, [[z1, bot], [z1 - (z1 - z0) * 0.3, bot - hgt * len], [z0, bot - hgt * len * 0.5], [z0, bot]], o.analColor ?? fc, 'zy', at(0, 0, 0));
  }
  if (o.pect !== 0) {
    const ps = (o.pect ?? 0.12) * len;
    const pz = (o.pectZ ?? 0.68) - 0.5;
    const rx = prof(o.pectZ ?? 0.68)[0] * len;
    for (const s of [-1, 1]) {
      const sw = o.tail === 'shark' ? 0.55 : 0.9;
      fin(p, [[0, 0], [s * ps * 1.0, -ps * sw], [s * ps * 0.35, -ps * 1.1], [0, -ps * 0.3]], o.pectColor ?? fc, 'xz',
        at(s * rx * 0.85, -(o.pectY ?? 0.02) * len, pz * len, 0, 0, s * (o.tail === 'shark' ? 0.2 : 0.5)));
    }
  }
  if (o.eye !== 0) eyes(p, len, o.eyeZ ?? 0.38, o.eyeY ?? 0.035, prof(o.eyeZ != null ? o.eyeZ + 0.5 : 0.88)[0] * 0.92, o.eye ?? 0.035, o.iris, o.eyeGlow ?? 0);
  if (o.bill) rod(p, 0.012 * len, 0.002 * len, o.bill * len, o.top ?? '#334', at(0, 0, 0.47 * len, Math.PI / 2, 0, 0));
  if (o.sail) {
    const ry = prof(0.6)[1] * len;
    const pts = [[0.36 * len, ry], [0.28 * len, ry + o.sail * len], [0.05 * len, ry + o.sail * len * 1.05], [-0.18 * len, ry + o.sail * len * 0.4], [-0.22 * len, ry * 0.9]];
    fin(p, pts, o.sailColor ?? '#2b3f8f', 'zy', at(0, 0, 0));
  }
  if (o.lure) {
    rod(p, 0.012 * len, 0.008 * len, 0.35 * len, '#2a2622', at(0, 0.18 * len, 0.25 * len, 1.0, 0, 0));
    ball(p, 0.045 * len, o.lure, 0, 0.36 * len, 0.5 * len, 1, 1, 1, 3.5, 10);
  }
  if (o.teeth) {
    for (let i = 0; i < 10; i++) {
      const a = (i / 9 - 0.5) * 2.4;
      const g = new THREE.ConeGeometry(0.008 * len, 0.06 * len, 4);
      g.deleteAttribute('uv');
      p.add(g, '#e8e2d0', { m: at(Math.sin(a) * 0.13 * len, -0.02 * len, 0.47 * len + Math.cos(a) * 0.02 * len, i % 2 ? Math.PI : 0, 0, 0) });
    }
  }
  if (o.photophores) {
    for (let i = 0; i < 14; i++) {
      const t = 0.2 + (i % 7) * 0.09;
      const [rx, ry] = prof(t);
      const s = i < 7 ? -1 : 1;
      ball(p, 0.012 * len, o.photophores, s * rx * 0.75 * len, -ry * 0.65 * len, (t - 0.5) * len, 1, 1, 1, 4, 6);
    }
  }
  if (o.barbels) for (const s of [-1, 1]) for (const k of [0, 1]) rod(p, 0.006 * len, 0.002 * len, (0.3 - k * 0.12) * len, o.barbels, at(s * 0.04 * len, -0.02 * len - k * 0.02 * len, 0.48 * len, Math.PI / 2 - 0.2, 0, s * (0.6 + k * 0.4)), 4);
  if (o.extra) o.extra(p, len, prof);
  return p.build();
}

// ── cetaceans and other mammals ────────────────────────────────────────────────────────────────

/** Whales, dolphins, seals, manatees: a tube, horizontal flukes (or flipper pair), pectorals. */
export function mammalGeo(o) {
  const len = o.len ?? 4;
  const p = new Parts();
  const prof = o.prof ?? spindle(o.w ?? 0.2, o.h ?? 0.2, o.peak ?? 0.62, o.blunt ?? 0.55);
  addTube(p, tube(len, prof, o.paint ?? counter(o.top ?? '#4b5563', o.belly ?? '#d6d9de'), 24, 16));
  const fc = o.finColor ?? o.top ?? '#4b5563';
  const fl = (o.fluke ?? 0.14) * len;
  const tz = -0.5 * len + 0.01 * len;
  if (o.flukes === 'paddle') fin(p, [[0, 0], [fl * 0.8, -fl * 0.3], [fl * 0.6, -fl * 1.1], [0, -fl * 1.3], [-fl * 0.6, -fl * 1.1], [-fl * 0.8, -fl * 0.3]], fc, 'xz', at(0, 0, tz));
  else if (o.flukes === 'seal') {
    for (const s of [-1, 1]) fin(p, [[0, 0], [s * fl * 0.5, -fl * 0.9], [s * fl * 0.1, -fl * 1.1], [-s * fl * 0.05, -fl * 0.3]], fc, 'xz', at(s * 0.015 * len, 0, tz, 0, 0, s * 1.2));
  } else fin(p, [[0, 0], [fl * 1.1, -fl * 0.5], [fl * 0.9, -fl * 0.85], [fl * 0.1, -fl * 0.55], [0, -fl * 0.62], [-fl * 0.1, -fl * 0.55], [-fl * 0.9, -fl * 0.85], [-fl * 1.1, -fl * 0.5]], o.flukeColor ?? fc, 'xz', at(0, 0, tz));
  if (o.dorsal) {
    const [z, hgt] = o.dorsal;
    const ry = prof(z)[1] * len;
    fin(p, [[(z - 0.5) * len + 0.05 * len, ry * 0.9], [(z - 0.5) * len - 0.04 * len, ry + hgt * len], [(z - 0.5) * len - 0.07 * len, ry * 0.9]], fc, 'zy', at(0, 0, 0));
  }
  const pl = (o.pect ?? 0.12) * len;
  const pz = (o.pectZ ?? 0.72);
  const rx = prof(pz)[0] * len;
  for (const s of [-1, 1]) {
    fin(p, [[0, 0.03 * len], [s * pl, -pl * 0.35], [s * pl * 0.9, -pl * 0.5], [0, -0.02 * len]], o.pectColor ?? fc, 'xz',
      at(s * rx * 0.9, -prof(pz)[1] * len * 0.55, (pz - 0.5) * len, 0, 0, s * (o.pectDroop ?? 0.45)));
  }
  eyes(p, len, o.eyeZ ?? 0.39, o.eyeY ?? 0.0, prof(o.eyeZ != null ? o.eyeZ + 0.5 : 0.89)[0] * 0.95, o.eye ?? 0.012, '#111');
  if (o.beak) {
    const g = new THREE.CylinderGeometry(0.015 * len, o.beakR ?? 0.03 * len, o.beak * len, 10);
    g.deleteAttribute('uv');
    g.rotateX(Math.PI / 2);
    p.add(g, o.beakColor ?? o.top ?? '#666', { m: at(0, (o.beakY ?? -0.01) * len, (0.5 + o.beak * 0.4) * len) });
  }
  if (o.extra) o.extra(p, len, prof);
  return p.build();
}

// ── flat swimmers ──────────────────────────────────────────────────────────────────────────────

/** Rays: a disc/diamond grid, thick in the middle. kind: 'manta' | 'disc'. */
export function rayGeo(o) {
  const span = o.span ?? 3, len = o.len ?? span * 0.55;
  const N = 20, Mz = 12;
  const pos = [], idx = [], cols = [];
  const top = C(o.top ?? '#222'), bot = C(o.belly ?? '#eee');
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const u = (i / N) * 2 - 1;
      let front, back;
      if (o.kind === 'disc') {
        const r = Math.sqrt(Math.max(0, 1 - u * u));
        front = r * len * 0.5;
        back = -r * len * 0.5;
      } else {
        const au = Math.abs(u);
        front = len * (0.42 - 0.55 * Math.pow(au, 1.5));
        back = -len * (0.35 - 0.1 * au) * (1 - Math.pow(au, 3)) - 0.02;
        front = Math.max(front, back + 0.02);
      }
      for (let j = 0; j <= Mz; j++) {
        const v = j / Mz;
        const z = back + (front - back) * v;
        const th = (o.thick ?? 0.12) * len * (1 - u * u) * Math.sin(Math.PI * v) * (o.kind === 'disc' ? 1 : 0.9);
        pos.push((u * span) / 2, side * th, z);
        const c = side > 0 ? top.clone() : bot.clone();
        if (side > 0 && o.paint) o.paint(u, v, c);
        cols.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < N; i++)
      for (let j = 0; j < Mz; j++) {
        const a = base + i * (Mz + 1) + j, b = a + Mz + 1;
        if (side > 0) idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const p = new Parts();
  addTube(p, g);
  rod(p, 0.012 * span, 0.002 * span, (o.tail ?? 0.5) * span, o.top ?? '#222', at(0, 0, -len * 0.3, -Math.PI / 2, 0, 0), 5);
  if (o.kind !== 'disc') {
    for (const s of [-1, 1]) fin(p, [[0, 0], [s * 0.02 * span, 0.12 * span], [s * 0.06 * span, 0.1 * span], [s * 0.05 * span, 0]], o.top ?? '#222', 'xz', at(s * 0.08 * span, 0, len * 0.32, 0, 0, 0));
  }
  eyes(p, span, len / span * 0.28, 0.01, 0.09, 0.012);
  return p.build();
}

/** Sea turtle: domed shell, head, four flippers (front ones long, for flapping). */
export function turtleGeo(o = {}) {
  const L = o.len ?? 1.1;
  const p = new Parts();
  const shell = new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  shell.deleteAttribute('uv');
  const sc = C(o.shell ?? '#6b5a32'), sc2 = C(o.shell2 ?? '#a58b4a');
  p.add(shell, (x, y, z, out) => {
    const k = Math.abs(Math.sin(x * 9) * Math.sin(z * 7));
    out.copy(sc).lerp(sc2, k > 0.5 ? 0.6 : 0.1);
  }, { m: at(0, 0, 0, 0, 0, 0, 0.82 * L, 0.32 * L, L) });
  ball(p, 0.5, o.plastron ?? '#d8c9a0', 0, -0.01 * L, 0, 0.8 * L, 0.1 * L, 0.98 * L, 0, 14);
  ball(p, 0.13 * L, o.skin ?? '#7b6a48', 0, 0.02 * L, 0.56 * L, 1, 0.85, 1.25, 0, 10);
  eyes(p, L, 0.6, 0.06, 0.09, 0.022);
  const sk = o.skin ?? '#7b6a48';
  for (const s of [-1, 1]) {
    fin(p, [[0, 0.05 * L], [s * 0.75 * L, -0.12 * L], [s * 0.78 * L, -0.22 * L], [0, -0.08 * L]], sk, 'xz', at(s * 0.3 * L, -0.02 * L, 0.25 * L, 0, 0, 0));
    fin(p, [[0, 0.04 * L], [s * 0.25 * L, -0.18 * L], [s * 0.1 * L, -0.24 * L], [0, -0.04 * L]], sk, 'xz', at(s * 0.25 * L, -0.02 * L, -0.38 * L, 0, 0, 0));
  }
  return p.build();
}

// ── soft bodies ────────────────────────────────────────────────────────────────────────────────

/** Jellyfish: a lathe bell plus hanging tentacles (pulse mode). */
export function jellyGeo(o = {}) {
  const r = o.r ?? 0.3;
  const p = new Parts();
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 0.5;
    pts.push(new THREE.Vector2(Math.sin(a) * r * (1 + 0.08 * Math.sin(a * 3)), Math.cos(a) * r * (o.tall ?? 0.7)));
  }
  pts.push(new THREE.Vector2(r * 0.85, -r * 0.05));
  const bell = new THREE.LatheGeometry(pts, 24);
  bell.deleteAttribute('uv');
  const c0 = C(o.color ?? '#cfe7ff'), c1 = C(o.rim ?? '#ffb3e6');
  p.add(bell, (x, y, z, out) => out.copy(c1).lerp(c0, clamp(y / (r * 0.6), 0, 1)), { glow: o.glow ?? 0.15 });
  if (o.gut) ball(p, r * 0.35, o.gut, 0, r * 0.15, 0, 1, 0.7, 1, 0.6, 10);
  const n = o.tentacles ?? 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const L = (o.tlen ?? 3) * r * (0.7 + 0.3 * ((i * 7) % 5) / 5);
    rod(p, 0.012 * r, 0.004 * r, L, o.tcolor ?? o.rim ?? '#ffb3e6', at(Math.cos(a) * r * 0.8, -r * 0.02, Math.sin(a) * r * 0.8, Math.PI, 0, 0), 3, o.glow ?? 0.15);
  }
  if (o.arms) for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    ball(p, r * 0.12, o.armColor ?? o.rim, Math.cos(a) * r * 0.12, -r * 0.7, Math.sin(a) * r * 0.12, 0.6, 5, 1.2, 0.2, 8);
  }
  return p.build();
}

/** Octopus / dumbo / vampire squid: mantle above, arms radiating below (pulse mode). */
export function octopusGeo(o = {}) {
  const r = o.r ?? 0.25;
  const p = new Parts();
  const col = C(o.color ?? '#b8643a'), col2 = C(o.color2 ?? '#e3a074');
  ball(p, r, (x, y, z, out) => out.copy(col2).lerp(col, clamp(0.5 + y / r, 0, 1)), 0, r * 0.9, -r * 0.35, 1, 1.25, 1.2, 0, 14);
  eyes(p, r * 2, 0.15, 0.2, 0.4, 0.07, o.iris ?? '#222', o.eyeGlow ?? 0);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const L = (o.arm ?? 2.6) * r;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(Math.cos(a) * L * 0.3, -L * 0.25, Math.sin(a) * L * 0.3),
      new THREE.Vector3(Math.cos(a) * L * 0.7, -L * 0.35, Math.sin(a) * L * 0.7),
      new THREE.Vector3(Math.cos(a) * L, -L * 0.2 + (o.curl ?? 0.1) * L, Math.sin(a) * L),
    ]);
    const g = new THREE.TubeGeometry(curve, 12, r * 0.12, 5);
    g.deleteAttribute('uv');
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, k);
      const along = clamp(Math.hypot(v.x, v.z) / L, 0, 1);
      const sh = 1 - along * 0.85;
      const cx = Math.cos(a) * along * L, cz = Math.sin(a) * along * L;
      pos.setXYZ(k, cx + (v.x - cx) * sh, v.y, cz + (v.z - cz) * sh);
    }
    g.computeVertexNormals();
    p.add(g, (x, y, z, out) => out.copy(col).lerp(col2, y < -0.25 * L ? 0.6 : 0.15));
  }
  if (o.web) {
    const web = new THREE.ConeGeometry(r * 2.2, r * 1.0, 16, 1, true);
    web.deleteAttribute('uv');
    p.add(web, o.web, { m: at(0, -r * 0.4, 0, Math.PI, 0, 0) });
  }
  if (o.ears) for (const s of [-1, 1]) fin(p, [[0, 0], [s * r * 0.9, r * 0.4], [s * r * 1.05, -r * 0.1], [s * r * 0.3, -r * 0.3]], o.color ?? '#e8a07a', 'xy', at(s * r * 0.6, r * 1.5, -r * 0.35));
  return p.build();
}

/** Squid: mantle pointing back (-z), fins at the rear, arms forward (+z). */
export function squidGeo(o = {}) {
  const len = o.len ?? 1;
  const p = new Parts();
  const col = o.color ?? '#b3402c';
  const prof = (t) => {
    const r = t < 0.62 ? 0.03 + 0.95 * Math.pow(t / 0.62, 0.55) : 1 - (t - 0.62) * 0.9;
    return [0.065 * r, 0.065 * r, 0];
  };
  addTube(p, tube(len * 0.62, prof, counter(col, o.belly ?? '#e8a088')), { m: at(0, 0, -0.19 * len) });
  for (const s of [-1, 1]) fin(p, [[0, 0], [s * 0.12 * len, -0.04 * len], [0, -0.14 * len]], col, 'xz', at(0, 0, -0.38 * len));
  eyes(p, len, 0.13, 0.0, 0.065, o.eye ?? 0.035, '#0a0a0a', o.eyeGlow ?? 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const L = (i < 2 ? o.tentacle ?? 0.9 : o.arm ?? 0.35) * len;
    rod(p, 0.012 * len, 0.003 * len, L, col, at(Math.cos(a) * 0.03 * len, Math.sin(a) * 0.03 * len, 0.13 * len, Math.PI / 2 + Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15), 4);
  }
  return p.build();
}

/** Long eel-like bodies (moray, electric eel, gulper, cave fish). */
export function eelGeo(o) {
  const len = o.len ?? 1.5;
  const p = new Parts();
  const w = o.w ?? 0.06;
  const prof = o.prof ?? ((t) => {
    const r = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.55 + 0.45)), 0.4) * (0.15 + 0.85 * Math.pow(t, 0.4));
    return [w * r * 0.5, (o.h ?? w) * r * 0.55, 0];
  });
  addTube(p, tube(len, prof, o.paint ?? counter(o.top ?? '#3a3a2a', o.belly ?? '#888060'), 32, 12));
  if (o.ribbon) fin(p, [[0.35 * len, 0], [0.3 * len, -o.ribbon * len], [-0.48 * len, -o.ribbon * len * 0.5], [-0.5 * len, 0]], o.finColor ?? o.top, 'zy', at(0, -(o.h ?? w) * 0.4 * len, 0));
  if (o.dorsalRibbon) fin(p, [[0.3 * len, 0], [0.28 * len, o.dorsalRibbon * len], [-0.48 * len, o.dorsalRibbon * len * 0.6], [-0.5 * len, 0]], o.finColor ?? o.top, 'zy', at(0, (o.h ?? w) * 0.42 * len, 0));
  if (o.eye !== 0) eyes(p, len, 0.45, 0.012, w * 0.4, o.eye ?? 0.012);
  if (o.mouth) {
    const g = new THREE.ConeGeometry(o.mouth * len * 0.5, o.mouth * len, 12, 1, true);
    g.deleteAttribute('uv');
    g.rotateX(-Math.PI / 2);
    p.add(g, '#151018', { m: at(0, -0.01 * len, 0.5 * len + o.mouth * len * 0.3, 0, 0, 0, 1, 0.6, 1) });
  }
  if (o.tipGlow) ball(p, 0.012 * len, o.tipGlow, 0, 0, -0.5 * len, 1, 1, 1, 4, 6);
  return p.build();
}

// ── bottom dwellers & little things ───────────────────────────────────────────────────────────

export function urchinGeo(o = {}) {
  const r = o.r ?? 0.06;
  const p = new Parts();
  ball(p, r, o.color ?? '#5a2a6a', 0, r * 0.6, 0, 1, 0.75, 1, 0, 10);
  const R = rng(5);
  for (let i = 0; i < 46; i++) {
    const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const d = new THREE.Vector3(Math.cos(a) * s, Math.abs(u) * 0.9 + 0.1, Math.sin(a) * s).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    const g = new THREE.ConeGeometry(r * 0.05, r * 1.6, 3);
    g.deleteAttribute('uv');
    g.translate(0, r * 0.8, 0);
    p.add(g, o.spine ?? '#7a3a8f', { m: M().compose(new THREE.Vector3(0, r * 0.6, 0), q, new THREE.Vector3(1, 1, 1)) });
  }
  return p.build();
}

/** Sea star with n arms, flat on the floor. */
export function starGeo(o = {}) {
  const n = o.arms ?? 5, r = o.r ?? 0.15;
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * (o.inner ?? 0.35) : r;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const p = new Parts();
  const shape = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: r * 0.12, bevelEnabled: true, bevelThickness: r * 0.05, bevelSize: r * 0.06, bevelSegments: 2 });
  g.deleteAttribute('uv');
  g.rotateX(-Math.PI / 2);
  const c0 = C(o.color ?? '#e06a2a'), c1 = C(o.color2 ?? '#ffb070');
  p.add(g, (x, y, z, out) => out.copy(c0).lerp(c1, clamp(1 - Math.hypot(x, z) / r, 0, 1)));
  return p.build();
}

/** Sea cucumber: lumpy sausage (optionally see-through via the material). */
export function cucumberGeo(o = {}) {
  const len = o.len ?? 0.3;
  const p = new Parts();
  const prof = (t) => {
    const r = Math.pow(Math.sin(Math.PI * t), 0.45);
    return [0.12 * r, 0.09 * r * (1 + 0.15 * Math.sin(t * 40)), 0.09 * r];
  };
  addTube(p, tube(len, prof, counter(o.color ?? '#b06a5a', o.belly ?? '#e0a090')), { m: at(0, 0, 0) });
  for (let i = 0; i < 6; i++) rod(p, 0.01 * len, 0.004 * len, 0.12 * len, o.color2 ?? '#e0a090', at(((i % 2) * 2 - 1) * 0.04 * len, 0.14 * len, (i / 5 - 0.5) * 0.6 * len, 0, 0, ((i % 2) * 2 - 1) * 0.4), 4);
  return p.build();
}

/** Shrimp / amphipod / copepod: a curled segmented body with legs and antennae. */
export function shrimpGeo(o = {}) {
  const len = o.len ?? 0.05;
  const p = new Parts();
  const col = o.color ?? '#e8b0a0';
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const a = t * (o.curl ?? 1.2);
    ball(p, len * 0.11 * (1 - t * 0.5), col, 0, -Math.sin(a) * len * 0.25, len * 0.35 - t * len * 0.7 * Math.cos(a * 0.5), 1, 0.9, 1.3, o.glow ?? 0, 7);
  }
  for (const s of [-1, 1]) rod(p, len * 0.008, len * 0.003, len * 0.8, col, at(s * len * 0.03, len * 0.05, len * 0.38, Math.PI / 2 - 0.35, 0, s * 0.3), 3);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) rod(p, len * 0.008, len * 0.004, len * 0.18, col, at(s * len * 0.04, -len * 0.05, len * (0.2 - i * 0.1), Math.PI, 0, s * 0.5), 3);
  return p.build();
}

export function crabGeo(o = {}) {
  const r = o.r ?? 0.1;
  const p = new Parts();
  const col = o.color ?? '#c9502a';
  ball(p, r, col, 0, r * 0.4, 0, 1.2, 0.5, 0.9, 0, 12);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) rod(p, r * 0.06, r * 0.04, r * 1.1, col, at(s * r * 0.9, r * 0.35, (i - 1.5) * r * 0.35, 0, 0, s * 2.1), 4);
  for (const s of [-1, 1]) ball(p, r * 0.3, col, s * r * 0.8, r * 0.4, r * 1.0, 1, 0.7, 1.4, 0, 8);
  eyes(p, r * 2, 0.4, 0.38, 0.12, 0.05);
  return p.build();
}

// ── plants, corals, rocks ────────────────────────────────────────────────────────────────────

/** Giant kelp: a stipe with alternating blades and gas bladders, rooted at y=0 (sway mode). */
export function kelpGeo(o = {}) {
  const H = o.h ?? 14;
  const p = new Parts();
  const R = rng(o.seed ?? 3);
  rod(p, 0.035, 0.02, H, o.stipe ?? '#6b5a1e', at(0, 0, 0), 5);
  ball(p, 0.25, '#5a4a20', 0, 0.05, 0, 1, 0.4, 1, 0, 8);
  const blade = C(o.blade ?? '#8a7a22'), blade2 = C(o.blade2 ?? '#b0a03a');
  for (let y = 0.8; y < H; y += 0.42) {
    const a = R() * Math.PI * 2;
    const L = 0.8 + R() * 0.6;
    // A ruffled, lance-shaped blade on a gas bladder, angled up and out from the stipe.
    p.add(leafGeo(L, 0.14 + R() * 0.05), (x, yy, z, out) => out.copy(blade).lerp(blade2, clamp(yy / L, 0, 1) * 0.7), { m: at(0, y + 0.04, 0, 0, a, -0.55 - R() * 0.35) });
    ball(p, 0.035, '#a89832', Math.cos(a) * 0.05, y + 0.02, -Math.sin(a) * 0.05, 1, 1.4, 1, 0, 6);
  }
  return p.build();
}

/** A long lance-shaped blade with ruffled edges, base at the origin, pointing up +y. */
export function leafGeo(L, W, segs = 8) {
  const pts = [];
  for (let i = 0; i <= segs; i++) { const t = i / segs; pts.push(new THREE.Vector2(W * 0.5 * Math.sin(Math.PI * Math.pow(t, 0.7)) + 0.004, t * L)); }
  for (let i = segs; i >= 0; i--) { const t = i / segs; pts.push(new THREE.Vector2(-W * 0.5 * Math.sin(Math.PI * Math.pow(t, 0.7)) - 0.004, t * L)); }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts), 2);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, Math.sin(y * 22) * Math.abs(x) * 0.6 + Math.sin(y * 3) * 0.04);
  }
  g.computeVertexNormals();
  return g;
}

/** A clump of seagrass or water plants (sway mode). */
export function grassGeo(o = {}) {
  const p = new Parts();
  const R = rng(o.seed ?? 9);
  const c0 = C(o.color ?? '#4f8a3a'), c1 = C(o.color2 ?? '#9ac860');
  for (let i = 0; i < (o.blades ?? 9); i++) {
    const h = (o.h ?? 0.6) * (0.6 + R() * 0.6);
    const g = new THREE.PlaneGeometry(o.w ?? 0.04, h, 1, 4);
    g.deleteAttribute('uv');
    g.translate(0, h / 2, 0);
    p.add(g, (x, y, z, out) => out.copy(c0).lerp(c1, y / h), { m: at((R() - 0.5) * 0.2, 0, (R() - 0.5) * 0.2, (R() - 0.5) * 0.3, R() * 3, (R() - 0.5) * 0.3) });
  }
  return p.build();
}

/** A rock: a noisy icosahedron, sitting on y=0. */
export function rockGeo(o = {}) {
  const g = new THREE.IcosahedronGeometry(1, o.detail ?? 2);
  g.deleteAttribute('uv');
  const R = rng(o.seed ?? 1);
  const pos = g.attributes.position;
  const offs = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!offs.has(key)) offs.set(key, 0.75 + R() * 0.45);
    const k = offs.get(key);
    pos.setXYZ(i, pos.getX(i) * k, Math.max(-0.3, pos.getY(i) * k * (o.flat ?? 0.6)), pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  const p = new Parts();
  const c0 = C(o.color ?? '#6d6a62'), c1 = C(o.color2 ?? '#8d8a80');
  p.add(g, (x, y, z, out) => out.copy(c0).lerp(c1, clamp(y + 0.3, 0, 1) * (0.5 + 0.5 * Math.sin(x * 7 + z * 5))));
  return p.build();
}

/** Brain coral: a grooved dome. */
export function brainCoralGeo(o = {}) {
  const g = new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const k = 1 + 0.05 * Math.sin(v.x * 22 + Math.sin(v.z * 9) * 3) * Math.cos(v.z * 20);
    pos.setXYZ(i, v.x * k, v.y * k * 0.7, v.z * k);
  }
  g.computeVertexNormals();
  const p = new Parts();
  const c0 = C(o.color ?? '#c9a35a'), c1 = C(o.color2 ?? '#7a8a3a');
  p.add(g, (x, y, z, out) => out.copy(c0).lerp(c1, 0.5 + 0.5 * Math.sin(x * 22 + Math.sin(z * 9) * 3)));
  return p.build();
}

/** Branching coral / sponge: recursive cylinders. style 'stag' | 'sponge' | 'fan' | 'table'. */
export function branchGeo(o = {}) {
  const p = new Parts();
  const R = rng(o.seed ?? 7);
  const c0 = C(o.color ?? '#d9a07a'), c1 = C(o.tip ?? '#f4d0b0');
  const paint = (x, y, z, out) => out.copy(c0).lerp(c1, clamp(y / (o.h ?? 1), 0, 1));
  if (o.style === 'table') {
    rod(p, 0.08, 0.06, 0.4, c0.getStyle(), at(0, 0, 0), 6);
    const g = new THREE.CylinderGeometry(0.9, 0.7, 0.08, 18);
    g.deleteAttribute('uv');
    p.add(g, (x, y, z, out) => out.copy(c0).lerp(c1, Math.hypot(x, z)), { m: at(0, 0.44, 0) });
    return p.build();
  }
  if (o.style === 'fan') {
    const g = new THREE.CircleGeometry(0.7, 20, 0, Math.PI);
    g.deleteAttribute('uv');
    p.add(g, (x, y, z, out) => out.copy(c0).lerp(c1, ((Math.sin(x * 40) * Math.sin(y * 40)) > 0.3 ? 0.8 : 0.1)), { m: at(0, 0.05, 0) });
    return p.build();
  }
  const grow = (pos, dir, len, r, depth) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const g = new THREE.CylinderGeometry(r * 0.7, r, len, 5, 1);
    g.deleteAttribute('uv');
    g.translate(0, len / 2, 0);
    p.add(g, paint, { m: M().compose(pos, q, new THREE.Vector3(1, 1, 1)) });
    const end = pos.clone().addScaledVector(dir, len);
    if (depth <= 0) {
      if (o.style === 'sponge') ball(p, r * 1.1, c1.getStyle(), end.x, end.y, end.z, 1, 1, 1, 0, 6);
      return;
    }
    const kids = o.style === 'sponge' ? 2 : 3;
    for (let i = 0; i < kids; i++) {
      const nd = dir.clone().add(new THREE.Vector3((R() - 0.5) * 1.2, R() * 0.4, (R() - 0.5) * 1.2)).normalize();
      if (nd.y < 0.2) nd.y = 0.2;
      grow(end, nd.normalize(), len * (0.65 + R() * 0.2), r * 0.72, depth - 1);
    }
  };
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), o.trunk ?? 0.35, o.r ?? 0.05, o.depth ?? 3);
  return p.build();
}

/** Sea anemone: a column with a crown of tentacles (sway mode on the tentacles). */
export function anemoneGeo(o = {}) {
  const p = new Parts();
  const r = o.r ?? 0.35;
  rod(p, r * 0.6, r * 0.75, r * 0.4, o.base ?? '#c2402a', at(0, 0, 0), 14);
  const R = rng(o.seed ?? 4);
  const c0 = C(o.color ?? '#e8d6a0'), c1 = C(o.tip ?? '#bce07a');
  for (let i = 0; i < (o.n ?? 70); i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * r * 0.8;
    const L = r * (0.45 + R() * 0.35);
    const g = new THREE.CylinderGeometry(r * 0.025, r * 0.05, L, 4);
    g.deleteAttribute('uv');
    g.translate(0, L / 2, 0);
    p.add(g, (x, y, z, out) => out.copy(c0).lerp(c1, clamp((y - r * 0.4) / L, 0, 1)), { m: at(Math.cos(a) * d, r * 0.38, Math.sin(a) * d, Math.sin(a) * 0.5 * (d / r), 0, -Math.cos(a) * 0.5 * (d / r)) });
  }
  return p.build();
}

/** Giant clam: two wavy shell halves, gaping, with a glowing blue mantle. */
export function clamGeo(o = {}) {
  const p = new Parts();
  const s = o.size ?? 1;
  for (const side of [-1, 1]) {
    const g = new THREE.SphereGeometry(0.5, 18, 10, 0, Math.PI, 0, Math.PI / 2);
    g.deleteAttribute('uv');
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      pos.setXYZ(i, x, y + Math.sin(Math.atan2(z, x) * 6) * 0.04 * Math.hypot(x, z), z);
    }
    g.computeVertexNormals();
    p.add(g, '#dcd6c4', { m: at(0, 0.25 * s, 0, 0, side > 0 ? 0 : Math.PI, side * 1.35, s, s * 0.9, s * 0.6) });
  }
  const mantle = C(o.mantle ?? '#3aa0c8'), mantle2 = C(o.mantle2 ?? '#2a5fb0');
  ball(p, 0.36 * s, (x, y, z, out) => out.copy(mantle).lerp(mantle2, 0.5 + 0.5 * Math.sin(x * 50) * Math.sin(z * 45)), 0, 0.26 * s, 0, 0.3, 0.75, 1.25, 0.35, 14);
  return p.build();
}

/** Giant tube worms: white tubes with red plumes, a cluster (sway mode). */
export function tubeWormsGeo(o = {}) {
  const p = new Parts();
  const R = rng(o.seed ?? 11);
  for (let i = 0; i < (o.n ?? 22); i++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * (o.spread ?? 0.6);
    const H = 0.6 + R() * 1.2;
    const lean = (R() - 0.5) * 0.3;
    rod(p, 0.035, 0.03, H, '#e8e4d8', at(Math.cos(a) * d, 0, Math.sin(a) * d, lean, 0, lean), 6);
    ball(p, 0.06, '#d01c1c', Math.cos(a) * d + Math.sin(lean) * H * 0.0, H + 0.06, Math.sin(a) * d, 0.8, 2.2, 0.8, 0.5, 8);
  }
  return p.build();
}

/** Xenophyophore: a lumpy, fragile ball of glued sediment. */
export function xenoGeo() {
  const p = new Parts();
  const R = rng(17);
  for (let i = 0; i < 12; i++) ball(p, 0.03 + R() * 0.04, R() < 0.5 ? '#c8bca0' : '#a89a7e', (R() - 0.5) * 0.12, 0.03 + R() * 0.08, (R() - 0.5) * 0.12, 1, 0.7, 1, 0, 7);
  return p.build();
}

/** The fallback for any model not built above. */
export function blobGeo(r = 0.2, color = '#ccc') {
  const p = new Parts();
  ball(p, r, color, 0, 0, 0);
  return p.build();
}

export { at, ball, rod, fin, addTube, spindle, counter, mix };
