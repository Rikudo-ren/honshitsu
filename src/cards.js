// ============================================================
// カードプール・出現・描画(DOM)・判定ヘルパー
// 種別: honshitsu / a_honshitsu / noise / fake_katsu / corn /
//       ring / gen(原) / schro(シュレディンガー) / english
// 正解: 刻む(kizamu) = honshitsu,corn,ring,gen,english(+schro観測)
//       は？(hah)   = a_honshitsu,noise,fake_katsu
// ============================================================
import { CONFIG, difficultyAt } from './config.js';

let layer = null;
let pool = [];
let playW = 400, playH = 700;
let rng = Math.random;

// 引っかけ用
let trickCount = 0;
let trickType = null;
let lastType = null;

export const KIZAMU_TYPES = new Set(['honshitsu', 'corn', 'ring', 'gen', 'english']);

export function setRng(fn) { rng = fn; }

export function initCards(layerEl, n) {
  layer = layerEl;
  pool = [];
  for (let i = 0; i < (n || 14); i++) {
    const el = document.createElement('div');
    el.className = 'card hidden';
    el.innerHTML = `
      <div class="card-paper">
        <div class="card-cross">✝</div>
        <div class="card-text"></div>
        <div class="card-badge"></div>
        <div class="card-hp"></div>
        <div class="carve"><i class="v"></i><i class="h"></i></div>
        <div class="hah-stamp">は？</div>
      </div>`;
    layer.appendChild(el);
    pool.push({
      el, active: false, type: null, quote: null,
      x: 0, y: 0, vy: 0, vx: 0, wob: Math.random() * 6.28,
      hp: 1, born: 0, revealed: false, judged: false, falling: false,
      schroTrue: null, schroFake: null, w: 0, h: 0,
    });
  }
  // 直接タップ/スワイプ用(委譲)
  layer.addEventListener('pointerdown', onPointDown, { passive: true });
  layer.addEventListener('pointerup', onPointUp, { passive: true });
}

let downInfo = null;
function onPointDown(e) {
  const cardEl = e.target.closest('.card');
  if (!cardEl) return;
  downInfo = { el: cardEl, x: e.clientX, y: e.clientY, t: performance.now() };
}
function onPointUp(e) {
  if (!downInfo) return;
  const cardEl = e.target.closest('.card');
  const info = downInfo;
  downInfo = null;
  if (!cardEl || cardEl !== info.el) return;
  const c = pool.find(p => p.el === cardEl);
  if (!c || !c.active || c.judged) return;
  const dy = e.clientY - info.y;
  const dt = performance.now() - info.t;
  if (dy > 42 && dt < 600) directHandler && directHandler(c, 'hah');      // 下スワイプ=は？
  else if (Math.abs(dy) < 30 && dt < 600) directHandler && directHandler(c, 'kizamu'); // タップ=刻む
}
let directHandler = null;
export function onDirect(fn) { directHandler = fn; }

export function resizeCards(w, h) { playW = w; playH = h; }

export function activeCards() { return pool.filter(p => p.active && !p.judged); }

// 最前面=最も画面下のカードを自動ターゲット
export function frontCard() {
  let best = null;
  for (const c of pool) {
    if (!c.active || c.judged || c.falling) continue;
    if (!best || c.y > best.y) best = c;
  }
  return best;
}

export function updateTargetRing() {
  const f = frontCard();
  for (const c of pool) c.el.classList.toggle('target', c === f);
  return f;
}

function pickQuote(quotes, type) {
  const arr = quotes.byType[type];
  if (!arr || !arr.length) return null;
  // weight考慮
  let total = 0;
  for (const q of arr) total += q.weight || 1;
  let r = rng() * total;
  for (const q of arr) {
    r -= q.weight || 1;
    if (r <= 0) return q;
  }
  return arr[arr.length - 1];
}

// 出現種別の決定(難易度カーブ+引っかけ)
export function decideType(elapsed, forceHonOnly) {
  if (forceHonOnly) return 'honshitsu';
  const d = difficultyAt(elapsed);
  // 引っかけ:3連続で同種→違う種
  if (trickCount >= 3 && trickType) {
    trickCount = 0;
    const other = trickType === 'honshitsu'
      ? (rng() < 0.5 ? 'a_honshitsu' : 'noise')
      : 'honshitsu';
    trickType = null;
    lastType = other;
    return other;
  }
  const r = rng();
  let t;
  const pFake = elapsed >= 30 ? d.fake : 0;
  if (r < pFake) t = 'fake_katsu';
  else if (r < pFake + d.noise) t = 'noise';
  else if (r < pFake + d.noise + d.aRate) t = 'a_honshitsu';
  else t = 'honshitsu';
  if (t === lastType && (t === 'honshitsu' || t === 'noise' || t === 'a_honshitsu')) {
    trickCount++;
    trickType = t;
  } else {
    trickCount = 1;
    trickType = t;
  }
  lastType = t;
  return t;
}

