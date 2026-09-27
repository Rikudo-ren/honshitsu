import { CONFIG, deviationFromScore, rankFromDeviation } from './config.js';
import * as Audio from './audio.js';

const STATE = {
  BOOT:'BOOT', TITLE:'TITLE', TUTORIAL:'TUTORIAL', COUNTDOWN:'COUNTDOWN', PLAY:'PLAY', OVERFLOW:'OVERFLOW', TIMEUP:'TIMEUP', RESULT:'RESULT'
};

function seededRandom(seed){
  let s = 0;
  for(let i=0;i<seed.length;i++) s = (s*9301+49297) % 233280 + seed.charCodeAt(i);
  return function(){
    s = (s*9301+49297)%233280;
    return s/233280;
  };
}

export class Game{
  constructor({cardLayer, effectCanvas, hud, charStage, onStateChange, quotes, characters, dailySeed}){
    this.cardLayer = cardLayer;
    this.canvas = effectCanvas;
    this.ctx = effectCanvas.getContext('2d');
    this.hud = hud;
    this.charStage = charStage;
    this.onStateChange = onStateChange;
    this.quotes = quotes;
    this.characters = characters;
    this.dailySeed = dailySeed;
    this.rand = dailySeed ? seededRandom(dailySeed) : Math.random;
    this.state = STATE.BOOT;
    this.time = CONFIG.GAME_DURATION;
    this.elapsed = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.multiplier = 1;
    this.overflow = 0;
    this.isOverflow = false;
    this.overflowTime = 0;
    this.mistakes = 0;
    this.huhStreak = 0;
    this.timeSinceMiss = 0;
    this.reiBuff = 0;
    this.mieGuard = 0;
    this.satoSlow = 0;
    this.katsuyaActive = false;
    this.katsuyaDone = false;
    this.spawnAcc = 0;
    this.cards = []; // active pooled
    this.pool = [];
    this.particles = [];
    this.lastTick = performance.now();
    this.raf = null;
    this.running = false;
    this.dragging = false;
    this.lastPointer = null;
    this.hits = {kizamu:0, huh:0};
    this.playCount = parseInt(localStorage.getItem('honshitsu_playcount')||'0');
    this.highScore = parseInt(localStorage.getItem('honshitsu_high')||'0');
    this.unlockedSet = new Set(JSON.parse(localStorage.getItem('honshitsu_unlocked')||'[]'));
    this.quotes.forEach(q=>{ if(q.unlocked) this.unlockedSet.add(q.id); });

    // build pool 12 cards
    for(let i=0;i<14;i++) this.createPooledCard();

    // setup canvas size
    this.resize();
    window.addEventListener('resize', ()=>this.resize());
    this.setupInput();
    this.updateHUD();
  }
  resize(){
    const rect = this.cardLayer.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width+'px';
    this.canvas.style.height = rect.height+'px';
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
    this.layerW = rect.width;
    this.layerH = rect.height;
  }
  createPooledCard(){
    const el = document.createElement('div');
    el.className='card';
    el.innerHTML=`<div class="card-text"></div><div class="card-meta"><div class="type-badge"></div><div class="speaker"></div></div>`;
    el.style.display='none';
    this.cardLayer.appendChild(el);
    const obj = {el, active:false, y:0, speed:0, type:'honshitsu', quote:null, durability:1, rarity:false};
    this.pool.push(obj);
    return obj;
  }
  acquireCard(){
    let c = this.pool.find(p=>!p.active);
    if(!c) c=this.createPooledCard();
    c.active=true; c.el.style.display='flex';
    c.el.className='card';
    c.el.style.transform='translateX(-50%) translateY(0)';
    c.el.style.opacity='1';
    return c;
  }
  releaseCard(c){
    c.active=false; c.el.style.display='none'; c.el.className='card';
    c.quote=null;
  }
  setState(s){
    this.state=s;
    if(this.onStateChange) this.onStateChange(s);
  }
  setupInput(){
    const btnK = document.getElementById('btnKizamu');
    const btnH = document.getElementById('btnHuh');
    const btnO = document.getElementById('btnOverflow');
    btnK.addEventListener('click', ()=> this.handleAction('kizamu'));
    btnH.addEventListener('click', ()=> this.handleAction('huh'));
    btnO.addEventListener('click', ()=> this.tryOverflow());
    // keyboard
    window.addEventListener('keydown', e=>{
      if(e.repeat) return;
      if(e.key==='z' || e.key==='Z' || e.key==='ArrowLeft') this.handleAction('kizamu');
      if(e.key==='x' || e.key==='X' || e.key==='ArrowRight') this.handleAction('huh');
      if(e.code==='Space') { e.preventDefault(); this.tryOverflow(); }
    });
    // swipe / drag on card layer
    let startY=0, startX=0, startTime=0;
    const layer = this.cardLayer;
    layer.addEventListener('touchstart', e=>{
      if(e.touches.length!==1) return;
      const t=e.touches[0]; startY=t.clientY; startX=t.clientX; startTime=Date.now();
      this.dragging=true; this.lastPointer={x:t.clientX, y:t.clientY};
    }, {passive:false});
    layer.addEventListener('touchmove', e=>{
      if(!this.dragging) return;
      const t=e.touches[0];
      if(this.katsuyaActive){
        this.sliceCheck(t.clientX, t.clientY);
      }
      this.lastPointer={x:t.clientX,y:t.clientY};
      e.preventDefault();
    }, {passive:false});
    layer.addEventListener('touchend', e=>{
      if(!this.dragging) return;
      const t=e.changedTouches[0];
      const dy = t.clientY - startY;
      const dt = Date.now()-startTime;
      if(!this.katsuyaActive){
        if(dy>40 && dt<400) this.handleAction('huh');
        else if(Math.abs(dy)<30 && dt<400) this.handleAction('kizamu');
      }
      this.dragging=false;
    });
    layer.addEventListener('mousedown', e=>{
      if(e.button!==0) return;
      this.dragging=true; this.lastPointer={x:e.clientX,y:e.clientY};
      startY=e.clientY; startTime=Date.now();
    });
    layer.addEventListener('mousemove', e=>{
      if(!this.dragging) return;
      if(this.katsuyaActive) this.sliceCheck(e.clientX,e.clientY);
    });
    layer.addEventListener('mouseup', e=>{
      if(!this.dragging) return;
      const dy = e.clientY - startY;
      const dt = Date.now()- startTime;
      if(!this.katsuyaActive){
        if(e.button===2 || dy>50) {} // right handled separately
        else if(Math.abs(dy)<30 && dt<300) this.handleAction('kizamu');
      }
      this.dragging=false;
    });
    layer.addEventListener('contextmenu', e=>{
      e.preventDefault(); this.handleAction('huh');
    });
    // also allow clicking card directly
    layer.addEventListener('click', e=>{
      const cardEl = e.target.closest('.card');
      if(cardEl){
        // auto target bottommost anyway, so just kizamu
        // if click near bottom half treat as huh? keep simple: kizamu
        this.handleAction('kizamu');
      }
    });
  }
  sliceCheck(cx,cy){
    const rect = this.cardLayer.getBoundingClientRect();
    const x = cx - rect.left;
    const y = cy - rect.top;
    // check intersection with active cards
    for(const c of this.cards){
      if(!c.active) continue;
      const top = c.y;
      const bottom = c.y + (c.type==='gen'?118: c.type==='rare'?96:86);
      const left = this.layerW/2 - (c.type==='gen'?170:155);
      const right = left + (c.type==='gen'?340:310);
      if(x>=left && x<=right && y>=top && y<=bottom){
        // slice hit: auto judge correctly based on type
        const isHon = this.isHonshitsuType(c.type, c.quote);
        // In katsuya mode, slicing is always success small
        this.processHit(c, isHon? 'kizamu':'huh', true);
        break; // one per move
      }
    }
  }
  isHonshitsuType(type, quote){
    if(type==='honshitsu' || type==='rare' || type==='gen') return true;
    if(type==='fake_katsu' || type==='a_honshitsu' || type==='noise' || type==='schrodinger') return false;
    // schrodinger is special 50/50
    return false;
  }

