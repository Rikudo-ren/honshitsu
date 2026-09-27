// ============================================================
// キャラ乱入スキル演出(立ち絵の出し入れ・セリフバブル)
// ★両馬/三重/零/勝也/砂糖 ☆倉石/櫻+三峰/召野+二見/寺地
// ============================================================

let stageEl = null;   // 立ち絵ステージ
let bubbleEl = null;
let charData = {};
let missingAssets = [];
let activeTachie = null;
let tachieTimer = 0;

export function initSkills(stage, bubble, characters) {
  stageEl = stage;
  bubbleEl = bubble;
  charData = {};
  for (const c of characters) charData[c.id] = c;
}

// 立ち絵表示(id, 滞在秒, セリフ)。退場は自動
export function showTachie(id, stay, line, opts) {
  opts = opts || {};
  if (!opts.keep) clearTachie();
  const ch = charData[id];
  const wrap = document.createElement('div');
  wrap.className = 'tachie enter' + (opts.side ? ' side-' + opts.side : '') + (opts.mini ? ' mini' : '');
  wrap.style.setProperty('--rim', ch ? ch.color : '#F2C14E');
  if (ch && ch.portrait) {
    const img = document.createElement('img');
    img.src = ch.portrait;
    img.alt = ch.name;
    img.draggable = false;
    img.onerror = () => {
      // フォールバック:手続き的シルエット+名前プレート
      if (!missingAssets.includes(ch.portrait)) {
        missingAssets.push(ch.portrait);
        console.warn('[honshitsu] missing asset:', missingAssets);
      }
      img.remove();
      wrap.appendChild(makeSilhouette(ch));
    };
    wrap.appendChild(img);
  } else {
    wrap.appendChild(makeSilhouette(ch || { name: id, color: '#888' }));
  }
  // 接地影
  const sh = document.createElement('div');
  sh.className = 'tachie-shadow';
  wrap.appendChild(sh);
  stageEl.appendChild(wrap);
  activeTachie = wrap;
  // セリフ
  if (line) showLine(line, ch ? ch.name : '', ch ? ch.color : '#F2C14E');
  // 退場タイマ(persist時は常駐)
  if (opts.persist) return wrap;
  const stayMs = (stay || 1.2) * 1000;
  tachieTimer = setTimeout(() => {
    if (activeTachie === wrap) {
      wrap.classList.remove('enter');
      wrap.classList.add('leave');
      setTimeout(() => { wrap.remove(); if (activeTachie === wrap) activeTachie = null; }, 350);
    }
  }, stayMs);
}

function makeSilhouette(ch) {
  const d = document.createElement('div');
  d.className = 'silhouette';
  d.style.setProperty('--c', ch.color || '#888');
  d.innerHTML = `<div class="sil-body">✝</div><div class="sil-name">${escapeHtml(ch.name || '')}</div>`;
  return d;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

export function clearTachie() {
  if (tachieTimer) { clearTimeout(tachieTimer); tachieTimer = 0; }
  if (activeTachie) { activeTachie.remove(); activeTachie = null; }
  stageEl.querySelectorAll('.tachie').forEach(el => el.remove());
}

export function showLine(text, name, color) {
  bubbleEl.innerHTML = '';
  const b = document.createElement('div');
  b.className = 'skill-bubble pop';
  b.style.setProperty('--c', color || '#F2C14E');
  b.innerHTML = `<span class="skill-name">${escapeHtml(name || '')}</span><span class="skill-text">${escapeHtml(text)}</span>`;
  bubbleEl.appendChild(b);
  setTimeout(() => b.classList.add('fade'), 1400);
  setTimeout(() => b.remove(), 1900);
}

// 小さな「は？」(リザルトのオチ等)
export function miniHah(parent) {
  const d = document.createElement('div');
  d.className = 'mini-hah';
  d.textContent = 'は？';
  (parent || document.body).appendChild(d);
  setTimeout(() => d.remove(), 2200);
  return d;
}

export function getMissingAssets() { return missingAssets; }
