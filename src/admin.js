// =============================================================
// ADMIN · 创作者后台监控（仅管理员邮箱可见）
// -------------------------------------------------------------
// 显示注册用户聚合统计：总数、DAU/WAU/MAU、设备分布、活跃用户列表。
// 数据来源：Firestore collectionGroup('devices') 一次拉全部，前端聚合。
// 鉴权：双重——客户端检查 user.email === ADMIN_EMAIL，服务端 Firestore
// 规则也只对该邮箱开 read 权限，缺一不可。
// =============================================================

import { adminFetchAllDevices } from './sync.js';

export const ADMIN_EMAIL = 'zack2004221@163.com';

export function isAdminUser(user) {
  return !!user && user.email === ADMIN_EMAIL;
}

let _adminOverlay = null;

export async function openAdminPanel(user) {
  if (!isAdminUser(user)) {
    if (typeof window.showToast === 'function') window.showToast('🚫 仅创作者可见');
    return;
  }
  buildOverlay();
  _adminOverlay.classList.add('show');
  await refreshAdminData();
}

export function closeAdminPanel() {
  if (_adminOverlay) _adminOverlay.classList.remove('show');
}

function buildOverlay() {
  if (_adminOverlay) return;
  const ov = document.createElement('div');
  ov.id = 'admin-overlay';
  ov.className = 'admin-overlay';
  ov.innerHTML = `
    <div class="admin-modal">
      <div class="admin-header">
        <div class="admin-title">
          <span class="admin-crown">👑</span>
          <span>创作者后台 · Monitor</span>
        </div>
        <div class="admin-header-actions">
          <button class="admin-refresh" id="admin-refresh-btn" title="刷新">🔄</button>
          <button class="admin-close"   id="admin-close-btn"   title="关闭">✕</button>
        </div>
      </div>
      <div class="admin-body" id="admin-body">
        <div class="admin-loading">读取中…</div>
      </div>
      <div class="admin-foot">
        🔒 数据来源 Firestore collectionGroup('devices')，规则双重鉴权。仅展示聚合统计与设备元数据，不显示任务/笔记内容。
      </div>
    </div>
  `;
  document.body.appendChild(ov);
  _adminOverlay = ov;

  ov.addEventListener('click', e => { if (e.target === ov) closeAdminPanel(); });
  ov.querySelector('#admin-close-btn').addEventListener('click', closeAdminPanel);
  ov.querySelector('#admin-refresh-btn').addEventListener('click', refreshAdminData);
}

async function refreshAdminData() {
  const body = document.getElementById('admin-body');
  if (!body) return;
  body.innerHTML = '<div class="admin-loading">读取中…</div>';
  try {
    const devices = await adminFetchAllDevices();
    body.innerHTML = renderDashboard(devices);
  } catch (err) {
    body.innerHTML = `
      <div class="admin-error">
        <div>⚠️ 拉取失败</div>
        <div class="admin-error-msg">${escapeHtml(err?.message || String(err))}</div>
        <div class="admin-error-hint">检查 Firestore 规则是否已部署、当前账号邮箱是否与 ADMIN_EMAIL 一致。</div>
      </div>
    `;
  }
}

