/* ✝本質 RUSH — browser shell: screens, canvas renderer, input, audio, ranking. */
(function () {
  'use strict';
  var L = window.HonshitsuLogic;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- audio (WebAudio, no assets) ---------- */
  var AudioFX = (function () {
    var ctx = null, muted = false;
    function ac() {
      if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur, type, vol, slide) {
      if (muted) return;
      var c = ac(); if (!c) return;
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, c.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.05, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + dur + 0.02);
    }
    return {
      shoot: function () { tone(880, 0.05, 'square', 0.02, -300); },
      hit: function () { tone(220, 0.06, 'sawtooth', 0.04); },
      kill: function (combo) { tone(440 + Math.min(combo, 24) * 30, 0.09, 'square', 0.05, 200); },
      essence: function () { tone(660, 0.12, 'triangle', 0.06, 440); tone(990, 0.18, 'triangle', 0.05, 330); },
      soup: function () { tone(520, 0.1, 'sine', 0.06, 260); },
      penalty: function () { tone(160, 0.3, 'sawtooth', 0.07, -90); },
      special: function () { tone(200, 0.5, 'sawtooth', 0.07, 900); },
      boss: function () { tone(90, 0.4, 'sawtooth', 0.07, 40); },
      bossdown: function () { tone(330, 0.3, 'square', 0.06, 660); },
      tick: function () { tone(1200, 0.05, 'square', 0.04); },
      over: function () { tone(520, 0.25, 'triangle', 0.06, -260); tone(390, 0.4, 'triangle', 0.06, -200); },
      toggle: function () { muted = !muted; return muted; }
    };
  })();

  /* ---------- ranking (localStorage) ---------- */
  var RANK_KEY = 'honshitsu-rush-rank-v1';
  function loadRank() { try { return JSON.parse(localStorage.getItem(RANK_KEY)) || []; } catch (e) { return []; } }
  function saveRank(list) { try { localStorage.setItem(RANK_KEY, JSON.stringify(list)); } catch (e) {} }
  function submitScore(entry) {
    var list = loadRank();
    list.push(entry);
    list.sort(function (a, b) { return b.score - a.score; });
    list = list.slice(0, 8);
    saveRank(list);
    return list.indexOf(entry);
  }

  /* ---------- asset preload ---------- */
  var sprites = {}, faces = {};
  function loadImages(map, list, kind, cb) {
    var left = list.length;
    if (!left) return cb();
    list.forEach(function (ch) {
      var img = new Image();
      img.onload = img.onerror = function () { if (--left === 0) cb(); };
      img.src = 'assets/' + kind + 's/' + ch.id + (kind === 'face' ? '.jpg' : '.png');
      map[ch.id] = img;
    });
  }

  /* ---------- state ---------- */
  var st = null;                 // logic state
  var raf = 0, lastTs = 0, paused = false;
  var popups = [], shake = 0;
  var selectedChar = 'ryoma', difficulty = 'normal';
  var keys = {};
  var pointer = { active: false, x: L.FIELD_W / 2 };

  var canvas = $('cv'), g = canvas.getContext('2d');

  function show(name) {
    ['title', 'select', 'game', 'result'].forEach(function (s) {
      $('screen-' + s).style.display = (s === name) ? 'flex' : 'none';
    });
  }

  /* ---------- title / select wiring ---------- */
  function buildSelect() {
    var wrap = $('cards');
    wrap.innerHTML = '';
    L.CHARACTERS.forEach(function (ch) {
      var d = document.createElement('div');
      d.className = 'card' + (ch.id === selectedChar ? ' sel' : '');
      d.dataset.id = ch.id;
      d.innerHTML =
        '<img src="assets/sprites/' + ch.id + '.png" alt="' + ch.name + '">' +
        '<div class="cname">' + ch.name + '</div>' +
        '<div class="ctitle">' + ch.title + '</div>' +
        '<div class="stats">' +
        stat('速', ch.spd) + stat('射', ch.fire) + stat('力', ch.pwr) + stat('運', ch.lck) +
        '</div>';
      d.onclick = function () {
        selectedChar = ch.id;
        Array.prototype.forEach.call(wrap.children, function (c) { c.classList.toggle('sel', c.dataset.id === ch.id); });
        AudioFX.kill(2);
      };
      wrap.appendChild(d);
    });
  }
  function stat(label, v) {
    return '<span class="st"><i>' + label + '</i><b>' + '●'.repeat(v) + '○'.repeat(5 - v) + '</b></span>';
  }

  function buildRank() {
    var list = loadRank();
    var html;
    if (!list.length) html = '<li class="empty">まだ記録なし。初プレイで名前を刻め。</li>';
    else html = list.map(function (r, i) {
      return '<li><span class="rk">' + (i + 1) + '</span><span class="rn">' + r.name + '</span>' +
        '<span class="rd">' + (r.diff === 'hard' ? '本質' : '通常') + '</span>' +
        '<span class="rs">' + r.score.toLocaleString() + '</span></li>';
    }).join('');
    ['ranklist', 'ranklist-sel'].forEach(function (id) { var el = $(id); if (el) el.innerHTML = html; });
  }
  /* ---------- game flow ---------- */
  function startGame() {
    st = L.makeGame({ charId: selectedChar, difficulty: difficulty, seed: (Date.now() % 1e9) });
    popups = []; shake = 0; paused = false;
    $('pausebtn').textContent = '⏸';
    show('game');
    lastTs = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function endGame() {
    cancelAnimationFrame(raf);
    AudioFX.over();
    var rank = submitScore({ name: st.char.name, score: st.score, diff: difficulty, date: Date.now() });
    $('res-score').textContent = st.score.toLocaleString();
    $('res-kills').textContent = st.kills;
    $('res-combo').textContent = '×' + (1 + Math.min(st.maxCombo, 40) * 0.1).toFixed(1) + '（' + st.maxCombo + '連続）';
    $('res-rank').textContent = rank >= 0 ? (rank + 1) + '位' : '圏外';
    buildRank();
    setTimeout(function () { show('result'); }, 900);
  }

  /* ---------- input ---------- */
  window.addEventListener('keydown', function (e) {
    keys[e.key] = true;
    if (e.key === ' ' && st && !st.over) { st.specialQueued = true; e.preventDefault(); }
    if ((e.key === 'p' || e.key === 'P') && st && !st.over) togglePause();
  });
  window.addEventListener('keyup', function (e) { keys[e.key] = false; });
  window.addEventListener('blur', function () { if (st && !st.over) paused = true, $('pausebtn').textContent = '▶'; });

  canvas.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) / r.width * L.FIELD_W;
    pointer.active = true;
  });
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (st && !st.over) st.specialQueued = true;
  });

  function togglePause() {
    paused = !paused;
    $('pausebtn').textContent = paused ? '▶' : '⏸';
  }

  function readInput() {
    var inp = {
      left: keys['ArrowLeft'] || keys['a'] || keys['A'],
      right: keys['ArrowRight'] || keys['d'] || keys['D'],
      up: keys['ArrowUp'] || keys['w'] || keys['W'],
      down: keys['ArrowDown'] || keys['s'] || keys['S'],
      special: !!st.specialQueued
    };
    st.specialQueued = false;
    if (pointer.active) {
      var p = st.player;
      if (Math.abs(pointer.x - p.x) > 4) {
        if (pointer.x > p.x) inp.right = true; else inp.left = true;
      }
    }
    return inp;
  }

  /* ---------- events → fx ---------- */
  function drainEvents() {
    st.events.forEach(function (e) {
      switch (e.type) {
        case 'shoot': AudioFX.shoot(); break;
        case 'hit': AudioFX.hit(); break;
        case 'kill': AudioFX.kill(st.combo); pop(e.x, e.y, '+' + e.pts, '#ffd76a'); break;
        case 'essence': AudioFX.essence(); pop(e.x, e.y, '✝本質✝ +' + e.pts, '#ffe9a8'); break;
        case 'soup': AudioFX.soup(); pop(e.x, e.y, 'スープ +2s +' + e.pts, '#9fe3ff'); break;
        case 'penalty': AudioFX.penalty(); pop(st.player.x, st.player.y - 40, '-' + e.secs + '秒！', '#ff7d7d'); shake = 8; break;
        case 'special': AudioFX.special(); pop(L.FIELD_W / 2, 300, '✝本質解放✝', '#fff3c4'); shake = 10; break;
        case 'bossspawn': AudioFX.boss(); pop(L.FIELD_W / 2, 140, '強敵出現！', '#ff9d9d'); break;
        case 'bosshit': break;
        case 'bossdown': AudioFX.bossdown(); pop(e.x, e.y, '撃破 +' + e.pts + ' +3s', '#c4ff9d'); shake = 8; break;
        case 'bossesc': pop(L.FIELD_W / 2, 140, '逃げられた… -' + e.secs + 's', '#ff7d7d'); break;
        case 'last5': break;
        case 'over': endGame(); break;
      }
    });
    st.events.length = 0;
  }
  function pop(x, y, text, color) { popups.push({ x: x, y: y, t: 0, text: text, color: color }); }

  /* ---------- main loop ---------- */
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.033, (ts - lastTs) / 1000);
    lastTs = ts;
    if (paused) { drawPause(); return; }
    L.update(st, dt, readInput());
    drainEvents();
    if (st.over && !st._ended) { st._ended = true; }
    draw(dt);
  }

  /* ---------- drawing ---------- */
  function draw(dt) {
    var W = L.FIELD_W, H = L.FIELD_H;
    g.save();
    if (shake > 0) { shake = Math.max(0, shake - 30 * dt); g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); }

    /* classroom dusk bg */
    var bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#141a2e'); bg.addColorStop(0.6, '#232c4a'); bg.addColorStop(1, '#3a2f45');
    g.fillStyle = bg; g.fillRect(-10, -10, W + 20, H + 20);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    for (var i = 0; i < 7; i++) {
      var yy = ((st.t * 24 + i * 110) % (H + 60)) - 30;
      g.fillText('✝', 30 + i * 68, yy);
    }
    /* blackboard strip */
    g.fillStyle = 'rgba(20,60,45,0.35)';
    g.fillRect(0, 0, W, 26);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.font = '12px monospace';
    g.fillText('偏差値60の教室から✝本質✝が漏れ出している件について', 12, 17);

    /* bullets */
    g.textAlign = 'center';
    st.bullets.forEach(function (b) {
      g.fillStyle = '#ffd76a';
      g.font = 'bold 16px serif';
      g.fillText('✝', b.x, b.y + 6);
    });

    /* enemies */
    st.enemies.forEach(function (e) {
      if (e.kind === 'block') {
        g.fillStyle = e.num >= 70 ? '#7d2b3a' : e.num >= 50 ? '#33406e' : '#2c5a4f';
        roundRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h, 6); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.stroke();
        g.fillStyle = '#fff'; g.font = 'bold 15px monospace';
        g.fillText(e.num, e.x, e.y + 5);
        if (e.hp < e.maxHp) { g.fillStyle = 'rgba(255,255,255,0.5)'; g.font = '8px monospace'; g.fillText('偏差', e.x, e.y - e.h / 2 - 3); }
      } else if (e.kind === 'exam') {
        g.fillStyle = '#e9e4d8';
        roundRect(e.x - e.w / 2, e.y - e.h / 2, e.w, e.h, 4); g.fill();
        g.fillStyle = '#5a5346'; g.font = '8px sans-serif';
        g.fillText('模試順位表', e.x, e.y - 6);
        for (var l = 0; l < 3; l++) g.fillRect(e.x - e.w / 2 + 6, e.y + l * 7, e.w - 12, 2);
        g.fillStyle = '#c0392b'; g.font = 'bold 9px monospace';
        g.fillText('×' + e.hp, e.x + e.w / 2 - 8, e.y - e.h / 2 + 9);
      } else if (e.kind === 'essence') {
        var glow = 8 + Math.sin(st.t * 8) * 3;
        g.fillStyle = 'rgba(255,220,120,0.25)';
        g.beginPath(); g.arc(e.x, e.y, glow + 8, 0, 7); g.fill();
        g.fillStyle = '#ffd76a'; g.font = 'bold 20px serif';
        g.fillText('✝', e.x, e.y + 7);
      } else { /* soup */
        g.fillStyle = '#e8e3da';
        roundRect(e.x - 11, e.y - 13, 22, 26, 5); g.fill();
        g.fillStyle = '#e5b64e'; g.fillRect(e.x - 11, e.y - 13, 22, 7);
        g.fillStyle = '#7a6b4f'; g.font = '7px sans-serif';
        g.fillText('コーン', e.x, e.y + 3); g.fillText('スープ', e.x, e.y + 11);
      }
    });

    /* boss */
    if (st.boss) {
      var bo = st.boss, face = faces[bo.face];
      g.save();
      g.beginPath(); g.arc(bo.x, bo.y, 52, 0, 7); g.clip();
      if (face && face.complete) g.drawImage(face, bo.x - 52, bo.y - 52, 104, 104);
      else { g.fillStyle = '#552'; g.fill(); }
      g.restore();
      g.lineWidth = 3; g.strokeStyle = '#ff5d5d';
      g.beginPath(); g.arc(bo.x, bo.y, 52, 0, 7); g.stroke();
      g.lineWidth = 1;
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(bo.x - 50, bo.y - 66, 100, 8);
      g.fillStyle = '#ff5d5d'; g.fillRect(bo.x - 50, bo.y - 66, 100 * Math.max(0, bo.hp / bo.maxHp), 8);
      g.fillStyle = '#fff'; g.font = 'bold 11px sans-serif';
      g.fillText('強敵・' + (L.charById(bo.face).name), bo.x, bo.y + 68);
    }

    /* player */
    var p = st.player;
    var spr = sprites[st.char.id];
    if (st.inv > 0 && Math.floor(st.t * 12) % 2 === 0) g.globalAlpha = 0.4;
    if (spr && spr.complete) g.drawImage(spr, p.x - 28, p.y - 46, 56, 84);
    else { g.fillStyle = '#88f'; g.fillRect(p.x - 17, p.y - 23, 34, 46); }
    g.globalAlpha = 1;
    if (st.specialT > 0) {
      g.strokeStyle = 'rgba(255,230,150,' + (st.specialT) + ')';
      g.lineWidth = 4;
      g.beginPath(); g.arc(p.x, p.y, 60 * (1.2 - st.specialT), 0, 7); g.stroke();
      g.lineWidth = 1;
    }

    /* popups */
    popups = popups.filter(function (pp) { return pp.t < 1.1; });
    popups.forEach(function (pp) {
      pp.t += dt; pp.y -= 40 * dt;
      g.globalAlpha = Math.max(0, 1.1 - pp.t);
      g.fillStyle = pp.color; g.font = 'bold 14px sans-serif';
      g.fillText(pp.text, pp.x, pp.y);
      g.globalAlpha = 1;
    });

    /* hit flash */
    if (st.flash > 0) { g.fillStyle = 'rgba(255,60,60,' + st.flash * 0.6 + ')'; g.fillRect(-10, -10, W + 20, H + 20); }
    g.restore();

    /* HUD */
    $('hud-score').textContent = st.score.toLocaleString();
    $('hud-time').textContent = Math.max(0, st.time).toFixed(1);
    $('hud-time').classList.toggle('danger', st.time <= 5);
    $('hud-combo').textContent = st.combo >= 2 ? 'COMBO ' + st.combo + '（×' + (1 + Math.min(st.combo, 40) * 0.1).toFixed(1) + '）' : '';
    $('hud-gauge').style.width = st.gauge + '%';
    $('hud-special').classList.toggle('ready', st.gauge >= 100);
    $('hud-special').textContent = st.gauge >= 100 ? '✝本質解放✝ SPACE / TAP' : '本質ゲージ ' + Math.floor(st.gauge) + '%';
  }

  function drawPause() {
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, L.FIELD_W, L.FIELD_H);
    g.fillStyle = '#fff'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center';
    g.fillText('PAUSE', L.FIELD_W / 2, L.FIELD_H / 2);
  }

  function roundRect(x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ---------- boot ---------- */
  $('btn-start').onclick = function () { AudioFX.kill(4); buildSelect(); buildRank(); show('select'); };
  $('btn-back').onclick = function () { show('title'); };
  $('btn-play').onclick = function () { startGame(); };
  $('btn-retry').onclick = function () { startGame(); };
  $('btn-reselect').onclick = function () { buildSelect(); show('select'); };
  $('pausebtn').onclick = togglePause;
  $('btn-mute').onclick = function () { var m = AudioFX.toggle(); this.textContent = m ? '🔇' : '🔊'; };
  $('diff').onclick = function () {
    difficulty = difficulty === 'normal' ? 'hard' : 'normal';
    this.textContent = difficulty === 'normal' ? '難易度：通常' : '難易度：✝本質✝（スコア1.5倍・ペナ大）';
    this.classList.toggle('hard', difficulty === 'hard');
  };

  show('title');
  loadImages(sprites, L.CHARACTERS, 'sprite', function () {
    loadImages(faces, L.CHARACTERS, 'face', function () { /* ready */ });
  });
})();
