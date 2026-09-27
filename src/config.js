// ============================================================
// ✝本質✝ OVERFLOW — 全チューニング値（ここだけ触れば調整できる）
// ============================================================
export const CONFIG = {
  // ---- 時間 ----
  timeLimit: 60.0,        // 制限時間(秒)
  timeKizamu: 0.15,       // ✝成功の時間加算
  timeHah: 0.10,          // は？成功の時間加算
  timeMiss: -1.50,        // 誤爆の時間減算
  timeLeak: -0.50,        // 本質取りこぼしの時間減算
  timeCorn: 3.0,          // コーンスープ缶の加算
  timeEnglish: 5.0,       // 英語カードの加算
  dangerTime: 10.0,       // 残り警告ライン(秒)

  // ---- スコア ----
  scoreKizamu: 100,       // ✝成功の基礎点
  scoreHah: 60,           // は？成功の基礎点
  scoreRareMin: 500,      // レア最低点
  scoreRareMax: 1500,     // レア最高点
  scoreCorn: 800,         // コーンスープ缶
  scoreRing: 1500,        // 結婚指輪
  scoreEnglish: 800,      // 英語カード
  scoreGen: 1000,         // 原✝本質✝(破壊時)
  scoreRyomaAuto: 50,     // 両馬スキル自動✝の基礎点
  multStep: 0.5,          // コンボ10ごとの倍率加算
  multMax: 8.0,           // 通常の倍率上限
  multReiMax: 10.0,       // 零スキル時の倍率上限
  multOverflowBonus: 2.0, // OVERFLOW中の倍率加算
  scoreSatoMult: 1.5,     // 砂糖スロー中の得点倍率
  schroWinMult: 2.0,      // シュレディンガー観測成功の倍率
  schroLoseTime: -2.5,    // シュレディンガー観測失敗の時間減算

  // ---- 偏差値変換 ----
  hensachiBase: 60,       // 偏差値 = base + gain*(1-exp(-score/divisor))
  hensachiGain: 40,
  hensachiDivisor: 45000,

  // ---- 落下・出現（難易度カーブ） ----
  // [開始秒, 終了秒, 同時出現数, 速度倍率, フェイカツ率, ノイズ率, 亜率]
  difficulty: [
    { from: 0,  to: 15, concurrent: 2, speed: 1.0,  fake: 0.00, noise: 0.18, aRate: 0.22 },
    { from: 15, to: 30, concurrent: 3, speed: 1.25, fake: 0.00, noise: 0.22, aRate: 0.24 },
    { from: 30, to: 45, concurrent: 4, speed: 1.5,  fake: 0.10, noise: 0.24, aRate: 0.22 },
    { from: 45, to: 99, concurrent: 5, speed: 1.8,  fake: 0.12, noise: 0.32, aRate: 0.20 },
  ],
  fallBase: 150,          // 基準落下速度(px/s, 画面高700基準で自動補正)
  spawnInterval: [0.55, 1.0], // 出現間隔の範囲(秒, 速度で割られる)
  trickEvery: 5,          // 何秒ごとに「引っかけ3連続→別種」を狙うか
  cardLife: 6.0,          // カードが画面にいる最大秒(保険)

  // ---- OVERFLOW ----
  overflowMax: 100,
  overflowKizamu: 9,      // ✝成功のゲージ加算
  overflowHah: 6,         // は？成功のゲージ加算
  overflowMissRate: 0.30, // 誤爆で減る割合
  overflowTime: 7.0,      // フィーバー秒数
  overflowReturnTime: 1.0,// 教室に戻る逆再生の秒数

  // ---- スキル ----
  ryomaComboEvery: 20,    // 両馬：何コンボごと
  ryomaStay: 0.9,         // 両馬立ち絵の滞在秒
  ryomaMaxTargets: 3,     // 両馬の自動✝の最大数
  mieHahChain: 5,         // 三重：は？何連続で発動
  mieGuardTime: 3.0,      // 三重ガード秒数
  reiNoMissTime: 15.0,    // 零：無傷何秒で発動
  reiBuffTime: 10.0,      // 零バフ秒数
  katsuyaAt: 30.0,        // 勝也：残り何秒で発動
  katsuyaTime: 5.0,       // 勝也等高線モード秒数
  satoSlowRate: 0.5,      // 砂糖スロー倍率
  satoTime: 5.0,          // 砂糖スロー秒数
  satoChance: 0.016,      // 砂糖：出現ごとの発動確率(20秒以降,1回のみ)
  kuraishiAfter: 25.0,    // 倉石：経過何秒以降
  kuraishiChance: 0.020,  // 倉石：出現ごとの確率(1回のみ)
  sakuraAfter: 30.0,      // 櫻：経過何秒以降
  sakuraChance: 0.018,    // 櫻：出現ごとの確率(1回のみ)
  sakuraRevealAfter: 3.5, // 櫻→三峰の暴露までの秒数(落下より速く)
  meshinoAfter: 20.0,     // 召野：経過何秒以降
  meshinoChance: 0.018,   // 召野：出現ごとの確率(1回のみ)
  cornChance: 0.030,      // コーンスープ缶の出現確率
  ringChance: 0.016,      // 結婚指輪の出現確率

  // ---- 演出 ----
  tutorialTime: 4.0,      // チュートリアル秒数
  countdownTime: 1.6,     // カウントダウン秒数
  carveTime: 0.12,        // ✝一筆書きの秒数
  hahStampTime: 0.35,     // 誤爆スタンプ秒数
  freezeTime: 0.4,        // リザルト前の静止秒数
  resultTotal: 6.0,       // リザルト尺(目安)
  shakeMax: 10,           // 画面シェイク最大(px)
  bloomMax: 0.8,          // ラジアルブルーム上限(白飛び禁止)
  particleMax: 260,       // 粒子プール数
  particleReduced: 65,    // prefers-reduced-motion時の粒子数
  flashMax: 0.8,          // フラッシュ強度上限

  // ---- オーディオ ----
  bgmBpm: 104,            // BGMテンポ
  bgmLastSpurt: 1.08,     // 残り10秒のテンポ倍率
  chimeSteps: 8,          // ✝チャイムの音程段数(半音上昇→リセット)
};

// 難易度カーブ表（報告・デバッグ用）
export function difficultyAt(elapsed) {
  for (const d of CONFIG.difficulty) {
    if (elapsed >= d.from && elapsed < d.to) return d;
  }
  return CONFIG.difficulty[CONFIG.difficulty.length - 1];
}

// 偏差値変換
export function scoreToHensachi(score) {
  const c = CONFIG;
  return c.hensachiBase + c.hensachiGain * (1 - Math.exp(-score / c.hensachiDivisor));
}

// ランク判定
export function hensachiRank(h) {
  if (h >= 100) return { id: 'cross',   name: '✝',            cls: 'rank-cross' };
  if (h >= 86)  return { id: 'pregen',  name: '前-原✝本質✝', cls: 'rank-pregen' };
  if (h >= 85)  return { id: 'rei',     name: '数理零ライン', cls: 'rank-rei' };
  if (h >= 75)  return { id: 'gen',     name: '原✝本質✝',    cls: 'rank-gen' };
  if (h >= 70)  return { id: 'hon',     name: '✝本質✝',       cls: 'rank-hon' };
  if (h >= 65)  return { id: 'ahon',    name: '亜✝本質✝',     cls: 'rank-ahon' };
  return { id: 'hi', name: '非✝本質✝', cls: 'rank-hi' };
}