function renderDashboard(devices) {
  const now = Date.now();
  const D1 = 24 * 60 * 60 * 1000;

  // Aggregate by uid: {uid: {devices: [...], lastSeen: max, firstSeen: min}}
  const byUser = new Map();
  for (const d of devices) {
    const uid = d.uid;
    if (!byUser.has(uid)) byUser.set(uid, { devices: [], lastSeen: 0, firstSeen: Infinity });
    const u = byUser.get(uid);
    u.devices.push(d);
    if ((d.lastSeenAt || 0) > u.lastSeen)  u.lastSeen  = d.lastSeenAt || 0;
    if ((d.firstSeenAt || Infinity) < u.firstSeen) u.firstSeen = d.firstSeenAt || Infinity;
  }

  const totalUsers = byUser.size;
  const totalDevices = devices.length;

  const dau = [...byUser.values()].filter(u => u.lastSeen > now - 1 * D1).length;
  const wau = [...byUser.values()].filter(u => u.lastSeen > now - 7 * D1).length;
  const mau = [...byUser.values()].filter(u => u.lastSeen > now - 30 * D1).length;

  // Device type distribution
  const deviceTypes = {};
  for (const d of devices) {
    const k = (d.name || '未知').replace(/ ·.*$/, '');  // strip suffix like "· PWA"
    deviceTypes[k] = (deviceTypes[k] || 0) + 1;
  }
  const deviceList = Object.entries(deviceTypes).sort((a, b) => b[1] - a[1]);
  const maxDeviceCount = Math.max(...Object.values(deviceTypes), 1);

  // Active users list (top 30 by lastSeen)
  const activeUsers = [...byUser.entries()]
    .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
    .slice(0, 30);

  return `
    <div class="admin-stats-grid">
      <div class="admin-stat">
        <div class="admin-stat-num">${totalUsers}</div>
        <div class="admin-stat-label">注册用户</div>
        <div class="admin-stat-sub">${totalDevices} 台设备</div>
      </div>
      <div class="admin-stat">
        <div class="admin-stat-num">${dau}</div>
        <div class="admin-stat-label">DAU · 24h</div>
        <div class="admin-stat-sub">${pct(dau, totalUsers)}</div>
      </div>
      <div class="admin-stat">
        <div class="admin-stat-num">${wau}</div>
        <div class="admin-stat-label">WAU · 7d</div>
        <div class="admin-stat-sub">${pct(wau, totalUsers)}</div>
      </div>
      <div class="admin-stat">
        <div class="admin-stat-num">${mau}</div>
        <div class="admin-stat-label">MAU · 30d</div>
        <div class="admin-stat-sub">${pct(mau, totalUsers)}</div>
      </div>
    </div>

    <div class="admin-section">
      <div class="admin-section-title">📱 设备分布</div>
      ${deviceList.length === 0 ? '<div class="admin-empty">暂无设备数据</div>' : `
        <div class="admin-bars">
          ${deviceList.map(([name, count]) => `
            <div class="admin-bar-row">
              <div class="admin-bar-label">${escapeHtml(name)}</div>
              <div class="admin-bar-track">
                <div class="admin-bar-fill" style="width:${(count / maxDeviceCount * 100).toFixed(1)}%"></div>
              </div>
              <div class="admin-bar-count">${count}</div>
            </div>
          `).join('')}
        </div>
      `}
    </div>

    <div class="admin-section">
      <div class="admin-section-title">🛰 最近活跃用户（Top 30）</div>
      ${activeUsers.length === 0 ? '<div class="admin-empty">暂无用户</div>' : `
        <div class="admin-user-list">
          ${activeUsers.map(([uid, u]) => `
            <div class="admin-user-row">
              <div class="admin-user-uid" title="${escapeHtml(uid)}">${escapeHtml(uid.slice(0, 8))}…</div>
              <div class="admin-user-devs">${u.devices.length} 设备</div>
              <div class="admin-user-seen">${humanAgo(u.lastSeen)}</div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;
}

function pct(n, total) { return total ? `${((n / total) * 100).toFixed(0)}% / ${total}` : '0%'; }
function humanAgo(ts) {
  if (!ts) return '从未';
  const ms = Date.now() - ts;
  if (ms < 60_000)        return '刚刚';
  if (ms < 60 * 60_000)   return Math.round(ms / 60_000) + ' 分钟前';
  if (ms < 24 * 3600_000) return Math.round(ms / 3600_000) + ' 小时前';
  if (ms < 30 * 86400_000) return Math.round(ms / 86400_000) + ' 天前';
  return Math.round(ms / (30 * 86400_000)) + ' 个月前';
}
function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
