let ctx = null;
let master = null;
let enabled = true;
let bgmTimer = null;
let bgmPlaying = false;
let muted = false;

function ensureCtx(){
  if(ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
  return ctx;
}

export function initAudio(){
  ensureCtx();
  if(ctx && ctx.state === 'suspended') ctx.resume();
  const saved = localStorage.getItem('honshitsu_muted');
  if(saved === '1') muted = true, enabled = false;
  updateMuteUI();
}

function oscTone(freq, type, vol, attack, decay, sweep){
  if(!enabled || muted || !ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type='lowpass'; f.frequency.value= 8000;
  o.type = type; o.frequency.value = freq;
  if(sweep){ o.frequency.exponentialRampToValueAtTime(freq*sweep, ctx.currentTime+decay); }
  g.gain.value = 0;
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime+attack);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+attack+decay);
  o.connect(f); f.connect(g); g.connect(master);
  o.start(); o.stop(ctx.currentTime+attack+decay+0.05);
}

function noiseBurst(duration, vol, bandFreq){
  if(!enabled || muted || !ctx) return;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i]=(Math.random()*2-1)*Math.pow(1- i/bufferSize, 0.5);
  const src = ctx.createBufferSource(); src.buffer=buffer;
  const filter = ctx.createBiquadFilter(); filter.type='bandpass'; filter.frequency.value= bandFreq|| 1800; filter.Q.value=0.9;
  const gain = ctx.createGain(); gain.gain.value=vol;
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+duration);
  src.connect(filter); filter.connect(gain); gain.connect(master);
  src.start();
}

export function playKizamu(pitchIndex=0){
  // pen scratch + chime rising semitone
  const base = 440 * Math.pow(2, (pitchIndex%8)/12);
  oscTone(base*2, 'sine', 0.18, 0.005, 0.28, 1.02);
  oscTone(base*1.5,'triangle',0.08,0.004,0.18);
  noiseBurst(0.06, 0.06, 3800);
}
export function playHuhSuccess(){
  oscTone(720,'sine',0.14,0.003,0.14);
  setTimeout(()=>oscTone(880,'sine',0.12,0.003,0.16),70);
}
export function playMistake(){
  // 下降ノイズ＋フォルマントっぽいバンドパスで声っぽさ
  noiseBurst(0.22, 0.18, 700);
  oscTone(280,'sawtooth',0.12,0.008,0.28,0.65);
  oscTone(560,'square',0.06,0.01,0.22,0.7);
}
export function playMiss(){
  oscTone(180,'triangle',0.10,0.01,0.22);
}
export function playOverflowCharge(){
  oscTone(220,'sine',0.12,0.02,0.25,1.5);
}
export function playOverflowBoom(){
  oscTone(55,'sine',0.5,0.005,0.9);
  noiseBurst(0.5, 0.22, 900);
  oscTone(220,'square',0.22,0.01,0.6,2.0);
  oscTone(440,'sine',0.14,0.02,0.9,1.3);
}
export function playTick(){
  oscTone(1200,'sine',0.06,0.001,0.07);
}
export function playCount(n){
  const freqs=[440,550,660,880];
  oscTone(freqs[n-1]||440,'sine',0.2,0.004,0.28);
  noiseBurst(0.04,0.04,4000);
}
export function playResultRoll(){
  oscTone(900,'square',0.05,0.001,0.06);
}
export function playFanfare(){
  const seq=[261,329,392,523];
  seq.forEach((f,i)=> setTimeout(()=>oscTone(f,'sine',0.18,0.006,0.5), i*120));
  setTimeout(()=>oscTone(659,'sine',0.22,0.008,0.7), 480);
}
export function startBGM(intense=false){
  if(!ctx || muted) return;
  stopBGM();
  bgmPlaying=true;
  let step=0;
  const baseTempo = intense? 580: 720;
  bgmTimer = setInterval(()=>{
    if(!bgmPlaying || muted) return;
    const notes = intense? [110, 138, 165, 110]: [196,246,294,246];
    const f = notes[step%notes.length];
    oscTone(f*0.5,'triangle', intense?0.07:0.045, 0.02,0.32);
    if(step%4===0){
      // soft kick
      oscTone(48,'sine',0.18,0.001,0.18,0.45);
    }
    step++;
  }, baseTempo);
}
export function stopBGM(){
  bgmPlaying=false;
  if(bgmTimer) clearInterval(bgmTimer);
  bgmTimer=null;
}
export function setIntense(v){
  stopBGM();
  if(v) startBGM(true); else startBGM(false);
}
export function toggleMute(){
  muted=!muted;
  localStorage.setItem('honshitsu_muted', muted?'1':'0');
  if(muted) stopBGM();
  updateMuteUI();
  return muted;
}
function updateMuteUI(){
  const el=document.getElementById('muteBtn');
  if(el) el.textContent = muted?'🔇':'🔊';
}
export function isMuted(){return muted;}
