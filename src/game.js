// ============================================================
// ゲーム本体:状態遷移・ループ・スコア・OVERFLOW・スキル・リザルト
// BOOT → TITLE → TUTORIAL → COUNTDOWN → PLAY ⇄ OVERFLOW → TIMEUP → RESULT → TITLE
// ============================================================
import { CONFIG, difficultyAt, scoreToHensachi, hensachiRank } from './config.js';
import * as Audio from './audio.js';
import * as Particles from './particles.js';
import * as BG from './bg.js';
import * as Cards from './cards.js';
import * as Skills from './skills.js';

const $ = (id) => document.getElementById(id);

// ---------- 状態 ----------
const S = {
  state: 'BOOT',
  quotes: null,        // {byType, byId, all}
  characters: [],
  timeLeft: CONFIG.timeLimit,
  elapsed: 0,
  score: 0,
  combo: 0,
  maxCombo: 0,
  miss: 0,
  leaks: 0,
  hahChain: 0,
  hahTotal: 0,
  kizamuTotal: 0,
  overflow: 0,
  overflowActive: false,
  overflowT: 0,
  overflowStage: 0,
  multCap: CONFIG.multMax,
  reiBuffT: 0,
  guardT: 0,
  guardUsed: false,
  contourT: 0,
  satoT: 0,
  slowMul: 1,
  satoMul: 1,
  spawnT: 0,
  heartbeatT: 0,
  lastTickSecond: -1,
  timeSinceMiss: 0,
  // スキル発火済み
  fired: {},
  // 乱数
  rng: Math.random,
  seedMode: 'normal',
  seed: 0,
  // アンロック・記録
  seenQuotes: new Set(),
  unlockedExtra: [],
  // リザルト
  hensachi: 60,
  rank: null,
  newBest: false,
  resNo: 523,
  // デバッグ
  debug: false,
  showHitbox: false,
  fps: 60,
  // ミッション
  missions: [],
  // 演出
  shake: 0,
  slashTrail: [],
  slashing: false,
  reducedMotion: false,
  terachiFx: null,
  sakuraCard: null,
  sakuraT: 0,
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- localStorage ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem('honshitsu_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('honshitsu_' + k, JSON.stringify(v)); } catch {} },
};

// ---------- 初期化 ----------
export async function boot() {
  S.reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  S.debug = new URLSearchParams(location.search).get('debug') === '1';

  // データ読み込み
  const [qRes, cRes] = await Promise.all([
    fetch('data/quotes.json').then(r => r.json()),
    fetch('data/characters.json').then(r => r.json()),
  ]);
  const byType = {};
  const byId = {};
  for (const q of qRes.quotes) {
    (byType[q.type] = byType[q.type] || []).push(q);
    byId[q.id] = q;
  }
  S.quotes = { byType, byId, all: qRes.quotes };
  S.characters = cRes.characters;

  // 記録復元
  S.resNo = LS.get('res_no', 523);
  S.unlockedExtra = LS.get('unlocked', []);
  S.best = LS.get('best', { score: 0, hensachi: 60 });
  S.missions = LS.get('missions', null) || [
    { id: 'hah20', name: 'は？を20回', desc: '累計は？成功20回', prog: 0, goal: 20, done: false },
    { id: 'nomiss', name: '誤爆0でクリア', desc: '1プレイ誤爆0回', prog: 0, goal: 1, done: false },
    { id: 'h85', name: '偏差値85到達', desc: '数理零ラインに届く', prog: 0, goal: 1, done: false },
  ];

  setupDom();
  setupCanvas();
  Cards.initCards($('card-layer'), 16);
  Cards.onDirect(onDirectCard);
  Skills.initSkills($('tachie-stage'), $('skill-bubble'), S.characters);
  Particles.setReducedMotion(S.reducedMotion);

  // タイトル表示
  setState('TITLE');
  requestAnimationFrame(loop);

  if (S.debug) setupDebug();
  console.log('[honshitsu] boot ok. quotes=%d chars=%d', qRes.quotes.length, cRes.characters.length);
}

// ---------- DOM構築 ----------
function setupDom() {
  // ベスト表示
  renderBest();
  renderMissions();
  // ボタン
  $('btn-start').addEventListener('click', () => startPlay('normal'));
  $('btn-daily').addEventListener('click', () => startPlay('daily'));
  $('btn-collection').addEventListener('click', () => { Audio.initAudio(); Audio.seUi(); openCollection(); });
  $('btn-collection-title').addEventListener('click', () => { Audio.initAudio(); Audio.seUi(); openCollection(); });
  $('btn-close-collection').addEventListener('click', () => { Audio.seUi(); closeCollection(); });
  $('btn-kizamu').addEventListener('click', () => judgeFront('kizamu'));
  $('btn-hah').addEventListener('click', () => judgeFront('hah'));
  $('btn-overflow').addEventListener('click', () => tryOverflow());
  $('btn-retry').addEventListener('click', () => { Audio.seUi(); hideResult(); startPlay(S.seedMode); });
  $('btn-copy').addEventListener('click', () => copyResult());
  $('btn-totitle').addEventListener('click', () => { Audio.seUi(); hideResult(); setState('TITLE'); });
  $('btn-mute').addEventListener('click', () => {
    Audio.initAudio();
    Audio.setMuted(!Audio.isMuted());
    $('btn-mute').textContent = Audio.isMuted() ? '🔇' : '🔊';
  });
  // キー
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    Audio.initAudio();
    const k = e.key;
    if (S.state === 'TITLE' && (k === 'z' || k === 'Z' || k === 'Enter' || k === ' ')) { startPlay('normal'); return; }
    if (S.state === 'RESULT' && k === 'Enter') { hideResult(); startPlay(S.seedMode); return; }
    if (S.state !== 'PLAY' && S.state !== 'OVERFLOW') return;
    if (k === 'z' || k === 'Z' || k === 'ArrowLeft') judgeFront('kizamu');
    else if (k === 'x' || k === 'X' || k === 'ArrowRight') judgeFront('hah');
    else if (k === ' ') { e.preventDefault(); tryOverflow(); }
  });
  // 初回タップでAudio初期化
  window.addEventListener('pointerdown', () => Audio.initAudio(), { once: false, passive: true });
  // スラッシュ(等高線モード)
  const playArea = $('play-area');
  playArea.addEventListener('pointerdown', (e) => {
    if (S.contourT > 0 && (S.state === 'PLAY' || S.state === 'OVERFLOW')) {
      S.slashing = true;
      S.slashTrail = [{ x: e.clientX, y: e.clientY }];
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (!S.slashing) return;
    S.slashTrail.push({ x: e.clientX, y: e.clientY });
    if (S.slashTrail.length > 24) S.slashTrail.shift();
    slashHit(e.clientX, e.clientY);
  });
  window.addEventListener('pointerup', () => { S.slashing = false; S.slashTrail = []; });
  // リサイズ
  window.addEventListener('resize', layout);
  // タップでスキップ(チュートリアル/カウントダウン/リザルト演出)
  $('tutorial').addEventListener('pointerdown', () => skipTutorial());
  $('countdown').addEventListener('pointerdown', () => skipCountdown());
  $('result').addEventListener('pointerdown', () => skipResultCine());
}

