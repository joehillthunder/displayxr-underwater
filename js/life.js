// How things move. A Swimmer is one creature with a behaviour; a School is many small fish drawn as
// one InstancedMesh that follows a wandering leader and parts around the diver.
//
// World context passed to update(): { player: Vector3, fwd: Vector3, floorAt(x, z), ceilAt(x, z) }.

import * as THREE from 'three';
import { clamp, rng } from './util.js';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const q1 = new THREE.Quaternion(), m1 = new THREE.Matrix4();

/**
 * obj: the creature's Object3D (head +z).
 * o: { home: [x,y,z], range (xz radius), yMin, yMax (absolute y), clear (metres above the floor),
 *      speed, turn (rad/s), behave: 'wander' | 'circle' | 'hover' | 'surface' | 'crawl' | 'drift'
 *      | 'static', shy (metres), curious (bool), seed, bob, pitchLimit, faceUp }
 */
export class Swimmer {
  constructor(obj, o = {}) {
    this.obj = obj;
    this.o = { range: 12, speed: 1, turn: 1.2, clear: 1, behave: 'wander', pitchLimit: 0.6, ...o };
    this.home = new THREE.Vector3(...(o.home ?? [0, -5, 0]));
    this.r = rng(o.seed ?? Math.floor(Math.random() * 1e9));
    this.dir = new THREE.Vector3(this.r() - 0.5, 0, this.r() - 0.5).normalize();
    this.target = new THREE.Vector3();
    this.angle = this.r() * Math.PI * 2;
    this.boost = 0;
    this.curiousT = 5 + this.r() * 10;
    this.timer = 0;
    obj.position.copy(this.home);
    if (this.o.behave === 'circle') obj.position.set(this.home.x + Math.cos(this.angle) * this.o.range, this.home.y, this.home.z + Math.sin(this.angle) * this.o.range);
    this.pickTarget();
  }

  pickTarget(w) {
    const o = this.o, r = this.r;
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * o.range;
    this.target.set(this.home.x + Math.cos(a) * d, 0, this.home.z + Math.sin(a) * d);
    const yMin = o.yMin ?? this.home.y - 3, yMax = o.yMax ?? this.home.y + 3;
    this.target.y = yMin + r() * (yMax - yMin);
    if (w) {
      const fl = w.floorAt(this.target.x, this.target.z) + o.clear;
      const ce = w.ceilAt(this.target.x, this.target.z) - o.clear * 0.5;
      this.target.y = clamp(this.target.y, fl, Math.max(fl, ce));
    }
    this.timer = 6 + r() * 10;
  }

  update(dt, t, w) {
    const o = this.o, p = this.obj.position;
    if (o.behave === 'static') return;
    if (o.behave === 'circle') return this.circle(dt, t, w);
    if (o.behave === 'drift') return this.drift(dt, t, w);

    // Shy creatures flee a close diver; curious ones come and have a look now and then.
    const dp = p.distanceTo(w.player);
    if (o.shy && dp < o.shy) {
      v1.subVectors(p, w.player).setY(0).normalize();
      this.target.copy(p).addScaledVector(v1, o.shy * 2.5);
      this.target.y = p.y;
      this.boost = 1.5;
      this.timer = 3;
    } else if (o.curious) {
      this.curiousT -= dt;
      if (this.curiousT <= 0 && dp < 22) {
        this.curiousT = 14 + this.r() * 16;
        this.target.copy(w.player).addScaledVector(w.fwd, 3 + this.r() * 2);
        this.target.x += (this.r() - 0.5) * 2;
        this.target.z += (this.r() - 0.5) * 2;
        this.timer = 8;
      }
    }

    this.timer -= dt;
    const reach = o.behave === 'hover' ? 0.15 : 1.2;
    if (this.timer <= 0 || p.distanceTo(this.target) < reach) this.pickTarget(w);
    if (o.behave === 'surface') this.target.y = (o.surfaceY ?? 0) - (o.float ?? 0.2);

    // Steer: turn the heading toward the target at a limited rate, limit pitch.
    v1.subVectors(this.target, p);
    const dist = v1.length();
    if (dist > 1e-4) {
      v1.divideScalar(dist);
      const maxPitch = o.pitchLimit;
      v1.y = clamp(v1.y, -maxPitch, maxPitch);
      v1.normalize();
      const k = 1 - Math.exp(-o.turn * dt);
      this.dir.lerp(v1, k).normalize();
    }
    this.boost = Math.max(0, this.boost - dt * 0.5);
    const slow = o.behave === 'hover' ? clamp(dist / 0.6, 0.15, 1) : clamp(dist / 2, 0.3, 1);
    const sp = o.speed * (1 + this.boost) * slow;
    p.addScaledVector(this.dir, sp * dt);

    // Keep off the floor and under the roof.
    const fl = w.floorAt(p.x, p.z) + (o.behave === 'crawl' ? (o.lift ?? 0) : o.clear * 0.6);
    const ce = w.ceilAt(p.x, p.z) - (o.behave === 'surface' ? 0 : 0.4);
    if (o.behave === 'crawl') p.y = fl;
    else if (o.behave === 'surface') p.y = (o.surfaceY ?? 0) - (o.float ?? 0.2) + Math.sin(t * 1.3 + this.angle) * (o.bob ?? 0.05);
    else p.y = clamp(p.y, fl, Math.max(fl, ce));

    // Face the way we're going. Crawlers and surface floaters only turn about y.
    v2.copy(this.dir);
    if (o.behave === 'crawl' || o.behave === 'surface') v2.y = 0;
    if (v2.lengthSq() > 1e-6) {
      v2.normalize();
      m1.lookAt(v2, v1.set(0, 0, 0), up);
      q1.setFromRotationMatrix(m1);
      this.obj.quaternion.slerp(q1, 1 - Math.exp(-6 * dt));
      if (o.roll) this.obj.rotateZ(o.roll);
    }
    if (this.obj.userData.wiggle) this.obj.userData.wiggle(sp, dt);
  }

