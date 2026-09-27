// All game tuning lives here. Keep this file small, readable, and fun to tweak.
export const CONFIG = {
  PLAY_SECONDS: 60,
  TUTORIAL_SECONDS: 4,
  COUNTDOWN_SECONDS: 1.6,
  RESULT_SECONDS: 6,
  MAX_DELTA: 0.05,
  TARGET_MARGIN: 154,
  CARD_POOL: 42,
  PARTICLE_POOL: 260,
  TEXT_SCALE: 1.5,
  SPAWN: {
    easy: { until: 15, simultaneous: 2, speed: 0.92, interval: 0.92, noise: 0.08, fake: 0, feikatsu: 0 },
    medium: { until: 30, simultaneous: 3, speed: 1.18, interval: 0.70, noise: 0.16, fake: 0.17, feikatsu: 0 },
    hard: { until: 45, simultaneous: 4, speed: 1.48, interval: 0.55, noise: 0.24, fake: 0.20, feikatsu: 0.10 },
    rush: { until: 60, simultaneous: 5, speed: 1.78, interval: 0.41, noise: 0.34, fake: 0.24, feikatsu: 0.16 }
  },
  SCORE: { essence: 100, reject: 60, rareMin: 500, rareMax: 1500, overflowBonus: 2, hitTime: 0.15, rejectTime: 0.10, errorTime: 1.50, missTime: 0.50 },
  MULTIPLIER: { base: 1, comboStep: 10, comboAdd: 0.5, cap: 8, reiCap: 10, reiSeconds: 10 },
  OVERFLOW: { fillPerHit: 0.12, errorDrain: 0.30, seconds: 7, flash: 0.72, shake: 8, wallStages: 3 },
  FEEL: { shake: 7, bloom: 0.42, cardGlow: 0.68, stampSquash: 0.90, crossSeconds: 0.12, slowFactor: 0.5, hitFreeze: 0.025 },
  SKILLS: { ryomaCombo: 20, mieRejects: 5, reiCleanSeconds: 15, mieGuardSeconds: 3, contourSeconds: 5, satouSeconds: 5, kuraishiAt: 39, schrodingerAt: 43, englishChance: 0.045 },
  AUDIO: { normalMs: 510, rushMs: 472, overflowMs: 360, masterGain: 0.14 },
  COLORS: { room: '#3E4A3C', paper: '#F7F5EE', ink: '#1A1A22', gold: '#F2C14E', crimson: '#8C2F3A', navy: '#22355B', chalk: '#D9E2CE', muted: '#9BA89A' },
  REDUCED_PARTICLE_RATIO: 0.25,
  DEBUG: { showHitboxes: true, fps: true, allowRank: true }
};

export const STATES = Object.freeze({ BOOT: 'BOOT', TITLE: 'TITLE', TUTORIAL: 'TUTORIAL', COUNTDOWN: 'COUNTDOWN', PLAY: 'PLAY', OVERFLOW: 'OVERFLOW', TIMEUP: 'TIMEUP', RESULT: 'RESULT' });
export const TYPE = Object.freeze({ ESSENCE: 'honshitsu', FAKE: 'a_honshitsu', NOISE: 'noise', FEIKATSU: 'fake_katsu', SOUP: 'soup', RING: 'ring', GIANT: 'giant', SCHRODINGER: 'schrodinger', ENGLISH: 'english' });
export const STORAGE = Object.freeze({ high: 'honshitsu-overflow-high', bestCombo: 'honshitsu-overflow-best-combo', reply: 'honshitsu-overflow-reply', quotes: 'honshitsu-overflow-quotes', frames: 'honshitsu-overflow-frames', sound: 'honshitsu-overflow-sound' });
