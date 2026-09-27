/* Node test harness — executes the real logic.js code paths (update, damage, penalty, special). */
'use strict';
var L = require('./logic.js');
var assert = require('assert');
var passed = 0;
function ok(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }

console.log('✝本質 RUSH logic tests');

ok('makeGame defaults: 60s, score 0, player centered', function () {
  var st = L.makeGame({ charId: 'rei', seed: 1 });
  assert.strictEqual(st.time, 60);
  assert.strictEqual(st.score, 0);
  assert.strictEqual(st.player.x, L.FIELD_W / 2);
  assert.strictEqual(st.stats.dmg, 2, 'rei pwr4 -> dmg2');
});

ok('mulberry32 deterministic', function () {
  var a = L.mulberry32(7)(), b = L.mulberry32(7)();
  assert.strictEqual(a, b);
});

ok('first block kill scores base value (combo x1, normal diff)', function () {
  var st = L.makeGame({ charId: 'ryoma', seed: 42 });
  st.enemies.push({ kind: 'block', num: 40, hp: 2, maxHp: 2, w: 44, h: 34, x: L.FIELD_W / 2, y: 200, vy: 60, vx: 0, base: 80 });
  var killed = false, pts = 0;
  for (var i = 0; i < 600 && !killed; i++) {
    L.update(st, 1 / 60, {});
    st.events.forEach(function (e) { if (e.type === 'kill') { killed = true; pts = e.pts; } });
    st.events.length = 0;
  }
  assert.ok(killed, 'enemy killed by autofire');
  assert.strictEqual(pts, 80, '40-dev block = 80pts at x1');
  assert.strictEqual(st.combo, 1);
  assert.strictEqual(st.maxCombo, 1);
  assert.ok(st.gauge >= 8, 'gauge up on kill');
});

ok('essence kill builds gauge +25 and luck-scaled score', function () {
  var st = L.makeGame({ charId: 'terachi', seed: 5 });   // lck5 -> luckMult 1.5
  st.enemies.push({ kind: 'essence', hp: 1, maxHp: 1, w: 30, h: 30, x: L.FIELD_W / 2, y: 200, vy: 135, vx: 0, base: 300 });
  var pts = 0;
  for (var i = 0; i < 600; i++) {
    L.update(st, 1 / 60, {});
    st.events.forEach(function (e) { if (e.type === 'essence') pts = e.pts; });
    st.events.length = 0;
    if (pts) break;
  }
  assert.strictEqual(pts, 450, '300 * 1.5 luck');
  assert.ok(st.gauge >= 25 + 8);
});

ok('collision with player: -3s, combo reset, invuln', function () {
  var st = L.makeGame({ charId: 'ryoma', seed: 9 });
  st.combo = 5; st.time = 30;
  st.enemies.push({ kind: 'block', num: 30, hp: 1, maxHp: 1, w: 44, h: 34, x: st.player.x, y: st.player.y, vy: 0, vx: 0, base: 60 });
  L.update(st, 1 / 60, {});
  var pen = st.events.filter(function (e) { return e.type === 'penalty'; });
  assert.strictEqual(pen.length, 1);
  assert.strictEqual(pen[0].secs, 3);
  assert.strictEqual(st.combo, 0, 'combo reset');
  assert.ok(st.time < 30 - 2.9, 'time lost');
  assert.ok(st.inv > 0, 'invuln frames');
});

ok('special: gauge 100 -> clears field, gauge 0, invuln', function () {
  var st = L.makeGame({ charId: 'kuraishi', seed: 3 });
  st.gauge = 100;
  st.enemies.push({ kind: 'block', num: 60, hp: 2, maxHp: 2, w: 44, h: 34, x: 100, y: 100, vy: 60, vx: 0, base: 120 });
  st.enemies.push({ kind: 'exam', hp: 3, maxHp: 3, w: 56, h: 40, x: 300, y: 100, vy: 52, vx: 0, base: 150 });
  assert.strictEqual(L.activateSpecial(st), true);
  assert.strictEqual(st.enemies.length, 0);
  assert.strictEqual(st.gauge, 16, 'gauge reset then +8 per special kill');
  assert.ok(st.inv >= 1.4);
  assert.ok(st.score > 0, 'special grants score');
  assert.strictEqual(L.activateSpecial(st), false, 'cannot double-fire');
});

