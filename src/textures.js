// @ts-check
// Procedural canvas textures, so the game ships without image files.
import * as THREE from 'three';
import { BODY } from './ballistics.js';

/** Small seeded random generator, so the scene looks the same every run. */
export function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Frosted grass: dark olive with pale frost speckles. */
export function grassTexture(base, frost, seed) {
  const c = canvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const r = rng(seed);
  for (let i = 0; i < 2600; i++) {
    const x = r() * 256;
    const y = r() * 256;
    g.globalAlpha = 0.08 + r() * 0.22;
    g.fillStyle = r() < 0.55 ? frost : '#1c2116';
    g.fillRect(x, y, 1 + r() * 2, 1 + r() * 3);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Raw earth for the berms. */
export function earthTexture(seed) {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#3a3128';
  g.fillRect(0, 0, 128, 128);
  const r = rng(seed);
  for (let i = 0; i < 900; i++) {
    g.globalAlpha = 0.1 + r() * 0.25;
    g.fillStyle = r() < 0.5 ? '#5b4e40' : '#211b16';
    g.fillRect(r() * 128, r() * 128, 1 + r() * 3, 1 + r() * 2);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Paper target layout. The sheet is PAPER_W x PAPER_H metres and the silhouette's feet sit
// PAPER_FOOT metres above its bottom edge.
export const PAPER = { W: 0.8, H: 1.95, FOOT: 0.05, PX_PER_M: 160 };

/**
 * A buff paper sheet with a black silhouette drawn exactly inside the hit zones.
 * Returns the canvas too, so bullet holes can be painted on it later.
 */
export function paperTarget(number) {
  const W = Math.round(PAPER.W * PAPER.PX_PER_M);
  const H = Math.round(PAPER.H * PAPER.PX_PER_M);
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const k = PAPER.PX_PER_M;
  const h = BODY.HEIGHT;
  const cx = W / 2;
  const foot = H - PAPER.FOOT * k;
  const ty = (yMetres) => foot - yMetres * k;

  g.fillStyle = '#d9d0bc';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(90, 70, 40, 0.35)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, W - 2, H - 2);

  g.fillStyle = '#17191c';
  // Legs, torso and head: the exact hit zones (the head without the leniency bonus).
  g.fillRect(cx - BODY.LEGS_HALF_W * h * k, ty(BODY.TORSO_Y0 * h), BODY.LEGS_HALF_W * h * 2 * k, BODY.TORSO_Y0 * h * k);
  g.fillRect(cx - BODY.TORSO_HALF_W * h * k, ty(BODY.TORSO_Y1 * h), BODY.TORSO_HALF_W * h * 2 * k, (BODY.TORSO_Y1 - BODY.TORSO_Y0) * h * k);
  g.beginPath();
  g.arc(cx, ty(BODY.HEAD_Y * h), BODY.HEAD_R * h * k, 0, Math.PI * 2);
  g.fill();
  // Neck, so the figure reads as a person.
  g.fillRect(cx - 0.03 * h * k, ty(BODY.HEAD_Y * h - BODY.HEAD_R * h * 0.6), 0.06 * h * k, (BODY.HEAD_Y * h - BODY.HEAD_R * h * 0.6 - BODY.TORSO_Y1 * h) * k + 2);

  // Scoring rings on the chest and head.
  g.strokeStyle = 'rgba(217, 208, 188, 0.55)';
  g.lineWidth = 2;
  for (const r of [0.06, 0.12]) {
    g.beginPath();
    g.arc(cx, ty(0.7 * h), r * h * k, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.arc(cx, ty(BODY.HEAD_Y * h), BODY.HEAD_R * h * k * 0.5, 0, Math.PI * 2);
  g.stroke();

  // Lane number in the corner.
  g.fillStyle = '#9c2b2b';
  g.font = 'bold 30px Impact, "Arial Narrow", sans-serif';
  g.textAlign = 'left';
  g.fillText(String(number), 8, 34);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { texture: t, canvas: c };
}

/**
 * Paints a bullet hole at a point on the paper. x is sideways from the centre line and y is
 * height above the silhouette's feet, both in metres.
 */
export function paintHole(target, x, y) {
  const g = target.canvas.getContext('2d');
  const k = PAPER.PX_PER_M;
  const px = target.canvas.width / 2 + x * k;
  const py = target.canvas.height - PAPER.FOOT * k - y * k;
  g.fillStyle = 'rgba(233, 227, 214, 0.9)';
  g.beginPath();
  g.arc(px, py, 4.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#060708';
  g.beginPath();
  g.arc(px, py, 2.6, 0, Math.PI * 2);
  g.fill();
  target.texture.needsUpdate = true;
}

/** White distance board with stencil numbers. */
export function boardTexture(text) {
  const c = canvas(256, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#e9e3d6';
  g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#1b1d20';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 248, 120);
  g.fillStyle = '#1b1d20';
  g.font = 'bold 84px Impact, "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Soft round puff for dust and mist sprites. */
export function puffTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Window glow for buildings in the distant city. */
export function windowsTexture(seed) {
  const c = canvas(64, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#14191f';
  g.fillRect(0, 0, 64, 128);
  const r = rng(seed);
  for (let y = 6; y < 124; y += 10) {
    for (let x = 4; x < 60; x += 9) {
      if (r() < 0.16) {
        g.fillStyle = r() < 0.7 ? '#e8a33d' : '#c9d3dc';
        g.globalAlpha = 0.5 + r() * 0.5;
        g.fillRect(x, y, 4, 5);
      }
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
