// Underwater Worlds 3D: swim through ten underwater environments, photograph what lives there and
// learn about it, in glasses-free 3D on a DisplayXR display (2D elsewhere).
//
//   data.js        every fact, find and quiz question
//   sites/*.js     one file per site: its water look (env) and build(ctx)
//   water.js       fog, sky dome, surface, sunbeams, caustics, particles, bubbles
//   models.js      procedural creatures and the GPU swim animation
//   life.js        swimming behaviours and schools
//   stage.js       the DisplayXR camera rig (woven 3D on a Leia display, 2D elsewhere)
//
// URL options: ?site=<id> dives straight in, ?tour, ?mono, ?depth=0-2, ?selftest, ?reset.

import * as THREE from 'three';
import { Stage } from './stage.js';
import { Water } from './water.js';
import { TIME } from './models.js';
import { SITES, byId, KIND_LABEL } from './data.js';
import { createContext, SITE_MODULES } from './sites/common.js';
import { makeLabel, disposeLabel, updateLabels } from './labels.js';
import { clamp, damp, lerp } from './util.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const EMOJI = { reef: '🐠', kelp: '🌿', arctic: '🧊', baikal: '🦭', amazon: '🌳', blue: '🐋', cenote: '🕳️', deep: '🦑', trench: '🔦', atlantis: '🏛️' };
const KIND_ICON = { animal: '🐟', plant: '🌿', place: '📍', secret: '✨' };

