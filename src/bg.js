// ============================================================
// 背景(静的キャンバス): 北棟理数科B組の教室 + OVERFLOW 3段階剥がし
// stage 0 教室 / 1 地層断面 / 2 等高線 / 3 夜空と桜
// ============================================================

let canvas = null;
let g = null;
let W = 0, H = 0;
let stage = 0;        // 0..3
let stageBlend = 0;   // 遷移ブレンド 0..1
let stageFrom = 0, stageTo = 0;
let blendT = 1;
let flicker = 0;
let time = 0;

// 漏出✝(背景でゆらゆら漏れる)
const leaks = [];
for (let i = 0; i < 7; i++) {
  leaks.push({ x: Math.random(), y: 0.55 + Math.random() * 0.4,
    s: 8 + Math.random() * 14, v: 6 + Math.random() * 10, ph: Math.random() * 6.28 });
}

export function initBg(cv) { canvas = cv; g = canvas.getContext('2d'); }

export function resizeBg(w, h, dpr) {
  W = w; H = h;
  if (!canvas) return;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawStatic(stage);
}

export function setStage(s, instant) {
  if (s === stage && blendT >= 1) return;
  stageFrom = blendT < 1 ? stageTo : stage;
  stageTo = s;
  blendT = 0;
  if (instant) { stage = s; stageFrom = s; stageTo = s; blendT = 1; drawStatic(s); }
}

export function getStage() { return stageTo; }

// 毎フレーム:ブレンド遷移 + 蛍光灯フリッカー + 漏出✝
export function updateBg(dt, reducedMotion) {
  time += dt;
  flicker = 0.94 + Math.random() * 0.06;
  if (Math.random() < 0.012) flicker = 0.78; // たまに明滅
  if (blendT < 1) {
    blendT = Math.min(1, blendT + dt * 1.6);
    drawStatic(blendT < 0.5 ? stageFrom : stageTo);
    if (blendT >= 1) stage = stageTo;
  }
  drawDynamic(reducedMotion);
}

function drawStatic(s) {
  if (!g) return;
  if (s === 0) drawClassroom();
  else if (s === 1) drawStratum();
  else if (s === 2) drawContour();
  else drawNightSky();
}

function drawClassroom() {
  // 壁(くすんだ緑)・床・天井
  const wallH = H * 0.62;
  let gr = g.createLinearGradient(0, 0, 0, wallH);
  gr.addColorStop(0, '#4A5648'); gr.addColorStop(1, '#3E4A3C');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, wallH);
  // 床タイル
  gr = g.createLinearGradient(0, wallH, 0, H);
  gr.addColorStop(0, '#6B6558'); gr.addColorStop(1, '#4C483E');
  g.fillStyle = gr;
  g.fillRect(0, wallH, W, H - wallH);
  g.strokeStyle = 'rgba(30,28,24,0.5)';
  g.lineWidth = 1;
  for (let i = 0; i < 6; i++) { // 目地(横)
    const y = wallH + (H - wallH) * (i / 6);
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }
  for (let i = 0; i <= 8; i++) { // 目地(縦)
    const x = (W / 8) * i;
    g.beginPath(); g.moveTo(x, wallH); g.lineTo(x + (i - 4) * 6, H); g.stroke();
  }
  // 黒板(等高線入り)
  const bw = W * 0.52, bh = wallH * 0.42, bx = W * 0.06, by = wallH * 0.2;
  g.fillStyle = '#1A1A22';
  g.fillRect(bx - 6, by - 6, bw + 12, bh + 12);
  g.fillStyle = '#2A3B34';
  g.fillRect(bx, by, bw, bh);
  // 等高線(黒板)
  g.strokeStyle = 'rgba(240,240,230,0.75)';
  g.lineWidth = 1.2;
  for (let k = 0; k < 5; k++) {
    g.beginPath();
    const cx = bx + bw * 0.5, cy = by + bh * 0.55, r = 12 + k * 11;
    g.ellipse(cx, cy, r * 1.7, r * 0.8, -0.2, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = 'rgba(240,240,230,0.8)';
  g.font = `${Math.max(10, W * 0.028)}px sans-serif`;
  g.fillText('糸魚川-静岡構造線', bx + 8, by + 20);
  // 窓(外の光)
  const ww = W * 0.3, wh = wallH * 0.5, wx = W * 0.65, wy = wallH * 0.14;
  gr = g.createLinearGradient(wx, wy, wx, wy + wh);
  gr.addColorStop(0, '#FFF8E2'); gr.addColorStop(1, '#E8D9A8');
  g.fillStyle = gr;
  g.fillRect(wx, wy, ww, wh);
  g.strokeStyle = '#1A1A22'; g.lineWidth = 3;
  g.strokeRect(wx, wy, ww, wh);
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.stroke();
  g.beginPath(); g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2); g.stroke();
  // 自販機(売切ランプ=コーンスープの不在)
  const vw = W * 0.13, vh = wallH * 0.42, vx = W * 0.03, vy = wallH * 0.52;
  g.fillStyle = '#8C2F3A';
  g.fillRect(vx, vy, vw, vh);
  g.fillStyle = '#22355B';
  g.fillRect(vx + 3, vy + 6, vw - 6, vh * 0.4);
  g.fillStyle = '#F7F5EE';
  g.font = `${Math.max(8, W * 0.02)}px sans-serif`;
  g.fillText('売切', vx + 5, vy + vh * 0.3);
  g.fillStyle = '#FF5544';
  g.beginPath(); g.arc(vx + vw - 8, vy + 12, 3, 0, 7); g.fill();
}

