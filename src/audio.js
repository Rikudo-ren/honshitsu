// ============================================================
// Web Audio リアルタイム合成（音声ファイル不使用）
// SE + BGM(4音ミニマルループ) + 心拍 + ミュート
// ============================================================
import { CONFIG } from './config.js';

let ctx = null;
let master = null;
let musicGain = null;
let sfxGain = null;
let muted = false;
let noiseBuf = null;

// BGMシーケンサ状態
const bgm = {
  nextTime: 0,
  step: 0,
  // 教室:乾いたピアノ風 4音 (A C E G のミニマル)
  notes: [220.0, 261.63, 329.63, 392.0],
  overflow: false,
  lastSpurt: false,
};

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.34;
  musicGain.connect(master);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.9;
  sfxGain.connect(master);
  // ノイズバッファ(1秒)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  bgm.nextTime = ctx.currentTime + 0.1;
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.02);
}

function now() { return ctx ? ctx.currentTime : 0; }

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

function osc(type, freq, t, dur, peak, dest) {
  if (!ctx || muted) return null;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  env(g, t, 0.008, peak, dur);
  o.connect(g); g.connect(dest || sfxGain);
  o.start(t); o.stop(t + dur + 0.1);
  return o;
}

function noise(t, dur, peak, filterType, freq, q, dest) {
  if (!ctx || muted) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = ctx.createBiquadFilter();
  f.type = filterType || 'bandpass';
  f.frequency.value = freq || 2000;
  f.Q.value = q || 1;
  const g = ctx.createGain();
  env(g, t, 0.005, peak, dur);
  src.connect(f); f.connect(g); g.connect(dest || sfxGain);
  src.start(t); src.stop(t + dur + 0.1);
}

// ---- SE ----
export function sePen() { // ペンが紙を擦る
  if (!ctx) return;
  noise(now(), 0.09, 0.25, 'highpass', 3500, 0.8);
}
export function seFlip() { // 紙のめくれ
  if (!ctx) return;
  const t = now();
  noise(t, 0.12, 0.2, 'bandpass', 1200, 2);
  noise(t + 0.05, 0.1, 0.15, 'bandpass', 2400, 2);
}
export function seKizamu(combo) { // ✝確定チャイム(半音上昇,8段リセット)
  if (!ctx) return;
  const t = now();
  const step = Math.floor(combo / 2) % CONFIG.chimeSteps;
  const base = 660 * Math.pow(2, step / 12);
  osc('triangle', base, t, 0.25, 0.5);
  osc('sine', base * 2, t, 0.18, 0.2);
}
export function seHah() { // は？成功(軽い肯定)
  if (!ctx) return;
  const t = now();
  const o = osc('square', 520, t, 0.09, 0.12);
  if (o) o.frequency.exponentialRampToValueAtTime(760, t + 0.09);
}
export function seMiss() { // 誤爆「は？」(下降+フォルマント風)
  if (!ctx) return;
  const t = now();
  const o = osc('sawtooth', 300, t, 0.28, 0.3);
  if (o) o.frequency.exponentialRampToValueAtTime(90, t + 0.28);
  noise(t, 0.25, 0.35, 'bandpass', 900, 4); // 声っぽさ
  noise(t + 0.03, 0.2, 0.25, 'bandpass', 500, 4);
}
export function seCorn() { // コーンスープのプシュッ
  if (!ctx) return;
  noise(now(), 0.18, 0.4, 'highpass', 2500, 0.7);
}
export function seTick() { // カウンターのチクチク
  if (!ctx) return;
  osc('square', 1400 + Math.random() * 400, now(), 0.03, 0.08);
}
export function seGuard() { // 三重ガード
  if (!ctx) return;
  const t = now();
  osc('triangle', 880, t, 0.15, 0.3);
  osc('triangle', 1320, t + 0.05, 0.2, 0.25);
}
export function seOverflowRise() { // 発動:上昇トーン
  if (!ctx || muted) return;
  const t = now();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(1200, t + 0.7);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.65);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 3000;
  o.connect(f); f.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + 0.85);
}
export function seOverflowBoom() { // ズドン→和音解決
  if (!ctx || muted) return;
  const t = now();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
  env(g, t, 0.005, 0.8, 0.6);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + 0.8);
  noise(t, 0.4, 0.3, 'lowpass', 900, 0.7);
  // 和音解決 (C E G)
  [261.63, 329.63, 392.0].forEach((f, i) => {
    osc('triangle', f, t + 0.35 + i * 0.06, 0.5, 0.25);
  });
}
export function seFanfare() { // 勝利ファンファーレ
  if (!ctx) return;
  const t = now();
  [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) => {
    osc('triangle', f, t + i * 0.11, 0.3, 0.3);
  });
}
export function seStamp() { // 称号スタンプ
  if (!ctx) return;
  const t = now();
  noise(t, 0.1, 0.5, 'lowpass', 600, 1);
  osc('sine', 150, t, 0.15, 0.4);
}
export function seHeartbeat() { // 心拍(残り10秒)
  if (!ctx) return;
  const t = now();
  osc('sine', 70, t, 0.12, 0.5);
  osc('sine', 62, t + 0.18, 0.14, 0.45);
}
export function seUi() { // UIタップ
  if (!ctx) return;
  osc('triangle', 700, now(), 0.06, 0.15);
}
export function seSlash() { // なぞり斬り
  if (!ctx) return;
  noise(now(), 0.08, 0.3, 'bandpass', 3000, 1.5);
}

// ---- BGM ----
export function setBgmMode(overflow, lastSpurt) {
  bgm.overflow = overflow;
  bgm.lastSpurt = lastSpurt;
}

// BGMは本編でのみ鳴らす(タイトルは無音→カウントでイン)
export function updateBgm(playing) {
  if (!ctx || muted) return;
  if (!playing) { bgm.nextTime = ctx.currentTime + 0.05; return; }
  const bpm = CONFIG.bgmBpm * (bgm.lastSpurt ? CONFIG.bgmLastSpurt : 1);
  const stepDur = 60 / bpm / 2; // 8分音符
  while (bgm.nextTime < ctx.currentTime + 0.15) {
    const t = bgm.nextTime;
    const s = bgm.step % 8;
    if (bgm.overflow) {
      // 厚いパッド + キック
      if (s % 2 === 0) {
        // キック
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        env(g, t, 0.004, 0.5, 0.18);
        o.connect(g); g.connect(musicGain);
        o.start(t); o.stop(t + 0.3);
      }
      const f = bgm.notes[s % 4] / 2;
      ['sawtooth', 'sawtooth'].forEach((ty, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = ty;
        o.frequency.value = f * (i === 0 ? 1.003 : 0.997);
        env(g, t, 0.02, 0.06, stepDur * 2);
        const flt = ctx.createBiquadFilter();
        flt.type = 'lowpass'; flt.frequency.value = 2400; // 開く
        o.connect(g); g.connect(flt); flt.connect(musicGain);
        o.start(t); o.stop(t + stepDur * 2 + 0.1);
      });
    } else {
      // 乾いたピアノ風 (triangle + 速い減衰)
      if (s % 2 === 0) {
        const f = bgm.notes[(s / 2) % 4];
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        env(g, t, 0.004, 0.28, 0.22);
        o.connect(g); g.connect(musicGain);
        o.start(t); o.stop(t + 0.35);
      }
    }
    bgm.nextTime += stepDur;
    bgm.step++;
  }
  // 止まったシーケンサの再同期
  if (bgm.nextTime < ctx.currentTime - 0.5) {
    bgm.nextTime = ctx.currentTime + 0.05;
  }
}
