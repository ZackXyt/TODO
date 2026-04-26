# Claude 专项任务指令：Todo App 功能重构

请根据以下指令，对我提供的原始 HTML 文件进行修改和功能升级。

## 1. 核心任务：移除冗余模块
* **清理恐龙**：彻底删除 HTML 代码中带有 `<!-- DINO -->` 注释的模块。
* **清理 CSS**：删除所有以 `.dino-` 开头的样式类。
* **清理 JS**：删除脚本末尾关于 `// ===== DINO hover =====` 的所有监听事件和逻辑函数。

## 2. 新增功能：专注与拉伸提醒模块
请将以下功能集成到原本小恐龙所在的位置（即 Todo 列表上方）。


### A. HTML 结构参考
```html
<div class="status-card" id="stretch-timer-card">
  <div class="status-info">
    <div class="status-label">
      当前状态: <span id="current-status">专注中 🧠</span> 
      <span id="session-counter" style="margin-left: 8px; opacity: 0.7; font-weight: 400;">(今日专注: 0 次)</span>
    </div>
    <div class="stretch-countdown" id="stretch-countdown">60:00</div>
  </div>
  <button class="reset-stretch-btn" onclick="resetStretchTimer()">拉伸完成 / 重置</button>
</div>
```

### B. CSS 样式参考
```css
/* 专注提醒卡片样式 - 保持 Apple 磨砂玻璃风格 */
.status-card {
  background: rgba(255,255,255,0.13);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 16px;
  border: 1.5px solid rgba(255,255,255,0.25);
  padding: 15px;
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: all 0.3s ease;
}

.stretch-countdown {
  font-size: 24px;
  font-weight: 200;
  color: #fff;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
}

.status-label { 
  font-size: 11px; 
  color: rgba(255,255,255,0.7); 
  font-weight: 600; 
  margin-bottom: 2px;
}

.reset-stretch-btn {
  background: rgba(100,220,120,0.2);
  border: 1px solid rgba(100,220,120,0.4);
  color: #a0ffb4;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.reset-stretch-btn:hover { 
  background: rgba(100,220,120,0.4); 
  transform: scale(1.05);
  color: white;
}


### C. JavaScript 核心逻辑参考
```javascript
// ===== STRETCH TIMER & SESSION LOGIC =====
let stretchTime = 3600; // 初始设定为 1 小时 (3600 秒)

// 从浏览器的本地存储中读取历史专注次数，如果没有则默认为 0
let completedSessions = parseInt(localStorage.getItem('todo_sessions')) || 0;

function updateStretchTimer() {
  const mins = Math.floor(stretchTime / 60);
  const secs = stretchTime % 60;
  
  // 更新倒计时显示
  const display = document.getElementById("stretch-countdown");
  if (display) {
    display.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  }
  
  // 初始化或更新页面上的专注次数显示
  const counterEl = document.getElementById("session-counter");
  if(counterEl) {
    counterEl.textContent = `(今日专注: ${completedSessions} 次)`;
  }
  
  // 更新状态文字和颜色
  const statusLabel = document.getElementById("current-status");
  if (statusLabel) {
    if (stretchTime <= 0) {
      statusLabel.textContent = "该拉伸了！🏃‍♂️";
      statusLabel.style.color = "#ff6b6b";
      // 仅在刚归零时弹出一次 Toast 提醒
      if (stretchTime === 0) {
        showToast("🔔 站起来动动身体，拉伸一下吧！");
      }
    } else if (stretchTime < 300) {
      statusLabel.textContent = "准备休息 🧘";
      statusLabel.style.color = "#ffd43b";
    } else {
      statusLabel.textContent = "专注中 🧠";
      statusLabel.style.color = "#fff";
    }
  }

  // 每一秒执行减法
  if (stretchTime > 0) {
    stretchTime--;
  }
}

function resetStretchTimer() {
  stretchTime = 3600; // 重置为一小时
  completedSessions++; // 专注次数 +1
  
  // 将最新的专注次数保存到本地，防止刷新丢失
  localStorage.setItem('todo_sessions', completedSessions);
  
  showToast(`🔄 计时重置！这是你今天的第 ${completedSessions} 次专注，继续保持！`);
  
  // 立即触发一次显示更新
  updateStretchTimer();
}

// 在页面初始化时启动计时器
setInterval(updateStretchTimer, 1000);
updateStretchTimer(); // 立即执行一次，防止初始白屏
```