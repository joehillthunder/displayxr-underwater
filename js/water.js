// What makes it feel underwater, shared by every site: tinted fog, a sky dome that is bright above
// and dark below, the surface seen from underneath (with Snell's window), sunbeams, caustics
// rippling over the floor, drifting particles (plankton or marine snow), the diver's exhaled
// bubbles, and terrain / ceiling heightfields that double as collision.

import * as THREE from 'three';
import { TIME } from './models.js';
import { clamp } from './util.js';

export const CAUSTIC = { value: 0.6 }; // strength
export const SURFACE_Y = { value: 0 }; // caustics fade with depth below this
export const CAUSTIC_FADE = { value: 14 }; // metres for caustics to fade by e

// ── caustics: patch any lit material so light ripples dance on upward-facing surfaces ──────────

const CAUSTIC_GLSL = `
  float causticAt(vec2 uv, float t) {
    vec2 p = mod(uv * 6.2831, 6.2831) - 250.0;
    vec2 i = p;
    float c = 1.0;
    for (int n = 0; n < 4; n++) {
      float tt = t * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
    }
    c /= 4.0;
    c = 1.17 - pow(c, 1.4);
    return pow(abs(c), 8.0);
  }`;

export function addCaustics(m) {
  const prev = m.onBeforeCompile;
  const base = m.userData.u ? m.customProgramCacheKey() : 'plain';
  m.onBeforeCompile = (sh, r) => {
    if (m.userData.u) prev.call(m, sh, r);
    sh.uniforms.uTime = TIME;
    sh.uniforms.uCaustic = CAUSTIC;
    sh.uniforms.uSurfaceY = SURFACE_Y;
    sh.uniforms.uCausticFade = CAUSTIC_FADE;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCWorld;\nvarying vec3 vCNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vCWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          vCNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vCWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vCNormal = normalize(mat3(modelMatrix) * objectNormal);
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCWorld;
        varying vec3 vCNormal;
        uniform float uCaustic, uSurfaceY, uCausticFade;
        uniform float uTime;
        ${CAUSTIC_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float up = clamp(vCNormal.y * 0.8 + 0.2, 0.0, 1.0);
          float fade = exp(-max(0.0, uSurfaceY - vCWorld.y) / uCausticFade);
          float cs = causticAt(vCWorld.xz * 0.075, uTime * 0.6) + 0.6 * causticAt(vCWorld.xz * 0.11 + 3.1, uTime * 0.45);
          totalEmissiveRadiance += diffuseColor.rgb * min(cs, 2.0) * uCaustic * up * fade;
        }`);
  };
  m.customProgramCacheKey = () => base + '|caustic';
  return m;
}

// ── heightfields ────────────────────────────────────────────────────────────────────────────────

/**
 * A floor (or, with ceiling: true, a roof seen from below) of size × size metres centred on 0.
 * height(x, z) gives y; paint(x, z, y, out) colours it.
 */
export function heightfield({ size = 160, seg = 160, height, paint, ceiling = false, rough = 0.95, caustics = true }) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = height(x, z);
    pos.setY(i, y);
    paint(x, z, y, c);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  if (ceiling) {
    // Flip the winding so the lit side faces down.
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  }
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0 });
  if (caustics && !ceiling) addCaustics(m);
  const mesh = new THREE.Mesh(g, m);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// ── the environment ─────────────────────────────────────────────────────────────────────────────

const domeVert = `varying vec3 vDir;
  void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; }`;
const domeFrag = `varying vec3 vDir;
  uniform vec3 uTop, uMid, uBottom, uSun;
  uniform float uSunPow;
  void main() {
    float y = vDir.y;
    vec3 c = y > 0.0 ? mix(uMid, uTop, pow(clamp(y, 0.0, 1.0), 0.7)) : mix(uMid, uBottom, pow(clamp(-y, 0.0, 1.0), 0.6));
    c += uSun * pow(max(0.0, y), uSunPow);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

const surfVert = `varying vec3 vW;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
// Seen from below, the surface shows the sky only inside Snell's window (a cone of about 48.6°
// from straight up). Outside it the surface acts as a mirror of the dark water below.
const surfFrag = `varying vec3 vW;
  uniform float uTime;
  uniform vec3 uSky, uMirror;
  uniform float uOpacity;
  float h(vec2 p) { return sin(p.x * 1.7 + uTime * 1.3) * 0.5 + sin(p.y * 2.3 - uTime * 1.1) * 0.5 + sin((p.x + p.y) * 3.1 + uTime * 1.9) * 0.3; }
  void main() {
    vec3 d = normalize(vW - cameraPosition);
    float ang = acos(clamp(d.y, -1.0, 1.0));
    float ripple = h(vW.xz * 0.35) * 0.08 + h(vW.xz * 1.1 + 7.0) * 0.03;
    float inside = 1.0 - smoothstep(0.80, 0.86, ang + ripple);
    float sparkle = pow(max(0.0, h(vW.xz * 0.9) * 0.5 + 0.5), 10.0);
    vec3 c = mix(uMirror * (0.85 + ripple * 2.0), uSky * (1.0 + sparkle * 0.6), inside);
    float edge = smoothstep(0.75, 0.84, ang) * (1.0 - smoothstep(0.84, 0.95, ang));
    c += uSky * edge * 0.35;
    float dist = length(vW.xz - cameraPosition.xz);
    gl_FragColor = vec4(c, uOpacity * (1.0 - smoothstep(60.0, 140.0, dist)));
    #include <colorspace_fragment>
  }`;

export class Water {
  constructor(scene, cam) {
    this.scene = scene;
    this.cam = cam;
    this.root = new THREE.Group();
    scene.add(this.root);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(0.3, 1, 0.2);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(this.hemi, this.sun, this.ambient);

    // Lights carried by the diver or submersible (off unless the site is dark).
    this.lamp = new THREE.SpotLight(0xfff2dd, 0, 40, 0.5, 0.55, 1.1);
    this.lamp.position.set(0.25, -0.2, 0);
    this.lamp.target.position.set(0, -0.6, -6);
    this.glowLamp = new THREE.PointLight(0x9fc8ff, 0, 7, 1.6);
    cam.add(this.lamp, this.lamp.target, this.glowLamp);

    this.domeU = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uSunPow: { value: 40 } };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({ uniforms: this.domeU, vertexShader: domeVert, fragmentShader: domeFrag, side: THREE.BackSide, depthWrite: false, fog: false }));
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.surfU = { uTime: TIME, uSky: { value: new THREE.Color() }, uMirror: { value: new THREE.Color() }, uOpacity: { value: 1 } };
    const sg = new THREE.PlaneGeometry(320, 320, 1, 1);
    sg.rotateX(Math.PI / 2);
    this.surface = new THREE.Mesh(sg, new THREE.ShaderMaterial({ uniforms: this.surfU, vertexShader: surfVert, fragmentShader: surfFrag, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    this.surface.renderOrder = -5;
    this.surface.frustumCulled = false;
    scene.add(this.surface);

    this.rays = this.makeRays();
    this.particles = this.makeParticles();
    this.bubbles = this.makeBubbles();
  }

  /** env: { fog, density, top, mid, bottom, sunGlow, light, ambient, hemiSky, hemiGround,
   *  surface (y or null), rays (0-1), caustics (0-1), particles: { color, size, count, fall },
   *  lamp (0-1), exposure } */
  configure(env) {
    this.env = env;
    const fog = new THREE.Color(env.fog);
    this.scene.fog = new THREE.FogExp2(fog, env.density);
    this.scene.background = fog;
    this.domeU.uTop.value.set(env.top ?? env.fog);
    this.domeU.uMid.value.copy(fog);
    this.domeU.uBottom.value.set(env.bottom ?? env.fog);
    this.domeU.uSun.value.set(env.sunGlow ?? '#000000');
    this.hemi.color.set(env.hemiSky ?? '#cfeaff');
    this.hemi.groundColor.set(env.hemiGround ?? '#2a3a40');
    this.hemi.intensity = env.hemi ?? 1.1;
    this.sun.intensity = env.light ?? 1.5;
    this.sun.color.set(env.sunColor ?? '#dff4ff');
    this.ambient.intensity = env.ambient ?? 0.12;
    this.ambient.color.set(env.ambientColor ?? '#ffffff');
    this.surface.visible = env.surface != null;
    if (env.surface != null) {
      this.surface.position.y = env.surface;
      this.surfU.uSky.value.set(env.surfaceSky ?? '#e8fbff');
      this.surfU.uMirror.value.set(env.surfaceMirror ?? env.fog);
      this.surfU.uOpacity.value = env.surfaceOpacity ?? 1;
    }
    SURFACE_Y.value = env.surface ?? env.causticTop ?? 0;
    CAUSTIC.value = env.caustics ?? 0;
    CAUSTIC_FADE.value = env.causticFade ?? 14;
    this.rays.visible = (env.rays ?? 0) > 0;
    this.rayStrength = env.rays ?? 0;
    this.rayTop = env.rayTop ?? env.surface ?? 0;
    this.rayColor = new THREE.Color(env.rayColor ?? '#ffffff');
    this.rayCenter = env.rayCenter ?? null;
    for (const r of this.rays.children) r.material.color.copy(this.rayColor);
    const pc = env.particles ?? {};
    this.particles.material.uniforms.uColor.value.set(pc.color ?? '#ffffff');
    this.particles.material.uniforms.uSize.value = pc.size ?? 2.2;
    this.particles.material.uniforms.uFall.value = pc.fall ?? 0.05;
    this.particles.material.uniforms.uOpacity.value = pc.opacity ?? 0.5;
    this.particles.geometry.setDrawRange(0, pc.count ?? 1500);
    this.lamp.intensity = (env.lamp ?? 0) * 60;
    this.glowLamp.intensity = (env.lamp ?? 0) * 2.5;
    this.bubblesOn = env.bubbles !== false;
  }

  makeRays() {
    const g = new THREE.Group();
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const x = c.getContext('2d');
    const grad = x.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grad;
    x.fillRect(0, 0, 64, 256);
    const side = x.getImageData(0, 0, 64, 256);
    for (let i = 0; i < 64; i++) {
      const k = Math.sin((i / 63) * Math.PI);
      for (let j = 0; j < 256; j++) side.data[(j * 64 + i) * 4 + 3] *= k * k;
    }
    x.putImageData(side, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    for (let i = 0; i < 14; i++) {
      const w = 1.5 + Math.random() * 3.5;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 45), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.1 }));
      m.geometry.translate(0, -22.5, 0);
      m.userData = { a: Math.random() * Math.PI * 2, r: 4 + Math.random() * 30, s: (Math.random() - 0.5) * 0.04, ph: Math.random() * 10, lean: (Math.random() - 0.5) * 0.25 };
      m.frustumCulled = false;
      g.add(m);
    }
    this.root.add(g);
    return g;
  }

  makeParticles() {
    const N = 3000;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos.set([Math.random() * 40 - 20, Math.random() * 40 - 20, Math.random() * 40 - 20], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: TIME, uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color() }, uSize: { value: 2 }, uFall: { value: 0.05 }, uOpacity: { value: 0.5 }, uView: { value: 1 } },
      vertexShader: `attribute float seed; uniform float uTime, uSize, uFall, uView; uniform vec3 uCam; varying float vA;
        void main() {
          vec3 p = position + vec3(sin(uTime * 0.3 + seed * 20.0) * 0.4, -uTime * uFall * (0.5 + seed), cos(uTime * 0.25 + seed * 13.0) * 0.4);
          p = mod(p - uCam + 20.0, 40.0) - 20.0 + uCam;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          vA = (1.0 - smoothstep(8.0, 20.0, d)) * smoothstep(0.2, 1.0, d);
          gl_PointSize = uSize * uView * (0.6 + seed) * 10.0 / max(d, 0.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vA;
        void main() { float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; gl_FragColor = vec4(uColor, (1.0 - r * 2.0) * vA * uOpacity); }`,
      transparent: true, depthWrite: false, fog: false,
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    this.root.add(p);
    return p;
  }

  makeBubbles() {
    const N = 160;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const m = new THREE.PointsMaterial({ color: 0xeaffff, size: 0.05, transparent: true, opacity: 0.75, depthWrite: false, fog: false });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    p.userData.list = [];
    p.userData.next = 2;
    this.root.add(p);
    return p;
  }

  /** A puff of bubbles at world point `at` (the diver's regulator, a vent, a sub's ballast…). */
  puff(at, n = 14, spread = 0.12) {
    const L = this.bubbles.userData.list;
    for (let i = 0; i < n && L.length < 160; i++)
      L.push({ x: at.x + (Math.random() - 0.5) * spread, y: at.y + (Math.random() - 0.5) * spread, z: at.z + (Math.random() - 0.5) * spread, v: 0.5 + Math.random() * 0.6, ph: Math.random() * 6, life: 0 });
  }

  /** ceilingAt(x, z): the roof over the diver (surface, ice or cave), so bubbles stop there. */
  update(dt, t, ceilingAt) {
    const cam = this.cam;
    this.dome.position.copy(cam.position);
    if (this.surface.visible) this.surface.position.set(cam.position.x, this.env.surface, cam.position.z);
    this.particles.material.uniforms.uCam.value.copy(cam.position);

    if (this.rays.visible) {
      const cx = this.rayCenter ? this.rayCenter[0] : cam.position.x;
      const cz = this.rayCenter ? this.rayCenter[1] : cam.position.z;
      for (const r of this.rays.children) {
        const u = r.userData;
        u.a += u.s * dt;
        const rr = this.rayCenter ? u.r * 0.25 : u.r;
        r.position.set(cx + Math.cos(u.a) * rr, this.rayTop, cz + Math.sin(u.a) * rr);
        r.rotation.set(0, Math.atan2(cam.position.x - r.position.x, cam.position.z - r.position.z), u.lean);
        const d = Math.hypot(cam.position.x - r.position.x, cam.position.z - r.position.z);
        const depthFade = clamp(1 - (this.rayTop - cam.position.y) / 70, 0.2, 1);
        r.material.opacity = this.rayStrength * (0.07 + 0.05 * Math.sin(t * 0.4 + u.ph)) * clamp(d / 3, 0, 1) * depthFade;
      }
    }

    // Exhaled bubbles: every few seconds from just above and in front of the diver's mouth.
    const bd = this.bubbles.userData;
    if (this.bubblesOn) {
      bd.next -= dt;
      if (bd.next <= 0) {
        bd.next = 3.6 + Math.random() * 1.2;
        const dir = new THREE.Vector3(0, 0.15, -0.45).applyQuaternion(cam.quaternion);
        this.puff(cam.position.clone().add(dir), 18, 0.1);
      }
    }
    const L = bd.list;
    const arr = this.bubbles.geometry.attributes.position.array;
    let n = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const b = L[i];
      b.life += dt;
      b.y += b.v * dt;
      b.x += Math.sin(t * 6 + b.ph) * 0.12 * dt;
      b.z += Math.cos(t * 5 + b.ph) * 0.12 * dt;
      const top = ceilingAt ? ceilingAt(b.x, b.z) : 1e9;
      if (b.y > top || b.life > 9) L.splice(i, 1);
    }
    for (const b of L) { arr[n * 3] = b.x; arr[n * 3 + 1] = b.y; arr[n * 3 + 2] = b.z; n++; }
    this.bubbles.geometry.setDrawRange(0, n);
    this.bubbles.geometry.attributes.position.needsUpdate = true;
  }
}
