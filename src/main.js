    // ===== CLOCK =====
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

    // ===== WEATHER =====
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

    // ===== WALLPAPER =====
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
      const wp = document.getElementById("wallpaper");
      wp.style.backgroundImage = "";
      wp.style.background = `linear-gradient(135deg, ${dark} 0%, ${mid} 55%, ${accent} 100%)`;
      document.getElementById("color-dot").style.background = hex;
      localStorage.setItem('todo_wallpaper_color', hex);
    }

    function resetWallpaper() {
      const wp = document.getElementById("wallpaper");
      wp.style.background = "linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 70%, #533483 100%)";
      wp.style.backgroundImage = "";
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

    // ===== TASKS =====
    let sortMode     = localStorage.getItem('todo_sort_mode')   || 'urgency';
    let viewMode     = localStorage.getItem('todo_view_mode')   || 'all';
    let activeListId = localStorage.getItem('todo_active_list') || 'all';
    let selectedPriority = 3;
    var expandedTasks = {};
    var _creatingList = false;
    let searchQuery = '';
    let selectedRepeat = 'none';

    // ===== LISTS =====
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
    function saveLists() { localStorage.setItem('todo_lists', JSON.stringify(lists)); }

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

    // ===== STEPS (SUB-TASKS) =====
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

    function saveTasks() { localStorage.setItem('todo_tasks', JSON.stringify(tasks)); }
    function loadTasksFromStorage() {
      const s = localStorage.getItem('todo_tasks');
      if (s) {
        try {
          const arr = JSON.parse(s);
          // Migrate: ensure all tasks have listId and steps fields
          arr.forEach(t => {
            if (!t.listId)                   t.listId       = 'inbox';
            if (!t.steps)                    t.steps        = [];
            if (t.starred  === undefined)    t.starred      = false;
            if (t.note     === undefined)    t.note         = '';
            if (!t.repeat)                   t.repeat       = 'none';
            if (t.reminder === undefined)    t.reminder     = '';
            if (t.reminderFired === undefined) t.reminderFired = false;
          });
          return arr;
        } catch(e) {}
      }
      return getDefaultTasks().map(t => ({ ...t, listId: 'inbox', steps: [], starred: false, note: '', repeat: 'none', reminder: '', reminderFired: false }));
    }
    let tasks = loadTasksFromStorage();

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
      if (btn) btn.textContent = sortMode === 'priority' ? '按 P' : '按 DDL';

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
          <div class="task-item state-${s}" id="task-${t.id}">
            <div class="task-item-header">
              <div class="task-bar" style="background:${c.color}"></div>
              <div class="task-content">
                <div class="task-top-row">
                  <span class="task-emoji">${c.emoji}</span>
                  <span class="task-name">${t.text}</span>
                  <span class="task-priority p${p}">${P_LABELS[p]}</span>
                </div>
                <div class="task-ddl-row">
                  <span class="task-ddl" style="color:${c.color}">${c.prefix} ${formatTime(t.deadline)}</span>
                  ${c.quip ? `<span class="task-quip" style="color:${c.color}">${c.quip}</span>` : ""}
                  ${listLbl}${repeatLbl}${reminderLbl}
                  <button class="steps-toggle${totN>0?' has-steps':''}" id="steps-toggle-${t.id}"
                          onclick="toggleTaskExpand(${t.id})">${stepsLbl}</button>
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
      sortMode = sortMode === 'urgency' ? 'priority' : 'urgency';
      localStorage.setItem('todo_sort_mode', sortMode);
      render();
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

    // ===== SEARCH =====
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
      tasks.push({ id: Date.now(), text: name, deadline: new Date(ddl).toISOString(), priority: selectedPriority, myDay: false, starred: false, steps: [], note: '', listId: chosenList, repeat: selectedRepeat, reminder, reminderFired: false });
      document.getElementById("task-name").value = "";
      document.getElementById("add-form").style.display = "none";
      saveTasks();
      // Track today's denominator
      const _dk = getDayKey(), _dd = getDayData(_dk);
      _dd.total++; saveDayData(_dk, _dd);
      render();
      showToast("✅ 任务已添加，加油！");
    }

    const REPEAT_LABEL = { daily:'每天', weekly:'每周', monthly:'每月' };

    function completeTask(id) {
      const task = tasks.find(t => t.id === id);
      const el = document.getElementById("task-" + id);
      if (el) {
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

    // ===== DELETE TASK =====
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

    // ===== REMINDER NOTIFICATIONS =====
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

    // ===== URGENCY NOTIFICATIONS (10-min interval) =====
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

    // ===== TOAST =====
    let toastTimer;
    function showToast(msg) {
      const el = document.getElementById("toast");
      el.textContent = msg;
      el.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
    }

    // ===== STRETCH TIMER & SESSION LOGIC =====
    let timerDuration = parseInt(localStorage.getItem('todo_timer_duration')) || 3600;
    let stretchTime = timerDuration;
    let stretchExpired = false;
    let timerRunning = false;

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
        document.getElementById("mascot-float").classList.add("alert");
        showToast("🔔 站起来动动身体，拉伸一下吧！");
      }
      updateStretchDisplay();
    }

    function resetStretchTimer() {
      timerRunning = false;
      stretchTime = timerDuration;
      stretchExpired = false;
      document.getElementById("mascot-float").classList.remove("alert");
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

    // ===== NOTEPAD =====
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

    // ===== TODO PANEL RESIZE =====
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

    // ===== INIT =====
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

    // ===== COMPLETED TASKS (for reports + undo panel) =====
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

    // ===== MENU =====
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

    // ===== FOCUS MODE =====
    let focusModeOn = false;
    function toggleFocusMode() {
      focusModeOn = !focusModeOn;
      document.getElementById('desktop').classList.toggle('focus-mode', focusModeOn);
      document.getElementById('focus-toggle').classList.toggle('on', focusModeOn);
      document.getElementById('focus-menu-item').classList.toggle('active', focusModeOn);
      const mf = document.getElementById('mascot-float');
      if (mf) mf.style.display = focusModeOn ? 'none' : '';
    }

    // ===== LANGUAGE =====
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

    // ===== DAILY PROGRESS TRACKING =====
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

    // ===== MASCOTS =====
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
    let currentMascot = localStorage.getItem('todo_mascot') || '🦕';

    function applyMascot(emoji) {
      currentMascot = emoji;
      localStorage.setItem('todo_mascot', emoji);
      document.getElementById('mascot-emoji').textContent = emoji;
      document.querySelectorAll('.mascot-option').forEach(el => {
        el.classList.toggle('sel', el.dataset.emoji === emoji);
      });
    }

    function initMascotGrid() {
      const grid = document.getElementById('mascot-grid');
      grid.innerHTML = MASCOTS.map(m => `
        <div class="mascot-option ${m.emoji === currentMascot ? 'sel' : ''}" data-emoji="${m.emoji}" onclick="applyMascot('${m.emoji}')">
          <span class="m-emoji">${m.emoji}</span>
          <span class="m-name">${m.name}</span>
        </div>`).join('');
      document.getElementById('mascot-emoji').textContent = currentMascot;
    }
    initMascotGrid();

    // ===== DRAGGABLE MASCOT =====
    (function() {
      const el = document.getElementById('mascot-float');
      const CIRC = 2 * Math.PI * 121; // SVG progress arc circumference

      // Set initial position (saved or default center-ish)
      const saved = JSON.parse(localStorage.getItem('todo_mascot_pos') || 'null');
      if (saved) {
        el.style.left = saved.x + 'px';
        el.style.top  = saved.y + 'px';
      } else {
        el.style.left = Math.max(0, window.innerWidth  * 0.42 - 60) + 'px';
        el.style.top  = Math.max(0, window.innerHeight * 0.35 - 60) + 'px';
      }

      let dragging = false, ox = 0, oy = 0;

      function startDrag(cx, cy) {
        dragging = true;
        const r = el.getBoundingClientRect();
        ox = cx - r.left;
        oy = cy - r.top;
        el.style.transition = 'none';
      }
      function moveDrag(cx, cy) {
        if (!dragging) return;
        const x = Math.min(Math.max(0, cx - ox), window.innerWidth  - el.offsetWidth);
        const y = Math.min(Math.max(0, cy - oy), window.innerHeight - el.offsetHeight);
        el.style.left = x + 'px';
        el.style.top  = y + 'px';
      }
      function endDrag() {
        if (!dragging) return;
        dragging = false;
        localStorage.setItem('todo_mascot_pos', JSON.stringify({
          x: parseInt(el.style.left), y: parseInt(el.style.top)
        }));
      }

      // Mouse
      el.addEventListener('mousedown',  e => { startDrag(e.clientX, e.clientY); e.preventDefault(); });
      document.addEventListener('mousemove', e => moveDrag(e.clientX, e.clientY));
      document.addEventListener('mouseup',   () => endDrag());

      // Touch
      el.addEventListener('touchstart', e => { const t = e.touches[0]; startDrag(t.clientX, t.clientY); }, { passive: true });
      document.addEventListener('touchmove',  e => { if (!dragging) return; const t = e.touches[0]; moveDrag(t.clientX, t.clientY); e.preventDefault(); }, { passive: false });
      document.addEventListener('touchend',   () => endDrag());
    })();

    // ===== STADIUM WIDGET (progress ring + daily quote) =====
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

    // ===== CALENDAR =====
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

    // ===== WORK REPORT =====
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
    // ===== PURE FOCUS MODE =====
    var _pfRunning = false, _pfAnimId = null;
    var _pfCanvas = null, _pfCtx = null;
    var _pfParts = [];
    var _pfBeat = 0;
    var _pfLastST = -999;
    var _pfSecTs = 0;
    var _pfEcg = [];
    var _pfSpike = 0, _pfSpikePh = 0, _pfSpikeAmp = 1.0;
    var _pfCircleR = 0;

    function _pfPal() {
      var hx = (localStorage.getItem('todo_wallpaper_color') || '#533483').replace('#','');
      var R=parseInt(hx.slice(0,2),16)/255, G=parseInt(hx.slice(2,4),16)/255, B=parseInt(hx.slice(4,6),16)/255;
      var mx=Math.max(R,G,B), mn=Math.min(R,G,B), d=mx-mn;
      var h=0, s=mx?d/mx:0;
      if(d>0){if(mx===R)h=((((G-B)/d)%6)+6)%6;else if(mx===G)h=(B-R)/d+2;else h=(R-G)/d+4;h*=60;}
      var f=function(hh,ss,ll,aa){aa=aa===undefined?1:aa;return'hsla('+((Math.round(hh)%360+360)%360)+','+(ss*100).toFixed(1)+'%,'+(ll*100).toFixed(1)+'%,'+aa+')';};
      var sv=Math.max(s,.5);
      return {
        arc:  f(h,sv,.72),     arcBg: f(h,.18,.28,.38),
        glow: f(h,sv,.68,.20), glowS: f(h,sv,.72,.55),
        ecg:  f(h+18,sv,.72),  ecgF:  f(h+18,sv*.7,.58,.36),
        p0:   f(h-16,sv,.70,.68), p1: f(h,sv*.85,.76,.44), p2: f(h+28,sv*.6,.82,.26),
        bg0:  f(h,sv*.4,.12,.88),
      };
    }

    function _pfMkParts() {
      var W=_pfCanvas.width, H=_pfCanvas.height, cx=W/2, cy=H/2;
      var pal=_pfPal(), cs=[pal.p0,pal.p1,pal.p2];
      _pfParts=[];
      // Orbital ring — beat-reactive
      for(var i=0;i<60;i++){
        var a=(i/60)*Math.PI*2+(Math.random()-.5)*.18;
        var rMin=Math.min(W,H)*.16, rMax=Math.min(W,H)*.44;
        var r=rMin+Math.pow(Math.random(),.6)*(rMax-rMin);
        var sz=Math.random()<.12 ? 1.8+Math.random()*1.4 : (Math.random()<.35 ? .9+Math.random()*.8 : .25+Math.random()*.55);
        _pfParts.push({orbital:true, a:a, av:(Math.random()<.5?1:-1)*(.00025+Math.random()*.00045),
          r:r, rb:r, rd:0, sz:sz, col:cs[i%3], t:Math.random()*Math.PI*2, tw:Math.random()*Math.PI*2, twv:.018+Math.random()*.022});
      }
      // Cosmic dust — scattered across whole canvas
      for(var j=0;j<1520;j++){
        var x=Math.random()*W, y=Math.random()*H;
        var rnd=Math.random();
        var szC=rnd<.04 ? 1.5+Math.random()*1.0 : (rnd<.20 ? .6+Math.random()*.6 : .15+Math.random()*.38);
        _pfParts.push({orbital:false, x:x, y:y,
          vx:(Math.random()-.5)*.07, vy:(Math.random()-.5)*.07,
          sz:szC, col:cs[j%3], t:Math.random()*Math.PI*2, tw:Math.random()*Math.PI*2, twv:.008+Math.random()*.016, rd:0, rb:0});
      }
    }

    function _pfMkEcg() { _pfEcg=new Array(_pfCanvas.width).fill(0); }

    function _pfFire() {
      _pfBeat=1; _pfSpike=1; _pfSpikePh=0;
      _pfSpikeAmp = 0.55 + Math.random()*0.90; // 0.55–1.45, varies each beat
      _pfParts.forEach(function(p){ p.rd+=10+Math.random()*14; });
    }

    function _pfStep() {
      for(var k=0;k<2;k++){
        var t=performance.now();
        // Angular baseline: triangle waves + square-wave steps
        var tri=function(p){p=((p%(Math.PI*2))+Math.PI*2)%(Math.PI*2);return p<Math.PI?(p/Math.PI)*2-1:3-(p/Math.PI)*2;};
        var y=tri(t*.00075)*12 + tri(t*.0022)*7 + Math.sign(Math.sin(t*.011))*2.8 + Math.sign(Math.sin(t*.031))*1.2;
        if(_pfSpike>.015){
          var ph=_pfSpikePh;
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
      var cv=_pfCanvas, ctx=_pfCtx, W=cv.width, H=cv.height, cx=W/2, cy=H/2;
      var pal=_pfPal();

      if(timerRunning && stretchTime!==_pfLastST){
        if(_pfLastST!==-999) _pfFire();
        _pfLastST=stretchTime; _pfSecTs=ts;
      }

      var frac=timerRunning?Math.min((ts-_pfSecTs)/1e3,1):0;
      var remMs=Math.max(0,stretchTime*1e3-frac*1e3);
      var mm=Math.floor(remMs/6e4), ss=Math.floor((remMs%6e4)/1e3), cc=Math.floor((remMs%1e3)/10);
      var tmEl=document.getElementById('pf-tm'), csEl=document.getElementById('pf-cs');
      if(tmEl) tmEl.textContent=String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0');
      if(csEl) csEl.textContent='.'+String(cc).padStart(2,'0');

      _pfBeat=Math.max(0,_pfBeat-.026);
      var bp=Math.sin(_pfBeat*Math.PI)*.055;

      // clear
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle='rgba(4,4,11,.97)'; ctx.fillRect(0,0,W,H);
      var rg=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.min(W,H)*.56);
      rg.addColorStop(0,pal.bg0); rg.addColorStop(1,'transparent');
      ctx.fillStyle=rg; ctx.fillRect(0,0,W,H);

      // particles
      _pfParts.forEach(function(p){
        p.t+=.013; p.tw+=p.twv;
        var alpha=0.45+Math.sin(p.tw)*0.30; // twinkle
        var px,py;
        if(p.orbital){
          p.a+=p.av; p.rd*=.91;
          var r=p.rb+p.rd+Math.sin(p.t)*4;
          px=cx+Math.cos(p.a)*r; py=cy+Math.sin(p.a)*r;
        } else {
          p.x+=p.vx; p.y+=p.vy;
          if(p.x<-4)p.x=W+4; else if(p.x>W+4)p.x=-4;
          if(p.y<-4)p.y=H+4; else if(p.y>H+4)p.y=-4;
          px=p.x; py=p.y;
        }
        var pulseSz=p.orbital ? p.sz*(1+bp*.85) : p.sz;
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

      ctx.globalAlpha=1; // reset after particle loop
      // ECG line — always scroll
      _pfStep();
      var eyBase=H*.68, eHalf=W*.38, eX0=cx-eHalf, eX1=cx+eHalf;
      ctx.save();
      ctx.beginPath();
      var N=_pfEcg.length;
      for(var i=0;i<N;i++){
        var ex=eX0+(i/N)*eHalf*2, ey=eyBase+_pfEcg[i]*(1+bp*2.2);
        i===0?ctx.moveTo(ex,ey):ctx.lineTo(ex,ey);
      }
      var eg=ctx.createLinearGradient(eX0,0,eX1,0);
      eg.addColorStop(0,'transparent'); eg.addColorStop(.07,pal.ecgF);
      eg.addColorStop(.55,pal.ecg);   eg.addColorStop(1,pal.ecg);
      ctx.strokeStyle=eg; ctx.lineWidth=1.0; ctx.shadowColor=pal.ecg; ctx.shadowBlur=8; ctx.stroke();
      // left baseline
      ctx.beginPath(); ctx.moveTo(0,eyBase); ctx.lineTo(eX0,eyBase);
      var lg=ctx.createLinearGradient(0,0,eX0,0); lg.addColorStop(0,'transparent'); lg.addColorStop(1,pal.ecgF);
      ctx.strokeStyle=lg; ctx.lineWidth=1; ctx.shadowBlur=0; ctx.stroke();
      // right baseline
      ctx.beginPath(); ctx.moveTo(eX1,eyBase); ctx.lineTo(W,eyBase);
      var rgg=ctx.createLinearGradient(eX1,0,W,0); rgg.addColorStop(0,pal.ecgF); rgg.addColorStop(1,'transparent');
      ctx.strokeStyle=rgg; ctx.stroke();
      ctx.restore();

      // Circle
      var R=_pfCircleR>10 ? _pfCircleR : Math.min(W,H)*.18;
      var circY=cy-H*.05;
      ctx.save(); ctx.translate(cx,circY); ctx.scale(1+bp, 1+bp);
      var gl=ctx.createRadialGradient(0,0,R*.6,0,0,R*1.28);
      gl.addColorStop(0,pal.glow); gl.addColorStop(1,'transparent');
      ctx.fillStyle=gl; ctx.beginPath(); ctx.arc(0,0,R*1.28,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(0,0,R,0,Math.PI*2);
      ctx.strokeStyle=pal.arcBg; ctx.lineWidth=2.5; ctx.shadowBlur=0; ctx.stroke();
      var progFrac=timerDuration>0?Math.max(0,stretchTime/timerDuration):1;
      ctx.beginPath(); ctx.arc(0,0,R,-Math.PI/2,-Math.PI/2+progFrac*Math.PI*2);
      ctx.strokeStyle=pal.arc; ctx.lineWidth=2.5; ctx.lineCap='round';
      ctx.shadowColor=pal.glowS; ctx.shadowBlur=18; ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,R*.84,0,Math.PI*2);
      ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=.7; ctx.shadowBlur=0; ctx.stroke();
      ctx.restore();

      _pfAnimId=requestAnimationFrame(_pfFrame);
    }

    function enterPureFocus() {
      var ov=document.getElementById('pf-overlay'); if(!ov) return;
      _pfCanvas=document.getElementById('pf-cv'); _pfCtx=_pfCanvas.getContext('2d');
      _pfCanvas.width=window.innerWidth; _pfCanvas.height=window.innerHeight;
      _pfLastST=-999; _pfBeat=0; _pfSpike=0; _pfSpikePh=0; _pfRunning=true;
      _pfMkParts(); _pfMkEcg();
      ov.classList.add('show');
      // Measure text bounding box to size circle — wait one frame for layout
      setTimeout(function(){
        var tw=document.getElementById('pf-time-wrap');
        if(tw){ var b=tw.getBoundingClientRect(); _pfCircleR=Math.sqrt(Math.pow(b.width/2,2)+Math.pow(b.height/2,2))*1.30; }
      }, 60);
      window._pfRsz=function(){
        _pfCanvas.width=window.innerWidth; _pfCanvas.height=window.innerHeight; _pfMkParts(); _pfMkEcg();
        var tw=document.getElementById('pf-time-wrap');
        if(tw){ var b=tw.getBoundingClientRect(); _pfCircleR=Math.sqrt(Math.pow(b.width/2,2)+Math.pow(b.height/2,2))*1.30; }
      };
      window.addEventListener('resize',window._pfRsz);
      _pfAnimId=requestAnimationFrame(_pfFrame);
    }
    function exitPureFocus() {
      _pfRunning=false; cancelAnimationFrame(_pfAnimId);
      var ov=document.getElementById('pf-overlay'); if(ov) ov.classList.remove('show');
      window.removeEventListener('resize',window._pfRsz);
    }
    document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&_pfRunning) exitPureFocus(); });

