// Text labels as sprites, so they live in the 3D scene and get real depth on a DisplayXR display
// (HTML labels would sit flat on the glass). Each frame they are scaled to a constant on-screen
// size, from their distance to the camera.

import * as THREE from 'three';

const all = new Set();

/** A pill label. `anchorY` > 0 lifts it above its point (in label heights). */
export function makeLabel(text, { color = '#ffffff', bg = 'rgba(6,10,20,0.72)', size = 1, anchorY = 0.5, bold = true } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `${bold ? 600 : 400} 44px "Segoe UI", system-ui, sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 44;
  c.width = w; c.height = 64;
  g.font = font;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(2, 2, w - 4, 60, 30);
  g.fill();
  g.strokeStyle = color;
  g.globalAlpha = 0.55;
  g.lineWidth = 3;
  g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = color;
  g.textBaseline = 'middle';
  g.fillText(text, 22, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.center.set(0.5, -anchorY);
  s.renderOrder = 20;
  s.userData.label = { aspect: w / 64, size };
  all.add(s);
  return s;
}

/** A sprite that keeps a constant screen size (`size` as a fraction of the view height). */
export function makeIcon(tex, size = 0.02, { depthTest = false, color } = {}) {
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest, depthWrite: false, transparent: true, ...(color ? { color } : {}) });
  const s = new THREE.Sprite(mat);
  s.renderOrder = 19;
  s.userData.label = { aspect: 1, size: size / 0.03 };
  all.add(s);
  return s;
}

export function disposeLabel(s) {
  all.delete(s);
  s.material.map?.dispose();
  s.material.dispose();
}

const tmp = new THREE.Vector3();
/** Scale every label for this camera. 0.03 of the view height per unit of `size`. */
export function updateLabels(cam, scale = 1) {
  const k = 2 * Math.tan((cam.fov * Math.PI) / 360) * 0.03 * scale;
  for (const s of all) {
    if (!s.visible) continue;
    s.getWorldPosition(tmp);
    const d = tmp.distanceTo(cam.position);
    const { aspect, size } = s.userData.label;
    const h = d * k * size;
    // Undo any parent scale so the label is the size we ask for.
    const ps = s.parent ? s.parent.getWorldScale(tmp).x || 1 : 1;
    s.scale.set((h * aspect) / ps, h / ps, 1);
  }
}
