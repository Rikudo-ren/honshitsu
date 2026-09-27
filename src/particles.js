// ============================================================
// Canvas2D 自前パーティクル(プール・加算合成・ハロー付き)
// 重力/抗力/寿命/吸い込み/曲線飛行/周回
// ============================================================
import { CONFIG } from './config.js';

let canvas = null;
let g = null;
let W = 0, H = 0;
let pool = [];
let active = 0;
let maxN = CONFIG.particleMax;
let reduced = false;

const TAU = Math.PI * 2;

export function initParticles(cv) {
  canvas = cv;
  g = canvas.getContext('2d');
  setMax(CONFIG.particleMax);
  resize();
}

export function setReducedMotion(on) {
  reduced = on;
  setMax(on ? CONFIG.particleReduced : CONFIG.particleMax);
}

function setMax(n) {
  maxN = n;
  pool = [];
  for (let i = 0; i < n; i++) {
    pool.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
      size: 2, color: '#F2C14E', grav: 0, drag: 0, mode: 0,
      ax: 0, ay: 0, curve: 0, orbit: 0, angle: 0, halo: 0.25, shape: 0 });
  }
  active = 0;
}

export function resizeParticles(w, h, dpr) {
  W = w; H = h;
  if (!canvas) return;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function resize() { /* 実サイズはresizeParticlesで */ }

function spawn(o) {
  // 空きを探す(線形・プールは小さいのでOK)
  for (let i = 0; i < pool.length; i++) {
    const p = pool[(spawnCursor + i) % pool.length];
    if (!p.alive) {
      spawnCursor = (spawnCursor + i + 1) % pool.length;
      p.alive = true;
      p.x = o.x || 0; p.y = o.y || 0;
      p.vx = o.vx || 0; p.vy = o.vy || 0;
      p.maxLife = o.life || 1; p.life = p.maxLife;
      p.size = o.size || 3;
      p.color = o.color || '#F2C14E';
      p.grav = o.grav || 0; p.drag = o.drag || 0;
      p.mode = o.mode || 0; // 0通常 1吸い込み 2周回
      p.ax = o.ax || 0; p.ay = o.ay || 0;
      p.curve = o.curve || 0;
      p.orbit = o.orbit || 0;
      p.angle = Math.random() * TAU;
      p.halo = o.halo !== undefined ? o.halo : 0.25;
      p.shape = o.shape || 0; // 0丸 1紙片 2十字
      p.rot = Math.random() * TAU;
      p.vrot = (Math.random() - 0.5) * 8;
      return;
    }
  }
}
let spawnCursor = 0;

export function burst(x, y, n, opts) {
  opts = opts || {};
  const colors = opts.colors || ['#F2C14E', '#FFF6D8', '#F7F5EE'];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const sp = (opts.speed || 220) * (0.3 + Math.random() * 0.9);
    spawn({
      x, y,
      vx: Math.cos(a) * sp + (opts.vx || 0),
      vy: Math.sin(a) * sp + (opts.vy || 0),
      life: (opts.life || 0.8) * (0.6 + Math.random() * 0.7),
      size: (opts.size || 3.5) * (0.6 + Math.random() * 0.8),
      color: colors[(Math.random() * colors.length) | 0],
      grav: opts.grav !== undefined ? opts.grav : 300,
      drag: opts.drag !== undefined ? opts.drag : 1.6,
      curve: opts.curve || 0,
      shape: opts.shape !== undefined ? opts.shape : (Math.random() < 0.25 ? 1 : 0),
    });
  }
}

export function suckBurst(x, y, n, tx, ty, color) { // 中心への吸い込み
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const r = 90 + Math.random() * 160;
    spawn({
      x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
      vx: 0, vy: 0, life: 0.7 + Math.random() * 0.4,
      size: 2 + Math.random() * 3, color: color || '#F2C14E',
      mode: 1, ax: tx, ay: ty, drag: 0.4, shape: 0,
    });
  }
}

export function orbitBurst(x, y, n, color) { // 周回
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    spawn({
      x: x + Math.cos(a) * 60, y: y + Math.sin(a) * 60,
      vx: -Math.sin(a) * 160, vy: Math.cos(a) * 160,
      life: 1.2, size: 3, color: color || '#F2C14E',
      mode: 2, ax: x, ay: y, orbit: 260, shape: 2,
    });
  }
}

export function petal(x, y, vx, vy, color) { // 桜・紙吹雪1枚
  spawn({ x, y, vx, vy, life: 2.5 + Math.random() * 2, size: 3 + Math.random() * 3,
    color: color || '#F5B8C9', grav: 40, drag: 0.6, curve: 60, shape: 1 });
}

export function crossSpark(x, y, big) { // ✝を刻んだ瞬間の火花
  burst(x, y, big ? 26 : 12, { speed: big ? 320 : 200, life: 0.6, size: 3,
    colors: ['#F2C14E', '#FFF3C4', '#FFFFFF'], grav: 160, drag: 2.2 });
}

export function update(dt) {
  if (!g) return;
  g.clearRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) { p.alive = false; continue; }
    if (p.mode === 1) { // 吸い込み
      const dx = p.ax - p.x, dy = p.ay - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const f = 900 / Math.max(40, d);
      p.vx += (dx / d) * f * dt * 60 * 0.16;
      p.vy += (dy / d) * f * dt * 60 * 0.16;
    } else if (p.mode === 2) { // 周回
      const dx = p.x - p.ax, dy = p.y - p.ay;
      const d = Math.hypot(dx, dy) || 1;
      p.vx += (-dy / d) * p.orbit * dt + (-dx / d) * 60 * dt;
      p.vy += (dx / d) * p.orbit * dt + (-dy / d) * 60 * dt;
    }
    if (p.curve) { // 曲線飛行(横ゆらぎ)
      p.angle += dt * 4;
      p.vx += Math.cos(p.angle) * p.curve * dt;
    }
    p.vy += p.grav * dt;
    const dr = 1 - Math.min(0.95, p.drag * dt);
    p.vx *= dr; p.vy *= dr;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.rot += p.vrot * dt;
    const t = p.life / p.maxLife;
    const alpha = t < 0.35 ? t / 0.35 : 1;
    drawP(p, alpha);
  }
  g.globalCompositeOperation = 'source-over';
}

function drawP(p, alpha) {
  const s = p.size * (0.5 + 0.5 * (p.life / p.maxLife));
  g.globalAlpha = alpha * 0.35;
  g.fillStyle = p.color;
  g.beginPath();
  g.arc(p.x, p.y, s * 3.2, 0, TAU); // ハロー
  g.fill();
  g.globalAlpha = alpha;
  if (p.shape === 1) { // 紙片
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot);
    g.fillRect(-s, -s * 0.7, s * 2, s * 1.4);
    g.restore();
  } else if (p.shape === 2) { // 十字
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.rot * 0.5);
    g.fillRect(-s * 1.6, -s * 0.45, s * 3.2, s * 0.9);
    g.fillRect(-s * 0.45, -s * 1.6, s * 0.9, s * 3.2);
    g.restore();
  } else {
    g.beginPath();
    g.arc(p.x, p.y, s, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
}

export function clearAll() {
  for (const p of pool) p.alive = false;
  if (g) g.clearRect(0, 0, W, H);
}