function setupCanvas() {
  BG.initBg($('bg-canvas'));
  Particles.initParticles($('fx-canvas'));
  layout();
}

function layout() {
  const area = $('play-area');
  const rect = area.getBoundingClientRect();
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  BG.resizeBg(rect.width, rect.height, dpr);
  Particles.resizeParticles(rect.width, rect.height, dpr);
  Cards.resizeCards(rect.width, rect.height);
}

// ---------- 状態遷移 ----------
function setState(ns) {
  // ループ揺れの停止・値リセット(状態遷移時)
  document.body.classList.remove('shake');
  S.shake = 0;
  S.state = ns;
  document.body.dataset.state = ns;
  $('hud').classList.toggle('hidden', !(ns === 'PLAY' || ns === 'OVERFLOW' || ns === 'COUNTDOWN'));
  $('controls').classList.toggle('hidden', !(ns === 'PLAY' || ns === 'OVERFLOW'));
  $('title').classList.toggle('hidden', ns !== 'TITLE');
  $('tutorial').classList.toggle('hidden', ns !== 'TUTORIAL');
  $('countdown').classList.toggle('hidden', ns !== 'COUNTDOWN');
  $('result').classList.toggle('hidden', ns !== 'RESULT');
  if (ns === 'TITLE') {
    BG.setStage(0, false);
    Cards.clearCards();
    Particles.clearAll();
    renderBest();
    renderMissions();
    Audio.setBgmMode(false, false);
    // タイトル常駐立ち絵(呼吸アニメ付き)
    Skills.clearTachie();
    Skills.showTachie('ryoma', 0, null, { side: 'left', mini: true, persist: true });
    Skills.showTachie('terachi', 0, null, { side: 'right', mini: true, keep: true, persist: true });
  }
}

// ---------- プレイ開始 ----------
function startPlay(mode) {
  Audio.initAudio();
  Audio.seUi();
  S.seedMode = mode;
  if (mode === 'daily') {
    const d = new Date();
    S.seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    S.rng = mulberry32(S.seed);
  } else {
    S.rng = Math.random;
  }
  Cards.setRng(S.rng);
  // リセット
  S.timeLeft = CONFIG.timeLimit;
  S.elapsed = 0;
  S.score = 0; S.combo = 0; S.maxCombo = 0; S.miss = 0; S.leaks = 0;
  S.hahChain = 0; S.hahTotal = 0; S.kizamuTotal = 0;
  S.overflow = 0; S.overflowActive = false; S.overflowT = 0; S.overflowStage = 0;
  S.multCap = CONFIG.multMax; S.reiBuffT = 0;
  S.guardT = 0; S.guardUsed = false;
  S.contourT = 0; S.satoT = 0; S.slowMul = 1; S.satoMul = 1;
  S.spawnT = 0.4; S.timeSinceMiss = 0;
  S.fired = {};
  S.seenQuotes = new Set();
  S.sakuraCard = null;
  S.newBest = false;
  Cards.clearCards();
  Cards.resetTrick();
  Particles.clearAll();
  Skills.clearTachie();
  BG.setStage(0, true);
  updateHud(true);
  // チュートリアル(4秒アニメ)へ
  setState('TUTORIAL');
  playTutorial();
}

// ---------- チュートリアル(4秒・アニメのみ) ----------
let tutTimers = [];
function playTutorial() {
  tutTimers.forEach(clearTimeout);
  tutTimers = [];
  const t = $('tutorial');
  t.innerHTML = `
    <div class="tut-card tut-hon">これまじ✝本質✝<div class="carve demo"><i class="v"></i><i class="h"></i></div></div>
    <div class="tut-finger">👆</div>
    <div class="tut-card tut-noise"><div class="noise-head">まとめ速報</div>これ何が面白いの？<div class="hah-stamp demo">は？</div></div>
    <div class="tut-btns"><div class="tut-btn tut-k">✝ 刻む</div><div class="tut-btn tut-h">は？ 弾く</div></div>`;
  // アニメ進行(タップでスキップ可)
  tutTimers.push(setTimeout(() => t.querySelector('.carve.demo').classList.add('play'), 500));
  tutTimers.push(setTimeout(() => t.querySelector('.tut-finger').classList.add('to-noise'), 1400));
  tutTimers.push(setTimeout(() => t.querySelector('.hah-stamp.demo').classList.add('play'), 2200));
  tutTimers.push(setTimeout(() => { if (S.state === 'TUTORIAL') startCountdown(); }, CONFIG.tutorialTime * 1000));
}
function skipTutorial() {
  if (S.state !== 'TUTORIAL') return;
  tutTimers.forEach(clearTimeout);
  startCountdown();
}

// ---------- カウントダウン(1.6秒・紙の数字) ----------
let cdTimers = [];
function startCountdown() {
  setState('COUNTDOWN');
  cdTimers.forEach(clearTimeout);
  cdTimers = [];
  const c = $('countdown');
  // 照明を落とす
  $('play-area').classList.add('lights-out');
  const nums = ['3', '2', '1'];
  const per = CONFIG.countdownTime / 3;
  nums.forEach((n, i) => {
    cdTimers.push(setTimeout(() => {
      c.innerHTML = `<div class="cd-paper"><span class="cd-num write">${n}</span></div>`;
      Audio.sePen();
      if (n === '1') {
        // 床の目地が割れて光が噴き出す
        const r = $('play-area').getBoundingClientRect();
        Particles.suckBurst(r.width / 2, r.height * 0.8, 40, r.width / 2, r.height * 0.4, '#F2C14E');
        Particles.burst(r.width / 2, r.height * 0.85, 30, { speed: 380, vy: -260, colors: ['#F2C14E', '#FFF6D8'] });
      }
    }, i * per * 1000));
  });
  cdTimers.push(setTimeout(() => {
    if (S.state === 'COUNTDOWN') beginPlay();
  }, CONFIG.countdownTime * 1000 + 120));
}
function skipCountdown() {
  if (S.state !== 'COUNTDOWN') return;
  cdTimers.forEach(clearTimeout);
  beginPlay();
}

function beginPlay() {
  $('play-area').classList.remove('lights-out');
  $('countdown').innerHTML = '';
  setState('PLAY');
}

