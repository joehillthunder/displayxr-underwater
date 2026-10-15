// The toolkit every site's build(ctx) uses: floors, roofs, creatures, schools, scattered
// decoration, findables and per-frame hooks. A site only describes WHAT is where; main.js owns
// the loop, the diver and the UI.

import * as THREE from 'three';
import { swimMat } from '../models.js';
import { heightfield, addCaustics } from '../water.js';
import { Swimmer, School, scatter } from '../life.js';
import { rng, fbm, clamp, smooth } from '../util.js';

export { THREE, fbm, clamp, smooth, rng };

export const SITE_MODULES = {
  reef: () => import('./reef.js'),
  kelp: () => import('./kelp.js'),
  arctic: () => import('./arctic.js'),
  baikal: () => import('./baikal.js'),
  amazon: () => import('./amazon.js'),
  blue: () => import('./blue.js'),
  cenote: () => import('./cenote.js'),
  deep: () => import('./deep.js'),
  trench: () => import('./trench.js'),
  atlantis: () => import('./atlantis.js'),
};

export function createContext(scene, seed = 1) {
  const group = new THREE.Group();
  scene.add(group);
  const ctx = {
    group,
    r: rng(seed),
    swimmers: [],
    schools: [],
    finds: new Map(), // id → [{ id, center(out), radius }]
    ticks: [],
    floorAt: () => -1e4,
    ceilAt: () => 0,
    surfaceY: 0,
    caustics: true,
    start: { pos: [0, -4, 10], yaw: 0, pitch: -0.1 },
    tour: null,
    bounds: { r: 60, yMin: -1e4, yMax: 0 },

    /** The floor: a heightfield that is also collision. */
    floor(o) {
      const mesh = heightfield({ size: o.size ?? 180, seg: o.seg ?? 150, ...o, caustics: o.caustics ?? ctx.caustics });
      group.add(mesh);
      const prev = ctx.floorAt;
      ctx.floorAt = o.combine ? (x, z) => Math.max(prev(x, z), o.height(x, z)) : o.height;
      return mesh;
    },

    /** A roof seen from below (sea ice, cave ceiling). */
    ceiling(o) {
      const mesh = heightfield({ size: o.size ?? 180, seg: o.seg ?? 120, ...o, ceiling: true });
      group.add(mesh);
      ctx.ceilAt = o.height;
      return mesh;
    },

    /**
     * A material for this site's creatures: swim options + caustics on shallow sites. With a
     * geometry, the animation is sized from it (len from the z extent, span from x, sway/pulse
     * height from y) unless opts say otherwise.
     */
    mat(opts = {}, geo) {
      const o = { ...opts };
      if (geo) {
        geo.computeBoundingBox();
        const b = geo.boundingBox;
        const mode = o.mode ?? 'fish';
        if (o.len == null) o.len = mode === 'sway' || mode === 'pulse' ? Math.max(0.05, b.max.y) : b.max.z - b.min.z;
        if (mode === 'flap' && o.span == null) o.span = Math.max(-b.min.x, b.max.x);
      }
      const m = swimMat({ phase: ctx.r() * 10, ...o });
      if (opts.caustics ?? false) addCaustics(m);
      return m;
    },

    /** One creature. Returns the mesh (its Swimmer is in mesh.userData.swimmer). */
    swimmer(geo, matOpts, behave, { scale = 1 } = {}) {
      const mesh = new THREE.Mesh(geo, ctx.mat(matOpts, geo));
      mesh.scale.setScalar(scale);
      group.add(mesh);
      const s = new Swimmer(mesh, { seed: Math.floor(ctx.r() * 1e9), ...behave });
      mesh.userData.swimmer = s;
      ctx.swimmers.push(s);
      return mesh;
    },

    school(geo, matOpts, opts) {
      const s = new School(geo, ctx.mat(matOpts, geo), { seed: Math.floor(ctx.r() * 1e9), ...opts });
      group.add(s.mesh);
      ctx.schools.push(s);
      return s;
    },

    /** Static scenery: one mesh, placed. */
    prop(geo, matOpts, x, y, z, { s = 1, ry = 0, rx = 0, rz = 0 } = {}) {
      const m = matOpts instanceof THREE.Material ? matOpts : ctx.mat({ mode: 'none', caustics: ctx.caustics, ...matOpts }, geo);
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      mesh.scale.setScalar(s);
      group.add(mesh);
      return mesh;
    },

    /** Lots of static scenery in one draw call. place(i) → { x, y, z, s, ry… }. */
    scatter(geo, matOpts, count, place) {
      const m = matOpts instanceof THREE.Material ? matOpts : ctx.mat({ mode: 'none', caustics: ctx.caustics, ...matOpts }, geo);
      const mesh = scatter(geo, m, count, place);
      group.add(mesh);
      return mesh;
    },

    /**
     * Make something photographable. target: an Object3D, a School, or a fixed [x,y,z].
     * radius: how big a target it is for the aiming ray (be generous with small fish).
     */
    find(id, target, radius = 1) {
      let center;
      if (target instanceof School) center = (out) => out.copy(target.center);
      else if (Array.isArray(target)) center = (out) => out.set(...target);
      else center = (out) => target.getWorldPosition(out);
      if (!ctx.finds.has(id)) ctx.finds.set(id, []);
      ctx.finds.get(id).push({ id, center, radius, target });
    },

    tick(fn) {
      ctx.ticks.push(fn);
    },

    light(color, intensity, distance, x, y, z) {
      const l = new THREE.PointLight(color, intensity, distance, 1.5);
      l.position.set(x, y, z);
      group.add(l);
      return l;
    },

    /** Free GPU memory when leaving the site. */
    dispose() {
      group.traverse((o) => {
        o.geometry?.dispose();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of ms) { m.map?.dispose(); m.dispose(); }
      });
      scene.remove(group);
    },
  };
  return ctx;
}

/** A random point on a ring/disc, avoiding the very middle. */
export function around(r, rMin, rMax) {
  const a = r() * Math.PI * 2, d = rMin + Math.sqrt(r()) * (rMax - rMin);
  return [Math.cos(a) * d, Math.sin(a) * d];
}

/** Colour helper for floors: blend a list of [weight, colour] by noise. */
export function sandPaint(c0, c1, c2, scale = 0.08) {
  const a = new THREE.Color(c0), b = new THREE.Color(c1), c = new THREE.Color(c2);
  return (x, z, y, out) => {
    const n = fbm(x * scale, z * scale, 3) * 0.5 + 0.5;
    out.copy(a).lerp(b, clamp(n * 1.4 - 0.2, 0, 1));
    const g = fbm(x * scale * 4 + 9, z * scale * 4, 2);
    if (g > 0.25) out.lerp(c, clamp((g - 0.25) * 2, 0, 0.6));
  };
}
