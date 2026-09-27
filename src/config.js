export const CONFIG = {
  // 時間・タイマー
  GAME_DURATION: 60.0,
  TIME_BONUS_HONSHITSU: 0.15,
  TIME_BONUS_HUH: 0.10,
  TIME_PENALTY_MISTAKE: 1.50,
  TIME_PENALTY_MISS: 0.50,

  // スコア
  SCORE_HONSHITSU: 100,
  SCORE_HUH: 60,
  SCORE_RARE_MIN: 500,
  SCORE_RARE_MAX: 1500,
  COMBO_STEP: 10,
  MULTIPLIER_PER_STEP: 0.5,
  MULTIPLIER_BASE: 1.0,
  MULTIPLIER_MAX: 8.0,
  MULTIPLIER_MAX_REI: 10.0,

  // 偏差値変換
  DEVIATION_K: 45000,

  // 難易度カーブ: [startSec, endSec, maxCards, speed, spawnInterval, weights]
  DIFFICULTY: [
    { t0:0,  t1:15, maxCards:2, speed:1.0, interval: 900, weights:{honshitsu:55,a_honshitsu:15,noise:20,fake_katsu:0,rare:5,schrodinger:0,gen:0} },
    { t0:15, t1:30, maxCards:3, speed:1.25, interval: 720, weights:{honshitsu:50,a_honshitsu:18,noise:22,fake_katsu:0,rare:5,schrodinger:2,gen:0} },
    { t0:30, t1:45, maxCards:4, speed:1.5, interval: 580, weights:{honshitsu:42,a_honshitsu:18,noise:20,fake_katsu:12,rare:4,schrodinger:3,gen:1} },
    { t0:45, t1:60, maxCards:5, speed:1.8, interval: 460, weights:{honshitsu:38,a_honshitsu:16,noise:24,fake_katsu:14,rare:3,schrodinger:4,gen:1} },
  ],

  // カード落下
  CARD_FALL_BASE: 78, // px/sec at speed 1.0 (responsive scaling)
  CARD_FALL_VARIANCE: 0.18,
  CARD_SPAWN_TOP: -140,
  CARD_DESPAWN_Y: 760, // beyond container, triggers miss

  // OVERFLOW
  OVERFLOW_MAX: 100,
  OVERFLOW_GAIN_HONSHITSU: 11,
  OVERFLOW_GAIN_HUH: 6,
  OVERFLOW_GAIN_RARE: 18,
  OVERFLOW_LOSS_MISTAKE: 30, // percent
  OVERFLOW_DURATION: 7.0,
  OVERFLOW_MULT_BONUS: 2.0,

  // 演出強度（調整可能）
  PARTICLE_COUNT_HIT: 14,
  PARTICLE_COUNT_OVERFLOW: 80,
  SHAKE_INTENSITY_MISTAKE: 6,
  SHAKE_INTENSITY_OVERFLOW: 10,
  BLOOM_INTENSITY: 0.75,
  SLOW_FACTOR_SATO: 0.5,
  SLOW_DURATION_SATO: 5.0,

  // キャラスキル確率
  SATO_CHANCE: 0.012,
  KURAISHI_CHANCE: 0.010,
  SAKURA_CHANCE: 0.015,
  MESHINO_CHANCE: 0.012,

  // 視覚
  CARD_WIDTH: 310,
  CARD_HEIGHT: 86,
};

export const RANK_TABLE = [
  { min:100, name:"✝", sub:"超越", bg:"hoshizora" },
  { min:86, name:"前-原✝本質✝", sub:"PRE-GENESIS", bg:"hoshizora" },
  { min:85, name:"数理零ライン", sub:"ZERO LINE", bg:"hoshizora" },
  { min:75, name:"原✝本質✝", sub:"GENESIS", bg:"chisou" },
  { min:70, name:"✝本質✝", sub:"HONSHITSU", bg:"kin" },
  { min:65, name:"亜✝本質✝", sub:"A-HONSHITSU", bg:"kei" },
  { min:60, name:"非✝本質✝", sub:"HI-HONSHITSU", bg:"kei" },
  { min:0,  name:"非✝本質✝", sub:"HI-HONSHITSU", bg:"kei" },
];

export function deviationFromScore(score){
  return 60 + 40 * (1 - Math.exp(-score / CONFIG.DEVIATION_K));
}
export function rankFromDeviation(dev){
  for(const r of RANK_TABLE) if(dev >= r.min) return r;
  return RANK_TABLE[RANK_TABLE.length-1];
}
