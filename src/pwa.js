// =============================================================
// PWA · Service Worker registration + auto-update banner
// + release-notes modal + post-update celebration
// =============================================================

let _swRegistration = null;
let _pendingReload  = null;   // updateSW(true) callback waiting for confirmation
let _cachedNotes    = null;

// ---- Public API ---------------------------------------------------------

export function initPWA() {
  // Show post-update celebration if version just changed (do this first,
  // before SW check so we don't double-trigger).
  setTimeout(checkPostUpdateCelebration, 800);

  import('virtual:pwa-register').then(({ registerSW }) => {
    const updateSW = registerSW({
      onNeedRefresh() {
        _pendingReload = () => updateSW(true);
        showUpdateBanner(_pendingReload);
      },
      onOfflineReady() {
        if (typeof window.showToast === 'function') {
          window.showToast('✅ 已离线可用');
        }
      },
      onRegisteredSW(swUrl, registration) {
        if (!registration) return;
        _swRegistration = registration;
        setTimeout(() => registration.update().catch(() => {}), 500);
        setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) registration.update().catch(() => {});
        });
        window.addEventListener('focus', () => registration.update().catch(() => {}));
      },
    });
  }).catch(() => { /* dev mode or SW unavailable */ });
}

export function checkForUpdate() {
  if (typeof window.showToast === 'function') {
    window.showToast('🔍 正在检查更新…');
  }
  if (_swRegistration) {
    _swRegistration.update()
      .then(() => {
        setTimeout(() => {
          if (!document.getElementById('pwa-update-banner') && typeof window.showToast === 'function') {
            window.showToast('✅ 已是最新版本');
          }
        }, 1500);
      })
      .catch(() => {
        if (typeof window.showToast === 'function') {
          window.showToast('❌ 检查失败，请检查网络');
        }
      });
  }
}

// ---- Update banner ------------------------------------------------------

function showUpdateBanner(onConfirm) {
  if (document.getElementById('pwa-update-banner')) return;
  const bar = document.createElement('div');
  bar.id = 'pwa-update-banner';
  bar.innerHTML = `
    <span class="pwa-banner-msg">🎉 心流有新版本</span>
    <button class="pwa-banner-btn pwa-btn-primary" id="pwa-update-yes">立即更新</button>
    <button class="pwa-banner-btn pwa-btn-secondary" id="pwa-update-peek">看看更新了啥</button>
    <button class="pwa-banner-btn pwa-btn-ghost" id="pwa-update-no">稍后</button>
  `;
  document.body.appendChild(bar);
  ensureBannerStyles();

  document.getElementById('pwa-update-yes').onclick = () => {
    bar.remove();
    onConfirm();
  };
  document.getElementById('pwa-update-peek').onclick = async () => {
    const notes = await fetchReleaseNotes();
    if (notes) showReleaseNotesModal(notes, 'preview');
    else if (typeof window.showToast === 'function') window.showToast('❌ 加载日志失败');
  };
  document.getElementById('pwa-update-no').onclick = () => bar.remove();
}

// ---- Release notes ------------------------------------------------------

async function fetchReleaseNotes() {
  if (_cachedNotes) return _cachedNotes;
  try {
    // Bust cache so we always get the freshest notes
    const url = new URL('release-notes.json', document.baseURI).href + '?t=' + Date.now();
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    _cachedNotes = await r.json();
    return _cachedNotes;
  } catch { return null; }
}