  circle(dt, t, w) {
    const o = this.o, p = this.obj.position;
    this.angle += (o.speed / o.range) * dt * (o.dirSign ?? 1);
    const y = this.home.y + Math.sin(t * 0.2 + this.angle) * (o.bob ?? 1);
    const nx = this.home.x + Math.cos(this.angle) * o.range, nz = this.home.z + Math.sin(this.angle) * o.range * (o.oval ?? 1);
    v1.set(nx - p.x, y - p.y, nz - p.z);
    p.set(nx, Math.max(y, w.floorAt(nx, nz) + o.clear), nz);
    if (v1.lengthSq() > 1e-8) {
      v1.normalize();
      m1.lookAt(v1, v2.set(0, 0, 0), up);
      q1.setFromRotationMatrix(m1);
      this.obj.quaternion.slerp(q1, 1 - Math.exp(-5 * dt));
      if (o.roll) this.obj.rotateZ(o.roll);
    }
  }

  drift(dt, t) {
    const o = this.o, p = this.obj.position;
    const ph = this.angle;
    p.set(
      this.home.x + Math.sin(t * 0.05 + ph) * o.range,
      this.home.y + Math.sin(t * 0.13 + ph * 2) * (o.bob ?? 1.2),
      this.home.z + Math.cos(t * 0.04 + ph) * o.range,
    );
    this.obj.rotation.y = t * 0.05 + ph;
    if (o.tilt) this.obj.rotation.x = Math.sin(t * 0.3 + ph) * o.tilt;
  }
}

/**
 * A school: count fish in one InstancedMesh. o: { count, radius (formation size), flat (y squash),
 * swirl (rad/s spin of the formation, for bait balls), avoid (metres to part around the diver),
 * ...Swimmer options for the leader }.
 */
export class School {
  constructor(geo, mat, o = {}) {
    this.o = { count: 40, radius: 3, flat: 0.5, avoid: 2.5, swirl: 0, scaleVar: 0.25, ...o };
    const n = this.o.count;
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.leaderObj = new THREE.Object3D();
    this.leader = new Swimmer(this.leaderObj, { turn: 0.7, ...o });
    const r = rng(o.seed ?? 99);
    this.fish = [];
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, d = Math.cbrt(r()) * this.o.radius, s = Math.sqrt(1 - u * u);
      const off = new THREE.Vector3(Math.cos(a) * s * d, u * d * this.o.flat, Math.sin(a) * s * d);
      const p = this.leaderObj.position.clone().add(off);
      this.fish.push({ off, p, v: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), s: 1 + (r() - 0.5) * 2 * this.o.scaleVar, k: 1.2 + r() * 1.2 });
    }
    this.center = new THREE.Vector3();
    this.spin = 0;
    this.q = new THREE.Quaternion();
    this.sc = new THREE.Vector3();
  }

  update(dt, t, w) {
    this.leader.update(dt, t, w);
    const L = this.leaderObj;
    this.spin += this.o.swirl * dt;
    const avoid = this.o.avoid;
    this.center.set(0, 0, 0);
    this.fish.forEach((f, i) => {
      v1.copy(f.off);
      if (this.o.swirl) v1.applyAxisAngle(up, this.spin * (0.7 + (i % 5) * 0.12));
      else v1.applyQuaternion(L.quaternion);
      v1.add(L.position);
      // Part around the diver.
      v2.subVectors(v1, w.player);
      const d = v2.length();
      if (d < avoid) v1.addScaledVector(v2.normalize(), (avoid - d) * 1.6);
      const fl = w.floorAt(v1.x, v1.z) + 0.3;
      if (v1.y < fl) v1.y = fl;
      const ce = w.ceilAt(v1.x, v1.z) - 0.2;
      if (v1.y > ce) v1.y = ce;
      // Spring toward the slot; head the way we move.
      v2.subVectors(v1, f.p).multiplyScalar(f.k);
      f.v.lerp(v2, 1 - Math.exp(-3 * dt));
      f.p.addScaledVector(f.v, dt);
      if (f.v.lengthSq() > 0.0004) f.dir.lerp(v2.copy(f.v).normalize(), 1 - Math.exp(-5 * dt)).normalize();
      else f.dir.lerp(v2.set(0, 0, 1).applyQuaternion(L.quaternion), 1 - Math.exp(-2 * dt)).normalize();
      m1.lookAt(f.dir, v2.set(0, 0, 0), up);
      this.q.setFromRotationMatrix(m1);
      this.sc.setScalar(f.s);
      m1.compose(f.p, this.q, this.sc);
      this.mesh.setMatrixAt(i, m1);
      this.center.add(f.p);
    });
    this.center.divideScalar(this.fish.length);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const tint = new THREE.Color();

/**
 * Static instanced decoration (corals, rocks, sponges, grass): place(i) → { x, y, z, s, ry, rx, rz, c (tint) }.
 */
export function scatter(geo, mat, count, place) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const e = new THREE.Euler(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const r = place(i);
    p.set(r.x, r.y, r.z);
    e.set(r.rx ?? 0, r.ry ?? 0, r.rz ?? 0);
    q.setFromEuler(e);
    s.set(r.sx ?? r.s ?? 1, r.sy ?? r.s ?? 1, r.sz ?? r.s ?? 1);
    m1.compose(p, q, s);
    mesh.setMatrixAt(i, m1);
    if (r.c) mesh.setColorAt(i, tint.set(r.c));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}
