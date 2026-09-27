/* Headless smoke test: runs the real main.js (renderer + UI wiring) against a stub DOM/canvas.
 * Drives a full 60s round through the shipped loop/draw/drainEvents/endGame paths. */
'use strict';
var fs = require('fs');
var path = require('path');

/* ---- minimal DOM/canvas stubs ---- */
function gradient() { return { addColorStop: function () {} }; }
function ctx2d() {
  return new Proxy({}, {
    get: function (t, p) {
      if (p === 'createLinearGradient') return gradient;
      if (p === 'canvas') return null;
      if (!(p in t)) t[p] = function () {};
      return t[p];
    },
    set: function (t, p, v) { t[p] = v; return true; }
  });
}
function el(id) {
  var e = {
    id: id, style: {}, dataset: {}, children: [],
    classList: { toggle: function () {}, add: function () {}, remove: function () {} },
    textContent: '', innerHTML: '',
    onclick: null,
    addEventListener: function () {},
    appendChild: function (c) { e.children.push(c); },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 480, height: 640 }; },
    getContext: function () { return ctx2d(); }
  };
  return e;
}
var els = {};
global.document = {
  getElementById: function (id) { return els[id] || (els[id] = el(id)); },
  createElement: function () { return el('dyn' + Math.random()); }
};
var winListeners = {};
global.window = {
  addEventListener: function (k, f) { winListeners[k] = f; },
  HonshitsuLogic: require('./logic.js'),
  AudioContext: undefined, webkitAudioContext: undefined
};
var store = {};
global.localStorage = {
  getItem: function (k) { return store[k] || null; },
  setItem: function (k, v) { store[k] = String(v); }
};
global.Image = function () {
  var self = this;
  Object.defineProperty(this, 'src', { set: function () { self.complete = true; if (self.onload) self.onload(); } });
};
var rafCb = null, rafId = 0;
global.requestAnimationFrame = function (cb) { rafCb = cb; return ++rafId; };
global.cancelAnimationFrame = function () { rafCb = null; };

/* ---- load the real browser shell ---- */
var src = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
new Function(src)();   // IIFE; sees window/document/etc via globals

/* ---- drive it: title -> select -> play a full round ---- */
els['btn-start'].onclick();
var cardCount = els['cards'].children.length;
if (cardCount !== 14) throw new Error('expected 14 character cards, got ' + cardCount);
console.log('  ✓ select screen built with ' + cardCount + ' cards');

els['btn-play'].onclick();
if (els['screen-game'].style.display !== 'flex') throw new Error('game screen not shown');
console.log('  ✓ game started');

/* wiggle the player via the real keydown/keyup handlers so it actually dodges */
var dir = 1;
function setKey(k, down) { winListeners[down ? 'keydown' : 'keyup']({ key: k, preventDefault: function () {} }); }
var ts = 0, frames = 0, nextFlip = 90;
while (rafCb && frames < 60 * 120) {
  if (frames % 300 === 0) winListeners.keydown({ key: ' ', preventDefault: function () {} });  // try special whenever gauge full
  if (frames === nextFlip) {
    setKey(dir > 0 ? 'ArrowRight' : 'ArrowLeft', false);
    dir = -dir;
    setKey(dir > 0 ? 'ArrowRight' : 'ArrowLeft', true);
    nextFlip = frames + 60 + (frames % 7) * 9;
  }
  var cb = rafCb; rafCb = null;
  ts += 16.7;
  cb(ts);
  frames++;
}
if (frames < 60 * 20) throw new Error('loop ended too early at frame ' + frames);
console.log('  ✓ ' + frames + ' frames (' + (frames / 60).toFixed(1) + 's) rendered without exception; round reached over');

/* endGame fires via drainEvents; ranking written to localStorage */
setTimeout(function () {
  if (els['screen-result'].style.display !== 'flex') throw new Error('result screen not shown');
  var rank = JSON.parse(store['honshitsu-rush-rank-v1'] || '[]');
  if (!rank.length) throw new Error('no ranking entry saved');
  console.log('  ✓ result screen shown; ranking saved: ' + rank.length + ' entries, top=' + rank[0].name + ' ' + rank[0].score);
  console.log('  ✓ hud score text: ' + els['res-score'].textContent);

  /* pause path */
  els['pausebtn'].onclick();
  els['pausebtn'].onclick();
  console.log('  ✓ pause toggles without error');
  console.log('smoke OK ✝');
  process.exit(0);
}, 1100);