// ---------- 判定 ----------
function mult() {
  const m = 1.0 + Math.floor(S.combo / 10) * CONFIG.multStep + (S.overflowActive ? CONFIG.multOverflowBonus : 0);
  return Math.min(m, S.reiBuffT > 0 ? CONFIG.multReiMax : S.multCap);
}

function onDirectCard(card, action) {
  if (S.state !== 'PLAY' && S.state !== 'OVERFLOW') return;
  judgeCard(card, action);
}

function judgeFront(action) {
  if (S.state !== 'PLAY' && S.state !== 'OVERFLOW') return;
  Audio.initAudio();
  const f = Cards.frontCard();
  if (!f) {
    // 空振り:小さなペン音のみ(ペナルティなし)
    if (action === 'kizamu') Audio.sePen();
    return;
  }
  judgeCard(f, action);
}

function judgeCard(c, action) {
  // OVERFLOW中は全部✝化(判定不要・連打で得点)
  if (S.overflowActive) action = 'kizamu';
  // シュレディンガー:刻む=観測
  if (c.type === 'schro' && !c.revealed) {
    if (action === 'kizamu') observeSchro(c);
    else dismissBad(c, true); // は？で捨てるのは安全(小得点)
    return;
  }
  const truth = c.type === 'schro' ? c.schroTrue : c.type;
  const needKizamu = Cards.KIZAMU_TYPES.has(truth) || (c.type === 'schro' && c.schroTrue === 'honshitsu');
  const wantKizamu = action === 'kizamu';
  if (wantKizamu === needKizamu) {
    if (wantKizamu) successKizamu(c);
    else successHah(c);
  } else {
    errorMiss(c, wantKizamu ? 'kizamu' : 'hah');
  }
}

function observeSchro(c) {
  // 観測:真が本質なら2倍、ノイズなら大ダメージ
  Cards.playCarve(c);
  Audio.sePen();
  c.revealed = true;
  if (c.schroTrue === 'honshitsu') {
    const gain = Math.round(CONFIG.scoreKizamu * mult() * CONFIG.schroWinMult * S.satoMul);
    addScore(gain, c, '観測成功×2');
    S.combo++;
    S.kizamuTotal++;
    S.timeLeft += CONFIG.timeKizamu;
    S.overflow = Math.min(CONFIG.overflowMax, S.overflow + CONFIG.overflowKizamu);
    Audio.seKizamu(S.combo);
    const p = Cards.cardCenter(c);
    Particles.crossSpark(p.x, p.y, true);
    Cards.dismiss(c, true);
    afterSuccess();
  } else {
    addTime(CONFIG.schroLoseTime, c);
    comboBreak();
    S.miss++;
    Audio.seMiss();
    flashMono();
    stampBigHah();
    Cards.dismiss(c, false);
  }
  updateHud();
}

function successKizamu(c) {
  // 原✝本質✝は耐久3
  if (c.type === 'gen' && c.hp > 1) {
    c.hp--;
    Cards.refreshGenHp(c);
    Cards.playCarve(c);
    Audio.sePen();
    Audio.seKizamu(S.combo);
    const p = Cards.cardCenter(c);
    Particles.crossSpark(p.x, p.y, false);
    const gain = Math.round(200 * mult() * S.satoMul);
    addScore(gain, c, null);
    return;
  }
  Cards.playCarve(c);
  Audio.seKizamu(S.combo);
  const p = Cards.cardCenter(c);
  let gain, tAdd = CONFIG.timeKizamu;
  if (c.type === 'corn') {
    gain = CONFIG.scoreCorn; tAdd = CONFIG.timeCorn;
    Audio.seCorn();
    floatText(p.x, p.y - 40, '+3.0秒！', 'gold');
    Particles.burst(p.x, p.y, 24, { colors: ['#F2C14E', '#FF9A3C'], speed: 300 });
  } else if (c.type === 'ring') {
    gain = CONFIG.scoreRing;
    floatText(p.x, p.y - 40, '封印解除！', 'gold');
    Skills.showTachie('meshino', 1.2, '俺は二見先生にすべてを捧げる');
    Particles.orbitBurst(p.x, p.y, 14, '#D96C8A');
  } else if (c.type === 'gen') {
    gain = CONFIG.scoreGen;
    floatText(p.x, p.y - 40, '原✝本質✝破壊！', 'gold');
    Particles.burst(p.x, p.y, 60, { speed: 420, shape: 2, colors: ['#F2C14E', '#FFF', '#8E6CC9'] });
    Skills.showTachie('kuraishi', 1.2, '✝本質✝の探求です');
  } else if (c.type === 'english') {
    gain = CONFIG.scoreEnglish; tAdd = CONFIG.timeEnglish;
    floatText(p.x, p.y - 40, '+5.0秒！', 'gold');
    Skills.showLine('Good job!', '二見', '#4E7AC9');
  } else if (c.type === 'schro') {
    gain = Math.round(CONFIG.scoreKizamu * mult());
  } else {
    gain = Math.round(CONFIG.scoreKizamu * mult() * S.satoMul);
  }
  if (c.type !== 'corn' && c.type !== 'ring' && c.type !== 'gen' && c.type !== 'english') {
    Particles.crossSpark(p.x, p.y, S.combo > 20);
  }
  addScore(gain, c, null);
  if (c.quote) S.seenQuotes.add(c.quote.id);
  S.combo++;
  S.maxCombo = Math.max(S.maxCombo, S.combo);
  S.kizamuTotal++;
  S.hahChain = 0;
  addTime(tAdd, null);
  S.overflow = Math.min(CONFIG.overflowMax, S.overflow + CONFIG.overflowKizamu);
  Cards.dismiss(c, true);
  popCombo();
  afterSuccess();
  updateHud();
}

function successHah(c) {
  Cards.playHah(c);
  Audio.seHah();
  Audio.seFlip();
  const gain = Math.round(CONFIG.scoreHah * mult() * S.satoMul);
  const p = Cards.cardCenter(c);
  Particles.burst(p.x, p.y, 8, { speed: 160, colors: ['#8C2F3A', '#F7F5EE'] });
  addScore(gain, c, null);
  if (c.quote) S.seenQuotes.add(c.quote.id);
  S.combo++;
  S.maxCombo = Math.max(S.maxCombo, S.combo);
  S.hahTotal++;
  S.hahChain++;
  addTime(CONFIG.timeHah, null);
  S.overflow = Math.min(CONFIG.overflowMax, S.overflow + CONFIG.overflowHah);
  // 三重スキル:は？5連続→3秒オートガード
  if (S.hahChain >= CONFIG.mieHahChain && S.guardT <= 0) {
    S.guardT = CONFIG.mieGuardTime;
    S.guardUsed = false;
    Skills.showTachie('mie', 1.2, 'やめろ');
    Audio.seGuard();
    $('hud').classList.add('guarded');
  }
  Cards.dismiss(c, true);
  popCombo();
  afterSuccess();
  updateHud();
}

