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
  collection, doc, onSnapshot, getDocs, getDoc, setDoc, writeBatch,
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
  _state.pushQueue = { tasks: false, lists: false, notepad: false };
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

  setStatus('synced', '已同步');
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
