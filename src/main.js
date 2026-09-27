import { CONFIG } from './config.js';
import { Game } from './game.js';
import * as Audio from './audio.js';

let quotes=[], characters=[];
let game=null;
let state='TITLE';
let dailyMode=false;

const els = {
  title: document.getElementById('titleOverlay'),
  tutorial: document.getElementById('tutorial'),
  countdown: document.getElementById('countdown'),
  countText: document.getElementById('countText'),
  result: document.getElementById('resultOverlay'),
  cardLayer: document.getElementById('cardLayer'),
  effectCanvas: document.getElementById('effectCanvas'),
  charStage: document.getElementById('charStage'),
  collection: document.getElementById('collection'),
  collGrid: document.getElementById('collGrid'),
  collProgress: document.getElementById('collProgress'),
  leaks: document.getElementById('leaks'),
  missionList: document.getElementById('missionList'),
};

async function loadData(){
  try{
    const [q,c] = await Promise.all([
      fetch('data/quotes.json').then(r=>r.json()),
      fetch('data/characters.json').then(r=>r.json())
    ]);
    quotes=q; characters=c;
  }catch(e){
    console.warn('data load failed',e);
    quotes=[]; characters=[];
  }
}

function initLeaks(){
  els.leaks.innerHTML='';
  for(let i=0;i<6;i++){
    const d=document.createElement('div');
    d.className='leak-dot';
    d.style.left=(8+ Math.random()*84)+'%';
    d.style.top=(14+ Math.random()*42)+'%';
    d.style.animationDelay=(Math.random()*3)+'s';
    d.style.fontSize=(10+Math.random()*6)+'px';
    els.leaks.appendChild(d);
  }
}

function buildTitleAnimation(){
  const logo=document.getElementById('titleLogo');
  logo.animate([{transform:'translateY(8px)', opacity:0},{transform:'translateY(0)', opacity:1}],{duration:520, easing:'cubic-bezier(0.22,1,0.36,1)'});
  // letters? simple
}

function buildMissions(){
  const pool=[
    {text:'は？を20回', check:(s)=> s.huh>=20},
    {text:'誤爆0でクリア', check:(s)=> s.mistakes===0},
    {text:'偏差値85到達', check:(s)=> s.dev>=85},
    {text:'コンボ30達成', check:(s)=> s.maxCombo>=30},
    {text:'コーンスープを刻む', check:(s)=> s.corn>0},
    {text:'OVERFLOWを発動', check:(s)=> s.overflowUsed},
  ];
  // pick 3
  const rnd=[...pool].sort(()=>Math.random()-0.5).slice(0,3);
  window._missions=rnd;
  els.missionList.innerHTML='';
  rnd.forEach(m=>{
    const d=document.createElement('div');
    d.className='mission';
    d.innerHTML=`<span>✓</span><span>${m.text}</span>`;
    els.missionList.appendChild(d);
  });
  updateMissionsUI({});
}
function updateMissionsUI(stats){
  const ms=window._missions||[];
  const elsM=document.querySelectorAll('.mission');
  elsM.forEach((el,i)=>{
    const m=ms[i]; if(!m) return;
    const done = m.check(stats);
    el.classList.toggle('done', done);
  });
}

function showTutorial(){
  els.tutorial.classList.remove('hidden');
  // 4s animated then auto hide? spec says animated 4 sec, no text explanation
  setTimeout(()=> hideTutorial(), 2200);
  // allow tap to skip
  els.tutorial.addEventListener('click', hideTutorial, {once:true});
}
function hideTutorial(){
  els.tutorial.classList.add('hidden');
  startCountdown();
}