function dismissBad(c, safe) { // シュレディンガーを捨てる等
  Cards.playHah(c);
  Audio.seFlip();
  Cards.dismiss(c, true);
}

function errorMiss(c, action) {
  // 三重ガード:1回だけ無効化
  if (S.guardT > 0 && !S.guardUsed) {
    S.guardUsed = true;
    Skills.showLine('やめろ（ガード）', '三重', '#8C2F3A');
    Audio.seGuard();
    Cards.dismiss(c, true, 120);
    updateHud();
    return;
  }
  if (c) {
    if (action === 'kizamu') Cards.playCarve(c);
    else Cards.playHah(c);
    Cards.dismiss(c, false);
  }
  S.miss++;
  S.hahChain = 0;
  comboBreak();
  addTime(CONFIG.timeMiss, c);
  S.overflow = Math.max(0, S.overflow * (1 - CONFIG.overflowMissRate));
  S.timeSinceMiss = 0;
  Audio.seMiss();
  flashMono();
  stampBigHah();
  updateHud();
}

function comboBreak() {
  S.combo = 0;
  const cc = $('combo-num');
  cc.classList.remove('pop');
  void cc.offsetWidth;
}

function addScore(n, card, label) {
  S.score += n;
  S.terachiScore = (S.terachiScore || 0) + n;
  if (card && !label && n >= 200) {
    const p = Cards.cardCenter(card);
    floatText(p.x, p.y - 30, '+' + n, '');
  } else if (card && label) {
    const p = Cards.cardCenter(card);
    floatText(p.x, p.y - 30, '+' + n + ' ' + label, 'gold');
  }
}

function addTime(dt, card) {
  S.timeLeft += dt;
  if (dt < -1 && card) {
    const p = Cards.cardCenter(card);
    floatText(p.x, p.y - 60, dt.toFixed(1) + '秒', 'bad');
  }
}

function afterSuccess() {
  S.timeSinceMiss += 0; // (timeSinceMissはloopで加算)
  // 両馬:コンボ20ごと
  if (S.combo > 0 && S.combo % CONFIG.ryomaComboEvery === 0 && !S.fired['ryoma' + S.combo]) {
    S.fired['ryoma' + S.combo] = true;
    fireRyoma();
  }
}

// 両馬スキル
function fireRyoma() {
  Skills.showTachie('ryoma', CONFIG.ryomaStay, 'これまじ✝本質✝');
  const targets = Cards.activeCards()
    .filter(c => Cards.KIZAMU_TYPES.has(c.type) && c.type !== 'gen')
    .sort((a, b) => b.y - a.y)
    .slice(0, CONFIG.ryomaMaxTargets);
  targets.forEach((c, i) => {
    setTimeout(() => {
      if (!c.active || c.judged) return;
      if (S.state !== 'PLAY' && S.state !== 'OVERFLOW') return;
      Cards.playCarve(c);
      const p = Cards.cardCenter(c);
      Particles.crossSpark(p.x, p.y, false);
      const gain = Math.round(CONFIG.scoreRyomaAuto * mult());
      addScore(gain, c, null);
      Audio.seKizamu(S.combo + i);
      Cards.dismiss(c, true, 150);
      updateHud();
    }, 150 + i * 130);
  });
}

// ---------- OVERFLOW ----------
function tryOverflow() {
  if (S.state !== 'PLAY') return;
  if (S.overflow < CONFIG.overflowMax) return;
  S.overflowActive = true;
  S.overflowT = CONFIG.overflowTime;
  S.overflowStage = 0;
  S.overflow = 0;
  setState('OVERFLOW');
  Audio.seOverflowRise();
  setTimeout(() => Audio.seOverflowBoom(), 650);
  Audio.setBgmMode(true, S.timeLeft <= CONFIG.dangerTime);
  $('play-area').classList.add('overflowing');
  // 寺地:画面端で数字を書き続ける
  S.terachiScore = 0;
  showTerachiFx();
  // 衝撃波3層
  shockwave();
  updateHud();
}

function shockwave() {
  const el = $('shockwave');
  el.classList.remove('play');
  void el.offsetWidth;
  el.classList.add('play');
  const r = $('play-area').getBoundingClientRect();
  Particles.suckBurst(r.width / 2, r.height / 2, 40, r.width / 2, r.height / 2, '#F2C14E');
}

function endOverflow() {
  S.overflowActive = false;
  S.overflowT = 0;
  setState('PLAY');
  $('play-area').classList.remove('overflowing');
  Audio.setBgmMode(false, S.timeLeft <= CONFIG.dangerTime);
  // 1秒で教室に逆再生
  BG.setStage(0, false);
  hideTerachiFx();
}

function showTerachiFx() {
  hideTerachiFx();
  const d = document.createElement('div');
  d.id = 'terachi-fx';
  d.innerHTML = `<img src="chr_terachi_01_nemusou_no_bg.png" alt="寺地" onerror="this.remove()"><div class="terachi-paper">+0</div>`;
  $('play-area').appendChild(d);
  S.terachiFx = d;
}
function hideTerachiFx() {
  if (S.terachiFx) { S.terachiFx.remove(); S.terachiFx = null; }
}

// ---------- なぞり斬り(等高線モード) ----------
function slashHit(cx, cy) {
  const layerRect = $('card-layer').getBoundingClientRect();
  const x = cx - layerRect.left, y = cy - layerRect.top;
  for (const c of Cards.activeCards()) {
    const dx = Math.abs(c.x - x);
    if (dx < 90 && Math.abs(c.y + 40 - y) < 60) {
      // シュレディンガーは安全に暴露(ギャンブル回避)
      if (c.type === 'schro' && !c.revealed) { revealSchro(c); continue; }
      // 正解の処理を自動で適用(爽快ポイント)
      const truth = c.type === 'schro' ? (c.revealed ? c.schroTrue : 'honshitsu') : c.type;
      const needKizamu = Cards.KIZAMU_TYPES.has(truth);
      Audio.seSlash();
      const p = Cards.cardCenter(c);
      Particles.burst(p.x, p.y, 10, { speed: 260, colors: ['#5B8C5A', '#F2C14E'] });
      if (needKizamu) successKizamu(c);
      else successHah(c);
    }
  }
  drawSlashTrail();
}