const store = {
  get(k) { try { return localStorage.getItem('uw3d.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('uw3d.' + k, v); } catch { /* private mode */ } },
};
if (params.has('reset')) for (const k of ['found', 'quiz']) store.set(k, '[]');

// ── progress ───────────────────────────────────────────────────────────────────────────────────

const found = new Set(JSON.parse(store.get('found') || '[]'));
const quizPassed = new Set(JSON.parse(store.get('quiz') || '[]'));
const key = (site, id) => `${site}:${id}`;
const foundCount = (s) => s.finds.filter((f) => found.has(key(s.id, f.id))).length;
const stamped = (s) => foundCount(s) === s.finds.length && quizPassed.has(s.id);
const quizUnlocked = (s) => foundCount(s) >= Math.ceil(s.finds.length / 2);

// ── scene ──────────────────────────────────────────────────────────────────────────────────────

const stage = new Stage($('stage'));
const water = new Water(stage.scene, stage.cam);
if (params.has('depth')) stage.setDepth(parseFloat(params.get('depth')));
$('depth').value = stage.depthGain;

const diver = { pos: new THREE.Vector3(0, -4, 10), vel: new THREE.Vector3(), yaw: 0, pitch: -0.1 };
const world = {
  player: diver.pos,
  fwd: new THREE.Vector3(0, 0, -1),
  floorAt: () => -1e4,
  ceilAt: () => 0,
};

let site = null; // data
let ctx = null; // build context
let mod = null; // site module
let loading = null;
let mode = 'home'; // 'home' | 'dive'
let lastInput = performance.now();

async function loadSite(id) {
  const s = byId[id] ?? SITES[0];
  const token = (loading = {});
  const m = await SITE_MODULES[s.id]();
  if (loading !== token) return;
  if (ctx) { clearLabels(); ctx.dispose(); }
  canvas.style.filter = '';
  site = s;
  mod = m;
  ctx = createContext(stage.scene, s.id.length * 7919 + 13);
  ctx.surfaceY = m.env.surface ?? 0;
  ctx.bounds.yMax = m.env.surface ?? 0;
  water.configure(m.env);
  try {
    m.build(ctx);
  } catch (e) {
    console.error(`[dive] build ${s.id} failed`, e);
  }
  world.floorAt = ctx.floorAt;
  world.ceilAt = (x, z) => Math.min(ctx.ceilAt(x, z), ctx.bounds.yMax);
  const [x, y, z] = ctx.start.pos;
  diver.pos.set(x, y, z);
  diver.vel.set(0, 0, 0);
  diver.yaw = ctx.start.yaw ?? 0;
  diver.pitch = ctx.start.pitch ?? -0.1;
  stage.renderer.toneMappingExposure = m.env.exposure ?? 1.05;
  $('vignette').className = m.env.sub ? 'sub' : '';
  // Warm up: run the creatures for a few seconds so schools have formed when you arrive.
  for (let i = 0; i < 90; i++) simulate(1 / 30, TIME.value + i / 30);
  for (const id of ctx.finds.keys()) if (!s.finds.some((f) => f.id === id)) console.warn(`[dive] ${s.id}: findable "${id}" has no entry in data.js`);
  for (const f of s.finds) if (!ctx.finds.has(f.id)) console.warn(`[dive] ${s.id}: "${f.id}" is in data.js but never placed`);
  buildTour();
  guideTarget = null;
  renderGuide();
  renderSiteHeader();
  store.set('last', s.id);
  console.info(`[dive] site ${s.id}: ${ctx.swimmers.length} swimmers, ${ctx.schools.length} schools, ${ctx.finds.size} findables`);
}

function simulate(dt, t) {
  for (const s of ctx.swimmers) s.update(dt, t, world);
  for (const s of ctx.schools) s.update(dt, t, world);
  for (const f of ctx.ticks) f(dt, t, world);
}

// ── input ──────────────────────────────────────────────────────────────────────────────────────

const keys = new Set();
const touchMove = { x: 0, y: 0, up: 0 };
let pointer = { down: false, id: null, x: 0, y: 0, sx: 0, sy: 0, t: 0, moved: false, mouse: false, inside: false };
const canvas = $('stage');

function anyInput() {
  lastInput = performance.now();
  if (tour.on && tour.auto) stopTour();
}

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  if (!$('quiz').hidden || !$('help').hidden) {
    if (k === 'escape') { $('quiz').hidden = true; $('help').hidden = true; }
    return;
  }
  if (mode === 'home') {
    if (k === 'escape' && site) enterDive();
    return;
  }
  anyInput();
  if (tour.on && !['t', 'g', 'l', 'm', 'h'].includes(k)) stopTour();
  keys.add(k);
  if (k === 'e' || k === 'f' || k === 'enter') photograph(null);
  else if (k === 'g') toggleGuide();
  else if (k === 't') (tour.on ? stopTour() : startTour(false));
  else if (k === 'l') toggleLabels();
  else if (k === 'm') goHome();
  else if (k === 'h' || k === '?') $('help').hidden = false;
  else if (k === 'escape') { if (!$('card').hidden) $('card').hidden = true; else goHome(); }
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'dive') return;
  anyInput();
  if (tour.on) stopTour();
  if (pointer.down) return;
  pointer = { ...pointer, down: true, id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false, mouse: e.pointerType === 'mouse' };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
  ensureAudio();
});
canvas.addEventListener('pointermove', (e) => {
  pointer.inside = true;
  pointer.mouse = e.pointerType === 'mouse';
  pointer.hx = e.clientX;
  pointer.hy = e.clientY;
  if (!pointer.down || e.pointerId !== pointer.id) return;
  const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  if (Math.hypot(e.clientX - pointer.sx, e.clientY - pointer.sy) > 6) pointer.moved = true;
  const k = 2.4 / Math.max(innerHeight, 400);
  diver.yaw -= dx * k * 1.1;
  diver.pitch = clamp(diver.pitch - dy * k, -1.45, 1.45);
  lastInput = performance.now();
});
const endDrag = (e) => {
  if (!pointer.down || e.pointerId !== pointer.id) return;
  pointer.down = false;
  canvas.classList.remove('dragging');
  if (!pointer.moved && performance.now() - pointer.t < 600) photograph({ x: e.clientX, y: e.clientY });
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', (e) => { pointer.down = false; canvas.classList.remove('dragging'); });
canvas.addEventListener('pointerleave', () => { pointer.inside = false; });
canvas.addEventListener('wheel', (e) => {
  if (mode !== 'dive') return;
  anyInput();
  diver.vel.addScaledVector(world.fwd, -Math.sign(e.deltaY) * 1.2);
  e.preventDefault();
}, { passive: false });

// Touch: a joystick for swimming, up/down buttons; dragging anywhere else looks around.
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) {
  $('touch').hidden = false;
  const stick = $('stick'), knob = stick.querySelector('i');
  let sid = null;
  const setStick = (e) => {
    const r = stick.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    touchMove.x = x;
    touchMove.y = -y;
    knob.style.transform = `translate(${x * 35}px, ${y * 35}px)`;
  };
  stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; stick.setPointerCapture(sid); setStick(e); anyInput(); ensureAudio(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) setStick(e); });
  const endStick = () => { sid = null; touchMove.x = touchMove.y = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);
  for (const [id, v] of [['tUp', 1], ['tDown', -1]]) {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { touchMove.up = v; b.setPointerCapture(e.pointerId); anyInput(); });
    b.addEventListener('pointerup', () => { touchMove.up = 0; });
    b.addEventListener('pointercancel', () => { touchMove.up = 0; });
  }
}

// ── diver motion ───────────────────────────────────────────────────────────────────────────────

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

function moveDiver(dt, t) {
  const env = mod.env;
  const fast = keys.has('shift');
  const maxSp = (env.sub ? 3.6 : 2.8) * (fast ? 2.2 : 1);
  const f = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0) + touchMove.y;
  const r = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0) + touchMove.x;
  const u = (keys.has(' ') ? 1 : 0) - (keys.has('c') || keys.has('q') || keys.has('control') ? 1 : 0) + touchMove.up;
  if (keys.has('arrowleft')) diver.yaw += 1.6 * dt;
  if (keys.has('arrowright')) diver.yaw -= 1.6 * dt;
  if (keys.has('arrowup')) diver.pitch = clamp(diver.pitch + 1.2 * dt, -1.45, 1.45);
  if (keys.has('arrowdown')) diver.pitch = clamp(diver.pitch - 1.2 * dt, -1.45, 1.45);

  // Swim where you look (forward includes pitch), strafe flat, rise/sink straight up.
  euler.set(diver.pitch, diver.yaw, 0);
  const fwd = tmp.set(0, 0, -1).applyEuler(euler);
  const right = tmp2.set(Math.cos(diver.yaw), 0, -Math.sin(diver.yaw));
  const wish = new THREE.Vector3().addScaledVector(fwd, f).addScaledVector(right, r);
  wish.y += u;
  if (wish.lengthSq() > 1) wish.normalize();
  wish.multiplyScalar(maxSp);
  diver.vel.lerp(wish, 1 - Math.exp(-(env.sub ? 1.6 : 2.4) * dt));
  diver.pos.addScaledVector(diver.vel, dt);
  // Gentle drift and a breathing bob when idle, as if neutrally buoyant.
  diver.pos.y += Math.sin(t * 0.9) * 0.035 * dt * (env.sub ? 0.4 : 1);
  collide();
}