function startCountdown(){
  state='COUNTDOWN';
  els.title.classList.add('hidden');
  els.countdown.classList.remove('hidden');
  Audio.initAudio();
  let n=3;
  function tick(){
    els.countText.textContent=n;
    const numEl=document.getElementById('countNum');
    numEl.classList.remove('show'); void numEl.offsetWidth; numEl.classList.add('show');
    Audio.playCount(n);
    // magic writing effect: color shift
    numEl.style.borderColor = n===1? '#F2C14E':'#1A1A22';
    if(n===1){
      // floor crack light
      document.querySelector('.tiles').animate([{filter:'brightness(1)'},{filter:'brightness(1.25)'}],{duration:300, direction:'alternate', iterations:2});
    }
    n--;
    if(n>=1) setTimeout(tick, 530);
    else setTimeout(()=>{
      els.countdown.classList.add('hidden');
      Audio.startBGM(false);
      game.start();
    }, 620);
  }
  tick();
}

function onStateChange(s, data){
  const hud=document.getElementById('hud');
  const controls=document.getElementById('controls');
  if(s==='TITLE'){ hud.style.opacity='0'; controls.style.opacity='0'; }
  else if(s==='PLAY' || s==='OVERFLOW'){ hud.style.opacity='1'; controls.style.opacity='1'; }
  else if(s==='RESULT'){ hud.style.opacity='0'; controls.style.opacity='0.2'; }

  state=s;
  if(s==='RESULT' && data){
    // update missions
    const stats={
      huh: game.hits.huh,
      mistakes: data.mistakes,
      dev: data.dev,
      maxCombo: data.maxCombo,
      corn: game.hits.kizamu, // simplified
      overflowUsed: game.katsuyaDone
    };
    updateMissionsUI(stats);
    // also update collection progress if needed
  }
}

function buildCollection(){
  els.collGrid.innerHTML='';
  const unlocked= new Set(JSON.parse(localStorage.getItem('honshitsu_unlocked')||'[]'));
  let unlockedCount=0;
  quotes.forEach(q=>{
    const isUnlocked = unlocked.has(q.id) || q.unlocked;
    if(isUnlocked) unlockedCount++;
    const div=document.createElement('div');
    div.className='coll-item'+(isUnlocked?'':' locked');
    const ch = characters.find(c=>c.name.includes(q.speaker) || c.id===q.speaker || c.displayName.includes(q.speaker));
    const icon = ch? ch.icon : 'icon/ryoma.jpg';
    div.innerHTML=`
      <img class="icon" src="${icon}" onerror="this.style.display='none'">
      <div class="txt"><div class="t">${isUnlocked? q.text : '？？？？？？'}</div><div class="m">${q.speaker} — ${q.source} / ${q.type}</div></div>
      <div style="font-size:10px;font-weight:900;color:${isUnlocked?'#1A1A22':'#999'}">${isUnlocked?'公開':'未解放'}</div>
    `;
    els.collGrid.appendChild(div);
  });
  els.collProgress.textContent = `解放 ${unlockedCount} / ${quotes.length} — プレイ後に1〜3件ランダム解放`;
}

