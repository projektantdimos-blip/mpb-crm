/* МПБ CRM v2 — этап 2б: «Команда» (внутренние чаты и «Срочное»), «Журнал изменений», «Личный кабинет».
   Работает через мост (crm.js, MPBC). */
(function () {
  "use strict";
  var C = window.MPBC, T = window.MPBT = {};
  function $(id) { return document.getElementById(id); }
  function E(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ic(n) { return window.icon ? window.icon(n) : ""; }
  function cur() { return window.sectionForHash ? sectionForHash(location.hash) : ""; }
  function p2(n) { return n < 10 ? "0" + n : "" + n; }
  var PALETTE = ["#3a86d6", "#2fa66a", "#ee9264", "#8b6fe0", "#1fb3b3", "#e0a21c", "#d8453a", "#6f6fe0"];
  function color(name) {
    if (window.PERSON_COLOR && PERSON_COLOR[name] && PERSON_COLOR[name].charAt(0) === "#") return PERSON_COLOR[name];
    var h = 0; String(name).split("").forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return PALETTE[h % PALETTE.length];
  }
  var PPL = {};                                                  // имя -> {title, photo}: загружается после входа
  function ava(name, cls) {
    var p = PPL[String(name).toLowerCase()];
    if (p && p.photo) return '<span class="x-ava ' + (cls || "") + '" style="background-image:url(' + p.photo + ');background-size:cover;background-position:center"></span>';
    return '<span class="x-ava ' + (cls || "") + '" style="background:' + color(name) + '">' + E(String(name).charAt(0)) + "</span>";
  }
  function loadPeople() {
    return C.call("/people").then(function (l) { PPL = {}; l.forEach(function (x) { PPL[x.name.toLowerCase()] = x; }); T.people = l; }).catch(function () {});
  }
  function head(title, sub, extra) { return '<header class="top"><div class="brand"><div><h1>' + title + "</h1><p>" + sub + "</p></div></div>" + (extra || "") + "</header>"; }
  function toast(msg, undo) {
    var t = $("xToast"); if (!t) { t = document.createElement("div"); t.id = "xToast"; t.className = "x-toast"; document.body.appendChild(t); }
    t.innerHTML = "<span></span>"; t.firstChild.textContent = String(msg == null ? "" : msg); t.className = "x-toast on"; clearTimeout(toast.h); toast.h = setTimeout(function () { t.className = "x-toast"; }, 3200);
  }
  function when(ts) {
    var d = new Date(ts * 1000), n = new Date();
    if (d.toDateString() === n.toDateString()) return p2(d.getHours()) + ":" + p2(d.getMinutes());
    return p2(d.getDate()) + "." + p2(d.getMonth() + 1) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
  }
  function dayLabel(ts) {
    var d = new Date(ts * 1000), n = new Date(), y = new Date(); y.setDate(n.getDate() - 1);
    return d.toDateString() === n.toDateString() ? "Сегодня" : d.toDateString() === y.toDateString() ? "Вчера" : p2(d.getDate()) + "." + p2(d.getMonth() + 1) + "." + d.getFullYear();
  }
  function xmodal(html, wide) {
    var v = $("xModalVeil"); if (!v) { v = document.createElement("div"); v.id = "xModalVeil"; v.className = "x-mveil"; document.body.appendChild(v); }
    v.className = "x-mveil on"; v.innerHTML = '<div class="x-modal' + (wide ? " wide" : "") + '">' + html + "</div>";
    v.onclick = function (e) { if (e.target === v) T.closeModal(); };
    return v;
  }
  T.closeModal = function () { var v = $("xModalVeil"); if (v) { v.className = "x-mveil"; v.innerHTML = ""; } };

  /* экран-заглушка, если мост не подключён или вход не выполнен */
  function gate(el, title, sub, render) {
    if (!C.configured()) {
      el.innerHTML = head(title, sub) + '<div class="wrap"><div class="x-panel x-gate"><div class="big">' + ic("chat") + '</div><h3>Мост не подключён</h3><p>Раздел работает через сервер-мост. Адрес и ключ моста вводятся в настройках (⚙) — те же, что для «Общения».</p><button class="x-btn primary" id="xOpenCfg">Открыть настройки</button></div></div>';
      $("xOpenCfg").onclick = function () { if (window.openApiSettings) openApiSettings(); };
      return false;
    }
    if (!C.loggedIn()) {
      el.innerHTML = head(title, sub) + '<div class="wrap"><div class="x-panel x-gate"><div class="big">' + ic("user") + '</div><h3>Нужно войти</h3><p>Выберите себя из списка и введите PIN — тогда здесь появятся ваши чаты, напоминания и настройки.</p><button class="x-btn primary" id="xDoLogin">Войти</button></div></div>';
      $("xDoLogin").onclick = function () { C.requireLogin().then(function () { render(); }, function () {}); };
      return false;
    }
    return true;
  }

  /* ================================================================
     КОМАНДА
     ================================================================ */
  var S = { rooms: [], cur: "general", msgs: [], lastId: 0, urg: false, tick: 0, timer: null, users: [] };
  var ROOM_IC = { general: "hash", buy: "wallet", calc: "calc", kp: "file", accounting: "briefcase" };

  function renderTeam() {
    var el = $("team-app"), sub = "Внутренние чаты МПБ: общие вопросы, закупки, расчёты, КП, бухгалтерия и отдельный диалог по каждой задаче";
    if (!gate(el, "Команда", sub, renderTeam)) { stopTimer(); return; }
    var q = /[?&]room=([^&]+)/.exec(location.hash); S.deep = !!q; if (q) S.cur = decodeURIComponent(q[1]);
    el.innerHTML = head("Команда", sub, '<div class="x-chips"><span class="x-chip on" id="tUrgChip">' + ic("flame") + 'Срочное <b id="tUrgN">0</b></span></div>')
      + '<div class="wrap"><div class="x-chat"><div class="x-dlgs"><div class="x-tabs" id="tTabs"></div><div class="hd"><button class="x-btn primary" id="tTopic" style="justify-content:center">' + ic("plus") + 'Новый чат</button><button class="x-btn ghost" id="tNew" style="justify-content:center">' + ic("tasks") + 'Диалог по задаче</button></div><div class="sc" id="tRooms"></div></div><div class="x-thread" id="tThread"></div><div class="x-info" id="tInfo"></div></div></div>';
    $("tNew").onclick = newTaskRoom;
    $("tTopic").onclick = topicDialog;
    if (C.me && C.me.role === "engineer") el.querySelector(".x-dlgs .hd").style.display = "none";   // инженер ТО — только свой чат
    $("tUrgChip").onclick = function () { var r = S.rooms.filter(function (x) { return x.urgent_open > 0; })[0]; if (r) openRoom(r.id); };
    loadRooms().then(function () { if (!S.rooms.some(function (r) { return r.id === S.cur; })) S.cur = S.rooms.some(function (r) { return r.id === "general"; }) ? "general" : ((S.rooms[0] || {}).id || "general"); openRoom(S.cur, true); }).catch(function (e) { $("tThread").innerHTML = '<div class="x-empty" style="padding:40px">' + E(e) + "</div>"; });
    C.call("/auth/users", { auth: false }).then(function (n) { S.users = n; paintInfo(); }).catch(function () {});
    startTimer();
  }
  function stopTimer() { if (S.timer) { clearInterval(S.timer); S.timer = null; } }
  function startTimer() {
    stopTimer();
    S.timer = setInterval(function () {
      if (cur() !== "team") { stopTimer(); return; }
      if (document.hidden || !C.loggedIn()) return;
      S.tick++;
      C.call("/team/rooms/" + encodeURIComponent(S.cur) + "/messages?after=" + S.lastId).then(function (ms) {
        if (ms.length) { mergeMsgs(ms); paintThread(true); C.call("/team/rooms/" + encodeURIComponent(S.cur) + "/read", { body: {} }).then(function () { return loadRooms(); }); }
        else if (S.tick % 4 === 0) loadRooms();
        return C.call("/team/rooms/" + encodeURIComponent(S.cur) + "/reactions");
      }).then(function (rx) {
        if (!rx) return;
        var changed = false;
        S.msgs.forEach(function (m) { var n = rx[String(m.id)] || [], a = JSON.stringify(m.reactions || []), b = JSON.stringify(n); if (a !== b) { m.reactions = n; changed = true; } });
        if (changed) paintThread(true);
        return loadAiTasks();
      }).catch(function () {});
    }, 4000);
  }
  /* ИИ: подсказки «Поручение» под сообщениями (мост ищет их в фоне после отправки) */
  S.aiTasks = {};
  function loadAiTasks() {
    var rid = S.cur, room = S.rooms.filter(function (r) { return r.id === rid; })[0];
    if (S.aiOff || (room && room.kind === "ai")) return Promise.resolve();
    return C.call("/ai/team/" + encodeURIComponent(rid) + "/tasks").then(function (t) {
      if (S.cur !== rid) return;
      if (JSON.stringify(t || {}) !== JSON.stringify(S.aiTasks)) { S.aiTasks = t || {}; paintThread(true); }
    }, function (e) { if (String(e).indexOf("обновления сервера") >= 0 || /404|Not Found/.test(String(e))) S.aiOff = true; });
  }
  function aiTaskHtml(m) {
    var t = S.aiTasks[String(m.id)]; if (!t) return "";
    var due = t.due ? " · до " + t.due.slice(8, 10) + "." + t.due.slice(5, 7) + (t.tm ? " " + t.tm : "") : "";
    if (t.status === "done") return '<div class="x-aitask done">' + ic("check") + "<span>Напоминание создано: <b>" + E(t.assignee) + "</b> — " + E(t.title) + due + "</span></div>";
    var can = C.me && (C.me.role === "admin" || C.me.id === t.author_id || C.me.id === t.assignee_id);
    return '<div class="x-aitask">' + ic("zap") + "<span>Поручение: <b>" + E(t.assignee) + "</b> — " + E(t.title) + due + "</span>"
      + (can ? '<button type="button" data-aiok="' + m.id + '">Напомнить</button><button type="button" class="x" data-aino="' + m.id + '" title="Это не поручение" aria-label="Скрыть">×</button>' : "") + "</div>";
  }
  function wireAiTasks(el) {
    el.querySelectorAll("[data-aiok]").forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation(); b.disabled = true;
        C.call("/ai/team/task/" + b.dataset.aiok + "/accept", { body: {} }).then(function (t) { S.aiTasks[String(t.msg_id)] = t; paintThread(true); toast("Напоминание создано: " + t.assignee + " увидит его в «Мои задачи»"); })
          .catch(function (er) { b.disabled = false; toast(String(er)); });
      };
    });
    el.querySelectorAll("[data-aino]").forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        C.call("/ai/team/task/" + b.dataset.aino + "/dismiss", { body: {} }).then(function () { delete S.aiTasks[b.dataset.aino]; paintThread(true); }).catch(function (er) { toast(String(er)); });
      };
    });
  }
  /* ИИ: «Кратко: что решили» по чату */
  function summaryDialog(room) {
    var days = 7;
    xmodal('<h3>' + ic("zap") + ' Кратко: что решили</h3><p class="x-sub">«' + E(room.name) + '» — ИИ читает переписку и выделяет решения, поручения и повисшие вопросы</p>'
      + '<div class="x-seg" id="smDays">' + [[1, "Сутки"], [3, "3 дня"], [7, "Неделя"], [30, "Месяц"]].map(function (d) { return '<button type="button" data-d="' + d[0] + '" class="' + (d[0] === days ? "on" : "") + '">' + d[1] + "</button>"; }).join("") + "</div>"
      + '<div id="smBody" class="x-aisum"><div class="x-empty">Загрузка…</div></div><div class="x-err" id="smErr"></div>'
      + '<div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Закрыть</button><button class="x-btn primary" id="smGo">' + ic("zap") + "Составить</button></div>", true);
    function paint(n) {
      var b = $("smBody"); if (!b) return;
      if (!n) { b.innerHTML = '<p class="x-sub">Сводки пока не было. Выберите период и нажмите «Составить».</p>'; return; }
      var d = n.data, at = new Date(n.ts * 1000);
      var li = function (a) { return a.length ? "<ul>" + a.map(function (x) { return "<li>" + E(x) + "</li>"; }).join("") + "</ul>" : '<p class="x-sub">—</p>'; };
      b.innerHTML = '<p class="meta">' + E(n.by) + " · " + p2(at.getDate()) + "." + p2(at.getMonth() + 1) + " " + p2(at.getHours()) + ":" + p2(at.getMinutes()) + " · за " + d.days + " дн., сообщений: " + d.count
        + (n.new_since ? ' · <b>после сводки ещё ' + n.new_since + "</b>" : "") + "</p>"
        + "<p>" + E(d.summary) + "</p><h6>Решили</h6>" + li(d.decisions)
        + "<h6>Поручения</h6>" + (d.tasks.length ? d.tasks.map(function (t, i) { return '<div class="x-aitrow"><span><b>' + E(t.who || "—") + "</b> — " + E(t.what) + (t.due ? " · " + E(t.due) : "") + "</span>" + (t.user_id ? '<button type="button" class="x-btn ghost" data-rm="' + i + '">Напомнить</button>' : "") + "</div>"; }).join("") : '<p class="x-sub">—</p>')
        + "<h6>Без ответа</h6>" + li(d.open);
      b.querySelectorAll("[data-rm]").forEach(function (x) {
        x.onclick = function () {
          var t = d.tasks[+x.dataset.rm]; x.disabled = true;
          C.call("/ai/team/" + encodeURIComponent(room.id) + "/remind", { body: { user_id: t.user_id, what: t.what, due: "" } }).then(function () { x.textContent = "✓ Создано"; toast("Напоминание создано: " + t.who); })
            .catch(function (e) { x.disabled = false; toast(String(e)); });
        };
      });
    }
    C.call("/ai/team/" + encodeURIComponent(room.id) + "/summary").then(function (r) {
      if (!r.configured) { $("smBody").innerHTML = '<p class="x-sub">ИИ не подключён на мосте (YANDEX_API_KEY).</p>'; $("smGo").disabled = true; return; }
      if (r.note) { days = r.note.data.days || 7; $("smDays").querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", +x.dataset.d === days); }); }
      paint(r.note);
    }).catch(function (e) { $("smBody").innerHTML = '<p class="x-sub">' + E(e) + "</p>"; });
    $("smDays").querySelectorAll("button").forEach(function (x) { x.onclick = function () { days = +x.dataset.d; $("smDays").querySelectorAll("button").forEach(function (y) { y.classList.toggle("on", y === x); }); }; });
    $("smGo").onclick = function () {
      var go = this; go.disabled = true; go.textContent = "ИИ читает чат…"; $("smErr").textContent = "";
      C.call("/ai/team/" + encodeURIComponent(room.id) + "/summary", { body: { days: days } }).then(function (r) { paint(r.note); })
        .catch(function (e) { $("smErr").textContent = String(e); })
        .then(function () { go.disabled = false; go.innerHTML = ic("zap") + "Обновить"; });
    };
  }
  function loadRooms() {
    return C.call("/team/rooms").then(function (rs) { S.rooms = rs; paintRooms(); });
  }
  /* ---------- картинки чатов: значок + цвет или своё фото ---------- */
  var ICON_SET = ["hash", "team", "wallet", "calc", "file", "briefcase", "tasks", "flame", "chat", "wrench", "zap", "layers"];
  var COLORS = ["#378ADD", "#1D9E75", "#7F77DD", "#BA7517", "#D4537E", "#D85A30", "#0F6E56", "#5F5E5A"];
  var DEF_COLOR = { general: "#378ADD", buy: "#BA7517", calc: "#D4537E", kp: "#7F77DD", accounting: "#1D9E75" };
  S.photos = {};
  function roomIcon(r) { return r.icon || (r.kind === "task" ? "tasks" : (ROOM_IC[r.id] || "hash")); }
  function roomColor(r) { return r.color || (r.kind === "task" ? "#7F77DD" : (DEF_COLOR[r.id] || "#378ADD")); }
  function photoUrl(r) {
    if (!r.photo_ts) return "";
    var k = r.id + "@" + r.photo_ts, u = S.photos[k];
    if (u && u !== "pending") return u;
    if (!u) {
      S.photos[k] = "pending";
      C.blob("/team/rooms/" + encodeURIComponent(r.id) + "/photo").then(function (b) { S.photos[k] = URL.createObjectURL(b); paintRooms(); if (S.cur === r.id) paintThread(true); }).catch(function () { delete S.photos[k]; });
    }
    return "";
  }
  function roomAv(r, cls) {
    var url = photoUrl(r);
    return '<span class="x-rm ' + (cls || "") + (url ? " ph" : "") + '" style="background-color:' + roomColor(r) + (url ? ";background-image:url(" + url + ")" : "") + '">' + (url ? "" : ic(roomIcon(r))) + "</span>";
  }
  function roomItem(r) {
    var hasU = r.urgent_open > 0, last = r.last, ai = r.kind === "ai";
    return '<div class="x-dlg ' + (r.id === S.cur ? "on " : "") + (ai ? "ai" : "") + '" data-r="' + E(r.id) + '">' + roomAv(r, r.kind === "task" ? "task" : ai ? "ai" : "") + '<div class="m"><b>' + E(r.name) + (ai ? '<span class="x-aitag">ИИ</span>' : "") + (hasU ? '<span class="x-flame">' + ic("flame") + "</span>" : "") + "</b><span>" + (last ? E(last.user) + ": " + E(last.text) : E(r.descr)) + '</span></div><div class="tm">' + (last ? when(last.ts) : "") + "<br>" + (r.unread ? '<span class="x-un ' + (hasU ? "red" : "") + '">' + r.unread + "</span>" : "") + "</div></div>";
  }
  function paintRooms() {
    var el = $("tRooms"); if (!el) return;
    el.setAttribute("data-ptr", "team"); window.__ptr = window.__ptr || {}; window.__ptr.team = function () { return loadRooms(); };
    var urg = S.rooms.filter(function (r) { return r.urgent_open > 0; }), n = urg.reduce(function (a, r) { return a + r.urgent_open; }, 0);
    if ($("tUrgN")) $("tUrgN").textContent = n;
    var aiRooms = S.rooms.filter(function (r) { return r.kind === "ai"; });
    el.innerHTML = (aiRooms.length ? '<div class="x-grp ai">' + ic("zap") + "ИИ-помощник</div>" + aiRooms.map(roomItem).join("") : "") + (urg.length ? '<div class="x-grp red">' + ic("flame") + "Срочное</div>" + urg.map(function (r) { return '<div class="x-dlg" data-r="' + E(r.id) + '"><span data-i="!" class="x-rm red">' + ic("flame") + '</span><div class="m"><b>' + E(r.name) + "</b><span>" + E(r.last ? r.last.user + ": " + r.last.text : "") + "</span></div></div>"; }).join("") : "")
      + (S.tab === "task" ? "" : '<div class="x-grp">Каналы</div>' + S.rooms.filter(function (r) { return r.kind === "chan"; }).map(roomItem).join(""))
      + (S.tab === "chan" ? "" : '<div class="x-grp">Диалоги по задачам</div>' + (S.rooms.filter(function (r) { return r.kind === "task"; }).map(roomItem).join("") || '<p class="x-empty" style="padding:14px">Пока нет. Нажмите «Диалог по задаче» или «Обсуждение» в карточке задачи</p>'));
    var tb = $("tTabs");
    if (tb) {
      tb.innerHTML = [["all", "Все"], ["chan", "Каналы"], ["task", "Задачи"]].map(function (t) { return '<button type="button" data-t="' + t[0] + '" class="' + ((S.tab || "all") === t[0] ? "on" : "") + '">' + t[1] + "</button>"; }).join("");
      tb.querySelectorAll("button").forEach(function (b) { b.onclick = function () { S.tab = b.dataset.t; paintRooms(); }; });
    }
    el.querySelectorAll(".x-dlg").forEach(function (d) { d.onclick = function () { openRoom(d.dataset.r); }; });
    if (C.sync) { /* бейдж меню обновится при следующем опросе */ }
  }
  function openRoom(id, first) {
    S.cur = id; S.msgs = []; S.lastId = 0; S.urg = false; S.reply = null; closePop();
    var chatBox = document.querySelector(".x-chat");
    if (chatBox) { if (first && !S.deep) chatBox.classList.remove("room-open"); else chatBox.classList.add("room-open"); }
    if (!first) { try { history.replaceState(null, "", "#/team?room=" + encodeURIComponent(id)); } catch (e) {} }
    paintRooms();
    $("tThread").innerHTML = '<div class="x-empty" style="padding:40px">Загрузка…</div>';
    return C.call("/team/rooms/" + encodeURIComponent(id) + "/messages").then(function (ms) {
      S.msgs = ms; S.lastId = ms.length ? ms[ms.length - 1].id : 0; S.aiTasks = {}; paintThread(); paintInfo(); loadAiTasks();
      return C.call("/team/rooms/" + encodeURIComponent(id) + "/read", { body: {} }).then(loadRooms).then(function () { C.refresh(); });
    }).catch(function (e) { $("tThread").innerHTML = '<div class="x-empty" style="padding:40px">' + E(e) + "</div>"; });
  }
  function fsize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + " МБ" : Math.max(1, Math.round(n / 1024)) + " КБ"; }
  S.files = [];
  function addFiles(list) {
    var msg = "";
    Array.prototype.forEach.call(list || [], function (f) {
      var sum = S.files.reduce(function (a, x) { return a + x.size; }, 0);
      if (!f.size) msg = "Файл «" + f.name + "» пустой";
      else if (f.size > 10485760) msg = "Файл «" + f.name + "» больше 10 МБ";
      else if (S.files.length >= 10) msg = "Не больше 10 файлов за раз";
      else if (sum + f.size > 26214400) msg = "Файлы вместе больше 25 МБ";
      else S.files.push(f);
    });
    if (msg) toast(msg);
    paintFiles();
  }
  function paintFiles() {
    var b = $("tFiles"); if (!b) return;
    b.hidden = !S.files.length;
    b.innerHTML = S.files.map(function (f, i) { return '<span class="x-fchip">' + ic("file") + '<span class="fn">' + E(f.name) + "</span><small>" + fsize(f.size) + '</small><button type="button" data-x="' + i + '" title="Убрать">×</button></span>'; }).join("");
    Array.prototype.forEach.call(b.querySelectorAll("[data-x]"), function (x) { x.onclick = function () { S.files.splice(+x.dataset.x, 1); paintFiles(); }; });
  }
  function readB64(f) {
    return new Promise(function (ok, bad) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result || ""); ok(s.slice(s.indexOf(",") + 1)); };
      r.onerror = function () { bad("Не удалось прочитать файл"); };
      r.readAsDataURL(f);
    });
  }
  /* ---------- новый чат на свободную тему ---------- */
  function topicDialog() {
    var sel = { icon: "chat", color: COLORS[0] };
    xmodal('<h3>Новый чат</h3><p class="x-sub">Чат на любую тему: его увидят все сотрудники</p>'
      + '<div class="x-stprev" id="tpPrev"></div>'
      + '<div class="x-field"><label>Название</label><input type="text" id="tpName" maxlength="80" placeholder="Например: Охрана труда"></div>'
      + '<div class="x-field"><label>Описание <small>(необязательно)</small></label><input type="text" id="tpDescr" maxlength="200" placeholder="О чём этот чат"></div>'
      + '<div class="x-field"><label>Значок</label><div class="x-stgrid" id="stIcons"></div></div>'
      + '<div class="x-field"><label>Цвет</label><div class="x-stcols" id="stCols"></div></div>'
      + '<div class="x-err" id="tpErr"></div><div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button><button class="x-btn primary" id="tpGo">Создать</button></div>');
    function paint() {
      $("tpPrev").innerHTML = '<span class="x-rm big" style="background-color:' + sel.color + '">' + ic(sel.icon) + "</span>";
      $("stIcons").innerHTML = ICON_SET.map(function (n) { return '<button type="button" class="' + (n === sel.icon ? "on" : "") + '" data-i="' + n + '">' + ic(n) + "</button>"; }).join("");
      $("stCols").innerHTML = COLORS.map(function (c) { return '<button type="button" class="' + (c === sel.color ? "on" : "") + '" data-c="' + c + '" style="background:' + c + '"></button>'; }).join("");
      $("stIcons").querySelectorAll("button").forEach(function (b) { b.onclick = function () { sel.icon = b.dataset.i; paint(); }; });
      $("stCols").querySelectorAll("button").forEach(function (b) { b.onclick = function () { sel.color = b.dataset.c; paint(); }; });
    }
    paint();
    $("tpName").focus();
    $("tpGo").onclick = function () {
      var name = $("tpName").value.trim(); if (!name) { $("tpErr").textContent = "Введите название чата"; return; }
      $("tpGo").disabled = true;
      C.call("/team/rooms/topic", { body: { name: name, descr: $("tpDescr").value.trim(), icon: sel.icon, color: sel.color } }).then(function (r) {
        T.closeModal(); S.tab = "all"; return loadRooms().then(function () { openRoom(r.id); });
      }).catch(function (e) { $("tpErr").textContent = E(e); $("tpGo").disabled = false; });
    };
  }

  /* ---------- окно «Картинка чата» (руководитель) ---------- */
  function styleDialog(room) {
    var sel = { icon: roomIcon(room), color: roomColor(room), photo: null, drop: false };
    var v = xmodal('<h3>Картинка чата</h3><p class="x-sub">' + E(room.name) + '</p><div class="x-stprev" id="stPrev"></div>'
      + '<div class="x-field"><label>Значок</label><div class="x-stgrid" id="stIcons"></div></div>'
      + '<div class="x-field"><label>Цвет</label><div class="x-stcols" id="stCols"></div></div>'
      + '<div class="x-field"><label>Или своё фото</label><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="x-btn ghost" id="stPick">Загрузить фото</button><button type="button" class="x-btn ghost" id="stDrop">Убрать фото</button><input type="file" id="stFile" accept="image/*" hidden></div></div>'
      + '<div class="x-err" id="stErr"></div><div class="x-row">' + (room.id.indexOf("c_") === 0 ? '<button class="x-btn ghost" id="stDel" style="margin-right:auto;color:var(--bad)">Удалить чат</button>' : "") + '<button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button><button class="x-btn primary" id="stSave">Сохранить</button></div>');
    if ($("stDel")) $("stDel").onclick = function () {
      if (!confirm("Удалить чат «" + room.name + "» вместе со всей перепиской и файлами? Это нельзя отменить.")) return;
      C.call("/team/rooms/" + encodeURIComponent(room.id) + "/delete", { body: {} }).then(function () { T.closeModal(); S.cur = "general"; return loadRooms(); }).then(function () { openRoom("general"); }).catch(function (e) { $("stErr").textContent = E(e); });
    };
    function paint() {
      var photo = sel.photo ? 'background-image:url(' + sel.photo.url + ')' : (!sel.drop && room.photo_ts && photoUrl(room) ? 'background-image:url(' + photoUrl(room) + ')' : "");
      $("stPrev").innerHTML = '<span class="x-rm big' + (photo ? " ph" : "") + '" style="background-color:' + sel.color + ';' + photo + '">' + (photo ? "" : ic(sel.icon)) + "</span>";
      $("stIcons").innerHTML = ICON_SET.map(function (n) { return '<button type="button" class="' + (n === sel.icon && !photo ? "on" : "") + '" data-i="' + n + '">' + ic(n) + "</button>"; }).join("");
      $("stCols").innerHTML = COLORS.map(function (c) { return '<button type="button" class="' + (c === sel.color ? "on" : "") + '" data-c="' + c + '" style="background:' + c + '"></button>'; }).join("");
      $("stIcons").querySelectorAll("button").forEach(function (b) { b.onclick = function () { sel.icon = b.dataset.i; sel.photo = null; sel.drop = true; paint(); }; });
      $("stCols").querySelectorAll("button").forEach(function (b) { b.onclick = function () { sel.color = b.dataset.c; paint(); }; });
    }
    paint();
    $("stPick").onclick = function () { $("stFile").click(); };
    $("stDrop").onclick = function () { sel.photo = null; sel.drop = true; paint(); };
    $("stFile").onchange = function () {
      var f = this.files[0]; if (!f) return;
      var url = URL.createObjectURL(f), img = new Image();
      img.onload = function () {
        var s = Math.min(img.width, img.height), cv = document.createElement("canvas"); cv.width = cv.height = 192;
        cv.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 192, 192);
        URL.revokeObjectURL(url);
        cv.toBlob(function (blob) { sel.photo = { blob: blob, url: URL.createObjectURL(blob) }; sel.drop = false; paint(); }, "image/jpeg", 0.85);
      };
      img.onerror = function () { $("stErr").textContent = "Не удалось прочитать картинку"; };
      img.src = url;
    };
    $("stSave").onclick = function () {
      $("stSave").disabled = true;
      var steps = C.call("/team/rooms/" + encodeURIComponent(room.id) + "/style", { body: { icon: sel.icon, color: sel.color } });
      steps = steps.then(function () {
        if (sel.photo) return b64Blob(sel.photo.blob).then(function (d) { return C.call("/team/rooms/" + encodeURIComponent(room.id) + "/photo", { body: { data: d } }); });
        if (sel.drop && room.photo_ts) return C.call("/team/rooms/" + encodeURIComponent(room.id) + "/photo/delete", { body: {} });
      });
      steps.then(function () { T.closeModal(); return loadRooms(); }).then(function () { paintThread(true); }).catch(function (e) { $("stErr").textContent = E(e); $("stSave").disabled = false; });
    };
  }
  function b64Blob(blob) {
    return new Promise(function (ok, bad) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(",")[1]); }; r.onerror = bad; r.readAsDataURL(blob); });
  }

  /* ---------- вложения: фото показываем целиком, документы — с типом, именем и размером ---------- */
  var DOC_KIND = { pdf: ["PDF", "#d64545"], doc: ["DOC", "#2b6cb0"], docx: ["DOC", "#2b6cb0"], xls: ["XLS", "#1d8a4e"], xlsx: ["XLS", "#1d8a4e"], csv: ["CSV", "#1d8a4e"], ppt: ["PPT", "#d9822b"], pptx: ["PPT", "#d9822b"], zip: ["ZIP", "#7f77dd"], rar: ["RAR", "#7f77dd"], "7z": ["7Z", "#7f77dd"], txt: ["TXT", "#5f5e5a"], dwg: ["DWG", "#0f6e56"], dxf: ["DXF", "#0f6e56"] };
  function fileExt(n) { var m = /\.([A-Za-z0-9]{1,5})$/.exec(n || ""); return m ? m[1].toLowerCase() : ""; }
  function fileHtml(f) {
    if (/^image\/(png|jpe?g|gif|webp)$/i.test(f.mime || "")) {
      return '<button type="button" class="x-img" data-timg="' + f.id + '" data-name="' + E(f.name) + '" title="' + E(f.name) + '"><img alt="' + E(f.name) + '"><span class="ld">Загрузка фото…</span></button>';
    }
    var k = DOC_KIND[fileExt(f.name)] || [(fileExt(f.name) || "ФАЙЛ").toUpperCase().slice(0, 4), "#5f5e5a"];
    return '<button type="button" class="x-file doc" data-tf="' + f.id + '" data-name="' + E(f.name) + '"><span class="dk" style="background:' + k[1] + '">' + E(k[0]) + '</span><span class="dn"><b>' + E(f.name) + "</b><small>" + k[0] + " · " + fsize(f.size) + "</small></span></button>";
  }
  S.imgc = {};
  function loadImages(el) {
    el.querySelectorAll("[data-timg]").forEach(function (b) {
      var id = b.dataset.timg, img = b.querySelector("img");
      function put(url) { img.src = url; b.classList.add("ok"); }
      if (S.imgc[id] && S.imgc[id] !== "pending") { put(S.imgc[id]); return; }
      if (S.imgc[id] === "pending") return;
      S.imgc[id] = "pending";
      C.blob("/team/files/" + id).then(function (bl) { S.imgc[id] = URL.createObjectURL(bl); var cur = document.querySelector('[data-timg="' + id + '"]'); if (cur) { var im = cur.querySelector("img"); im.src = S.imgc[id]; cur.classList.add("ok"); } })
        .catch(function () { delete S.imgc[id]; b.querySelector(".ld").textContent = "Фото не загрузилось"; });
      b.onclick = function () { };
    });
    el.querySelectorAll("[data-timg]").forEach(function (b) { b.onclick = function () { var u = S.imgc[b.dataset.timg]; if (u && u !== "pending") lightbox(u, b.dataset.name); }; });
  }
  function lightbox(url, name) {
    var v = document.createElement("div"); v.className = "x-lbox";
    v.innerHTML = '<div class="bar"><span>' + E(name || "") + '</span><a href="' + url + '" download="' + E(name || "photo") + '">Скачать</a><button type="button" aria-label="Закрыть">×</button></div><img src="' + url + '" alt="">';
    v.onclick = function (e) { if (e.target === v || e.target.tagName === "BUTTON") v.remove(); };
    document.body.appendChild(v);
  }

  function botAva() { return '<span class="x-ava sm bot">' + ic("zap") + "</span>"; }
  function msgHtml(m) {
    var bot = m.user_id === -1, aiRoom = /^kpai_/.test(S.cur);
    var me = !bot && C.me && m.user === C.me.name, mine = m.acks && C.me && m.acks.indexOf(C.me.name) >= 0, files = m.files || [];
    var rx = (m.reactions || []).map(function (x) {
      var on = C.me && x.users.indexOf(C.me.name) >= 0;
      return '<button type="button" class="x-rxc' + (on ? " on" : "") + '" data-rx="' + E(x.e) + '" data-m="' + m.id + '" title="' + E(x.users.join(", ")) + '">' + x.e + " <b>" + x.n + "</b></button>";
    }).join("");
    return '<div class="x-msg ' + (m.urgent ? "urg " : "") + (me ? "me" : "") + (bot ? "bot" : "") + '" data-mid="' + m.id + '">' + (bot ? botAva() : ava(m.user, "sm")) + '<div class="bd"><div class="nm">' + E(m.user) + "<small>" + when(m.ts) + '</small>'
      + '<button type="button" class="x-act" data-pop="' + m.id + '" title="Реакция или ответ" aria-label="Реакция или ответ">' + ic("smile") + "</button>"
      + ((me || aiRoom || (C.me && C.me.role === "admin")) && m.user_id ? '<button type="button" class="x-del" data-del="' + m.id + '" title="Удалить сообщение" aria-label="Удалить">' + ic("trash") + "</button>" : "") + '</div>'
      + (m.reply ? '<div class="x-quote" data-go="' + m.reply.id + '"><b>' + E(m.reply.user) + "</b><span>" + E(m.reply.text) + "</span></div>" : "")
      + '<div class="tx" data-pop="' + m.id + '">'
      + (m.urgent ? '<div class="x-urgtag">' + ic("flame") + "Срочное</div>" : "") + ((files.length && m.text.indexOf("Файлы: ") === 0) ? "" : E(m.text))
      + (files.length ? '<div class="x-files">' + files.map(fileHtml).join("") + "</div>" : "") + "</div>"
      + aiTaskHtml(m)
      + (rx ?'<div class="x-rx">' + rx + "</div>" : "")
      + (m.urgent ? '<div class="x-ack">' + ic("check") + (m.acks.length ? "Прочитали: " + E(m.acks.join(", ")) : "Пока никто не подтвердил") + (!me && !mine ? '<button data-ack="' + m.id + '">Прочитал(а)</button>' : "") + "</div>" : "") + "</div></div>";
  }

  /* ---------- ответ на сообщение, реакции, меню сообщения ---------- */
  S.pool = ["👍", "❤️", "🔥", "😂", "👀", "✅", "🙏"];
  S.reply = null;
  function findMsg(id) { for (var i = 0; i < S.msgs.length; i++) if (S.msgs[i].id === id) return S.msgs[i]; return null; }
  function paintReply() {
    var b = $("tReply"); if (!b) return;
    b.hidden = !S.reply;
    b.innerHTML = S.reply ? '<div class="x-quote"><b>Ответ: ' + E(S.reply.user) + "</b><span>" + E(S.reply.text) + '</span></div><button type="button" class="x-rpx" id="tReplyX" aria-label="Отменить ответ">×</button>' : "";
    if ($("tReplyX")) $("tReplyX").onclick = function () { S.reply = null; paintReply(); };
  }
  function react(mid, emoji) {
    C.call("/team/messages/" + mid + "/react", { body: { emoji: emoji } }).then(function (r) {
      var m = findMsg(mid); if (m) { m.reactions = r.reactions; paintThread(true); }
    }).catch(function (e) { toast(String(e)); });
  }
  function closePop() { var p = $("tPop"); if (p) p.remove(); document.removeEventListener("keydown", popKey); }
  function popKey(e) { if (e.key === "Escape") closePop(); }
  function openPop(mid, anchor) {
    closePop();
    var m = findMsg(mid); if (!m) return;
    var canDel = C.me && (m.user === C.me.name || C.me.role === "admin") && m.user_id;
    var p = document.createElement("div"); p.id = "tPop"; p.className = "x-pop2";
    p.innerHTML = '<div class="bar">' + S.pool.map(function (e) { return '<button type="button" data-e="' + e + '">' + e + "</button>"; }).join("") + '</div>'
      + '<div class="menu"><button type="button" data-a="reply">' + ic("reply") + 'Ответить</button><button type="button" data-a="copy">' + ic("file") + 'Копировать текст</button>' + (canDel ? '<button type="button" class="red" data-a="del">' + ic("trash") + "Удалить</button>" : "") + "</div>";
    document.body.appendChild(p);
    var r = anchor.getBoundingClientRect(), pw = p.offsetWidth, ph = p.offsetHeight;
    var left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left)), top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    p.style.left = left + "px"; p.style.top = top + "px";
    p.querySelectorAll("[data-e]").forEach(function (b) { b.onclick = function () { closePop(); react(mid, b.dataset.e); }; });
    p.querySelectorAll("[data-a]").forEach(function (b) {
      b.onclick = function () {
        closePop();
        if (b.dataset.a === "reply") { S.reply = { id: m.id, user: m.user, text: m.text.slice(0, 160) }; paintReply(); if ($("tIn")) $("tIn").focus(); }
        else if (b.dataset.a === "copy") { try { navigator.clipboard.writeText(m.text); toast("Текст скопирован"); } catch (e) {} }
        else if (b.dataset.a === "del") { var d = document.querySelector('[data-del="' + m.id + '"]'); if (d) d.click(); }
      };
    });
    setTimeout(function () {
      document.addEventListener("click", function off(ev) { if (!p.contains(ev.target)) { closePop(); document.removeEventListener("click", off, true); } }, true);
      document.addEventListener("keydown", popKey);
    }, 0);
  }
  function wireMessages(el) {
    el.querySelectorAll("[data-pop]").forEach(function (b) {
      b.onclick = function (e) {
        if (e.target.closest("button.x-file, a, [data-ack], [data-tf], [data-timg]")) return;
        e.stopPropagation(); openPop(+b.dataset.pop, b);
      };
    });
    el.querySelectorAll("[data-rx]").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); react(+b.dataset.m, b.dataset.rx); }; });
    el.querySelectorAll(".x-quote[data-go]").forEach(function (q) {
      q.onclick = function () {
        var t = el.querySelector('.x-msg[data-mid="' + q.dataset.go + '"]');
        if (t) { t.scrollIntoView({ behavior: "smooth", block: "center" }); t.classList.add("flash"); setTimeout(function () { t.classList.remove("flash"); }, 1600); }
      };
    });
  }
  function paintThread(keep) {
    var el = $("tThread"); if (!el) return;
    var room = S.rooms.filter(function (r) { return r.id === S.cur; })[0] || { name: "Чат", descr: "", kind: "chan", id: S.cur };
    var ai = room.kind === "ai";
    var pin = S.msgs.filter(function (m) { return m.urgent; }).slice(-1)[0];
    var prevDay = "", body = S.msgs.map(function (m) { var d = dayLabel(m.ts), h = (d !== prevDay ? '<span class="x-day">' + d + "</span>" : "") + msgHtml(m); prevDay = d; return h; }).join("");
    if (ai && S.aiBusy === room.id) body += '<div class="x-msg bot">' + botAva() + '<div class="bd"><div class="nm">ИИ-помощник КП</div><div class="tx x-aiwait">Собираю КП…</div></div></div>';
    if (ai && !body) body = '<div class="x-aihello">' + botAva() + "<div><b>Здравствуйте! Я соберу КП по вашему описанию.</b><p>Напишите услуги, объект, адрес, цену и срок — заполню конструктор, внесу КП в реестр и пришлю сюда PDF (или Word — просто попросите).</p>"
      + AI_EX.map(function (x) { return '<button type="button" class="x-aiex">' + E(x) + "</button>"; }).join("") + "<p>Потом можно уточнять: «цена 60 000», «добавь адрес …», «пришли в ворде».</p></div></div>";
    var wasBottom = true, old = el.querySelector(".x-msgs"), val = $("tIn") ? $("tIn").value : "";
    if (old && keep) wasBottom = old.scrollHeight - old.scrollTop - old.clientHeight < 80;
    el.innerHTML = '<div class="x-th-h"><button type="button" class="x-back" id="tBack" aria-label="К списку чатов">←</button>' + roomAv(room, room.kind === "task" ? "task" : ai ? "ai" : "") + "<div><b>" + E(room.name) + "</b><small>" + E(room.descr) + "</small></div>" + (ai ? '<button type="button" class="x-btn ghost x-ainew" id="tAiNew" title="Следующее сообщение начнёт новое КП">Новое КП</button>' : "") + (!ai && !S.aiOff ? '<button type="button" class="x-hbtn x-sumbtn" id="tSum" title="ИИ: кратко — что решили, кому что поручили" aria-label="Кратко: что решили">' + ic("zap") + "<span>Кратко</span></button>" : "") + (C.me && C.me.role === "admin" && !ai ? '<button type="button" class="x-hbtn" id="tStyle" title="Картинка чата" aria-label="Картинка чата">' + ic("layers") + "</button>" : "") + "</div>"
      + (pin ? '<div class="x-pinned">' + ic("flame") + "<span>Срочное: " + E(pin.text) + "</span></div>" : "")
      + '<div class="x-msgs">' + (body || '<span class="x-day">Здесь пока пусто — напишите первое сообщение</span>') + "</div>"
      + '<div class="x-replybar" id="tReply" hidden></div><div class="x-filebar" id="tFiles" hidden></div><div class="x-comp"><input type="file" id="tFile" multiple hidden><button type="button" class="x-attach" id="tAttach" title="Прикрепить файлы (до 10 штук, 10 МБ каждый)" aria-label="Прикрепить файл">' + ic("clip") + '</button><textarea id="tIn" rows="1" placeholder="' + (ai ? "Какое КП сделать? Услуги, объект, адрес, цена, срок" : window.innerWidth <= 760 ? "Сообщение" : window.innerWidth <= 1180 ? "Сообщение… (@Имя — упомянуть)" : "Написать в «" + E(room.name) + "»… (Enter — отправить, Shift+Enter — новая строка, @Имя — упомянуть)") + '" autocomplete="off"></textarea>' + (ai ? "" : '<button class="x-urgbtn ' + (S.urg ? "on" : "") + '" id="tUrg" title="Срочное: придёт всем участникам, даже в тихие часы">' + ic("flame") + "Срочное</button>") + '<button class="x-btn primary" id="tSend" style="padding:12px 14px">' + ic("send") + "</button></div>";
    var m = el.querySelector(".x-msgs"); if (!keep || wasBottom) m.scrollTop = 1e6;
    $("tIn").value = val;
    $("tSend").onclick = send;
    paintReply(); wireMessages(el); loadImages(el); wireAiTasks(el);
    if ($("tStyle")) $("tStyle").onclick = function () { styleDialog(room); };
    if ($("tSum")) $("tSum").onclick = function () { summaryDialog(room); };
    $("tBack").onclick = function () { var c = document.querySelector(".x-chat"); if (c) c.classList.remove("room-open"); paintRooms(); };
    $("tAttach").onclick = function () { $("tFile").click(); };
    $("tFile").onchange = function () { addFiles(this.files); this.value = ""; };
    paintFiles();
    var th = el;
    th.ondragover = function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); th.classList.add("drop"); } };
    th.ondragleave = function (e) { if (!th.contains(e.relatedTarget)) th.classList.remove("drop"); };
    th.ondrop = function (e) { th.classList.remove("drop"); if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } };
    $("tIn").onpaste = function (e) { var fl = e.clipboardData && e.clipboardData.files; if (fl && fl.length) { e.preventDefault(); addFiles(fl); } };
    el.querySelectorAll("[data-tf]").forEach(function (b) {
      b.onclick = function () {
        C.blob("/team/files/" + b.dataset.tf).then(function (bl) {
          var a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = b.dataset.name || "file";
          document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        }).catch(function (e) { toast(String(e)); });
      };
    });
    mentionBox($("tIn"));
    var tin = $("tIn");
    function grow() { tin.style.height = "auto"; tin.style.height = Math.min(tin.scrollHeight, Math.round(window.innerHeight * 0.4)) + "px"; }
    tin.addEventListener("input", grow); setTimeout(grow, 0);
    tin.onkeydown = function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !(document.getElementById("tMent") && document.getElementById("tMent").children.length)) { e.preventDefault(); send(); }
    };
    el.querySelectorAll("[data-del]").forEach(function (b) {
      b.onclick = function () {
        if (!confirm("Удалить это сообщение у всех?")) return;
        C.call("/team/messages/" + b.dataset.del + "/delete", { body: {} }).then(function () {
          S.msgs = S.msgs.filter(function (m) { return String(m.id) !== b.dataset.del; }); paintThread(true); loadRooms();
        }).catch(function (e) { toast(String(e)); });
      };
    });
    if ($("tUrg")) $("tUrg").onclick = function () { S.urg = !S.urg; this.classList.toggle("on", S.urg); };
    if ($("tAiNew")) $("tAiNew").onclick = function () { if (window.MPBP && MPBP.kpReset) MPBP.kpReset(); toast("Следующее сообщение начнёт новое КП"); };
    el.querySelectorAll(".x-aiex").forEach(function (b) { b.onclick = function () { var t = $("tIn"); t.value = b.textContent; t.focus(); t.dispatchEvent(new Event("input")); }; });
    el.querySelectorAll("[data-ack]").forEach(function (b) { b.onclick = function () { C.call("/team/messages/" + b.dataset.ack + "/ack", { body: {} }).then(function () { return C.call("/team/rooms/" + encodeURIComponent(S.cur) + "/messages"); }).then(function (ms) { S.msgs = ms; paintThread(true); loadRooms(); C.refresh(); }); }; });
  }
  /* подсказка имён по «@»: выбираете сотрудника — имя подставляется в сообщение */
  function mentionBox(inp) {
    var box = document.createElement("div"); box.id = "tMent"; box.className = "x-ment";
    inp.parentNode.style.position = "relative"; inp.parentNode.appendChild(box);
    var sel = 0, list = [], from = -1;
    function close() { box.innerHTML = ""; list = []; from = -1; }
    function pick(i) {
      var name = list[i]; if (!name) return;
      var v = inp.value, caret = inp.selectionStart;
      inp.value = v.slice(0, from) + "@" + name + " " + v.slice(caret);
      var pos = from + name.length + 2; inp.focus(); inp.setSelectionRange(pos, pos); close();
    }
    function update() {
      var caret = inp.selectionStart, before = inp.value.slice(0, caret), m = before.match(/(^|\s)@([^\s@]*)$/);
      if (!m) { close(); return; }
      from = caret - m[2].length - 1;
      var q = m[2].toLowerCase(), me = C.me && C.me.name;
      var all = (S.users || []).filter(function (n) { return n !== me; });
      list = all.filter(function (n) { return !q || n.toLowerCase().indexOf(q) === 0 || n.toLowerCase().indexOf(q) > 0; }).slice(0, 6);
      if (!list.length) { close(); return; }
      sel = Math.min(sel, list.length - 1);
      box.innerHTML = list.map(function (n, i) { return '<div class="x-ment-i ' + (i === sel ? "on" : "") + '" data-i="' + i + '">' + ava(n, "sm") + "<span>" + E(n) + "</span></div>"; }).join("");
      Array.prototype.forEach.call(box.querySelectorAll(".x-ment-i"), function (d) { d.onmousedown = function (e) { e.preventDefault(); pick(+d.dataset.i); }; });
    }
    inp.addEventListener("input", function () { sel = 0; update(); });
    inp.addEventListener("click", update);
    inp.addEventListener("blur", function () { setTimeout(close, 120); });
    inp.addEventListener("keydown", function (e) {
      if (!list.length) return;
      if (e.key === "ArrowDown") { e.preventDefault(); sel = (sel + 1) % list.length; update(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = (sel - 1 + list.length) % list.length; update(); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); pick(sel); }
      else if (e.key === "Escape") close();
    }, true);
  }
  var AI_EX = ["КП на разработку проекта СПС.СОУЭ для ООО «Ромашка», г. Санкт-Петербург, ул. Ленина, д. 5, цена 50 000 ₽, срок 30 р.д.",
    "ТО огнетушителей ОП-4 — 10 шт. и ОУ-3 — 2 шт., 12 000 ₽, объект ТЦ «Невский», без адреса, пришли в ворде"];
  function aiAsk(rid, text, mid) {                     // помощник КП (kpv.js) собирает КП в этом браузере и отвечает в чат
    if (!window.MPBP || !MPBP.kpChat) { toast("Модуль КП не загружен — обновите страницу"); return; }
    S.aiBusy = rid; if (S.cur === rid) paintThread(true);
    MPBP.kpChat(rid, text, mid).catch(function (e) { toast("Помощник не ответил: " + e); }).then(function () {
      S.aiBusy = null;
      if (S.cur !== rid) { loadRooms(); return; }
      return C.call("/team/rooms/" + encodeURIComponent(rid) + "/messages?after=" + S.lastId).then(function (ms) {
        mergeMsgs(ms); paintThread();
        return C.call("/team/rooms/" + encodeURIComponent(rid) + "/read", { body: {} });
      }).then(loadRooms).catch(function () {});
    });
  }
  function mergeMsgs(ms) {                           // не добавляем уже показанные сообщения (опрос и отправка могут принести одно и то же)
    var have = {}; S.msgs.forEach(function (m) { have[m.id] = 1; });
    ms.forEach(function (m) { if (!have[m.id]) { S.msgs.push(m); have[m.id] = 1; } });
    if (S.msgs.length) S.lastId = Math.max(S.lastId, S.msgs[S.msgs.length - 1].id);
  }
  function send() {
    var i = $("tIn"), text = i.value.trim(), fs = S.files.slice(), reply = S.reply; if (!text && !fs.length) return;
    if (S.sending) return;
    var urgent = S.urg, rid = S.cur;
    S.sending = true;
    i.value = ""; i.style.height = "auto"; S.files = []; S.reply = null; S.urg = false; paintFiles(); paintReply();   // сообщение сразу уходит из поля, как в мессенджере
    var tu = $("tUrg"); if (tu) tu.classList.remove("on");
    Promise.all(fs.map(readB64)).then(function (d) {
      return C.call("/team/rooms/" + encodeURIComponent(rid) + "/send", { body: { text: text, urgent: urgent, reply_to: reply ? reply.id : 0, files: fs.map(function (f, k) { return { filename: f.name, mime: f.type || "application/octet-stream", data: d[k] }; }) } });
    }).then(function (r) {
      if (/^kpai_/.test(rid) && text) aiAsk(rid, text, r && r.id);
      return C.call("/team/rooms/" + encodeURIComponent(rid) + "/messages?after=" + S.lastId);
    }).then(function (ms) { if (S.cur === rid) { mergeMsgs(ms); paintThread(); } loadRooms(); if (urgent) toast("Срочное отправлено — сотрудники получат оповещение, даже в тихие часы"); })
      .catch(function (e) {                                                         // не ушло — возвращаем текст в поле
        var j = $("tIn"); if (j && !j.value) { j.value = text; j.dispatchEvent(new Event("input")); }
        S.files = fs; S.reply = reply; S.urg = urgent; paintFiles(); paintReply(); toast("Не отправлено: " + e);
      })
      .then(function () { S.sending = false; });
  }  function paintInfo() {
    var el = $("tInfo"); if (!el) return;
    var room = S.rooms.filter(function (r) { return r.id === S.cur; })[0], urgs = S.msgs.filter(function (m) { return m.urgent; });
    if (room && room.kind === "ai") {
      el.innerHTML = '<div><h6>О чате</h6><p style="font-size:.86rem;color:var(--muted);margin:0">Ваш личный чат с ИИ-помощником — его видите только вы. Готовое КП открывается в «Конструкторе КП», попадает в «Реестр КП» и в «Версии КП».</p></div>'
        + '<div><h6>Можно писать</h6><p style="font-size:.86rem;color:var(--muted);margin:0">«КП на проект АПС для …, адрес …, 80 000, срок 20 р.д.»<br>«цена 60 000», «добавь ТО огнетушителей ОП-4 — 6 шт.»<br>«пришли в ворде», «пришли pdf и word»</p></div>'
        + '<div><a class="x-linkcard" href="#/kpc"><span class="x-rm ai">' + ic("file") + "</span><span><b>Конструктор КП</b><small>Открыть текущее КП</small></span></a></div>";
      return;
    }
    el.innerHTML = (room && room.kind === "task" ? '<div><h6>Задача</h6><a class="x-linkcard" href="#/task/' + room.task_row + '"><span class="x-rm task">' + ic("tasks") + "</span><span><b>" + E(room.name) + "</b><small>Открыть карточку задачи</small></span></a></div>" : '<div><h6>О канале</h6><p style="font-size:.86rem;color:var(--muted);margin:0">' + E(room ? room.descr : "") + "</p></div>")
      + "<div><h6>Сотрудники</h6>" + (S.users.map(function (n) { return '<div class="x-member">' + ava(n, "sm") + E(n) + (C.me && n === C.me.name ? '<small style="margin-left:auto;color:var(--muted)">вы</small>' : "") + "</div>"; }).join("") || '<p class="x-empty" style="padding:6px">—</p>') + "</div>"
      + "<div><h6>Срочные в этом чате</h6>" + (urgs.slice(-4).map(function (m) { return '<div class="x-linkcard" style="background:var(--bad-l);border-color:transparent;color:var(--bad)">' + ic("flame") + "<span><b>" + E(m.user) + '</b><small style="color:inherit;opacity:.8">' + E(m.text.slice(0, 80)) + "</small></span></div>"; }).join("") || '<p style="font-size:.84rem;color:var(--muted);margin:0">Пока нет</p>') + "</div>";
  }
  function newTaskRoom() {
    xmodal('<h3>Диалог по задаче</h3><p class="x-sub">Выберите задачу — для неё создастся отдельный чат команды</p><div class="x-field"><input type="text" id="tFind" placeholder="Поиск по заказчику или адресу…"></div><div id="tList" style="max-height:50vh;overflow:auto"><div class="x-empty">Загрузка…</div></div><div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Закрыть</button></div>', true);
    var all = [];
    function paint() {
      var q = ($("tFind").value || "").toLowerCase();
      $("tList").innerHTML = all.filter(function (t) { return !q || (t.customer + " " + t.address).toLowerCase().indexOf(q) >= 0; }).slice(0, 60).map(function (t) { return '<div class="x-linkcard" data-t="' + t.row + '"><span class="x-rm task" style="--tc:' + (window.wtColor ? wtColor(t.workType) : "var(--blue)") + '">' + ic("tasks") + "</span><span><b>" + E(t.customer) + "</b><small>" + E(t.workType || "") + " · " + E(t.address || "") + "</small></span></div>"; }).join("") || '<div class="x-empty">Ничего не найдено</div>';
      $("tList").querySelectorAll("[data-t]").forEach(function (n) { n.onclick = function () { var t = all.filter(function (x) { return x.row === +n.dataset.t; })[0]; T.closeModal(); T.openTaskRoom(t.row, t.customer); }; });
    }
    callServer("api_listTasks").then(function (ts) { all = ts.filter(function (t) { return !t.closed; }); paint(); }).catch(function (e) { $("tList").innerHTML = '<div class="x-empty">' + E(e) + "</div>"; });
    $("tFind").oninput = paint;
  }
  T.openTaskRoom = function (row, customer) {
    C.requireLogin().then(function () { return C.call("/team/rooms", { body: { task_row: row, name: customer } }); }).then(function (r) {
      if (cur() === "team") { S.cur = r.id; renderTeam(); try { history.replaceState(null, "", "#/team?room=" + r.id); } catch (e) {} } else location.hash = "#/team?room=" + r.id;
    }).catch(function (e) { if (e !== "cancel") toast(String(e)); });
  };

  /* ================================================================
     ЖУРНАЛ ИЗМЕНЕНИЙ
     ================================================================ */
  var LG = { f: "Все", items: [] };
  function renderLog() {
    var el = $("log-app"), sub = "Кто, когда и что изменил. Свежие изменения задач и заявок можно отменить";
    if (!gate(el, "Журнал изменений", sub, renderLog)) return;
    el.innerHTML = head("Журнал изменений", sub, '<button class="refresh" id="lgRef">⟳ Обновить</button>') + '<div class="wrap"><div class="x-bar"><div class="x-chips" id="lgChips"></div></div><div class="x-panel" id="lgOut"><div class="x-empty">Загрузка…</div></div></div>';
    $("lgRef").onclick = renderLog;
    C.call("/journal?limit=200").then(function (items) { LG.items = items; paintLog(); }).catch(function (e) { $("lgOut").innerHTML = '<div class="x-empty">' + E(e) + "</div>"; });
  }
  function paintLog() {
    var fs = ["Все", "Задача", "КП", "Чат", "Настройки"];
    $("lgChips").innerHTML = fs.map(function (f) { return '<span class="x-chip ' + (LG.f === f ? "on" : "") + '" data-f="' + f + '">' + f + "</span>"; }).join("");
    var rows = LG.items.filter(function (l) { return LG.f === "Все" || l.entity.indexOf(LG.f) === 0; }), day = "", h = "";
    rows.forEach(function (l) {
      var d = dayLabel(l.ts); if (d !== day) { day = d; h += '<div class="x-lgd">' + d + "</div>"; }
      h += '<div class="x-lg">' + ava(l.user_name || "?", "sm") + "<div><b>" + E(l.user_name) + "</b> · " + E(l.action) + ' <span class="x-pill">' + E(l.entity) + "</span>" + (l.before || l.after ? '<div class="x-diff"><s>' + E(l.before || "—") + "</s>" + ic("arrow") + "<u>" + E(l.after || "—") + "</u></div>" : "") + '</div><div class="rt"><span class="tt">' + when(l.ts) + "</span>"
        + (l.undo && !l.undone ? '<button class="x-btn ghost" style="padding:7px 12px" data-u="' + l.id + '">' + ic("undo") + "Отменить</button>" : (l.undone ? '<span class="x-pill">отменено</span>' : "")) + "</div></div>";
    });
    $("lgOut").innerHTML = h || '<div class="x-empty">Записей пока нет</div>';
    $("lgChips").querySelectorAll(".x-chip").forEach(function (c) { c.onclick = function () { LG.f = c.dataset.f; paintLog(); }; });
    $("lgOut").querySelectorAll("[data-u]").forEach(function (b) {
      b.onclick = function () {
        var e = LG.items.filter(function (x) { return x.id === +b.dataset.u; })[0]; b.disabled = true;
        C.undoEntry(e).then(function () { e.undone = 1; paintLog(); toast("Изменение отменено"); }).catch(function (er) { b.disabled = false; toast(String(er)); });
      };
    });
  }

  /* ================================================================
     ЛИЧНЫЙ КАБИНЕТ
     ================================================================ */
  var P = { tab: "notif" };
  var EVENTS = [["reminder", "Моё напоминание", "Из раздела «Мои задачи»"], ["urgent", "Срочное в чатах", "Всегда пробивает тихие часы, если включено ниже"], ["mention", "Упоминание @Имя", "Когда вас позвали в чате"], ["team", "Сообщения в чатах команды", "Любое сообщение в «Команде» — по одному уведомлению на чат"], ["client", "Сообщения клиентов", "Новые письма, Max и Telegram в «Переписке»"],
    ["task", "Этап перешёл ко мне", "Задача пришла на ваш этап"], ["deadline", "Скоро дедлайн этапа", "За сколько дней — настраивает руководитель в «Автоматизации»"],
    ["overdue", "Дедлайн просрочен", "Задача на вашем этапе просрочена"], ["lead", "Клиенты и заявки", "Нет контакта, КП без ответа, КП выиграно"], ["mail", "Письма мне", "Письма и диалоги, переданные вам"], ["pay", "Оплаты из 1С", "Поступления на счёт МПБ (руководителю)"]];

  function renderMe() {
    var el = $("me-app"), sub = "Настройки уведомлений, профиль и доступ сотрудников";
    if (!gate(el, "Личный кабинет", sub, renderMe)) return;
    var u = C.me, tabs = [["notif", "bell", "Уведомления"], ["info", "user", "Профиль"]].concat(u.role === "admin" ? [["staff", "users", "Сотрудники"], ["data", "list", "Данные"]] : []);
    el.innerHTML = head("Личный кабинет", sub) + '<div class="wrap"><div class="prof2">' + ava(u.name, "xl") + "<div><h2>" + E(u.name) + "</h2><p>" + (u.title ? E(u.title) + " · " : "") + (ROLE_NAMES[u.role] || "Сотрудник") + '</p><div class="pf-pills"><span>' + (u.tg ? "Telegram подключён" : "Telegram не подключён") + '</span><span>' + (C.pushOn && C.pushOn() ? "Push включён" : "Push выключен") + '</span></div></div>' + '<div class="pf-stats"><div><b>' + ((C.sync || {}).notif_unread || 0) + '</b><small>новых уведомлений</small></div><div><b>' + ((C.sync || {}).team_unread || 0) + '</b><small>непрочитано в «Команде»</small></div><div><b>' + (((C.sync || {}).urgent || []).length) + '</b><small>срочных</small></div></div><button class="x-btn ghost" id="meOut">Выйти</button></div>'
      + '<div class="x-bar"><div class="x-seg" id="meTabs">' + tabs.map(function (t) { return '<button data-t="' + t[0] + '" class="' + (P.tab === t[0] ? "on" : "") + '">' + ic(t[1]) + t[2] + "</button>"; }).join("") + '</div></div><div id="meBody"></div></div>';
    $("meOut").onclick = function () { C.logout().then(renderMe); };
    $("meTabs").querySelectorAll("button").forEach(function (b) { b.onclick = function () { P.tab = b.dataset.t; renderMe(); }; });
    if (P.tab === "notif") paintNotif(); else if (P.tab === "info") paintInfo2(); else if (P.tab === "data") paintData(); else paintStaff();
  }
  function savePrefs(patch) { return C.call("/me/prefs", { body: patch }).then(function (p) { C.prefs = p; return p; }); }
  function paintNotif() {
    var body = $("meBody"), pr = C.prefs, pushOk = C.pushSupported(), pushOn = C.pushOn(), tg = C.me.tg;
    body.innerHTML = '<div class="x-two"><div>'
      + '<div class="x-chcards">'
      + '<div class="x-chc"><div class="t"><span class="x-rm">' + ic("bell") + "</span><div><b>В приложении</b><small>Колокольчик в меню</small></div></div><span class=\"x-pill ok\">Всегда включено</span></div>"
      + '<div class="x-chc"><div class="t"><span class="x-rm">' + ic("phone") + "</span><div><b>Push на это устройство</b><small>" + (pushOk ? (pushOn ? "Подключено" : "Выключено") : "Не поддерживается браузером") + '</small></div></div><button class="x-btn ' + (pushOn ? "ghost" : "primary") + '" id="mePush" ' + (pushOk ? "" : "disabled") + ">" + (pushOn ? "Отключить" : "Включить") + "</button></div>"
      + '<div class="x-chc"><div class="t"><span class="x-rm">' + ic("send") + "</span><div><b>Telegram</b><small>" + (!C.bot ? "Бот не подключён на сервере" : tg ? "Подключён" : "Не привязан") + '</small></div></div>' + (C.bot ? '<button class="x-btn ' + (tg ? "ghost" : "primary") + '" id="meTg">' + (tg ? "Отвязать" : "Получить код") + "</button>" : '<span class="x-pill">нужен TG_BOT_TOKEN</span>') + '<div id="meTgCode"></div></div></div>'
      + '<div class="x-panel" style="margin-bottom:18px"><div style="padding:18px 20px 4px"><h3>Что и куда присылать</h3><p class="x-sub">Отметьте, какие события вам важны и в каком канале о них сообщать</p></div><div style="overflow-x:auto"><table class="x-mx"><thead><tr><th>Событие</th><th>В приложении</th><th>Push</th><th>Telegram</th></tr></thead><tbody>'
      + EVENTS.map(function (e) { return "<tr><td>" + e[1] + "<small>" + e[2] + "</small></td>" + ["app", "push", "telegram"].map(function (ch) { return '<td><button class="x-cb ' + (pr.events[e[0]][ch] ? "on" : "") + '" data-e="' + e[0] + '" data-c="' + ch + '">' + ic("check") + "</button></td>"; }).join("") + "</tr>"; }).join("")
      + "</tbody></table></div></div>"
      + '<div class="x-panel pad"><h3>Тихие часы</h3><p class="x-sub">Чтобы работа не мешала отдыху. «Срочное» можно оставить сквозным</p>'
      + '<div class="x-qrow"><div><b>Не беспокоить</b><small>Push и Telegram молчат, внутри приложения всё сохраняется</small></div><button class="x-sw ' + (pr.quiet.on ? "on" : "") + '" id="qOn"></button></div>'
      + '<div class="x-qrow"><div><b>С</b></div><input type="time" id="qFrom" value="' + pr.quiet.from + '"><div style="margin-left:14px"><b>До</b></div><input type="time" id="qTo" value="' + pr.quiet.to + '"></div>'
      + '<div class="x-qrow"><div><b>«Срочное» пробивает тишину</b><small>Срочные сообщения придут всегда</small></div><button class="x-sw ' + (pr.quiet.urgent_through ? "on" : "") + '" id="qUrg"></button></div></div>'
      + '</div><div class="x-sticky"><div class="x-panel pad"><h3>Проверка</h3><p class="x-sub">Отправим тестовое уведомление по вашим настройкам</p><button class="x-btn primary" id="meTest" style="width:100%;justify-content:center">' + ic("bell") + 'Отправить тест</button><div class="x-hint" id="meTestOut"></div></div></div></div>';
    $("mePush").onclick = function () { var p = pushOn ? C.disablePush() : C.enablePush(); p.then(function () { toast(pushOn ? "Push отключён" : "Push включён на этом устройстве"); paintNotif(); }).catch(function (e) { toast(String(e)); }); };
    var tgb = $("meTg"); if (tgb) tgb.onclick = function () {
      if (tg) C.call("/me/tg/unlink", { body: {} }).then(function () { C.me.tg = false; renderMe(); });
      else C.call("/me/tg/code", { body: {} }).then(function (r) { $("meTgCode").innerHTML = '<p class="x-sub" style="margin:8px 0 0">Откройте вашего бота в Telegram и отправьте: <b>/start ' + r.code + "</b><br>Код действует " + r.minutes + " минут. После привязки обновите страницу.</p>"; }).catch(function (e) { toast(String(e)); });
    };
    body.querySelectorAll(".x-cb").forEach(function (b) { b.onclick = function () { var e = b.dataset.e, c = b.dataset.c, v = !pr.events[e][c], patch = { events: {} }; patch.events[e] = {}; patch.events[e][c] = v; savePrefs(patch).then(function () { b.classList.toggle("on", v); }).catch(function (er) { toast(String(er)); }); }; });
    $("qOn").onclick = function () { var v = !pr.quiet.on; savePrefs({ quiet: { on: v } }).then(function () { $("qOn").classList.toggle("on", v); }); };
    $("qUrg").onclick = function () { var v = !pr.quiet.urgent_through; savePrefs({ quiet: { urgent_through: v } }).then(function () { $("qUrg").classList.toggle("on", v); }); };
    $("qFrom").onchange = function () { savePrefs({ quiet: { from: this.value } }); };
    $("qTo").onchange = function () { savePrefs({ quiet: { to: this.value } }); };
    $("meTest").onclick = function () {
      C.call("/me/test", { body: {} }).then(function (r) { var names = { app: "в приложении", push: "push", telegram: "Telegram" }, parts = Object.keys(r).map(function (k) { return names[k] + (r[k] ? " ✓" : " ✗"); }); $("meTestOut").textContent = parts.length ? "Отправлено: " + parts.join(", ") : "По вашим настройкам сейчас ничего не отправляется (тихие часы?)"; C.refresh(); }).catch(function (e) { $("meTestOut").textContent = String(e); });
    };
  }
  function resizePhoto(file, cb) {                                // квадрат 160×160, JPEG — небольшой, хранится на сервере
    var fr = new FileReader();
    fr.onload = function () {
      var im = new Image();
      im.onload = function () {
        var s = Math.min(im.width, im.height), cv = document.createElement("canvas"); cv.width = cv.height = 160;
        cv.getContext("2d").drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 160, 160);
        cb(cv.toDataURL("image/jpeg", 0.82));
      };
      im.onerror = function () { toast("Не удалось прочитать изображение"); };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  function paintInfo2() {
    paintPin();
    var me = C.me, pw = { photo: undefined };
    $("meBody").insertAdjacentHTML("afterbegin", '<div class="x-panel pad" style="max-width:560px;margin-bottom:16px"><h3>Профиль</h3><p class="x-sub">Фото и должность видят коллеги в «Команде», задачах и календаре</p>'
      + '<div style="display:flex;gap:16px;align-items:center;margin-bottom:14px"><span id="prPh" class="x-ava" style="width:72px;height:72px;font-size:1.6rem;flex:none"></span><div><input type="file" id="prFile" accept="image/*" hidden><button class="x-btn ghost" id="prPick">Загрузить фото</button> <button class="x-btn ghost" id="prDel">Убрать</button></div></div>'
      + '<div class="x-field"><label>Имя</label><input type="text" id="prName" maxlength="40" value="' + E(me.name) + '"><small style="color:var(--muted)">Имя должно совпадать с именем в таблице (колонки «Ответственный», «Менеджер»): по нему приходят уведомления</small></div>'
      + '<div class="x-field"><label>Должность</label><input type="text" id="prTitle" maxlength="60" value="' + E(me.title || "") + '" placeholder="Например: инженер-проектировщик"></div><div class="x-err" id="prErr"></div><button class="x-btn primary" id="prSave">Сохранить профиль</button></div>');
    function drawPh() {
      var src = pw.photo !== undefined ? pw.photo : (me.photo || ""), el = $("prPh");
      if (src) { el.style.background = "url(" + src + ") center/cover"; el.textContent = ""; }
      else { el.style.background = color(me.name); el.textContent = String(me.name).charAt(0); }
    }
    drawPh();
    $("prPick").onclick = function () { $("prFile").click(); };
    $("prFile").onchange = function () { if (this.files[0]) resizePhoto(this.files[0], function (d) { pw.photo = d; drawPh(); }); };
    $("prDel").onclick = function () { pw.photo = ""; drawPh(); };
    $("prSave").onclick = function () {
      var body = { name: $("prName").value, title: $("prTitle").value };
      if (pw.photo !== undefined) body.photo = pw.photo;
      if (body.name.trim() !== me.name && !confirm("Сменить имя «" + me.name + "» на «" + body.name.trim() + "»? Если в таблице вы записаны под прежним именем, уведомления по задачам перестанут приходить, пока имена не совпадут.")) return;
      C.call("/me/profile", { body: body }).then(function (r) { C.me = r.user; return loadPeople(); }).then(function () { toast("Профиль сохранён"); renderMe(); }).catch(function (e) { $("prErr").textContent = String(e); });
    };
  }
  function paintPin() {
    $("meBody").innerHTML = '<div class="x-panel pad" style="max-width:560px"><h3>Сменить PIN</h3><p class="x-sub">После смены нужно будет войти заново на всех устройствах</p>'
      + '<div class="x-field"><label>Текущий PIN</label><input type="password" id="pOld" inputmode="numeric" maxlength="8"></div><div class="x-field"><label>Новый PIN (4–8 цифр)</label><input type="password" id="pNew" inputmode="numeric" maxlength="8"></div><div class="x-field"><label>Повторите новый PIN</label><input type="password" id="pNew2" inputmode="numeric" maxlength="8"></div><div class="x-err" id="pErr"></div><button class="x-btn primary" id="pGo">Сменить PIN</button></div>';
    $("pGo").onclick = function () {
      if ($("pNew").value !== $("pNew2").value) { $("pErr").textContent = "Новые PIN не совпадают"; return; }
      C.call("/me/pin", { body: { old: $("pOld").value, new: $("pNew").value } }).then(function () { C.me = null; try { localStorage.removeItem("mpb_session"); } catch (e) {} toast("PIN изменён — войдите заново"); renderMe(); }).catch(function (e) { $("pErr").textContent = String(e); });
    };
  }
  var ROLE_NAMES = { admin: "Руководитель", user: "Сотрудник", engineer: "Инженер ТО" };
  function roleOptions(cur) { return Object.keys(ROLE_NAMES).map(function (k) { return '<option value="' + k + '"' + (k === cur ? " selected" : "") + ">" + ROLE_NAMES[k] + "</option>"; }).join(""); }
  function paintStaff() {
    var body = $("meBody"); body.innerHTML = '<div class="x-panel"><div class="x-empty">Загрузка…</div></div>';
    C.call("/admin/users").then(function (us) {
      body.innerHTML = '<div class="x-two"><div class="x-panel" id="stList">' + us.map(function (u) { return '<div class="x-urow">' + ava(u.name) + "<div><b>" + E(u.name) + "</b><small>" + (ROLE_NAMES[u.role] || "Сотрудник").replace(/^./, function (c) { return c.toLowerCase(); }) + (u.tg ? " · Telegram" : "") + (u.active ? "" : " · отключён") + '</small></div><div class="acts"><button class="x-btn ghost" style="padding:7px 12px" data-pin="' + u.id + '">Сбросить PIN</button><select class="x-rolesel" data-role="' + u.id + '" title="Роль">' + roleOptions(u.role) + '</select><button class="x-sw ' + (u.active ? "on" : "") + '" data-act="' + u.id + '" title="Доступ"></button></div></div>'; }).join("") + "</div>"
        + '<div class="x-sticky"><div class="x-panel pad"><h3>Новый сотрудник</h3><p class="x-sub">PIN сообщите сотруднику лично</p><div class="x-field"><label>Имя</label><input type="text" id="nName"></div><div class="x-field"><label>PIN (4–8 цифр)</label><input type="password" id="nPin" inputmode="numeric" maxlength="8"></div><div class="x-field"><label>Роль</label><select id="nRole">' + roleOptions("user") + '</select></div><p class="x-sub" style="margin-top:-4px">Инженер ТО видит только «ТО МПБ» и чат «Техническое обслуживание». Объекты ТО ему открывает PIN специалиста в самой вкладке ТО.</p><div class="x-err" id="nErr"></div><button class="x-btn primary" id="nAdd">' + ic("plus") + "Добавить</button></div></div></div>";
      $("nAdd").onclick = function () { C.call("/admin/users", { body: { name: $("nName").value, pin: $("nPin").value, role: $("nRole").value } }).then(function () { toast("Сотрудник добавлен"); paintStaff(); }).catch(function (e) { $("nErr").textContent = String(e); }); };
      body.querySelectorAll("[data-act]").forEach(function (b) { b.onclick = function () { var on = !b.classList.contains("on"); C.call("/admin/users/" + b.dataset.act + "/active", { body: { active: on } }).then(paintStaff).catch(function (e) { toast(String(e)); }); }; });
      body.querySelectorAll("[data-role]").forEach(function (b) { b.onchange = function () { C.call("/admin/users/" + b.dataset.role + "/role", { body: { role: b.value } }).then(function () { toast("Роль изменена"); paintStaff(); }).catch(function (e) { toast(String(e)); paintStaff(); }); }; });
      body.querySelectorAll("[data-pin]").forEach(function (b) {
        b.onclick = function () {
          xmodal('<h3>Сбросить PIN</h3><p class="x-sub">Новый PIN сотрудника (4–8 цифр). Он будет разлогинен на всех устройствах.</p><div class="x-field"><input type="password" id="rPin" class="x-pin" inputmode="numeric" maxlength="8"></div><div class="x-err" id="rErr"></div><div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button><button class="x-btn primary" id="rGo">Сохранить</button></div>');
          $("rGo").onclick = function () { C.call("/admin/users/" + b.dataset.pin + "/pin", { body: { pin: $("rPin").value } }).then(function () { T.closeModal(); toast("PIN обновлён"); }).catch(function (e) { $("rErr").textContent = String(e); }); };
        };
      });
    }).catch(function (e) { body.innerHTML = '<div class="x-panel"><div class="x-empty">' + E(e) + "</div></div>"; });
  }

  /* ---------- «Данные» (руководитель): где хранятся задачи, реестр и ТО; перенос из Google-таблицы; копии базы ---------- */
  function paintData() {
    var body = $("meBody"); body.innerHTML = '<div class="x-panel"><div class="x-empty">Загрузка…</div></div>';
    Promise.all([C.call("/admin/storage"), C.call("/admin/backups").catch(function () { return []; })]).then(function (r) {
      var st = r[0], bk = r[1], c = st.counts || {}, m = st.migrated, moved = st.mode === "bridge";
      var kb = function (n) { return Math.max(1, Math.round(n / 1024)).toLocaleString("ru-RU") + " КБ"; };
      var info = moved
        ? '<p class="x-sub">Задачи, реестр КП и клиенты хранятся <b>в CRM</b> (база на сервере). Google-таблица больше не используется для работы.</p>'
          + '<div class="pf-pills"><span>Задач: ' + c.tasks + "</span><span>В архиве: " + c.archived + "</span><span>Заявок: " + c.leads + "</span><span>Клиентов с ИНН: " + c.clients + "</span><span>ТО: " + (st.to === "bridge" ? "в CRM" : "в таблице") + "</span></div>"
          + (m ? '<p class="x-sub" style="margin-top:10px">Перенесено ' + E(when(m.ts)) + " · " + E(m.by || "") + "</p>" : "")
        : '<p class="x-sub">Сейчас задачи, реестр КП и ТО хранятся <b>в Google-таблице</b>. Перенос забирает всё в CRM; таблица при этом не меняется и остаётся архивом на дату переноса.</p>';
      var pinField = function (id, ph) { return '<div class="x-field"><label>PIN руководителя вкладки «ТО МПБ»</label><input type="password" id="' + id + '" class="x-pin" inputmode="numeric" maxlength="8" placeholder="' + ph + '"></div>'; };
      var again = !moved && m;                                 // работали в CRM, затем аварийно вернулись к таблице
      var mig = moved ? "" : '<div class="x-panel pad" style="margin-top:12px"><h3>' + (again ? "Снова перейти в CRM" : "Перенести данные из таблицы") + "</h3>"
        + (again
          ? '<p class="x-sub">После возврата к таблице работали в ней. «Вернуться к данным CRM» — продолжить с тем, что было в CRM (правки в таблице после возврата не попадут). «Перенести заново» — взять задачи и реестр из таблицы (правки в CRM до возврата пропадут). ТО остаётся как есть.</p>'
            + '<div class="x-err" id="dErr"></div><div class="x-row" style="justify-content:flex-start"><button class="x-btn primary" id="dResume">Вернуться к данным CRM</button><button class="x-btn ghost" id="dGo">Перенести заново из таблицы</button></div></div>'
          : '<p class="x-sub">Перед переносом сервер сделает копию базы. Попросите сотрудников не вносить изменения несколько минут — после переноса у всех страница обновится сама.</p>'
            + (st.to_pin_set || st.to === "bridge" ? "" : pinField("dToPin", "можно оставить пустым — ТО останется в таблице"))
            + '<div class="x-err" id="dErr"></div><button class="x-btn primary" id="dGo">Перенести из таблицы</button></div>');
      var toMig = moved && st.to !== "bridge" ? '<div class="x-panel pad" style="margin-top:12px"><h3>Перенести график ТО</h3><p class="x-sub">Задачи и реестр уже в CRM, а «ТО МПБ» пока в таблице. Задачи и реестр это не затронет.</p>'
        + (st.to_pin_set ? "" : pinField("dTo2Pin", "PIN руководителя, не специалиста"))
        + '<div class="x-err" id="dToErr"></div><button class="x-btn primary" id="dToGo">Перенести ТО</button></div>' : "";
      var cut = moved && st.truncated ? '<div class="x-panel pad" style="margin-top:12px"><h3>Длинные тексты</h3><p class="x-sub">При переносе ' + st.truncated + ' комментариев/описаний длиннее 2000 символов могли обрезаться. Полный текст есть в старых листах таблицы — его можно дочитать (правки, сделанные в CRM, не затрагиваются).</p><div class="x-err" id="dCutErr"></div><button class="x-btn primary" id="dCut">Восстановить полный текст</button></div>' : "";
      var back = moved ? '<div class="x-panel pad" style="margin-top:12px"><h3>Аварийно</h3><p class="x-sub">Вернуть работу в Google-таблицу. Данные в CRM сохранятся, но изменения, сделанные после переноса, в таблице не появятся.</p><button class="x-btn ghost" id="dBack">Вернуться к таблице</button></div>' : "";
      body.innerHTML = '<div class="x-two"><div><div class="x-panel pad"><h3>Где данные</h3>' + info + "</div>" + mig + toMig + cut + back + "</div>"
        + '<div class="x-sticky"><div class="x-panel pad"><h3>Копии базы</h3><p class="x-sub">Сервер делает копию раз в сутки и хранит последние 14</p>'
        + (bk.length ? bk.slice(0, 6).map(function (b) { return '<div class="x-urow"><div><b>' + E(when(b.ts)) + "</b><small>" + E(b.name) + " · " + kb(b.size) + "</small></div></div>"; }).join("") : '<div class="x-empty">Копий пока нет</div>')
        + '<button class="x-btn ghost" id="dBk" style="margin-top:10px">Сделать копию сейчас</button></div></div></div>';
      $("dBk").onclick = function () { this.disabled = true; C.call("/admin/backups", { body: {} }).then(function () { toast("Копия базы сделана"); paintData(); }).catch(function (e) { toast(String(e)); paintData(); }); };
      if ($("dGo")) $("dGo").onclick = function () {
        var q = again ? "Перенести задачи и реестр из таблицы заново? Всё, что было изменено в CRM до возврата к таблице, будет заменено данными таблицы."
          : "Перенести задачи, реестр КП, клиентов" + (st.to_pin_set || ($("dToPin") && $("dToPin").value) ? " и ТО" : "") + " из Google-таблицы в CRM?\n\nПосле этого все работают только в CRM.";
        if (!confirm(q)) return;
        var go = $("dGo"), label = go.textContent; go.disabled = true; go.textContent = "Переношу… (до минуты)"; $("dErr").textContent = "";
        C.call("/admin/migrate", { body: { force: !!again, to_pin: $("dToPin") ? $("dToPin").value.trim() : "" } }).then(function (res) {
          var t = res.to || {};
          alert("Перенесено: задач " + res.tasks + ", заявок " + res.leads + ", клиентов " + res.clients
            + (t.moved ? ", объектов ТО " + t.objects + (t.pins === "kept" ? " (PIN вкладки ТО прежние)" : ". PIN специалистов и бухгалтера ТО задайте заново во вкладке «ТО МПБ → Специалисты»") : ". График ТО остался в таблице")
            + ".\nКопия базы до переноса: " + res.backup + "\n\nСтраница обновится.");
          location.reload();
        }).catch(function (e) { go.disabled = false; go.textContent = label; $("dErr").textContent = String(e); });
      };
      if ($("dResume")) $("dResume").onclick = function () {
        if (!confirm("Вернуться к данным CRM? Правки, сделанные в таблице после возврата, в CRM не попадут.")) return;
        C.call("/admin/storage", { body: { mode: "bridge" } }).then(function () { location.reload(); }).catch(function (e) { $("dErr").textContent = String(e); });
      };
      if ($("dToGo")) $("dToGo").onclick = function () {
        var b = this; b.disabled = true; $("dToErr").textContent = "";
        C.call("/admin/migrate-to", { body: { to_pin: $("dTo2Pin") ? $("dTo2Pin").value.trim() : "" } }).then(function (res) {
          var t = res.to || {};
          alert("График ТО перенесён: объектов " + t.objects + (t.pins === "kept" ? " (PIN вкладки ТО прежние)" : ". PIN специалистов и бухгалтера задайте заново во вкладке «ТО МПБ → Специалисты»") + ".");
          location.reload();
        }).catch(function (e) { b.disabled = false; $("dToErr").textContent = String(e); });
      };
      if ($("dCut")) $("dCut").onclick = function () {
        var b = this; b.disabled = true; b.textContent = "Восстанавливаю…"; $("dCutErr").textContent = "";
        C.call("/admin/restore-text", { body: {} }).then(function (r) { toast("Восстановлено текстов: " + r.fixed); paintData(); })
          .catch(function (e) { b.disabled = false; b.textContent = "Восстановить полный текст"; $("dCutErr").textContent = String(e); });
      };
      if ($("dBack")) $("dBack").onclick = function () {
        if (!confirm("Вернуть работу в Google-таблицу? Изменения, сделанные в CRM после переноса, в таблице НЕ появятся.")) return;
        C.call("/admin/storage", { body: { mode: "sheet" } }).then(function () { location.reload(); }).catch(function (e) { toast(String(e)); });
      };
    }).catch(function (e) { body.innerHTML = '<div class="x-panel"><div class="x-empty">' + E(e) + "</div></div>"; });
  }

  T.util = { E: E, ic: ic, head: head, toast: toast, gate: gate, xmodal: xmodal, ava: ava, when: when, cur: cur };

  /* ---------- маршрутизация ---------- */
  T.render = function (sec) { if (sec === "team") renderTeam(); else if (sec === "log") renderLog(); else if (sec === "me") renderMe(); };
  T.ready = true;
  C.on("login", function () { loadPeople().then(function () { var s = cur(); if (s === "team" || s === "log" || s === "me") T.render(s); }); });
  C.on("logout", function () { var s = cur(); if (s === "team" || s === "log" || s === "me") T.render(s); });
  var s0 = cur(); if (s0 === "team" || s0 === "log" || s0 === "me") T.render(s0);
})();