function collide() {
  const p = diver.pos;
  const b = ctx.bounds;
  const d = Math.hypot(p.x - (b.cx ?? 0), p.z - (b.cz ?? 0));
  if (d > b.r) {
    const k = b.r / d;
    p.x = (b.cx ?? 0) + (p.x - (b.cx ?? 0)) * k;
    p.z = (b.cz ?? 0) + (p.z - (b.cz ?? 0)) * k;
    if (performance.now() - (collide.warned || 0) > 6000) { collide.warned = performance.now(); toast(mod.env.edgeText ?? 'That\'s the edge of this dive site.'); }
  }
  for (const [ox, oz, or] of ctx.obstacles ?? []) {
    const dx = p.x - ox, dz = p.z - oz, dd = Math.hypot(dx, dz);
    if (dd < or && dd > 1e-6) { p.x = ox + (dx / dd) * or; p.z = oz + (dz / dd) * or; }
  }
  const fl = world.floorAt(p.x, p.z) + 0.55;
  const ce = world.ceilAt(p.x, p.z) - 0.35;
  if (p.y < fl) { p.y = fl; diver.vel.y = Math.max(0, diver.vel.y); }
  if (p.y > ce) { p.y = Math.max(fl, ce); diver.vel.y = Math.min(0, diver.vel.y); }
  p.y = clamp(p.y, b.yMin, b.yMax);
}

// ── tour mode: a slow cinematic swim, used behind the home screen and when idle ────────────────

const tour = { on: false, auto: false, curve: null, u: 0, len: 1 };
function buildTour() {
  const pts = (ctx.tour ?? [[18, -5, 0], [0, -6, -18], [-18, -5, 0], [0, -4, 18]]).map((p) => new THREE.Vector3(...p));
  tour.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  tour.len = tour.curve.getLength();
  tour.u = 0;
}
function startTour(auto) {
  tour.on = true;
  tour.auto = auto;
  // Join the path at its nearest point so the camera doesn't jump.
  let best = 0, bd = Infinity;
  for (let i = 0; i < 200; i++) {
    const d = tour.curve.getPointAt(i / 200).distanceToSquared(diver.pos);
    if (d < bd) { bd = d; best = i / 200; }
  }
  tour.u = best;
  $('tourBtn').classList.add('on');
}
function stopTour() {
  tour.on = false;
  $('tourBtn').classList.remove('on');
}
function tourStep(dt) {
  tour.u = (tour.u + (1.3 * dt) / tour.len) % 1;
  const p = tour.curve.getPointAt(tour.u);
  diver.pos.lerp(p, 1 - Math.exp(-1.2 * dt));
  collide();
  const ahead = tour.curve.getPointAt((tour.u + 0.02) % 1).sub(diver.pos);
  // Look toward something interesting nearby, otherwise ahead along the path.
  let look = ahead;
  let best = 14;
  for (const list of ctx.finds.values()) for (const e of list) {
    e.center(tmp);
    const d = tmp.distanceTo(diver.pos);
    if (d < best && d > 1.5 && tmp.clone().sub(diver.pos).normalize().dot(ahead.clone().normalize()) > 0.2) { best = d; look = tmp.clone().sub(diver.pos); }
  }
  const yaw = Math.atan2(-look.x, -look.z);
  const pitch = clamp(Math.atan2(look.y, Math.hypot(look.x, look.z)), -0.7, 0.7);
  let dy = yaw - diver.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  diver.yaw += dy * (1 - Math.exp(-0.8 * dt));
  diver.pitch = damp(diver.pitch, pitch, 0.8, dt);
}

// ── aiming, photographs, discoveries ───────────────────────────────────────────────────────────

const ray = new THREE.Ray();
const ndc = new THREE.Vector2();
let hover = null;
let hoverLabel = null;

function aimRay(screen) {
  const r = canvas.getBoundingClientRect();
  if (screen) ndc.set(((screen.x - r.left) / r.width) * 2 - 1, -((screen.y - r.top) / r.height) * 2 + 1);
  else ndc.set(0, 0);
  ray.origin.copy(stage.cam.position);
  ray.direction.set(ndc.x, ndc.y, 0.5).unproject(stage.cam).sub(ray.origin).normalize();
  return ray;
}