  // Quotes selection weighted
  pickQuoteByType(type){
    const pool = this.quotes.filter(q=> q.type===type);
    if(pool.length===0) return null;
    // weighted
    let total=0; pool.forEach(q=> total+=q.weight);
    let r = this.rand()*total;
    for(const q of pool){ r-=q.weight; if(r<=0) return q; }
    return pool[pool.length-1];
  }
  pickRandomTypeForDifficulty(diff){
    const w = diff.weights;
    const entries = Object.entries(w).filter(([k,v])=>v>0);
    const total = entries.reduce((s,[k,v])=>s+v,0);
    let r=this.rand()*total;
    for(const [k,v] of entries){ r-=v; if(r<=0) return k; }
    return 'honshitsu';
  }

  start(){
    this.time = CONFIG.GAME_DURATION;
    this.elapsed=0; this.score=0; this.combo=0; this.maxCombo=0; this.multiplier=1;
    this.overflow=0; this.isOverflow=false; this.overflowTime=0;
    this.mistakes=0; this.huhStreak=0; this.timeSinceMiss=0; this.reiBuff=0; this.mieGuard=0; this.satoSlow=0;
    this.katsuyaActive=false; this.katsuyaDone=false;
    this.spawnAcc=0;
    this.hits={kizamu:0,huh:0};
    this.cards.forEach(c=>this.releaseCard(c)); this.cards=[];
    this.particles=[];
    this.setState(STATE.PLAY);
    Audio.startBGM(false);
    this.lastTick=performance.now();
    this.running=true;
    if(this.raf) cancelAnimationFrame(this.raf);
    this.loop();
  }
  loop(){
    if(!this.running) return;
    const now=performance.now();
    let dt = (now - this.lastTick)/1000;
    dt = Math.min(dt, 0.05); // clamp
    this.lastTick=now;
    this.update(dt);
    this.render(dt);
    this.raf=requestAnimationFrame(()=>this.loop());
  }
  stopLoop(){
    this.running=false;
    if(this.raf) cancelAnimationFrame(this.raf);
    Audio.stopBGM();
  }

  update(dt){
    if(this.state!==STATE.PLAY && this.state!==STATE.OVERFLOW) return;

    // slow handling
    let timeScale = 1;
    if(this.satoSlow>0) { timeScale*=CONFIG.SLOW_FACTOR_SATO; this.satoSlow-=dt; if(this.satoSlow<=0){ this.satoSlow=0; this.clearSlowFx(); } }
    if(this.isOverflow) timeScale=1; // overflow stops timer but not falling? spec says timer stop, but falling continues in fever (all honshitsu, spam)
    const scaledDt = dt * timeScale;

    // timer
    if(!this.isOverflow){
      this.time -= dt;
      if(this.time <= 10 && this.time+dt>10){
        // heart beat will be visual
      }
      if(this.time <=0){
        this.time=0;
        this.triggerTimeUp();
        return;
      }
    } else {
      this.overflowTime -= dt;
      if(this.overflowTime<=0){
        this.endOverflow();
      }
    }
    this.elapsed += dt;
    this.timeSinceMiss += dt;
    if(this.reiBuff>0){ this.reiBuff-=dt; if(this.reiBuff<=0) this.reiBuff=0; }
    if(this.mieGuard>0){ this.mieGuard-=dt; if(this.mieGuard<=0) this.mieGuard=0; }

    // check katsuya trigger at 30s remaining exactly once
    if(!this.katsuyaDone && this.time<=30.0 && this.time>28){
      this.katsuyaDone=true;
      this.triggerKatsuya();
    }

    // random sato etc
    if(!this.isOverflow && this.rand()< CONFIG.SATO_CHANCE * dt * 2){
      this.triggerSato();
    }
    if(!this.isOverflow && this.rand()< CONFIG.KURAISHI_CHANCE * dt *1.5){
      this.triggerKuraishi();
    }
    if(!this.isOverflow && this.rand()< CONFIG.SAKURA_CHANCE * dt *1.2){
      this.triggerSakura();
    }

    // spawn
    const diff = this.getDifficulty();
    this.spawnAcc += dt*1000;
    const interval = this.isOverflow ? 180 : diff.interval / (this.satoSlow>0?1.3:1);
    while(this.spawnAcc >= interval){
      this.spawnAcc-=interval;
      if(this.cards.filter(c=>c.active).length < (this.isOverflow? 6 : diff.maxCards) + (this.katsuyaActive?2:0)){
        this.spawnCard(diff);
      }
    }

    // update cards
    for(let i=this.cards.length-1;i>=0;i--){
      const c=this.cards[i];
      if(!c.active) continue;
      let speed = c.speed * (this.isOverflow? 1.1:1);
      if(this.satoSlow>0) speed*=CONFIG.SLOW_FACTOR_SATO;
      if(this.katsuyaActive){
        // curve movement
        c.y += speed * scaledDt * 0.9;
        const wave = Math.sin(c.y*0.012 + this.elapsed*1.2) * 64;
        c.el.style.transform = `translateX(-50%) translate(${wave}px, ${c.y}px)`;
      }else{
        c.y += speed * scaledDt;
        c.el.style.transform = `translateX(-50%) translateY(${c.y}px)`;
      }

      if(c.y > this.layerH + 40){
        // miss
        this.handleMiss(c);
        this.removeCard(c,i);
      }
    }

    this.updateHUD();
    this.updateParticles(dt);
  }

