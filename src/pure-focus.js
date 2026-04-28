// =============================================================
// PURE FOCUS MODE · Full-screen particle + ECG canvas animation
// -------------------------------------------------------------
// Triggered by clicking the "纯享" button (visible while timer
// is running). Displays a full-screen overlay with:
//   - Orbital particles + drifting cosmic dust
//   - Heart-rate-style ECG line that beats per second
//   - Progress ring around the central time display
//   - Color palette derived from the current wallpaper hue
//
// Reads timer state via window._getTimer() (set by main.js).
// =============================================================

let _pfRunning = false, _pfAnimId = null;
let _pfCanvas = null, _pfCtx = null;
let _pfParts = [];
let _pfBeat = 0;
let _pfLastST = -999;
let _pfSecTs = 0;
let _pfEcg = [];
let _pfSpike = 0, _pfSpikePh = 0, _pfSpikeAmp = 1.0;
let _pfCircleR = 0;
let _pfPlanetSparkles = null;
let _pfClickHandler = null, _pfTouchHandler = null;

function _pfTimer() {
  const fn = window._getTimer;
  return fn ? fn() : { running: false, time: 0, duration: 1 };
}

function _pfPal() {
  const hx = (localStorage.getItem('todo_wallpaper_color') || '#9435C0').replace('#','');
  const R=parseInt(hx.slice(0,2),16)/255, G=parseInt(hx.slice(2,4),16)/255, B=parseInt(hx.slice(4,6),16)/255;
  const mx=Math.max(R,G,B), mn=Math.min(R,G,B), d=mx-mn;
  let h=0; const s=mx?d/mx:0;
  if(d>0){if(mx===R)h=((((G-B)/d)%6)+6)%6;else if(mx===G)h=(B-R)/d+2;else h=(R-G)/d+4;h*=60;}
  const f=(hh,ss,ll,aa)=>{aa=aa===undefined?1:aa;return'hsla('+((Math.round(hh)%360+360)%360)+','+(ss*100).toFixed(1)+'%,'+(ll*100).toFixed(1)+'%,'+aa+')';};
  const sv=Math.max(s,.5);
  return {
    arc:  f(h,sv,.72),     arcBg: f(h,.18,.28,.38),
    glow: f(h,sv,.68,.20), glowS: f(h,sv,.72,.55),
    ecg:  f(h+18,sv,.72),  ecgF:  f(h+18,sv*.7,.58,.36),
    p0:   f(h-16,sv,.70,.68), p1: f(h,sv*.85,.76,.44), p2: f(h+28,sv*.6,.82,.26),
    bg0:  f(h,sv*.4,.12,.88),
  };
}

function _pfMkParts() {
  const W=_pfCanvas.width, H=_pfCanvas.height;
  const pal=_pfPal(), cs=[pal.p0,pal.p1,pal.p2];
  _pfParts=[];
  // Orbital ring — beat-reactive
  for(let i=0;i<60;i++){
    const a=(i/60)*Math.PI*2+(Math.random()-.5)*.18;
    const rMin=Math.min(W,H)*.16, rMax=Math.min(W,H)*.44;
    const r=rMin+Math.pow(Math.random(),.6)*(rMax-rMin);
    const sz=Math.random()<.12 ? 1.8+Math.random()*1.4 : (Math.random()<.35 ? .9+Math.random()*.8 : .25+Math.random()*.55);
    _pfParts.push({orbital:true, a, av:(Math.random()<.5?1:-1)*(.00025+Math.random()*.00045),
      r, rb:r, rd:0, ox:0, oy:0, sz, col:cs[i%3], t:Math.random()*Math.PI*2, tw:Math.random()*Math.PI*2, twv:.018+Math.random()*.022});
  }
  // Cosmic dust — scattered across whole canvas
  for(let j=0;j<1520;j++){
    const x=Math.random()*W, y=Math.random()*H;
    const rnd=Math.random();
    const szC=rnd<.04 ? 1.5+Math.random()*1.0 : (rnd<.20 ? .6+Math.random()*.6 : .15+Math.random()*.38);
    _pfParts.push({orbital:false, x, y,
      vx:(Math.random()-.5)*.07, vy:(Math.random()-.5)*.07,
      ox:0, oy:0,
      sz:szC, col:cs[j%3], t:Math.random()*Math.PI*2, tw:Math.random()*Math.PI*2, twv:.008+Math.random()*.016, rd:0, rb:0});
  }
}