export function resetTrick() { trickCount = 0; trickType = null; lastType = null; }

export function spawnCard(type, quotes, elapsed, opts) {
  opts = opts || {};
  const c = pool.find(p => !p.active);
  if (!c) return null;
  const d = difficultyAt(elapsed);
  let quote = null;
  if (type === 'schro') {
    // 2枚重ね:真の種別は honshitsu or noise を隠す
    const truthHon = rng() < 0.5;
    c.schroTrue = truthHon ? 'honshitsu' : 'noise';
    c.schroFake = truthHon ? 'noise' : 'honshitsu';
    c.revealed = false;
    quote = pickQuote(quotes, c.schroTrue);
    c.quote2 = pickQuote(quotes, c.schroFake);
  } else if (type === 'corn') {
    quote = quotes.byId['R001'] || pickQuote(quotes, 'honshitsu');
  } else if (type === 'ring') {
    quote = quotes.byId['R002'] || pickQuote(quotes, 'honshitsu');
  } else if (type === 'gen') {
    quote = quotes.byId['R003'] || pickQuote(quotes, 'honshitsu');
  } else if (type === 'english') {
    const poolE = ['R004', 'R005', 'R006'].map(id => quotes.byId[id]).filter(Boolean);
    quote = poolE.length ? poolE[(rng() * poolE.length) | 0] : pickQuote(quotes, 'honshitsu');
  } else {
    quote = pickQuote(quotes, type);
  }
  c.active = true;
  c.judged = false;
  c.falling = false;
  c.type = type;
  c.quote = quote;
  c.hp = type === 'gen' ? 3 : 1;
  c.born = performance.now();
  c.vx = 0;
  const speedScale = playH / 700;
  c.vy = CONFIG.fallBase * d.speed * speedScale * (0.9 + rng() * 0.25);
  if (type === 'gen') c.vy *= 0.55;
  if (type === 'schro') c.vy *= 0.7; // 暴露(3.5秒)が漏れより先に来るよう減速
  if (type === 'corn' || type === 'ring' || type === 'english') c.vy *= 0.9;
  // x位置(実測幅で画面内に収める)
  c.x = playW / 2 + (rng() - 0.5) * Math.max(40, playW - 120);
  c.y = -70 - rng() * 40;
  c.wob = rng() * 6.28;
  c.el.classList.remove('hidden', 'judged-good', 'judged-bad', 'falling');
  renderCard(c);
  c.w = c.el.offsetWidth || 240;
  c.h = c.el.offsetHeight || 90;
  c.x = Math.max(c.w / 2 + 6, Math.min(playW - c.w / 2 - 6, c.x));
  c.el.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%,0)`;
  return c;
}

function renderCard(c) {
  const el = c.el;
  el.className = `card type-${c.type}` + (c.revealed ? ' revealed' : '');
  const textEl = el.querySelector('.card-text');
  const badge = el.querySelector('.card-badge');
  const hp = el.querySelector('.card-hp');
  el.querySelector('.carve').classList.remove('play');
  el.querySelector('.hah-stamp').classList.remove('play');
  badge.textContent = '';
  hp.textContent = '';
  if (c.type === 'honshitsu') {
    textEl.textContent = c.quote ? c.quote.text : '✝本質✝';
    badge.textContent = '';
  } else if (c.type === 'a_honshitsu') {
    textEl.textContent = c.quote ? c.quote.text : '……';
  } else if (c.type === 'noise') {
    textEl.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'noise-head';
    head.textContent = 'まとめ速報';
    const body = document.createElement('div');
    body.className = 'noise-body';
    body.textContent = c.quote ? c.quote.text : '???';
    textEl.appendChild(head);
    textEl.appendChild(body);
  } else if (c.type === 'fake_katsu') {
    textEl.textContent = c.quote ? c.quote.text : '✝';
  } else if (c.type === 'corn') {
    textEl.innerHTML = '<div class="rare-can">🥫</div><div class="rare-label">コーンスープ缶 +3.0秒</div>';
  } else if (c.type === 'ring') {
    textEl.innerHTML = '<div class="rare-ring">💍</div><div class="rare-label">封印の刻印 高得点</div>';
  } else if (c.type === 'gen') {
    textEl.innerHTML = `<div class="gen-title">原✝本質✝</div><div class="gen-sub">${c.quote ? c.quote.text : ''}</div>`;
    hp.textContent = '●'.repeat(c.hp) + '○'.repeat(3 - c.hp);
  } else if (c.type === 'schro') {
    textEl.innerHTML = `<div class="schro-a">${c.quote ? c.quote.text : ''}</div><div class="schro-b">${c.quote2 ? c.quote2.text : ''}</div>`;
    badge.textContent = '？';
  } else if (c.type === 'english') {
    textEl.innerHTML = `<div class="en-text">${c.quote ? c.quote.text : 'Hello'}</div><div class="rare-label">ENGLISH +5.0秒</div>`;
  }
  // サイズ計測用
  c.w = el.offsetWidth || 220;
  c.h = el.offsetHeight || 90;
}

export function refreshGenHp(c) {
  const hp = c.el.querySelector('.card-hp');
  if (hp) hp.textContent = '●'.repeat(Math.max(0, c.hp)) + '○'.repeat(3 - Math.max(0, c.hp));
}

// 位置更新。漏れた(画面下端通過)カードを返す
export function updateCards(dt, speedMul, contourMode, time) {
  const leaked = [];
  const killY = playH + 80;
  for (const c of pool) {
    if (!c.active || c.falling) continue;
    c.wob += dt * 2;
    let vx = Math.sin(c.wob) * 8;
    if (contourMode) {
      // 等高線カーブに沿って流れる
      vx = Math.sin(time * 2.2 + c.y * 0.012) * 120;
    }
    c.x += vx * dt * speedMul;
    c.y += c.vy * dt * speedMul;
    // 左右端で反射(カード幅を考慮)
    const hw = (c.w || 240) / 2 + 4;
    if (c.x < hw) c.x = hw;
    if (c.x > playW - hw) c.x = playW - hw;
    c.el.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%,0) rotate(${Math.sin(c.wob * 0.7) * 1.5}deg)`;
    if (c.y > killY) {
      c.active = false;
      c.el.classList.add('hidden');
      leaked.push(c);
    }
  }
  return leaked;
}