/** The nearest findable whose bounding sphere the ray passes through, within sight. */
function pickFind(r) {
  const sight = Math.min(32, 1.7 / Math.max(0.005, mod.env.density));
  let best = null, bt = Infinity;
  for (const list of ctx.finds.values()) for (const e of list) {
    e.center(tmp);
    tmp2.subVectors(tmp, r.origin);
    const t = tmp2.dot(r.direction);
    if (t < 0 || t > sight + e.radius) continue;
    const d2 = tmp2.lengthSq() - t * t;
    const rr = e.radius * 1.15;
    if (d2 > rr * rr) continue;
    if (t < bt) { bt = t; best = { ...e, dist: t, pos: tmp.clone() }; }
  }
  return best;
}

function photograph(screen) {
  if (mode !== 'dive' || !ctx) return;
  ensureAudio();
  sfx.shutter();
  const f = $('flash');
  f.style.transition = 'none';
  f.style.opacity = '0.55';
  requestAnimationFrame(() => { f.style.transition = 'opacity 0.45s'; f.style.opacity = '0'; });
  const hit = pickFind(aimRay(screen)) ?? (screen ? null : hover);
  if (!hit) { toast('Nothing to photograph there. Aim at a creature or landmark.'); return; }
  const fresh = !found.has(key(site.id, hit.id));
  if (fresh) {
    found.add(key(site.id, hit.id));
    store.set('found', JSON.stringify([...found]));
    sfx.chime(site.finds.find((x) => x.id === hit.id)?.kind === 'secret');
    if (guideTarget === hit.id) guideTarget = null;
    renderGuide();
    if (labelsOn) refreshLabels();
  }
  showCard(hit.id, fresh);
}

function showCard(id, fresh) {
  const f = site.finds.find((x) => x.id === id);
  if (!f) return;
  $('cKind').textContent = `${KIND_ICON[f.kind]} ${fresh ? 'New! ' : ''}${KIND_LABEL[f.kind]}`;
  $('cCount').textContent = `${foundCount(site)} / ${site.finds.length}`;
  $('cName').textContent = f.name;
  $('cSci').textContent = f.sci ?? '';
  $('cSci').hidden = !f.sci;
  $('cFact').textContent = f.fact;
  $('cMore').textContent = f.more ?? '';
  $('cMore').hidden = !f.more;
  $('cSize').textContent = f.size ? `Size: ${f.size}` : '';
  $('card').hidden = false;
  $('card').style.animation = 'none';
  void $('card').offsetWidth;
  $('card').style.animation = '';
  clearTimeout(showCard.timer);
  showCard.timer = setTimeout(() => { $('card').hidden = true; }, 16000);
  if (fresh && foundCount(site) === site.finds.length) setTimeout(() => toast(`You found everything at ${site.name}! ${quizPassed.has(site.id) ? 'Stamp earned.' : 'Take the quiz for your stamp.'}`), 1200);
}

function updateAim() {
  const screen = pointer.mouse && pointer.inside && !pointer.down && !isTouch ? { x: pointer.hx, y: pointer.hy } : null;
  hover = pickFind(aimRay(screen)) ?? (screen ? pickFind(aimRay(null)) : null);
  $('reticle').classList.toggle('hot', !!hover);
  const want = hover ? (found.has(key(site.id, hover.id)) ? `📷 ${site.finds.find((f) => f.id === hover.id)?.name ?? hover.id}` : '📷 ???') : null;
  if (want !== hoverLabel?.userData.text) {
    if (hoverLabel) { ctx.group.remove(hoverLabel); disposeLabel(hoverLabel); hoverLabel = null; }
    if (want) {
      hoverLabel = makeLabel(want, { color: '#ffe69a', size: 0.9 });
      hoverLabel.userData.text = want;
      ctx.group.add(hoverLabel);
    }
  }
  if (hoverLabel && hover) hoverLabel.position.copy(hover.pos).add(tmp.set(0, hover.radius * 1.1, 0));
  $('hint').hidden = !hover || isTouch;
  if (hover) $('hint').textContent = found.has(key(site.id, hover.id)) ? 'Click or E: view card' : 'Click or E: photograph';
}

// Name labels over everything you've already found (L).
let labelsOn = store.get('labels') === '1';
let labelSprites = [];
function clearLabels() {
  for (const s of labelSprites) { s.parent?.remove(s); disposeLabel(s); }
  labelSprites = [];
  if (hoverLabel) { hoverLabel.parent?.remove(hoverLabel); disposeLabel(hoverLabel); hoverLabel = null; }
}
function refreshLabels() {
  for (const s of labelSprites) { s.parent?.remove(s); disposeLabel(s); }
  labelSprites = [];
  if (!labelsOn || !ctx) return;
  for (const [id, list] of ctx.finds) {
    if (!found.has(key(site.id, id))) continue;
    const f = site.finds.find((x) => x.id === id);
    for (const e of list) {
      const s = makeLabel(f?.name ?? id, { color: '#bff4ff', size: 0.7 });
      s.userData.entry = e;
      ctx.group.add(s);
      labelSprites.push(s);
    }
  }
}
function toggleLabels() {
  labelsOn = !labelsOn;
  store.set('labels', labelsOn ? '1' : '0');
  $('labelBtn').classList.toggle('on', labelsOn);
  refreshLabels();
}
$('labelBtn').classList.toggle('on', labelsOn);

