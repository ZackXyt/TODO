// =============================================================
// SYNC · Firestore real-time bidirectional sync
// -------------------------------------------------------------
// Strategy:
// - Each user has /users/{uid}/tasks/{taskId} + /users/{uid}/lists/{listId}
// - Local mutations call syncTasksToCloud()/syncListsToCloud() (debounced)
// - Firestore onSnapshot listener pushes remote changes back to local
// - Conflict resolution: last-write-wins by `updatedAt` (Date.now())
// - Loops avoided via metadata.hasPendingWrites + isApplyingRemote flag
// =============================================================

import { db } from './firebase.js';
import {
  collection, doc, onSnapshot, getDocs, getDoc, setDoc, deleteDoc, writeBatch,
} from 'firebase/firestore';
import { onUserChange } from './auth.js';

const _state = {
  uid: null,
  unsubs: [],
  status: 'offline',     // offline | syncing | synced | error
  isApplyingRemote: false,
  pushQueue: { tasks: false, lists: false, notepad: false },
  pushTimer: null,
  initialPullDone: false,
  heartbeatTimer: null,
  focusHandlerInstalled: false,
};

// ---- Status indicator ----

function setStatus(s, detail = '') {
  _state.status = s;
  if (typeof window.updateSyncIndicator === 'function') {
    window.updateSyncIndicator(s, detail);
  }
}
export function getSyncStatus() { return _state.status; }

// ---- Init ----

export function initSync() {
  onUserChange(user => {
    teardown();
    if (user) {
      _state.uid = user.uid;
      setStatus('syncing', '初始化中…');
      setupForUser(user.uid).catch(err => {
        console.error('Sync setup failed:', err);
        setStatus('error', err?.code || '初始化失败');
      });
    } else {
      _state.uid = null;
      _state.initialPullDone = false;
      setStatus('offline', '未登录');
    }
  });
}

function teardown() {
  _state.unsubs.forEach(u => { try { u(); } catch {} });
  _state.unsubs = [];
  clearTimeout(_state.pushTimer);
  clearInterval(_state.heartbeatTimer);
  _state.pushQueue = { tasks: false, lists: false, notepad: false };
  // 登出时清空 UI 设备列表
  if (typeof window.renderDevicesUI === 'function') {
    window.renderDevicesUI([], getOrCreateDeviceId());
  }
}

async function setupForUser(uid) {
  // 1. Initial pull + merge with local
  await pullAndMerge(uid);
  _state.initialPullDone = true;

  // 2. Real-time listeners (also fires for any local writes after this point)
  const tasksCol = collection(db, 'users', uid, 'tasks');
  const unsubTasks = onSnapshot(
    tasksCol,
    snap => handleSnapshot(snap, 'tasks'),
    err => {
      console.error('Tasks listener error:', err);
      setStatus('error', err?.code || '监听失败');
    }
  );
  _state.unsubs.push(unsubTasks);

  const listsCol = collection(db, 'users', uid, 'lists');
  const unsubLists = onSnapshot(
    listsCol,
    snap => handleSnapshot(snap, 'lists'),
    err => console.error('Lists listener error:', err)
  );
  _state.unsubs.push(unsubLists);

  // 随想录是单文档（每个用户只有一个），单独监听
  const notepadRef = doc(db, 'users', uid, 'profile', 'notepad');
  const unsubNotepad = onSnapshot(
    notepadRef,
    snap => handleNotepadSnapshot(snap),
    err => console.error('Notepad listener error:', err)
  );
  _state.unsubs.push(unsubNotepad);

  // 设备登记 + 实时监听账号在哪些设备登录
  await registerDevice(uid);
  startDeviceHeartbeat(uid);
  const devicesCol = collection(db, 'users', uid, 'devices');
  const unsubDevices = onSnapshot(
    devicesCol,
    snap => handleDevicesSnapshot(snap),
    err => console.error('Devices listener error:', err)
  );
  _state.unsubs.push(unsubDevices);

  setStatus('synced', '已同步');
}

// ---- Device registry ----
// 每台设备首次登录时生成稳定的 UUID 存 localStorage，以后心跳用同一个 ID 更新
// lastSeenAt。这样扩展坞能实时统计『这个账号登录在几台设备上』。

function getOrCreateDeviceId() {
  let id = localStorage.getItem('todo_device_id');
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : ('d-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10));
    localStorage.setItem('todo_device_id', id);
  }
  return id;
}