function drawSlashTrail() {
  // 軌跡はCSS divで簡易表示
  let el = $('slash-trail');
  if (S.slashTrail.length < 2) { el.style.opacity = 0; return; }
  const pts = S.slashTrail.slice(-8);
  const area = $('play-area').getBoundingClientRect();
  const path = pts.map(p => `${p.x - area.left},${p.y - area.top}`).join(' ');
  el.style.opacity = 1;
  el.innerHTML = `<svg width="${area.width}" height="${area.height}"><polyline points="${path}" fill="none" stroke="#F2C14E" stroke-width="4" stroke-linecap="round" opacity="0.9"/></svg>`;
}

// ---------- メインループ ----------
let lastT = 0;
let fpsAcc = 0, fpsN = 0, fpsT = 0;
function loop(t) {
  requestAnimationFrame(loop);
  const nowMs = t / 1000;
  let dt = lastT ? nowMs - lastT : 0.016;
  lastT = nowMs;
  dt = Math.min(dt, 0.05); // 巨大デルタをクランプ
  // FPS計測
  fpsAcc += dt; fpsN++;
  if (fpsAcc >= 0.5) { S.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; if (S.debug) updateDebug(); }

  Audio.updateBgm(S.state === 'PLAY' || S.state === 'OVERFLOW');
  BG.updateBg(dt, S.reducedMotion);

  if (S.state === 'PLAY' || S.state === 'OVERFLOW') {
    updatePlay(dt);
  }
  Particles.update(dt);
  // シェイク適用
  if (S.shake > 0.2 && !S.reducedMotion) {
    const s = S.shake;
    $('play-area').style.transform = `translate(${(Math.random() - 0.5) * s}px, ${(Math.random() - 0.5) * s}px)`;
    S.shake *= Math.pow(0.02, dt);
  } else if ($('play-area').style.transform) {
    $('play-area').style.transform = '';
  }
}

function updatePlay(dt) {
  const overflowing = S.state === 'OVERFLOW';
  // タイマー(OVERFLOW中は停止)
  if (!overflowing) {
    S.timeLeft -= dt;
    S.elapsed += dt;
    if (S.timeLeft <= 0) {
      S.timeLeft = 0;
      updateHud();
      return timeUp();
    }
    // 心拍 + テンポ
    if (S.timeLeft <= CONFIG.dangerTime) {
      S.heartbeatT -= dt;
      if (S.heartbeatT <= 0) { S.heartbeatT = 1.0; Audio.seHeartbeat(); }
      $('time-left').classList.add('danger');
    } else {
      $('time-left').classList.remove('danger');
    }
    Audio.setBgmMode(false, S.timeLeft <= CONFIG.dangerTime);
  } else {
    S.overflowT -= dt;
    // 3段階の壁剥がし
    const prog = 1 - S.overflowT / CONFIG.overflowTime;
    const st = prog < 0.33 ? 1 : prog < 0.66 ? 2 : 3;
    if (st !== S.overflowStage) {
      S.overflowStage = st;
      BG.setStage(st, false);
      const r = $('play-area').getBoundingClientRect();
      if (st === 3) {
        // 桜を舞わせる
        for (let i = 0; i < 30; i++) {
          Particles.petal(Math.random() * r.width, -10 - Math.random() * 60, (Math.random() - 0.5) * 30, 40 + Math.random() * 40);
        }
      }
      Particles.suckBurst(r.width / 2, r.height / 2, 24, r.width / 2, r.height / 2, '#F2C14E');
    }
    // カメラ寄り・シェイク
    if (!S.reducedMotion) S.shake = Math.max(S.shake, 3);
    if (S.overflowT <= 0) endOverflow();
  }

  S.timeSinceMiss += dt;

  // バフ・デバフ時間
  if (S.reiBuffT > 0) { S.reiBuffT -= dt; if (S.reiBuffT <= 0) S.multCap = CONFIG.multMax; }
  if (S.guardT > 0) { S.guardT -= dt; if (S.guardT <= 0) $('hud').classList.remove('guarded'); }
  if (S.contourT > 0) {
    S.contourT -= dt;
    $('play-area').classList.add('contour');
    if (S.contourT <= 0) $('play-area').classList.remove('contour');
  }
  if (S.satoT > 0) {
    S.satoT -= dt;
    if (S.satoT <= 0) { S.slowMul = 1; S.satoMul = 1; $('play-area').classList.remove('sato-gold'); }
  }
  // 櫻→三峰の暴露
  if (S.sakuraCard && S.sakuraCard.active && !S.sakuraCard.judged && !S.sakuraCard.revealed) {
    S.sakuraT -= dt;
    if (S.sakuraT <= 0) revealSchro(S.sakuraCard);
  }

  // ---- スキル発火チェック ----
  checkSkills();

  // ---- 出現 ----
  S.spawnT -= dt * (S.slowMul < 1 ? 0.8 : 1);
  const d = difficultyAt(S.elapsed);
  if (S.spawnT <= 0) {
    const alive = Cards.activeCards().length;
    if (alive < d.concurrent) {
      spawnOne(d);
    }
    const [a, b] = CONFIG.spawnInterval;
    S.spawnT = (a + S.rng() * (b - a)) / d.speed;
  }

  // ---- カード更新 ----
  const effSlow = (S.slowMul || 1);
  const leaked = Cards.updateCards(dt, effSlow, S.contourT > 0, S.elapsed);
  for (const c of leaked) onLeak(c);
  Cards.updateTargetRing();

  // 寺地FXの数字
  if (S.terachiFx) {
    const paper = S.terachiFx.querySelector('.terachi-paper');
    if (paper) paper.textContent = '+' + (S.terachiScore || 0);
  }

  // カウントチクチク(秒境界)
  const sec = Math.ceil(S.timeLeft);
  if (sec !== S.lastTickSecond) {
    S.lastTickSecond = sec;
    if (S.timeLeft <= 5.5 && S.timeLeft > 0) Audio.seTick();
  }

  updateHud();
}