  getDifficulty(){
    const t = CONFIG.GAME_DURATION - this.time; // elapsed real
    for(const d of CONFIG.DIFFICULTY){
      if(t>=d.t0 && t< d.t1) return d;
    }
    return CONFIG.DIFFICULTY[CONFIG.DIFFICULTY.length-1];
  }

  spawnCard(diff){
    let type;
    if(this.isOverflow){
      type='honshitsu';
    } else {
      type = this.pickRandomTypeForDifficulty(diff);
      // occasionally override for rare inspection
      if(type==='schrodinger' && this.rand()<0.5) type='honshitsu';
    }
    // map type key to card type param
    let cardType = type;
    if(type==='rare'){
      cardType = this.rand()<0.5?'rare':'rare';
    }
    const c = this.acquireCard();
    let quote=null;
    let qtype='honshitsu';
    if(cardType==='honshitsu') qtype='honshitsu';
    else if(cardType==='a_honshitsu') qtype='a_honshitsu';
    else if(cardType==='noise') qtype='noise';
    else if(cardType==='fake_katsu') qtype='fake_katsu';
    else if(cardType==='rare') qtype='rare';
    else if(cardType==='gen') qtype='rare';
    else if(cardType==='schrodinger') qtype='rare';

    if(cardType==='gen'){
      quote=this.pickQuoteByType('rare');
    } else if(cardType==='rare'){
      // corn soup or ring: choose variant via quote id parity
      const rq = this.pickQuoteByType('rare');
      quote=rq;
    } else {
      quote=this.pickQuoteByType(qtype);
    }
    c.quote=quote;
    c.type=cardType;
    if(cardType==='rare'){
      // decide corn vs ring by text contains corn concept
      const isCorn = quote && /コーン|スープ|湯気|復活/.test(quote.text);
      c.rareSub = isCorn? 'corn':'ring';
    }
    c.durability = (cardType==='gen'?3:1);
    c.y = CONFIG.CARD_SPAWN_TOP - this.rand()*40;
    const baseSpeed = CONFIG.CARD_FALL_BASE * diff.speed * (0.85 + this.rand()*CONFIG.CARD_FALL_VARIANCE*2);
    c.speed = this.isOverflow? baseSpeed*1.4 : baseSpeed;
    // visual setup
    this.applyCardVisual(c);
    c.el.style.transform=`translateX(-50%) translateY(${c.y}px)`;
    this.cards.push(c);
    // add subtle spawn pop
    c.el.animate([{transform:`translateX(-50%) translateY(${c.y}px) scale(0.85)`, opacity:0},{transform:`translateX(-50%) translateY(${c.y}px) scale(1)`, opacity:1}],{duration:220,easing:'cubic-bezier(0.34,1.56,0.64,1)'});
  }

  applyCardVisual(c){
    const el=c.el;
    el.className='card';
    el.dataset.type=c.type;
    if(c.type==='honshitsu') el.classList.add('honshitsu');
    else if(c.type==='a_honshitsu') el.classList.add('a_honshitsu');
    else if(c.type==='noise') el.classList.add('noise');
    else if(c.type==='fake_katsu') el.classList.add('fake_katsu');
    else if(c.type==='rare'){
      el.classList.add('rare');
      el.classList.add(c.rareSub);
    }
    else if(c.type==='gen') el.classList.add('gen');
    else if(c.type==='schrodinger') el.classList.add('schrodinger');

    const txtEl = el.querySelector('.card-text');
    const badge = el.querySelector('.type-badge');
    const speaker = el.querySelector('.speaker');
    let displayText = c.quote? c.quote.text : '✝本質✝';
    // for fake, mutate text slightly to show difference but keep visible
    if(c.type==='fake_katsu'){
      // add slight different char
      displayText = displayText.replace('本質','本室').replace('✝','†');
    }
    txtEl.textContent = displayText;
    // badge text by type but subtle to not give away too easy? Keep visible but type distinct via style, badge still hints? We hide badge text for some? Provide subtle.
    const badgeMap={
      honshitsu:'✝ 本質',
      a_honshitsu:'亜 本質',
      noise:'まとめ',
      fake_katsu:'✝ 本質',
      rare: c.rareSub==='corn'?'コーン':'指輪',
      gen:'原✝本質✝',
      schrodinger:'重ね'
    };
    badge.textContent = badgeMap[c.type]||c.type;
    speaker.textContent = c.quote? c.quote.speaker:'';
    // durability bar for gen
    let durBar = el.querySelector('.dur-bar');
    if(c.type==='gen'){
      if(!durBar){
        durBar=document.createElement('div'); durBar.className='dur-bar';
        durBar.innerHTML='<div class="dur-fill"></div>'; el.appendChild(durBar);
      }
      durBar.querySelector('.dur-fill').style.width = (c.durability/3*100)+'%';
    } else if(durBar) durBar.remove();

    // during sato slow, all cards gold
    if(this.satoSlow>0){
      el.style.filter='sepia(0.2) saturate(1.2) brightness(1.05)';
    } else el.style.filter='';
  }

  handleMiss(c){
    if(this.isOverflow) return; // no miss during overflow? spec says timer stop, but miss still? We'll ignore
    if(c.type==='honshitsu'){
      // honshitsu miss is penalty
      this.time = Math.max(0, this.time - CONFIG.TIME_PENALTY_MISS);
      this.combo=0; this.huhStreak=0;
      this.timeSinceMiss=0;
      Audio.playMiss();
      this.showMissFx(c);
      this.updateMultiplier();
    } else if(c.type==='rare' || c.type==='gen'){
      // rare miss no penalty (spec: rare only bonus)
      this.combo=0; // but? spec says rare not risk, so no combo reset? Keep slight: no penalty
    } else {
      // a_honshitsu/noise/fake taken miss = actually good they fell? But they are supposed to be rejected, missing them means you didn't huh? Should be considered success? In spec, "本質取りこぼし -0.50s" only honshitsu miss. So other types miss is not penalty, maybe ignored.
    }
  }
  removeCard(c, idx){
    if(idx!==undefined){
      this.cards.splice(idx,1);
    } else {
      const i=this.cards.indexOf(c); if(i>=0) this.cards.splice(i,1);
    }
    this.releaseCard(c);
  }

