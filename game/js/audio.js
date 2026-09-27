/* ============================================================
   ✝本質✝スコアアタック — 音（WebAudioで合成・追加アセット不要）
   ============================================================ */
const Sound = (() => {
  let ctx = null, master = null, sfxBus = null, bgmBus = null;
  let enabled = true, bgmOn = true, bgmTimer = null, step = 0, bgmPlaying = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.5;  sfxBus.connect(master);
      bgmBus = ctx.createGain(); bgmBus.gain.value = 0.0;  bgmBus.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ f = 440, f2 = null, t = 0.12, type = 'triangle', g = 0.3, when = 0, bus = null, atk = 0.008 }) {
    if (!enabled) return;
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime + when;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t0 + t);
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(g, t0 + atk);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + t);
    o.connect(gn); gn.connect(bus || sfxBus); o.start(t0); o.stop(t0 + t + 0.04);
  }

  function noise({ t = 0.22, g = 0.28, when = 0, hp = 200 }) {
    if (!enabled) return;
    const c = ensure(); if (!c) return;
    const len = Math.floor(c.sampleRate * t);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = hp; f.Q.value = 0.8;
    const gn = c.createGain(); gn.gain.value = g;
    src.connect(f); f.connect(gn); gn.connect(sfxBus); src.start(c.currentTime + when);
  }

  const SFX = {
    tap()      { tone({ f: 620, f2: 480, t: 0.06, type: 'square', g: 0.16 }); },
    hover()    { tone({ f: 900, t: 0.03, type: 'sine', g: 0.07 }); },
    correct(combo = 0) {
      const shift = Math.min(12, Math.floor(combo / 2) * 2);
      const base = 523.25 * Math.pow(2, shift / 12);
      [0, 4, 7, 12].forEach((s, i) =>
        tone({ f: base * Math.pow(2, s / 12), t: 0.16, type: 'triangle', g: 0.24, when: i * 0.055 }));
    },
    wrong() {
      tone({ f: 190, f2: 70, t: 0.4, type: 'sawtooth', g: 0.24 });
      tone({ f: 140, f2: 55, t: 0.45, type: 'square', g: 0.12, when: 0.03 });
      noise({ t: 0.3, g: 0.2, hp: 380 });
    },
    combo(n = 3) {
      const base = 660 * Math.pow(2, Math.min(10, n) / 24);
      [0, 7, 12, 16].forEach((s, i) => tone({ f: base * Math.pow(2, s / 12), t: 0.18, type: 'sine', g: 0.18, when: i * 0.045 }));
    },
    tick(strong = false) { tone({ f: strong ? 1200 : 880, t: 0.05, type: 'square', g: strong ? 0.2 : 0.11 }); },
    start() {
      [392, 523.25, 659.25, 784].forEach((f, i) => tone({ f, t: 0.28, type: 'triangle', g: 0.26, when: i * 0.13 }));
      noise({ t: 0.5, g: 0.12, hp: 900, when: 0.4 });
    },
    end() {
      [783.99, 659.25, 523.25, 392].forEach((f, i) => tone({ f, t: 0.4, type: 'triangle', g: 0.26, when: i * 0.15 }));
    },
    broadcast() {
      [659.25, 987.77, 1318.5].forEach((f, i) => tone({ f, t: 0.5, type: 'sine', g: 0.2, when: i * 0.09 }));
    },
    record() {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
        tone({ f, t: 0.5, type: 'triangle', g: 0.22, when: i * 0.1 }));
    },
    ui() { tone({ f: 440, f2: 660, t: 0.1, type: 'sine', g: 0.18 }); }
  };

  /* ---- 簡易チップチューンBGM（4小節ループ） ---- */
  const CHORDS = [
    { bass: 110.00, notes: [220.00, 261.63, 329.63] }, // Am
    { bass: 87.31,  notes: [174.61, 220.00, 261.63] }, // F
    { bass: 130.81, notes: [261.63, 329.63, 392.00] }, // C
    { bass: 98.00,  notes: [196.00, 246.94, 293.66] }  // G
  ];
  function bgmStep() {
    if (!bgmPlaying || !enabled || !bgmOn) return;
    const bar = Math.floor(step / 8) % 4;
    const ch = CHORDS[bar];
    const sub = step % 8;
    if (sub % 4 === 0) tone({ f: ch.bass, t: 0.42, type: 'triangle', g: 0.5, bus: bgmBus, atk: 0.02 });
    if (sub % 2 === 0) tone({ f: ch.notes[(step / 2 | 0) % ch.notes.length] * 2, t: 0.22, type: 'sine', g: 0.22, bus: bgmBus });
    if (sub === 6) tone({ f: ch.notes[2] * 4, t: 0.1, type: 'square', g: 0.07, bus: bgmBus });
    step++;
  }
  function startBGM() {
    const c = ensure(); if (!c) return;
    if (!bgmOn) return;
    bgmBus.gain.cancelScheduledValues(c.currentTime);
    bgmBus.gain.setValueAtTime(bgmBus.gain.value, c.currentTime);
    bgmBus.gain.linearRampToValueAtTime(0.1, c.currentTime + 1.2);
    if (bgmTimer) return;
    bgmPlaying = true;
    bgmTimer = setInterval(bgmStep, 165);
  }
  function stopBGM() {
    bgmPlaying = false;
    if (ctx) { bgmBus.gain.cancelScheduledValues(ctx.currentTime); bgmBus.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5); }
    clearInterval(bgmTimer); bgmTimer = null;
  }

  return {
    sfx: (name, arg) => { try { ensure(); (SFX[name] || (() => {}))(arg); } catch (e) {} },
    startBGM, stopBGM,
    unlock: () => ensure(),
    get on() { return enabled; },
    get bgm() { return bgmOn; },
    setMusic(v) { bgmOn = !!v; if (bgmOn && bgmPlaying) { stopBGM(); startBGM(); } },
    toggle() {
      enabled = !enabled;
      if (enabled) { ensure(); if (bgmOn) startBGM(); } else stopBGM();
      return enabled;
    }
  };
})();
