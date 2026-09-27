// エントリポイント
import { boot } from './game.js';

window.addEventListener('DOMContentLoaded', () => {
  boot().catch((e) => {
    console.error(e);
    document.getElementById('boot-error').classList.remove('hidden');
    document.getElementById('boot-error').textContent = '読み込みに失敗しました: ' + e.message;
  });
});