  getBottomCard(){
    let best=null; let maxY=-9999;
    for(const c of this.cards){
      if(!c.active) continue;
      if(c.y>maxY){ maxY=c.y; best=c;}
    }
    return best;
  }

  handleAction(action){
    if(this.state!==STATE.PLAY && this.state!==STATE.OVERFLOW) return;
    if(this.isOverflow){
      // during overflow, everything is honshitsu -> spam both = success
      const bottom=this.getBottomCard();
      if(!bottom) return;
      this.processHit(bottom, action, false, true);
      return;
    }
    const target=this.getBottomCard();
    if(!target) return;
    // determine correct action for target
    const correctIsKizamu = this.isHonshitsuType(target.type, target.quote);
    // schrodinger special
    let isSchro = target.type==='schrodinger';
    let willSucceed;
    if(isSchro){
      // 50/50 gamble: kizamu = observe -> success 2x or big damage
      willSucceed = (this.rand()<0.5); // random outcome regardless? Instead decide based on action? Spec: kizamu = observe (success 2x / fail big damage)
      // we interpret: if you kizamu schrodinger, 50% success double else mistake
      // if you huh schrodinger, you avoid but small?
      if(action==='kizamu'){
        willSucceed = this.rand() < 0.5;
      } else {
        willSucceed = true; // huh on schrodinger is safe? But spec says mitsumine reveals then safe. So huh is safe small?
      }
    } else {
      willSucceed = ( (action==='kizamu') === correctIsKizamu );
    }

    // check mie guard for mistakes
    if(!willSucceed && this.mieGuard>0){
      // guard consumes
      this.mieGuard=0;
      this.showGuardFx();
      willSucceed = true; // treat as guarded? But still not score? We'll give small
      this.timeSinceMiss=0;
      Audio.playHuhSuccess();
      this.spawnFloatingText('GUARD',' #5B7A9B');
      target.el.classList.add('hit-huh');
      setTimeout(()=>this.removeCard(target), 220);
      return;
    }

    if(willSucceed){
      this.processHit(target, action, false, false, isSchro);
    } else {
      this.processMistake(target, action);
    }
  }

  processHit(card, action, isSlice=false, isOverflowSpam=false, isSchro=false){
    const isKizamu = (action==='kizamu');
    // gen durability
    if(card.type==='gen'){
      card.durability -=1;
      const fill=card.el.querySelector('.dur-fill');
      if(fill) fill.style.width=(card.durability/3*100)+'%';
      card.el.animate([{transform: card.el.style.transform+' scale(1)'},{transform: card.el.style.transform+' scale(1.06)'}],{duration:90, direction:'alternate'});
      Audio.playKizamu(this.combo % 8);
      this.particlesBurst(card, 6, '#F2C14E');
      if(card.durability>0){
        // not yet destroyed
        card.el.classList.add('hit-kizamu');
        setTimeout(()=>card.el.classList.remove('hit-kizamu'), 200);
        return;
      }
      // fall through to destroy
    }

    // score
    let base = isKizamu? CONFIG.SCORE_HONSHITSU : CONFIG.SCORE_HUH;
    if(card.type==='rare') base = 700 + Math.floor(this.rand()*800); // 700-1500
    if(card.type==='gen') base = 1500;
    if(isSchro && isKizamu) base *=2; // double
    if(this.satoSlow>0) base = Math.floor(base*1.5);
    if(this.isOverflow) base = Math.floor(base*1.2);

    const mult = this.multiplier + (this.isOverflow? CONFIG.OVERFLOW_MULT_BONUS:0);
    const gained = Math.floor(base * mult);
    this.score += gained;
    this.combo +=1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if(isKizamu) { this.huhStreak=0; this.hits.kizamu++; } else { this.huhStreak+=1; this.hits.huh++; }
    this.timeSinceMiss+=0.01; // keep

    // time bonus
    if(isKizamu) this.time = Math.min(90, this.time + CONFIG.TIME_BONUS_HONSHITSU);
    else this.time += CONFIG.TIME_BONUS_HUH;

    // overflow gain
    let gain = isKizamu? CONFIG.OVERFLOW_GAIN_HONSHITSU : CONFIG.OVERFLOW_GAIN_HUH;
    if(card.type==='rare' || card.type==='gen') gain=CONFIG.OVERFLOW_GAIN_RARE;
    if(isSchro && isKizamu) gain*=2;
    this.overflow = Math.min(CONFIG.OVERFLOW_MAX, this.overflow + gain);

    // multiplier update
    this.updateMultiplier();

    // audio
    if(isKizamu) Audio.playKizamu(this.combo%8);
    else Audio.playHuhSuccess();

    // visuals
    card.el.classList.add(isKizamu?'hit-kizamu':'hit-huh');
    this.particlesBurst(card, isKizamu? CONFIG.PARTICLE_COUNT_HIT: 8, isKizamu?'#F2C14E':'#8ECAE6');
    this.spawnFloatingText('+'+gained, isKizamu?'#C99A00':'#22355B', card);
    this.spawnInkStroke(card, isKizamu);

    // check overflow ready UI will be handled
    // check skills
    this.checkSkills();

    // remove card after anim
    setTimeout(()=>this.removeCard(card), 220);

    // special rare handling already score done; extra time for corn/ring
    if(card.type==='rare'){
      if(card.rareSub==='corn'){
        this.time = Math.min(90, this.time + 3.0);
        this.spawnFloatingText('+3.0s','#E88C2A', card);
      } else if(card.rareSub==='ring'){
        this.time = Math.min(90, this.time + 1.0);
        this.triggerMeshinoBonus();
      }
      this.overflow = Math.min(100, this.overflow+8);
    }
    if(card.type==='gen'){
      // burst many ✝
      for(let i=0;i<12;i++) setTimeout(()=>this.particlesBurst(card, 4,'#F2C14E'), i*30);
    }

    // unlock quote? occasional?
  }

