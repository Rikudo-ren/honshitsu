/* ✝本質 RUSH — pure game logic (browser + Node).
 * No DOM / canvas access here. main.js renders this state. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HonshitsuLogic = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- roster (from gensaku.txt) ---------- */
  var CHARACTERS = [
    { id: 'ryoma',     name: '両馬二郎', title: '無敵メンタルの✝本質投下機',     spd: 3, fire: 4, pwr: 2, lck: 3 },
    { id: 'mie',       name: '三重県臣', title: '冷笑を失った内進エリート',       spd: 3, fire: 3, pwr: 4, lck: 2 },
    { id: 'rei',       name: '数理零',   title: '全科目学年首席・偏差値85',       spd: 4, fire: 3, pwr: 4, lck: 2 },
    { id: 'terachi',   name: '寺地',     title: '本質配信・登録者900人',          spd: 2, fire: 3, pwr: 3, lck: 5 },
    { id: 'sakura',    name: '櫻優',     title: '研究ノート✝本質✝汚染済み',       spd: 3, fire: 2, pwr: 3, lck: 5 },
    { id: 'sato',      name: '砂糖東洋', title: '窓の外は絶対に見ない',           spd: 4, fire: 3, pwr: 2, lck: 4 },
    { id: 'naitou',    name: '内藤蘭',   title: 'えんじネクタイの静かな読書家',   spd: 3, fire: 3, pwr: 3, lck: 3 },
    { id: 'mitsumine', name: '三峰',     title: '櫻×内藤 作戦ノートの執筆者',     spd: 3, fire: 4, pwr: 2, lck: 4 },
    { id: 'katsuya',   name: '塀勝也',   title: '地図を見て感動する地理教師',     spd: 2, fire: 4, pwr: 4, lck: 2 },
    { id: 'futami',    name: '二見',     title: '指輪が蛍光灯に反射する先生',     spd: 3, fire: 3, pwr: 3, lck: 4 },
    { id: 'izaki',     name: '伊崎',     title: 'クラスをまとめる調整役',         spd: 4, fire: 3, pwr: 2, lck: 4 },
    { id: 'izumi',     name: '伊豆見',   title: '自分の足で立ち始めた者',         spd: 3, fire: 3, pwr: 3, lck: 4 },
    { id: 'kuraishi',  name: '倉石',     title: 'ブレザー裏地に✝本質✝',          spd: 2, fire: 5, pwr: 2, lck: 4 },
    { id: 'meshino',   name: '召野',     title: '心拍数が上がる理数科一年',       spd: 5, fire: 2, pwr: 2, lck: 4 }
  ];

  var FIELD_W = 480, FIELD_H = 640;
  var ROUND_TIME = 60;
  var BOSS_TIMES = [20, 45];           // seconds elapsed
  var DEV_VALUES = [30, 40, 50, 60, 70, 80];

  function charById(id) {
    for (var i = 0; i < CHARACTERS.length; i++) if (CHARACTERS[i].id === id) return CHARACTERS[i];
    return CHARACTERS[0];
  }

  /* deterministic rng */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function statsOf(ch) {
    return {
      speed: 240 + 45 * ch.spd,                       // px/s
      fireInterval: 0.40 - 0.045 * ch.fire,           // s
      dmg: ch.pwr >= 4 ? 2 : 1,
      luckMult: 1 + 0.1 * ch.lck,                     // item score bonus
      luckDrop: 0.012 * ch.lck                        // extra item chance
    };
  }

  function makeGame(opts) {
    opts = opts || {};
    var hard = opts.difficulty === 'hard';
    var ch = charById(opts.charId);
    var st = {
      char: ch, hard: hard,
      diffMult: hard ? 1.5 : 1,
      spdMult: hard ? 1.3 : 1,
      w: FIELD_W, h: FIELD_H,
      t: 0, time: ROUND_TIME, over: false,
      score: 0, kills: 0, maxCombo: 0,
      combo: 0, comboT: 0,
      gauge: 0, specialT: 0, inv: 0, flash: 0,
      player: { x: FIELD_W / 2, y: FIELD_H - 64, w: 34, h: 46 },
      bullets: [], enemies: [], boss: null, bossIndex: 0,
      fireCd: 0, spawnCd: 1.0,
      stats: statsOf(ch),
      events: [],
      rng: mulberry32(opts.seed == null ? 12345 : opts.seed)
    };
    return st;
  }

  function push(st, type, data) {
    var e = { type: type };
    if (data) for (var k in data) e[k] = data[k];
    st.events.push(e);
  }

  function comboMult(st) { return 1 + Math.min(st.combo, 40) * 0.1; }   // max x5

  function addScore(st, base, isItem) {
    var pts = Math.round(base * comboMult(st) * st.diffMult * (isItem ? st.stats.luckMult : 1));
    st.score += pts;
    return pts;
  }

  function registerKill(st) {
    st.kills++;
    st.combo++;
    st.comboT = 2.5;
    if (st.combo > st.maxCombo) st.maxCombo = st.combo;
    st.gauge = Math.min(100, st.gauge + 8);
  }

  function spawnEnemy(st) {
    var r = st.rng();
    var kind, e;
    var itemBias = st.stats.luckDrop;
    if (r < 0.08 + itemBias) kind = 'soup';
    else if (r < 0.24 + itemBias) kind = 'essence';
    else if (r < 0.38) kind = 'exam';
    else kind = 'block';

    var x = 24 + st.rng() * (FIELD_W - 48);
    if (kind === 'block') {
      var num = DEV_VALUES[Math.floor(st.rng() * DEV_VALUES.length)];
      e = { kind: kind, num: num, hp: Math.ceil(num / 30), maxHp: Math.ceil(num / 30),
            w: 44, h: 34, x: x, y: -40, vy: (55 + num * 0.7) * st.spdMult, vx: 0, base: num * 2 };
    } else if (kind === 'exam') {
      e = { kind: kind, hp: 3, maxHp: 3, w: 56, h: 40, x: x, y: -46, vy: 52 * st.spdMult, vx: 0, base: 150 };
    } else if (kind === 'essence') {
      e = { kind: kind, hp: 1, maxHp: 1, w: 30, h: 30, x: x, y: -34, vy: 135 * st.spdMult, vx: Math.sin(st.t) * 40, base: 300 };
    } else {
      e = { kind: kind, hp: 1, maxHp: 1, w: 30, h: 34, x: x, y: -38, vy: 92 * st.spdMult, vx: 0, base: 100 };
    }
    st.enemies.push(e);
  }

  function spawnBoss(st) {
    var hard = st.hard;
    st.boss = {
      face: CHARACTERS[Math.floor(st.rng() * CHARACTERS.length)].id,
      hp: hard ? 90 : 60, maxHp: hard ? 90 : 60,
      x: FIELD_W / 2, y: -70, w: 96, h: 96, t: 0, base: hard ? 1200 : 800
    };
    push(st, 'bossspawn', { face: st.boss.face });
  }

  function hitRect(a, b) {
    return Math.abs(a.x - b.x) * 2 < (a.w + b.w) && Math.abs(a.y - b.y) * 2 < (a.h + b.h);
  }

  function damageEnemy(st, e, dmg, viaSpecial) {
    e.hp -= dmg;
    if (e.hp > 0) { push(st, 'hit', { kind: e.kind }); return false; }
    var isItem = e.kind === 'essence' || e.kind === 'soup';
    var base = viaSpecial ? Math.round(e.base * 0.5) : e.base;
    var pts = addScore(st, base, isItem);
    registerKill(st);
    if (e.kind === 'essence') { st.gauge = Math.min(100, st.gauge + 25); push(st, 'essence', { pts: pts, x: e.x, y: e.y }); }
    else if (e.kind === 'soup') { st.time += 2; push(st, 'soup', { pts: pts, x: e.x, y: e.y }); }
    else push(st, 'kill', { kind: e.kind, pts: pts, x: e.x, y: e.y });
    return true;
  }

  function activateSpecial(st) {
    if (st.over || st.gauge < 100 || st.specialT > 0) return false;
    st.gauge = 0;
    st.specialT = 1.2;
    st.inv = Math.max(st.inv, 1.5);
    var n = 0;
    for (var i = st.enemies.length - 1; i >= 0; i--) {
      damageEnemy(st, st.enemies[i], 99, true);
      st.enemies.splice(i, 1);
      n++;
    }
    if (st.boss) { st.boss.hp -= 15; if (st.boss.hp <= 0) killBoss(st); }
    push(st, 'special', { n: n });
    return true;
  }

  function killBoss(st) {
    var pts = addScore(st, st.boss.base, false);
    st.time += 3;
    registerKill(st);
    st.gauge = Math.min(100, st.gauge + 40);
    push(st, 'bossdown', { pts: pts, x: st.boss.x, y: st.boss.y });
    st.boss = null;
  }

  function penalty(st) {
    st.time -= st.hard ? 5 : 3;
    st.combo = 0;
    st.comboT = 0;
    st.gauge = Math.max(0, st.gauge - 20);
    st.inv = 1.0;
    st.flash = 0.35;
    push(st, 'penalty', { secs: st.hard ? 5 : 3 });
  }

  /* ---------- main update ---------- */
  function update(st, dt, input) {
    if (st.over) return st;
    input = input || {};
    st.t += dt;
    st.flash = Math.max(0, st.flash - dt);
    st.inv = Math.max(0, st.inv - dt);
    st.specialT = Math.max(0, st.specialT - dt);

    /* round timer */
    st.time -= dt;
    if (st.time <= 5.05 && st.time + dt > 5.05) push(st, 'last5');
    if (st.time <= 0) { st.time = 0; st.over = true; push(st, 'over', { score: st.score, maxCombo: st.maxCombo, kills: st.kills }); return st; }

    /* combo decay */
    if (st.comboT > 0) { st.comboT -= dt; if (st.comboT <= 0) st.combo = 0; }

    /* player move */
    var p = st.player, v = st.stats.speed;
    var dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    var dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    p.x += dx * v * dt;
    p.y += dy * v * 0.75 * dt;
    p.x = Math.max(p.w / 2, Math.min(FIELD_W - p.w / 2, p.x));
    p.y = Math.max(FIELD_H - 160, Math.min(FIELD_H - 40, p.y));

    if (input.special) activateSpecial(st);

    /* autofire */
    st.fireCd -= dt;
    if (st.fireCd <= 0) {
      st.fireCd = st.stats.fireInterval;
      st.bullets.push({ x: p.x, y: p.y - p.h / 2, w: 10, h: 16, vy: -540, dmg: st.stats.dmg });
      push(st, 'shoot');
    }

    /* spawns */
    st.spawnCd -= dt;
    if (st.spawnCd <= 0) {
      var ramp = Math.max(0.55, 1 - st.t * 0.006);
      st.spawnCd = (st.hard ? 0.72 : 0.9) * ramp;
      spawnEnemy(st);
    }

    /* boss schedule */
    if (st.bossIndex < BOSS_TIMES.length && st.t >= BOSS_TIMES[st.bossIndex]) {
      st.bossIndex++;
      if (!st.boss) spawnBoss(st);
    }

    /* bullets */
    var i, b, e;
    for (i = st.bullets.length - 1; i >= 0; i--) {
      b = st.bullets[i];
      b.y += b.vy * dt;
      if (b.y < -20) { st.bullets.splice(i, 1); continue; }
      var used = false;
      for (var j = st.enemies.length - 1; j >= 0; j--) {
        e = st.enemies[j];
        if (hitRect(b, e)) {
          if (damageEnemy(st, e, b.dmg, false)) st.enemies.splice(j, 1);
          used = true;
          break;
        }
      }
      if (!used && st.boss && hitRect(b, st.boss)) {
        st.boss.hp -= b.dmg;
        push(st, 'bosshit');
        if (st.boss.hp <= 0) killBoss(st);
        used = true;
      }
      if (used) st.bullets.splice(i, 1);
    }

    /* enemies */
    for (i = st.enemies.length - 1; i >= 0; i--) {
      e = st.enemies[i];
      e.y += e.vy * dt;
      e.x += e.vx * dt;
      if (e.kind === 'essence') {
        e.x = Math.max(16, Math.min(FIELD_W - 16, e.x + Math.sin(st.t * 4) * 30 * dt));
      }
      if (e.y > FIELD_H + 40) { st.enemies.splice(i, 1); continue; }
      if (st.inv <= 0 && hitRect(e, p)) {
        st.enemies.splice(i, 1);
        penalty(st);
      }
    }

    /* boss behaviour */
    if (st.boss) {
      var bo = st.boss;
      bo.t += dt;
      bo.y = Math.min(110, bo.y + 40 * dt);
      bo.x = FIELD_W / 2 + Math.sin(bo.t * 0.9) * (FIELD_W / 2 - 70);
      if (bo.y >= 110 && bo.t > 14) {          // leaves after 14s, time cost
        st.time -= st.hard ? 5 : 3;
        st.flash = 0.35;
        push(st, 'bossesc', { secs: st.hard ? 5 : 3 });
        st.boss = null;
      }
    }
    return st;
  }

  return {
    CHARACTERS: CHARACTERS,
    FIELD_W: FIELD_W, FIELD_H: FIELD_H,
    ROUND_TIME: ROUND_TIME,
    BOSS_TIMES: BOSS_TIMES,
    charById: charById,
    statsOf: statsOf,
    mulberry32: mulberry32,
    makeGame: makeGame,
    update: update,
    comboMult: comboMult,
    addScore: addScore,
    hitRect: hitRect,
    activateSpecial: activateSpecial,
    spawnEnemy: spawnEnemy,
    spawnBoss: spawnBoss
  };
}));
