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
    t.innerHTML = "<span>" + msg + "</span>"; t.className = "x-toast on"; clearTimeout(toast.h); toast.h = setTimeout(function () { t.className = "x-toast"; }, 3200);
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
  var ROOM_IC = { general: "hash", buy: "wallet", calc: "calc", kp: "file" };

  function renderTeam() {
    var el = $("team-app"), sub = "Внутренние чаты МПБ: общие вопросы, закупки, расчёты, КП и отдельный диалог по каждой задаче";
    if (!gate(el, "Команда", sub, renderTeam)) { stopTimer(); return; }
    var q = /[?&]room=([^&]+)/.exec(location.hash); if (q) S.cur = decodeURIComponent(q[1]);
    el.innerHTML = head("Команда", sub, '<div class="x-chips"><span class="x-chip on" id="tUrgChip">' + ic("flame") + 'Срочное <b id="tUrgN">0</b></span></div>')
      + '<div class="wrap"><div class="x-chat"><div class="x-dlgs"><div class="hd"><button class="x-btn ghost" id="tNew" style="justify-content:center">' + ic("plus") + 'Диалог по задаче</button></div><div class="sc" id="tRooms"></div></div><div class="x-thread" id="tThread"></div><div class="x-info" id="tInfo"></div></div></div>';
    $("tNew").onclick = newTaskRoom;
    $("tUrgChip").onclick = function () { var r = S.rooms.filter(function (x) { return x.urgent_open > 0; })[0]; if (r) openRoom(r.id); };
    loadRooms().then(function () { if (!S.rooms.some(function (r) { return r.id === S.cur; })) S.cur = "general"; openRoom(S.cur, true); }).catch(function (e) { $("tThread").innerHTML = '<div class="x-empty" style="padding:40px">' + E(e) + "</div>"; });
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
        if (ms.length) { S.msgs = S.msgs.concat(ms); S.lastId = ms[ms.length - 1].id; paintThread(true); C.call("/team/rooms/" + encodeURIComponent(S.cur) + "/read", { body: {} }).then(function () { return loadRooms(); }); }
        else if (S.tick % 4 === 0) loadRooms();
      }).catch(function () {});
    }, 4000);
  }
  function loadRooms() {
    return C.call("/team/rooms").then(function (rs) { S.rooms = rs; paintRooms(); });
  }
  function roomItem(r) {
    var hasU = r.urgent_open > 0, last = r.last;
    return '<div class="x-dlg ' + (r.id === S.cur ? "on" : "") + '" data-r="' + E(r.id) + '"><span class="x-rm ' + (r.kind === "task" ? "task" : "") + '">' + ic(r.kind === "task" ? "tasks" : (ROOM_IC[r.id] || "hash")) + '</span><div class="m"><b>' + E(r.name) + (hasU ? '<span class="x-flame">' + ic("flame") + "</span>" : "") + "</b><span>" + (last ? E(last.user) + ": " + E(last.text) : E(r.descr)) + '</span></div><div class="tm">' + (last ? when(last.ts) : "") + "<br>" + (r.unread ? '<span class="x-un ' + (hasU ? "red" : "") + '">' + r.unread + "</span>" : "") + "</div></div>";
  }
  function paintRooms() {
    var el = $("tRooms"); if (!el) return;
    var urg = S.rooms.filter(function (r) { return r.urgent_open > 0; }), n = urg.reduce(function (a, r) { return a + r.urgent_open; }, 0);
    if ($("tUrgN")) $("tUrgN").textContent = n;
    el.innerHTML = (urg.length ? '<div class="x-grp red">' + ic("flame") + "Срочное</div>" + urg.map(function (r) { return '<div class="x-dlg" data-r="' + E(r.id) + '"><span class="x-rm red">' + ic("flame") + '</span><div class="m"><b>' + E(r.name) + "</b><span>" + E(r.last ? r.last.user + ": " + r.last.text : "") + "</span></div></div>"; }).join("") : "")
      + '<div class="x-grp">Каналы</div>' + S.rooms.filter(function (r) { return r.kind === "chan"; }).map(roomItem).join("")
      + '<div class="x-grp">Диалоги по задачам</div>' + (S.rooms.filter(function (r) { return r.kind === "task"; }).map(roomItem).join("") || '<p class="x-empty" style="padding:14px">Пока нет. Нажмите «Диалог по задаче» или «Обсуждение» в карточке задачи</p>');
    el.querySelectorAll(".x-dlg").forEach(function (d) { d.onclick = function () { openRoom(d.dataset.r); }; });
    if (C.sync) { /* бейдж меню обновится при следующем опросе */ }
  }
  function openRoom(id, first) {
    S.cur = id; S.msgs = []; S.lastId = 0; S.urg = false;
    if (!first) { try { history.replaceState(null, "", "#/team?room=" + encodeURIComponent(id)); } catch (e) {} }
    paintRooms();
    $("tThread").innerHTML = '<div class="x-empty" style="padding:40px">Загрузка…</div>';
    return C.call("/team/rooms/" + encodeURIComponent(id) + "/messages").then(function (ms) {
      S.msgs = ms; S.lastId = ms.length ? ms[ms.length - 1].id : 0; paintThread(); paintInfo();
      return C.call("/team/rooms/" + encodeURIComponent(id) + "/read", { body: {} }).then(loadRooms).then(function () { C.refresh(); });
    }).catch(function (e) { $("tThread").innerHTML = '<div class="x-empty" style="padding:40px">' + E(e) + "</div>"; });
  }
  function msgHtml(m) {
    var me = C.me && m.user === C.me.name, mine = m.acks && C.me && m.acks.indexOf(C.me.name) >= 0;
    return '<div class="x-msg ' + (m.urgent ? "urg " : "") + (me ? "me" : "") + '">' + ava(m.user, "sm") + '<div class="bd"><div class="nm">' + E(m.user) + "<small>" + when(m.ts) + '</small></div><div class="tx">'
      + (m.urgent ? '<div class="x-urgtag">' + ic("flame") + "Срочное</div>" : "") + E(m.text) + "</div>"
      + (m.urgent ? '<div class="x-ack">' + ic("check") + (m.acks.length ? "Прочитали: " + E(m.acks.join(", ")) : "Пока никто не подтвердил") + (!me && !mine ? '<button data-ack="' + m.id + '">Прочитал(а)</button>' : "") + "</div>" : "") + "</div></div>";
  }
  function paintThread(keep) {
    var el = $("tThread"); if (!el) return;
    var room = S.rooms.filter(function (r) { return r.id === S.cur; })[0] || { name: "Чат", descr: "", kind: "chan", id: S.cur };
    var pin = S.msgs.filter(function (m) { return m.urgent; }).slice(-1)[0];
    var prevDay = "", body = S.msgs.map(function (m) { var d = dayLabel(m.ts), h = (d !== prevDay ? '<span class="x-day">' + d + "</span>" : "") + msgHtml(m); prevDay = d; return h; }).join("");
    var wasBottom = true, old = el.querySelector(".x-msgs"), val = $("tIn") ? $("tIn").value : "";
    if (old && keep) wasBottom = old.scrollHeight - old.scrollTop - old.clientHeight < 80;
    el.innerHTML = '<div class="x-th-h"><span class="x-rm ' + (room.kind === "task" ? "task" : "") + '">' + ic(room.kind === "task" ? "tasks" : (ROOM_IC[room.id] || "hash")) + "</span><div><b>" + E(room.name) + "</b><small>" + E(room.descr) + "</small></div></div>"
      + (pin ? '<div class="x-pinned">' + ic("flame") + "<span>Срочное: " + E(pin.text) + "</span></div>" : "")
      + '<div class="x-msgs">' + (body || '<span class="x-day">Здесь пока пусто — напишите первое сообщение</span>') + "</div>"
      + '<div class="x-comp"><input type="text" id="tIn" placeholder="Написать в «' + E(room.name) + '»… (@Имя — упомянуть)" autocomplete="off"><button class="x-urgbtn ' + (S.urg ? "on" : "") + '" id="tUrg" title="Срочное: придёт всем участникам, даже в тихие часы">' + ic("flame") + 'Срочное</button><button class="x-btn primary" id="tSend" style="padding:12px 14px">' + ic("send") + "</button></div>";
    var m = el.querySelector(".x-msgs"); if (!keep || wasBottom) m.scrollTop = 1e6;
    $("tIn").value = val;
    $("tSend").onclick = send; $("tIn").onkeydown = function (e) { if (e.key === "Enter") send(); };
    $("tUrg").onclick = function () { S.urg = !S.urg; this.classList.toggle("on", S.urg); };
    el.querySelectorAll("[data-ack]").forEach(function (b) { b.onclick = function () { C.call("/team/messages/" + b.dataset.ack + "/ack", { body: {} }).then(function () { return C.call("/team/rooms/" + encodeURIComponent(S.cur) + "/messages"); }).then(function (ms) { S.msgs = ms; paintThread(true); loadRooms(); C.refresh(); }); }; });
  }
  function send() {
    var i = $("tIn"), text = i.value.trim(); if (!text) return;
    var urgent = S.urg; i.disabled = true;
    C.call("/team/rooms/" + encodeURIComponent(S.cur) + "/send", { body: { text: text, urgent: urgent } }).then(function () {
      S.urg = false; i.value = "";
      return C.call("/team/rooms/" + encodeURIComponent(S.cur) + "/messages?after=" + S.lastId);
    }).then(function (ms) { if (ms.length) { S.msgs = S.msgs.concat(ms); S.lastId = ms[ms.length - 1].id; } paintThread(); loadRooms(); if (urgent) toast("Срочное отправлено — сотрудники получат оповещение, даже в тихие часы"); })
      .catch(function (e) { i.disabled = false; toast(E(e)); });
  }
  function paintInfo() {
    var el = $("tInfo"); if (!el) return;
    var room = S.rooms.filter(function (r) { return r.id === S.cur; })[0], urgs = S.msgs.filter(function (m) { return m.urgent; });
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
    }).catch(function (e) { if (e !== "cancel") toast(E(e)); });
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
        C.undoEntry(e).then(function () { e.undone = 1; paintLog(); toast("Изменение отменено"); }).catch(function (er) { b.disabled = false; toast(E(er)); });
      };
    });
  }

  /* ================================================================
     ЛИЧНЫЙ КАБИНЕТ
     ================================================================ */
  var P = { tab: "notif" };
  var EVENTS = [["reminder", "Моё напоминание", "Из раздела «Мои задачи»"], ["urgent", "Срочное в чатах", "Всегда пробивает тихие часы, если включено ниже"], ["mention", "Упоминание @Имя", "Когда вас позвали в чате"], ["chat", "Новое сообщение в чате", "Любое сообщение (может быть шумно)"],
    ["task", "Этап перешёл ко мне", "Задача пришла на ваш этап"], ["deadline", "Скоро дедлайн этапа", "За сколько дней — настраивает руководитель в «Автоматизации»"],
    ["overdue", "Дедлайн просрочен", "Задача на вашем этапе просрочена"], ["lead", "Клиенты и заявки", "Нет контакта, КП без ответа, КП выиграно"], ["mail", "Письма мне", "Письма и диалоги, переданные вам"]];

  function renderMe() {
    var el = $("me-app"), sub = "Настройки уведомлений, профиль и доступ сотрудников";
    if (!gate(el, "Личный кабинет", sub, renderMe)) return;
    var u = C.me, tabs = [["notif", "bell", "Уведомления"], ["info", "user", "Профиль"]].concat(u.role === "admin" ? [["staff", "users", "Сотрудники"]] : []);
    el.innerHTML = head("Личный кабинет", sub) + '<div class="wrap"><div class="prof2">' + ava(u.name, "xl") + "<div><h2>" + E(u.name) + "</h2><p>" + (u.title ? E(u.title) + " · " : "") + (u.role === "admin" ? "Руководитель" : "Сотрудник") + '</p><div class="pf-pills"><span>' + (u.tg ? "Telegram подключён" : "Telegram не подключён") + '</span><span>' + (C.pushOn && C.pushOn() ? "Push включён" : "Push выключен") + '</span></div></div>' + '<div class="pf-stats"><div><b>' + ((C.sync || {}).notif_unread || 0) + '</b><small>новых уведомлений</small></div><div><b>' + ((C.sync || {}).team_unread || 0) + '</b><small>непрочитано в «Команде»</small></div><div><b>' + (((C.sync || {}).urgent || []).length) + '</b><small>срочных</small></div></div><button class="x-btn ghost" id="meOut">Выйти</button></div>'
      + '<div class="x-bar"><div class="x-seg" id="meTabs">' + tabs.map(function (t) { return '<button data-t="' + t[0] + '" class="' + (P.tab === t[0] ? "on" : "") + '">' + ic(t[1]) + t[2] + "</button>"; }).join("") + '</div></div><div id="meBody"></div></div>';
    $("meOut").onclick = function () { C.logout().then(renderMe); };
    $("meTabs").querySelectorAll("button").forEach(function (b) { b.onclick = function () { P.tab = b.dataset.t; renderMe(); }; });
    if (P.tab === "notif") paintNotif(); else if (P.tab === "info") paintInfo2(); else paintStaff();
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
    $("mePush").onclick = function () { var p = pushOn ? C.disablePush() : C.enablePush(); p.then(function () { toast(pushOn ? "Push отключён" : "Push включён на этом устройстве"); paintNotif(); }).catch(function (e) { toast(E(e)); }); };
    var tgb = $("meTg"); if (tgb) tgb.onclick = function () {
      if (tg) C.call("/me/tg/unlink", { body: {} }).then(function () { C.me.tg = false; renderMe(); });
      else C.call("/me/tg/code", { body: {} }).then(function (r) { $("meTgCode").innerHTML = '<p class="x-sub" style="margin:8px 0 0">Откройте вашего бота в Telegram и отправьте: <b>/start ' + r.code + "</b><br>Код действует " + r.minutes + " минут. После привязки обновите страницу.</p>"; }).catch(function (e) { toast(E(e)); });
    };
    body.querySelectorAll(".x-cb").forEach(function (b) { b.onclick = function () { var e = b.dataset.e, c = b.dataset.c, v = !pr.events[e][c], patch = { events: {} }; patch.events[e] = {}; patch.events[e][c] = v; savePrefs(patch).then(function () { b.classList.toggle("on", v); }).catch(function (er) { toast(E(er)); }); }; });
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
  function paintStaff() {
    var body = $("meBody"); body.innerHTML = '<div class="x-panel"><div class="x-empty">Загрузка…</div></div>';
    C.call("/admin/users").then(function (us) {
      body.innerHTML = '<div class="x-two"><div class="x-panel" id="stList">' + us.map(function (u) { return '<div class="x-urow">' + ava(u.name) + "<div><b>" + E(u.name) + "</b><small>" + (u.role === "admin" ? "руководитель" : "сотрудник") + (u.tg ? " · Telegram" : "") + (u.active ? "" : " · отключён") + '</small></div><div class="acts"><button class="x-btn ghost" style="padding:7px 12px" data-pin="' + u.id + '">Сбросить PIN</button><button class="x-btn ghost" style="padding:7px 12px" data-role="' + u.id + '" data-r="' + u.role + '">' + (u.role === "admin" ? "Сделать сотрудником" : "Сделать руководителем") + '</button><button class="x-sw ' + (u.active ? "on" : "") + '" data-act="' + u.id + '" title="Доступ"></button></div></div>'; }).join("") + "</div>"
        + '<div class="x-sticky"><div class="x-panel pad"><h3>Новый сотрудник</h3><p class="x-sub">PIN сообщите сотруднику лично</p><div class="x-field"><label>Имя</label><input type="text" id="nName"></div><div class="x-field"><label>PIN (4–8 цифр)</label><input type="password" id="nPin" inputmode="numeric" maxlength="8"></div><div class="x-err" id="nErr"></div><button class="x-btn primary" id="nAdd">' + ic("plus") + "Добавить</button></div></div></div>";
      $("nAdd").onclick = function () { C.call("/admin/users", { body: { name: $("nName").value, pin: $("nPin").value, role: "user" } }).then(function () { toast("Сотрудник добавлен"); paintStaff(); }).catch(function (e) { $("nErr").textContent = String(e); }); };
      body.querySelectorAll("[data-act]").forEach(function (b) { b.onclick = function () { var on = !b.classList.contains("on"); C.call("/admin/users/" + b.dataset.act + "/active", { body: { active: on } }).then(paintStaff).catch(function (e) { toast(E(e)); }); }; });
      body.querySelectorAll("[data-role]").forEach(function (b) { b.onclick = function () { C.call("/admin/users/" + b.dataset.role + "/role", { body: { role: b.dataset.r === "admin" ? "user" : "admin" } }).then(paintStaff).catch(function (e) { toast(E(e)); }); }; });
      body.querySelectorAll("[data-pin]").forEach(function (b) {
        b.onclick = function () {
          xmodal('<h3>Сбросить PIN</h3><p class="x-sub">Новый PIN сотрудника (4–8 цифр). Он будет разлогинен на всех устройствах.</p><div class="x-field"><input type="password" id="rPin" class="x-pin" inputmode="numeric" maxlength="8"></div><div class="x-err" id="rErr"></div><div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button><button class="x-btn primary" id="rGo">Сохранить</button></div>');
          $("rGo").onclick = function () { C.call("/admin/users/" + b.dataset.pin + "/pin", { body: { pin: $("rPin").value } }).then(function () { T.closeModal(); toast("PIN обновлён"); }).catch(function (e) { $("rErr").textContent = String(e); }); };
        };
      });
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