  processMistake(card, action){
    this.combo=0; this.huhStreak=0; this.timeSinceMiss=0; this.mistakes++;
    this.time = Math.max(0, this.time - CONFIG.TIME_PENALTY_MISTAKE);
    this.overflow = Math.max(0, this.overflow - CONFIG.OVERFLOW_LOSS_MISTAKE);
    this.updateMultiplier();
    Audio.playMistake();
    // show ha stamp
    this.showHaStamp();
    this.shakeScreen(CONFIG.SHAKE_INTENSITY_MISTAKE);
    this.flashScreen();
    // card anim
    card.el.classList.add('hit-huh'); // though mistake
    this.particlesBurst(card, 10, '#8C2F3A');
    setTimeout(()=>this.removeCard(card), 220);
    if(this.time<=0) this.triggerTimeUp();
  }

  updateMultiplier(){
    const baseMax = this.reiBuff>0? CONFIG.MULTIPLIER_MAX_REI : CONFIG.MULTIPLIER_MAX;
    const steps = Math.floor(this.combo / CONFIG.COMBO_STEP);
    this.multiplier = Math.min(baseMax, CONFIG.MULTIPLIER_BASE + steps*CONFIG.MULTIPLIER_PER_STEP);
  }

  checkSkills(){
    // Ryoma combo 20
    if(this.combo>0 && this.combo%20===0){
      this.triggerRyoma();
    }
    // Mie 5 huh streak
    if(this.huhStreak>=5 && this.mieGuard<=0){
      this.triggerMie();
    }
    // Rei 15s no miss
    if(this.timeSinceMiss>=15 && this.reiBuff<=0){
      this.triggerRei();
    }
  }

  // Skills implementations
  triggerRyoma(){
    this.showCharacter('ryoma','これまじ✝本質✝',800);
    // auto add ✝ to honshitsu cards
    let gained=0;
    for(const c of this.cards){
      if(c.type==='honshitsu' && c.active){
        const add = Math.floor(30 * this.multiplier);
        gained+=add;
        this.spawnFloatingText('+'+add,'#F2C14E', c);
        this.particlesBurst(c,5,'#F2C14E');
      }
    }
    if(gained>0){ this.score+=gained; this.overflow=Math.min(100,this.overflow+6); }
  }
  triggerMie(){
    this.mieGuard=3.0;
    this.showCharacter('mie','やめろ',900);
    this.spawnFloatingText('GUARD 3s','#5B7A9B');
    // visual guard ring
    const frame=document.getElementById('gameFrame');
    frame.animate([{boxShadow:'0 0 0 0 rgba(91,122,155,0)'},{boxShadow:'0 0 0 6px rgba(91,122,155,0.35)'}],{duration:300, direction:'alternate', iterations:2});
  }
  triggerRei(){
    this.reiBuff=10.0;
    this.showCharacter('rei','面白い',1100);
    this.spawnFloatingText('×10 10s','#A78BFA');
  }
  triggerKatsuya(){
    this.katsuyaActive=true;
    this.showCharacter('katsuya','地面は忘れない',1600);
    // visual overlay contour mode
    const cl=document.getElementById('classroom');
    cl.style.filter='contrast(1.08) saturate(1.1)';
    // add contour more visible
    const board=document.querySelector('.blackboard .contour');
    if(board) board.style.opacity='1';
    this.spawnFloatingText('等高線 MODE 5s','#3E4A3C');
    setTimeout(()=>{
      this.katsuyaActive=false;
      cl.style.filter='';
      if(board) board.style.opacity='0.8';
    },5000);
  }
  triggerSato(){
    if(this.satoSlow>0) return;
    this.satoSlow=CONFIG.SLOW_DURATION_SATO;
    this.showCharacter('sato','……見てない',1200);
    this.spawnFloatingText('SLOW 0.5×','#8A8A8A');
    // tint
    document.getElementById('cardLayer').style.filter='sepia(0.12) saturate(1.12)';
    Audio.playOverflowCharge();
  }
  clearSlowFx(){
    document.getElementById('cardLayer').style.filter='';
  }
  triggerKuraishi(){
    // spawn gen card
    const c=this.acquireCard();
    c.type='gen'; c.quote=this.pickQuoteByType('rare');
    c.durability=3; c.y=CONFIG.CARD_SPAWN_TOP; c.speed= CONFIG.CARD_FALL_BASE*1.1;
    this.applyCardVisual(c);
    c.el.style.transform=`translateX(-50%) translateY(${c.y}px)`;
    this.cards.push(c);
    this.showCharacter('kuraishi','原✝本質✝を刻め',1000);
  }
  triggerSakura(){
    const c=this.acquireCard();
    c.type='schrodinger'; c.quote=this.pickQuoteByType('rare'); c.y=CONFIG.CARD_SPAWN_TOP; c.speed=CONFIG.CARD_FALL_BASE*1.2;
    this.applyCardVisual(c);
    this.cards.push(c);
    this.showCharacter('sakura','重ね合わせ',900);
    // auto reveal after 4s by mitsumine
    setTimeout(()=>{
      if(c.active){
        c.el.style.borderColor='#E84855';
        c.el.style.boxShadow='0 0 0 2px rgba(232,72,85,0.35)';
        // after reveal, turn into either honshitsu or noise? Keep as is but mark safe? We'll just add indicator
        const ind=document.createElement('div');
        ind.textContent='三峰「は？」で暴く';
        ind.style.cssText='position:absolute;left:50%;top:-14px;transform:translateX(-50%);background:#E84855;color:#fff;font-size:7px;font-weight:900;padding:2px 6px;border-radius:999px;white-space:nowrap';
        c.el.appendChild(ind);
        setTimeout(()=>ind.remove(),1800);
      }
    },3800);
  }
  triggerMeshinoBonus(){
    this.showCharacter('meshino','封印が解けた',900);
    this.score+=300;
    this.spawnFloatingText('+300','#C9A0DC');
  }