function _pfMkPlanetSparkles() {
  _pfPlanetSparkles = [];
  for (let i = 0; i < 16; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.pow(Math.random(), 0.7) * 0.82;
    const xn = Math.cos(ang) * dist;
    let yn = Math.sin(ang) * dist - 0.18; // bias upward
    yn = Math.max(-0.85, Math.min(0.20, yn));
    _pfPlanetSparkles.push({
      xn, yn,
      sz: 0.5 + Math.random() * 1.4,
      tw: Math.random() * Math.PI * 2,
      twv: 0.018 + Math.random() * 0.045,
    });
  }
}

// 触控/点击：附近的粒子被推开
function _pfImpulseAt(cxC, cyC) {
  if (!_pfCanvas) return;
  const cx = _pfCanvas.width/2, cy = _pfCanvas.height/2;
  const R = Math.min(_pfCanvas.width, _pfCanvas.height) * 0.22;
  const STRENGTH = 14;
  const R2 = R * R;
  for (const p of _pfParts) {
    let px, py;
    if (p.orbital) {
      const r = p.rb + p.rd + Math.sin(p.t)*4;
      px = cx + Math.cos(p.a)*r + p.ox;
      py = cy + Math.sin(p.a)*r + p.oy;
    } else {
      px = p.x + p.ox; py = p.y + p.oy;
    }
    const dx = px - cxC, dy = py - cyC;
    const d2 = dx*dx + dy*dy;
    if (d2 < R2 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const fall = 1 - d/R;
      const force = fall * fall * STRENGTH;
      p.ox += (dx/d) * force;
      p.oy += (dy/d) * force;
    }
  }
}

function _pfMkEcg() { _pfEcg=new Array(_pfCanvas.width).fill(0); }

function _pfFire() {
  _pfBeat=1; _pfSpike=1; _pfSpikePh=0;
  _pfSpikeAmp = 0.55 + Math.random()*0.90;
  _pfParts.forEach(p => { p.rd+=10+Math.random()*14; });
}

function _pfStep() {
  for(let k=0;k<2;k++){
    const t=performance.now();
    const tri=p=>{p=((p%(Math.PI*2))+Math.PI*2)%(Math.PI*2);return p<Math.PI?(p/Math.PI)*2-1:3-(p/Math.PI)*2;};
    let y=tri(t*.00075)*12 + tri(t*.0022)*7 + Math.sign(Math.sin(t*.011))*2.8 + Math.sign(Math.sin(t*.031))*1.2;
    if(_pfSpike>.015){
      const ph=_pfSpikePh;
      if     (ph< 3) y= -16*_pfSpike*_pfSpikeAmp;
      else if(ph< 6) y=-115*_pfSpike*_pfSpikeAmp;
      else if(ph< 9) y=  62*_pfSpike*_pfSpikeAmp;
      else if(ph<15) y= -22*_pfSpike*_pfSpikeAmp*((15-ph)/6);
      else            y=0;
      _pfSpikePh++; _pfSpike=Math.max(0,_pfSpike-.040);
    }
    _pfEcg.shift(); _pfEcg.push(y);
  }
}