// The guide orb: a glowing light that leads you toward something you haven't found yet.
let guideTarget = null;
const orb = new THREE.Group();
{
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,230,1)');
  grad.addColorStop(0.25, 'rgba(255,230,140,0.8)');
  grad.addColorStop(1, 'rgba(255,200,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sp.scale.setScalar(0.5);
  orb.add(sp, new THREE.PointLight(0xffe08a, 1.5, 5, 1.5));
  orb.visible = false;
  stage.scene.add(orb);
}
function updateOrb(dt, t) {
  if (!guideTarget || !ctx.finds.has(guideTarget) || mode !== 'dive') { orb.visible = false; return; }
  // Nearest instance of the target.
  let best = null, bd = Infinity;
  for (const e of ctx.finds.get(guideTarget)) {
    e.center(tmp);
    const d = tmp.distanceTo(diver.pos);
    if (d < bd) { bd = d; best = tmp.clone(); }
  }
  if (!best) return;
  const lead = clamp(bd - 1.5, 0, 3.2);
  const want = diver.pos.clone().add(best.clone().sub(diver.pos).normalize().multiplyScalar(lead));
  want.y += Math.sin(t * 2.2) * 0.12;
  if (!orb.visible) orb.position.copy(want);
  orb.visible = true;
  orb.position.lerp(want, 1 - Math.exp(-3 * dt));
  orb.children[0].scale.setScalar(0.35 + 0.08 * Math.sin(t * 5));
}

// ── HUD ────────────────────────────────────────────────────────────────────────────────────────

function renderSiteHeader() {
  $('siteName').textContent = `${EMOJI[site.id]} ${site.name}`;
  $('sitePlace').textContent = site.place;
  $('dZone').textContent = site.zone;
}

function realDepth(y) {
  const f = ctx.depthAt ?? ((yy) => site.depth.top + Math.max(0, ctx.surfaceY - yy));
  return Math.max(0, f(y));
}

let hudT = 0;
function updateHud(dt) {
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.12;
  const d = realDepth(diver.pos.y);
  $('dDepth').textContent = d >= 1000 ? Math.round(d).toLocaleString('en-US') : d.toFixed(1);
  const temp = mod.env.tempAt ? mod.env.tempAt(diver.pos) : site.temp;
  $('dTemp').textContent = `${temp.toFixed(1)} °C`;
  const atm = 1 + d / 10.06;
  $('dPress').textContent = atm >= 100 ? `${Math.round(atm).toLocaleString('en-US')} atm` : `${atm.toFixed(1)} atm`;
  const light = mod.env.lightAt ? mod.env.lightAt(d) : 100 * Math.exp(-d / (mod.env.lightDepth ?? 25));
  $('dLight').textContent = light >= 1 ? `${Math.round(light)}%` : light > 0 ? '<1%' : 'none';
  $('dFound').textContent = `${foundCount(site)} / ${site.finds.length}`;
}

function renderGuide() {
  const list = $('gList');
  list.textContent = '';
  for (const f of site.finds) {
    const got = found.has(key(site.id, f.id));
    const row = document.createElement('div');
    row.className = 'row' + (got ? ' found' : '');
    const ico = document.createElement('span');
    ico.className = 'ico';
    ico.textContent = KIND_ICON[f.kind];
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = got ? f.name : f.kind === 'secret' ? 'secret ???' : '???';
    row.append(ico, name);
    if (got) {
      const tick = document.createElement('span');
      tick.className = 'tick';
      tick.textContent = '✓';
      row.append(tick);
      name.addEventListener('click', () => showCard(f.id, false));
    } else if (f.kind !== 'secret') {
      const b = document.createElement('button');
      b.className = 'seek' + (guideTarget === f.id ? ' on' : '');
      b.textContent = guideTarget === f.id ? 'Following' : 'Find';
      b.addEventListener('click', () => { guideTarget = guideTarget === f.id ? null : f.id; renderGuide(); if (guideTarget) toast('Follow the glowing guide light.'); });
      row.append(b);
    }
    list.append(row);
  }
  const n = foundCount(site);
  $('gCount').textContent = `${n} / ${site.finds.length}`;
  $('gMeter').style.width = `${(100 * n) / site.finds.length}%`;
  const facts = $('gFacts');
  facts.textContent = '';
  const intro = document.createElement('p');
  intro.textContent = site.blurb;
  facts.append(intro);
  for (const t of site.facts) {
    const p = document.createElement('p');
    p.textContent = t;
    facts.append(p);
  }
  const q = $('quizBtn');
  const need = Math.ceil(site.finds.length / 2) - n;
  q.disabled = need > 0;
  q.textContent = quizPassed.has(site.id) ? (stamped(site) ? '🏅 Stamp earned · retake quiz' : '✓ Quiz passed · find the rest for your stamp') : need > 0 ? `Find ${need} more to unlock the quiz` : 'Take the quiz';
  q.style.opacity = need > 0 ? 0.55 : 1;
}