  // Visual helpers
  showCharacter(id, text, dur){
    const ch = this.characters.find(x=>x.id===id);
    if(!ch) return;
    const stage=this.charStage;
    // fallback if no image
    const imgSrc = ch.tachi || ch.icon;
    const el=document.createElement('div');
    el.style.position='absolute';
    el.style.left = (id==='mie' || id==='mitsumine'? '4%': id==='ryoma'? '12%' : id==='katsuya'? '58%': id==='rei'? '68%': '38%');
    el.style.bottom='0';
    el.style.display='flex';
    el.style.flexDirection='column';
    el.style.alignItems='center';
    el.style.pointerEvents='none';
    el.innerHTML=`
      <div class="char-bubble">${text}</div>
      <img src="${imgSrc}" style="width:118px;height:148px;object-fit:contain;filter:drop-shadow(0 8px 10px rgba(0,0,0,0.25));" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <div style="display:none;width:78px;height:78px;border-radius:50%;background:${ch.color};border:2px solid #1A1A22;align-items:center;justify-content:center;font-weight:900;color:#fff;font-size:18px">${ch.name.slice(0,1)}</div>
      <div style="width:74px;height:8px;background:radial-gradient(ellipse,rgba(0,0,0,0.22),transparent 70%);border-radius:50%;margin-top:-6px"></div>
    `;
    el.className='char-sprite enter';
    stage.appendChild(el);
    // rim light via box-shadow? already
    requestAnimationFrame(()=> el.classList.add('breath'));
    setTimeout(()=>{
      el.style.opacity='0'; el.style.transform='translateY(30px) scale(0.95)';
      setTimeout(()=>el.remove(),380);
    }, dur);
  }

  spawnFloatingText(text, color, card){
    const layer=this.cardLayer;
    const el=document.createElement('div');
    el.textContent=text;
    el.style.position='absolute';
    el.style.left='50%';
    el.style.top= card? (card.y+24)+'px' : '44%';
    el.style.transform='translateX(-50%) translateY(0)';
    el.style.color=color;
    el.style.fontWeight='900';
    el.style.fontSize='14px';
    el.style.textShadow='0 1px 0 #fff, 0 2px 8px rgba(0,0,0,0.18)';
    el.style.pointerEvents='none';
    el.style.zIndex='18';
    el.style.background='rgba(255,255,255,0.92)';
    el.style.border='1.5px solid #1A1A22';
    el.style.borderRadius='999px';
    el.style.padding='2px 8px';
    layer.appendChild(el);
    el.animate([
      {transform:'translateX(-50%) translateY(0) scale(1)', opacity:1},
      {transform:'translateX(-50%) translateY(-36px) scale(1.04)', opacity:1, offset:0.7},
      {transform:'translateX(-50%) translateY(-44px) scale(0.96)', opacity:0}
    ],{duration:620, easing:'cubic-bezier(0.22,1,0.36,1)'}).onfinish=()=>el.remove();
  }
  particlesBurst(card, count, color){
    const cx = this.layerW/2; // approx card center X (with wave offset we ignore)
    const cy = card.y + 42;
    for(let i=0;i<count;i++){
      const ang = (Math.PI*2 * i/count) + this.rand()*0.6;
      const sp = 60 + this.rand()*120;
      this.particles.push({
        x: cx + (this.rand()-0.5)*30,
        y: cy,
        vx: Math.cos(ang)*sp,
        vy: Math.sin(ang)*sp - 20,
        life: 0.45+this.rand()*0.25,
        maxLife: 0.45+this.rand()*0.25,
        size: 2.5+this.rand()*3.2,
        color: color,
        alpha:1
      });
    }
  }
  showHaStamp(){
    const el=document.getElementById('haStamp');
    el.classList.remove('show'); void el.offsetWidth;
    el.classList.add('show');
    setTimeout(()=>el.classList.remove('show'), 360);
  }
  flashScreen(){
    const el=document.getElementById('screenFlash');
    el.classList.remove('flash'); void el.offsetWidth;
    el.style.background='rgba(255,255,255,0.55)';
    el.classList.add('flash');
    setTimeout(()=>{el.classList.remove('flash'); el.style.background='rgba(255,255,255,0)'}, 140);
  }
  showGuardFx(){
    const el=document.getElementById('screenFlash');
    el.style.background='rgba(91,122,155,0.18)';
    el.classList.add('flash');
    setTimeout(()=>{el.classList.remove('flash'); el.style.background='rgba(255,255,255,0)'}, 260);
  }
  shakeScreen(intensity){
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const frame=document.getElementById('gameFrame');
    frame.animate([
      {transform:`translateX(0)`},
      {transform:`translateX(${-intensity}px)`},
      {transform:`translateX(${intensity}px)`},
      {transform:`translateX(${-intensity*0.6}px)`},
      {transform:`translateX(0)`}
    ],{duration:220, easing:'ease-out'});
  }

  spawnInkStroke(card, isKizamu){
    if(!isKizamu) return;
    // create SVG stroke overlay on card
    const svgNS='http://www.w3.org/2000/svg';
    const svg=document.createElementNS(svgNS,'svg');
    svg.setAttribute('viewBox','0 0 100 60');
    svg.style.position='absolute'; svg.style.inset='0'; svg.style.pointerEvents='none'; svg.style.zIndex='5';
    const path=document.createElementNS(svgNS,'path');
    // single stroke ✝ shape: vertical + horizontal
    const d = `M50 10 L50 50 M22 22 L78 22`;
    path.setAttribute('d',d);
    path.setAttribute('stroke','#1A1A22');
    path.setAttribute('stroke-width','5.5');
    path.setAttribute('stroke-linecap','round');
    path.setAttribute('stroke-linejoin','round');
    path.setAttribute('fill','none');
    path.style.strokeDasharray='120';
    path.style.strokeDashoffset='120';
    path.style.filter='drop-shadow(0 1px 0 rgba(242,193,78,0.9))';
    svg.appendChild(path);
    card.el.appendChild(svg);
    path.animate([{strokeDashoffset:120},{strokeDashoffset:0}],{duration:120, easing:'cubic-bezier(0.3,0,0.2,1)', fill:'forwards'});
    setTimeout(()=>svg.remove(), 300);
  }