function _pfFrame(ts) {
  if(!_pfRunning) return;
  const cv=_pfCanvas, ctx=_pfCtx, W=cv.width, H=cv.height, cx=W/2, cy=H/2;
  const pal=_pfPal();
  const tm=_pfTimer();

  if(tm.running && tm.time !== _pfLastST){
    if(_pfLastST!==-999) _pfFire();
    _pfLastST=tm.time; _pfSecTs=ts;
  }

  const frac=tm.running?Math.min((ts-_pfSecTs)/1e3,1):0;
  const remMs=Math.max(0,tm.time*1e3-frac*1e3);
  const mm=Math.floor(remMs/6e4), ss=Math.floor((remMs%6e4)/1e3), cc=Math.floor((remMs%1e3)/10);
  const tmEl=document.getElementById('pf-tm'), csEl=document.getElementById('pf-cs');
  if(tmEl) tmEl.textContent=String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
  if(csEl) csEl.textContent='.'+String(cc).padStart(2,'0');

  _pfBeat=Math.max(0,_pfBeat-.026);
  const bp=Math.sin(_pfBeat*Math.PI)*.055;

  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='rgba(4,4,11,.97)'; ctx.fillRect(0,0,W,H);
  const rg=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.min(W,H)*.56);
  rg.addColorStop(0,pal.bg0); rg.addColorStop(1,'transparent');
  ctx.fillStyle=rg; ctx.fillRect(0,0,W,H);

  _pfParts.forEach(p => {
    p.t+=.013; p.tw+=p.twv;
    // 触控冲量衰减
    p.ox *= 0.93; p.oy *= 0.93;
    const alpha=0.45+Math.sin(p.tw)*0.30;
    let px,py;
    if(p.orbital){
      p.a+=p.av; p.rd*=.91;
      const r=p.rb+p.rd+Math.sin(p.t)*4;
      px=cx+Math.cos(p.a)*r+p.ox; py=cy+Math.sin(p.a)*r+p.oy;
    } else {
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<-4)p.x=W+4; else if(p.x>W+4)p.x=-4;
      if(p.y<-4)p.y=H+4; else if(p.y>H+4)p.y=-4;
      px=p.x+p.ox; py=p.y+p.oy;
    }
    const pulseSz=p.orbital ? p.sz*(1+bp*.85) : p.sz;
    if(p.sz>0.85){
      ctx.save(); ctx.globalAlpha=alpha;
      ctx.beginPath(); ctx.arc(px,py,pulseSz,0,Math.PI*2);
      ctx.fillStyle=p.col; ctx.shadowColor=p.col; ctx.shadowBlur=p.sz>1.4?8:3;
      ctx.fill(); ctx.restore();
    } else {
      ctx.globalAlpha=alpha*.65;
      ctx.fillStyle=p.col;
      ctx.beginPath(); ctx.arc(px,py,pulseSz,0,Math.PI*2); ctx.fill();
    }
  });

  ctx.globalAlpha=1;
  _pfStep();
  const eyBase=H*.68, eHalf=W*.38, eX0=cx-eHalf, eX1=cx+eHalf;
  ctx.save();
  ctx.beginPath();
  const N=_pfEcg.length;
  for(let i=0;i<N;i++){
    const ex=eX0+(i/N)*eHalf*2, ey=eyBase+_pfEcg[i]*(1+bp*2.2);
    i===0?ctx.moveTo(ex,ey):ctx.lineTo(ex,ey);
  }
  const eg=ctx.createLinearGradient(eX0,0,eX1,0);
  eg.addColorStop(0,'transparent'); eg.addColorStop(.07,pal.ecgF);
  eg.addColorStop(.55,pal.ecg);   eg.addColorStop(1,pal.ecg);
  ctx.strokeStyle=eg; ctx.lineWidth=1.0; ctx.shadowColor=pal.ecg; ctx.shadowBlur=8; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,eyBase); ctx.lineTo(eX0,eyBase);
  const lg=ctx.createLinearGradient(0,0,eX0,0); lg.addColorStop(0,'transparent'); lg.addColorStop(1,pal.ecgF);
  ctx.strokeStyle=lg; ctx.lineWidth=1; ctx.shadowBlur=0; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(eX1,eyBase); ctx.lineTo(W,eyBase);
  const rgg=ctx.createLinearGradient(eX1,0,W,0); rgg.addColorStop(0,pal.ecgF); rgg.addColorStop(1,'transparent');
  ctx.strokeStyle=rgg; ctx.stroke();
  ctx.restore();

  // ── 中央星球（替代原来的进度大圆圈）─────────────────────
  const R=_pfCircleR>10 ? _pfCircleR*1.55 : Math.min(W,H)*.22;
  const circY=cy-H*.05;
  ctx.save();
  ctx.translate(cx, circY);
  const sphereScale = 1 + bp * 0.85;
  ctx.scale(sphereScale, sphereScale);

  // 1. 外层光晕
  const halo = ctx.createRadialGradient(0,0,R*0.92,0,0,R*1.7);
  halo.addColorStop(0,    'rgba(200,160,255,0.32)');
  halo.addColorStop(0.45, 'rgba(180,130,240,0.13)');
  halo.addColorStop(1,    'transparent');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0,0,R*1.7,0,Math.PI*2); ctx.fill();

  // 2. 球体本体（顶 lavender → 中 rose → 底 amber）
  const body = ctx.createLinearGradient(0,-R,0,R);
  body.addColorStop(0,    'hsla(280, 70%, 78%, 0.92)');
  body.addColorStop(0.30, 'hsla(305, 55%, 72%, 0.88)');
  body.addColorStop(0.55, 'hsla(335, 60%, 76%, 0.82)');
  body.addColorStop(0.80, 'hsla(35, 80%, 76%, 0.92)');
  body.addColorStop(1,    'hsla(45, 92%, 70%, 0.96)');
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.fill();

  // 3. 球内裁剪：暖色底光 + 顶部高光 + 内部繁星
  ctx.save();
  ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.clip();

  const rim = ctx.createRadialGradient(0,R*0.45,R*0.15,0,R*0.65,R*0.95);
  rim.addColorStop(0,   'rgba(255,210,140,0.55)');
  rim.addColorStop(0.5, 'rgba(255,180,120,0.18)');
  rim.addColorStop(1,   'transparent');
  ctx.fillStyle = rim;
  ctx.fillRect(-R,-R,R*2,R*2);

  const hl = ctx.createRadialGradient(-R*0.32,-R*0.45,0,-R*0.32,-R*0.45,R*0.65);
  hl.addColorStop(0,   'rgba(255,255,255,0.55)');
  hl.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  hl.addColorStop(1,   'transparent');
  ctx.fillStyle = hl;
  ctx.fillRect(-R,-R,R*2,R*2);

  if (_pfPlanetSparkles) {
    for (const sp of _pfPlanetSparkles) {
      sp.tw += sp.twv;
      const op = 0.55 + 0.45 * Math.sin(sp.tw);
      ctx.globalAlpha = op;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(sp.xn*R, sp.yn*R, sp.sz, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // 4. 边缘描边
  ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.1;
  ctx.shadowBlur = 0;
  ctx.stroke();

  ctx.restore();

  _pfAnimId=requestAnimationFrame(_pfFrame);
}

export function enterPureFocus() {
  const ov=document.getElementById('pf-overlay'); if(!ov) return;
  _pfCanvas=document.getElementById('pf-cv'); _pfCtx=_pfCanvas.getContext('2d');
  _pfCanvas.width=window.innerWidth; _pfCanvas.height=window.innerHeight;
  _pfLastST=-999; _pfBeat=0; _pfSpike=0; _pfSpikePh=0; _pfRunning=true;
  _pfMkParts(); _pfMkEcg(); _pfMkPlanetSparkles();
  ov.classList.add('show');
  setTimeout(() => {
    const tw=document.getElementById('pf-time-wrap');
    if(tw){ const b=tw.getBoundingClientRect(); _pfCircleR=Math.sqrt(Math.pow(b.width/2,2)+Math.pow(b.height/2,2))*1.30; }
  }, 60);
  window._pfRsz=function(){
    _pfCanvas.width=window.innerWidth; _pfCanvas.height=window.innerHeight; _pfMkParts(); _pfMkEcg();
    const tw=document.getElementById('pf-time-wrap');
    if(tw){ const b=tw.getBoundingClientRect(); _pfCircleR=Math.sqrt(Math.pow(b.width/2,2)+Math.pow(b.height/2,2))*1.30; }
  };
  window.addEventListener('resize',window._pfRsz);

  // 触控/点击：粒子避让效果
  _pfClickHandler = e => _pfImpulseAt(e.clientX, e.clientY);
  _pfTouchHandler = e => { for (const t of e.touches) _pfImpulseAt(t.clientX, t.clientY); };
  document.addEventListener('mousedown', _pfClickHandler);
  document.addEventListener('touchstart', _pfTouchHandler, { passive: true });

  _pfAnimId=requestAnimationFrame(_pfFrame);
}

export function exitPureFocus() {
  _pfRunning=false; cancelAnimationFrame(_pfAnimId);
  const ov=document.getElementById('pf-overlay'); if(ov) ov.classList.remove('show');
  window.removeEventListener('resize',window._pfRsz);
  if (_pfClickHandler) document.removeEventListener('mousedown', _pfClickHandler);
  if (_pfTouchHandler) document.removeEventListener('touchstart', _pfTouchHandler);
  _pfClickHandler = _pfTouchHandler = null;
}

// Esc to exit
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && _pfRunning) exitPureFocus();
});