let guideOpen = !(innerWidth < 860) && store.get('guide') !== '0';
function toggleGuide(v) {
  guideOpen = v ?? !guideOpen;
  store.set('guide', guideOpen ? '1' : '0');
  $('guide').hidden = !guideOpen;
  $('guideBtn').classList.toggle('on', guideOpen);
}

let toastTimer;
function toast(text, ms = 3200) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.opacity = '0'; setTimeout(() => { t.hidden = true; }, 300); }, ms);
}

// ── quiz ───────────────────────────────────────────────────────────────────────────────────────

const quiz = { i: 0, score: 0 };
function startQuiz() {
  if (!quizUnlocked(site)) return;
  quiz.i = 0;
  quiz.score = 0;
  $('qTitle').textContent = `${EMOJI[site.id]} ${site.name} quiz`;
  $('quiz').hidden = false;
  showQuestion();
}
function showQuestion() {
  const qs = site.quiz;
  if (quiz.i >= qs.length) {
    const pass = quiz.score >= qs.length - 1;
    if (pass) { quizPassed.add(site.id); store.set('quiz', JSON.stringify([...quizPassed])); }
    $('qProg').textContent = '';
    $('qText').textContent = `You got ${quiz.score} out of ${qs.length}. ${pass ? 'Passed!' : 'So close. Read the field guide and try again.'}`;
    $('qAnswers').textContent = '';
    $('qWhy').textContent = pass ? (stamped(site) ? `🏅 ${site.name} stamp earned!` : 'Photograph everything here to earn the passport stamp.') : '';
    $('qNext').hidden = true;
    if (pass) sfx.chime(true);
    renderGuide();
    return;
  }
  const q = qs[quiz.i];
  $('qProg').textContent = `Question ${quiz.i + 1} of ${qs.length}`;
  $('qText').textContent = q.q;
  $('qWhy').textContent = '';
  $('qNext').hidden = true;
  const box = $('qAnswers');
  box.textContent = '';
  q.a.forEach((a, i) => {
    const b = document.createElement('button');
    b.textContent = a;
    b.addEventListener('click', () => {
      for (const x of box.children) x.disabled = true;
      b.classList.add(i === q.c ? 'right' : 'wrong');
      box.children[q.c].classList.add('right');
      if (i === q.c) { quiz.score++; sfx.chime(false); }
      $('qWhy').textContent = q.why;
      $('qNext').hidden = false;
      $('qNext').textContent = quiz.i === qs.length - 1 ? 'See score' : 'Next';
    });
    box.append(b);
  });
}
$('qNext').addEventListener('click', () => { quiz.i++; showQuestion(); });
$('qClose').addEventListener('click', () => { $('quiz').hidden = true; });
$('quizBtn').addEventListener('click', startQuiz);

// ── home ───────────────────────────────────────────────────────────────────────────────────────

function renderHome() {
  const box = $('cards');
  box.textContent = '';
  let stamps = 0, total = 0;
  SITES.forEach((s, i) => {
    const n = foundCount(s);
    total += n;
    if (stamped(s)) stamps++;
    const b = document.createElement('button');
    b.className = 'card';
    b.style.background = `linear-gradient(160deg, ${s.colors[0]}, ${s.colors[1]})`;
    b.innerHTML = `<span class="num">${String(i + 1).padStart(2, '0')}</span><span class="emoji">${EMOJI[s.id]}</span>
      ${stamped(s) ? '<span class="stamp">STAMPED</span>' : ''}
      <h2></h2><div class="place"></div>
      <div class="meta"><span>${s.temp} °C</span><span>${s.depth.top ? s.depth.top.toLocaleString('en-US') + '–' : ''}${s.depth.bottom.toLocaleString('en-US')} m</span><span></span></div>
      <div class="prog"><i style="width:${(100 * n) / s.finds.length}%"></i></div>`;
    b.querySelector('h2').textContent = s.name;
    b.querySelector('.place').textContent = s.place;
    b.querySelector('.meta span:last-child').textContent = s.water;
    b.title = `${s.blurb}\n\nFound ${n} of ${s.finds.length}`;
    b.addEventListener('click', async () => {
      ensureAudio();
      if (site?.id !== s.id) await loadSite(s.id);
      enterDive();
    });
    box.append(b);
  });
  $('stampCount').textContent = `${stamps} / ${SITES.length}`;
  $('totalFound').textContent = total;
}

function goHome() {
  mode = 'home';
  renderHome();
  $('home').hidden = false;
  $('hud').hidden = true;
  $('card').hidden = true;
  $('vignette').hidden = true;
  startTour(true);
  stage.setStereo(false);
}

function enterDive() {
  mode = 'dive';
  $('home').hidden = true;
  $('hud').hidden = false;
  $('vignette').hidden = false;
  toggleGuide(guideOpen);
  stopTour();
  refreshLabels();
  stage.setStereo(stereoWanted);
  lastInput = performance.now();
  canvas.focus();
  if (store.get('helped') !== '1') { $('help').hidden = false; store.set('helped', '1'); }
  else toast(`${site.name}: ${site.place}`);
}