  tryOverflow(){
    if(this.state!==STATE.PLAY) return;
    if(this.overflow < CONFIG.OVERFLOW_MAX) return;
    this.startOverflow();
  }
  startOverflow(){
    this.isOverflow=true; this.overflowTime=CONFIG.OVERFLOW_DURATION;
    this.overflow=0; // reset after? keep 0 until next
    this.setState(STATE.OVERFLOW);
    Audio.playOverflowBoom();
    this.shakeScreen(CONFIG.SHAKE_INTENSITY_OVERFLOW);
    this.triggerOverflowFx();
    // classroom peel 3 stages
    this.playWallPeel();
  }
  endOverflow(){
    this.isOverflow=false; this.setState(STATE.PLAY);
    this.overflow=0;
    // reverse peel quickly
    const cl=document.getElementById('classroom');
    cl.style.transition='filter 0.9s ease, background 0.9s ease';
    cl.style.filter='';
    // clear
    setTimeout(()=>{cl.style.transition=''}, 1000);
  }
  triggerOverflowFx(){
    // radial bloom overlay
    const flash=document.getElementById('screenFlash');
    flash.style.background='radial-gradient(400px 400px at 50% 50%, rgba(242,193,78,0.35), transparent 70%)';
    setTimeout(()=>flash.style.background='rgba(255,255,255,0)', 700);
    // many particles
    for(let i=0;i<CONFIG.PARTICLE_COUNT_OVERFLOW;i++){
      const ang = Math.random()*Math.PI*2;
      const sp = 80+Math.random()*220;
      this.particles.push({
        x: this.layerW/2 + (Math.random()-0.5)*80,
        y: this.layerH*0.45,
        vx: Math.cos(ang)*sp,
        vy: Math.sin(ang)*sp,
        life: 0.7+Math.random()*0.5,
        maxLife:0.7+Math.random()*0.5,
        size:2+Math.random()*4,
        color:['#F2C14E','#FFD36A','#FFFFFF'][Math.floor(Math.random()*3)],
        alpha:1
      });
    }
    // show terachi during overflow if exists
    if(this.characters.find(c=>c.id==='terachi')){
      this.showCharacter('terachi','紙に書いてる…', 2800);
    }
  }
  playWallPeel(){
    const cl=document.getElementById('classroom');
    // stage1: wall -> chisou (brownish)
    cl.animate([
      {filter:'brightness(1) saturate(1)'},
      {filter:'brightness(0.98) saturate(1.12) hue-rotate(-6deg)'}
    ],{duration:900, easing:'ease-out', fill:'forwards'});
    // stage2 after 1.8s: contour more
    setTimeout(()=>{
      const w=document.querySelector('.blackboard');
      if(w) w.animate([{opacity:0.9},{opacity:1}],{duration:600});
      cl.style.background='linear-gradient(180deg, #E8D9B8 0%, #D2C0A0 50%, #C2B08A 100%)';
    }, 900);
    // stage3 after 2.8s: night sky with sakura
    setTimeout(()=>{
      cl.style.background='radial-gradient(900px 600px at 50% 20%, #0B1A2E 0%, #22355B 45%, #3E4A3C 100%)';
      // sakura petals falling visually via adding leak dots pink
      this.spawnSakuraPetals();
    }, 2200);
  }
  spawnSakuraPetals(){
    const leaks=document.getElementById('leaks');
    for(let i=0;i<14;i++){
      const d=document.createElement('div');
      d.style.position='absolute';
      d.style.left=(Math.random()*100)+'%';
      d.style.top=(-10 - Math.random()*30)+'px';
      d.style.width='10px'; d.style.height='10px';
      d.style.background='radial-gradient(circle, #FFD6E0 0%, #FF9EB5 60%, transparent 70%)';
      d.style.borderRadius='60% 0 60% 50%';
      d.style.transform=`rotate(${Math.random()*360}deg)`;
      d.style.pointerEvents='none';
      d.style.opacity='0.85';
      leaks.appendChild(d);
      d.animate([{transform:`translateY(0) rotate(${Math.random()*360}deg)`, opacity:0.85},{transform:`translateY(${this.layerH+80}px) rotate(${Math.random()*720+360}deg)`, opacity:0}],{duration: 3200+Math.random()*1800, easing:'cubic-bezier(0.42,0,0.58,1)'}).onfinish=()=>d.remove();
    }
  }

  updateHUD(){
    const dev = deviationFromScore(this.score);
    const rank = rankFromDeviation(dev);
    document.getElementById('devVal').textContent = dev.toFixed(1);
    document.getElementById('devRank').textContent = rank.name;
    document.getElementById('timeVal').textContent = this.time.toFixed(2);
    const tp=document.getElementById('timerPanel');
    if(this.time<=10 && !this.isOverflow) tp.classList.add('danger'); else tp.classList.remove('danger');
    document.getElementById('comboVal').textContent = this.combo;
    document.getElementById('multVal').textContent = '×'+this.multiplier.toFixed(1) + (this.reiBuff>0?' REI':'' ) + (this.mieGuard>0?' GUARD':'');
    const comboPanel=document.getElementById('comboPanel');
    comboPanel.style.transform = this.combo>0? `scale(${1+ Math.min(0.12, this.combo/80)})` : 'scale(1)';
    // overflow
    const fill=document.getElementById('overflowFill');
    const wrap=document.getElementById('overflowWrap');
    const btn=document.getElementById('btnOverflow');
    fill.style.width = this.overflow+'%';
    if(this.overflow>=100){
      wrap.classList.add('ready'); btn.classList.add('ready'); btn.disabled=false;
      document.getElementById('overflowLabel').textContent='READY — TAP ✝';
      document.getElementById('overflowBtnTxt').textContent='発動！';
    } else {
      wrap.classList.remove('ready'); btn.classList.remove('ready'); btn.disabled = this.state!==STATE.PLAY;
      document.getElementById('overflowLabel').textContent='OVERFLOW '+Math.floor(this.overflow)+'%';
      document.getElementById('overflowBtnTxt').textContent='OVERFLOW';
    }
    if(this.isOverflow){
      document.getElementById('overflowLabel').textContent='OVERFLOW中 '+(this.overflowTime).toFixed(1)+'s';
      fill.style.width = (this.overflowTime/CONFIG.OVERFLOW_DURATION*100)+'%';
    }
    // target glow show bottom card
    const bottom=this.getBottomCard();
    const glow=document.getElementById('targetGlow');
    if(bottom && this.state===STATE.PLAY){
      glow.classList.add('active');
      glow.style.top = (bottom.y-6)+'px';
      glow.style.height = (bottom.type==='gen'?118: bottom.type==='rare'?96:86)+12+'px';
    } else glow.classList.remove('active');
  }

