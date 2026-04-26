// =============================================================
// AUTH · Sign up / Sign in / Sign out / Password reset
// -------------------------------------------------------------
// Wraps Firebase Auth with friendly error messages + UI hooks.
// Modal HTML lives in index.html (#auth-modal-overlay).
// =============================================================

import { auth } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';

let _currentUser = null;
const _authListeners = new Set();

// ---- Public API ----

export function getCurrentUser() { return _currentUser; }

export function onUserChange(cb) {
  _authListeners.add(cb);
  // Fire immediately with current state so callers don't miss it
  try { cb(_currentUser); } catch {}
  return () => _authListeners.delete(cb);
}

// Initialize auth state listener (call once at boot)
export function initAuth() {
  onAuthStateChanged(auth, user => {
    _currentUser = user || null;
    _authListeners.forEach(cb => { try { cb(_currentUser); } catch {} });
    updateAccountUI();
  });
}

// ---- Modal control ----

export function openAuthModal(mode = 'signin') {
  closeAuthError();
  setAuthMode(mode);
  const ov = document.getElementById('auth-modal-overlay');
  if (ov) {
    ov.classList.add('show');
    setTimeout(() => document.getElementById('auth-email')?.focus(), 60);
  }
}

export function closeAuthModal() {
  document.getElementById('auth-modal-overlay')?.classList.remove('show');
  closeAuthError();
}

export function setAuthMode(mode /* 'signin' | 'signup' | 'reset' */) {
  const root = document.getElementById('auth-modal-overlay');
  if (!root) return;
  const oldMode = root.dataset.mode;
  root.dataset.mode = mode;
  // Update title + button labels via dataset so CSS picks it up
  const titles = { signin: '🔐 登录', signup: '✨ 创建账号', reset: '🔑 重置密码' };
  const subs   = {
    signin: '欢迎回来，登录后多设备同步',
    signup: '注册一个免费账号，所有任务云端同步',
    reset:  '输入注册邮箱，我们会发送重置链接',
  };
  const submitLabels = { signin: '登录 →', signup: '注册 →', reset: '发送重置邮件 →' };
  document.getElementById('auth-modal-title').textContent = titles[mode] || '🔐 登录';
  document.getElementById('auth-modal-sub').textContent  = subs[mode] || '';
  document.getElementById('auth-submit-btn').textContent = submitLabels[mode] || '提交 →';
  // Only clear error when actually changing modes (so errors persist on the same form)
  if (oldMode && oldMode !== mode) closeAuthError();
}

// ---- Form submit ----

// Submit-button labels per mode (kept here so finally-block can restore without
// calling setAuthMode, which would also wipe the error message)
const SUBMIT_LABELS = { signin: '登录 →', signup: '注册 →', reset: '发送重置邮件 →' };

export async function submitAuthForm() {
  const ov  = document.getElementById('auth-modal-overlay');
  const mode = ov?.dataset.mode || 'signin';
  const email = document.getElementById('auth-email').value.trim();
  const pw    = document.getElementById('auth-password').value;
  const btn   = document.getElementById('auth-submit-btn');

  // Clear any previous error from a prior submit
  closeAuthError();

  // Local validation (synchronous)
  if (!email) { showAuthError('请输入邮箱'); return; }
  if (mode !== 'reset' && !pw) { showAuthError('请输入密码'); return; }
  if (mode === 'signup' && pw.length < 6) { showAuthError('密码至少 6 位'); return; }

  btn.disabled = true;
  btn.textContent = '处理中…';
  try {
    if (mode === 'signin') {
      await signInWithEmailAndPassword(auth, email, pw);
      closeAuthModal();
      window.showToast?.('🎉 登录成功');
    } else if (mode === 'signup') {
      const cred = await createUserWithEmailAndPassword(auth, email, pw);
      try { await updateProfile(cred.user, { displayName: email.split('@')[0] }); } catch {}
      closeAuthModal();
      window.showToast?.('✨ 注册成功，欢迎加入心流！');
    } else if (mode === 'reset') {
      await sendPasswordResetEmail(auth, email);
      window.showToast?.('📧 重置邮件已发送，请查收');
      setAuthMode('signin');
    }
  } catch (err) {
    showAuthError(translateAuthError(err));
  } finally {
    btn.disabled = false;
    // Restore button label WITHOUT calling setAuthMode (which would clear error)
    btn.textContent = SUBMIT_LABELS[ov.dataset.mode] || '提交 →';
  }
}

export async function logoutUser() {
  if (!confirm('确定要退出登录吗？\n本地数据不会丢失，下次登录可重新同步。')) return;
  try {
    await signOut(auth);
    window.showToast?.('👋 已退出登录');
  } catch (err) {
    window.showToast?.('❌ 退出失败：' + err.message);
  }
}

// ---- UI helpers ----

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}
function closeAuthError() {
  document.getElementById('auth-error')?.classList.remove('show');
}

function translateAuthError(err) {
  const code = err?.code || '';
  const map = {
    'auth/invalid-email':         '邮箱格式不正确',
    'auth/user-not-found':        '账号不存在，请先注册',
    'auth/wrong-password':        '密码错误',
    'auth/invalid-credential':    '邮箱或密码错误',
    'auth/email-already-in-use':  '邮箱已被注册，请直接登录',
    'auth/weak-password':         '密码太弱（至少 6 位）',
    'auth/too-many-requests':     '尝试次数过多，请稍后再试',
    'auth/network-request-failed':'网络异常，请检查连接（中国大陆需 VPN）',
    'auth/operation-not-allowed': '该登录方式未开启',
  };
  return map[code] || err?.message || '出错了，请重试';
}

// ---- Account UI in side menu ----

export function updateAccountUI() {
  const card = document.getElementById('account-card');
  if (!card) return;
  if (_currentUser) {
    const initial = (_currentUser.displayName || _currentUser.email || '?').charAt(0).toUpperCase();
    card.innerHTML = `
      <div class="acct-avatar">${initial}</div>
      <div class="acct-info">
        <div class="acct-name">${_currentUser.displayName || _currentUser.email.split('@')[0]}</div>
        <div class="acct-email">${_currentUser.email}</div>
      </div>
      <button class="acct-logout-btn" onclick="logoutUser()" title="退出登录">退出</button>
    `;
    card.classList.add('logged-in');
  } else {
    card.innerHTML = `
      <div class="acct-avatar acct-avatar-empty">👤</div>
      <div class="acct-info">
        <div class="acct-name">未登录</div>
        <div class="acct-email">登录后即可多设备同步</div>
      </div>
      <button class="acct-login-btn" onclick="openAuthModal('signin')">登录</button>
    `;
    card.classList.remove('logged-in');
  }
}