function getDeviceName() {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (typeof navigator.standalone === 'boolean' && navigator.standalone);
  const mode = standalone ? ' · PWA' : '';
  if (/iPhone/i.test(ua))   return 'iPhone' + mode;
  if (/iPad/i.test(ua))     return 'iPad' + mode;
  if (/Android/i.test(ua))  return 'Android' + mode;
  if (/Macintosh|Mac OS/i.test(ua)) {
    if (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) return 'Mac · Safari';
    if (/Edg\//.test(ua))    return 'Mac · Edge';
    if (/Chrome\//.test(ua)) return 'Mac · Chrome';
    if (/Firefox/.test(ua))  return 'Mac · Firefox';
    return 'Mac';
  }
  if (/Windows/i.test(ua))  return 'Windows';
  if (/Linux/i.test(platform)) return 'Linux';
  return '未知设备';
}

async function registerDevice(uid) {
  try {
    const id = getOrCreateDeviceId();
    const ref = doc(db, 'users', uid, 'devices', id);
    const now = Date.now();
    const existing = await getDoc(ref);
    const base = {
      deviceId: id,
      name: getDeviceName(),
      userAgent: navigator.userAgent || '',
      platform: navigator.platform || '',
      lastSeenAt: now,
    };
    if (existing.exists()) {
      const prev = existing.data();
      await setDoc(ref, { ...base, firstSeenAt: prev.firstSeenAt || now }, { merge: true });
    } else {
      await setDoc(ref, { ...base, firstSeenAt: now });
    }
  } catch (err) {
    console.error('Register device failed:', err);
  }
}

function startDeviceHeartbeat(uid) {
  clearInterval(_state.heartbeatTimer);
  // 每 5 分钟更新一次 lastSeenAt（在线时长统计 + 设备活跃度判断）
  _state.heartbeatTimer = setInterval(() => touchDevice(uid), 5 * 60 * 1000);
  // 窗口重新聚焦也算心跳（用户切回 app）
  if (!_state.focusHandlerInstalled) {
    window.addEventListener('focus', () => { if (_state.uid) touchDevice(_state.uid); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && _state.uid) touchDevice(_state.uid);
    });
    _state.focusHandlerInstalled = true;
  }
}

async function touchDevice(uid) {
  try {
    const id = getOrCreateDeviceId();
    const ref = doc(db, 'users', uid, 'devices', id);
    await setDoc(ref, { lastSeenAt: Date.now() }, { merge: true });
  } catch {} // 心跳失败无所谓，下次再试
}

function handleDevicesSnapshot(snap) {
  const myId = getOrCreateDeviceId();
  const devices = snap.docs.map(d => d.data())
    .filter(d => d && d.deviceId)
    // 过滤 60 天没活跃的，避免无限累积
    .filter(d => (Date.now() - (d.lastSeenAt || 0)) < 60 * 24 * 3600 * 1000)
    .sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
  // 通过全局 hook 把数据塞到 UI（auth.js 渲染设备列表）
  if (typeof window.renderDevicesUI === 'function') {
    window.renderDevicesUI(devices, myId);
  }
}

export async function logoutCurrentDevice(uid) {
  // 退出登录时移除当前设备记录
  try {
    if (!uid) return;
    const id = getOrCreateDeviceId();
    await deleteDoc(doc(db, 'users', uid, 'devices', id));
  } catch {}
}

// 隐私政策同意时间戳——便于审计
export async function writeConsent(uid) {
  if (!uid) return;
  await setDoc(doc(db, 'users', uid, 'profile', 'consent'), {
    version: '2026-04-28',
    acceptedAt: Date.now(),
    via: 'signup',
  }, { merge: true });
}

// GDPR 删除权：清空 users/{uid}/* 下所有子集合
export async function deleteAccountData(uid) {
  if (!uid) throw new Error('no uid');
  const subcols = ['tasks', 'lists', 'devices', 'profile'];
  for (const sub of subcols) {
    const snap = await getDocs(collection(db, 'users', uid, sub));
    if (snap.empty) continue;
    // Batch delete (limit 500 per batch)
    let batch = writeBatch(db);
    let count = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      count++;
      if (count >= 450) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
  }
}

// === Admin（创作者）只读聚合 ===
// Firestore 规则把读权限开给了 ADMIN_EMAIL；普通用户拉这些会被规则拒绝。
export async function adminFetchAllDevices() {
  const { collectionGroup, getDocs } = await import('firebase/firestore');
  const snap = await getDocs(collectionGroup(db, 'devices'));
  return snap.docs.map(d => ({
    path: d.ref.path,
    uid: d.ref.parent.parent?.id || 'unknown',
    ...d.data(),
  }));
}

// ---- Initial pull + merge ----

async function pullAndMerge(uid) {
  // Tasks
  const tasksSnap = await getDocs(collection(db, 'users', uid, 'tasks'));
  const cloudTasks = tasksSnap.docs.map(d => d.data());
  const localTasks = JSON.parse(localStorage.getItem('todo_tasks') || '[]');
  const mergedTasks = mergeByTimestamp(localTasks, cloudTasks);
  localStorage.setItem('todo_tasks', JSON.stringify(mergedTasks));

  // Lists
  const listsSnap = await getDocs(collection(db, 'users', uid, 'lists'));
  const cloudLists = listsSnap.docs.map(d => d.data());
  const localLists = JSON.parse(localStorage.getItem('todo_lists') || '[]');
  const mergedLists = mergeByTimestamp(localLists, cloudLists);
  // Lists may be empty if user deleted all — fall back to defaults handled in main.js
  if (mergedLists.length > 0) {
    localStorage.setItem('todo_lists', JSON.stringify(mergedLists));
  }

  // Notepad（单文档：users/{uid}/profile/notepad，schema: { content, updatedAt }）
  const notepadSnap = await getDoc(doc(db, 'users', uid, 'profile', 'notepad'));
  const cloudNotepad = notepadSnap.exists() ? notepadSnap.data() : null;
  const localNotepad = {
    content: localStorage.getItem('todo_notepad') || '',
    updatedAt: parseInt(localStorage.getItem('todo_notepad_updatedAt') || '0', 10),
  };
  const mergedNotepad = (cloudNotepad && (cloudNotepad.updatedAt || 0) > localNotepad.updatedAt)
    ? cloudNotepad
    : localNotepad;
  localStorage.setItem('todo_notepad', mergedNotepad.content || '');
  localStorage.setItem('todo_notepad_updatedAt', String(mergedNotepad.updatedAt || 0));

  // Apply to live state in main.js
  if (typeof window.reloadDataFromStorage === 'function') {
    window.reloadDataFromStorage();
  }
  if (typeof window.reloadNotepadFromStorage === 'function') {
    window.reloadNotepadFromStorage();
  }

  // Push merged result back so cloud reflects the union (handles "local had newer")
  await pushAll(uid, mergedTasks, mergedLists.length > 0 ? mergedLists : localLists, mergedNotepad);
}

function mergeByTimestamp(local, remote) {
  const byId = new Map();
  // Seed with local
  local.forEach(item => { if (item && item.id != null) byId.set(String(item.id), item); });
  // Override with remote if newer
  remote.forEach(item => {
    if (!item || item.id == null) return;
    const id = String(item.id);
    const existing = byId.get(id);
    const remoteTs = item.updatedAt || 0;
    const localTs  = existing ? (existing.updatedAt || 0) : 0;
    if (!existing || remoteTs >= localTs) byId.set(id, item);
  });
  return Array.from(byId.values());
}

// ---- Snapshot listener ----

function handleSnapshot(snap, kind) {
  if (!_state.initialPullDone) return; // ignore until initial merge done
  // Skip if this snapshot reflects our own local writes that haven't reached server yet
  if (snap.metadata.hasPendingWrites) return;

  const storageKey = kind === 'tasks' ? 'todo_tasks' : 'todo_lists';
  const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
  let changed = false;

  snap.docChanges().forEach(change => {
    const data = change.doc.data();
    const id = change.doc.id;
    const idx = items.findIndex(t => String(t.id) === id);

    if (change.type === 'removed') {
      if (idx !== -1) {
        items.splice(idx, 1);
        changed = true;
      }
    } else {
      // added or modified
      const remoteTs = data.updatedAt || 0;
      if (idx === -1) {
        items.push(data);
        changed = true;
      } else {
        const localTs = items[idx].updatedAt || 0;
        if (remoteTs > localTs) {
          items[idx] = data;
          changed = true;
        }
      }
    }
  });

  if (changed) {
    _state.isApplyingRemote = true;
    localStorage.setItem(storageKey, JSON.stringify(items));
    if (typeof window.reloadDataFromStorage === 'function') {
      window.reloadDataFromStorage();
    }
    _state.isApplyingRemote = false;
  }
}

// ---- Notepad listener ----

function handleNotepadSnapshot(snap) {
  if (!_state.initialPullDone) return;
  if (snap.metadata.hasPendingWrites) return;
  if (!snap.exists()) return;
  const cloud = snap.data();
  const localTs = parseInt(localStorage.getItem('todo_notepad_updatedAt') || '0', 10);
  const cloudTs = cloud.updatedAt || 0;
  if (cloudTs > localTs) {
    _state.isApplyingRemote = true;
    localStorage.setItem('todo_notepad', cloud.content || '');
    localStorage.setItem('todo_notepad_updatedAt', String(cloudTs));
    if (typeof window.reloadNotepadFromStorage === 'function') {
      window.reloadNotepadFromStorage();
    }
    _state.isApplyingRemote = false;
  }
}

// ---- Push (debounced) ----

export function syncTasksToCloud()   { schedulePush('tasks'); }
export function syncListsToCloud()   { schedulePush('lists'); }
export function syncNotepadToCloud() { schedulePush('notepad'); }

// Manual force-sync: triggered from "立即同步" button in account card.
// Re-pulls cloud, merges with local, pushes back result. Use when in doubt.
export async function manualSync() {
  if (!_state.uid) {
    if (typeof window.showToast === 'function') {
      window.showToast('⚠️ 请先登录账号');
    }
    return;
  }
  setStatus('syncing', '强制同步中…');
  try {
    await pullAndMerge(_state.uid);
    setStatus('synced', '已同步');
    if (typeof window.showToast === 'function') {
      window.showToast('🔄 同步完成');
    }
  } catch (err) {
    console.error('Manual sync failed:', err);
    setStatus('error', err?.code || '同步失败');
    if (typeof window.showToast === 'function') {
      window.showToast('❌ 同步失败：' + (err?.code || err?.message || '未知错误'));
    }
  }
}

function schedulePush(kind) {
  if (!_state.uid || _state.isApplyingRemote) return;
  _state.pushQueue[kind] = true;
  clearTimeout(_state.pushTimer);
  _state.pushTimer = setTimeout(flushPush, 800);
}

async function flushPush() {
  if (!_state.uid) return;
  setStatus('syncing', '同步中…');
  try {
    const tasks = JSON.parse(localStorage.getItem('todo_tasks') || '[]');
    const lists = JSON.parse(localStorage.getItem('todo_lists') || '[]');
    const notepad = {
      content: localStorage.getItem('todo_notepad') || '',
      updatedAt: parseInt(localStorage.getItem('todo_notepad_updatedAt') || '0', 10),
    };
    await pushAll(_state.uid, tasks, lists, notepad);
    _state.pushQueue.tasks = false;
    _state.pushQueue.lists = false;
    _state.pushQueue.notepad = false;
    setStatus('synced', '已同步');
  } catch (err) {
    console.error('Push failed:', err);
    setStatus('error', err?.code || '同步失败');
  }
}

async function pushAll(uid, tasks, lists, notepad) {
  const now = Date.now();

  // Stamp updatedAt on items missing it (so first-time sync gets timestamps)
  tasks.forEach(t => { if (!t.updatedAt) t.updatedAt = now; });
  lists.forEach(l => { if (!l.updatedAt) l.updatedAt = now; });
  // Persist stamped versions locally
  localStorage.setItem('todo_tasks', JSON.stringify(tasks));
  localStorage.setItem('todo_lists', JSON.stringify(lists));

  // Push tasks (batched)
  await batchedSet(`users/${uid}/tasks`, tasks);
  await batchedDeleteMissing(`users/${uid}/tasks`, tasks);

  // Push lists
  await batchedSet(`users/${uid}/lists`, lists);
  await batchedDeleteMissing(`users/${uid}/lists`, lists);

  // Push notepad（单文档 set，覆盖式写入）
  if (notepad) {
    const stampedNotepad = {
      content: notepad.content || '',
      updatedAt: notepad.updatedAt || now,
    };
    if (!notepad.updatedAt) {
      localStorage.setItem('todo_notepad_updatedAt', String(stampedNotepad.updatedAt));
    }
    await setDoc(doc(db, 'users', uid, 'profile', 'notepad'), stampedNotepad);
  }
}

async function batchedSet(path, items) {
  if (!items || items.length === 0) return;
  const segments = path.split('/');
  for (let i = 0; i < items.length; i += 400) {
    const slice = items.slice(i, i + 400);
    const batch = writeBatch(db);
    slice.forEach(item => {
      const ref = doc(db, ...segments, String(item.id));
      batch.set(ref, item);
    });
    await batch.commit();
  }
}

async function batchedDeleteMissing(path, localItems) {
  const segments = path.split('/');
  const cloudSnap = await getDocs(collection(db, ...segments));
  const localIds = new Set(localItems.map(i => String(i.id)));
  const toDelete = cloudSnap.docs.filter(d => !localIds.has(d.id));
  if (toDelete.length === 0) return;
  for (let i = 0; i < toDelete.length; i += 400) {
    const slice = toDelete.slice(i, i + 400);
    const batch = writeBatch(db);
    slice.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}