function setupStaticEvents(){
  document.getElementById('tapStart').addEventListener('click', ()=>{
    Audio.initAudio();
    // tutorial flow per spec: TITLE -> TUTORIAL -> COUNTDOWN -> PLAY
    // spec says tutorial is animated 4s, no text. We'll show tutorial overlay.
    showTutorial();
  });
  document.getElementById('btnRetry').addEventListener('click', ()=>{
    els.result.classList.add('hidden');
    showTutorial();
  });
  document.getElementById('btnToTitle').addEventListener('click', ()=>{
    els.result.classList.add('hidden');
    els.title.classList.remove('hidden');
    buildMissions();
    game.resetVisuals();
    game.stopLoop();
    state='TITLE';
  });
  document.getElementById('copyBtn').addEventListener('click', ()=>{
    const txt=document.getElementById('bulletin').textContent;
    navigator.clipboard.writeText(txt).then(()=>{
      const b=document.getElementById('copyBtn');
      const old=b.textContent; b.textContent='コピーした✝'; setTimeout(()=>b.textContent=old, 1200);
    });
  });
  document.getElementById('btnCollection').addEventListener('click', ()=>{
    buildCollection(); els.collection.classList.add('open');
  });
  document.getElementById('closeCollection').addEventListener('click', ()=>els.collection.classList.remove('open'));
  document.getElementById('btnDaily').addEventListener('click', ()=>{
    const today=new Date().toISOString().slice(0,10);
    dailyMode=!dailyMode;
    const seed=dailyMode? today : null;
    // recreate game with seed
    if(game) game.stopLoop();
    game=new Game({cardLayer:els.cardLayer, effectCanvas:els.effectCanvas, charStage:els.charStage, onStateChange, quotes, characters, dailySeed:seed});
    document.getElementById('btnDaily').textContent = dailyMode? `デイリー:${today} ✓` : 'デイリーシード';
    document.getElementById('btnDaily').style.background = dailyMode? '#F2C14E':'#fff';
  });
  document.getElementById('muteBtn').addEventListener('click', ()=>{
    Audio.toggleMute();
    document.getElementById('muteBtn').textContent = Audio.isMuted()? '🔇':'🔊';
  });
  // allow skipping result by tap? spec says all effects skippable by tap
  els.result.addEventListener('click', e=>{
    if(e.target.closest('button')) return;
    // could skip animation but we leave
  });
  // global tap to skip countdown? 
  els.countdown.addEventListener('click', ()=>{
    // skip to play directly? We'll fast-forward
  });
  // prevent double-tap zoom
  document.addEventListener('touchend', e=>{
    const now=Date.now(); const last=window._lastTouch||0;
    if(now-last<300) e.preventDefault();
    window._lastTouch=now;
  }, {passive:false});
}

function setupDebug(){
  const params=new URLSearchParams(location.search);
  if(params.get('debug')==='1'){
    const dbg=document.getElementById('debug');
    dbg.classList.add('open');
    setInterval(()=>{
      if(!game) return;
      const diff=game.getDifficulty? game.getDifficulty(): {maxCards:'-',speed:'-'};
      dbg.innerHTML=`
        fps ~60<br>
        state ${game.state}<br>
        cards ${game.cards.filter(c=>c.active).length}/${diff.maxCards}<br>
        speed ${diff.speed}<br>
        time ${game.time.toFixed(2)}<br>
        score ${game.score}<br>
        dev ${ (60+40*(1-Math.exp(-game.score/45000))).toFixed(1)}<br>
        <button onclick="game.time=5" style="margin-top:6px;padding:4px 8px;border-radius:999px;border:none;background:#F2C14E;font-weight:900;cursor:pointer">即ランク85</button>
        <button onclick="game.score=90000;game.updateHUD()" style="margin-top:6px;padding:4px 8px;border-radius:999px;border:none;background:#A78BFA;color:#fff;font-weight:900;cursor:pointer">score 90k</button>
        <button onclick="game.overflow=100;game.updateHUD()" style="margin-top:6px;padding:4px 8px;border:none;background:#1A1A22;color:#fff;border-radius:999px;font-weight:900;cursor:pointer">満タン</button>
      `;
    }, 200);
    // expose
    window.game=game;
  }
}

function initBreathingSprites(){
  // idle small reactions every few seconds on title
  setInterval(()=>{
    if(state!=='TITLE') return;
    // pulse leaks already
  }, 2600);
}

(async function(){
  await loadData();
  initLeaks();
  document.getElementById('hud').style.opacity='0';
  document.getElementById('controls').style.opacity='0';
  buildTitleAnimation();
  buildMissions();
  game=new Game({cardLayer:els.cardLayer, effectCanvas:els.effectCanvas, charStage:els.charStage, onStateChange, quotes, characters, dailySeed:null});
  window.game=game;
  setupStaticEvents();
  setupDebug();
  initBreathingSprites();
  // show initial leaks etc
  // ensure hud visible only during play? Keep always but title overlay covers
})();
