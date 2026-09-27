import { CONFIG, STATES, TYPE, STORAGE } from './config.js';
import quotes from '../data/quotes.json' with { type: 'json' };
import characters from '../data/characters.json' with { type: 'json' };

const $ = (selector) => document.querySelector(selector);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const pad = (n, places = 2) => String(Math.max(0, n)).padStart(places, '0');
const formatTime = (seconds) => `${Math.floor(Math.max(0, seconds))}:${pad(Math.floor((Math.max(0, seconds) % 1) * 100))}`;
const japanDate = () => new Date().toISOString().slice(0, 10);

function hashSeed(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

class TextAtlas {
  constructor(scale = CONFIG.TEXT_SCALE) { this.scale = scale; this.cache = new Map(); }
  get(text, font = '700 16px sans-serif', color = '#fff') {
    const key = `${text}|${font}|${color}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const c = document.createElement('canvas');
    const m = c.getContext('2d');
    m.font = font;
    const width = Math.ceil(m.measureText(text).width + 12);
    c.width = Math.ceil(width * this.scale);
    c.height = Math.ceil(32 * this.scale);
    const x = c.getContext('2d');
    x.scale(this.scale, this.scale);
    x.font = font;
    x.textBaseline = 'middle';
    x.fillStyle = color;
    x.fillText(text, 6, 16);
    this.cache.set(key, c);
    return c;
  }
  draw(ctx, text, x, y, font, color, align = 'left') {
    const image = this.get(text, font, color);
    const logicalWidth = image.width / this.scale;
    const dx = align === 'center' ? x - logicalWidth / 2 : align === 'right' ? x - logicalWidth : x;
    ctx.drawImage(image, dx, y - 16, logicalWidth, 32);
  }
}

class ParticlePool {
  constructor(size) {
    this.items = Array.from({ length: size }, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#F2C14E', mode: 0, angle: 0, radius: 0 }));
  }
  emit(x, y, color, amount = 8, mode = 0) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) amount = Math.ceil(amount * CONFIG.REDUCED_PARTICLE_RATIO);
    let made = 0;
    for (const p of this.items) {
      if (p.active) continue;
      p.active = true; p.x = x; p.y = y; p.color = color; p.life = 0; p.max = 0.32 + Math.random() * 0.48;
      p.size = 1.5 + Math.random() * 3.2; p.mode = mode; p.angle = Math.random() * Math.PI * 2; p.radius = 2 + Math.random() * 20;
      const speed = 35 + Math.random() * 145;
      p.vx = Math.cos(p.angle) * speed; p.vy = Math.sin(p.angle) * speed - 50;
      made += 1;
      if (made >= amount) break;
    }
  }
  update(dt, cx, cy) {
    for (const p of this.items) {
      if (!p.active) continue;
      p.life += dt;
      const drag = Math.pow(0.08, dt);
      p.vx *= drag; p.vy *= drag;
      if (p.mode === 1) { p.vx += (cx - p.x) * dt * 1.6; p.vy += (cy - p.y) * dt * 1.6; }
      else if (p.mode === 2) { p.angle += dt * 4; p.x = cx + Math.cos(p.angle) * p.radius; p.y = cy + Math.sin(p.angle) * p.radius; }
      else { p.vy += 190 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      if (p.life >= p.max) p.active = false;
    }
  }
  draw(ctx) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of this.items) {
      if (!p.active) continue;
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a * 0.24; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a * 0.9; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

class SoundSystem {
  constructor() { this.ctx = null; this.master = null; this.bgmMode = 'normal'; this.muted = localStorage.getItem(STORAGE.sound) === '1'; this.timer = null; this.step = 0; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); this.startBgm(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : CONFIG.AUDIO.masterGain; this.master.connect(this.ctx.destination);
      this.startBgm();
    } catch (error) { console.warn('Web Audio could not start; the game remains playable.', error); }
  }
  setMuted(value) { this.muted = value; localStorage.setItem(STORAGE.sound, value ? '1' : '0'); if (this.master) this.master.gain.value = value ? 0 : CONFIG.AUDIO.masterGain; }
  toggle() { this.setMuted(!this.muted); }
  tone(freq, duration = 0.12, type = 'sine', gain = 0.12, delay = 0) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime + delay; const osc = this.ctx.createOscillator(); const g = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, now); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(gain, now + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g).connect(this.master); osc.start(now); osc.stop(now + duration + 0.02);
  }
  noise(duration = 0.16, gain = 0.16, filter = 500) {
    if (!this.ctx || this.muted) return;
    const length = Math.floor(this.ctx.sampleRate * duration); const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate); const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.ctx.createBufferSource(); const f = this.ctx.createBiquadFilter(); const g = this.ctx.createGain();
    source.buffer = buffer; f.type = 'bandpass'; f.frequency.value = filter; f.Q.value = 1.2; g.gain.value = gain; source.connect(f).connect(g).connect(this.master); source.start();
  }
  hit(combo = 0) { this.tone(430 * Math.pow(2, (combo % 8) / 12), 0.11, 'triangle', 0.09); this.noise(0.035, 0.035, 2300); }
  reject() { this.tone(180, 0.11, 'square', 0.07); }
  error() { this.tone(145, 0.2, 'sawtooth', 0.11); this.noise(0.2, 0.12, 850); }
  paper() { this.noise(0.09, 0.05, 3200); }
  overflow() { this.tone(220, 0.45, 'sine', 0.08); this.tone(330, 0.50, 'sine', 0.07, 0.08); this.tone(440, 0.7, 'sine', 0.06, 0.16); this.noise(0.28, 0.15, 90); this.tone(660, 0.9, 'triangle', 0.06, 0.32); }
  setBgmMode(mode) { if (this.bgmMode === mode && this.timer) return; this.bgmMode = mode; if (this.timer) { clearInterval(this.timer); this.timer = null; } this.startBgm(); }
  startBgm() {
    if (this.timer || !this.ctx) return;
    const notes = [261.63, 329.63, 392, 329.63]; const period = this.bgmMode === 'overflow' ? CONFIG.AUDIO.overflowMs : this.bgmMode === 'rush' ? CONFIG.AUDIO.rushMs : CONFIG.AUDIO.normalMs;
    this.timer = window.setInterval(() => { if (!this.ctx || this.muted) return; if (this.bgmMode === 'overflow') { this.tone(92, 0.18, 'sine', 0.025); this.tone(notes[this.step % notes.length] * 2, 0.26, 'triangle', 0.024); } else this.tone(notes[this.step % notes.length], 0.22, 'triangle', 0.018); this.step += 1; }, period);
  }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}

class Game {
  constructor() {
    this.bg = $('#backgroundCanvas'); this.gameCanvas = $('#gameCanvas'); this.fxCanvas = $('#fxCanvas');
    this.bgCtx = this.bg.getContext('2d'); this.ctx = this.gameCanvas.getContext('2d'); this.fx = this.fxCanvas.getContext('2d');
    this.atlas = new TextAtlas(); this.particles = new ParticlePool(CONFIG.PARTICLE_POOL); this.sound = new SoundSystem();
    this.state = STATES.BOOT; this.now = 0; this.last = 0; this.w = 0; this.h = 0; this.dpr = 1; this.clock = 0; this.fps = 60; this.shake = 0;
    this.cards = Array.from({ length: CONFIG.CARD_POOL }, () => this.emptyCard());
    this.crosses = Array.from({ length: 80 }, () => ({ active: false, x: 0, y: 0, life: 0, max: 0.2, color: CONFIG.COLORS.gold }));
    this.stamps = Array.from({ length: 20 }, () => ({ active: false, text: '', x: 0, y: 0, life: 0, max: 0.8, color: '#fff' }));
    this.characters = Object.fromEntries(characters.map((c) => [c.id, c]));
    this.pointer = { down: false, x: 0, y: 0, startX: 0, startY: 0 };
    this.quoteUnlocks = this.loadUnlocks(); this.high = Number(localStorage.getItem(STORAGE.high) || 0); this.bestCombo = Number(localStorage.getItem(STORAGE.bestCombo) || 0);
    this.seed = hashSeed(japanDate()); this.rngState = this.seed; this.debug = new URLSearchParams(location.search).get('debug') === '1'; this.debugRank = null;
    this.missions = this.makeMissions(); this.missionState = { reject: 0, errors: 0, rank: 0 };
    $('#dailySeed').textContent = japanDate().replaceAll('-', '').slice(-4);
    this.bindEvents(); this.resize(); this.reportMissingAssets(); this.setupDebug(); this.setState(STATES.TITLE); this.drawBackground();
    requestAnimationFrame((t) => this.loop(t));
  }
  emptyCard() { return { active: false, kind: TYPE.ESSENCE, x: 0, y: 0, w: 170, h: 116, speed: 120, rotation: 0, quote: null, hp: 1, born: 0, seed: 0, settled: false }; }
  rand() { this.rngState = (Math.imul(1664525, this.rngState) + 1013904223) >>> 0; return this.rngState / 4294967296; }
  reportMissingAssets() {
    const missing = [];
    characters.forEach((c) => ['standing', 'icon'].forEach((key) => { if (!c[key]) return; const image = new Image(); image.onerror = () => { missing.push(`${c.name}:${key}:${c[key]}`); console.warn(`Asset fallback: ${c.name} ${key} ${c[key]}`); }; image.src = c[key]; }));
    if (missing.length) console.warn('Missing assets', missing);
  }
  loadUnlocks() {
    try { const saved = JSON.parse(localStorage.getItem(STORAGE.quotes) || 'null'); if (Array.isArray(saved)) return new Set(saved); } catch { /* clean start */ }
    return new Set(quotes.filter((q) => q.unlocked).slice(0, 18).map((q) => q.id));
  }
  saveUnlocks() { localStorage.setItem(STORAGE.quotes, JSON.stringify([...this.quoteUnlocks])); }
  makeMissions() { return [{ id: 'reject', label: 'は？を20回', target: 20 }, { id: 'clean', label: '誤爆0でクリア', target: 0 }, { id: 'rank', label: '偏差値85到達', target: 85 }]; }
  bindEvents() {
    window.addEventListener('resize', () => this.resize());
    this.gameCanvas.addEventListener('pointerdown', (e) => { e.preventDefault(); this.sound.init(); const p = this.point(e); this.pointer = { down: true, x: p.x, y: p.y, startX: p.x, startY: p.y }; if (this.state === STATES.TITLE) this.startTutorial(); else if (this.state === STATES.TUTORIAL) this.startCountdown(); else if (this.state === STATES.COUNTDOWN) this.startPlay(); });
    this.gameCanvas.addEventListener('pointermove', (e) => { if (!this.pointer.down || this.state !== STATES.PLAY || !this.contourMode) return; const p = this.point(e); if (Math.hypot(p.x - this.pointer.x, p.y - this.pointer.y) > 18) { this.pointer.x = p.x; this.pointer.y = p.y; this.processCard('carve', true); } });
    this.gameCanvas.addEventListener('pointerup', (e) => { e.preventDefault(); const p = this.point(e); if (!this.pointer.down) return; this.pointer.down = false; if (this.state === STATES.PLAY || this.state === STATES.OVERFLOW) this.processCard(p.y - this.pointer.startY > 28 ? 'reject' : 'carve'); else if (this.state === STATES.TIMEUP) this.showResult(); else if (this.state === STATES.RESULT) this.skipResult(); });
    this.gameCanvas.addEventListener('pointercancel', () => { this.pointer.down = false; });
    window.addEventListener('keydown', (e) => { if (['ArrowLeft', 'ArrowRight', ' ', 'z', 'Z', 'x', 'X'].includes(e.key)) e.preventDefault(); this.sound.init(); if (e.key === ' ' && (this.state === STATES.PLAY || this.state === STATES.OVERFLOW)) this.startOverflow(); else if (e.key === 'z' || e.key === 'Z' || e.key === 'ArrowLeft') this.processCard('carve'); else if (e.key === 'x' || e.key === 'X' || e.key === 'ArrowRight') this.processCard('reject'); else if (this.state === STATES.TITLE) this.startTutorial(); else if (this.state === STATES.TUTORIAL) this.startCountdown(); else if (this.state === STATES.COUNTDOWN) this.startPlay(); else if (this.state === STATES.TIMEUP) this.showResult(); else if (this.state === STATES.RESULT) this.skipResult(); });
    $('#startButton').addEventListener('click', () => { this.sound.init(); this.startTutorial(); });
    $('#tutorialScreen').addEventListener('click', () => { if (this.state === STATES.TUTORIAL) this.startCountdown(); else if (this.state === STATES.COUNTDOWN) this.startPlay(); });
    $('#resultScreen').addEventListener('click', (e) => { if (e.target.closest('button')) return; if (this.state === STATES.TIMEUP) this.showResult(); });
    $('#overflowButton').addEventListener('click', () => this.startOverflow());
    $('#muteButton').addEventListener('click', () => { this.sound.init(); this.sound.toggle(); this.updateMuteLabel(); });
    $('#againButton').addEventListener('click', () => { this.setState(STATES.TITLE); this.startTutorial(); });
    $('#collectionButton').addEventListener('click', () => this.openCollection());
    $('#resultCopyButton').addEventListener('click', () => this.copyResult());
    $('#closeCollection').addEventListener('click', () => $('#collectionModal').classList.remove('is-open'));
    $('#collectionModal').addEventListener('click', (e) => { if (e.target === $('#collectionModal')) $('#collectionModal').classList.remove('is-open'); });
  }
  setupDebug() {
    if (!this.debug) return;
    $('#debugPanel').hidden = false;
    $('#debugRank').addEventListener('input', (e) => { this.debugRank = Number(e.target.value); this.updateHUD(); });
    $('#debugOverflow').addEventListener('click', () => { this.overflowGauge = 1; this.updateHUD(); });
    $('#debugSpawnGiant').addEventListener('click', () => this.spawnCard(TYPE.GIANT));
    $('#debugEnd').addEventListener('click', () => { if (this.state === STATES.PLAY) this.timeLeft = 0; });
  }
  updateMuteLabel() { $('#muteButton').textContent = this.sound.muted ? '音 OFF' : '音 ON'; $('#muteButton').classList.toggle('is-muted', this.sound.muted); }
  resize() {
    const rect = this.gameCanvas.getBoundingClientRect(); this.w = Math.max(320, rect.width); this.h = Math.max(520, rect.height); this.dpr = Math.min(2, window.devicePixelRatio || 1);
    [this.bg, this.gameCanvas, this.fxCanvas].forEach((canvas) => { canvas.width = Math.floor(this.w * this.dpr); canvas.height = Math.floor(this.h * this.dpr); canvas.style.width = `${this.w}px`; canvas.style.height = `${this.h}px`; });
    [this.bgCtx, this.ctx, this.fx].forEach((ctx) => ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0));
    this.drawBackground();
  }
  point(e) { const r = this.gameCanvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  setState(next) {
    this.state = next; document.body.dataset.state = next.toLowerCase(); document.documentElement.style.setProperty('--game-state', `'${next}'`);
    $('#titleScreen').classList.toggle('is-visible', next === STATES.TITLE);
    $('#tutorialScreen').classList.toggle('is-visible', next === STATES.TUTORIAL || next === STATES.COUNTDOWN);
    $('#hud').classList.toggle('is-visible', [STATES.PLAY, STATES.OVERFLOW].includes(next));
    $('#playControls').classList.toggle('is-visible', [STATES.PLAY, STATES.OVERFLOW].includes(next));
    $('#resultScreen').classList.toggle('is-visible', next === STATES.RESULT || next === STATES.TIMEUP);
    $('#overflowLayer').classList.toggle('is-visible', next === STATES.OVERFLOW);
    if (next === STATES.TITLE) { $('#titleScreen').classList.add('title-breathe'); this.updateTitleStats(); }
    if (next === STATES.PLAY) $('#titleScreen').classList.remove('title-breathe');
    if (next === STATES.RESULT) $('#resultScreen').classList.add('result-enter');
  }
  startTutorial() { if (this.state !== STATES.TITLE && this.state !== STATES.RESULT) return; this.sound.init(); this.tutorialStart = performance.now(); this.setState(STATES.TUTORIAL); $('#tutorialTimer').textContent = '4'; }
  startCountdown() { if (![STATES.TUTORIAL, STATES.COUNTDOWN].includes(this.state)) return; this.countdownStart = performance.now(); this.setState(STATES.COUNTDOWN); }
  startPlay() {
    if (![STATES.COUNTDOWN, STATES.TUTORIAL].includes(this.state)) return;
    this.resetGame(); this.setState(STATES.PLAY); this.sound.init(); this.sound.tone(196, 0.13, 'triangle', 0.08); this.spawnCard(TYPE.ESSENCE); this.spawnCard(TYPE.FAKE); this.spawnCard(TYPE.NOISE); this.updateHUD();
  }
  resetGame() {
    this.clock = 0; this.heartbeatClock = 0; this.timeLeft = CONFIG.PLAY_SECONDS; this.score = 0; this.combo = 0; this.bestRunCombo = 0; this.misses = 0; this.errors = 0; this.accepts = 0; this.rejects = 0; this.overflowGauge = 0; this.spawnClock = 0; this.overflowRemaining = 0; this.overflowStage = 0; this.guard = 0; this.guardUsed = false; this.reiBoost = 0; this.noMissTime = 0; this.rejectStreak = 0; this.contourMode = 0; this.special = { kuraishi: false, schrodinger: false, satou: false, katsuya: false, rei: false }; this.missionState = { reject: 0, errors: 0, rank: 0 }; this.rngState = this.seed; this.lastResultText = '';
    this.cards.forEach((card) => { card.active = false; }); this.crosses.forEach((c) => { c.active = false; }); this.stamps.forEach((s) => { s.active = false; });
  }
  difficulty() { const elapsed = CONFIG.PLAY_SECONDS - this.timeLeft; if (elapsed < 15) return CONFIG.SPAWN.easy; if (elapsed < 30) return CONFIG.SPAWN.medium; if (elapsed < 45) return CONFIG.SPAWN.hard; return CONFIG.SPAWN.rush; }
  currentMultiplier() { return Math.min(this.reiBoost > 0 ? CONFIG.MULTIPLIER.reiCap : CONFIG.MULTIPLIER.cap, CONFIG.MULTIPLIER.base + Math.floor(this.combo / CONFIG.MULTIPLIER.comboStep) * CONFIG.MULTIPLIER.comboAdd + (this.state === STATES.OVERFLOW ? CONFIG.SCORE.overflowBonus : 0)); }
  pickType() {
    const d = this.difficulty(); const r = this.rand();
    if (this.state === STATES.OVERFLOW) return this.rand() < 0.13 ? TYPE.SOUP : TYPE.ESSENCE;
    if (this.timeLeft < 30 && r < CONFIG.SKILLS.englishChance) return TYPE.ENGLISH;
    if (r < d.noise) return TYPE.NOISE;
    if (r < d.noise + d.feikatsu) return TYPE.FEIKATSU;
    if (r < d.noise + d.feikatsu + d.fake) return TYPE.FAKE;
    if (r < d.noise + d.feikatsu + d.fake + 0.035) return TYPE.SOUP;
    if (r < d.noise + d.feikatsu + d.fake + 0.05) return TYPE.RING;
    return TYPE.ESSENCE;
  }
  quoteFor(kind) {
    const type = kind === TYPE.ESSENCE ? 'typehonshitsu' : kind === TYPE.FAKE ? 'a_honshitsu' : kind === TYPE.NOISE ? 'noise' : kind === TYPE.FEIKATSU ? 'fake_katsu' : kind === TYPE.RING ? 'rare' : 'typehonshitsu';
    const list = quotes.filter((q) => q.type === type); return list[Math.floor(this.rand() * list.length)] || quotes[0];
  }
  spawnCard(forceType = null) {
    const d = this.difficulty(); const active = this.cards.filter((c) => c.active).length; if (active >= Math.min(5, Math.max(2, Math.ceil(d.simultaneous)))) return null;
    const card = this.cards.find((c) => !c.active); if (!card) return null;
    const kind = forceType || this.pickType(); const big = kind === TYPE.GIANT; card.active = true; card.kind = kind; card.quote = this.quoteFor(kind); card.hp = big ? 3 : 1; card.seed = this.rand(); card.born = this.clock; card.w = big ? Math.min(260, this.w * 0.62) : Math.min(220, Math.max(148, this.w * 0.42)); card.h = big ? 172 : 112; card.x = 18 + this.rand() * Math.max(20, this.w - card.w - 36); card.y = -card.h - this.rand() * 80; card.speed = (82 + this.rand() * 32) * d.speed * (this.slowFactor || 1); card.rotation = (this.rand() - 0.5) * 0.03; card.settled = false;
    if (kind === TYPE.GIANT) card.w = Math.min(280, this.w * 0.7);
    return card;
  }
  getTargetCard() { let target = null; for (const c of this.cards) if (c.active && (!target || c.y + c.h > target.y + target.h)) target = c; return target; }
  actionIsGood(card, action) { if (card.kind === TYPE.ESSENCE || card.kind === TYPE.SOUP || card.kind === TYPE.RING || card.kind === TYPE.ENGLISH || card.kind === TYPE.GIANT) return action === 'carve'; if (card.kind === TYPE.SCHRODINGER) return action === 'carve'; return action === 'reject'; }
  processCard(action, dragged = false) {
    if (![STATES.PLAY, STATES.OVERFLOW].includes(this.state)) return;
    if (this.state === STATES.PLAY && this.contourMode > 0 && dragged) action = 'carve';
    const card = this.getTargetCard(); if (!card) return;
    if (this.state === STATES.OVERFLOW) { this.claimOverflow(card); return; }
    if (card.kind === TYPE.GIANT && action === 'carve') { card.hp -= 1; this.sound.paper(); this.emitCross(card.x + card.w / 2, card.y + card.h / 2, CONFIG.COLORS.gold); if (card.hp > 0) { this.addStamp(`残り ${card.hp}`, card.x + card.w / 2, card.y); return; } }
    if (this.actionIsGood(card, action)) this.success(card); else this.fail(card);
  }
  claimOverflow(card) { if (!card.active) return; const x = card.x + card.w / 2; const y = card.y + card.h / 2; card.active = false; this.combo += 1; this.bestRunCombo = Math.max(this.bestRunCombo, this.combo); this.accepts += 1; const value = Math.round(CONFIG.SCORE.essence * this.currentMultiplier()); this.score += value; this.overflowGauge = clamp(this.overflowGauge + 0.035, 0, 1); this.emitCross(x, y, CONFIG.COLORS.gold); this.particles.emit(x, y, CONFIG.COLORS.gold, 12, 1); this.sound.hit(this.combo); this.updateHUD(); }
  success(card) {
    let points = CONFIG.SCORE.essence; let timeBonus = CONFIG.SCORE.hitTime; let color = CONFIG.COLORS.gold; let label = '刻印';
    if (card.kind === TYPE.SOUP) { points = 700; timeBonus = 3; label = '+3.0秒'; color = '#E5A45B'; }
    if (card.kind === TYPE.RING) { points = 1500; timeBonus = 0.8; label = '封印解除'; color = '#DDE8F4'; this.triggerSkill('meshino', '封印がほどけた'); }
    if (card.kind === TYPE.ENGLISH) { points = 900; timeBonus = 5; label = '+5.0s / NICE'; color = '#B7CBEC'; }
    if (card.kind === TYPE.SCHRODINGER) { if (this.rand() < 0.55) { points *= 2; label = '観測成功 ×2'; } else { card.active = false; this.fail(card, 2); return; } }
    if (card.kind === TYPE.GIANT) { points = 1800; timeBonus = 0; label = '原✝本質✝破壊'; }
    const multiplier = this.currentMultiplier(); this.score += Math.round(points * multiplier * (this.satouBoost ? 1.5 : 1)); this.timeLeft = Math.min(CONFIG.PLAY_SECONDS, this.timeLeft + timeBonus); this.combo += 1; this.bestRunCombo = Math.max(this.bestRunCombo, this.combo); this.accepts += 1; this.rejectStreak = 0; this.noMissTime += 0.18; this.overflowGauge = clamp(this.overflowGauge + CONFIG.OVERFLOW.fillPerHit, 0, 1); const x = card.x + card.w / 2; const y = card.y + card.h / 2; card.active = false; this.emitCross(x, y, color); this.particles.emit(x, y, color, this.prefersReducedMotion() ? 5 : 14, 0); this.addStamp(label, x, y, color); this.sound.hit(this.combo); if (card.kind === TYPE.SOUP) this.sound.tone(110, 0.07, 'square', 0.05); if (this.combo > 0 && this.combo % CONFIG.SKILLS.ryomaCombo === 0) this.triggerRyoma(); this.updateHUD();
  }
  fail(card, factor = 1) {
    const x = card.x + card.w / 2; const y = card.y + card.h / 2;
    if (this.guard > 0 && !this.guardUsed) { this.guardUsed = true; this.guard = 0; this.addStamp('やめろ', x, y, CONFIG.COLORS.crimson); this.triggerSkill('mie', 'やめろ'); card.active = false; this.sound.reject(); return; }
    this.errors += 1; this.missionState.errors += 1; this.misses += factor; this.combo = 0; this.bestRunCombo = Math.max(this.bestRunCombo, this.combo); this.rejectStreak = 0; this.noMissTime = 0; this.timeLeft -= CONFIG.SCORE.errorTime * factor; this.overflowGauge = clamp(this.overflowGauge * (1 - CONFIG.OVERFLOW.errorDrain), 0, 1); card.active = false; this.shake = CONFIG.FEEL.shake; this.addStamp('は？', x, y, CONFIG.COLORS.crimson); this.particles.emit(x, y, CONFIG.COLORS.crimson, 22, 0); this.sound.error(); this.updateHUD();
  }
  rejectCard(card) {
    const x = card.x + card.w / 2; const y = card.y + card.h / 2; card.active = false; this.rejects += 1; this.rejectStreak += 1; this.missionState.reject += 1; this.combo += 1; this.bestRunCombo = Math.max(this.bestRunCombo, this.combo); this.noMissTime += 0.18; this.overflowGauge = clamp(this.overflowGauge + 0.08, 0, 1); this.emitCross(x, y, CONFIG.COLORS.muted); this.particles.emit(x, y, CONFIG.COLORS.muted, 8, 0); this.addStamp('は？ 成功', x, y, CONFIG.COLORS.muted); this.timeLeft = Math.min(CONFIG.PLAY_SECONDS, this.timeLeft + CONFIG.SCORE.rejectTime); this.sound.reject(); if (this.rejectStreak >= CONFIG.SKILLS.mieRejects) this.triggerMie(); this.updateHUD();
  }
  // Re-route reject versus carve so the target card remains the only target.
  successOrReject(card, action) { if (this.actionIsGood(card, action)) this.success(card); else if (action === 'reject' && !this.actionIsGood(card, 'carve')) this.rejectCard(card); else this.fail(card); }
  emitCross(x, y, color = CONFIG.COLORS.gold) { const cross = this.crosses.find((c) => !c.active); if (!cross) return; cross.active = true; cross.x = x; cross.y = y; cross.life = 0; cross.max = CONFIG.FEEL.crossSeconds; cross.color = color; }
  addStamp(text, x, y, color = '#fff') { const stamp = this.stamps.find((s) => !s.active); if (!stamp) return; stamp.active = true; stamp.text = text; stamp.x = x; stamp.y = y; stamp.life = 0; stamp.max = 0.52; stamp.color = color; }
  triggerRyoma() { this.triggerSkill('ryoma', 'これまじ✝本質✝'); this.sound.tone(660, 0.16, 'triangle', 0.07); for (const c of this.cards) if (c.active && (c.kind === TYPE.ESSENCE || c.kind === TYPE.SOUP)) { this.emitCross(c.x + c.w * 0.5, c.y + c.h * 0.5); this.score += 35; } }
  triggerMie() { this.guard = CONFIG.SKILLS.mieGuardSeconds; this.guardUsed = false; this.rejectStreak = 0; this.triggerSkill('mie', 'やめろ'); }
  triggerSkill(id, text) { const c = this.characters[id]; if (!c) return; const banner = $('#skillBanner'); banner.querySelector('.skill-name').textContent = c.name; banner.querySelector('.skill-line').textContent = text; banner.querySelector('img').src = c.standing || c.icon || ''; banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show'); window.setTimeout(() => banner.classList.remove('show'), 980); }
  startOverflow() {
    if (this.state !== STATES.PLAY || this.overflowGauge < 0.99) return;
    this.state = STATES.OVERFLOW; this.overflowRemaining = CONFIG.OVERFLOW.seconds; this.overflowStage = 1; this.shake = CONFIG.OVERFLOW.shake; this.overflowGauge = 0; this.sound.overflow(); this.setState(STATES.OVERFLOW); this.triggerSkill('terachi', '紙に数字を書いている'); this.particles.emit(this.w / 2, this.h / 2, CONFIG.COLORS.gold, this.prefersReducedMotion() ? 12 : 40, 1); this.updateHUD();
  }
  endOverflow() { this.setState(STATES.PLAY); this.overflowRemaining = 0; this.overflowStage = 0; this.updateHUD(); }
  triggerContour() { this.special.katsuya = true; this.contourMode = CONFIG.SKILLS.contourSeconds; this.triggerSkill('katsuya', '等高線モード'); this.addStamp('なぞり斬り', this.w / 2, this.h * 0.36, CONFIG.COLORS.chalk); }
  triggerRei() { this.special.rei = true; this.reiBoost = CONFIG.MULTIPLIER.reiSeconds; this.triggerSkill('rei', '面白い'); this.addStamp('×10 ライン', this.w * 0.5, this.h * 0.22, '#B9D8F2'); }
  triggerSpecials(dt) {
    const elapsed = CONFIG.PLAY_SECONDS - this.timeLeft;
    if (!this.special.katsuya && this.timeLeft <= 30 && this.timeLeft > 29.94) this.triggerContour();
    if (!this.special.rei && this.noMissTime >= CONFIG.SKILLS.reiCleanSeconds) this.triggerRei();
    if (!this.special.satou && elapsed > 18 && this.rand() < 0.0015) { this.special.satou = true; this.satouBoost = true; this.slowFactor = CONFIG.FEEL.slowFactor; this.triggerSkill('satou', '見てない'); this.addStamp('0.5倍速 / ×1.5', this.w * 0.5, this.h * 0.28, CONFIG.COLORS.gold); window.setTimeout(() => { this.satouBoost = false; this.slowFactor = 1; }, CONFIG.SKILLS.satouSeconds * 1000); }
    if (!this.special.kuraishi && elapsed >= CONFIG.SKILLS.kuraishiAt) { this.special.kuraishi = true; if (this.rand() > 0.18) { this.spawnCard(TYPE.GIANT); this.triggerSkill('kuraishi', '原✝本質✝、降臨'); } }
    if (!this.special.schrodinger && elapsed >= CONFIG.SKILLS.schrodingerAt) { this.special.schrodinger = true; if (this.rand() > 0.15) { const c = this.spawnCard(TYPE.SCHRODINGER); if (c) this.triggerSkill('sakura', '観測しないで'); } }
    if (this.guard > 0) this.guard = Math.max(0, this.guard - dt);
    if (this.reiBoost > 0) this.reiBoost = Math.max(0, this.reiBoost - dt);
    if (this.contourMode > 0) this.contourMode = Math.max(0, this.contourMode - dt);
  }
  updateCards(dt) {
    const targetY = this.h - CONFIG.TARGET_MARGIN;
    for (const c of this.cards) {
      if (!c.active) continue;
      const curve = this.contourMode > 0 ? Math.sin((c.y + this.clock * 75) * 0.018) * this.w * 0.11 : 0;
      if (this.contourMode > 0) c.x = clamp(c.x + (this.w / 2 + curve - c.w / 2 - c.x) * dt * 3.2, 8, this.w - c.w - 8);
      c.y += c.speed * dt * (this.state === STATES.OVERFLOW ? 0.62 : 1);
      if (this.state === STATES.OVERFLOW && c.y > this.h + 20) c.active = false;
      if (this.state === STATES.PLAY && c.y + c.h > this.h + 12) { if (c.kind === TYPE.ESSENCE || c.kind === TYPE.SOUP || c.kind === TYPE.RING || c.kind === TYPE.ENGLISH || c.kind === TYPE.GIANT) this.missCard(c); else c.active = false; }
      if (c.y + c.h > targetY && !c.settled) c.settled = true;
    }
  }
  missCard(card) { const x = card.x + card.w / 2; const y = card.y + card.h / 2; card.active = false; this.misses += 1; this.noMissTime = 0; this.combo = 0; this.timeLeft -= CONFIG.SCORE.missTime; this.addStamp('取りこぼし −0.50', x, y, '#D7B7A1'); this.particles.emit(x, y, '#D7B7A1', 8, 0); this.updateHUD(); }
  update(dt) {
    if (this.state === STATES.TUTORIAL) { const t = (this.now - this.tutorialStart) / 1000; $('#tutorialTimer').textContent = `${Math.max(0, Math.ceil(CONFIG.TUTORIAL_SECONDS - t))}`; if (t >= CONFIG.TUTORIAL_SECONDS) this.startCountdown(); }
    if (this.state === STATES.COUNTDOWN) { const t = (this.now - this.countdownStart) / 1000; const count = t < 0.53 ? '3' : t < 1.06 ? '2' : t < 1.42 ? '1' : '✝'; $('#countNumber').textContent = count; if (t >= CONFIG.COUNTDOWN_SECONDS) this.startPlay(); }
    if (this.state === STATES.PLAY || this.state === STATES.OVERFLOW) {
      this.clock += dt; if (this.state === STATES.PLAY || this.state === STATES.OVERFLOW) this.sound.setBgmMode(this.state === STATES.OVERFLOW ? 'overflow' : this.timeLeft <= 10 ? 'rush' : 'normal'); if (this.state === STATES.PLAY) { const speed = this.slowFactor || 1; this.timeLeft -= dt * speed; this.noMissTime += dt; this.heartbeatClock += dt; if (this.timeLeft <= 10 && this.heartbeatClock > 0.72) { this.heartbeatClock = 0; this.sound.tone(94, 0.12, 'sine', 0.045); } if (this.timeLeft <= 0) { this.timeLeft = 0; this.finishPlay(); return; } }
      this.spawnClock += dt * (this.state === STATES.OVERFLOW ? 1.8 : 1); const d = this.difficulty(); if (this.spawnClock >= d.interval) { this.spawnClock = 0; this.spawnCard(); }
      this.updateCards(dt); this.triggerSpecials(dt); if (this.state === STATES.OVERFLOW) { this.overflowRemaining -= dt; this.overflowStage = Math.min(3, Math.floor((CONFIG.OVERFLOW.seconds - this.overflowRemaining) / 2.3) + 1); if (this.overflowRemaining <= 0) this.endOverflow(); }
      this.particles.update(dt, this.w / 2, this.h * 0.44); this.updateFx(dt); this.shake = Math.max(0, this.shake - dt * 22); this.updateHUD();
    } else { this.particles.update(dt, this.w / 2, this.h * 0.44); this.updateFx(dt); this.shake = Math.max(0, this.shake - dt * 22); }
    if (this.state === STATES.TIMEUP) { this.resultClock += dt; if (this.resultClock >= 0.42) this.showResult(); }
    if (this.debug) { $('#debugState').textContent = `${this.state} / ${this.difficulty().speed.toFixed(2)}x`; $('#debugFps').textContent = `${this.fps.toFixed(0)} fps`; }
  }
  updateFx(dt) { for (const c of this.crosses) if (c.active) { c.life += dt; if (c.life >= c.max) c.active = false; } for (const s of this.stamps) if (s.active) { s.life += dt; s.y -= dt * 24; if (s.life >= s.max) s.active = false; } }
  finishPlay() { this.cards.forEach((c) => { if (c.active) c.y = lerp(c.y, this.h * 0.47, 0.35); }); this.setState(STATES.TIMEUP); this.resultClock = 0; this.sound.tone(110, 0.4, 'sine', 0.06); }
  showResult() {
    if (this.state === STATES.RESULT) return; this.setState(STATES.RESULT); this.resultClock = 0.5; const rank = this.rank(); const previous = this.high; const best = this.score > previous; if (best) { this.high = this.score; localStorage.setItem(STORAGE.high, String(this.high)); this.addStamp('自己ベスト更新', this.w * 0.5, this.h * 0.32, CONFIG.COLORS.gold); this.sound.tone(523, 0.15, 'triangle', 0.08); this.sound.tone(659, 0.24, 'triangle', 0.08, 0.16); }
    this.bestCombo = Math.max(this.bestCombo, this.bestRunCombo); localStorage.setItem(STORAGE.bestCombo, String(this.bestCombo)); this.unlockAfterPlay(); this.missionState.rank = rank.value; this.renderResult(rank, best); this.sound.stop();
  }
  skipResult() { if (this.state === STATES.TIMEUP) this.showResult(); }
  unlockAfterPlay() { const candidates = quotes.filter((q) => !this.quoteUnlocks.has(q.id)); for (let i = 0; i < Math.min(3, candidates.length); i += 1) this.quoteUnlocks.add(candidates[Math.floor(this.rand() * candidates.length)].id); this.saveUnlocks(); }
  rank() {
    const value = this.debugRank ?? (60 + 40 * (1 - Math.exp(-this.score / 45000))); let label = '非✝本質✝'; if (value >= 100) label = '✝'; else if (value >= 86) label = '前-原✝本質✝'; else if (value >= 85) label = '数理零ライン'; else if (value >= 75) label = '原✝本質✝'; else if (value >= 70) label = '✝本質✝'; else if (value >= 65) label = '亜✝本質✝'; return { value, label, integer: Math.floor(value) };
  }
  renderResult(rank, best) {
    $('#resultRank').textContent = rank.integer >= 100 ? '100' : rank.integer.toString(); $('#resultTitle').textContent = rank.label; $('#resultScore').textContent = this.score.toLocaleString('ja-JP'); $('#resultCombo').textContent = `コンボ最高 ${this.bestRunCombo}`; $('#resultErrors').textContent = `誤爆 ${this.errors}回 / 取りこぼし ${this.misses}回`; $('#resultBest').textContent = best ? '自己ベスト更新' : `BEST ${this.high.toLocaleString('ja-JP')}`; $('#resultThread').textContent = this.makeThread(rank); $('#resultScreen').dataset.rank = rank.integer; $('#resultScreen').classList.toggle('is-new-best', best); $('#resultScreen').classList.toggle('is-ultimate', rank.integer >= 100); $('#missionResult').innerHTML = this.missions.map((m) => `<span class="mission-chip ${this.missionDone(m) ? 'done' : ''}">${this.missionDone(m) ? '✓' : '○'} ${m.label}</span>`).join('');
  }
  makeThread(rank) { let n = Number(localStorage.getItem(STORAGE.reply) || 522) + 1; localStorage.setItem(STORAGE.reply, String(n)); return `${n} 名無しの地形図好き：偏差値${rank.integer}。コンボ最高${this.bestRunCombo}。誤爆${this.errors}回。これまじ✝本質✝。✝`; }
  missionDone(m) { if (m.id === 'reject') return this.missionState.reject >= m.target; if (m.id === 'clean') return this.errors === 0; return this.rank().value >= m.target; }
  updateTitleStats() { $('#titleHigh').textContent = `BEST ${this.high.toLocaleString('ja-JP').padStart(4, '0')}`; $('#titleMissions').innerHTML = this.missions.map((m) => `<span>${m.label}</span>`).join(''); this.updateMuteLabel(); }
  updateHUD() {
    if (!this.timeLeft && ![STATES.PLAY, STATES.OVERFLOW].includes(this.state)) return; const rank = this.rank(); $('#timeValue').textContent = formatTime(this.timeLeft ?? 60); $('#scoreValue').textContent = this.score.toLocaleString('ja-JP'); $('#rankValue').textContent = rank.integer; $('#rankName').textContent = rank.label; $('#comboValue').textContent = this.combo; $('#multiplierValue').textContent = `×${this.currentMultiplier().toFixed(1)}`; $('#overflowFill').style.width = `${Math.round(this.overflowGauge * 100)}%`; $('#overflowButton').disabled = this.state !== STATES.PLAY || this.overflowGauge < 0.99; $('#overflowButton').classList.toggle('is-ready', this.overflowGauge >= 0.99); $('#overflowValue').textContent = `${Math.round(this.overflowGauge * 100)}%`; $('#guardValue').textContent = this.guard > 0 ? `は？GUARD ${this.guard.toFixed(1)}` : this.reiBoost > 0 ? '零 ×10' : this.contourMode > 0 ? '等高線' : '';
    $('#timeValue').classList.toggle('danger', this.timeLeft <= 10); $('#comboBox').classList.toggle('pop', this.combo > 0); $('#missionLive').innerHTML = `<span>は？ ${this.missionState.reject}/20</span><span>誤爆 ${this.errors}</span><span>零 ${this.noMissTime.toFixed(0)}s</span>`;
  }
  openCollection() { const open = quotes.filter((q) => this.quoteUnlocks.has(q.id)); $('#collectionCount').textContent = `${open.length} / ${quotes.length}`; $('#collectionGrid').innerHTML = open.sort((a, b) => a.id.localeCompare(b.id)).map((q) => `<article class="quote-card"><div class="quote-head"><div class="quote-type">${q.type === 'typehonshitsu' ? '✝本質✝' : q.type === 'a_honshitsu' ? '亜✝本質✝' : q.type === 'fake_katsu' ? 'フェイカツ' : q.type === 'noise' ? 'NOISE' : 'RARE'}</div>${this.characterIcon(q.speaker)}</div><p>「${q.text}」</p><footer>${q.speaker} / ${q.source}</footer></article>`).join(''); $('#collectionModal').classList.add('is-open'); }
  characterIcon(speaker) { const c = characters.find((item) => item.display === speaker || item.name === speaker); return c?.icon ? `<img class=\"quote-icon\" src=\"${c.icon}\" alt=\"${c.name}\">` : '<span class=\"quote-icon quote-icon-fallback\">✝</span>'; }
  async copyResult() { const text = $('#resultThread').textContent; try { await navigator.clipboard.writeText(text); } catch { const area = document.createElement('textarea'); area.value = text; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove(); } $('#resultCopyButton').textContent = 'コピー済み'; window.setTimeout(() => { $('#resultCopyButton').textContent = 'レスをコピー'; }, 1200); }
  prefersReducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  drawBackground() {
    const c = this.bgCtx, w = this.w, h = this.h; c.save(); c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, w, h);
    const wall = c.createLinearGradient(0, 0, 0, h); wall.addColorStop(0, '#647267'); wall.addColorStop(0.46, '#536354'); wall.addColorStop(1, '#32392F'); c.fillStyle = wall; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(247,245,238,.11)'; c.fillRect(0, 20, w, 3); c.fillStyle = 'rgba(247,245,238,.08)'; c.fillRect(0, 24, w, 1);
    // board and fluorescent light
    c.fillStyle = '#26342C'; c.strokeStyle = '#1A1A22'; c.lineWidth = 5; c.fillRect(w * 0.06, h * 0.10, w * 0.56, h * 0.26); c.strokeRect(w * 0.06, h * 0.10, w * 0.56, h * 0.26);
    c.strokeStyle = 'rgba(217,226,206,.28)'; c.lineWidth = 1.2; for (let i = 0; i < 6; i += 1) { c.beginPath(); for (let x = w * 0.08; x < w * 0.59; x += 12) { const y = h * 0.14 + i * 25 + Math.sin(x * 0.012 + i) * 4; if (x === w * 0.08) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke(); }
    c.fillStyle = '#F7F5EE'; c.shadowColor = 'rgba(247,245,238,.32)'; c.shadowBlur = 22; c.fillRect(w * 0.23, h * 0.045, w * 0.36, 8); c.shadowBlur = 0; c.fillStyle = '#D7D8CE'; c.fillRect(w * 0.23, h * 0.043, w * 0.36, 2);
    // windows / outside glow
    const windowX = w * 0.68; c.fillStyle = '#B9CED0'; c.fillRect(windowX, h * 0.105, w * 0.27, h * 0.25); c.strokeStyle = '#1A1A22'; c.lineWidth = 5; c.strokeRect(windowX, h * 0.105, w * 0.27, h * 0.25); c.strokeStyle = 'rgba(26,26,34,.55)'; c.lineWidth = 3; c.beginPath(); c.moveTo(windowX + w * 0.135, h * 0.105); c.lineTo(windowX + w * 0.135, h * 0.355); c.moveTo(windowX, h * 0.23); c.lineTo(w * 0.95, h * 0.23); c.stroke();
    c.fillStyle = '#D8C78D'; c.beginPath(); c.arc(windowX + w * 0.215, h * 0.17, 14, 0, Math.PI * 2); c.fill();
    // vending machine / empty soup slot
    c.fillStyle = '#222932'; c.fillRect(w * 0.035, h * 0.41, w * 0.12, h * 0.28); c.strokeStyle = '#11151B'; c.strokeRect(w * 0.035, h * 0.41, w * 0.12, h * 0.28); c.fillStyle = '#8C2F3A'; c.fillRect(w * 0.055, h * 0.455, w * 0.08, 20); c.fillStyle = '#F2C14E'; c.font = '700 9px sans-serif'; c.fillText('売 切', w * 0.07, h * 0.50); for (let i = 0; i < 4; i += 1) { c.fillStyle = i === 2 ? '#34414A' : '#C2CAC2'; c.fillRect(w * 0.055 + (i % 2) * 38, h * 0.56 + Math.floor(i / 2) * 32, 28, 20); }
    // tile floor
    const floorTop = h * 0.58; c.fillStyle = '#4B554B'; c.fillRect(0, floorTop, w, h - floorTop); c.strokeStyle = 'rgba(26,26,34,.36)'; c.lineWidth = 1; for (let y = floorTop; y < h; y += 42) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } for (let x = -w; x < w * 2; x += 62) { c.beginPath(); c.moveTo(w / 2, floorTop); c.lineTo(x, h); c.stroke(); }
    // subtle leak marks on the title wall
    c.font = '700 18px Georgia'; c.fillStyle = 'rgba(242,193,78,.30)'; c.fillText('✝', w * 0.19, floorTop - 12); c.fillText('✝', w * 0.50, floorTop + 8); c.fillText('✝', w * 0.63, h * 0.53); c.restore();
  }
  drawCard(c, card) {
    const isOverflow = this.state === STATES.OVERFLOW; const x = card.x; const y = card.y; const w = card.w; const h = card.h; const cx = x + w / 2; const cy = y + h / 2; const rot = card.rotation + Math.sin(this.clock * 2.2 + card.seed * 9) * 0.008;
    c.save(); c.translate(cx, cy); c.rotate(rot); c.translate(-w / 2, -h / 2); c.shadowColor = 'rgba(15,18,20,.48)'; c.shadowBlur = 13; c.shadowOffsetY = 7;
    if (isOverflow) {
      this.drawPaper(c, card, x, y, w, h, true);
    } else {
      if (card.kind === TYPE.ESSENCE || card.kind === TYPE.SOUP || card.kind === TYPE.RING || card.kind === TYPE.ENGLISH || card.kind === TYPE.GIANT) this.drawPaper(c, card, x, y, w, h, false);
      if (card.kind === TYPE.FAKE) this.drawFake(c, card, w, h);
      if (card.kind === TYPE.NOISE) this.drawNoise(c, card, w, h);
      if (card.kind === TYPE.FEIKATSU) this.drawFei(c, card, w, h);
      if (card.kind === TYPE.SOUP) this.drawSoup(c, card, w, h);
      if (card.kind === TYPE.RING) this.drawRing(c, card, w, h);
      if (card.kind === TYPE.GIANT) { c.strokeStyle = '#F2C14E'; c.lineWidth = 5; c.strokeRect(3, 3, w - 6, h - 6); this.atlas.draw(c, '原✝本質✝', w / 2, h * 0.62, '900 25px sans-serif', '#1A1A22', 'center'); this.atlas.draw(c, `耐久 ${card.hp}`, w / 2, h * 0.82, '800 13px sans-serif', '#8C2F3A', 'center'); }
      if (card.kind === TYPE.SCHRODINGER) this.drawSchrodinger(c, card, w, h);
      if (card.kind === TYPE.ENGLISH) { c.fillStyle = '#22355B'; c.fillRect(12, 12, w - 24, 22); this.atlas.draw(c, 'ENGLISH CARD', w / 2, 23, '800 11px sans-serif', '#F7F5EE', 'center'); }
    }
    c.restore();
    if (card.settled && !isOverflow) { c.save(); c.strokeStyle = 'rgba(242,193,78,.32)'; c.lineWidth = 2; c.setLineDash([4, 5]); c.beginPath(); c.arc(cx, Math.min(this.h - 72, y + h + 12), 28, 0, Math.PI * 2); c.stroke(); c.restore(); }
    if (this.debug && card.active) { c.save(); c.strokeStyle = 'rgba(255,98,98,.9)'; c.lineWidth = 1; c.setLineDash([3, 3]); c.strokeRect(x, y, w, h); c.setLineDash([]); c.font = '9px monospace'; c.fillStyle = '#FF8C79'; c.fillText(card.kind, x + 4, y - 4); c.restore(); }
  }
  drawPaper(c, card, x, y, w, h, overflow = false) {
    c.shadowColor = 'rgba(15,18,20,.28)'; c.shadowBlur = 12; c.shadowOffsetY = 6; c.fillStyle = '#F7F5EE'; c.fillRect(2, 2, w - 4, h - 4); c.shadowColor = 'transparent'; c.fillStyle = '#D7D3C7'; c.fillRect(3, h - 3, w - 6, 2); c.strokeStyle = overflow ? '#F2C14E' : '#1A1A22'; c.lineWidth = overflow ? 5 : 3; c.strokeRect(2, 2, w - 4, h - 4); if (!overflow) { c.shadowColor = 'rgba(242,193,78,.85)'; c.shadowBlur = 15; c.strokeStyle = '#F2C14E'; c.lineWidth = 2; c.strokeRect(7, 7, w - 14, h - 14); c.shadowBlur = 0; }
    c.strokeStyle = 'rgba(35,52,91,.16)'; c.lineWidth = 1; for (let iy = 38; iy < h - 16; iy += 18) { c.beginPath(); c.moveTo(14, iy); c.lineTo(w - 14, iy); c.stroke(); }
    c.fillStyle = '#1A1A22'; this.atlas.draw(c, overflow ? '✝本質✝' : card.kind === TYPE.ENGLISH ? '✝' : '✝', 16, 18, '900 17px Georgia', '#1A1A22');
    this.wrapText(c, overflow ? '✝本質✝' : (card.quote?.text || 'これまじ✝本質✝'), 16, h * 0.48, w - 32, 18, '#1A1A22', '800 15px sans-serif');
  }
  drawFake(c, card, w, h) { c.shadowColor = 'rgba(15,18,20,.20)'; c.fillStyle = '#F1F1EC'; c.fillRect(2, 2, w - 4, h - 4); c.strokeStyle = '#8E948D'; c.lineWidth = 3; c.setLineDash([5, 4]); c.strokeRect(3, 3, w - 6, h - 6); c.setLineDash([]); c.fillStyle = 'rgba(50,60,55,.08)'; c.fillRect(12, 35, w - 24, 10); this.atlas.draw(c, '亜✝本質✝', w / 2, h * 0.55, '900 18px sans-serif', '#626B63', 'center'); this.wrapText(c, card.quote?.text || '説明してよ', 16, h * 0.76, w - 32, 15, '#6C726E', '700 12px sans-serif'); }
  drawNoise(c, card, w, h) { c.fillStyle = '#925247'; c.fillRect(2, 2, w - 4, h - 4); c.strokeStyle = '#1A1A22'; c.lineWidth = 3; c.strokeRect(2, 2, w - 4, h - 4); c.fillStyle = '#D7AE99'; c.fillRect(10, 12, w - 20, 16); this.atlas.draw(c, 'まとめサイト', 18, 20, '800 10px sans-serif', '#4C2624'); c.fillStyle = '#F4D7C3'; c.fillRect(12, 38, w - 24, 9); c.fillRect(12, 54, w - 48, 9); c.fillStyle = '#3E282B'; this.wrapText(c, card.quote?.text || '業者が補充しただけ', 15, h * 0.76, w - 30, 15, '#FFF1E8', '800 12px sans-serif'); }
  drawFei(c, card, w, h) { c.shadowColor = 'rgba(242,193,78,.75)'; c.shadowBlur = 11; c.fillStyle = '#F7F5EE'; c.fillRect(2, 2, w - 4, h - 4); c.shadowBlur = 0; c.strokeStyle = '#D09E38'; c.lineWidth = 3; c.strokeRect(3, 3, w - 6, h - 6); this.atlas.draw(c, '†', 16, 18, '900 20px serif', '#1A1A22'); this.atlas.draw(c, 'フェイカツ', w / 2, h * 0.48, '900 18px sans-serif', '#8C2F3A', 'center'); this.wrapText(c, card.quote?.text || '偏差値は等高線の一本', 14, h * 0.72, w - 28, 14, '#4F4141', '700 11px sans-serif'); }
  drawSoup(c, card, w, h) { c.save(); c.translate(w / 2, h * 0.56); c.fillStyle = '#D9783C'; c.strokeStyle = '#1A1A22'; c.lineWidth = 3; c.beginPath(); c.ellipse(0, -25, 30, 9, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillRect(-30, -25, 60, 54); c.beginPath(); c.ellipse(0, 29, 30, 9, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = '#F7E09E'; c.fillRect(-23, -1, 46, 19); this.atlas.draw(c, 'CORN', 0, 8, '900 10px sans-serif', '#8C2F3A', 'center'); c.strokeStyle = 'rgba(247,245,238,.68)'; c.lineWidth = 3; c.beginPath(); c.moveTo(-9, -38); c.bezierCurveTo(-20, -52, 4, -53, -6, -68); c.moveTo(8, -37); c.bezierCurveTo(20, -50, 0, -54, 12, -67); c.stroke(); c.restore(); }
  drawRing(c, card, w, h) { c.fillStyle = '#DDE8F4'; c.strokeStyle = '#1A1A22'; c.lineWidth = 3; c.beginPath(); c.arc(w / 2, h * 0.54, 28, 0, Math.PI * 2); c.stroke(); c.strokeStyle = '#FFFFFF'; c.lineWidth = 8; c.beginPath(); c.arc(w / 2, h * 0.54, 25, 0, Math.PI * 2); c.stroke(); this.atlas.draw(c, '封印リング', w / 2, h * 0.86, '800 12px sans-serif', '#22355B', 'center'); }
  drawSchrodinger(c, card, w, h) { c.save(); c.globalAlpha = 0.62; c.fillStyle = '#F7F5EE'; c.strokeStyle = '#8CB7D9'; c.lineWidth = 3; c.fillRect(10, 10, w - 22, h - 20); c.strokeRect(10, 10, w - 22, h - 20); c.translate(14, -3); c.fillStyle = '#FFF8E7'; c.fillRect(10, 10, w - 22, h - 20); c.strokeStyle = '#A8B7D7'; c.strokeRect(10, 10, w - 22, h - 20); c.restore(); this.atlas.draw(c, '観測？', w / 2, h * 0.56, '900 20px sans-serif', '#22355B', 'center'); this.wrapText(c, 'シュレディンガーの好意', 14, h * 0.80, w - 28, 13, '#22355B', '700 11px sans-serif'); }
  wrapText(c, text, x, y, maxWidth, lineHeight, color, font) { c.save(); c.font = font; c.fillStyle = color; c.textBaseline = 'middle'; const parts = String(text).split(''); let line = ''; let row = 0; for (const ch of parts) { const test = line + ch; if (c.measureText(test).width > maxWidth && line) { c.fillText(line, x, y + row * lineHeight); line = ch; row += 1; if (row > 2) break; } else line = test; } if (row <= 2 && line) c.fillText(line, x, y + row * lineHeight); c.restore(); }
  drawCrosses(c) {
    c.save(); c.lineCap = 'round';
    for (const cross of this.crosses) {
      if (!cross.active) continue;
      const t = clamp(cross.life / cross.max, 0, 1); const ease = easeOutBack(t); const a = 1 - t; const size = 19 * ease; c.globalAlpha = a; c.strokeStyle = cross.color; c.shadowColor = cross.color; c.shadowBlur = 8; c.lineWidth = 4.5; c.beginPath(); c.moveTo(cross.x - size, cross.y); c.lineTo(cross.x + size, cross.y); c.moveTo(cross.x, cross.y - size); c.lineTo(cross.x, cross.y + size); c.stroke(); c.shadowBlur = 0; c.lineWidth = 1.8; c.globalAlpha = a * 0.72; c.strokeStyle = '#1A1A22'; c.beginPath(); c.moveTo(cross.x - size * 0.6, cross.y); c.lineTo(cross.x + size * 0.6, cross.y); c.moveTo(cross.x, cross.y - size * 0.62); c.lineTo(cross.x, cross.y + size * 0.62); c.stroke();
    }
    c.restore();
  }
  drawStamps(c) {
    c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const s of this.stamps) {
      if (!s.active) continue;
      const t = clamp(s.life / s.max, 0, 1); const scale = t < 0.14 ? lerp(1.25, 0.9, t / 0.14) : 0.9 + Math.min(0.1, (t - 0.14) * 0.35); c.translate(s.x, s.y); c.scale(scale, scale); c.rotate((1 - t) * -0.05); c.globalAlpha = Math.min(1, s.life * 18) * (1 - Math.max(0, t - 0.72) / 0.28); c.fillStyle = 'rgba(26,26,34,.9)'; c.strokeStyle = 'rgba(247,245,238,.8)'; c.lineWidth = 4; c.font = '900 18px sans-serif'; c.strokeText(s.text, 0, 0); c.fillStyle = s.color; c.fillText(s.text, 0, 0); c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    c.restore();
  }
  drawContourGuide(c) {
    if (this.contourMode <= 0) return;
    c.save(); c.globalAlpha = 0.45; c.strokeStyle = CONFIG.COLORS.chalk; c.lineWidth = 2; c.setLineDash([7, 8]);
    for (let ring = 0; ring < 4; ring += 1) { c.beginPath(); for (let x = -20; x < this.w + 20; x += 12) { const y = this.h * (0.30 + ring * 0.13) + Math.sin(x * 0.02 + this.clock * 2 + ring) * 13; if (x < 0) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke(); }
    this.atlas.draw(c, '等高線 MODE', this.w - 18, 70, '900 12px monospace', CONFIG.COLORS.chalk, 'right'); c.restore();
  }
  drawOverflow(c) {
    if (this.state !== STATES.OVERFLOW) return;
    const stage = this.overflowStage; const alpha = (0.10 + stage * 0.04) * CONFIG.OVERFLOW.flash; c.save(); c.globalAlpha = alpha; c.fillStyle = stage >= 3 ? '#182335' : stage === 2 ? '#5D6A56' : '#273329'; c.fillRect(0, 0, this.w, this.h);
    c.globalAlpha = CONFIG.FEEL.bloom * 0.57; c.strokeStyle = stage >= 2 ? '#F2C14E' : '#D9E2CE'; c.lineWidth = stage === 3 ? 1 : 3; for (let i = 0; i < 8; i += 1) { c.beginPath(); c.arc(this.w * 0.50, this.h * 0.50, 60 + i * 38 + Math.sin(this.clock * 2 + i) * 4, 0, Math.PI * 2); c.stroke(); } c.globalAlpha = 0.8; this.atlas.draw(c, stage === 1 ? '壁が剥がれる' : stage === 2 ? '地層 → 等高線' : '夜空と桜', this.w / 2, this.h * 0.23, '900 15px sans-serif', CONFIG.COLORS.gold, 'center'); c.restore();
  }
  draw() {
    const c = this.ctx; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, this.w, this.h);
    const fx = this.fx; fx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); fx.clearRect(0, 0, this.w, this.h);
    const shake = this.prefersReducedMotion() ? 0 : this.shake; const sx = shake ? (Math.random() - 0.5) * shake : 0; const sy = shake ? (Math.random() - 0.5) * shake : 0;
    c.save(); c.translate(sx, sy); this.drawOverflow(c); this.drawContourGuide(c); for (const card of this.cards) if (card.active) this.drawCard(c, card); c.restore();
    fx.save(); fx.translate(sx, sy); this.particles.draw(fx); this.drawCrosses(fx); this.drawStamps(fx); fx.restore();
    if (this.state === STATES.OVERFLOW) { $('#overflowLayer').dataset.stage = String(this.overflowStage); $('#overflowClock').textContent = this.overflowRemaining.toFixed(2); }
  }
  loop(timestamp) {
    this.now = timestamp; if (!this.last) this.last = timestamp; const dt = Math.min(CONFIG.MAX_DELTA, Math.max(0, (timestamp - this.last) / 1000)); this.last = timestamp; this.fps = lerp(this.fps, 1 / Math.max(dt, 0.001), 0.06); this.update(dt); this.draw(); requestAnimationFrame((t) => this.loop(t));
  }
}

// Keep the frequent action path deliberately tiny: the visible target is always the lowest card.
Game.prototype.processCard = function patchedProcessCard(action, dragged = false) {
  if (![STATES.PLAY, STATES.OVERFLOW].includes(this.state)) return;
  if (this.state === STATES.PLAY && this.contourMode > 0 && dragged) action = 'carve';
  const card = this.getTargetCard(); if (!card) return;
  if (this.state === STATES.OVERFLOW) { this.claimOverflow(card); return; }
  if (card.kind === TYPE.GIANT && action === 'carve') { card.hp -= 1; this.sound.paper(); this.emitCross(card.x + card.w / 2, card.y + card.h / 2, CONFIG.COLORS.gold); if (card.hp > 0) { this.addStamp(`残り ${card.hp}`, card.x + card.w / 2, card.y); return; } }
  if (action === 'reject' && !this.actionIsGood(card, 'carve')) this.rejectCard(card);
  else if (this.actionIsGood(card, action)) this.success(card);
  else this.fail(card);
};

window.addEventListener('DOMContentLoaded', () => { window.honshitsuGame = new Game(); });