function showReleaseNotesModal(data, mode /* 'preview' | 'celebration' */) {
  // Remove if already shown
  const existing = document.getElementById('release-notes-modal');
  if (existing) existing.remove();

  // Resolve versions array (supports both new {versions:[]} and legacy single-version structure)
  let versions = [];
  if (Array.isArray(data && data.versions)) {
    versions = data.versions.slice(0, 2);
  } else if (data && data.version && data.highlights) {
    versions = [data];
  }
  if (!versions.length) return;

  const current  = versions[0];
  const previous = versions[1];
  const isCelebration = mode === 'celebration';

  const renderHighlights = v => (v.highlights || []).map(h => `
    <div class="rn-item">
      <div class="rn-item-emoji">${h.emoji || '✨'}</div>
      <div class="rn-item-body">
        <div class="rn-item-title">${escapeHtml(h.title || '')}</div>
        ${h.what ? `<div class="rn-item-what">${escapeHtml(h.what)}</div>` : ''}
        ${h.how  ? `<div class="rn-item-how">💡 ${escapeHtml(h.how)}</div>` : ''}
      </div>
    </div>
  `).join('');

  const isMajor = !!current.majorUpdate;
  const overlay = document.createElement('div');
  overlay.id = 'release-notes-modal';
  overlay.className = 'rn-overlay'
    + (isCelebration ? ' celebration' : '')
    + (isMajor ? ' major-update' : '');
  overlay.innerHTML = `
    <div class="rn-modal">
      <div class="rn-hero">
        ${isMajor ? `<div class="rn-major-badge">✨ 重磅更新 ✨</div>` : ''}
        <div class="rn-hero-emoji">${current.emoji || (isCelebration ? '🎉' : '📦')}</div>
        <div class="rn-hero-title">${
          isCelebration ? (isMajor ? `${escapeHtml(current.title || '重磅更新')} 🎉` : `升级成功！🎉`) : escapeHtml(current.title || '更新日志')
        }</div>
        <div class="rn-hero-version">v${current.version}</div>
        <div class="rn-hero-tagline">${
          isCelebration
            ? '感谢一路陪伴，作者跪谢 🙇'
            : escapeHtml(current.tagline || '')
        }</div>
      </div>
      <div class="rn-list">${renderHighlights(current)}</div>
      ${current.footer ? `<div class="rn-footer">${escapeHtml(current.footer)}</div>` : ''}

      ${previous ? `
        <div class="rn-prev-divider"></div>
        <div class="rn-prev-section">
          <div class="rn-prev-header">
            <span class="rn-prev-label">⏪ 上次更新</span>
            <span class="rn-prev-version">v${previous.version}</span>
            <span class="rn-prev-title">${escapeHtml(previous.title || '')}</span>
          </div>
          <div class="rn-list rn-list-prev">${renderHighlights(previous)}</div>
        </div>
      ` : ''}

      <div class="rn-actions">
        ${isCelebration
          ? `<button class="pwa-banner-btn pwa-btn-primary" id="rn-close-btn">继续使用 →</button>`
          : `<button class="pwa-banner-btn pwa-btn-primary" id="rn-update-now">🚀 立即升级</button>
             <button class="pwa-banner-btn pwa-btn-ghost"   id="rn-close-btn">稍后再说</button>`
        }
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  ensureNotesStyles();
  requestAnimationFrame(() => overlay.classList.add('show'));

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeReleaseNotes();
  });
  document.getElementById('rn-close-btn').onclick = closeReleaseNotes;
  if (!isCelebration) {
    document.getElementById('rn-update-now').onclick = () => {
      closeReleaseNotes();
      const bar = document.getElementById('pwa-update-banner');
      if (bar) bar.remove();
      if (_pendingReload) _pendingReload();
    };
  } else {
    // Bigger, longer celebration for major updates
    setTimeout(() => burstCelebration(isMajor ? 140 : 60), 200);
    if (isMajor) {
      // Second burst at 1s for extra wow
      setTimeout(() => burstCelebration(80), 1000);
    }
  }
}

function closeReleaseNotes() {
  const ov = document.getElementById('release-notes-modal');
  if (!ov) return;
  const wasCelebration = ov.classList.contains('celebration');
  const wasMajor       = ov.classList.contains('major-update');
  ov.classList.remove('show');
  setTimeout(() => ov.remove(), 220);
  // Send-off burst when celebration modal closes (now no backdrop blocking)
  if (wasCelebration) {
    setTimeout(() => burstCelebration(wasMajor ? 100 : 50), 250);
  }
}

// ---- Post-update celebration --------------------------------------------

async function checkPostUpdateCelebration() {
  const current = (typeof __APP_VERSION__ !== 'undefined') ? __APP_VERSION__ : null;
  if (!current) return;
  const lastSeen = localStorage.getItem('todo_last_seen_version');
  // Detect: brand-new install vs. user-upgrading-from-pre-tracking-build
  const hasExistingData = !!localStorage.getItem('todo_tasks');

  if (!lastSeen) {
    localStorage.setItem('todo_last_seen_version', current);
    // First-time install with no existing data: skip celebration
    if (!hasExistingData) return;
    // Otherwise: this is the rollout for an existing user → celebrate
  } else if (lastSeen === current) {
    return; // Same version, nothing to celebrate
  } else {
    localStorage.setItem('todo_last_seen_version', current);
  }

  const data = await fetchReleaseNotes();
  const topVersion = data && (Array.isArray(data.versions) ? data.versions[0]?.version : data.version);
  if (data && topVersion === current) {
    showReleaseNotesModal(data, 'celebration');
  } else {
    burstCelebration();
    if (typeof window.showToast === 'function') {
      window.showToast(`🎉 升级到 v${current} 成功！`);
    }
  }
}

// ---- Confetti -----------------------------------------------------------

function burstCelebration(particleCount = 60) {
  const EMOJIS = ['🎉','🎊','✨','⭐','💫','🌟','🎈','🍀','🚀','🎁','🦋','💎','👑'];
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const N = particleCount;
  for (let i = 0; i < N; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    piece.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    piece.style.left = cx + 'px';
    piece.style.top  = cy + 'px';
    const angle = Math.random() * Math.PI * 2;
    const dist  = 200 + Math.random() * 320;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 60;
    piece.style.setProperty('--dx', dx + 'px');
    piece.style.setProperty('--dy', dy + 'px');
    piece.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
    piece.style.fontSize = (16 + Math.random() * 18) + 'px';
    piece.style.animation = `confetti-fly ${1.2 + Math.random() * 0.8}s ease-out forwards`;
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 2200);
  }
}

// ---- Helpers ------------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function ensureBannerStyles() {
  if (document.getElementById('pwa-banner-styles')) return;
  const st = document.createElement('style');
  st.id = 'pwa-banner-styles';
  st.textContent = `
    #pwa-update-banner {
      position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
      background: rgba(28,28,48,0.96); backdrop-filter: blur(16px);
      color: white; padding: 12px 18px; border-radius: 14px;
      border: 1.5px solid rgba(255,255,255,0.18);
      box-shadow: 0 8px 32px rgba(0,0,0,0.45);
      z-index: 99999; display: flex; align-items: center; gap: 10px;
      font-size: 13px; font-family: inherit;
      animation: pwaBannerIn 0.35s ease;
      max-width: calc(100vw - 32px); flex-wrap: wrap; justify-content: center;
    }
    @keyframes pwaBannerIn {
      from { opacity: 0; transform: translate(-50%, 16px); }
      to   { opacity: 1; transform: translate(-50%, 0); }
    }
    .pwa-banner-msg { font-weight: 600; }
    .pwa-banner-btn {
      padding: 5px 12px; border-radius: 8px; font-size: 12px;
      font-weight: 600; cursor: pointer; font-family: inherit;
      transition: all 0.18s; line-height: 1;
    }
    .pwa-btn-primary {
      background: rgba(120,200,255,0.25);
      border: 1px solid rgba(120,200,255,0.5);
      color: white;
    }
    .pwa-btn-primary:hover { background: rgba(120,200,255,0.42); }
    .pwa-btn-secondary {
      background: rgba(180,140,255,0.18);
      border: 1px solid rgba(180,140,255,0.4);
      color: rgba(220,200,255,0.95);
    }
    .pwa-btn-secondary:hover { background: rgba(180,140,255,0.32); color: white; }
    .pwa-btn-ghost {
      background: none; border: none;
      color: rgba(255,255,255,0.5); padding: 4px 6px;
    }
    .pwa-btn-ghost:hover { color: white; }
    /* Confetti pieces (used both by app and by celebration) */
    .confetti-piece {
      position: fixed; pointer-events: none; z-index: 100002;
      font-size: 18px; will-change: transform, opacity; user-select: none;
      filter: drop-shadow(0 2px 6px rgba(0,0,0,0.3));
    }
    @keyframes confetti-fly {
      0%   { transform: translate(0, 0) rotate(0deg) scale(0.6); opacity: 1; }
      20%  { opacity: 1; }
      100% { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(1); opacity: 0; }
    }
  `;
  document.head.appendChild(st);
}

function ensureNotesStyles() {
  if (document.getElementById('release-notes-styles')) return;
  const st = document.createElement('style');
  st.id = 'release-notes-styles';
  st.textContent = `
    .rn-overlay {
      position: fixed; inset: 0; z-index: 100000;
      background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);
      display: flex; align-items: center; justify-content: center;
      opacity: 0; pointer-events: none; transition: opacity 0.25s ease;
      padding: 20px;
    }
    .rn-overlay.show { opacity: 1; pointer-events: all; }
    .rn-overlay.celebration {
      background: radial-gradient(circle at center, rgba(80,40,120,0.6), rgba(0,0,0,0.85));
    }
    .rn-overlay.major-update .rn-modal {
      background: linear-gradient(155deg, rgba(48,28,98,0.97), rgba(20,14,52,0.97), rgba(48,28,98,0.97));
      border: 1.5px solid rgba(255,200,100,0.45);
      box-shadow: 0 20px 80px rgba(0,0,0,0.75),
                  0 0 0 1px rgba(255,255,255,0.06),
                  0 0 60px rgba(180,140,255,0.25),
                  0 0 120px rgba(255,200,100,0.15);
      animation: majorPulse 3s ease-in-out infinite;
    }
    @keyframes majorPulse {
      0%, 100% { box-shadow: 0 20px 80px rgba(0,0,0,0.75),
                              0 0 0 1px rgba(255,255,255,0.06),
                              0 0 60px rgba(180,140,255,0.25),
                              0 0 120px rgba(255,200,100,0.15); }
      50%      { box-shadow: 0 20px 90px rgba(0,0,0,0.8),
                              0 0 0 1px rgba(255,255,255,0.1),
                              0 0 80px rgba(180,140,255,0.4),
                              0 0 160px rgba(255,200,100,0.25); }
    }
    .rn-overlay.major-update .rn-hero-emoji {
      font-size: 56px;
      animation: majorEmoji 2s ease-in-out infinite;
    }
    @keyframes majorEmoji {
      0%,100% { transform: translateY(0) rotate(-5deg) scale(1); }
      33%     { transform: translateY(-10px) rotate(5deg) scale(1.1); }
      66%     { transform: translateY(-4px) rotate(-3deg) scale(1.05); }
    }
    .rn-overlay.major-update .rn-hero-title {
      font-size: 22px;
      background: linear-gradient(135deg, #ffd966, #ff9966, #c699ff);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      font-weight: 800;
      letter-spacing: 0.3px;
    }
    .rn-overlay.major-update .rn-hero-version {
      font-size: 13px; padding: 3px 12px;
      background: linear-gradient(135deg, rgba(255,200,100,0.3), rgba(180,140,255,0.3));
      border-color: rgba(255,200,100,0.5);
      color: white;
      box-shadow: 0 2px 10px rgba(255,200,100,0.3);
    }
    .rn-overlay.major-update .rn-hero-tagline {
      font-size: 13px; color: rgba(255,220,180,0.85);
      font-weight: 500;
    }
    .rn-major-badge {
      display: inline-block;
      background: linear-gradient(135deg, #ffd966, #ff9966);
      color: #1a1a2e;
      font-size: 10px; font-weight: 800;
      padding: 2px 8px; border-radius: 10px;
      margin-bottom: 8px;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      box-shadow: 0 2px 8px rgba(255,150,100,0.4);
    }
    .rn-modal {
      background: linear-gradient(155deg, rgba(36,30,68,0.97), rgba(20,18,42,0.97));
      backdrop-filter: blur(28px);
      border: 1px solid rgba(180,140,255,0.28);
      border-radius: 22px;
      padding: 28px 26px 22px;
      max-width: 440px; width: 100%;
      max-height: 88vh; overflow-y: auto;
      box-shadow: 0 20px 70px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
      transform: scale(0.94) translateY(12px);
      transition: transform 0.3s cubic-bezier(.2,.8,.2,1.2);
      color: white;
    }
    .rn-overlay.show .rn-modal { transform: scale(1) translateY(0); }
    .rn-hero { text-align: center; margin-bottom: 16px; padding-bottom: 14px;
               border-bottom: 1px solid rgba(255,255,255,0.07); }
    .rn-hero-emoji { font-size: 42px; line-height: 1; margin-bottom: 8px;
                     animation: rnHeroBounce 1.6s ease-in-out infinite; }
    @keyframes rnHeroBounce {
      0%,100% { transform: translateY(0) rotate(-3deg); }
      50%     { transform: translateY(-6px) rotate(3deg); }
    }
    .rn-hero-title { font-size: 18px; font-weight: 700; letter-spacing: 0.5px; }
    .rn-hero-version {
      display: inline-block; margin-top: 4px;
      background: rgba(120,200,255,0.18); color: rgba(180,220,255,0.95);
      border: 1px solid rgba(120,200,255,0.35); border-radius: 8px;
      padding: 2px 9px; font-family: 'SF Mono', Menlo, monospace;
      font-size: 11px; font-weight: 600;
    }
    .rn-hero-tagline { font-size: 12px; color: rgba(255,255,255,0.55);
                       margin-top: 8px; line-height: 1.5; }
    .rn-list { display: flex; flex-direction: column; gap: 12px; }
    .rn-item {
      display: flex; gap: 12px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px; padding: 11px 13px;
      transition: background 0.2s;
    }
    .rn-item:hover { background: rgba(255,255,255,0.07); }
    .rn-item-emoji { font-size: 24px; line-height: 1.2; flex-shrink: 0; }
    .rn-item-body { flex: 1; min-width: 0; }
    .rn-item-title { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.95);
                     margin-bottom: 4px; }
    .rn-item-what  { font-size: 11.5px; color: rgba(255,255,255,0.7); line-height: 1.55; }
    .rn-item-how   { font-size: 11px; color: rgba(180,220,255,0.78);
                     margin-top: 4px; line-height: 1.5; }
    .rn-footer {
      text-align: center; margin-top: 14px; padding-top: 12px;
      border-top: 1px solid rgba(255,255,255,0.06);
      font-size: 11px; color: rgba(255,180,220,0.7); font-style: italic;
    }
    .rn-prev-divider {
      height: 1px; margin: 18px 0 14px;
      background: linear-gradient(to right,
        transparent, rgba(180,140,255,0.25), transparent);
    }
    .rn-prev-section { opacity: 0.78; }
    .rn-prev-header {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      margin-bottom: 8px; padding: 0 2px;
    }
    .rn-prev-label {
      font-size: 11px; font-weight: 700; color: rgba(180,140,255,0.85);
      letter-spacing: 0.5px;
    }
    .rn-prev-version {
      background: rgba(180,140,255,0.12);
      border: 1px solid rgba(180,140,255,0.28);
      border-radius: 6px; padding: 1px 7px;
      font-family: 'SF Mono', Menlo, monospace;
      font-size: 10px; font-weight: 600;
      color: rgba(220,200,255,0.9);
    }
    .rn-prev-title {
      font-size: 11.5px; color: rgba(255,255,255,0.6);
      font-style: italic;
    }
    .rn-list-prev .rn-item {
      background: rgba(255,255,255,0.025);
      border-color: rgba(255,255,255,0.04);
    }
    .rn-list-prev .rn-item-title { font-size: 12px; }
    .rn-list-prev .rn-item-what  { font-size: 11px; }
    .rn-list-prev .rn-item-how   { font-size: 10.5px; }
    .rn-list-prev .rn-item-emoji { font-size: 20px; }
    .rn-actions {
      display: flex; gap: 10px; margin-top: 18px;
      justify-content: center; flex-wrap: wrap;
    }
    .rn-actions .pwa-banner-btn { padding: 9px 18px; font-size: 13px; }
  `;
  document.head.appendChild(st);
}