function spawnOne(d) {
  const r = S.rng();
  // レア優先
  if (r < CONFIG.cornChance) return Cards.spawnCard('corn', S.quotes, S.elapsed);
  if (r < CONFIG.cornChance + CONFIG.ringChance) return Cards.spawnCard('ring', S.quotes, S.elapsed);
  // ☆スキル系の特殊出現
  if (!S.fired.kuraishi && S.elapsed >= CONFIG.kuraishiAfter && S.rng() < CONFIG.kuraishiChance) {
    S.fired.kuraishi = true;
    Skills.showTachie('kuraishi', 1.4, '原✝本質✝が顕現する');
    return Cards.spawnCard('gen', S.quotes, S.elapsed);
  }
  if (!S.fired.sakura && S.elapsed >= CONFIG.sakuraAfter && S.rng() < CONFIG.sakuraChance) {
    S.fired.sakura = true;
    Skills.showTachie('sakura', 1.4, '観測せよ。要検証');
    const c = Cards.spawnCard('schro', S.quotes, S.elapsed);
    S.sakuraCard = c;
    S.sakuraT = CONFIG.sakuraRevealAfter;
    return c;
  }
  if (!S.fired.meshino && S.elapsed >= CONFIG.meshinoAfter && S.rng() < CONFIG.meshinoChance) {
    S.fired.meshino = true;
    Skills.showTachie('meshino', 1.2, 'Running and listening');
    return Cards.spawnCard('english', S.quotes, S.elapsed);
  }
  // 砂糖:低確率スロー(出現駆動=デイリー再現性のため)
  if (!S.fired.sato && S.elapsed >= 20 && S.rng() < CONFIG.satoChance) fireSato();
  // 通常
  const type = Cards.decideType(S.elapsed, S.state === 'OVERFLOW');
  return Cards.spawnCard(type, S.quotes, S.elapsed);
}

