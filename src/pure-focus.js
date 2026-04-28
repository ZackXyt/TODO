// =============================================================
// PURE FOCUS MODE · Full-screen particle + ECG canvas animation
// -------------------------------------------------------------
// 满屏白色繁星（和主界面 starfield 数量/大小一致：900+300+70）
// 中央 canvas 渲染发光星球：颜色由用户选择的壁纸色派生（hue 决定
// 球体顶部色，渐变到底部暖金）
// 底部水平线 ECG 心跳曲线，每秒 + 每次点击触发脉冲
// 触控/点击：附近粒子被推开 + 心跳瞬间放大
// 计时状态从 window._getTimer() 读取（main.js 设置）
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
let _pfClickHandler = null, _pfTouchHandler = null;
let _pfGlowSprite = null;
let _pfPlanetSparkles = null;

function _pfTimer() {
  const fn = window._getTimer;
  return fn ? fn() : { running: false, time: 0, duration: 1 };
}

// 取壁纸色 → HSL，提供 ECG 颜色等基础色
function _pfPal() {
  const hx = (localStorage.getItem('todo_wallpaper_color') || '#9435C0').replace('#','');
  const R=parseInt(hx.slice(0,2),16)/255, G=parseInt(hx.slice(2,4),16)/255, B=parseInt(hx.slice(4,6),16)/255;
  const mx=Math.max(R,G,B), mn=Math.min(R,G,B), d=mx-mn;
  let h=0; const s=mx?d/mx:0;
  if(d>0){if(mx===R)h=((((G-B)/d)%6)+6)%6;else if(mx===G)h=(B-R)/d+2;else h=(R-G)/d+4;h*=60;}
  const f=(hh,ss,ll,aa)=>{aa=aa===undefined?1:aa;return'hsla('+((Math.round(hh)%360+360)%360)+','+(ss*100).toFixed(1)+'%,'+(ll*100).toFixed(1)+'%,'+aa+')';};
  const sv=Math.max(s,.5);
  return {
    hue:  h,
    ecg:  f(h+18,sv,.72),  ecgF:  f(h+18,sv*.7,.58,.36),
    bg0:  f(h,sv*.4,.12,.88),
  };
}

// 星球颜色：顶部用壁纸 hue，底部沿最短弧度过渡到暖金 (h≈45)
function _pfPlanetCols() {
  const { hue } = _pfPal();
  // 最短弧度插值
  const lerpHue = (a, b, t) => {
    const diff = ((b - a + 540) % 360) - 180;
    return (a + diff * t + 360) % 360;
  };
  const f = (hh, ss, ll, aa) => `hsla(${(Math.round(hh)%360+360)%360},${ss}%,${ll}%,${aa})`;
  const target = 45; // 底部暖金
  return {
    halo:    f(hue, 70, 65, 0.32),
    haloMid: f(hue, 60, 55, 0.13),
    top:     f(hue,                  68, 78, 0.92),
    upMid:   f(lerpHue(hue, target, 0.30), 60, 73, 0.88),
    mid:     f(lerpHue(hue, target, 0.60), 65, 75, 0.84),
    loMid:   f(target,               80, 76, 0.92),
    bot:     f(target,               92, 70, 0.96),
    rim:     f(target,               90, 70, 0.55),
    rimMid:  f(target+10,            85, 70, 0.20),
  };
}

// 预渲染光晕 sprite（和主界面同款）
function _pfMkGlowSprite() {
  const PX = 64;
  _pfGlowSprite = document.createElement('canvas');
  _pfGlowSprite.width = _pfGlowSprite.height = PX;
  const g = _pfGlowSprite.getContext('2d');
  const grad = g.createRadialGradient(PX/2, PX/2, 0, PX/2, PX/2, PX/2);
  grad.addColorStop(0,    'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(230,210,255,0.55)');
  grad.addColorStop(0.5,  'rgba(180,140,255,0.18)');
  grad.addColorStop(1,    'rgba(180,140,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, PX, PX);
}

// 主界面同款星空：900 tiny + 300 small (闪) + 70 glow (闪+光晕)
function _pfMkParts() {
  const W=_pfCanvas.width, H=_pfCanvas.height;
  _pfParts=[];
  const TAU = Math.PI * 2;
  function makeStar(layer, opts) {
    const angle = Math.random() * TAU;
    const speed = opts.driftMin + Math.random() * (opts.driftMax - opts.driftMin);
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      dvx: Math.cos(angle) * speed,
      dvy: Math.sin(angle) * speed,
      ivx: 0, ivy: 0,
      size: opts.sizeMin + Math.random() * (opts.sizeMax - opts.sizeMin),
      baseOp: opts.opMin + Math.random() * (opts.opMax - opts.opMin),
      twSpeed: opts.twSpeed ? (opts.twSpeed[0] + Math.random() * (opts.twSpeed[1] - opts.twSpeed[0])) : 0,
      twPhase: Math.random() * TAU,
      layer,
    };
  }
  for (let i = 0; i < 900; i++) _pfParts.push(makeStar('tiny',  { sizeMin: 0.5, sizeMax: 1.2, opMin: 0.30, opMax: 0.75, driftMin: 0.02, driftMax: 0.10 }));
  for (let i = 0; i < 300; i++) _pfParts.push(makeStar('small', { sizeMin: 1.1, sizeMax: 1.9, opMin: 0.50, opMax: 0.92, driftMin: 0.03, driftMax: 0.14, twSpeed: [0.4, 1.6] }));
  for (let i = 0; i < 70;  i++) _pfParts.push(makeStar('glow',  { sizeMin: 1.7, sizeMax: 2.8, opMin: 0.70, opMax: 1.00, driftMin: 0.02, driftMax: 0.10, twSpeed: [0.25, 0.9] }));
}