  updateParticles(dt){
    // debug hitbox
    const debug = new URLSearchParams(location.search).get('debug')==='1';
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      // reduce particles
      if(this.particles.length>24) this.particles.splice(0, this.particles.length-24);
    }
    this.ctx.clearRect(0,0,this.layerW, this.layerH);
    for(let i=this.particles.length-1;i>=0;i--){
      const p=this.particles[i];
      p.life -= dt;
      if(p.life<=0){ this.particles.splice(i,1); continue; }
      p.x += p.vx*dt;
      p.y += p.vy*dt;
      p.vy += 180*dt; // gravity
      p.vx *= (1 - 0.8*dt); // drag
      p.alpha = p.life/p.maxLife;
      this.ctx.globalAlpha = p.alpha * 0.92;
      this.ctx.fillStyle = p.color;
      // halo
      this.ctx.shadowBlur = 6; this.ctx.shadowColor = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
      this.ctx.fill();
      this.ctx.shadowBlur=0;
      // inner bright core
      this.ctx.globalAlpha = p.alpha;
      this.ctx.fillStyle='#fff';
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size*0.45, 0, Math.PI*2);
      this.ctx.fill();
    }
    this.ctx.globalAlpha=1;
    if(debug){
      this.ctx.strokeStyle='rgba(255,0,0,0.85)'; this.ctx.lineWidth=1;
      for(const c of this.cards){ if(!c.active) continue; const h=c.type==='gen'?118:c.type==='rare'?96:86; const w=c.type==='gen'?340:310; const x=this.layerW/2 - w/2; const y=c.y; this.ctx.strokeRect(x,y,w,h); }
    }
  }

  triggerTimeUp(){
    this.stopLoop();
    this.setState(STATE.TIMEUP);
    // freeze cards
    this.cards.forEach(c=>{
      c.el.style.transition='transform 0.4s cubic-bezier(0.22,1,0.36,1)';
      c.el.style.transform += ` translateY(14px) rotate(${(Math.random()-0.5)*4}deg)`;
    });
    setTimeout(()=>this.showResult(), 680);
  }

  showResult(){
    this.setState(STATE.RESULT);
    const dev=deviationFromScore(this.score);
    const rank=rankFromDeviation(dev);
    const isHigh = this.score > this.highScore;
    if(isHigh){
      localStorage.setItem('honshitsu_high', String(this.score));
      Audio.playFanfare();
    } else {
      Audio.playFanfare();
    }
    this.playCount++;
    localStorage.setItem('honshitsu_playcount', String(this.playCount));
    // unlock quotes 1-3
    const locked = this.quotes.filter(q=> !this.unlockedSet.has(q.id));
    const toUnlock = Math.min(1+ Math.floor(this.rand()*3), locked.length);
    const shuffled = locked.sort(()=>this.rand()-0.5).slice(0,toUnlock);
    shuffled.forEach(q=> this.unlockedSet.add(q.id));
    localStorage.setItem('honshitsu_unlocked', JSON.stringify([...this.unlockedSet]));
    // animate deviation counter
    const devEl=document.getElementById('resultDev');
    const rankName=document.getElementById('rankName');
    const rankSub=document.getElementById('rankSub');
    const stamp=document.getElementById('rankStamp');
    const scoreEl=document.getElementById('statScore');
    const comboEl=document.getElementById('statCombo');
    const missEl=document.getElementById('statMiss');
    const bulletin=document.getElementById('bulletin');
    const resultTime=document.getElementById('resultTime');

    resultTime.textContent = (CONFIG.GAME_DURATION - this.time).toFixed(2)+'s / '+this.score+'pt';
    scoreEl.textContent=this.score;
    comboEl.textContent=this.maxCombo;
    missEl.textContent=this.mistakes;

    // bulletin generation
    const resNum = 522 + this.playCount; // 523 origin
    const bulText = `${resNum} 名無しの地形図好き：偏差値${dev.toFixed(1)}。コンボ最高${this.maxCombo}。誤爆${this.mistakes}回。これまじ✝本質✝。✝`;
    bulletin.textContent=bulText;

    // rank bg switch
    const resultCard=document.getElementById('resultCard');
    resultCard.style.background = rank.bg==='hoshizora'? 'radial-gradient(600px 400px at 50% 0%, #0B1A2E 0%, #22355B 55%, #F7F5EE 100%)' : rank.bg==='chisou'? 'linear-gradient(180deg, #E8D9B8 0%, #D2C0A0 100%)' : rank.bg==='kin'? 'linear-gradient(180deg, #FFF6CC 0%, #F2C14E 30%, #FFFCF5 100%)' : '#fff';
    resultCard.style.color = rank.bg==='hoshizora'? '#F7F5EE':'#1A1A22';
    if(rank.bg==='hoshizora'){
      rankName.style.color='#F2C14E'; rankSub.style.color='rgba(247,245,238,0.8)';
      devEl.style.color='#F7F5EE';
    } else { rankName.style.color=''; rankSub.style.color=''; devEl.style.color=''; }

    // hide secret for 100
    if(dev>=100){
      resultCard.animate([{filter:'brightness(1)'},{filter:'brightness(1.14)'}],{duration:400, iterations:4, direction:'alternate'});
      // fill with ✝
      setTimeout(()=>this.spawnSakuraPetals(), 200);
    }

    // animate dev counter rolling
    let cur=60; const target=dev;
    const steps=28;
    let step=0;
    const iv=setInterval(()=>{
      step++; cur = 60 + (target-60)*(1- Math.pow(1-step/steps, 3));
      if(step>=steps){ cur=target; clearInterval(iv); Audio.playTick(); }
      devEl.innerHTML = cur.toFixed(1)+'<span class="unit"> 偏差値</span>';
      if(step%3===0) Audio.playResultRoll();
    }, 32);
    rankName.textContent=rank.name;
    rankSub.textContent=rank.sub;
    stamp.style.transform='rotate(-1.5deg) scale(0.85)';
    setTimeout(()=>{ stamp.style.transform='rotate(-1.5deg) scale(1)'; stamp.style.transition='transform 0.55s cubic-bezier(0.34,1.56,0.64,1)'; }, 420);

    document.getElementById('resultOverlay').classList.remove('hidden');
    // best badge
    if(isHigh){
      const badge=document.createElement('div');
      badge.textContent='NEW BEST!';
      badge.style.cssText='position:absolute;left:50%;top:8px;transform:translateX(-50%);background:#F2C14E;color:#1A1A22;font-size:10px;font-weight:900;padding:4px 10px;border-radius:999px;border:1.5px solid #1A1A22;letter-spacing:0.06em';
      resultCard.appendChild(badge);
      setTimeout(()=>badge.remove(), 3800);
    }

    this.onStateChange(STATE.RESULT, {score:this.score, dev, rank, mistakes:this.mistakes, maxCombo:this.maxCombo});
  }

  // utility to reset leaks etc
  resetVisuals(){
    document.getElementById('leaks').innerHTML='';
    document.getElementById('cardLayer').style.filter='';
    document.getElementById('classroom').style.background='';
    document.getElementById('classroom').style.filter='';
  }
}