$('homeBtn').addEventListener('click', goHome);
$('guideBtn').addEventListener('click', () => toggleGuide());
$('tourBtn').addEventListener('click', () => (tour.on ? stopTour() : startTour(false)));
$('shutter').addEventListener('click', () => photograph(null));
$('helpBtn').addEventListener('click', () => { $('help').hidden = false; });
$('helpClose').addEventListener('click', () => { $('help').hidden = true; canvas.focus(); });
$('cardX').addEventListener('click', () => { $('card').hidden = true; });
$('depth').addEventListener('input', (e) => stage.setDepth(parseFloat(e.target.value)));

let stereoWanted = !params.has('mono');
$('lensBtn').addEventListener('click', async () => {
  stereoWanted = !stage.stereo;
  await stage.setStereo(stereoWanted);
});
stage.onModeChange = (stereo) => {
  $('badge').textContent = stage.woven ? (stereo ? '3D' : '2D') : '2D';
  $('badge').dataset.kind = stage.woven && stereo ? 'ok' : '';
  $('lensBtn').textContent = stereo ? '3D' : '2D';
};

// ── sound (Web Audio, synthesised: no files) ───────────────────────────────────────────────────

let audio = null;
let soundOn = store.get('sound') !== '0';
const sfx = { shutter() {}, chime() {}, breath() {} };
function ensureAudio() {
  if (audio || !soundOn) return;
  try {
    const ac = new AudioContext();
    const master = ac.createGain();
    master.gain.value = 0.6;
    master.connect(ac.destination);
    // Underwater rumble: brown noise through a low-pass that slowly breathes.
    const len = ac.sampleRate * 4;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const amb = ac.createGain();
    amb.gain.value = 0.32;
    src.connect(lp).connect(amb).connect(master);
    src.start();
    const lfo = ac.createOscillator();
    const lfoG = ac.createGain();
    lfo.frequency.value = 0.07;
    lfoG.gain.value = 140;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start();
    const noise = (dur, f, q, g, type = 'bandpass') => {
      const s = ac.createBufferSource();
      s.buffer = buf;
      const bp = ac.createBiquadFilter();
      bp.type = type;
      bp.frequency.value = f;
      bp.Q.value = q;
      const gg = ac.createGain();
      const t = ac.currentTime;
      gg.gain.setValueAtTime(0, t);
      gg.gain.linearRampToValueAtTime(g, t + dur * 0.3);
      gg.gain.linearRampToValueAtTime(0, t + dur);
      s.connect(bp).connect(gg).connect(master);
      s.start(t, Math.random() * 3);
      s.stop(t + dur + 0.05);
    };
    const tone = (f, t0, dur, g, type = 'sine') => {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const gg = ac.createGain();
      gg.gain.setValueAtTime(0, ac.currentTime + t0);
      gg.gain.linearRampToValueAtTime(g, ac.currentTime + t0 + 0.02);
      gg.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + dur);
      o.connect(gg).connect(master);
      o.start(ac.currentTime + t0);
      o.stop(ac.currentTime + t0 + dur + 0.05);
    };
    sfx.shutter = () => { noise(0.08, 3200, 1.2, 0.5); tone(1800, 0.05, 0.05, 0.08, 'square'); };
    sfx.chime = (big) => { [660, 880, 1320].forEach((f, i) => tone(f * (big ? 1.25 : 1), i * 0.09, 0.6, 0.12)); };
    sfx.breath = () => { noise(1.4, 900, 0.7, 0.12); setTimeout(() => noise(0.9, 400, 0.6, 0.18), 1500); };
    sfx.song = () => {
      // A humpback-ish moan: a slow swoop with vibrato.
      const o = ac.createOscillator(), v = ac.createOscillator(), vg = ac.createGain(), gg = ac.createGain();
      const t = ac.currentTime, f = 180 + Math.random() * 220;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 2.2 : 0.55), t + 2.2);
      v.frequency.value = 5;
      vg.gain.value = 6;
      v.connect(vg).connect(o.frequency);
      gg.gain.setValueAtTime(0, t);
      gg.gain.linearRampToValueAtTime(0.08, t + 0.5);
      gg.gain.linearRampToValueAtTime(0, t + 2.6);
      o.connect(gg).connect(master);
      o.start(t); v.start(t); o.stop(t + 2.7); v.stop(t + 2.7);
    };
    sfx.ping = () => tone(1500, 0, 1.6, 0.06);
    audio = { ac, master };
  } catch (e) {
    console.warn('[dive] no audio', e);
  }
}
function setSound(on) {
  soundOn = on;
  store.set('sound', on ? '1' : '0');
  $('soundBtn').textContent = on ? '🔊' : '🔇';
  if (on) ensureAudio();
  if (audio) audio.master.gain.value = on ? 0.6 : 0;
}
$('soundBtn').addEventListener('click', () => setSound(!soundOn));
$('soundBtn').textContent = soundOn ? '🔊' : '🔇';