// 星球内部繁星（球内白点，模仿 icon 内部星点）
function _pfMkPlanetSparkles() {
  _pfPlanetSparkles = [];
  for (let i = 0; i < 18; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.pow(Math.random(), 0.7) * 0.82;
    const xn = Math.cos(ang) * dist;
    let yn = Math.sin(ang) * dist - 0.18; // 偏上
    yn = Math.max(-0.85, Math.min(0.20, yn));
    _pfPlanetSparkles.push({
      xn, yn,
      sz: 0.5 + Math.random() * 1.4,
      tw: Math.random() * Math.PI * 2,
      twv: 0.018 + Math.random() * 0.045,
    });
  }
}

// 触控/点击：附近粒子被推开（和主界面同参数）
function _pfImpulseAt(cxC, cyC) {
  if (!_pfCanvas) return;
  const R = 170;
  const STRENGTH = 9;
  const R2 = R * R;
  for (const s of _pfParts) {
    const dx = (s.x + s.ivx) - cxC, dy = (s.y + s.ivy) - cyC;
    const d2 = dx*dx + dy*dy;
    if (d2 < R2 && d2 > 0.01) {
      const d = Math.sqrt(d2);
      const fall = 1 - d/R;
      const force = fall * fall * STRENGTH;
      s.ivx += (dx/d) * force;
      s.ivy += (dy/d) * force;
    }
  }
}

function _pfMkEcg() { _pfEcg=new Array(_pfCanvas.width).fill(0); }

function _pfFire() {
  _pfBeat=1; _pfSpike=1; _pfSpikePh=0;
  _pfSpikeAmp = 0.55 + Math.random()*0.90;
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

function _pfDrawPlanet(ctx, cx, cy, R, bp) {
  const cols = _pfPlanetCols();
  ctx.save();
  ctx.translate(cx, cy);
  const scale = 1 + bp * 0.85;
  ctx.scale(scale, scale);

  // 1. 外层光晕
  const halo = ctx.createRadialGradient(0,0,R*0.92,0,0,R*1.7);
  halo.addColorStop(0,    cols.halo);
  halo.addColorStop(0.45, cols.haloMid);
  halo.addColorStop(1,    'transparent');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(0,0,R*1.7,0,Math.PI*2); ctx.fill();

  // 2. 球体本体（5 段渐变 顶 hue → 底 amber）
  const body = ctx.createLinearGradient(0,-R,0,R);
  body.addColorStop(0,    cols.top);
  body.addColorStop(0.30, cols.upMid);
  body.addColorStop(0.55, cols.mid);
  body.addColorStop(0.80, cols.loMid);
  body.addColorStop(1,    cols.bot);
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.fill();

  // 3. 球内裁剪：底部暖光 + 顶部高光 + 内部繁星
  ctx.save();
  ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2); ctx.clip();

  const rim = ctx.createRadialGradient(0,R*0.45,R*0.15,0,R*0.65,R*0.95);
  rim.addColorStop(0,   cols.rim);
  rim.addColorStop(0.5, cols.rimMid);
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

  // 背景
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='rgba(4,4,11,.97)'; ctx.fillRect(0,0,W,H);
  const rg=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.min(W,H)*.56);
  rg.addColorStop(0,pal.bg0); rg.addColorStop(1,'transparent');
  ctx.fillStyle=rg; ctx.fillRect(0,0,W,H);

  // 满屏白色繁星（主界面同款）
  const t = ts * 0.001;
  const damping = 0.93;
  const TAU = Math.PI * 2;
  for (let i = 0; i < _pfParts.length; i++) {
    const s = _pfParts[i];
    s.x += (s.dvx + s.ivx);
    s.y += (s.dvy + s.ivy);
    s.ivx *= damping;
    s.ivy *= damping;
    if      (s.x < -8)     s.x = W + 8;
    else if (s.x > W + 8)  s.x = -8;
    if      (s.y < -8)     s.y = H + 8;
    else if (s.y > H + 8)  s.y = -8;

    let op = s.baseOp;
    if (s.twSpeed) {
      const tw = 0.5 + 0.5 * Math.sin(t * s.twSpeed + s.twPhase);
      op = s.baseOp * (0.35 + 0.65 * tw);
    }
    ctx.globalAlpha = op;

    if (s.layer === 'glow' && _pfGlowSprite) {
      const sz = s.size * 8;
      ctx.drawImage(_pfGlowSprite, s.x - sz/2, s.y - sz/2, sz, sz);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // ECG 心跳曲线
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

  // 中央可变色星球
  const R = _pfCircleR > 10 ? _pfCircleR * 1.55 : Math.min(W,H) * 0.22;
  const planetY = cy - H * 0.05;
  _pfDrawPlanet(ctx, cx, planetY, R, bp);

  _pfAnimId=requestAnimationFrame(_pfFrame);
}

export function enterPureFocus() {
  const ov=document.getElementById('pf-overlay'); if(!ov) return;
  _pfCanvas=document.getElementById('pf-cv'); _pfCtx=_pfCanvas.getContext('2d');
  _pfCanvas.width=window.innerWidth; _pfCanvas.height=window.innerHeight;
  _pfLastST=-999; _pfBeat=0; _pfSpike=0; _pfSpikePh=0; _pfRunning=true;
  if (!_pfGlowSprite) _pfMkGlowSprite();
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

  // 触控/点击：粒子避让 + 心跳瞬间放大
  _pfClickHandler = e => { _pfImpulseAt(e.clientX, e.clientY); _pfFire(); };
  _pfTouchHandler = e => {
    for (const t of e.touches) _pfImpulseAt(t.clientX, t.clientY);
    _pfFire();
  };
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