function revealSchro(c) {
  if (!c.active || c.judged || c.revealed) return;
  c.revealed = true;
  // 三峰が正体を暴く→安全化(真の種別の通常カードに)
  const truth = c.schroTrue;
  Skills.showTachie('mitsumine', 1.1, 'は？正体見たり');
  // 見た目を真の種別に寄せる
  c.type = truth === 'honshitsu' ? 'honshitsu' : 'noise';
  c.el.className = `card type-${c.type} revealed target`;
  const textEl = c.el.querySelector('.card-text');
  if (c.quote) {
    if (c.type === 'noise') textEl.innerHTML = `<div class="noise-head">まとめ速報</div><div class="noise-body">${escapeHtml(c.quote.text)}</div>`;
    else textEl.textContent = c.quote.text;
  }
  c.el.querySelector('.card-badge').textContent = '';
  S.sakuraCard = null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function checkSkills() {
  // 零:無傷15秒
  if (!S.fired.rei && S.elapsed >= CONFIG.reiNoMissTime && S.miss === 0 && S.leaks === 0) {
    S.fired.rei = true;
    S.reiBuffT = CONFIG.reiBuffTime;
    S.multCap = CONFIG.multReiMax;
    Skills.showTachie('rei', 1.4, '面白い');
    floatCenter('倍率上限×10（10秒）', 'rei');
  }
  // 勝也:残り30秒ちょうど
  if (!S.fired.katsuya && S.timeLeft <= CONFIG.katsuyaAt && S.state === 'PLAY') {
    S.fired.katsuya = true;
    S.contourT = CONFIG.katsuyaTime;
    Skills.showTachie('katsuya', 1.6, '地面は忘れない');
    floatCenter('等高線モード！なぞれ！', 'gold');
    Audio.seOverflowRise();
  }
}

function fireSato() {
  S.fired.sato = true;
  S.satoT = CONFIG.satoTime;
  S.slowMul = CONFIG.satoSlowRate;
  S.satoMul = CONFIG.scoreSatoMult;
  $('play-area').classList.add('sato-gold');
  Skills.showTachie('sato', 1.6, '見てない');
  floatCenter('窓が開いた…1.5倍', 'gold');
}

function onLeak(c) {
  if (c === S.sakuraCard) S.sakuraCard = null;
  // 本質系の取りこぼしのみペナルティ
  if (c.type === 'honshitsu' || c.type === 'corn' || c.type === 'ring' || c.type === 'gen' || c.type === 'english') {
    if (S.state === 'OVERFLOW') return; // フィーバー中は不問
    addTime(CONFIG.timeLeak, null);
    comboBreak();
    S.timeSinceMiss = 0;
    floatText($('play-area').getBoundingClientRect().width / 2, $('play-area').getBoundingClientRect().height - 160, '取りこぼし -0.5秒', 'bad');
    S.leaks++;
  }
  // 悪カードの漏れは無害(スルー成功扱い・コンボ維持)
}

// ---------- HUD ----------
let lastHensachiShown = 60;
function updateHud(force) {
  $('time-left').textContent = S.timeLeft.toFixed(2);
  const h = scoreToHensachi(S.score);
  // ロール表示(徐々に追従)
  lastHensachiShown += (h - lastHensachiShown) * 0.2;
  if (force) lastHensachiShown = h;
  $('hensachi-num').textContent = (force ? h : lastHensachiShown).toFixed(1);
  $('combo-num').textContent = S.combo;
  $('mult-num').textContent = '×' + mult().toFixed(1);
  $('score-num').textContent = S.score.toLocaleString();
  const g = $('overflow-fill');
  g.style.width = Math.min(100, S.overflow) + '%';
  $('btn-overflow').classList.toggle('ready', S.overflow >= CONFIG.overflowMax);
  $('btn-overflow').classList.toggle('active', S.state === 'OVERFLOW');
  if (S.state === 'OVERFLOW') {
    $('btn-overflow').textContent = `OVERFLOW ${S.overflowT.toFixed(1)}s`;
    g.style.width = (S.overflowT / CONFIG.overflowTime * 100) + '%';
  } else {
    $('btn-overflow').textContent = S.overflow >= CONFIG.overflowMax ? 'OVERFLOW 発動！' : `OVERFLOW ${Math.floor(S.overflow)}%`;
  }
  if (S.debug) updateDebugState();
}

function popCombo() {
  const cc = $('combo-num');
  cc.classList.remove('pop');
  void cc.offsetWidth;
  cc.classList.add('pop');
}

function floatText(x, y, text, cls) {
  const d = document.createElement('div');
  d.className = 'float-text ' + (cls || '');
  d.textContent = text;
  d.style.left = x + 'px';
  d.style.top = y + 'px';
  $('fx-layer').appendChild(d);
  setTimeout(() => d.remove(), 1100);
}

function floatCenter(text, cls) {
  const d = document.createElement('div');
  d.className = 'center-flash ' + (cls || '');
  d.textContent = text;
  $('fx-layer').appendChild(d);
  setTimeout(() => d.classList.add('out'), 1400);
  setTimeout(() => d.remove(), 1800);
}

function flashMono() {
  if (S.reducedMotion) return;
  $('play-area').classList.add('mono');
  setTimeout(() => $('play-area').classList.remove('mono'), 100);
}

function stampBigHah() {
  const d = document.createElement('div');
  d.className = 'big-hah';
  d.textContent = 'は？';
  $('fx-layer').appendChild(d);
  setTimeout(() => d.remove(), CONFIG.hahStampTime * 1000 + 120);
  if (!S.reducedMotion) S.shake = Math.max(S.shake, CONFIG.shakeMax);
}

// ---------- タイムアップ→リザルト ----------
let resultTimers = [];
function timeUp() {
  setState('TIMEUP');
  Skills.clearTachie();
  Audio.setBgmMode(false, false);
  Cards.freezeAll();
  resultTimers.forEach(clearTimeout);
  resultTimers = [];
  // 0.4秒静止→一斉に落下
  resultTimers.push(setTimeout(() => {
    Cards.dropAll();
    Audio.seFlip();
  }, CONFIG.freezeTime * 1000));
  resultTimers.push(setTimeout(() => showResult(), CONFIG.freezeTime * 1000 + 900));
}

function showResult() {
  // 集計(表示値=四捨五入1桁でランク判定。約30万点で100到達)
  S.hensachi = scoreToHensachi(S.score);
  S.rank = hensachiRank(Math.round(S.hensachi * 10) / 10);
  // 隠しランク✝は初回のみ全画面演出
  const crossSeen = LS.get('cross_seen', false);
  S.crossFirst = S.rank.id === 'cross' && !crossSeen;
  if (S.rank.id === 'cross') LS.set('cross_seen', true);
  // ベスト
  if (S.score > (S.best.score || 0)) {
    S.newBest = true;
    S.best = { score: S.score, hensachi: S.hensachi };
    LS.set('best', S.best);
    Audio.seFanfare();
  }
  // 語録アンロック(1〜3件)
  const locked = S.quotes.all.filter(q => !q.unlocked && !S.unlockedExtra.includes(q.id));
  const seenLocked = locked.filter(q => S.seenQuotes.has(q.id));
  const poolU = seenLocked.length ? seenLocked : locked;
  const n = 1 + Math.floor(Math.random() * 3);
  S.newUnlocks = [];
  for (let i = 0; i < n && poolU.length; i++) {
    const q = poolU.splice(Math.floor(Math.random() * poolU.length), 1)[0];
    S.unlockedExtra.push(q.id);
    S.newUnlocks.push(q);
  }
  LS.set('unlocked', S.unlockedExtra);
  // ミッション更新
  updateMissions();
  // レス番号
  const resNo = S.resNo;
  S.resNo++;
  LS.set('res_no', S.resNo);
  S.resText = `${resNo} 名無しの地形図好き：偏差値${S.hensachi.toFixed(1)}。コンボ最高${S.maxCombo}。誤爆${S.miss}回。これまじ✝本質✝。✝`;

  setState('RESULT');
  playResultCine();
}

function updateMissions() {
  for (const m of S.missions) {
    if (m.done) continue;
    if (m.id === 'hah20') m.prog = Math.min(m.goal, m.prog + S.hahTotal);
    if (m.id === 'nomiss' && S.miss === 0) m.prog = 1;
    if (m.id === 'h85' && S.hensachi >= 85) m.prog = 1;
    if (m.prog >= m.goal) m.done = true;
  }
  LS.set('missions', S.missions);
}

let cineTimers = [];
let cineSkipped = false;
function playResultCine() {
  cineTimers.forEach(clearTimeout);
  cineTimers = [];
  cineSkipped = false;
  const cine = $('result-cine');
  const panel = $('result-panel');
  cine.classList.remove('hidden');
  panel.classList.add('hidden');
  cine.innerHTML = '';
  // 背景クラス
  document.body.className = document.body.className.replace(/rank-\w+/g, '');
  document.body.classList.add(S.rank.cls);
  $('result').className = 'screen ' + S.rank.cls;

  const steps = [];
  // 1. 配信終了テロップ
  steps.push([100, () => {
    cine.innerHTML = '<div class="cine-telop">配信終了</div>';
  }]);
  // 2. 寺地が偏差値を手書き
  steps.push([900, () => {
    cine.innerHTML = `
      <div class="cine-terachi">
        <img src="chr_terachi_01_nemusou_no_bg.png" alt="寺地" onerror="this.remove()">
        <div class="cine-paper"><span class="cine-hand" id="cine-hand"></span></div>
      </div>`;
    // 手書き風に1文字ずつ
    const str = S.hensachi.toFixed(1);
    const hand = $('cine-hand');
    let i = 0;
    const iv = setInterval(() => {
      if (cineSkipped) { clearInterval(iv); return; }
      if (i >= str.length) { clearInterval(iv); return; }
      hand.textContent += str[i++];
      Audio.sePen();
    }, 160);
    cineTimers.push(setTimeout(() => clearInterval(iv), 2000));
  }]);
  // 3. カウンターロール+称号スタンプ
  steps.push([2600, () => {
    cine.innerHTML = `
      <div class="cine-score"><span id="cine-num">60.0</span></div>
      <div class="cine-stamp" id="cine-stamp">${S.rank.name}</div>`;
    // ロール
    const el = $('cine-num');
    const t0 = performance.now();
    const dur = 1200;
    (function roll(t) {
      if (cineSkipped) return;
      const p = Math.min(1, (t - t0) / dur);
      const over = 1 + Math.sin(p * Math.PI) * 0.04 * (1 - p);
      el.textContent = (60 + (S.hensachi - 60) * p * over).toFixed(1);
      if (Math.random() < 0.5) Audio.seTick();
      if (p < 1) requestAnimationFrame(roll);
      else {
        el.textContent = S.hensachi.toFixed(1);
        const st = $('cine-stamp');
        if (st) { st.classList.add('stamp-in'); Audio.seStamp(); }
      }
    })(t0);
    if (S.rank.id === 'rei') floatCenter('数理零ライン到達！', 'rei');
    if (S.rank.id === 'cross' && S.crossFirst) crossFillScreen();
  }]);
  // 4. パネル表示
  steps.push([4600, () => showResultPanel()]);
  for (const [ms, fn] of steps) cineTimers.push(setTimeout(() => { if (!cineSkipped) fn(); }, ms));
}

function crossFillScreen() {
  const d = document.createElement('div');
  d.className = 'cross-fill';
  let s = '';
  for (let i = 0; i < 120; i++) s += '✝';
  d.textContent = s;
  $('result-cine').appendChild(d);
  setTimeout(() => d.classList.add('fade'), 1200);
  setTimeout(() => d.remove(), 2000);
}

function skipResultCine() {
  if (S.state !== 'RESULT') return;
  if ($('result-panel').classList.contains('hidden')) {
    cineSkipped = true;
    cineTimers.forEach(clearTimeout);
    showResultPanel();
  }
}

function showResultPanel() {
  cineTimers.forEach(clearTimeout);
  $('result-cine').classList.add('hidden');
  const panel = $('result-panel');
  panel.classList.remove('hidden');
  $('res-hensachi').textContent = S.hensachi.toFixed(1);
  $('res-rank').textContent = S.rank.name;
  $('res-rank').className = 'res-rank ' + S.rank.cls;
  $('res-score').textContent = S.score.toLocaleString();
  $('res-combo').textContent = S.maxCombo;
  $('res-miss').textContent = S.miss;
  $('res-best').classList.toggle('hidden', !S.newBest);
  $('res-text').textContent = S.resText;
  // アンロック表示
  const u = $('res-unlock');
  u.innerHTML = '';
  if (S.newUnlocks && S.newUnlocks.length) {
    u.innerHTML = '<div class="res-unlock-title">語録解放！</div>' +
      S.newUnlocks.map(q => `<div class="res-unlock-item">「${escapeHtml(q.text)}」<span>${escapeHtml(q.speaker)}・${escapeHtml(q.source)}</span></div>`).join('');
  }
  // 最高ランク時は主役だけ(他要素を退場)
  panel.classList.toggle('grand', S.rank.id === 'pregen' || S.rank.id === 'cross');
  // 三重の小さな「は？」(毎回・オチ)
  Skills.miniHah($('result'));
  // 紙吹雪はピーク1回だけ
  const r = $('play-area').getBoundingClientRect();
  for (let i = 0; i < 40; i++) {
    Particles.petal(Math.random() * r.width, r.height * 0.3, (Math.random() - 0.5) * 60, -60 - Math.random() * 120,
      ['#F2C14E', '#F7F5EE', '#8C2F3A'][(Math.random() * 3) | 0]);
  }
}

function hideResult() {
  document.body.className = document.body.className.replace(/rank-\w+/g, '');
  $('result').className = 'screen hidden';
}

function copyResult() {
  Audio.seUi();
  const t = S.resText || '';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(() => copiedOk(), () => fallbackCopy(t));
  } else fallbackCopy(t);
}
function fallbackCopy(t) {
  const ta = document.createElement('textarea');
  ta.value = t;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch {}
  ta.remove();
  copiedOk();
}
function copiedOk() {
  const b = $('btn-copy');
  const old = b.textContent;
  b.textContent = 'コピーした✝';
  setTimeout(() => b.textContent = old, 1200);
}