function drawStratum() { // ①地層断面
  const layers = ['#5A4A3C', '#6B5844', '#7A654E', '#4E3F33', '#83704F', '#3E3229'];
  const lh = H / layers.length;
  layers.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(0, i * lh, W, lh + 1);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let k = 0; k < 24; k++) {
      const x = ((k * 97 + i * 53) % 100) / 100 * W;
      g.fillRect(x, i * lh + 4 + (k % 3) * 5, 14, 2);
    }
  });
  // 断層線
  g.strokeStyle = '#F2C14E'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(W * 0.3, 0); g.lineTo(W * 0.45, H); g.stroke();
  g.fillStyle = 'rgba(242,193,78,0.9)';
  g.font = `bold ${Math.max(12, W * 0.035)}px sans-serif`;
  g.fillText('地面は忘れない', W * 0.08, H * 0.12);
}

function drawContour() { // ②等高線が浮き上がる
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#22355B'); gr.addColorStop(1, '#3E4A3C');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#F2C14E';
  for (let k = 0; k < 12; k++) {
    g.lineWidth = k % 3 === 0 ? 2.4 : 1;
    g.globalAlpha = 0.35 + 0.05 * k;
    g.beginPath();
    const cy = H * 0.5, r = 20 + k * 22;
    g.ellipse(W / 2, cy, r * 1.5, r * 0.75, 0.1, 0, Math.PI * 2);
    g.stroke();
  }
  g.globalAlpha = 1;
}

function drawNightSky() { // ③夜空と桜
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#0B1026'); gr.addColorStop(0.6, '#1B2A4A'); gr.addColorStop(1, '#3A2A4A');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#FFF';
  for (let k = 0; k < 90; k++) {
    const x = ((k * 137.5) % 100) / 100 * W;
    const y = ((k * 89.3) % 62) / 100 * H;
    g.globalAlpha = 0.3 + ((k * 7) % 10) / 14;
    g.fillRect(x, y, k % 9 === 0 ? 2.4 : 1.4, k % 9 === 0 ? 2.4 : 1.4);
  }
  g.globalAlpha = 1;
  // 月
  g.fillStyle = '#F7F0D8';
  g.beginPath(); g.arc(W * 0.8, H * 0.16, 26, 0, 7); g.fill();
  g.fillStyle = 'rgba(247,240,216,0.25)';
  g.beginPath(); g.arc(W * 0.8, H * 0.16, 44, 0, 7); g.fill();
}

function drawDynamic(reducedMotion) {
  if (!g) return;
  // 蛍光灯の光(教室のみ)
  if (stageTo === 0 || stageFrom === 0) {
    g.fillStyle = `rgba(247,245,238,${0.05 * flicker})`;
    g.fillRect(0, 0, W, H * 0.62);
  }
  // 床の目地から✝が漏れる(教室のみ)
  if (stageTo === 0 && !reducedMotion) {
    g.fillStyle = '#F2C14E';
    g.font = 'bold 16px serif';
    g.textAlign = 'center';
    for (const L of leaks) {
      L.y -= 0.0006;
      if (L.y < 0.5) { L.y = 0.95; L.x = Math.random(); }
      const x = L.x * W + Math.sin(time * 1.2 + L.ph) * 8;
      const y = L.y * H;
      g.globalAlpha = Math.max(0, 0.5 - (0.95 - L.y));
      g.fillText('✝', x, y);
    }
    g.globalAlpha = 1;
    g.textAlign = 'left';
  }
}