// ── the frame ──────────────────────────────────────────────────────────────────────────────────

let songT = 8, breathT = 3;
let focus = 5;
stage.onTick = (dt) => {
  if (!ctx) return;
  const t = (TIME.value += dt);
  if (mode === 'dive' && !tour.on && performance.now() - lastInput > 75000 && $('quiz').hidden) startTour(true);
  if (tour.on) tourStep(dt);
  else moveDiver(dt, t);

  euler.set(diver.pitch, diver.yaw, Math.sin(t * 0.6) * 0.012);
  stage.cam.position.copy(diver.pos);
  stage.cam.quaternion.setFromEuler(euler);
  stage.cam.updateMatrixWorld();
  world.fwd.set(0, 0, -1).applyQuaternion(stage.cam.quaternion);

  simulate(dt, t);
  water.update(dt, t, world.ceilAt);
  if (mode === 'dive') updateAim();
  else { hover = null; if (hoverLabel) { hoverLabel.parent?.remove(hoverLabel); disposeLabel(hoverLabel); hoverLabel = null; } }
  updateOrb(dt, t);
  for (const s of labelSprites) {
    s.userData.entry.center(s.position);
    s.position.y += s.userData.entry.radius * 1.1;
    s.visible = s.position.distanceTo(diver.pos) < 14 && s !== hoverLabel;
  }

  // Stereo focus: what you're looking at, else the floor/roof ahead, else partway into the haze.
  let want;
  if (hover) want = hover.dist;
  else {
    want = Math.min(18, 1.0 / Math.max(0.01, mod.env.density));
    const p = tmp.copy(diver.pos);
    for (let d = 0.5; d < want; d += 0.5) {
      p.copy(diver.pos).addScaledVector(world.fwd, d);
      if (p.y < world.floorAt(p.x, p.z) || p.y > world.ceilAt(p.x, p.z) + 0.01) { want = d; break; }
    }
  }
  focus = damp(focus, clamp(want, 0.6, 20), 3, dt);
  stage.focusDist = focus;
  updateLabels(stage.cam);
  if (mode === 'dive') updateHud(dt);

  // Ambient sound cues.
  if (audio && soundOn) {
    if (!mod.env.sub && (breathT -= dt) <= 0) { breathT = 4.6; sfx.breath(); }
    if (mod.env.song && (songT -= dt) <= 0) { songT = 6 + Math.random() * 9; sfx.song(); }
    if (mod.env.sub && (songT -= dt) <= 0) { songT = 9; sfx.ping(); }
  }
};

// ── self-test: load every site, check that every find is placed, render a frame of each ────────

async function selftest() {
  const report = [];
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => { errors.push(a.map(String).join(' ')); origErr(...a); };
  for (const s of SITES) {
    const t0 = performance.now();
    await loadSite(s.id);
    const missing = s.finds.filter((f) => !ctx.finds.has(f.id)).map((f) => f.id);
    const extra = [...ctx.finds.keys()].filter((id) => !s.finds.some((f) => f.id === id));
    for (let i = 0; i < 20; i++) simulate(1 / 30, TIME.value + i / 30);
    stage.renderer.info.reset();
    stage.renderer.render(stage.scene, stage.cam);
    const calls = stage.renderer.info.render.calls, tris = stage.renderer.info.render.triangles;
    const nanSwimmer = ctx.swimmers.find((w) => !Number.isFinite(w.obj.position.x + w.obj.position.y + w.obj.position.z));
    report.push({ site: s.id, ms: Math.round(performance.now() - t0), finds: ctx.finds.size, missing, extra, swimmers: ctx.swimmers.length, schools: ctx.schools.length, calls, tris, nan: !!nanSwimmer, floorAtStart: +(world.floorAt(diver.pos.x, diver.pos.z)).toFixed(2), start: ctx.start.pos });
  }
  console.error = origErr;
  const ok = report.every((r) => !r.missing.length && !r.extra.length && !r.nan) && !errors.length;
  window.__selftest = { ok, report, errors };
  console.info('[dive] SELFTEST ' + (ok ? 'PASS' : 'FAIL') + ' ' + JSON.stringify(window.__selftest));
  document.title = 'SELFTEST ' + (ok ? 'PASS' : 'FAIL');
}

// ── boot ───────────────────────────────────────────────────────────────────────────────────────

window.dive = { stage, water, diver, get ctx() { return ctx; }, get site() { return site; }, loadSite, enterDive, goHome, photograph, pickFind, aimRay, found, selftest, tour };

(async () => {
  const startId = params.get('site');
  await loadSite(byId[startId] ? startId : store.get('last') && byId[store.get('last')] ? store.get('last') : 'reef');
  const { woven } = await stage.start();
  stage.onModeChange(woven && stage.stereo);
  $('lensBtn').hidden = !stage.displayModesSupported;
  if (params.has('selftest')) { await selftest(); }
  if (byId[startId]) {
    enterDive();
    if (params.has('tour')) startTour(false);
  } else goHome();
})();