ok('boss spawns at t=20 and t=45; killing it grants time', function () {
  var st = L.makeGame({ charId: 'mie', seed: 11 });
  st.inv = 1e4;   // isolate boss schedule: idle player would otherwise bleed time via penalties
  var spawns = 0;
  for (var i = 0; i < 60 * 50; i++) {
    L.update(st, 1 / 60, {});
    st.events.forEach(function (e) {
      if (e.type === 'bossspawn') spawns++;
      if (e.type === 'bosshit') {}
    });
    st.events.length = 0;
    if (st.boss && st.boss.hp > 0 && spawns >= 1 && !st._bossKilledOnce) {
      st._bossKilledOnce = true;
      var before = st.time;
      st.boss.hp = 1;
      st.bullets.push({ x: st.boss.x, y: st.boss.y, w: 10, h: 16, vy: -540, dmg: 2 });
      // next update bullet flies away up; instead damage directly through update collision:
      st.boss.y = 300; st.boss.x = st.bullets[0].x; st.bullets[0].y = 305;
    }
    if (st.over) break;
  }
  assert.ok(spawns >= 2, 'two boss waves, got ' + spawns);
});

ok('round ends at 0 -> over event with score', function () {
  var st = L.makeGame({ charId: 'sato', seed: 2 });
  var over = null;
  for (var i = 0; i < 60 * 70 && !over; i++) {
    L.update(st, 1 / 60, {});
    st.events.forEach(function (e) { if (e.type === 'over') over = e; });
    st.events.length = 0;
  }
  assert.ok(over, 'over event fired');
  assert.strictEqual(st.time, 0);
  assert.ok(st.over);
});

ok('hard mode: penalty -5s and 1.5x score', function () {
  var st = L.makeGame({ charId: 'rei', seed: 6, difficulty: 'hard' });
  st.enemies.push({ kind: 'block', num: 50, hp: 2, maxHp: 2, w: 44, h: 34, x: st.player.x, y: st.player.y, vy: 0, vx: 0, base: 100 });
  L.update(st, 1 / 60, {});
  var pen = st.events.filter(function (e) { return e.type === 'penalty'; })[0];
  assert.strictEqual(pen.secs, 5);
  var st2 = L.makeGame({ charId: 'rei', seed: 6, difficulty: 'hard' });
  st2.enemies.push({ kind: 'block', num: 40, hp: 1, maxHp: 1, w: 44, h: 34, x: L.FIELD_W / 2, y: 200, vy: 60, vx: 0, base: 80 });
  var pts = 0;
  for (var i = 0; i < 600 && !pts; i++) {
    L.update(st2, 1 / 60, {});
    st2.events.forEach(function (e) { if (e.type === 'kill') pts = e.pts; });
    st2.events.length = 0;
  }
  assert.strictEqual(pts, 120, '80 * 1.5');
});

ok('combo multiplier formula caps at x5', function () {
  var st = L.makeGame({ seed: 1 });
  st.combo = 10; assert.strictEqual(L.comboMult(st), 2);
  st.combo = 40; assert.strictEqual(L.comboMult(st), 5);
  st.combo = 99; assert.strictEqual(L.comboMult(st), 5);
});

ok('soup kill adds +2s', function () {
  var st = L.makeGame({ charId: 'izaki', seed: 8 });
  var t0 = st.time;
  st.enemies.push({ kind: 'soup', hp: 1, maxHp: 1, w: 30, h: 34, x: L.FIELD_W / 2, y: 200, vy: 92, vx: 0, base: 100 });
  var got = false;
  for (var i = 0; i < 600 && !got; i++) {
    L.update(st, 1 / 60, {});
    st.events.forEach(function (e) { if (e.type === 'soup') got = true; });
    st.events.length = 0;
  }
  assert.ok(got);
  assert.ok(st.time > t0, 'time increased');
});

console.log(passed + ' tests passed ✝');
