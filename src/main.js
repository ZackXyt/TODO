    // ╔═══════════════════════════════════════════════════════════════╗
    // ║  心流 HeartFlow · main.js                                      ║
    // ║  ───────────────────────────────────────────────────────────  ║
    // ║                                                               ║
    // ║  🗂  目录（按 Cmd+F 搜索这些标签即可跳转）                     ║
    // ║                                                               ║
    // ║   §CLOCK         时钟 + 日期                                   ║
    // ║   §WEATHER       天气组件 + 城市搜索                           ║
    // ║   §WALLPAPER     壁纸取色器                                    ║
    // ║   §TASKS         任务核心：CRUD/列表/步骤/排序                 ║
    // ║   §LISTS         多列表/分类                                   ║
    // ║   §STEPS         子任务（步骤）                                ║
    // ║   §DRAG          拖拽排序                                      ║
    // ║   §SHORTCUTS     键盘快捷键                                    ║
    // ║   §SEARCH        任务搜索                                      ║
    // ║   §EDIT          任务编辑（点击名称弹窗）                      ║
    // ║   §DATA-IO       JSON 导出/导入                                ║
    // ║   §DELETE        删除确认弹窗                                  ║
    // ║   §REMINDERS     定时提醒通知                                  ║
    // ║   §TOAST         右下角通知条                                  ║
    // ║   §POMODORO      番茄计时器 + 自定义时长                       ║
    // ║   §NOTEPAD       随想录                                        ║
    // ║   §RESIZE        Todo 面板宽度拖拽                             ║
    // ║   §INIT          首屏渲染 + 间隔检查                           ║
    // ║   §COMPLETED     已完成任务面板 + 恢复                         ║
    // ║   §MENU          扩展坞菜单                                    ║
    // ║   §FOCUS         专注模式                                      ║
    // ║   §LANG          中英文切换                                    ║
    // ║   §DAY-PROGRESS  每日进度（DayKey + 重置时间）                 ║
    // ║   §MASCOT        陪伴小宠 + 拖动                               ║
    // ║   §STADIUM       任务进度环 + 心电图                           ║
    // ║   §CALENDAR      日历视图弹窗                                  ║
    // ║   §REPORT        工作报告弹窗                                  ║
    // ║   §PURE-FOCUS    纯享模式（全屏粒子）                          ║
    // ║   §EXPOSE        把所有 onclick 函数挂到 window                ║
    // ║                                                               ║
    // ╚═══════════════════════════════════════════════════════════════╝

    // §PWA  Service Worker 注册 + 自动更新提示
    import { initPWA, checkForUpdate } from './pwa.js';
    // §PURE-FOCUS  纯享模式（全屏粒子动画，独立模块）
    import { enterPureFocus, exitPureFocus } from './pure-focus.js';
    // §AUTH  Firebase 登录/注册/退出
    import {
      initAuth, openAuthModal, closeAuthModal, setAuthMode,
      submitAuthForm, logoutUser, getCurrentUser, onUserChange,
    } from './auth.js';
    // §SYNC  Firestore 双向实时同步
    import { initSync, syncTasksToCloud, syncListsToCloud, getSyncStatus, manualSync } from './sync.js';

    initPWA();
    initAuth();
    // sync.js needs window.reloadDataFromStorage + window.updateSyncIndicator,
    // both defined below — call initSync after they're ready
    setTimeout(initSync, 0);
    // Expose auth functions for inline onclick handlers
    Object.assign(window, {
      openAuthModal, closeAuthModal, setAuthMode, submitAuthForm, logoutUser,
      manualSync,
    });

    // §VERSION ─ 显示版本号 + 暴露手动检查更新
    const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
    const verEl = document.getElementById('app-version-num');
    if (verEl) verEl.textContent = 'v' + APP_VERSION;
    window.checkForUpdate = checkForUpdate;

    // §CLOCK ─ 时钟 + 日期
    const WEEKDAYS = ["周日","周一","周二","周三","周四","周五","周六"];
    const MONTHS   = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
    let currentTimezone = null;

    function updateClock() {
      const now = new Date();
      let hh, mm, ss, dateText;

      if (currentTimezone) {
        const tp = new Intl.DateTimeFormat('zh-CN', {
          timeZone: currentTimezone,
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).formatToParts(now);
        const dp = new Intl.DateTimeFormat('zh-CN', {
          timeZone: currentTimezone,
          year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short'
        }).formatToParts(now);
        const t = Object.fromEntries(tp.map(({type,value}) => [type,value]));
        const d = Object.fromEntries(dp.map(({type,value}) => [type,value]));
        hh = t.hour; mm = t.minute; ss = t.second;
        dateText = `${d.year} 年 ${d.month} 月 ${d.day} 日  ${d.weekday}`;
      } else {
        hh  = String(now.getHours()).padStart(2,"0");
        mm  = String(now.getMinutes()).padStart(2,"0");
        ss  = String(now.getSeconds()).padStart(2,"0");
        dateText = `${now.getFullYear()} 年 ${MONTHS[now.getMonth()]} ${now.getDate()} 日  ${WEEKDAYS[now.getDay()]}`;
      }

      document.getElementById("time-hm").textContent = hh + ":" + mm;
      document.getElementById("time-s").textContent  = ":" + ss;
      document.getElementById("date-display").textContent = dateText;
    }
    updateClock();
    setInterval(updateClock, 1000);

    // §WEATHER ─ 天气组件
    let weatherRefreshTimer = null;

    function getSkyDesc(weatherCode, isDay, now, sunriseStr, sunsetStr) {
      const sunrise = new Date(sunriseStr);
      const sunset  = new Date(sunsetStr);
      const minsToSunrise = (sunrise - now) / 60000;
      const minsAfterSunset = (now - sunset) / 60000;
      if (minsToSunrise >= -30 && minsToSunrise <= 30) return "朝霞满天 🌅";
      if (minsAfterSunset >= 0 && minsAfterSunset <= 40) return "落日余晖 🌇";
      if ([95,96,99].includes(weatherCode)) return "雷雨交加 ⛈️";
      if ([61,63,65,80,81,82].includes(weatherCode)) return "细雨绵绵 🌧️";
      if ([51,53,55].includes(weatherCode)) return "毛毛细雨 🌦️";
      if ([71,73,75,85,86].includes(weatherCode)) return "白雪皑皑 ❄️";
      if ([45,48].includes(weatherCode)) return "云雾弥漫 🌫️";
      if (!isDay) {
        if (weatherCode === 0) return "繁星点点 ✨";
        if ([1,2].includes(weatherCode)) return "月色朦胧 🌙";
        return "夜幕低垂 🌃";
      }
      if (weatherCode === 0) return "艳阳高照 ☀️";
      if (weatherCode === 1) return "晴空万里 🌤️";
      if (weatherCode === 2) return "云淡风轻 ⛅";
      if (weatherCode === 3) return "阴云密布 ☁️";
      return "天气多变 🌡️";
    }

    function fetchWeather(lat, lon) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,weather_code,is_day` +
        `&daily=sunrise,sunset&timezone=auto&forecast_days=1`;
      fetch(url)
        .then(r => r.json())
        .then(data => {
          const c = data.current;
          const sky = getSkyDesc(c.weather_code, c.is_day === 1, new Date(),
            data.daily.sunrise[0], data.daily.sunset[0]);
          document.getElementById("weather-temp").textContent = `${Math.round(c.temperature_2m)}°`;
          document.getElementById("weather-humidity").textContent = `湿度 ${c.relative_humidity_2m}%`;
          document.getElementById("weather-sky").textContent = sky;
        })
        .catch(() => {
          document.getElementById("weather-sky").textContent = "天气获取失败 🌐";
        });
    }

    function startWeatherRefresh(lat, lon) {
      fetchWeather(lat, lon);
      clearInterval(weatherRefreshTimer);
      weatherRefreshTimer = setInterval(() => fetchWeather(lat, lon), 10 * 60 * 1000);
    }

    function toggleCityEdit() {
      const form = document.getElementById("weather-edit-form");
      const visible = form.style.display !== "none";
      form.style.display = visible ? "none" : "flex";
      if (!visible) document.getElementById("weather-city-input").focus();
    }

    function applyCity({ latitude, longitude, timezone, name, admin1, country }) {
      const label = `📍 ${name}${admin1 ? ', ' + admin1 : ''}, ${country}`;
      currentTimezone = timezone;
      localStorage.setItem('todo_weather_lat', latitude);
      localStorage.setItem('todo_weather_lon', longitude);
      localStorage.setItem('todo_weather_tz', timezone);
      localStorage.setItem('todo_weather_city', label);
      document.getElementById("weather-location").textContent = label;
      document.getElementById("weather-edit-form").style.display = "none";
      document.getElementById("weather-candidates").innerHTML = "";
      document.getElementById("weather-city-input").value = "";
      startWeatherRefresh(latitude, longitude);
      showToast(`🌍 已切换到 ${name}，时钟同步当地时间`);
    }

    function searchCity() {
      const input = document.getElementById("weather-city-input").value.trim();
      if (!input) return;
      const prevSky = document.getElementById("weather-sky").textContent;
      document.getElementById("weather-sky").textContent = "搜索中…";
      document.getElementById("weather-candidates").innerHTML = "";

      // 同时用中文和英文搜索，合并结果
      const urls = [
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(input)}&count=10&language=zh`,
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(input)}&count=10&language=en`
      ];

      Promise.all(urls.map(u => fetch(u).then(r => r.json()).catch(() => ({ results: [] }))))
        .then(([zhData, enData]) => {
          document.getElementById("weather-sky").textContent = prevSky;

          // 合并并去重（按 id），按人口降序排列
          const seen = new Set();
          const merged = [...(zhData.results || []), ...(enData.results || [])]
            .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
            .sort((a, b) => (b.population || 0) - (a.population || 0))
            .slice(0, 6);

          if (!merged.length) { showToast("❌ 找不到该城市，请尝试英文名"); return; }
          if (merged.length === 1) { applyCity(merged[0]); return; }

          const container = document.getElementById("weather-candidates");
          container.innerHTML = "";
          merged.forEach(r => {
            const label = `${r.name}${r.admin1 ? ', ' + r.admin1 : ''}, ${r.country}`;
            const btn = document.createElement("button");
            btn.className = "weather-candidate-btn";
            btn.textContent = label;
            btn.onclick = () => applyCity(r);
            container.appendChild(btn);
          });
        })
        .catch(() => showToast("❌ 城市搜索失败，请检查网络"));
    }

    function initWeather() {
      // 优先读取上次保存的城市
      const savedLat  = parseFloat(localStorage.getItem('todo_weather_lat'));
      const savedLon  = parseFloat(localStorage.getItem('todo_weather_lon'));
      const savedTz   = localStorage.getItem('todo_weather_tz');
      const savedCity = localStorage.getItem('todo_weather_city');
      if (savedLat && savedLon) {
        currentTimezone = savedTz || null;
        document.getElementById("weather-location").textContent = savedCity || "";
        startWeatherRefresh(savedLat, savedLon);
        return;
      }
      // 尝试浏览器定位
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          pos => startWeatherRefresh(pos.coords.latitude, pos.coords.longitude),
          () => {
            startWeatherRefresh(39.9042, 116.4074);
            document.getElementById("weather-location").textContent = "位置未授权，显示默认城市";
          }
        );
      } else {
        startWeatherRefresh(39.9042, 116.4074);
      }
    }

    // 城市输入框支持回车确认
    document.getElementById("weather-city-input")
      .addEventListener("keydown", e => { if (e.key === "Enter") searchCity(); });

    // 初始化时隐藏输入框（CSS flex 会覆盖，强制设置）
    document.getElementById("weather-edit-form").style.display = "none";

    initWeather();

    // §WALLPAPER ─ 壁纸取色器
    function hexToHSL(hex) {
      let r = parseInt(hex.slice(1,3),16)/255;
      let g = parseInt(hex.slice(3,5),16)/255;
      let b = parseInt(hex.slice(5,7),16)/255;
      const max = Math.max(r,g,b), min = Math.min(r,g,b);
      let h, s, l = (max+min)/2;
      if (max === min) { h = s = 0; } else {
        const d = max-min;
        s = l > 0.5 ? d/(2-max-min) : d/(max+min);
        switch(max){
          case r: h=((g-b)/d+(g<b?6:0))/6; break;
          case g: h=((b-r)/d+2)/6; break;
          case b: h=((r-g)/d+4)/6; break;
        }
      }
      return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
    }

    function applyColorWallpaper(hex) {
      const [h, s, l] = hexToHSL(hex);
      const dark   = `hsl(${h}, ${Math.min(s+15,100)}%, ${Math.max(l-35,4)}%)`;
      const mid    = `hsl(${h}, ${s}%, ${Math.max(l-18,8)}%)`;
      const accent = `hsl(${(h+25)%360}, ${Math.max(s-8,15)}%, ${Math.min(l+5,45)}%)`;
      const grad = `linear-gradient(135deg, ${dark} 0%, ${mid} 55%, ${accent} 100%)`;
      const wp = document.getElementById("wallpaper");
      wp.style.backgroundImage = "";
      wp.style.background = grad;
      // 同步更新 CSS 变量 --wp-grad，让 html::before 全屏伪元素也跟着变色
      document.documentElement.style.setProperty('--wp-grad', grad);
      document.documentElement.style.backgroundColor = dark;
      document.getElementById("color-dot").style.background = hex;
      localStorage.setItem('todo_wallpaper_color', hex);
    }

    function resetWallpaper() {
      const grad = "linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 70%, #533483 100%)";
      const wp = document.getElementById("wallpaper");
      wp.style.background = grad;
      wp.style.backgroundImage = "";
      document.documentElement.style.setProperty('--wp-grad', grad);
      document.documentElement.style.backgroundColor = "#1a1a2e";
      document.getElementById("wallpaper-color-input").value = "#533483";
      document.getElementById("color-dot").style.background = "#533483";
      localStorage.removeItem('todo_wallpaper_color');
      showToast("✨ 已重置为默认配色");
    }

    // 读取上次保存的配色
    const savedColor = localStorage.getItem('todo_wallpaper_color');
    if (savedColor) {
      document.getElementById("wallpaper-color-input").value = savedColor;
      applyColorWallpaper(savedColor);
    } else {
      document.getElementById("color-dot").style.background = "#533483";
    }

    // §TASKS ─ 任务核心状态
    let sortMode     = localStorage.getItem('todo_sort_mode')   || 'urgency';
    let viewMode     = localStorage.getItem('todo_view_mode')   || 'all';
    let activeListId = localStorage.getItem('todo_active_list') || 'all';
    let selectedPriority = 3;
    var expandedTasks = {};
    var _creatingList = false;
    let searchQuery = '';
    let selectedRepeat = 'none';

    // §LISTS ─ 多列表 / 分类
    function getDefaultLists() {
      return [
        { id: 'inbox', name: '收集箱', icon: '📥' },
        { id: 'work',  name: '工作',   icon: '💼' },
        { id: 'life',  name: '生活',   icon: '🌱' },
      ];
    }
    function loadLists() {
      const s = localStorage.getItem('todo_lists');
      if (s) try { return JSON.parse(s); } catch(e) {}
      return getDefaultLists();
    }
    var lists = loadLists();
    function saveLists() {
      // Stamp updatedAt on each list so cloud sync resolves conflicts correctly
      const now = Date.now();
      lists.forEach(l => { l.updatedAt = now; });
      localStorage.setItem('todo_lists', JSON.stringify(lists));
      try { syncListsToCloud(); } catch {}
    }

    function setActiveList(id) {
      activeListId = id;
      localStorage.setItem('todo_active_list', id);
      renderListChips();
      updateListSelect();
      render();
    }

    function renderListChips() {
      const c = document.getElementById('list-chips');
      if (!c) return;
      let h = `<button class="list-chip${activeListId==='all'?' active':''}" onclick="setActiveList('all')">全部</button>`;
      lists.forEach(l => {
        const isActive = activeListId === l.id;
        h += `<button class="list-chip${isActive?' active':''}" onclick="setActiveList('${l.id}')">
          ${l.icon} ${l.name}
          <span class="list-chip-del" onclick="event.stopPropagation();deleteList('${l.id}')">×</span>
        </button>`;
      });
      h += _creatingList
        ? `<input class="list-name-input" id="list-name-input" maxlength="10" placeholder="清单名…"
                  onkeydown="if(event.key==='Enter')confirmCreateList();if(event.key==='Escape')cancelCreateList()"
                  onblur="setTimeout(cancelCreateList,200)"/>`
        : `<button class="list-chip-add" onclick="showCreateList()">＋ 新建</button>`;
      c.innerHTML = h;
      if (_creatingList) setTimeout(() => { const el = document.getElementById('list-name-input'); if (el) el.focus(); }, 30);
    }

    function showCreateList()   { _creatingList = true;  renderListChips(); }
    function cancelCreateList() { _creatingList = false; renderListChips(); }

    function confirmCreateList() {
      const inp = document.getElementById('list-name-input');
      if (!inp) return;
      const name = inp.value.trim();
      if (!name) { cancelCreateList(); return; }
      const icons = ['📋','🎯','⭐','🔥','💡','📚','🏃','🎨','🎵','🛒'];
      const id = 'list_' + Date.now();
      lists.push({ id, name, icon: icons[lists.length % icons.length] });
      saveLists();
      _creatingList = false;
      setActiveList(id);
    }

    function deleteList(id) {
      const count = tasks.filter(t => t.listId === id).length;
      if (count > 0) { showToast(`❌ 请先移除此清单中的 ${count} 个任务`); return; }
      lists = lists.filter(l => l.id !== id);
      saveLists();
      if (activeListId === id) setActiveList('all');
      else renderListChips();
    }

    function updateListSelect() {
      const sel = document.getElementById('task-list-select');
      if (!sel) return;
      sel.innerHTML = lists.map(l => `<option value="${l.id}">${l.icon} ${l.name}</option>`).join('');
      if (activeListId !== 'all' && lists.find(l => l.id === activeListId)) sel.value = activeListId;
    }

    // §STEPS ─ 子任务（步骤）
    function toggleTaskExpand(id) {
      expandedTasks[id] = !expandedTasks[id];
      const panel = document.getElementById('steps-' + id);
      if (panel) panel.classList.toggle('open', !!expandedTasks[id]);
    }

    function _stepsHTML(t) {
      const stepsHtml = (t.steps||[]).map(st => `
        <div class="step-item">
          <button class="step-check${st.done?' done':''}" onclick="toggleStep(${t.id},${st.id})">${st.done?'✓':''}</button>
          <span class="step-text${st.done?' done':''}">${st.text.replace(/</g,'&lt;')}</span>
          <button class="step-del" onclick="deleteStep(${t.id},${st.id})">×</button>
        </div>`).join('');
      const noteVal = (t.note||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return stepsHtml +
        `<div class="step-add-row">
          <input class="step-input" id="step-input-${t.id}" placeholder="添加步骤…"
                 onkeydown="if(event.key==='Enter')addStep(${t.id})"/>
          <button class="step-add-btn" onclick="addStep(${t.id})">+</button>
        </div>
        <div class="note-area">
          <textarea class="note-textarea" id="note-input-${t.id}"
                    placeholder="📝 备注…"
                    onblur="saveNote(${t.id})">${noteVal}</textarea>
        </div>`;
    }

    function _rerenderSteps(taskId) {
      const t = tasks.find(t => t.id === taskId);
      if (!t) return;
      const panel  = document.getElementById('steps-' + taskId);
      const toggle = document.getElementById('steps-toggle-' + taskId);
      if (panel)  panel.innerHTML  = _stepsHTML(t);
      if (toggle) {
        const done = (t.steps||[]).filter(s=>s.done).length, tot = (t.steps||[]).length;
        toggle.textContent = tot > 0 ? `${done}/${tot} 步骤` : '+ 步骤';
        toggle.classList.toggle('has-steps', tot > 0);
      }
    }

    function addStep(taskId) {
      const inp = document.getElementById('step-input-' + taskId);
      if (!inp) return;
      const text = inp.value.trim();
      if (!text) return;
      const t = tasks.find(t => t.id === taskId);
      if (!t) return;
      if (!t.steps) t.steps = [];
      t.steps.push({ id: Date.now(), text, done: false });
      saveTasks(); inp.value = ''; _rerenderSteps(taskId);
    }

    function toggleStep(taskId, stepId) {
      const t = tasks.find(t => t.id === taskId);
      if (!t || !t.steps) return;
      const s = t.steps.find(s => s.id === stepId);
      if (s) { s.done = !s.done; saveTasks(); _rerenderSteps(taskId); }
    }

    function deleteStep(taskId, stepId) {
      const t = tasks.find(t => t.id === taskId);
      if (!t) return;
      t.steps = (t.steps||[]).filter(s => s.id !== stepId);
      saveTasks(); _rerenderSteps(taskId);
    }

    const P_COLORS = { 1:'#ff8080', 2:'#ffaa50', 3:'#ffd060', 4:'#80d080', 5:'#80b0ff' };
    const P_LABELS = { 1:'P1', 2:'P2', 3:'P3', 4:'P4', 5:'P5' };

    function getDefaultTasks() {
      const h = 3600*1000, d = 86400*1000;
      return [
        { id: 1, text: "给昨天拖延的自己写封道歉信",              deadline: new Date(Date.now() - 0.5*h).toISOString(),  priority: 1 },
        { id: 2, text: "关掉 37 个标签页（只保留最重要的那个）",  deadline: new Date(Date.now() + 0.4*h).toISOString(),  priority: 2 },
        { id: 3, text: "把脑子里的灵感画出来，别再说『等我找到纸』", deadline: new Date(Date.now() + 3*h).toISOString(),    priority: 1 },
        { id: 4, text: "研究竞品，顺便说服自己我们比他们好",       deadline: new Date(Date.now() + 9*h).toISOString(),    priority: 3 },
        { id: 5, text: "更新作品集（上次更新时还在用 Sketch）",    deadline: new Date(Date.now() + 1.5*d).toISOString(),  priority: 2 },
        { id: 6, text: "认真冥想 10 分钟，手机静音，不许偷看",     deadline: new Date(Date.now() + 3*d).toISOString(),    priority: 4 },
        { id: 7, text: "规划下一个 100 天要成为什么样的人",        deadline: new Date(Date.now() + 7*d).toISOString(),    priority: 3 },
      ];
    }

    function saveTasks() {
      // Stamp updatedAt on each task so cloud sync resolves conflicts correctly
      const now = Date.now();
      tasks.forEach(t => { t.updatedAt = now; });
      localStorage.setItem('todo_tasks', JSON.stringify(tasks));
      try { syncTasksToCloud(); } catch {}
    }
    function loadTasksFromStorage() {
      const s = localStorage.getItem('todo_tasks');
      if (s) {
        try {
          const arr = JSON.parse(s);
          // Migrate: ensure all tasks have listId and steps fields
          arr.forEach((t, i) => {
            if (!t.listId)                   t.listId       = 'inbox';
            if (!t.steps)                    t.steps        = [];
            if (t.starred  === undefined)    t.starred      = false;
            if (t.note     === undefined)    t.note         = '';
            if (!t.repeat)                   t.repeat       = 'none';
            if (t.reminder === undefined)    t.reminder     = '';
            if (t.reminderFired === undefined) t.reminderFired = false;
            if (typeof t.order !== 'number') t.order        = i;
          });
          return arr;
        } catch(e) {}
      }
      return getDefaultTasks().map(t => ({ ...t, listId: 'inbox', steps: [], starred: false, note: '', repeat: 'none', reminder: '', reminderFired: false }));
    }
    let tasks = loadTasksFromStorage();

    // §SYNC-HOOKS  Helpers used by sync.js to apply remote changes locally
    // (called WITHOUT going through saveTasks/saveLists to avoid sync loops)
    window.reloadDataFromStorage = function() {
      try {
        const ts = localStorage.getItem('todo_tasks');
        if (ts) tasks = JSON.parse(ts);
        const ls = localStorage.getItem('todo_lists');
        if (ls) lists = JSON.parse(ls);
        if (typeof render === 'function') render();
        if (typeof renderListChips === 'function') renderListChips();
      } catch (e) { console.warn('reloadDataFromStorage:', e); }
    };

    // Sync indicator updater (called by sync.js)
    window.updateSyncIndicator = function(status, detail) {
      const dot = document.getElementById('sync-dot');
      const txt = document.getElementById('sync-status-text');
      if (!dot || !txt) return;
      const map = {
        offline: { color: 'rgba(255,255,255,0.25)',  label: '未登录' },
        syncing: { color: 'rgba(120,200,255,0.95)',  label: detail || '同步中…' },
        synced:  { color: 'rgba(100,220,140,0.95)',  label: '已同步 ✓' },
        error:   { color: 'rgba(255,120,120,0.95)',  label: '同步失败' },
      };
      const cfg = map[status] || map.offline;
      dot.style.background = cfg.color;
      dot.style.boxShadow  = status === 'syncing' ? `0 0 0 4px ${cfg.color.replace(/[\d.]+\)$/, '0.18)')}` : 'none';
      dot.classList.toggle('pulsing', status === 'syncing');
      txt.textContent = cfg.label;
      txt.title = detail || '';
    };

    const STATE_ORDER = { overdue:0, panic:1, urgent:2, soon:3, normal:4 };
    const STATE_CFG = {
      overdue: { emoji:"💀", color:"#ff6b6b", quip:"寄了…",      prefix:"⚠️" },
      panic:   { emoji:"😱", color:"#ff6b6b", quip:"快跑啊！！", prefix:"🔥" },
      urgent:  { emoji:"😰", color:"#ffa94d", quip:"快点！",     prefix:"⏰" },
      soon:    { emoji:"😤", color:"#ffd43b", quip:"认真了！",   prefix:"⏰" },
      normal:  { emoji:"😌", color:"#74c0fc", quip:"",           prefix:"📅" },
    };

    function getState(deadline) {
      const h = (new Date(deadline) - Date.now()) / 3600000;
      if (h < 0)  return "overdue";
      if (h < 1)  return "panic";
      if (h < 3)  return "urgent";
      if (h < 24) return "soon";
      return "normal";
    }

    function formatTime(deadline) {
      const h = (new Date(deadline) - Date.now()) / 3600000;
      if (h < 0)   return "已过期";
      if (h < 1)   return Math.ceil(h*60) + " 分钟后";
      if (h < 24)  { const hf=Math.floor(h), mf=Math.floor((h-hf)*60); return mf ? `${hf}h ${mf}m 后` : `${hf} 小时后`; }
      return Math.ceil(h/24) + " 天后";
    }

    function render() {
      renderListChips();
      // Update tab active state
      const tabAll     = document.getElementById('tab-all');
      const tabMyday   = document.getElementById('tab-myday');
      const tabStarred = document.getElementById('tab-starred');
      if (tabAll)     tabAll.classList.toggle('active',     viewMode === 'all');
      if (tabMyday)   tabMyday.classList.toggle('active',   viewMode === 'myDay');
      if (tabStarred) tabStarred.classList.toggle('active', viewMode === 'starred');

      // Filter by active list → view mode → search query
      const listFiltered = activeListId === 'all' ? tasks : tasks.filter(t => t.listId === activeListId);
      const viewFiltered = viewMode === 'myDay'   ? listFiltered.filter(t => t.myDay)
                         : viewMode === 'starred' ? tasks.filter(t => t.starred)   // starred is global
                         : listFiltered;
      const base = searchQuery
        ? viewFiltered.filter(t => t.text.toLowerCase().includes(searchQuery))
        : viewFiltered;
      const sorted = sortMode === 'priority'
        ? [...base].sort((a,b) => (a.priority||3) - (b.priority||3))
        : sortMode === 'manual'
          ? [...base].sort((a,b) => (a.order ?? 1e9) - (b.order ?? 1e9))
          : [...base].sort((a,b) => STATE_ORDER[getState(a.deadline)] - STATE_ORDER[getState(b.deadline)]);

      const urgentN = base.filter(t => ["panic","urgent","overdue"].includes(getState(t.deadline))).length;
      const mydayN  = tasks.filter(t => t.myDay).length;

      // Task count subtitle
      if (viewMode === 'myDay') {
        document.getElementById("task-count").textContent =
          base.length === 0 ? "今日还没有安排 ☀️" :
          urgentN > 0 ? `今日 ${base.length} 件 · ${urgentN} 个紧急！` :
          `今日 ${base.length} 件任务`;
      } else if (viewMode === 'starred') {
        document.getElementById("task-count").textContent =
          base.length === 0 ? "还没有重要任务 ⭐" : `${base.length} 个重要任务`;
      } else if (searchQuery) {
        document.getElementById("task-count").textContent =
          base.length === 0 ? `没有找到"${searchQuery}"` : `找到 ${base.length} 个任务`;
      } else {
        document.getElementById("task-count").textContent =
          tasks.length === 0 ? "全部完成啦 🎉" :
          urgentN > 0 ? `${tasks.length} 个待完成 · ${urgentN} 个紧急！` :
          `${tasks.length} 个待完成`;
      }

      const btn = document.getElementById("sort-btn");
      if (btn) btn.textContent = sortMode === 'priority' ? '按 P' : sortMode === 'manual' ? '自定义' : '按 DDL';

      const list = document.getElementById("task-list");

      if (typeof updateStadiumProgress === 'function') updateStadiumProgress();
      if (typeof renderCompletedList === 'function') renderCompletedList();

      // Empty states
      if (tasks.length === 0) {
        list.innerHTML = '<div class="empty-state">🎯 快开始创建你的第一个任务吧！<br><span style="font-size:11px;opacity:0.7">点击右上角 + 添加任务</span></div>';
        return;
      }
      if (viewMode === 'myDay' && base.length === 0) {
        const now = new Date();
        const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
        const dateStr = `${now.getMonth()+1}月${now.getDate()}日 · ${weekdays[now.getDay()]}`;
        list.innerHTML = `
          <div class="myday-greeting">☀️ 今天想专注什么？<span>${dateStr}</span></div>
          <div class="myday-empty">
            <span class="myday-empty-icon">🌤</span>
            今天还没有安排任务<br>
            <span style="font-size:11px">点击任意任务上的 ☀️ 加入今日清单</span>
          </div>`;
        return;
      }
      if (viewMode === 'starred' && base.length === 0) {
        list.innerHTML = `
          <div class="myday-empty">
            <span class="myday-empty-icon">⭐</span>
            还没有标记重要的任务<br>
            <span style="font-size:11px">点击任务上的 ⭐ 标为重要</span>
          </div>`;
        return;
      }
      if (searchQuery && base.length === 0) {
        list.innerHTML = `
          <div class="myday-empty">
            <span class="myday-empty-icon">🔍</span>
            没有找到匹配的任务<br>
            <span style="font-size:11px">试试其他关键词</span>
          </div>`;
        return;
      }

      // View header
      let header = '';
      if (viewMode === 'myDay') {
        const now = new Date();
        const h = now.getHours();
        const greeting = h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好';
        const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
        header = `<div class="myday-greeting">☀️ ${greeting}，今天有 ${base.length} 件事<span>${now.getMonth()+1}月${now.getDate()}日 · ${weekdays[now.getDay()]}</span></div>`;
      } else if (viewMode === 'starred') {
        header = `<div class="myday-greeting">⭐ 重要任务<span>${base.length} 个</span></div>`;
      } else if (searchQuery) {
        header = `<div class="myday-greeting">🔍 搜索：${searchQuery.replace(/</g,'&lt;')}<span>共 ${base.length} 个</span></div>`;
      }

      list.innerHTML = header + sorted.map(t => {
        const s = getState(t.deadline), c = STATE_CFG[s];
        const p = t.priority || 3;
        const doneN = (t.steps||[]).filter(st=>st.done).length;
        const totN  = (t.steps||[]).length;
        const stepsLbl = totN > 0 ? `${doneN}/${totN} 步骤` : '+ 步骤';
        const isExp = !!expandedTasks[t.id];
        const listObj = activeListId === 'all' ? lists.find(l => l.id === t.listId) : null;
        const listLbl = listObj ? `<span class="task-list-label">${listObj.icon} ${listObj.name}</span>` : '';
        const repeatLbl = (t.repeat && t.repeat !== 'none') ? `<span class="repeat-badge">🔁 ${REPEAT_LABEL[t.repeat]}</span>` : '';
        const remFmt = t.reminder && !t.reminderFired ? (() => { const rd = new Date(t.reminder); return `${rd.getMonth()+1}/${rd.getDate()} ${String(rd.getHours()).padStart(2,'0')}:${String(rd.getMinutes()).padStart(2,'0')}`; })() : '';
        const reminderLbl = remFmt ? `<span class="reminder-badge" title="提醒：${remFmt}">🔔 ${remFmt}</span>` : '';
        return `
          <div class="task-item state-${s}${sortMode==='manual'?' draggable':''}" id="task-${t.id}" data-task-id="${t.id}"
               ${sortMode==='manual' ? `draggable="true"
               ondragstart="onTaskDragStart(event,${t.id})"
               ondragover="onTaskDragOver(event,${t.id})"
               ondragleave="onTaskDragLeave(event)"
               ondrop="onTaskDrop(event,${t.id})"
               ondragend="onTaskDragEnd(event)"` : ''}>
            <div class="task-item-header">
              <div class="task-bar" style="background:${c.color}"></div>
              <div class="task-content" onclick="openEditModal(${t.id})" title="点击编辑任务">
                <div class="task-top-row">
                  <span class="task-emoji">${c.emoji}</span>
                  <span class="task-name">${t.text}</span>
                  <span class="task-priority p${p}">${P_LABELS[p]}</span>
                  <span class="task-edit-hint">✏️</span>
                </div>
                <div class="task-ddl-row">
                  <span class="task-ddl" style="color:${c.color}">${c.prefix} ${formatTime(t.deadline)}</span>
                  ${c.quip ? `<span class="task-quip" style="color:${c.color}">${c.quip}</span>` : ""}
                  ${listLbl}${repeatLbl}${reminderLbl}
                  <button class="steps-toggle${totN>0?' has-steps':''}" id="steps-toggle-${t.id}"
                          onclick="event.stopPropagation();toggleTaskExpand(${t.id})">${stepsLbl}</button>
                </div>
              </div>
              <button class="star-btn ${t.starred ? 'on' : ''}" onclick="toggleStarred(${t.id})" title="${t.starred ? '取消重要' : '标为重要'}">⭐</button>
              <button class="myday-btn ${t.myDay ? 'on' : ''}" onclick="toggleMyDay(${t.id})" title="${t.myDay ? '移出今日' : '加入今日'}">☀️</button>
              <button class="done-btn" onclick="completeTask(${t.id})">✓</button>
              <button class="del-btn" onclick="promptDeleteTask(${t.id})" title="删除任务">🗑</button>
            </div>
            <div class="steps-panel${isExp?' open':''}" id="steps-${t.id}">${_stepsHTML(t)}</div>
          </div>`;
      }).join("");
    }

    function toggleSortMode() {
      // Cycle: urgency → priority → manual → urgency
      sortMode = sortMode === 'urgency' ? 'priority'
               : sortMode === 'priority' ? 'manual'
               : 'urgency';
      localStorage.setItem('todo_sort_mode', sortMode);
      if (sortMode === 'manual') {
        // First time switching to manual: assign order from current display order
        ensureManualOrder();
        showToast('🖱️ 自定义排序：拖动任务调整顺序');
      } else if (sortMode === 'priority') {
        showToast('按优先级排序');
      } else {
        showToast('按截止时间排序');
      }
      render();
    }

    function ensureManualOrder() {
      // Assign sequential order to tasks that don't have one (or all NaN)
      const sorted = [...tasks].sort((a,b) => STATE_ORDER[getState(a.deadline)] - STATE_ORDER[getState(b.deadline)]);
      sorted.forEach((t, i) => { if (typeof t.order !== 'number') t.order = i; });
      saveTasks();
    }

    // §DRAG ─ 拖拽排序
    let _draggingTaskId = null;

    function onTaskDragStart(e, id) {
      _draggingTaskId = id;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(id)); } catch(_){}
      const el = document.getElementById('task-' + id);
      if (el) el.classList.add('dragging');
    }

    function onTaskDragOver(e, id) {
      if (_draggingTaskId === null || _draggingTaskId === id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const el = document.getElementById('task-' + id);
      if (!el) return;
      // Determine drop position (above or below) based on mouse Y vs midpoint
      const rect = el.getBoundingClientRect();
      const above = e.clientY < rect.top + rect.height / 2;
      el.classList.toggle('drop-above', above);
      el.classList.toggle('drop-below', !above);
    }

    function onTaskDragLeave(e) {
      const el = e.currentTarget;
      if (el && el.classList) el.classList.remove('drop-above','drop-below');
    }

    function onTaskDrop(e, targetId) {
      e.preventDefault();
      const srcId = _draggingTaskId;
      if (srcId === null || srcId === targetId) { onTaskDragEnd(e); return; }
      const targetEl = document.getElementById('task-' + targetId);
      const above = targetEl && targetEl.classList.contains('drop-above');
      const src = tasks.find(t => t.id === srcId);
      const tgt = tasks.find(t => t.id === targetId);
      if (!src || !tgt) { onTaskDragEnd(e); return; }
      // Build current visual order (manual sort), insert src before/after tgt
      const ordered = [...tasks].sort((a,b) => (a.order ?? 1e9) - (b.order ?? 1e9));
      const filtered = ordered.filter(t => t.id !== srcId);
      const targetIdx = filtered.findIndex(t => t.id === targetId);
      const insertIdx = above ? targetIdx : targetIdx + 1;
      filtered.splice(insertIdx, 0, src);
      filtered.forEach((t, i) => t.order = i);
      saveTasks();
      onTaskDragEnd(e);
      render();
      showToast('🔀 顺序已更新');
    }

    function onTaskDragEnd(e) {
      _draggingTaskId = null;
      document.querySelectorAll('.task-item').forEach(el => {
        el.classList.remove('dragging','drop-above','drop-below');
      });
    }

    // §SHORTCUTS ─ 键盘快捷键 + 帮助弹窗
    document.addEventListener('keydown', function(e) {
      // Skip if user is typing in input/textarea/contenteditable
      const tag = (e.target && e.target.tagName) || '';
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
                       (e.target && e.target.isContentEditable);
      // Esc works everywhere — close any open modal/menu
      if (e.key === 'Escape') {
        // Edit modal
        const em = document.getElementById('edit-modal-overlay');
        if (em && em.classList.contains('show')) { closeEditModal(); e.preventDefault(); return; }
        // Delete modal
        const dm = document.getElementById('del-modal-overlay');
        if (dm && dm.classList.contains('show')) { cancelDeleteModal(); e.preventDefault(); return; }
        // Calendar
        const cm = document.getElementById('calendar-modal');
        if (cm && cm.classList.contains('open')) { closeCalendar(); e.preventDefault(); return; }
        // Report
        const rm = document.getElementById('report-modal');
        if (rm && rm.classList.contains('open')) { closeReport(); e.preventDefault(); return; }
        // Help modal
        const hm = document.getElementById('help-modal-overlay');
        if (hm && hm.classList.contains('show')) { closeHelp(); e.preventDefault(); return; }
        // Menu
        const mo = document.getElementById('menu-overlay');
        if (mo && mo.classList.contains('open')) { closeMenu(); e.preventDefault(); return; }
        // Add form
        const af = document.getElementById('add-form');
        if (af && af.style.display !== 'none') { toggleForm(); e.preventDefault(); return; }
        return;
      }
      if (isTyping) return; // Don't trigger letter shortcuts while typing

      // Ignore if a modifier is held (let browser shortcuts work)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'n': case 'N':
          e.preventDefault();
          toggleForm();
          break;
        case 'a': case 'A':
          e.preventDefault();
          { const qi = document.getElementById('quick-add-input'); if (qi) qi.focus(); }
          break;
        case '/':
          e.preventDefault();
          { const inp = document.getElementById('task-search'); if (inp) inp.focus(); }
          break;
        case '1':
          e.preventDefault(); setViewMode('all'); break;
        case '2':
          e.preventDefault(); setViewMode('myDay'); break;
        case '3':
          e.preventDefault(); setViewMode('starred'); break;
        case 's': case 'S':
          e.preventDefault(); toggleSortMode(); break;
        case '?':
          e.preventDefault(); openHelp(); break;
      }
    });

    function openHelp() {
      const ov = document.getElementById('help-modal-overlay');
      if (ov) ov.classList.add('show');
    }
    function closeHelp() {
      const ov = document.getElementById('help-modal-overlay');
      if (ov) ov.classList.remove('show');
    }

    function setViewMode(mode) {
      viewMode = mode;
      localStorage.setItem('todo_view_mode', mode);
      // Clear search when switching views
      if (searchQuery) {
        searchQuery = '';
        const inp = document.getElementById('task-search');
        if (inp) inp.value = '';
        const clr = document.getElementById('search-clear');
        if (clr) clr.classList.remove('visible');
      }
      render();
    }

    function toggleMyDay(id) {
      const t = tasks.find(t => t.id === id);
      if (!t) return;
      t.myDay = !t.myDay;
      saveTasks();
      render();
      showToast(t.myDay ? '☀️ 已加入今日清单' : '移出今日清单');
    }

    function toggleStarred(id) {
      const t = tasks.find(t => t.id === id);
      if (!t) return;
      t.starred = !t.starred;
      saveTasks();
      // Only partial re-render: update star button appearance
      const btn = document.querySelector(`#task-${id} .star-btn`);
      if (btn) {
        btn.classList.toggle('on', !!t.starred);
        btn.title = t.starred ? '取消重要' : '标为重要';
      }
      // If in starred view and un-starring, remove the card
      if (viewMode === 'starred' && !t.starred) render();
      showToast(t.starred ? '⭐ 标为重要' : '取消重要标记');
    }

    function saveNote(taskId) {
      const t = tasks.find(t => t.id === taskId);
      if (!t) return;
      const inp = document.getElementById('note-input-' + taskId);
      if (!inp) return;
      t.note = inp.value;
      saveTasks();
    }

    // §SEARCH ─ 任务搜索
    function onTaskSearch(val) {
      searchQuery = val.trim().toLowerCase();
      const clr = document.getElementById('search-clear');
      if (clr) clr.classList.toggle('visible', searchQuery.length > 0);
      render();
    }

    function clearSearch() {
      searchQuery = '';
      const inp = document.getElementById('task-search');
      if (inp) inp.value = '';
      const clr = document.getElementById('search-clear');
      if (clr) clr.classList.remove('visible');
      render();
    }

    function selectPriority(p) {
      selectedPriority = p;
      document.querySelectorAll('.ppick').forEach(b => b.classList.remove('sel'));
      document.querySelectorAll(`.ppick.pp${p}`).forEach(b => b.classList.add('sel'));
    }

    function toggleForm() {
      const f = document.getElementById("add-form");
      const visible = f.style.display !== "none";
      f.style.display = visible ? "none" : "block";
      if (!visible) {
        const d = new Date(); d.setHours(23,59,0,0);
        document.getElementById("task-ddl").value = d.toISOString().slice(0,16);
        document.getElementById("task-name").focus();
        selectPriority(3);
        selectRepeat('none');
        const remInp = document.getElementById('task-reminder');
        if (remInp) remInp.value = '';
        updateListSelect();
      }
    }

    function selectRepeat(r) {
      selectedRepeat = r;
      ['none','daily','weekly','monthly'].forEach(v => {
        const b = document.getElementById('rpick-' + v);
        if (b) b.classList.toggle('sel', v === r);
      });
    }

    function addTask() {
      const name = document.getElementById("task-name").value.trim();
      const ddl  = document.getElementById("task-ddl").value;
      if (!name) { showToast("❌ 请输入任务名称"); return; }
      if (!ddl)  { showToast("❌ 请设置截止时间"); return; }
      const selList = document.getElementById('task-list-select');
      const chosenList = selList ? selList.value : (lists[0] ? lists[0].id : 'inbox');
      const remInp = document.getElementById('task-reminder');
      const reminder = (remInp && remInp.value) ? new Date(remInp.value).toISOString() : '';
      if (reminder && Notification.permission === 'default') Notification.requestPermission();
      // In manual sort mode, place new task at the top
      const newOrder = sortMode === 'manual'
        ? Math.min(...tasks.map(t => t.order ?? 0), 0) - 1
        : tasks.length;
      tasks.push({ id: Date.now(), text: name, deadline: new Date(ddl).toISOString(), priority: selectedPriority, myDay: false, starred: false, steps: [], note: '', listId: chosenList, repeat: selectedRepeat, reminder, reminderFired: false, order: newOrder });
      document.getElementById("task-name").value = "";
      document.getElementById("add-form").style.display = "none";
      saveTasks();
      // Track today's denominator
      const _dk = getDayKey(), _dd = getDayData(_dk);
      _dd.total++; saveDayData(_dk, _dd);
      render();
      showToast("✅ 任务已添加，加油！");
    }

    // §EDIT ─ 任务编辑弹窗
    let _editingTaskId = null;
    let _editPriority  = 3;
    let _editRepeat    = 'none';
    let _editStarred   = false;
    let _editMyDay     = false;

    function openEditModal(id) {
      const t = tasks.find(t => t.id === id);
      if (!t) return;
      _editingTaskId = id;
      // Populate fields
      document.getElementById('edit-task-name').value = t.text;
      // datetime-local needs YYYY-MM-DDTHH:mm in local time (no timezone)
      const d = new Date(t.deadline);
      const pad = n => String(n).padStart(2,'0');
      const fmt = dt => `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
      document.getElementById('edit-task-ddl').value = fmt(d);
      document.getElementById('edit-task-reminder').value = t.reminder ? fmt(new Date(t.reminder)) : '';
      // List select
      const sel = document.getElementById('edit-task-list-select');
      sel.innerHTML = lists.map(l => `<option value="${l.id}">${l.icon} ${l.name}</option>`).join('');
      sel.value = t.listId || 'inbox';
      // Priority
      selectEditPriority(t.priority || 3);
      // Repeat
      selectEditRepeat(t.repeat || 'none');
      // Star + My Day toggles
      _editStarred = !!t.starred;
      _editMyDay   = !!t.myDay;
      updateEditTagButtons();
      // Note
      document.getElementById('edit-task-note').value = t.note || '';
      // Show modal
      document.getElementById('edit-modal-overlay').classList.add('show');
      setTimeout(() => document.getElementById('edit-task-name').focus(), 50);
    }

    function updateEditTagButtons() {
      const s = document.getElementById('edit-star-btn');
      const m = document.getElementById('edit-myday-btn');
      if (s) s.classList.toggle('star-on', _editStarred);
      if (m) m.classList.toggle('myday-on', _editMyDay);
    }

    function toggleEditStar()  { _editStarred = !_editStarred; updateEditTagButtons(); }
    function toggleEditMyDay() { _editMyDay   = !_editMyDay;   updateEditTagButtons(); }

    function deleteFromEditModal() {
      const id = _editingTaskId;
      if (id == null) return;
      // Reuse the existing delete-confirmation modal
      closeEditModal();
      promptDeleteTask(id);
    }

    function closeEditModal() {
      _editingTaskId = null;
      document.getElementById('edit-modal-overlay').classList.remove('show');
    }

    function selectEditPriority(p) {
      _editPriority = p;
      const modal = document.getElementById('edit-modal-overlay');
      if (!modal) return;
      modal.querySelectorAll('.ppick').forEach(b => b.classList.remove('sel'));
      modal.querySelectorAll(`.ppick.pp${p}`).forEach(b => b.classList.add('sel'));
    }

    function selectEditRepeat(r) {
      _editRepeat = r;
      ['none','daily','weekly','monthly'].forEach(v => {
        const b = document.getElementById('erpick-' + v);
        if (b) b.classList.toggle('sel', v === r);
      });
    }

    function saveEditedTask() {
      const id = _editingTaskId;
      if (id === null) return;
      const t = tasks.find(t => t.id === id);
      if (!t) { closeEditModal(); return; }
      const name = document.getElementById('edit-task-name').value.trim();
      const ddl  = document.getElementById('edit-task-ddl').value;
      if (!name) { showToast('❌ 任务名称不能为空'); return; }
      if (!ddl)  { showToast('❌ 截止时间不能为空'); return; }
      const remVal = document.getElementById('edit-task-reminder').value;
      const oldReminder = t.reminder;
      // Update fields
      t.text     = name;
      t.deadline = new Date(ddl).toISOString();
      t.priority = _editPriority;
      t.repeat   = _editRepeat;
      t.listId   = document.getElementById('edit-task-list-select').value || 'inbox';
      t.reminder = remVal ? new Date(remVal).toISOString() : '';
      t.starred  = _editStarred;
      t.myDay    = _editMyDay;
      t.note     = document.getElementById('edit-task-note').value;
      // If reminder time changed, reset fired flag
      if (t.reminder !== oldReminder) t.reminderFired = false;
      if (t.reminder && Notification.permission === 'default') Notification.requestPermission();
      saveTasks();
      closeEditModal();
      render();
      showToast('✅ 已保存修改');
    }

    // §DATA-IO ─ JSON 导出 / 导入
    function exportData() {
      const payload = {
        version: 2,
        exportedAt: new Date().toISOString(),
        appName: 'HeartFlow',
        data: {
          todo_tasks:           localStorage.getItem('todo_tasks'),
          todo_lists:           localStorage.getItem('todo_lists'),
          todo_completed_tasks: localStorage.getItem('todo_completed_tasks'),
          todo_view_mode:       localStorage.getItem('todo_view_mode'),
          todo_active_list:     localStorage.getItem('todo_active_list'),
          todo_sort_mode:       localStorage.getItem('todo_sort_mode'),
          todo_wallpaper_color: localStorage.getItem('todo_wallpaper_color'),
          todo_timer_duration:  localStorage.getItem('todo_timer_duration'),
          todo_day_data:        localStorage.getItem('todo_day_data'),
          todo_diary:           localStorage.getItem('todo_diary'),
          todo_weather_city:    localStorage.getItem('todo_weather_city'),
          todo_lang:            localStorage.getItem('todo_lang'),
          todo_mascot:          localStorage.getItem('todo_mascot'),
        },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const dt   = new Date();
      const stamp = `${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}-${String(dt.getHours()).padStart(2,'0')}${String(dt.getMinutes()).padStart(2,'0')}`;
      a.href = url; a.download = `heartflow-backup-${stamp}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('📤 已导出备份文件');
    }

    function importData(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const payload = JSON.parse(e.target.result);
          if (!payload || !payload.data || payload.appName !== 'HeartFlow') {
            showToast('❌ 文件格式不对，看起来不是心流备份');
            event.target.value = '';
            return;
          }
          const taskCount = payload.data.todo_tasks ? (JSON.parse(payload.data.todo_tasks) || []).length : 0;
          const ok = confirm(
            `⚠️ 导入将覆盖当前所有数据！\n\n` +
            `备份信息：\n` +
            `• 导出时间：${new Date(payload.exportedAt).toLocaleString()}\n` +
            `• 任务数：${taskCount}\n\n` +
            `当前数据将被替换。要继续吗？`
          );
          if (!ok) { event.target.value = ''; return; }
          // Apply each key (only if present in backup)
          Object.keys(payload.data).forEach(key => {
            const val = payload.data[key];
            if (val == null) localStorage.removeItem(key);
            else             localStorage.setItem(key, val);
          });
          showToast('✅ 导入成功，2 秒后刷新…');
          setTimeout(() => location.reload(), 1800);
        } catch (err) {
          showToast('❌ 解析失败：' + err.message);
        }
        event.target.value = '';
      };
      reader.readAsText(file);
    }

    const REPEAT_LABEL = { daily:'每天', weekly:'每周', monthly:'每月' };

    function completeTask(id) {
      const task = tasks.find(t => t.id === id);
      const el = document.getElementById("task-" + id);

      // 🎉 Confetti celebration burst from the ✓ button
      if (el) {
        const btn = el.querySelector('.done-btn');
        if (btn) {
          const r = btn.getBoundingClientRect();
          celebrate(r.left + r.width / 2, r.top + r.height / 2);
          btn.classList.add('bursting');
        }
        el.style.opacity = "0";
        el.style.transform = "translateX(24px) scale(0.95)";
        el.style.transition = "all 0.28s ease";
      }
      setTimeout(() => {
        // ---- REPEAT TASK: advance deadline, keep active ----
        if (task && task.repeat && task.repeat !== 'none') {
          const newDdl = new Date(task.deadline);
          if (task.repeat === 'daily')   newDdl.setDate(newDdl.getDate() + 1);
          if (task.repeat === 'weekly')  newDdl.setDate(newDdl.getDate() + 7);
          if (task.repeat === 'monthly') newDdl.setMonth(newDdl.getMonth() + 1);
          task.deadline = newDdl.toISOString();
          task.reminderFired = false;
          saveCompletedTask(task);
          const dk = getDayKey(), dd = getDayData(dk);
          dd.done++; saveDayData(dk, dd);
          saveTasks(); render(); renderCompletedList(); updateStadiumProgress();
          showToast(`🔁 完成！${REPEAT_LABEL[task.repeat]}重置，下次 ${formatTime(task.deadline)}`);
          return;
        }
        // ---- NORMAL TASK: remove from active ----
        if (task) {
          saveCompletedTask(task);
          const dk = getDayKey(), dd = getDayData(dk);
          dd.done++; saveDayData(dk, dd);
        }
        tasks = tasks.filter(t => t.id !== id);
        saveTasks(); render();
        renderCompletedList();
        updateStadiumProgress();
        showToast(currentLang === 'en' ? "🎉 Done! Great job!" : "🎉 完成！干得漂亮！");
      }, 270);
    }

    // §DELETE ─ 删除确认弹窗
    var _pendingDeleteId = null;

    function promptDeleteTask(id) {
      _pendingDeleteId = id;
      document.getElementById('del-modal-overlay').classList.add('show');
    }
    function cancelDeleteModal() {
      _pendingDeleteId = null;
      document.getElementById('del-modal-overlay').classList.remove('show');
    }
    function cancelDelete(e) {
      if (e.target === document.getElementById('del-modal-overlay')) cancelDeleteModal();
    }
    function confirmDeleteTask() {
      const id = _pendingDeleteId;
      if (id === null) return;
      cancelDeleteModal();
      const wasActive = tasks.some(t => t.id === id);
      const wasCompletedToday = getTodayCompleted().some(t => t.id === id);
      // Remove from active tasks
      tasks = tasks.filter(t => t.id !== id);
      saveTasks();
      // Remove from completed tasks (all history)
      completedTasks = completedTasks.filter(t => t.id !== id);
      localStorage.setItem('todo_completed_tasks', JSON.stringify(completedTasks));
      // Adjust day counters
      const dk = getDayKey(), dd = getDayData(dk);
      if (wasActive)         dd.total = Math.max(0, dd.total - 1);
      if (wasCompletedToday) { dd.done = Math.max(0, dd.done - 1); dd.total = Math.max(0, dd.total - 1); }
      saveDayData(dk, dd);
      // Animate out
      const el = document.getElementById('task-' + id);
      if (el) {
        el.style.transition = 'all 0.22s ease';
        el.style.opacity = '0'; el.style.transform = 'scale(0.9)';
        setTimeout(() => { render(); renderCompletedList(); updateStadiumProgress(); }, 240);
      } else {
        render(); renderCompletedList(); updateStadiumProgress();
      }
      showToast('🗑️ 任务已永久删除');
    }

    // §REMINDERS ─ 定时提醒通知
    function checkReminders() {
      const now = Date.now();
      let changed = false;
      tasks.forEach(t => {
        if (t.reminder && !t.reminderFired && now >= new Date(t.reminder).getTime()) {
          if (Notification.permission === 'granted') {
            new Notification('心流 · 任务提醒 🔔', { body: t.text, icon: '' });
          }
          showToast(`🔔 提醒：${t.text}`);
          t.reminderFired = true;
          changed = true;
        }
      });
      if (changed) { saveTasks(); render(); }
    }
    // Check reminders every 30 seconds + once after page load
    setInterval(checkReminders, 30000);
    setTimeout(checkReminders, 1500);

    // §URGENCY ─ 紧急任务提醒（10 分钟间隔）
    function checkNotify() {
      const urgent = tasks.filter(t => ["panic","urgent","overdue"].includes(getState(t.deadline)));
      if (!urgent.length) return;
      urgent.forEach(t => {
        const c = STATE_CFG[getState(t.deadline)];
        if (Notification.permission === "granted") {
          new Notification(`${c.emoji} ${t.text}`, { body: `${c.prefix} ${formatTime(t.deadline)}  ${c.quip}` });
        }
      });
      showToast(`${STATE_CFG[getState(urgent[0].deadline)].emoji} ${urgent[0].text} — ${STATE_CFG[getState(urgent[0].deadline)].quip}`);
    }

    // §TOAST ─ 右下角通知条
    let toastTimer;
    function showToast(msg) {
      const el = document.getElementById("toast");
      el.textContent = msg;
      el.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
    }

    // §POMODORO ─ 番茄计时器
    let timerDuration = parseInt(localStorage.getItem('todo_timer_duration')) || 3600;
    let stretchTime = timerDuration;
    let stretchExpired = false;
    let timerRunning = false;

    // Expose timer state to other modules (pure-focus.js)
    window._getTimer = () => ({ running: timerRunning, time: stretchTime, duration: timerDuration });

    function setDuration(mins) {
      timerDuration = mins * 60;
      localStorage.setItem('todo_timer_duration', timerDuration);
      // 只在未运行时立即更新显示
      if (!timerRunning) {
        stretchTime = timerDuration;
        stretchExpired = false;
      }
      // 更新按钮高亮
      document.querySelectorAll('.duration-btn').forEach(b => {
        b.classList.toggle('sel', parseInt(b.dataset.mins) === mins);
      });
      if (!timerRunning) updateStretchDisplay();
    }

    function startPauseTimer() {
      timerRunning = !timerRunning;
      const btn = document.getElementById('start-timer-btn');
      if (timerRunning) {
        btn.textContent = '⏸ 暂停';
        btn.classList.add('running');
      } else {
        btn.textContent = '▶ 继续';
        btn.classList.remove('running');
      }
    }

    function updateStretchDisplay() {
      const mins = Math.floor(stretchTime / 60);
      const secs = stretchTime % 60;
      const display = document.getElementById("stretch-countdown");
      if (display) display.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

      const counterEl = document.getElementById("session-counter");
      if (counterEl) counterEl.textContent = `(今日专注: ${completedSessions} 次)`;

      const statusLabel = document.getElementById("current-status");
      if (!statusLabel) return;
      if (!timerRunning && stretchTime === timerDuration) {
        statusLabel.textContent = "准备开始 ⏸";
        statusLabel.style.color = "#fff";
      } else if (stretchTime <= 0) {
        statusLabel.textContent = "该拉伸了！🏃‍♂️";
        statusLabel.style.color = "#ff6b6b";
      } else if (stretchTime < 300) {
        statusLabel.textContent = "准备休息 🧘";
        statusLabel.style.color = "#ffd43b";
      } else {
        statusLabel.textContent = timerRunning ? "专注中 🧠" : "已暂停 ⏸";
        statusLabel.style.color = timerRunning ? "#fff" : "#ffd43b";
      }
    }

    function todayStr() {
      const d = new Date();
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }

    function loadSessions() {
      const saved = localStorage.getItem('todo_sessions_date');
      if (saved !== todayStr()) {
        localStorage.setItem('todo_sessions', '0');
        localStorage.setItem('todo_sessions_date', todayStr());
      }
      return parseInt(localStorage.getItem('todo_sessions')) || 0;
    }

    let completedSessions = loadSessions();

    // 每分钟检查是否跨了0点，跨了就自动重置
    setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        completedSessions = 0;
        localStorage.setItem('todo_sessions', '0');
        localStorage.setItem('todo_sessions_date', todayStr());
      }
    }, 60 * 1000);

    function updateStretchTimer() {
      if (timerRunning && stretchTime > 0) {
        stretchTime--;
      }
      if (timerRunning && stretchTime <= 0 && !stretchExpired) {
        stretchExpired = true;
        timerRunning = false;
        const btn = document.getElementById('start-timer-btn');
        if (btn) { btn.textContent = '▶ 开始'; btn.classList.remove('running'); }
        document.querySelectorAll(".mascot-pet").forEach(el => el.classList.add("alert"));
        showToast("🔔 站起来动动身体，拉伸一下吧！");
      }
      updateStretchDisplay();
    }

    function resetStretchTimer() {
      timerRunning = false;
      stretchTime = timerDuration;
      stretchExpired = false;
      document.querySelectorAll(".mascot-pet").forEach(el => el.classList.remove("alert"));
      const btn = document.getElementById('start-timer-btn');
      if (btn) { btn.textContent = '▶ 开始'; btn.classList.remove('running'); }
      completedSessions++;
      localStorage.setItem('todo_sessions', completedSessions);
      showToast(`🔄 计时重置！这是你今天的第 ${completedSessions} 次专注，继续保持！`);
      updateStretchDisplay();
    }

    setInterval(updateStretchTimer, 1000);

    function showCustomDurInput() {
      const inp = document.getElementById('custom-dur-input');
      inp.classList.add('show');
      inp.value = '';
      inp.focus();
    }
    function applyCustomDur() {
      const inp = document.getElementById('custom-dur-input');
      inp.classList.remove('show');
      const mins = parseInt(inp.value);
      if (!mins || mins < 1) return;
      const btn = document.getElementById('custom-dur-btn');
      btn.dataset.mins = mins;
      btn.textContent = '自定义：' + mins + '分';
      setDuration(mins);
    }

    // 初始化：高亮已保存的时长按钮（含自定义）
    (function() {
      const savedMins = timerDuration / 60;
      let matched = false;
      document.querySelectorAll('.duration-btn').forEach(b => {
        if (parseInt(b.dataset.mins) === savedMins) { b.classList.add('sel'); matched = true; }
      });
      if (!matched && savedMins > 0) {
        const btn = document.getElementById('custom-dur-btn');
        if (btn) { btn.dataset.mins = savedMins; btn.textContent = '自定义：' + savedMins + '分'; btn.classList.add('sel'); }
      }
      updateStretchDisplay();
    })();

    // §NOTEPAD ─ 随想录
    const NOTEPAD_MAX = 500;
    const notepadEl = document.getElementById("notepad-textarea");
    const notepadCountEl = document.getElementById("notepad-count");

    notepadEl.value = localStorage.getItem('todo_notepad') || "";
    notepadCountEl.textContent = NOTEPAD_MAX - notepadEl.value.length;

    notepadEl.addEventListener("input", () => {
      localStorage.setItem('todo_notepad', notepadEl.value);
      const remaining = NOTEPAD_MAX - notepadEl.value.length;
      notepadCountEl.textContent = remaining;
      notepadCountEl.style.color = remaining < 50
        ? "rgba(255,100,100,0.8)"
        : "rgba(255,255,255,0.4)";
    });

    // §RESIZE ─ Todo 面板宽度拖拽
    (function() {
      const handle = document.getElementById('todo-resize-handle');
      const desktop = document.getElementById('desktop');
      const MIN_WIDTH = 280;
      let startX, startWidth, dragging = false;

      const savedWidth = localStorage.getItem('todo_col_width');
      if (savedWidth) {
        const maxWidth = window.innerWidth - 360 - 64;
        const clamped = Math.min(maxWidth, Math.max(MIN_WIDTH, parseFloat(savedWidth)));
        desktop.style.setProperty('--todo-col-width', clamped + 'px');
      }

      handle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        dragging = true;
        handle.classList.add('dragging');
        startX = e.clientX;
        const computed = getComputedStyle(desktop).gridTemplateColumns.split(' ');
        startWidth = parseFloat(computed[computed.length - 1]);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      });

      document.addEventListener('mousemove', function(e) {
        if (!dragging) return;
        const delta = startX - e.clientX;
        const maxWidth = window.innerWidth - 360 - 64; // leave 360px for left column + padding/gap
        const newWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth + delta));
        desktop.style.setProperty('--todo-col-width', newWidth + 'px');
      });

      document.addEventListener('mouseup', function() {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        const computed = getComputedStyle(desktop).gridTemplateColumns.split(' ');
        const finalWidth = parseFloat(computed[computed.length - 1]);
        localStorage.setItem('todo_col_width', Math.round(finalWidth));
      });
    })();

    // §INIT ─ 首屏渲染 + 定时器
    render();
    setInterval(render, 30000);
    setInterval(checkNotify, 10 * 60 * 1000);

    document.addEventListener("keydown", e => {
      const formVisible = document.getElementById("add-form").style.display !== "none";
      if (e.key === "Enter" && formVisible) addTask();
      if (e.key === "Escape") {
        if (formVisible) document.getElementById("add-form").style.display = "none";
        closeMenu(); closeCalendar(); closeReport();
      }
    });

    // §COMPLETED ─ 已完成任务 + 恢复
    var completedTasks = JSON.parse(localStorage.getItem('todo_completed_tasks') || '[]'); // var avoids TDZ
    function saveCompletedTask(task) {
      completedTasks.push({ ...task, completedAt: new Date().toISOString() });
      localStorage.setItem('todo_completed_tasks', JSON.stringify(completedTasks));
    }

    // Returns completed tasks for the current adjusted day key
    function getTodayCompleted() {
      if (!completedTasks) return [];
      const dk = getDayKey();
      const rh = parseInt(localStorage.getItem('todo_reset_hour') || '7');
      return completedTasks.filter(t => {
        const d = new Date(t.completedAt || 0);
        const ref = d.getHours() < rh ? new Date(d - 864e5) : d;
        const k = `${ref.getFullYear()}-${String(ref.getMonth()+1).padStart(2,'0')}-${String(ref.getDate()).padStart(2,'0')}`;
        return k === dk;
      });
    }

    var completedPanelOpen = false;
    function toggleCompletedPanel() {
      completedPanelOpen = !completedPanelOpen;
      document.getElementById('completed-panel').classList.toggle('open', completedPanelOpen);
      document.getElementById('c-chevron').classList.toggle('open', completedPanelOpen);
      renderCompletedList();
    }

    function renderCompletedList() {
      const today = getTodayCompleted();
      const badge = document.getElementById('c-badge');
      if (badge) badge.textContent = today.length;
      if (!completedPanelOpen) return;
      const list = document.getElementById('completed-list');
      if (!list) return;
      if (!today.length) {
        list.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.22);font-size:11px;padding:12px 0">今日暂无已完成任务</div>';
        return;
      }
      list.innerHTML = [...today].reverse().map(t => {
        const time = new Date(t.completedAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        return `<div class="completed-item" id="ctask-${t.id}">
          <span class="ci-name" title="${t.text}">✓ ${t.text}</span>
          <span class="ci-time">${time}</span>
          <button class="restore-btn" onclick="restoreTask(${t.id})">↩ 恢复</button>
        </div>`;
      }).join('');
    }

    function restoreTask(id) {
      const idx = completedTasks.findIndex(t => t.id === id);
      if (idx === -1) return;
      const task = { ...completedTasks[idx] };
      delete task.completedAt;
      // Move back to active
      completedTasks.splice(idx, 1);
      localStorage.setItem('todo_completed_tasks', JSON.stringify(completedTasks));
      tasks.push(task);
      saveTasks();
      // Decrement daily done
      const dk = getDayKey(), dd = getDayData(dk);
      dd.done = Math.max(0, dd.done - 1);
      saveDayData(dk, dd);
      // Animate out then re-render
      const el = document.getElementById('ctask-' + id);
      if (el) {
        el.style.transition = 'opacity 0.22s, transform 0.22s';
        el.style.opacity = '0'; el.style.transform = 'translateX(-16px)';
        setTimeout(() => { render(); renderCompletedList(); updateStadiumProgress(); }, 230);
      } else {
        render(); renderCompletedList(); updateStadiumProgress();
      }
      showToast('↩ 任务已恢复到待完成！');
    }

    // §MENU ─ 扩展坞菜单
    let menuOpen = false;
    function toggleMenu() {
      menuOpen = !menuOpen;
      document.getElementById('side-menu').classList.toggle('open', menuOpen);
      document.getElementById('menu-overlay').classList.toggle('open', menuOpen);
    }
    function closeMenu() {
      menuOpen = false;
      document.getElementById('side-menu').classList.remove('open');
      document.getElementById('menu-overlay').classList.remove('open');
    }

    // §FOCUS ─ 专注模式
    let focusModeOn = false;
    function toggleFocusMode() {
      focusModeOn = !focusModeOn;
      document.getElementById('desktop').classList.toggle('focus-mode', focusModeOn);
      document.getElementById('focus-toggle').classList.toggle('on', focusModeOn);
      document.getElementById('focus-menu-item').classList.toggle('active', focusModeOn);
      const mc = document.getElementById('mascot-container');
      if (mc) mc.style.display = focusModeOn ? 'none' : '';
    }

    // §LANG ─ 中英文切换
    let currentLang = localStorage.getItem('todo_lang') || 'zh';
    const I18N = {
      zh: {
        menuTitle: '扩展坞', notepadTitle: '🌿 随想录',
        notepadPh: '写下一些你今日的灵感吧！让我们效率拉满！',
        myTasks: '⚡ 我的任务', addTaskTitle: '✨ 新任务',
        taskNamePh: '任务名称…', submitBtn: '添加 ✓',
        priorityLabel: '优先级:', sortUrgency: '按 DDL', sortPriority: '按 P',
        emptyState: '🎯 快开始创建你的第一个任务吧！', emptyStateSub: '点击右上角 + 添加任务',
        focusMode: '专注模式', focusModeDesc: '隐藏其他模块，只看任务',
        calendarLabel: '日历视图', calendarDesc: '查看任务日程总览',
        reportLabel: '工作报告', reportDesc: '查看时间段内的任务情况',
        customSection: '陪伴小宠',
      },
      en: {
        menuTitle: 'Dock', notepadTitle: '🌿 Notes',
        notepadPh: 'Write your inspirations here!',
        myTasks: '⚡ My Tasks', addTaskTitle: '✨ New Task',
        taskNamePh: 'Task name…', submitBtn: 'Add ✓',
        priorityLabel: 'Priority:', sortUrgency: 'By Urgency', sortPriority: 'By Priority',
        emptyState: '🎯 Create your first task!', emptyStateSub: 'Click + to add a task',
        focusMode: 'Focus Mode', focusModeDesc: 'Hide other panels, focus on tasks',
        calendarLabel: 'Calendar', calendarDesc: 'View task schedule overview',
        reportLabel: 'Work Report', reportDesc: 'View tasks in a time period',
        customSection: 'Companions',
      }
    };
    function t(key) { return (I18N[currentLang] || I18N.zh)[key] || key; }

    function applyLanguage(lang) {
      currentLang = lang;
      localStorage.setItem('todo_lang', lang);
      document.getElementById('notepad-title-text').textContent = t('notepadTitle');
      document.getElementById('notepad-textarea').placeholder = t('notepadPh');
      document.getElementById('add-form-title').textContent = t('addTaskTitle');
      document.getElementById('task-name').placeholder = t('taskNamePh');
      document.getElementById('submit-btn').textContent = t('submitBtn');
      document.querySelector('.w-title').textContent = t('myTasks');
      document.querySelector('.form-priority-label').textContent = t('priorityLabel');
      document.getElementById('menu-title-text').textContent = t('menuTitle');
      document.getElementById('focus-mode-label').textContent = t('focusMode');
      document.getElementById('focus-mode-desc').textContent = t('focusModeDesc');
      document.getElementById('calendar-label').textContent = t('calendarLabel');
      document.getElementById('calendar-desc').textContent = t('calendarDesc');
      document.getElementById('report-label').textContent = t('reportLabel');
      document.getElementById('report-desc').textContent = t('reportDesc');
      document.getElementById('custom-section-title').textContent = t('customSection');
      document.querySelectorAll('.lang-pill button').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === lang);
      });
      render();
    }

    // Init language
    applyLanguage(currentLang);

    // §DAY-PROGRESS ─ 每日进度
    function getDayKey() {
      const now = new Date();
      const rh  = parseInt(localStorage.getItem('todo_reset_hour') || '7');
      // Before reset hour → still counts as "yesterday"
      const ref = now.getHours() < rh ? new Date(now - 864e5) : now;
      return `${ref.getFullYear()}-${String(ref.getMonth()+1).padStart(2,'0')}-${String(ref.getDate()).padStart(2,'0')}`;
    }
    function getDayData(k) {
      return JSON.parse(localStorage.getItem('todo_day_'+k) || '{"total":0,"done":0}');
    }
    function saveDayData(k, data) {
      localStorage.setItem('todo_day_'+k, JSON.stringify(data));
    }
    function adjustResetHour(delta) {
      const h = (parseInt(localStorage.getItem('todo_reset_hour') || '7') + delta + 24) % 24;
      localStorage.setItem('todo_reset_hour', String(h));
      const el = document.getElementById('reset-hour-display');
      if (el) el.textContent = String(h).padStart(2,'0') + ':00';
    }
    // Initialise reset-hour display to saved value
    (function() {
      const h = parseInt(localStorage.getItem('todo_reset_hour') || '7');
      const el = document.getElementById('reset-hour-display');
      if (el) el.textContent = String(h).padStart(2,'0') + ':00';
    })();

    // §MASCOT ─ 陪伴小宠（多只 · 可加可删 · 各自拖动）
    const MASCOTS = [
      { emoji: '🦕', name: '恐龙' },
      { emoji: '🐶', name: '小狗' },
      { emoji: '🐱', name: '猫咪' },
      { emoji: '🐰', name: '兔子' },
      { emoji: '🐻', name: '熊熊' },
      { emoji: '🐼', name: '熊猫' },
      { emoji: '🦊', name: '狐狸' },
      { emoji: '🐨', name: '考拉' },
      { emoji: '🐧', name: '企鹅' },
      { emoji: '🐸', name: '青蛙' },
      { emoji: '🦄', name: '独角兽' },
      { emoji: '🐲', name: '龙' },
      { emoji: '🦋', name: '蝴蝶' },
      { emoji: '🌸', name: '樱花' },
      { emoji: '👾', name: '像素' },
    ];

    function toggleMascotPanel() {
      const panel = document.getElementById('mascot-panel');
      const trigger = document.getElementById('pet-trigger');
      const isOpen = panel.classList.toggle('open');
      trigger.classList.toggle('pet-open', isOpen);
    }

    // ----- Placed mascots state -----
    function loadPlacedMascots() {
      const s = localStorage.getItem('todo_mascots');
      if (s) try { return JSON.parse(s); } catch(e) {}
      // Migrate from v2.0 single-mascot system
      const oldEmoji = localStorage.getItem('todo_mascot') || '🦕';
      const oldPos   = JSON.parse(localStorage.getItem('todo_mascot_pos') || 'null');
      const x = oldPos ? oldPos.x : Math.max(0, window.innerWidth  * 0.42 - 60);
      const y = oldPos ? oldPos.y : Math.max(0, window.innerHeight * 0.35 - 60);
      return [{ id: Date.now(), emoji: oldEmoji, x, y }];
    }
    let placedMascots = loadPlacedMascots();
    function savePlacedMascots() {
      localStorage.setItem('todo_mascots', JSON.stringify(placedMascots));
    }

    function isPlaced(emoji) { return placedMascots.some(m => m.emoji === emoji); }

    // Toggle mascot from menu grid: add if not placed, do nothing if already placed
    function applyMascot(emoji) {
      if (isPlaced(emoji)) {
        showToast('🐾 这个小宠已经在桌面上了，长按可移除');
        return;
      }
      // Place new mascot at a slightly offset position so they don't all overlap
      const offset = (placedMascots.length % 6) * 24;
      const x = Math.max(0, window.innerWidth  * 0.42 - 60 + offset);
      const y = Math.max(0, window.innerHeight * 0.35 - 60 + offset);
      placedMascots.push({ id: Date.now() + Math.random(), emoji, x, y });
      savePlacedMascots();
      renderPlacedMascots();
      updateMascotGrid();
      showToast(`🎉 ${MASCOTS.find(m => m.emoji === emoji)?.name || '小宠'} 加入了！`);
    }

    function removeMascot(id) {
      placedMascots = placedMascots.filter(m => m.id !== id);
      savePlacedMascots();
      renderPlacedMascots();
      updateMascotGrid();
    }

    function updateMascotGrid() {
      const grid = document.getElementById('mascot-grid');
      if (!grid) return;
      grid.innerHTML = MASCOTS.map(m => {
        const placed = isPlaced(m.emoji);
        return `<div class="mascot-option ${placed ? 'placed' : ''}" data-emoji="${m.emoji}" onclick="applyMascot('${m.emoji}')" title="${placed ? '已在桌面' : '点击添加'}">
          <span class="m-emoji">${m.emoji}</span>
          <span class="m-name">${m.name}</span>
        </div>`;
      }).join('');
      const cnt = document.getElementById('mascot-count');
      if (cnt) cnt.textContent = `${placedMascots.length} 个已陪伴`;
    }

    function renderPlacedMascots() {
      const container = document.getElementById('mascot-container');
      if (!container) return;
      container.innerHTML = '';
      placedMascots.forEach(m => {
        const el = document.createElement('div');
        el.className = 'mascot-pet';
        el.dataset.id = m.id;
        // Clamp into viewport in case window resized
        const x = Math.min(Math.max(0, m.x), window.innerWidth  - 80);
        const y = Math.min(Math.max(0, m.y), window.innerHeight - 80);
        el.style.left = x + 'px';
        el.style.top  = y + 'px';
        el.innerHTML = `
          <div class="dino-container">
            <div class="dino-speech">该去拉伸啦！🏃</div>
            <div class="dino-emoji">${m.emoji}</div>
            <div class="dino-zzz"><span>z</span><span>z</span><span>z</span></div>
          </div>`;
        container.appendChild(el);
        attachMascotInteractions(el, m.id);
      });
    }

    // Backward-compat helper used by pomodoro / focus mode
    function setAllMascotsAlert(on) {
      document.querySelectorAll('.mascot-pet').forEach(el => {
        el.classList.toggle('alert', !!on);
      });
    }
    function setAllMascotsHidden(hidden) {
      const c = document.getElementById('mascot-container');
      if (c) c.style.display = hidden ? 'none' : '';
    }

    // §MASCOT-DRAG ─ 小宠拖动 + 长按删除
    let _activeMascot = null;          // { el, id }
    let _mascotDragging = false;
    let _mascotOffsetX = 0, _mascotOffsetY = 0;
    let _mascotLongPressTimer = null;
    let _mascotStartPt = null;
    let _pendingRemoveMascotId = null;

    function attachMascotInteractions(el, id) {
      el.addEventListener('mousedown',  e => { startMascotInteraction(el, id, e.clientX, e.clientY); e.preventDefault(); });
      el.addEventListener('touchstart', e => { const t = e.touches[0]; startMascotInteraction(el, id, t.clientX, t.clientY); }, { passive: true });
    }

    function startMascotInteraction(el, id, cx, cy) {
      _activeMascot = { el, id };
      _mascotStartPt = { x: cx, y: cy };
      _mascotDragging = false;
      const r = el.getBoundingClientRect();
      _mascotOffsetX = cx - r.left;
      _mascotOffsetY = cy - r.top;
      el.classList.add('long-pressing');
      // Long-press → ask to remove
      _mascotLongPressTimer = setTimeout(() => {
        if (!_mascotDragging) {
          el.classList.remove('long-pressing');
          promptRemoveMascot(id);
          _activeMascot = null;
        }
      }, 600);
    }

    document.addEventListener('mousemove', e => mascotMove(e.clientX, e.clientY));
    document.addEventListener('touchmove', e => { if (_activeMascot) { const t = e.touches[0]; mascotMove(t.clientX, t.clientY); e.preventDefault(); } }, { passive: false });
    document.addEventListener('mouseup',   mascotEnd);
    document.addEventListener('touchend',  mascotEnd);
    document.addEventListener('touchcancel', mascotEnd);

    function mascotMove(cx, cy) {
      if (!_activeMascot) return;
      // Detect drag start (>5px movement cancels long-press)
      if (!_mascotDragging) {
        const dx = cx - _mascotStartPt.x;
        const dy = cy - _mascotStartPt.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          _mascotDragging = true;
          if (_mascotLongPressTimer) clearTimeout(_mascotLongPressTimer);
          _activeMascot.el.classList.remove('long-pressing');
          _activeMascot.el.style.transition = 'none';
        } else {
          return;
        }
      }
      const el = _activeMascot.el;
      const x = Math.min(Math.max(0, cx - _mascotOffsetX), window.innerWidth  - el.offsetWidth);
      const y = Math.min(Math.max(0, cy - _mascotOffsetY), window.innerHeight - el.offsetHeight);
      el.style.left = x + 'px';
      el.style.top  = y + 'px';
    }

    function mascotEnd() {
      if (_mascotLongPressTimer) clearTimeout(_mascotLongPressTimer);
      if (_activeMascot) {
        _activeMascot.el.classList.remove('long-pressing');
        if (_mascotDragging) {
          const m = placedMascots.find(p => p.id === _activeMascot.id);
          if (m) {
            m.x = parseInt(_activeMascot.el.style.left);
            m.y = parseInt(_activeMascot.el.style.top);
            savePlacedMascots();
          }
          _activeMascot.el.style.transition = '';
        }
      }
      _activeMascot = null;
      _mascotDragging = false;
    }

    function promptRemoveMascot(id) {
      const m = placedMascots.find(p => p.id === id);
      if (!m) return;
      _pendingRemoveMascotId = id;
      document.getElementById('mascot-remove-emoji').textContent = m.emoji;
      document.getElementById('mascot-remove-name').textContent =
        MASCOTS.find(x => x.emoji === m.emoji)?.name || '小宠';
      document.getElementById('mascot-remove-overlay').classList.add('show');
    }

    function cancelRemoveMascot() {
      _pendingRemoveMascotId = null;
      document.getElementById('mascot-remove-overlay').classList.remove('show');
    }

    function confirmRemoveMascot() {
      const id = _pendingRemoveMascotId;
      cancelRemoveMascot();
      if (id != null) {
        const m = placedMascots.find(p => p.id === id);
        const name = m ? (MASCOTS.find(x => x.emoji === m.emoji)?.name || '小宠') : '小宠';
        removeMascot(id);
        showToast(`👋 ${name} 离开了，记得想念它～`);
      }
    }

    // Re-clamp positions on window resize
    window.addEventListener('resize', () => {
      let changed = false;
      placedMascots.forEach(m => {
        const x = Math.min(Math.max(0, m.x), window.innerWidth  - 80);
        const y = Math.min(Math.max(0, m.y), window.innerHeight - 80);
        if (x !== m.x || y !== m.y) { m.x = x; m.y = y; changed = true; }
      });
      if (changed) { savePlacedMascots(); renderPlacedMascots(); }
    });

    // Initial render
    updateMascotGrid();
    renderPlacedMascots();

    // §STADIUM ─ 进度环 + 心电图
    const DAILY_QUOTES = [
      { text: "Stay hungry, stay foolish.", author: "Steve Jobs", info: "🇺🇸 美国 · 2005年斯坦福演讲" },
      { text: "One child, one teacher, one book, one pen can change the world.", author: "Malala Yousafzai", info: "🇵🇰 巴基斯坦 · 2013年联合国演讲" },
      { text: "When they go low, we go high.", author: "Michelle Obama", info: "🇺🇸 美国 · 2016年民主党大会" },
      { text: "It always seems impossible until it's done.", author: "Nelson Mandela", info: "🇿🇦 南非 · 1994年就职演讲" },
      { text: "Vulnerability is not weakness. It's our greatest measure of courage.", author: "Brené Brown", info: "🇺🇸 美国 · 2010年TED演讲" },
      { text: "If something is important enough, even if the odds are against you, you should still do it.", author: "Elon Musk", info: "🇺🇸 美国 · 2013年采访" },
      { text: "It is impossible to live without failing at something, unless you live so cautiously that you might as well not have lived at all.", author: "J.K. Rowling", info: "🇬🇧 英国 · 2008年哈佛演讲" },
      { text: "Change will not come if we wait for some other person or some other time.", author: "Barack Obama", info: "🇺🇸 美国 · 2008年竞选演讲" },
      { text: "If not me, who? If not now, when?", author: "Emma Watson", info: "🇬🇧 英国 · 2014年联合国HeForShe" },
      { text: "Purpose is the essential element of you. It is the reason you are on the planet at this particular time.", author: "Chadwick Boseman", info: "🇺🇸 美国 · 2018年霍华德大学毕业演讲" },
      { text: "Our industry does not respect tradition — it only respects innovation.", author: "Satya Nadella", info: "🇮🇳 印度 · 2014年微软CEO就任演讲" },
      { text: "Today is cruel, tomorrow is crueler, and the day after tomorrow is beautiful.", author: "Jack Ma / 马云", info: "🇨🇳 中国 · 2015年阿里巴巴峰会" },
      { text: "You say you love your children above all else, yet you are stealing their future in front of their very eyes.", author: "Greta Thunberg", info: "🇸🇪 瑞典 · 2019年联合国气候峰会" },
      { text: "A new day is on the horizon. And when that new day finally dawns, it will be because of a lot of magnificent women.", author: "Oprah Winfrey", info: "🇺🇸 美国 · 2018年金球奖致辞" },
      { text: "A champion is defined not by their wins but by how they can recover when they fall.", author: "Serena Williams", info: "🇺🇸 美国 · 2016年《时代》专访" },
      { text: "The most important thing is to try and inspire people so that they can be great in whatever they want to do.", author: "Kobe Bryant", info: "🇺🇸 美国 · 2016年退役感言" },
      { text: "Believe you can and you're halfway there.", author: "BTS · RM", info: "🇰🇷 韩国 · 2018年联合国演讲" },
      { text: "Dreams are not what you see in sleep. Dreams are the things that do not let you sleep.", author: "A.P.J. Abdul Kalam", info: "🇮🇳 印度 · 2002年总统就职演讲" },
      { text: "In the middle of every difficulty lies opportunity.", author: "Angela Merkel", info: "🇩🇪 德国 · 2015年难民危机演讲" },
      { text: "The function of education is to teach one to think intensively and to think critically.", author: "Chimamanda Ngozi Adichie", info: "🇳🇬 尼日利亚 · 2012年TED演讲" },
      { text: "Privacy is a fundamental human right.", author: "Tim Cook", info: "🇺🇸 美国 · 2019年Apple隐私声明" },
      { text: "My experience has been that my mistakes led to the best things in my life.", author: "Taylor Swift", info: "🇺🇸 美国 · 2022年纽约大学毕业演讲" },
      { text: "Nothing is given. Everything is earned.", author: "LeBron James", info: "🇺🇸 美国 · 2012年Nike励志短片" },
      { text: "They are us.", author: "Jacinda Ardern", info: "🇳🇿 新西兰 · 2019年基督城事件声明" },
      { text: "A.I. is probably the most profound thing humanity has ever worked on.", author: "Sundar Pichai", info: "🇮🇳 印度 · 2020年谷歌年度演讲" },
      { text: "Women belong in all places where decisions are being made.", author: "Ruth Bader Ginsburg", info: "🇺🇸 美国 · 2016年接受采访" },
      { text: "Love is love is love is love — cannot be killed or swept aside.", author: "Lin-Manuel Miranda", info: "🇺🇸 美国 · 2016年托尼奖颁奖典礼" },
      { text: "For all the little boys and girls who look like me — this is a beacon of hope and possibilities.", author: "Michelle Yeoh", info: "🇲🇾 马来西亚 · 2023年奥斯卡颁奖典礼" },
      { text: "However difficult life may seem, there is always something you can do and succeed at.", author: "Stephen Hawking", info: "🇬🇧 英国 · 2017年剑桥大学毕业演讲" },
      { text: "While I may be the first woman in this office, I will not be the last.", author: "Kamala Harris", info: "🇺🇸 美国 · 2021年副总统就职典礼" },
      { text: "We are at war with nature. And nature always wins.", author: "António Guterres", info: "🇵🇹 葡萄牙 · 2021年联合国气候峰会" },
      { text: "We have to begin to teach girls how to be brave, not perfect.", author: "Reshma Saujani", info: "🇺🇸 美国 · 2016年TED演讲" },
      { text: "Success is no accident. It is hard work, perseverance, learning, sacrifice, and most of all, love of what you are doing.", author: "Pelé", info: "🇧🇷 巴西 · 职业生涯格言" },
      { text: "Your love makes me strong. Your hate makes me unstoppable.", author: "Cristiano Ronaldo", info: "🇵🇹 葡萄牙 · 2015年球员专访" },
      { text: "We are in a fight for real equality.", author: "Lewis Hamilton", info: "🇬🇧 英国 · 2020年F1世界冠军致辞" },
      { text: "In the course of history, there comes a time when humanity is called to shift to a new level of consciousness.", author: "Wangari Maathai", info: "🇰🇪 肯尼亚 · 2004年诺贝尔和平奖演讲" },
      { text: "Literature's greatest use may be precisely that it has no use.", author: "Mo Yan / 莫言", info: "🇨🇳 中国 · 2012年诺贝尔文学奖演讲" },
      { text: "The only thing that separates women of color from anyone else is opportunity.", author: "Viola Davis", info: "🇺🇸 美国 · 2015年艾美奖致辞" },
      { text: "I knew that if I failed I wouldn't regret that, but the one thing I might regret is not trying.", author: "Jeff Bezos", info: "🇺🇸 美国 · 1997年普林斯顿大学演讲" },
      { text: "Every scientist dreams of doing something that can benefit the world.", author: "Tu Youyou / 屠呦呦", info: "🇨🇳 中国 · 2015年诺贝尔医学奖演讲" },
      { text: "I need ammunition, not a ride.", author: "Volodymyr Zelensky", info: "🇺🇦 乌克兰 · 2022年基辅保卫战" },
      { text: "The Web is more a social creation than a technical one.", author: "Tim Berners-Lee", info: "🇬🇧 英国 · 1999年《编织万维网》" },
      { text: "Make a mess! Then also help to tidy it up.", author: "Pope Francis", info: "🇦🇷 阿根廷 · 2013年世界青年节" },
      { text: "I tell my story not because it is unique, but because it is not.", author: "Malala Yousafzai", info: "🇵🇰 巴基斯坦 · 2014年诺贝尔和平奖演讲" },
      { text: "I've learned to love myself for who I am.", author: "Naomi Osaka / 大坂直美", info: "🇯🇵 日本 · 2021年《时代》杂志专访" },
      { text: "Success isn't always about greatness. It's about consistency.", author: "Dwayne Johnson", info: "🇺🇸 美国 · 2016年励志访谈" },
      { text: "Please don't give up on your tomorrow.", author: "BTS · Suga", info: "🇰🇷 韩国 · 2020年系列演讲" },
      { text: "I'd rather regret the risks that didn't work out than the chances I didn't take.", author: "Simone Biles", info: "🇺🇸 美国 · 2016年里约奥运会专访" },
      { text: "The biggest risk is not taking any risk.", author: "Mark Zuckerberg", info: "🇺🇸 美国 · 2011年移动世界大会" },
      { text: "You have to fight to reach your dream. You have to sacrifice and work hard for it.", author: "Lionel Messi", info: "🇦🇷 阿根廷 · 职业生涯专访" },
      { text: "We should all be feminists.", author: "Chimamanda Ngozi Adichie", info: "🇳🇬 尼日利亚 · 2012年TEDx演讲" },
    ];

    function getDailyQuote() {
      // Same quote all day, rotates each calendar day
      const dayIndex = Math.floor(Date.now() / 86400000);
      return DAILY_QUOTES[dayIndex % DAILY_QUOTES.length];
    }

    // Stadium: rounded-rect path builder (clockwise from top-center)
    var _stadiumPerim = 0; // var (not let) avoids TDZ when render() fires before this line

    function _rrPath(W, H, R, p) {
      const x1=p, y1=p, x2=W-p, y2=H-p;
      return `M ${W/2},${y1} H ${x2-R} A ${R},${R} 0 0 1 ${x2},${y1+R} V ${y2-R} A ${R},${R} 0 0 1 ${x2-R},${y2} H ${x1+R} A ${R},${R} 0 0 1 ${x1},${y2-R} V ${y1+R} A ${R},${R} 0 0 1 ${x1+R},${y1} H ${W/2}`;
    }
    function _rrFill(W, H, R, p) {
      const x1=p, y1=p, x2=W-p, y2=H-p;
      return `M ${x1+R},${y1} H ${x2-R} A ${R},${R} 0 0 1 ${x2},${y1+R} V ${y2-R} A ${R},${R} 0 0 1 ${x2-R},${y2} H ${x1+R} A ${R},${R} 0 0 1 ${x1},${y2-R} V ${y1+R} A ${R},${R} 0 0 1 ${x1+R},${y1} Z`;
    }

    function updateStadiumLayout() {
      const wrap = document.getElementById('stadium-wrap');
      const svg  = document.getElementById('stadium-svg');
      if (!wrap || !svg) return;
      const W = wrap.offsetWidth, H = wrap.offsetHeight;
      if (W < 10 || H < 10) return;
      const SW=5, R=18, pad=SW/2+1;
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const trackPath = _rrPath(W, H, R, pad);
      const fillPath  = _rrFill(W, H, R, pad);
      _stadiumPerim   = 2*(W-2*R-2*pad) + 2*(H-2*R-2*pad) + 2*Math.PI*R;
      const bgFill  = document.getElementById('stadium-bg-fill');
      const trackBg = document.getElementById('stadium-track-bg');
      const arcEl   = document.getElementById('progress-arc');
      if (bgFill)  bgFill.setAttribute('d', fillPath);
      if (trackBg) trackBg.setAttribute('d', trackPath);
      if (arcEl)   arcEl.setAttribute('d', trackPath);
      updateStadiumProgress();
    }

    function updateStadiumProgress() {
      const arcEl = document.getElementById('progress-arc');
      const label = document.getElementById('stadium-prog-label');
      if (!arcEl || !_stadiumPerim) return; // not yet laid out
      const dk = getDayKey(), dd = getDayData(dk);
      const done = dd.done, total = dd.total;
      const progress = total > 0 ? Math.min(done / total, 1) : 0;
      const filled   = progress > 0 ? Math.max(progress * _stadiumPerim, 10) : 0;
      arcEl.setAttribute('stroke-dasharray', `${filled} ${_stadiumPerim - filled}`);
      if (label) label.textContent = total > 0 ? `${done} / ${total}` : '—';
    }

    function initStadium() {
      // Sync: denominator must be at least active tasks + already-done today
      const dk = getDayKey(), dd = getDayData(dk);
      dd.total = Math.max(dd.total, tasks.length + dd.done);
      saveDayData(dk, dd);

      renderCompletedList();   // set badge on load
      const q = getDailyQuote();
      document.getElementById('sq-text').textContent    = `"${q.text}"`;
      document.getElementById('sq-author').textContent  = `— ${q.author}`;
      document.getElementById('sq-info').textContent    = q.info;
      updateStadiumLayout();
    }
    // Layout needs real DOM dimensions — defer one frame
    requestAnimationFrame(initStadium);
    // ResizeObserver keeps the SVG border in sync whenever the container changes size
    // (covers both window resize and the drag-to-resize handle)
    (function() {
      const wrap = document.getElementById('stadium-wrap');
      if (!wrap) return;
      if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => updateStadiumLayout()).observe(wrap);
      } else {
        window.addEventListener('resize', updateStadiumLayout);
      }
    })();
    // Fallback: re-run layout after full page load and after short delay,
    // in case rAF fired before CSS media-query heights were applied (iOS Safari)
    window.addEventListener('load', function() { updateStadiumLayout(); });
    setTimeout(function() { updateStadiumLayout(); }, 400);
    // Mobile: if stadium-wrap still has no height after CSS applied, force it via JS
    setTimeout(function() {
      if (window.innerWidth <= 767) {
        var sw = document.getElementById('stadium-wrap');
        var dw = document.getElementById('dino-widget');
        if (sw && dw) {
          if (sw.offsetHeight < 10) {
            dw.style.height = '220px';
            sw.style.height = '220px';
            sw.style.width = '100%';
          }
          updateStadiumLayout();
        }
      }
    }, 600);

    // §CALENDAR ─ 日历视图弹窗
    let calYear, calMonth, calView = 'month';
    const CAL_MONTHS = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

    function openCalendar() {
      const now = new Date();
      calYear = now.getFullYear(); calMonth = now.getMonth();
      renderCalendar();
      document.getElementById('calendar-modal').classList.add('open');
      closeMenu();
    }
    function closeCalendar() { document.getElementById('calendar-modal').classList.remove('open'); }
    function calPrev() { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); }
    function calNext() { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); }
    function setCalView(v) {
      calView = v;
      document.querySelectorAll('.cal-tab').forEach(b => b.classList.toggle('active', b.dataset.view === v));
      renderCalendar();
    }

    function renderCalendar() {
      document.getElementById('cal-month-label').textContent = `${calYear} 年 ${CAL_MONTHS[calMonth]}`;
      const taskMap = {};
      tasks.forEach(t => {
        const d = new Date(t.deadline);
        const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!taskMap[k]) taskMap[k] = [];
        taskMap[k].push(t);
      });

      if (calView === 'week') {
        const today = new Date();
        const start = new Date(today); start.setDate(today.getDate() - today.getDay());
        let html = '';
        for (let i = 0; i < 7; i++) {
          const day = new Date(start); day.setDate(start.getDate() + i);
          const k = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
          const dt = taskMap[k] || [];
          const isToday = day.toDateString() === today.toDateString();
          const dots = dt.slice(0,4).map(t => `<div class="cal-dot" style="background:${STATE_CFG[getState(t.deadline)].color}"></div>`).join('');
          html += `<div class="cal-day ${isToday?'today':''} ${dt.length?'has-task':''}" onclick="showCalDayTasks(${JSON.stringify(dt.map(t=>t.text))})">
            <span class="cal-day-num">${day.getDate()}</span>
            <div class="cal-dot-row">${dots}</div></div>`;
        }
        document.getElementById('cal-grid').innerHTML = html;
        return;
      }

      const firstDay = new Date(calYear, calMonth, 1).getDay();
      const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
      const today = new Date();
      let html = '';
      for (let i = 0; i < firstDay; i++) html += '<div class="cal-day" style="opacity:0;pointer-events:none"></div>';
      for (let d = 1; d <= daysInMonth; d++) {
        const k = `${calYear}-${calMonth}-${d}`;
        const dt = taskMap[k] || [];
        const isToday = today.getFullYear()===calYear && today.getMonth()===calMonth && today.getDate()===d;
        const dots = dt.slice(0,4).map(t => `<div class="cal-dot" style="background:${STATE_CFG[getState(t.deadline)].color}"></div>`).join('');
        html += `<div class="cal-day ${isToday?'today':''} ${dt.length?'has-task':''}" onclick="showCalDayTasks(${JSON.stringify(dt.map(t=>t.text))})">
          <span class="cal-day-num">${d}</span>
          <div class="cal-dot-row">${dots}</div></div>`;
      }
      document.getElementById('cal-grid').innerHTML = html;
    }

    function showCalDayTasks(names) {
      if (!names.length) return;
      showToast('📅 ' + names.join(' · '));
    }

    // §REPORT ─ 工作报告弹窗
    function openReport() {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7*24*3600*1000).toISOString().split('T')[0];
      document.getElementById('report-from').value = weekAgo;
      document.getElementById('report-to').value = today;
      generateReport();
      document.getElementById('report-modal').classList.add('open');
      closeMenu();
    }
    function closeReport() { document.getElementById('report-modal').classList.remove('open'); }

    function generateReport() {
      const from = new Date(document.getElementById('report-from').value);
      const to = new Date(document.getElementById('report-to').value);
      to.setHours(23,59,59,999);

      const done = completedTasks.filter(t => { const d = new Date(t.completedAt); return d >= from && d <= to; });
      const active = tasks.filter(t => { const d = new Date(t.deadline); return d >= from && d <= to; });
      const overdue = active.filter(t => getState(t.deadline) === 'overdue');
      const pending = active.filter(t => getState(t.deadline) !== 'overdue');

      document.getElementById('report-done-count').textContent = done.length;
      document.getElementById('report-pending-count').textContent = pending.length;
      document.getElementById('report-overdue-count').textContent = overdue.length;

      let html = '';
      if (done.length) {
        html += '<div class="report-section-label">✅ 已完成</div>';
        html += done.map(t => `<div class="report-task-item report-task-done">
          <span>✓</span><span>${t.text}</span>
          <span style="margin-left:auto;font-size:10px;opacity:0.5">${new Date(t.completedAt).toLocaleDateString()}</span>
        </div>`).join('');
      }
      if (pending.length) {
        html += '<div class="report-section-label">⏳ 进行中</div>';
        html += pending.map(t => `<div class="report-task-item">
          <span class="task-priority p${t.priority||3}">${P_LABELS[t.priority||3]}</span>
          <span>${t.text}</span>
          <span style="margin-left:auto;font-size:10px;opacity:0.5">${formatTime(t.deadline)}</span>
        </div>`).join('');
      }
      if (overdue.length) {
        html += '<div class="report-section-label">⚠️ 已超期</div>';
        html += overdue.map(t => `<div class="report-task-item" style="background:rgba(255,80,80,0.1)">
          <span>💀</span><span style="color:#ff8080">${t.text}</span>
        </div>`).join('');
      }
      if (!done.length && !active.length) {
        html = '<div style="text-align:center;color:rgba(255,255,255,0.28);padding:24px 0;font-size:13px">该时间段内无任务记录</div>';
      }
      document.getElementById('report-task-list').innerHTML = html;
    }

    // §PURE-FOCUS ─ 纯享模式（已抽取到 ./pure-focus.js）
    // 见文件顶部的 import 语句

    // §LAYOUT ─ 自适应识别 + 自定义布局
    // 注意：v3.0.2 起「每日名言」与「进度环」合并（名言就在进度环里），共用 stadium 开关
    const LAYOUT_MODULES = ['weather','stadium','notepad','pomodoro','mascot'];
    const DEFAULT_LAYOUT = {
      density: 'comfortable',
      visibility: { weather:true, stadium:true, notepad:true, pomodoro:true, mascot:true },
    };

    function loadLayout() {
      try {
        const s = localStorage.getItem('todo_layout');
        if (s) {
          const obj = JSON.parse(s);
          const vis = { ...DEFAULT_LAYOUT.visibility, ...(obj.visibility || {}) };
          // Migration: v3.0.2 merged 'quotes' into 'stadium'.
          // If old user had quotes:false but stadium:true, hide stadium too.
          if (obj.visibility && obj.visibility.quotes === false && vis.stadium) {
            vis.stadium = false;
          }
          delete vis.quotes; // drop the orphaned key
          return {
            density: obj.density || DEFAULT_LAYOUT.density,
            visibility: vis,
          };
        }
      } catch(e) {}
      return JSON.parse(JSON.stringify(DEFAULT_LAYOUT));
    }
    function saveLayout(l) { localStorage.setItem('todo_layout', JSON.stringify(l)); }
    let _layout = loadLayout();

    function applyLayoutToDOM() {
      const html = document.documentElement;
      html.setAttribute('data-density', _layout.density);
      LAYOUT_MODULES.forEach(m => {
        html.setAttribute('data-show-' + m, _layout.visibility[m] ? 'on' : 'off');
        const cb = document.getElementById('lt-' + m);
        if (cb) cb.checked = !!_layout.visibility[m];
      });
      // Update density segmented buttons
      document.querySelectorAll('.seg-btn[data-density]').forEach(b => {
        b.classList.toggle('active', b.dataset.density === _layout.density);
      });
    }

    function setDensity(d) {
      if (!['compact','comfortable','spacious'].includes(d)) return;
      _layout.density = d;
      saveLayout(_layout); applyLayoutToDOM();
      showToast(`📐 密度已改为：${d === 'compact' ? '紧凑' : d === 'spacious' ? '宽松' : '标准'}`);
    }

    function setModuleVisible(mod, on) {
      if (!LAYOUT_MODULES.includes(mod)) return;
      _layout.visibility[mod] = !!on;
      saveLayout(_layout); applyLayoutToDOM();
      // Re-trigger stadium layout if needed
      if (mod === 'stadium' && on && typeof updateStadiumLayout === 'function') {
        setTimeout(updateStadiumLayout, 100);
      }
    }

    const LAYOUT_PRESETS = {
      default:  { density: 'comfortable', visibility: { weather:true,  stadium:true,  notepad:true,  pomodoro:true,  mascot:true  }},
      focus:    { density: 'compact',     visibility: { weather:false, stadium:false, notepad:false, pomodoro:true,  mascot:false }},
      minimal:  { density: 'comfortable', visibility: { weather:false, stadium:false, notepad:false, pomodoro:false, mascot:false }},
      full:     { density: 'spacious',    visibility: { weather:true,  stadium:true,  notepad:true,  pomodoro:true,  mascot:true  }},
    };
    function applyLayoutPreset(name) {
      const p = LAYOUT_PRESETS[name];
      if (!p) return;
      _layout = JSON.parse(JSON.stringify(p));
      saveLayout(_layout); applyLayoutToDOM();
      const labels = { default:'默认', focus:'任务专注', minimal:'极简', full:'全模块' };
      showToast(`✨ 已切换到「${labels[name]}」布局`);
      if (typeof updateStadiumLayout === 'function') setTimeout(updateStadiumLayout, 100);
    }

    // 屏幕信息显示（菜单里）
    function updateScreenInfo() {
      const el = document.getElementById('layout-screen-info');
      if (!el) return;
      const w = window.innerWidth, h = window.innerHeight;
      const tier =
        w >= 2000 ? '超宽屏' :
        w >= 1440 ? '台式' :
        w >= 1024 ? '笔电' :
        w >= 768  ? '平板' :
        w >= 380  ? '手机' : '小屏';
      const orient = w > h ? '横屏' : '竖屏';
      const isTouch = window.matchMedia('(hover: none)').matches;
      const dpr = window.devicePixelRatio || 1;
      el.textContent = `${tier} ${w}×${h} · ${orient}${isTouch ? ' · 触摸' : ''}${dpr > 1 ? ` · ${dpr}x` : ''}`;
    }

    // Apply on load + keep info synced on resize
    applyLayoutToDOM();
    updateScreenInfo();
    window.addEventListener('resize', () => { updateScreenInfo(); });

    // §QUICK-ADD ─ 快速添加 + 自然语言解析
    // 解析示例:
    //   "明天下午3点开会 P1"      → 标题: 开会, 截止: 明天15:00, P1
    //   "周五交报告 !"           → 标题: 交报告, 截止: 下周五23:59, ⭐
    //   "5月10日团建 P2"         → 标题: 团建, 截止: 5月10日23:59, P2
    //   "3天后做 demo"           → 标题: 做 demo, 截止: 3天后23:59
    //   "9点半喝咖啡"            → 标题: 喝咖啡, 截止: 今天09:30
    function parseQuickAdd(raw) {
      let title = String(raw || '').trim();
      let deadline = null;
      let priority = 3;
      let starred = false;

      // 优先级：P1-P5（不区分大小写）
      const pMatch = title.match(/(?:^|\s)([Pp])([1-5])(?=\s|$)/);
      if (pMatch) {
        priority = parseInt(pMatch[2]);
        title = title.replace(pMatch[0], ' ').trim();
      }

      // 重要标记：! 或 ！或 ⭐（仅首尾）
      const starMatch = title.match(/(^|\s)([!！⭐]+)(\s|$)/);
      if (starMatch) {
        starred = true;
        title = title.replace(starMatch[0], ' ').trim();
      }

      // 日期解析（先解析日期，再解析时间）
      const now = new Date();
      let baseDate = null;
      let dateMatched = false;

      // 今天/明天/后天/大后天
      const todayKw = title.match(/今天|今日/);
      const tomKw   = title.match(/明天|明日/);
      const dayAfter = title.match(/后天/);
      const dayAfterAfter = title.match(/大后天/);

      if (dayAfterAfter) {
        baseDate = new Date(); baseDate.setDate(baseDate.getDate() + 3);
        title = title.replace(dayAfterAfter[0], '').trim(); dateMatched = true;
      } else if (dayAfter) {
        baseDate = new Date(); baseDate.setDate(baseDate.getDate() + 2);
        title = title.replace(dayAfter[0], '').trim(); dateMatched = true;
      } else if (tomKw) {
        baseDate = new Date(); baseDate.setDate(baseDate.getDate() + 1);
        title = title.replace(tomKw[0], '').trim(); dateMatched = true;
      } else if (todayKw) {
        baseDate = new Date();
        title = title.replace(todayKw[0], '').trim(); dateMatched = true;
      }

      // 周X / 星期X
      if (!dateMatched) {
        const weekdayMap = { '日':0,'天':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6 };
        const wMatch = title.match(/(?:周|星期|礼拜)([日天一二三四五六])/);
        if (wMatch) {
          const targetDay = weekdayMap[wMatch[1]];
          const todayDay = now.getDay();
          let diff = targetDay - todayDay;
          if (diff <= 0) diff += 7;
          baseDate = new Date(); baseDate.setDate(baseDate.getDate() + diff);
          title = title.replace(wMatch[0], '').trim(); dateMatched = true;
        }
      }

      // X月X日 / X月X号 / X/X
      if (!dateMatched) {
        const dMatch = title.match(/(\d{1,2})\s*[月\/](\d{1,2})\s*[日号]?/);
        if (dMatch) {
          baseDate = new Date(now.getFullYear(), parseInt(dMatch[1]) - 1, parseInt(dMatch[2]));
          if (baseDate.getTime() < now.getTime() - 86400000) baseDate.setFullYear(baseDate.getFullYear() + 1);
          title = title.replace(dMatch[0], '').trim(); dateMatched = true;
        }
      }

      // X天后 / X周后
      if (!dateMatched) {
        const daysM = title.match(/(\d+)\s*天后/);
        const weekM = title.match(/(\d+)\s*(?:周|星期)后/);
        if (weekM) {
          baseDate = new Date(); baseDate.setDate(baseDate.getDate() + parseInt(weekM[1]) * 7);
          title = title.replace(weekM[0], '').trim(); dateMatched = true;
        } else if (daysM) {
          baseDate = new Date(); baseDate.setDate(baseDate.getDate() + parseInt(daysM[1]));
          title = title.replace(daysM[0], '').trim(); dateMatched = true;
        }
      }

      // X小时后 / X分钟后（直接覆盖时间，不需要 baseDate 加日期）
      const hoursM = title.match(/(\d+)\s*小时后/);
      const minsM  = title.match(/(\d+)\s*分钟后/);
      if (hoursM) {
        baseDate = new Date(); baseDate.setHours(baseDate.getHours() + parseInt(hoursM[1]));
        title = title.replace(hoursM[0], '').trim();
        deadline = baseDate;
      } else if (minsM) {
        baseDate = new Date(); baseDate.setMinutes(baseDate.getMinutes() + parseInt(minsM[1]));
        title = title.replace(minsM[0], '').trim();
        deadline = baseDate;
      } else if (baseDate) {
        // 时刻：上午/下午/晚上 X 点(半)（X分）/ X:XX
        const timeM = title.match(/(上午|下午|中午|晚上|早上|凌晨)?\s*(\d{1,2})\s*(?:点|:|：)\s*(半|\d{1,2})?\s*分?/);
        if (timeM) {
          let hour = parseInt(timeM[2]);
          const period = timeM[1];
          const minStr = timeM[3];
          const minute = minStr === '半' ? 30 : (minStr ? parseInt(minStr) : 0);
          if ((period === '下午' || period === '晚上') && hour < 12) hour += 12;
          if (period === '中午' && hour < 12) hour = 12;
          if (period === '凌晨' && hour === 12) hour = 0;
          baseDate.setHours(hour, minute, 0, 0);
          title = title.replace(timeM[0], '').trim();
        } else {
          // 默认当天 23:59
          baseDate.setHours(23, 59, 0, 0);
        }
        deadline = baseDate;
      }

      // 清理多余空格、孤立标点
      title = title.replace(/\s{2,}/g, ' ').replace(/^[，,。.;；\s]+|[，,。.;；\s]+$/g, '').trim();

      return { title, deadline, priority, starred };
    }

    function quickAddTask() {
      const inp = document.getElementById('quick-add-input');
      if (!inp) return;
      const raw = inp.value.trim();
      if (!raw) return;
      const parsed = parseQuickAdd(raw);
      if (!parsed.title) {
        showToast('❌ 请输入任务名');
        return;
      }
      // Default deadline: today 23:59 if user didn't specify
      if (!parsed.deadline) {
        parsed.deadline = new Date();
        parsed.deadline.setHours(23, 59, 0, 0);
      }
      // Determine list (current active list, or inbox)
      const chosenList = (activeListId !== 'all' && lists.find(l => l.id === activeListId))
        ? activeListId
        : (lists[0] ? lists[0].id : 'inbox');

      const newOrder = sortMode === 'manual'
        ? Math.min(...tasks.map(t => t.order ?? 0), 0) - 1
        : tasks.length;

      tasks.push({
        id: Date.now(),
        text: parsed.title,
        deadline: parsed.deadline.toISOString(),
        priority: parsed.priority,
        myDay: false,
        starred: parsed.starred,
        steps: [], note: '',
        listId: chosenList,
        repeat: 'none', reminder: '', reminderFired: false,
        order: newOrder,
      });
      inp.value = '';
      saveTasks();
      const _dk = getDayKey(), _dd = getDayData(_dk);
      _dd.total++; saveDayData(_dk, _dd);
      render();

      // Smart toast that confirms what we parsed
      const dt = parsed.deadline;
      const sameDay = dt.toDateString() === new Date().toDateString();
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const isTomorrow = dt.toDateString() === tomorrow.toDateString();
      const dateStr = sameDay ? '今天' : isTomorrow ? '明天' : `${dt.getMonth()+1}/${dt.getDate()}`;
      const isEod = dt.getHours() === 23 && dt.getMinutes() === 59;
      const timeStr = isEod ? '' : ` ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
      const pStr = parsed.priority !== 3 ? ` · P${parsed.priority}` : '';
      const sStr = parsed.starred ? ' ⭐' : '';
      showToast(`✅ "${parsed.title}" → ${dateStr}${timeStr}${pStr}${sStr}`);
    }

    function toggleQuickAddHint() {
      const h = document.getElementById('quick-add-hint');
      if (h) h.classList.toggle('show');
    }

    // §CELEBRATE ─ 任务完成庆祝动画
    const CONFETTI_EMOJIS = ['🎉','🎊','✨','⭐','💫','🌟','🎈','🍀'];
    function celebrate(x, y) {
      const N = 18;
      for (let i = 0; i < N; i++) {
        const piece = document.createElement('span');
        piece.className = 'confetti-piece';
        piece.textContent = CONFETTI_EMOJIS[Math.floor(Math.random() * CONFETTI_EMOJIS.length)];
        piece.style.left = (x - 10) + 'px';
        piece.style.top  = (y - 10) + 'px';
        // Random direction & distance
        const angle = (Math.PI * 2 * i / N) + (Math.random() * 0.5 - 0.25);
        const dist  = 70 + Math.random() * 90;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist - 40; // bias upward
        const rot = (Math.random() * 720 - 360) + 'deg';
        piece.style.setProperty('--dx', dx + 'px');
        piece.style.setProperty('--dy', dy + 'px');
        piece.style.setProperty('--rot', rot);
        piece.style.fontSize = (14 + Math.random() * 12) + 'px';
        piece.style.animation = `confetti-fly ${0.7 + Math.random() * 0.5}s ease-out forwards`;
        document.body.appendChild(piece);
        setTimeout(() => piece.remove(), 1400);
      }
    }

    // Inline onclick="..." handlers in HTML need these as globals.
    // (ES modules scope declarations to the module by default.)
    Object.assign(window, {
      addStep, addTask, adjustResetHour, applyColorWallpaper, applyCustomDur,
      applyLanguage, applyMascot, calNext, calPrev, cancelCreateList,
      cancelDelete, cancelDeleteModal, clearSearch, closeCalendar, closeMenu,
      closeReport, completeTask, confirmCreateList, confirmDeleteTask,
      deleteList, deleteStep, enterPureFocus, exitPureFocus, generateReport,
      onTaskSearch, openCalendar, openReport, promptDeleteTask,
      resetStretchTimer, resetWallpaper, restoreTask, saveNote, searchCity,
      selectPriority, selectRepeat, setActiveList, setCalView, setDuration,
      setViewMode, showCalDayTasks, showCreateList, showCustomDurInput,
      startPauseTimer, toggleCityEdit, toggleCompletedPanel, toggleFocusMode,
      toggleForm, toggleMascotPanel, toggleMenu, toggleMyDay, toggleSortMode,
      toggleStarred, toggleStep, toggleTaskExpand,
      // Edit + data import/export
      openEditModal, closeEditModal, selectEditPriority, selectEditRepeat,
      saveEditedTask, exportData, importData,
      toggleEditStar, toggleEditMyDay, deleteFromEditModal,
      // Drag-and-drop reorder
      onTaskDragStart, onTaskDragOver, onTaskDragLeave, onTaskDrop, onTaskDragEnd,
      // Help modal
      openHelp, closeHelp,
      // Multi-mascot
      cancelRemoveMascot, confirmRemoveMascot, removeMascot,
      // Quick add (with NLP) + celebration
      quickAddTask, toggleQuickAddHint, parseQuickAdd,
      // Layout customization
      setDensity, setModuleVisible, applyLayoutPreset,
      // Toast (so other modules like auth.js can call window.showToast)
      showToast,
    });