// 判定演出:✝を刻む(一筆書き0.12秒)
export function playCarve(c) {
  const carve = c.el.querySelector('.carve');
  carve.classList.remove('play');
  void carve.offsetWidth;
  carve.style.setProperty('--carve-t', CONFIG.carveTime + 's');
  carve.classList.add('play');
}

// 判定演出:は？スタンプ
export function playHah(c) {
  const st = c.el.querySelector('.hah-stamp');
  st.classList.remove('play');
  void st.offsetWidth;
  st.classList.add('play');
}

// カード退場(判定後)
export function dismiss(c, good, delay) {
  c.judged = true;
  c.el.classList.add(good ? 'judged-good' : 'judged-bad');
  setTimeout(() => {
    if (!c.active) return;
    c.active = false;
    c.el.classList.add('hidden');
    c.el.classList.remove('judged-good', 'judged-bad', 'target');
  }, delay !== undefined ? delay : 180);
}

// リザルト用:全カード静止→落下
export function freezeAll() {
  for (const c of pool) {
    if (c.active) c.el.classList.add('frozen');
  }
}
export function dropAll() {
  for (const c of pool) {
    if (!c.active) continue;
    c.falling = true;
    c.el.classList.remove('frozen');
    c.el.classList.add('falling');
    const dx = (Math.random() - 0.5) * 160;
    const rot = (Math.random() - 0.5) * 120;
    c.el.style.setProperty('--drop-dx', dx + 'px');
    c.el.style.setProperty('--drop-rot', rot + 'deg');
    setTimeout(() => {
      c.active = false;
      c.falling = false;
      c.el.classList.add('hidden');
      c.el.classList.remove('falling');
    }, 900);
  }
}

export function clearCards() {
  for (const c of pool) {
    c.active = false;
    c.judged = false;
    c.falling = false;
    c.el.classList.add('hidden');
    c.el.classList.remove('judged-good', 'judged-bad', 'frozen', 'falling', 'target');
  }
}

export function cardCenter(c) {
  const layerRect = layer.getBoundingClientRect();
  const r = c.el.getBoundingClientRect();
  return { x: r.left - layerRect.left + r.width / 2, y: r.top - layerRect.top + r.height / 2 };
}
