/* ============================================================
   ✝本質✝スコアアタック — ゲーム本体
   ============================================================ */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const SE = (n, a) => { try { Sound.sfx(n, a); } catch (e) {} };

  /* ---------------- モード定義 ---------------- */
  const MODES = {
    survival: {
      id: 'survival', emoji: '⏳', name: '本質サバイバル',
      time: 90, penalty: 3, perQ: 0, bonus: 0,
      desc: '90秒。誤答すると −3秒。セリフ当て・数字・本物／フェイカツ判定・大喜利まで、精読問題をフルミックス。',
      rules: '90秒 ／ 誤答 −3秒 ／ ラスト10秒は得点×1.5'
    },
    rush: {
      id: 'rush', emoji: '💬', name: '「は？」ラッシュ',
      time: 60, penalty: 3, perQ: 4, bonus: 0,
      desc: '60秒。1問4秒の即答戦。セリフ・判定・二択だけを高速で回す。考える前に反応しろ。',
      rules: '60秒 ／ 1問4秒 ／ 未回答も誤答扱い（−3秒）'
    },
    oogiri: {
      id: 'oogiri', emoji: '🎯', name: '大喜利「本質を一言で」',
      time: 45, penalty: 2, perQ: 0, bonus: 2,
      desc: '45秒。伊豆見主催の大喜利大会。ウケた回答を選ぶと +2秒。誤答は −2秒。笑いは時間を延ばす。',
      rules: '45秒 ／ 正解 +2秒 ／ 誤答 −2秒'
    }
  };
  const MODE_ORDER = ['survival', 'rush', 'oogiri'];

  /* ---------------- 保存領域 ---------------- */
  const LS_KEY = 'honshitsu_scoreattack_v1';
  const defaultStore = () => ({
    bests: { survival: 0, rush: 0, oogiri: 0 },
    plays: { survival: 0, rush: 0, oogiri: 0 },
    ranking: { survival: [], rush: [], oogiri: [] },
    name: ''
  });
  let store = load();
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return defaultStore();
      const s = JSON.parse(raw);
      const d = defaultStore();
      return { ...d, ...s, bests: { ...d.bests, ...(s.bests || {}) }, plays: { ...d.plays, ...(s.plays || {}) }, ranking: { ...d.ranking, ...(s.ranking || {}) } };
    } catch (e) { return defaultStore(); }
  }
  function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) {} }

  /* ---------------- ゲーム状態 ---------------- */
  const G = {
    mode: null, state: 'title',
    score: 0, combo: 0, maxCombo: 0, correct: 0, wrong: 0, qDone: 0,
    timeLeft: 0, perQLeft: 0, frozen: 0, answered: true,
    qStartAt: 0, tSum: 0, tCount: 0, fastest: null, best: 0,
    seq: [], seqIdx: 0, cur: null, lastTs: 0, loop: null,
    ticked: 99, clickPt: null, newRecord: false, lastRankIdx: -1, answeredAt: -1e9,
    holdNext: false, awaitNext: false, missed: [], norm: 0
  };

  /* ---------------- 画面 ---------------- */
  function show(id) {
    $$('.screen').forEach((s) => s.classList.remove('active'));
    const el = $('#screen-' + id);
    if (el) el.classList.add('active');
    document.body.dataset.screen = id;
    G.state = id;
    if (id === 'title') { Sound.startBGM(); renderTitle(); }
    else if (id === 'play') { /* keep bgm */ }
    else if (id !== 'count') { /* keep */ }
  }

  /* ---------------- タイトル ---------------- */
  function renderTitle() {
    const wrap = $('#modes'); wrap.innerHTML = '';
    MODE_ORDER.forEach((id) => {
      const m = MODES[id];
      const best = store.bests[id] || 0;
      const plays = store.plays[id] || 0;
      const rank = (store.ranking[id] || [])[0];
      const el = document.createElement('button');
      el.className = 'mode';
      el.type = 'button';
      el.innerHTML = `
        <div class="mode-emoji">${m.emoji}</div>
        <h3>${m.name}</h3>
        <p>${m.desc}</p>
        <div class="mode-rules">${m.rules}</div>
        <div class="mode-foot">
          <span class="mode-best">自己ベスト <b>${best.toLocaleString()}</b>${rank ? ` ／ 1位 ${escapeHtml(rank.name)}` : ''}${plays ? ` ／ ${plays}回` : ''}</span>
          <span class="mode-go">挑戦する ▸</span>
        </div>`;
      el.addEventListener('click', () => { SE('ui'); startMode(id); });
      wrap.appendChild(el);
    });
    const strip = $('#cast-strip');
    if (!strip.dataset.done) {
      strip.innerHTML = Object.values(CHARS).slice(0, 15)
        .map((c) => `<img src="${c.face}" alt="${escapeHtml(c.name)}" title="${escapeHtml(c.name)}／${escapeHtml(c.title)}">`).join('');
      strip.dataset.done = '1';
    }
    $('#btn-sound').textContent = Sound.on ? '🔊 音：ON' : '🔇 音：OFF';
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  /* ---------------- 出題プール ---------------- */
  function buildSeq(mode) {
    const cfg = MODES[mode];
    let pool = QUESTIONS.filter((q) => q && q.type);
    if (mode === 'rush') pool = pool.filter((q) => ['who', 'fake', 'choice', 'num'].includes(q.type));
    if (mode === 'oogiri') pool = pool.filter((q) => ['oogiri', 'choice', 'fake'].includes(q.type));
    // 重み付きランダム順（重複なし）
    const arr = pool.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    arr.sort((a, b) => Math.random() / (a.w || 1) - Math.random() / (b.w || 1));
    // 同じ type が3連続しないように軽く調整
    for (let i = 2; i < arr.length; i++) {
      if (arr[i].type === arr[i - 1].type && arr[i].type === arr[i - 2].type) {
        for (let k = i + 1; k < arr.length; k++) {
          if (arr[k].type !== arr[i].type) { [arr[i], arr[k]] = [arr[k], arr[i]]; break; }
        }
      }
    }
    return arr;
  }

  /* ---------------- モード開始 ---------------- */
  function startMode(id) {
    G.mode = id; G.score = 0; G.combo = 0; G.maxCombo = 0; G.correct = 0; G.wrong = 0; G.qDone = 0;
    G.seq = buildSeq(id); G.seqIdx = 0; G.tSum = 0; G.tCount = 0; G.fastest = null;
    G.ticked = 99; G.newRecord = false; G.lastRankIdx = -1; G.missed = [];
    const m = MODES[id];
    G.timeLeft = m.time; G.best = store.bests[id] || 0;
    $('#cd-mode').textContent = `${m.emoji} ${m.name}`;
    show('count');
    Sound.unlock();
    let n = 3;
    const num = $('#cd-num');
    const tick = () => {
      num.style.animation = 'none'; void num.offsetWidth; num.style.animation = '';
      if (n > 0) { num.textContent = String(n); SE('tap'); n--; setTimeout(tick, 700); }
      else { num.textContent = 'START'; SE('start'); setTimeout(startPlay, 480); }
    };
    tick();
  }

  function startPlay() {
    show('play');
    Sound.startBGM();
    G.answered = true; G.frozen = 0;
    updateHUD();
    clearTimeout(G._fbT);
    nextQuestion(true);
    cancelAnimationFrame(G.loop);
    G.lastTs = performance.now();
    G.loop = requestAnimationFrame(tick);
  }

  /* ---------------- タイムループ ---------------- */
  function tick(ts) {
    if (G.state !== 'play') return;
    const dt = Math.min(0.1, (ts - G.lastTs) / 1000);
    G.lastTs = ts;
    if (!G.frozen) {
      G.timeLeft -= dt;
      // 1問制限（ラッシュ）
      if (MODES[G.mode].perQ && !G.answered) {
        G.perQLeft -= dt;
        $('#perma-fill').style.width = clamp((G.perQLeft / MODES[G.mode].perQ) * 100, 0, 100) + '%';
        if (G.perQLeft <= 0) { judge(-1, true); }
      }
      // 秒読み
      const sec = Math.ceil(G.timeLeft);
      if (G.timeLeft <= 5.99 && sec !== G.ticked) { G.ticked = sec; if (sec > 0) SE('tick', sec <= 3); }
      if (G.timeLeft <= 0) { G.timeLeft = 0; updateHUD(); return endGame(); }
      updateHUD();
    }
    G.loop = requestAnimationFrame(tick);
  }

  function updateHUD() {
    const m = MODES[G.mode] || MODES.survival;
    $('#time-num').textContent = G.timeLeft.toFixed(1);
    $('#score-num').textContent = G.score.toLocaleString();
    $('#combo-num').textContent = G.combo;
    const mult = comboMult();
    $('#mult-num').textContent = '×' + mult.toFixed(1) + (G.timeLeft <= 10 ? ' ✕1.5' : '');
    $('#hud-combo').classList.toggle('hot', G.combo >= 5);
    const pct = clamp((G.timeLeft / m.time) * 100, 0, 100);
    $('#timebar').style.width = pct + '%';
    $('.timebar').classList.toggle('danger', G.timeLeft <= 10);
    $('#q-index').textContent = 'Q' + (G.qDone + (G.answered ? 0 : 1));
    const acc = G.correct + G.wrong ? Math.round((G.correct / (G.correct + G.wrong)) * 100) : 100;
    $('#q-src').textContent = `正解率 ${acc}%`;
  }

  function comboMult() { return clamp(1 + 0.15 * Math.max(0, G.combo - 1), 1, 3); }

  /* ---------------- 出題 ---------------- */
  function nextQuestion(first) {
    if (G.state !== 'play') return;
    if (G.seqIdx >= G.seq.length) { G.seq = buildSeq(G.mode); G.seqIdx = 0; }
    const q = G.seq[(G.seqIdx++) % G.seq.length];
    G.cur = q;
    G.answered = false;
    G.qStartAt = performance.now();
    G.qDone++;
    G.perQLeft = MODES[G.mode].perQ || 0;
    const perma = $('#perma-bar');
    perma.classList.toggle('show', !!MODES[G.mode].perQ);
    if (MODES[G.mode].perQ) $('#perma-fill').style.width = '100%';

    // カード
    const card = $('#qcard');
    card.classList.toggle('paper', q.type === 'fake');
    const tagMap = { book: '原作知識', num: '数字', who: 'セリフ当て', fake: '本物 or フェイカツ', choice: '✝本質✝判定', oogiri: '大喜利' };
    $('#qtag').textContent = tagMap[q.type] || '出題';
    const face = $('#qface'); face.innerHTML = '';
    let text = q.q || q.text || '';
    if (q.type === 'fake') text = text;
    $('#qtext').textContent = text;
    const meta = $('#qmeta'); meta.textContent = '';
    if (q.type === 'fake') meta.textContent = 'これは原作に実在する文章か？ それとも改変された偽物か？';
    if (q.type === 'oogiri') meta.textContent = '司会：伊豆見 ／ 一番ウケた回答を選べ';

    // 選択肢
    const box = $('#options'); box.innerHTML = ''; box.className = 'options';
    if (q.type === 'fake') {
      box.classList.add('binary');
      addOpt(box, 0, `<span class="txt">本物<span class="who">原作に実在する文章</span></span>`, 'genuine');
      addOpt(box, 1, `<span class="txt">フェイカツ<span class="who">改変された偽物</span></span>`, 'fake');
      const h = document.createElement('div'); h.className = 'swipe-hint'; h.textContent = '→ / 1キー：本物　　← / 2キー：フェイカツ（スワイプでも可）';
      box.appendChild(h);
      enableSwipe(box);
    } else if (q.type === 'who') {
      box.classList.add('grid2', 'faces');
      q.options.forEach((cid, i) => {
        const c = CHARS[cid];
        addOpt(box, i, `<img class="face" src="${c.face}" alt=""><span class="txt">${escapeHtml(c.short)}<span class="who">${escapeHtml(c.title)}</span></span>`);
      });
    } else {
      const two = q.options.length === 2;
      box.classList.add(two ? 'binary' : 'grid2');
      q.options.forEach((op, i) => {
        addOpt(box, i, `<span class="txt">${escapeHtml(op)}</span>`, q.type === 'oogiri' ? 'speech' : '', two ? 'big' : '');
      });
    }
    // フィードバックを隠す
    $('#feedback').className = 'feedback';
    $('#qcard').style.opacity = '1';
    updateHUD();
    if (first) { /* noop */ }
  }

  function addOpt(box, idx, html, extraClass, sizeClass) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt' + (extraClass ? ' ' + extraClass : '') + (sizeClass ? ' ' + sizeClass : '');
    b.dataset.idx = idx;
    b.innerHTML = `<span class="k">${idx + 1}</span>${html}`;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      G.clickPt = { x: ev.clientX || window.innerWidth / 2, y: ev.clientY || window.innerHeight / 2 };
      judge(idx, false);
    });
    box.appendChild(b);
    return b;
  }

  /* 本物/フェイカツのスワイプ */
  function enableSwipe(box) {
    let sx = null, sy = null;
    box.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
    box.addEventListener('pointerup', (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      sx = null;
      if (Math.abs(dx) < 42 || Math.abs(dy) > Math.abs(dx)) return;
      G.clickPt = { x: e.clientX, y: e.clientY };
      judge(dx > 0 ? 0 : 1, false);
    });
  }

  /* ---------------- 判定 ---------------- */
  function correctIndexOf(q) {
    if (q.type === 'fake') return q.answer === 'genuine' ? 0 : 1;
    return q.answer;
  }

  function judge(idx, timeout) {
    if (G.answered || G.state !== 'play') return;
    G.answered = true;
    G.answeredAt = performance.now();
    const q = G.cur;
    const ci = correctIndexOf(q);
    const ok = !timeout && idx === ci;
    const elapsed = (performance.now() - G.qStartAt) / 1000;

    // 選択肢の見た目
    $$('#options .opt').forEach((b) => {
      b.classList.add('locked');
      const bi = Number(b.dataset.idx);
      if (bi === ci) b.classList.add('correct');
      else if (bi === idx) b.classList.add('wrong');
    });

    const pt = G.clickPt || (() => { const r = $('#qcard').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })();

    if (ok) {
      G.correct++; G.combo++; G.maxCombo = Math.max(G.maxCombo, G.combo);
      G.tSum += elapsed; G.tCount++;
      if (G.fastest === null || elapsed < G.fastest) G.fastest = elapsed;
      const base = (q.w || 1) * 100;
      const limit = MODES[G.mode].perQ || 8;
      const speedBonus = Math.round(base * 0.5 * clamp(1 - elapsed / limit, 0, 1));
      const mult = comboMult();
      const spurt = G.timeLeft <= 10 ? 1.5 : 1;
      const gain = Math.round((base + speedBonus) * mult * spurt);
      G.score += gain;
      floatAt(pt, `+${gain.toLocaleString()}`, 'plus', -0.15);
      const timeBonus = MODES[G.mode].bonus || 0;
      if (timeBonus) {
        G.timeLeft = Math.min(MODES[G.mode].time, G.timeLeft + timeBonus);
        floatAt({ x: pt.x, y: pt.y + 58 }, `+${timeBonus}秒`, 'combo', 0.12);
      }
      if (speedBonus >= base * 0.35) floatAt({ x: pt.x, y: pt.y - 34 }, '速い', 'combo', -0.3);
      if (G.combo >= 2) floatAt({ x: pt.x, y: pt.y + 30 }, `${G.combo} COMBO ×${mult.toFixed(2)}`, 'combo', 0.05);
      fxAt(pt, true);
      bodyFlash('good');
      SE('correct', G.combo);
      if (G.combo >= 3 && G.combo % 2 === 1) SE('combo', G.combo);
      if (COMBO_SHOUTS[G.combo]) shout(COMBO_SHOUTS[G.combo]);
      else if (q.type !== 'who' && Math.random() < 0.45) shout(pick(CORRECT_SHOUTS));
      if (q.type === 'who') revealSpeaker(q);
      showFeedback(true, q, elapsed);
      // ✝本質✝配信イベント
      const every = 8;
      if (G.correct % every === 0) broadcast();
    } else {
      G.wrong++; G.combo = 0;
      G.missed.push({ text: (q.q || q.text || '').replace(/\n/g, ' ').slice(0, 46), src: q.src || '', ci, type: q.type });
      const pen = MODES[G.mode].penalty || 0;
      G.timeLeft = Math.max(0, G.timeLeft - pen);
      floatAt(pt, `−${pen.toFixed(1)}秒`, 'minus', -0.1);
      floatAt({ x: pt.x, y: pt.y + 30 }, timeout ? '時間切れ…' : '✝本質✝じゃない', 'minus', 0.1);
      fxAt(pt, false);
      bodyShake(); bodyFlash('bad');
      SE('wrong');
      shout(pick(WRONG_SHOUTS));
      showFeedback(false, q, elapsed, timeout);
      if (G.timeLeft <= 0) { setTimeout(() => endGame(), 500); return; }
    }
    updateHUD();

    // 次の問題へ（解説を読む時間ぶんだけ時間停止）
    const wait = ok ? 1150 : 1400;
    G.frozen++;
    clearTimeout(G._fbT);
    G._fbT = setTimeout(() => { G.frozen = Math.max(0, G.frozen - 1); advance(); }, wait);
    G.skipFB = () => { clearTimeout(G._fbT); G.frozen = Math.max(0, G.frozen - 1); advance(); };
  }

  function showFeedback(ok, q, elapsed, timeout) {
    const fb = $('#feedback');
    fb.className = 'feedback show ' + (ok ? 'good' : 'bad');
    const head = ok
      ? `✝ 正解 ／ +${elapsed.toFixed(1)}秒`
      : (timeout ? '✕ 時間切れ（−' + MODES[G.mode].penalty + '秒）' : '✕ 不正解（−' + MODES[G.mode].penalty + '秒）');
    $('#fb-head').textContent = head;
    let ex = q.ex || '';
    if (q.type === 'who') {
      const c = CHARS[q.options[correctIndexOf(q)]];
      ex = `正解：${c.name}（${c.title}）\n` + ex;
    }
    $('#fb-ex').textContent = ex;
    $('#fb-src').textContent = '出典：' + (q.src || '原作');
  }

  /* 次の問題へ進む（配信演出中は待機） */
  function advance() {
    if (G.state !== 'play') return;
    if (G.holdNext) { G.awaitNext = true; return; }
    nextQuestion();
  }

  /* ---------------- 演出 ---------------- */
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function Q_OF(q) { return CHARS[q.options[correctIndexOf(q)]]; }

  function floatAt(p, text, cls, delay = 0) {
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    el.textContent = text;
    el.style.left = clamp(p.x, 40, window.innerWidth - 40) + 'px';
    el.style.top = clamp(p.y, 60, window.innerHeight - 60) + 'px';
    el.style.animationDelay = delay + 's';
    $('#float-layer').appendChild(el);
    setTimeout(() => el.remove(), 1300 + delay * 1000);
  }
  function fxAt(p, good) {
    const wave = document.createElement('div');
    wave.className = 'fx-wave' + (good ? '' : ' bad');
    wave.style.left = (p.x - 60) + 'px'; wave.style.top = (p.y - 60) + 'px';
    wave.style.width = wave.style.height = '120px';
    $('#fx-layer').appendChild(wave);
    setTimeout(() => wave.remove(), 700);
    const n = good ? 7 : 4;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'fx-star';
      s.textContent = '✝';
      s.style.left = (p.x + rand(-70, 70)) + 'px';
      s.style.top = (p.y + rand(-40, 40)) + 'px';
      s.style.animationDelay = (i * 0.03) + 's';
      s.style.color = good ? pick(['#ff5533', '#ffd166', '#7ee0c0']) : '#ff5f6d';
      $('#fx-layer').appendChild(s);
      setTimeout(() => s.remove(), 1100);
    }
  }
  function bodyShake() {
    document.body.classList.remove('shake'); void document.body.offsetWidth;
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 400);
  }
  function bodyFlash(kind) {
    document.body.classList.remove('hitflash', 'good', 'bad'); void document.body.offsetWidth;
    document.body.classList.add('hitflash');
    if (kind === 'good') document.body.classList.add('good');
    setTimeout(() => document.body.classList.remove('hitflash', 'good', 'bad'), 320);
  }

  /* キャラのつぶやき */
  let castTimer = null;
  function shout(s) {
    if (!s) return;
    showCast(s.who, s.line, Math.random() < 0.35);
  }
  function showCast(cid, line, right, dur) {
    const c = CHARS[cid]; if (!c) return;
    const layer = $('#cast-layer');
    layer.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'cast-pop' + (right ? ' right' : '');
    el.innerHTML = `
      <span class="who-tag">${escapeHtml(c.short)}</span>
      <img src="${c.chara}" alt="">
      <div class="say">${escapeHtml(line)}</div>`;
    layer.appendChild(el);
    clearTimeout(castTimer);
    castTimer = setTimeout(() => { layer.innerHTML = ''; }, dur || 1500);
  }
  /* セリフ当ての答え合わせ：話者を立ち絵で出す */
  function revealSpeaker(q) {
    const cid = q.options[correctIndexOf(q)];
    if (!CHARS[cid]) return;
    const lines = String(q.q || '').split('\n');
    const quote = lines.length > 1 ? lines.slice(1).join(' ') : CHARS[cid].name;
    showCast(cid, quote.replace(/^「|」$/g, ''), false, 2000);
  }

  /* ✝本質✝募集所イベント */
  function broadcast() {
    const b = pick(BROADCASTS);
    const el = $('#broadcast');
    el.querySelector('.bc-face').src = CHARS.terachi.face;
    el.querySelector('.bc-text').textContent = b.text;
    el.querySelector('.bc-read').textContent = '寺地「' + b.read + '」';
    el.classList.add('show');
    SE('broadcast');
    G.frozen++;
    G.holdNext = true;
    setTimeout(() => {
      el.classList.remove('show');
      G.frozen = Math.max(0, G.frozen - 1);
      G.holdNext = false;
      if (G.awaitNext) { G.awaitNext = false; nextQuestion(); }
      G.score += 250;
      const r = $('#qcard').getBoundingClientRect();
      floatAt({ x: r.left + r.width / 2, y: r.top + 40 }, '+250 配信ボーナス', 'plus', 0);
      updateHUD();
    }, 2100);
  }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1600);
  }

  /* ---------------- 終了 ---------------- */
  function endGame() {
    if (G.state !== 'play') return;
    cancelAnimationFrame(G.loop);
    G.frozen = 0;
    SE('end');
    const id = G.mode;
    store.plays[id] = (store.plays[id] || 0) + 1;
    G.newRecord = G.score > (store.bests[id] || 0);
    if (G.newRecord) store.bests[id] = G.score;
    save();
    const norm = Math.round(G.score * (90 / (MODES[id].time || 90)));
    const rankIdx = RANKS.findIndex((r) => norm >= r.min);
    G.lastRankIdx = rankIdx;
    const rank = RANKS[rankIdx] || RANKS[RANKS.length - 1];
    const ch = CHARS[rank.who];
    $('#res-title').textContent = rank.title;
    $('#res-score').innerHTML = `${G.score.toLocaleString()}<small>点</small>`;
    $('#res-best').textContent = G.newRecord ? '🎉 自己ベスト更新！' : `自己ベスト ${(store.bests[id] || 0).toLocaleString()} 点`;
    $('#res-face').src = ch.face;
    $('#res-line').textContent = rank.line;
    const total = G.correct + G.wrong;
    const acc = total ? Math.round((G.correct / total) * 100) : 0;
    const avg = G.tCount ? (G.tSum / G.tCount) : 0;
    $('#res-stats').innerHTML = `
      <div class="stat"><div class="v">${G.correct}</div><div class="l">正解</div></div>
      <div class="stat"><div class="v">${G.wrong}</div><div class="l">誤答</div></div>
      <div class="stat"><div class="v">${acc}%</div><div class="l">正解率</div></div>
      <div class="stat hl"><div class="v">${G.maxCombo}</div><div class="l">最大コンボ</div></div>
      <div class="stat"><div class="v">${avg ? avg.toFixed(2) : '—'}<small>秒</small></div><div class="l">平均解答</div></div>
      <div class="stat"><div class="v">${G.fastest !== null ? G.fastest.toFixed(2) : '—'}<small>秒</small></div><div class="l">最速解答</div></div>`;
    const rev = $('#res-review');
    if (rev) {
      if (G.missed.length) {
        const shown = G.missed.slice(0, 4);
        rev.innerHTML = `<div class="rev-title">📌 落とした問題（次は原作で確認）</div>` +
          shown.map((m) => `<div class="rev-row"><span class="rev-t">${escapeHtml(m.text)}…</span><span class="rev-s">${escapeHtml(m.src)}</span></div>`).join('') +
          (G.missed.length > shown.length ? `<div class="rev-more">ほか ${G.missed.length - shown.length} 問</div>` : '');
      } else {
        rev.innerHTML = `<div class="rev-title">📌 落とした問題なし — ✝本質✝は平等だが、お前は強い</div>`;
      }
    }
    $('#res-register').style.display = '';
    $('#reg-name').value = store.name || '';
    if (G.newRecord) setTimeout(() => SE('record'), 260);
    show('result');
  }

  function saveScore() {
    const name = ($('#reg-name').value || '').trim().slice(0, 12) || '名無しの地形図好き';
    store.name = name;
    const id = G.mode;
    const entry = {
      name, score: G.score, acc: G.correct + G.wrong ? Math.round((G.correct / (G.correct + G.wrong)) * 100) : 0,
      combo: G.maxCombo, date: new Date().toISOString().slice(0, 10), ts: Date.now()
    };
    const arr = store.ranking[id] || (store.ranking[id] = []);
    arr.push(entry);
    arr.sort((a, b) => b.score - a.score || a.ts - b.ts);
    store.ranking[id] = arr.slice(0, 30);
    save();
    toast('ランキングに登録しました ✝');
    SE('ui');
    $('#res-register').style.display = 'none';
  }

  /* ---------------- ランキング画面 ---------------- */
  let rankTab = 'survival';
  function renderRanking() {
    const tabs = $('#rank-tabs'); tabs.innerHTML = '';
    MODE_ORDER.forEach((id) => {
      const b = document.createElement('button');
      b.className = 'tab' + (id === rankTab ? ' on' : '');
      b.textContent = MODES[id].name;
      b.addEventListener('click', () => { rankTab = id; SE('ui'); renderRanking(); });
      tabs.appendChild(b);
    });
    const body = $('#rank-body');
    const arr = store.ranking[rankTab] || [];
    if (!arr.length) {
      body.innerHTML = `<div class="empty">まだ記録がありません。<br>「${MODES[rankTab].name}」に挑戦してスコアを残してください。<br><span class="dim">— 記録は端末内に保存されます —</span></div>`;
      return;
    }
    body.innerHTML = arr.slice(0, 10).map((e, i) => `
      <div class="rank-row ${i < 3 ? 'top' + (i + 1) : ''} ${e.ts && Date.now() - e.ts < 8000 ? 'me' : ''}">
        <div class="rank-no">${i === 0 ? '✝' : i + 1}</div>
        <div class="rank-name">${escapeHtml(e.name)}</div>
        <div class="rank-meta">正解率 ${e.acc}% ／ 最大コンボ ${e.combo}<br>${e.date}</div>
        <div class="rank-score">${e.score.toLocaleString()}</div>
      </div>`).join('');
  }

  /* ---------------- 登場人物画面 ---------------- */
  function renderCast() {
    $('#cast-grid').innerHTML = Object.values(CHARS).map((c) => `
      <div class="cast-card">
        <img src="${c.face}" alt="${escapeHtml(c.name)}">
        <div>
          <span class="t">${escapeHtml(c.title)}</span>
          <h4>${escapeHtml(c.name)}</h4>
          <p>${escapeHtml(c.note)}</p>
        </div>
      </div>`).join('');
  }

  /* ---------------- 入力 ---------------- */
  document.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'Escape') { if (G.state !== 'title') { Sound.sfx('ui'); toTitle(); } return; }
    if (G.state === 'title' && (k === 'Enter' || k === ' ')) { e.preventDefault(); SE('ui'); startMode('survival'); return; }
    if (G.state === 'result' && (k === 'r' || k === 'R')) { SE('ui'); startMode(G.mode); return; }
    if (G.state !== 'play') return;
    if (G.answered) {
      if (performance.now() - G.answeredAt > 260 && G.skipFB && (k === 'Enter' || k === ' ')) { const s = G.skipFB; G.skipFB = null; s(); }
      return;
    }
    const q = G.cur;
    if (!q) return;
    if (/^[1-4]$/.test(k)) {
      const idx = Number(k) - 1;
      const btns = $$('#options .opt');
      if (btns[idx]) { G.clickPt = null; judge(idx, false); }
    }
    if (q.type === 'fake') {
      if (k === 'ArrowRight') { G.clickPt = null; judge(0, false); }
      if (k === 'ArrowLeft') { G.clickPt = null; judge(1, false); }
    } else if (q.options && q.options.length === 2) {
      if (k === 'ArrowLeft') { G.clickPt = null; judge(0, false); }
      if (k === 'ArrowRight') { G.clickPt = null; judge(1, false); }
    }
  });

  document.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) {
      // 解説中のクリックで次へ
      if (G.state === 'play' && G.answered && G.skipFB && performance.now() - G.answeredAt > 260) { const s = G.skipFB; G.skipFB = null; s(); }
      return;
    }
    const a = act.dataset.act;
    SE('ui');
    if (a === 'ranking') { rankTab = G.mode || rankTab; renderRanking(); show('ranking'); }
    else if (a === 'help') show('help');
    else if (a === 'cast') { renderCast(); show('cast'); }
    else if (a === 'title') toTitle();
    else if (a === 'retry') startMode(G.mode);
    else if (a === 'save') saveScore();
    else if (a === 'sound') { Sound.toggle(); $('#btn-sound').textContent = Sound.on ? '🔊 音：ON' : '🔇 音：OFF'; SE('ui'); }
    else if (a === 'clear') {
      if (window.confirm('この端末の記録（ベスト・ランキング）をすべて消します。よろしいですか？')) {
        const n = store.name; store = defaultStore(); store.name = n; save(); renderRanking(); renderTitle();
      }
    }
  });

  function toTitle() { cancelAnimationFrame(G.loop); $('#cast-layer').innerHTML = ''; show('title'); }

  // 最初の操作でオーディオを解放
  const unlock = () => { try { Sound.unlock(); Sound.startBGM(); } catch (e) {} window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // 画面の初期化
  show('title');
  renderRanking();
  window.addEventListener('resize', updateHUD);
})();