// ---------- ベスト・ミッション ----------
function renderBest() {
  const b = LS.get('best', { score: 0, hensachi: 60 });
  const h = b.hensachi || 60;
  $('best-hensachi').textContent = h.toFixed(1);
  $('best-score').textContent = (b.score || 0).toLocaleString();
  const d = new Date();
  $('daily-seed').textContent = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}のシードで全員同条件`;
}

function renderMissions() {
  const box = $('mission-list');
  if (!box) return;
  box.innerHTML = S.missions.map(m =>
    `<div class="mission ${m.done ? 'done' : ''}"><span class="m-name">${escapeHtml(m.name)}</span><span class="m-prog">${m.done ? '達成✝' : m.prog + '/' + m.goal}</span></div>`
  ).join('');
}

// ---------- コレクション ----------
function isUnlocked(q) {
  return q.unlocked || S.unlockedExtra.includes(q.id);
}
function openCollection() {
  $('collection').classList.remove('hidden');
  $('tachie-stage').style.display = 'none';
  renderCollection('quotes');
  $('tab-quotes').onclick = () => { Audio.seUi(); renderCollection('quotes'); };
  $('tab-chars').onclick = () => { Audio.seUi(); renderCollection('chars'); };
}
function closeCollection() {
  $('collection').classList.add('hidden');
  $('tachie-stage').style.display = '';
}
function renderCollection(tab) {
  $('tab-quotes').classList.toggle('active', tab === 'quotes');
  $('tab-chars').classList.toggle('active', tab === 'chars');
  const box = $('collection-list');
  box.innerHTML = '';
  // アイコン枠(ミッション報酬)
  const frames = ['frame-bronze', 'frame-silver', 'frame-gold'];
  const frameCls = S.missions.map((m, i) => m.done ? frames[i] : '').join(' ');
  if (tab === 'quotes') {
    const qs = [...S.quotes.all].sort((a, b) => (isUnlocked(b) - isUnlocked(a)));
    const un = S.quotes.all.filter(isUnlocked).length;
    box.innerHTML = `<div class="col-count">解放 ${un} / ${S.quotes.all.length}</div>` + qs.map(q => {
      if (!isUnlocked(q)) return `<div class="col-quote locked"><span>？？？</span><em>未解放（プレイで解放）</em></div>`;
      return `<div class="col-quote type-${q.type}"><span>「${escapeHtml(q.text)}」</span><em>${escapeHtml(q.speaker)}・${escapeHtml(q.source)}</em></div>`;
    }).join('');
  } else {
    box.innerHTML = S.characters.map(c =>
      `<div class="col-char ${frameCls}"><img src="${c.icon}" alt="${escapeHtml(c.name)}" onerror="this.remove()"><div><b>${escapeHtml(c.name)}</b><i>「${escapeHtml(c.quote)}」</i><em>${escapeHtml(c.skill.name)}：${escapeHtml(c.skill.desc)}</em></div></div>`
    ).join('');
  }
}

// ---------- デバッグ ----------
function setupDebug() {
  const p = $('debug-panel');
  p.classList.remove('hidden');
  $('dbg-fov').onclick = () => { S.showHitbox = !S.showHitbox; $('card-layer').classList.toggle('hitbox', S.showHitbox); };
  $('dbg-time').onclick = () => { S.timeLeft += 10; };
  $('dbg-overflow').onclick = () => { S.overflow = CONFIG.overflowMax; };
  $('dbg-max').onclick = () => { S.score = 200000; };
  $('dbg-spawn').onclick = () => {
    const types = ['honshitsu', 'a_honshitsu', 'noise', 'fake_katsu', 'corn', 'ring', 'gen', 'schro', 'english'];
    const t = types[(Math.random() * types.length) | 0];
    const c = Cards.spawnCard(t, S.quotes, S.elapsed);
    if (c && t === 'schro') { S.sakuraCard = c; S.sakuraT = CONFIG.sakuraRevealAfter; }
  };
}
function updateDebug() {
  $('dbg-fps').textContent = S.fps;
  updateDebugState();
}
// デバッグ・自動テスト用フック
export function __test() { return { S, spawnSpecial }; }
function spawnSpecial(t) {
  const c = Cards.spawnCard(t, S.quotes, S.elapsed);
  if (c && t === 'schro') { S.sakuraCard = c; S.sakuraT = CONFIG.sakuraRevealAfter; }
  return c;
}
function updateDebugState() {
  if (!S.debug) return;
  const d = difficultyAt(S.elapsed);
  $('dbg-state').textContent = `${S.state} t=${S.elapsed.toFixed(1)} 同時${d.concurrent} 速${d.speed} fake${Math.round(d.fake * 100)}% カード${Cards.activeCards().length}`;
}
