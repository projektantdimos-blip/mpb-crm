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
    var el = $("team-app"), sub = "Внутренние чаты: общий, проектный, операционный отделы, отдел продаж и отдельный диалог по каждой задаче";
    if (!gate(el, "Команда", sub, renderTeam)) { stopTimer(); return; }
    var q = /[?&]room=([^&]+)/.exec(location.hash); if (q) S.cur = decodeURIComponent(q[1]);
    var isOwner = C.me && (C.me.position === "owner" || C.me.role === "admin");
    el.innerHTML = head("Команда", sub, '<div class="x-chips"><span class="x-chip on" id="tUrgChip">' + ic("flame") + 'Срочное <b id="tUrgN">0</b></span>'
      + (isOwner ? '<label class="x-chip" style="cursor:pointer" title="Новые сообщения заказчиков из Telegram, MAX и почты копируются в закрытый канал «Отдел продаж»"><input type="checkbox" id="tMirror" style="margin-right:6px">Диалоги заказчиков в канал продаж</label>' : "") + "</div>")
      + '<div class="wrap"><div class="x-chat"><div class="x-dlgs"><div class="hd"><button class="x-btn primary" id="tDm" style="justify-content:center;width:100%">' + ic("plus") + 'Личное сообщение</button><button class="x-btn ghost" id="tNew" style="justify-content:center;width:100%;margin-top:8px">' + ic("tasks") + 'Диалог по задаче</button><input type="text" id="tSearch" placeholder="Поиск по чатам…" autocomplete="off" style="width:100%;margin-top:8px;border:1px solid var(--line);border-radius:12px;padding:9px 12px;background:var(--surface);color:var(--ink)"></div><div class="sc" id="tRooms"></div></div><div class="x-thread" id="tThread"></div><div class="x-info" id="tInfo"></div></div></div>';
    if (q) { var ch1 = document.querySelector(".x-chat"); if (ch1) ch1.classList.add("open"); }                   /* ссылка на чат открывает его сразу */
    $("tNew").onclick = newTaskRoom;
    if ($("tMirror")) {
      C.call("/../ds/settings/mirror").then(function (r) { $("tMirror").checked = !!r.on; }).catch(function () {});
      $("tMirror").onchange = function () {
        var on = this.checked, box = this;
        C.call("/../ds/settings/mirror", { body: { on: on } }).then(function () { toast(on ? "Диалоги заказчиков будут копироваться в канал «Отдел продаж»" : "Копирование в общий чат выключено"); }).catch(function (e) { box.checked = !on; toast(E(e)); });
      };
    }
    $("tDm").onclick = newDm;
    $("tSearch").oninput = paintRooms;
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
  function roomIcon(r) {
    if (r.kind === "dm" && /^d\d+_\d+$/.test(r.id)) return ava(r.name, "sm");
    return '<span class="x-rm ' + (r.kind === "task" ? "task" : "") + '">' + ic(r.kind === "task" ? "tasks" : (ROOM_IC[r.id] || "hash")) + "</span>";
  }
  function roomItem(r) {
    var hasU = r.urgent_open > 0, last = r.last;
    return '<div class="x-dlg ' + (r.id === S.cur ? "on" : "") + '" data-r="' + E(r.id) + '">' + roomIcon(r) + '<div class="m"><b>' + E(r.name) + (hasU ? '<span class="x-flame">' + ic("flame") + "</span>" : "") + "</b><span>" + (last ? E(last.user) + ": " + E(last.text) : E(r.descr)) + '</span></div><div class="tm">' + (last ? when(last.ts) : "") + "<br>" + (r.unread ? '<span class="x-un ' + (hasU ? "red" : "") + '">' + r.unread + "</span>" : "") + "</div></div>";
  }
  function paintRooms() {
    var el = $("tRooms"); if (!el) return;
    var urg = S.rooms.filter(function (r) { return r.urgent_open > 0; }), n = urg.reduce(function (a, r) { return a + r.urgent_open; }, 0);
    if ($("tUrgN")) $("tUrgN").textContent = n;
    var q = ($("tSearch") && $("tSearch").value || "").trim().toLowerCase();
    var ok = function (r) { return !q || (r.name + " " + (r.descr || "") + " " + (r.last ? r.last.text : "")).toLowerCase().indexOf(q) >= 0; };
    var dms = S.rooms.filter(function (r) { return r.kind === "dm" && ok(r); });
    var chans = S.rooms.filter(function (r) { return r.kind === "chan" && ok(r); });
    var tasks = S.rooms.filter(function (r) { return r.kind === "task" && ok(r); });
    el.innerHTML = (urg.length ? '<div class="x-grp red">' + ic("flame") + "Срочное</div>" + urg.map(function (r) { return '<div class="x-dlg" data-r="' + E(r.id) + '"><span class="x-rm red">' + ic("flame") + '</span><div class="m"><b>' + E(r.name) + "</b><span>" + E(r.last ? r.last.user + ": " + r.last.text : "") + "</span></div></div>"; }).join("") : "")
      + '<div class="x-grp">Личные сообщения</div>' + (dms.map(roomItem).join("") || '<p class="x-empty" style="padding:14px">' + (q ? "Ничего не найдено" : "Пока нет. Нажмите «Личное сообщение»") + "</p>")
      + '<div class="x-grp">Каналы</div>' + chans.map(roomItem).join("")
      + '<div class="x-grp">Диалоги по задачам</div>' + (tasks.map(roomItem).join("") || '<p class="x-empty" style="padding:14px">' + (q ? "Ничего не найдено" : "Чат создаётся сам при подписании договора. Свою задачу можно найти кнопкой «Диалог по задаче»") + "</p>");
    el.querySelectorAll(".x-dlg").forEach(function (d) { d.onclick = function () { openRoom(d.dataset.r); }; });
    if (C.sync) { /* бейдж меню обновится при следующем опросе */ }
  }
  function openRoom(id, first) {
    S.cur = id; S.msgs = []; S.lastId = 0; S.urg = false;
    if (!first) { var ch0 = document.querySelector(".x-chat"); if (ch0) ch0.classList.add("open"); }      /* на телефоне: список → чат */
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
      + (m.urgent ? '<div class="x-urgtag">' + ic("flame") + "Срочное</div>" : "") + E(m.text)
      + (m.files && m.files.length ? '<div class="x-files">' + m.files.map(function (f) { return '<button class="x-file" data-tfile="' + f.id + '" title="Скачать">📎 ' + E(f.name) + "<small>" + Math.max(1, Math.round(f.size / 1024)) + " КБ</small></button>"; }).join("") + "</div>" : "") + "</div>"
      + (m.urgent ? '<div class="x-ack">' + ic("check") + (m.acks.length ? "Прочитали: " + E(m.acks.join(", ")) : "Пока никто не подтвердил") + (!me && !mine ? '<button data-ack="' + m.id + '">Прочитал(а)</button>' : "") + "</div>" : "") + "</div></div>";
  }
  function paintThread(keep) {
    var el = $("tThread"); if (!el) return;
    var room = S.rooms.filter(function (r) { return r.id === S.cur; })[0] || { name: "Чат", descr: "", kind: "chan", id: S.cur };
    var pin = S.msgs.filter(function (m) { return m.urgent; }).slice(-1)[0];
    var prevDay = "", body = S.msgs.map(function (m) { var d = dayLabel(m.ts), h = (d !== prevDay ? '<span class="x-day">' + d + "</span>" : "") + msgHtml(m); prevDay = d; return h; }).join("");
    var wasBottom = true, old = el.querySelector(".x-msgs"), val = $("tIn") ? $("tIn").value : "";
    if (old && keep) wasBottom = old.scrollHeight - old.scrollTop - old.clientHeight < 80;
    el.innerHTML = '<div class="x-th-h"><button class="x-btn ghost x-back" data-back="1" style="padding:6px 10px">←</button>' + roomIcon(room) + "<div><b>" + E(room.name) + "</b><small>" + E(room.descr) + "</small></div>"
      + (room.kind === "task" && room.task_row ? '<a class="x-btn ghost" style="margin-left:auto;padding:7px 12px" href="#/task/' + room.task_row + '">Открыть задачу</a>' : "") + "</div>"
      + (pin ? '<div class="x-pinned">' + ic("flame") + "<span>Срочное: " + E(pin.text) + "</span></div>" : "")
      + '<div class="x-msgs">' + (body || '<span class="x-day">Здесь пока пусто — напишите первое сообщение</span>') + "</div>"
      + '<div class="x-comp"><button class="x-btn ghost" id="tAtt" title="Прикрепить файл (до 10 МБ). Файл можно перетащить прямо в окно чата" style="padding:12px 13px">📎</button><input type="file" id="tFile" hidden><input type="text" id="tIn" placeholder="Написать в «' + E(room.name) + '»… (@Имя — упомянуть)" autocomplete="off"><button class="x-urgbtn ' + (S.urg ? "on" : "") + '" id="tUrg" title="Срочное: придёт всем участникам, даже в тихие часы">' + ic("flame") + 'Срочное</button><button class="x-btn primary" id="tSend" style="padding:12px 14px">' + ic("send") + "</button></div>";
    var m = el.querySelector(".x-msgs"); if (!keep || wasBottom) m.scrollTop = 1e6;
    var bk = el.querySelector("[data-back]"); if (bk) bk.onclick = function () { var ch = document.querySelector(".x-chat"); if (ch) ch.classList.remove("open"); };
    $("tIn").value = val;
    $("tSend").onclick = send;
    $("tAtt").onclick = function () { $("tFile").click(); };
    $("tFile").onchange = function () { var f = this.files && this.files[0]; this.value = ""; if (f) sendFile(f); };
    el.ondragover = function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0) { e.preventDefault(); el.classList.add("x-drop"); } };
    el.ondragleave = function (e) { if (!el.contains(e.relatedTarget)) el.classList.remove("x-drop"); };
    el.ondrop = function (e) { el.classList.remove("x-drop"); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { e.preventDefault(); sendFile(f); } };
    el.querySelectorAll("[data-tfile]").forEach(function (b) {
      b.onclick = function () {
        C.blob("/crm/team/files/" + b.dataset.tfile).then(function (r) {
          var a = document.createElement("a"); a.href = URL.createObjectURL(r.blob); a.download = r.name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        }).catch(function (e) { toast(E(e)); });
      };
    });
    mentionBox($("tIn"));
    $("tIn").onkeydown = function (e) { if (e.key === "Enter" && !(document.getElementById("tMent") && document.getElementById("tMent").children.length)) send(); };
    $("tUrg").onclick = function () { S.urg = !S.urg; this.classList.toggle("on", S.urg); };
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
  function sendFile(f) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast("Файл больше 10 МБ"); return; }
    var i = $("tIn"), text = i ? i.value.trim() : "", urgent = S.urg, rd = new FileReader();
    rd.onload = function () {
      var b64 = String(rd.result || "").split(",")[1];
      toast("Загружаю «" + f.name + "»…");
      C.call("/team/rooms/" + encodeURIComponent(S.cur) + "/send-file", { body: { text: text, filename: f.name, mime: f.type || "application/octet-stream", data: b64, urgent: urgent } }).then(function () {
        S.urg = false; if ($("tIn")) $("tIn").value = "";
        return C.call("/team/rooms/" + encodeURIComponent(S.cur) + "/messages?after=" + S.lastId);
      }).then(function (ms) { if (ms.length) { S.msgs = S.msgs.concat(ms); S.lastId = ms[ms.length - 1].id; } paintThread(); loadRooms(); })
        .catch(function (e) { toast(E(e)); });
    };
    rd.onerror = function () { toast("Не удалось прочитать файл"); };
    rd.readAsDataURL(f);
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
    el.innerHTML = (room && room.kind === "task" ? '<div><h6>Задача</h6><a class="x-linkcard" href="#/task/' + room.task_row + '"><span class="x-rm task">' + ic("tasks") + "</span><span><b>" + E(room.name) + "</b><small>Открыть карточку задачи</small></span></a></div>" : '<div><h6>' + (room && room.kind === "dm" ? "Личная переписка" : "О канале") + '</h6><p style="font-size:.86rem;color:var(--muted);margin:0">' + E(room ? room.descr : "") + "</p></div>")
      + "<div><h6>" + (room && room.kind === "dm" ? "Участники" : "Сотрудники") + "</h6>" + ((room && room.kind === "dm" ? [C.me && C.me.name, room.name].filter(Boolean) : S.users).map(function (n) { return '<div class="x-member">' + ava(n, "sm") + E(n) + (C.me && n === C.me.name ? '<small style="margin-left:auto;color:var(--muted)">вы</small>' : "") + "</div>"; }).join("") || '<p class="x-empty" style="padding:6px">—</p>') + "</div>"
      + (room && room.kind === "chan" && room.id !== "general" && C.me && (C.me.position === "owner" || C.me.role === "admin") ? '<div id="tAccess"><h6>Кто видит канал</h6><p style="font-size:.84rem;color:var(--muted);margin:0">Загрузка…</p></div>' : "")
      + "<div><h6>Срочные в этом чате</h6>" + (urgs.slice(-4).map(function (m) { return '<div class="x-linkcard" style="background:var(--bad-l);border-color:transparent;color:var(--bad)">' + ic("flame") + "<span><b>" + E(m.user) + '</b><small style="color:inherit;opacity:.8">' + E(m.text.slice(0, 80)) + "</small></span></div>"; }).join("") || '<p style="font-size:.84rem;color:var(--muted);margin:0">Пока нет</p>') + "</div>";
    if (room && $("tAccess")) loadAccess(room.id);
  }
  function loadAccess(roomId) {
    var box = $("tAccess"); if (!box) return;
    C.call("/../ds/room-access").then(function (r) {
      var cur = (r.rooms.filter(function (x) { return x.id === roomId; })[0] || {}).roles;
      if (!cur) cur = r.positions.map(function (p) { return p.id; });
      box.innerHTML = '<h6>Кто видит канал</h6><p style="font-size:.8rem;color:var(--muted);margin:0 0 8px">Руководитель видит всегда. Остальные получают и сообщения, и уведомления только если отмечены.</p>'
        + r.positions.map(function (p) { return '<label class="x-member" style="cursor:pointer"><input type="checkbox" data-acc="' + p.id + '" ' + (cur.indexOf(p.id) >= 0 ? "checked" : "") + ' style="margin-right:8px">' + E(p.title) + "</label>"; }).join("");
      box.querySelectorAll("[data-acc]").forEach(function (cb) {
        cb.onchange = function () {
          var roles = [].slice.call(box.querySelectorAll("[data-acc]:checked")).map(function (x) { return x.dataset.acc; });
          C.call("/../ds/room-access", { body: { room_id: roomId, roles: roles } }).then(function () { toast("Права на канал сохранены"); }).catch(function (e) { cb.checked = !cb.checked; toast(E(e)); });
        };
      });
    }).catch(function (e) { box.innerHTML = '<h6>Кто видит канал</h6><p style="font-size:.84rem;color:var(--bad)">' + E(e) + "</p>"; });
  }
  function newTaskRoom() {
    xmodal('<h3>Диалог по задаче</h3><p class="x-sub">Выберите задачу из доступных вам — откроется её чат</p><div class="x-field"><input type="text" id="tFind" placeholder="Номер, заказчик или объект…"></div><div id="tList" style="max-height:50vh;overflow:auto"><div class="x-empty">Загрузка…</div></div><div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Закрыть</button></div>', true);
    var all = [];
    function paint() {
      var q = ($("tFind").value || "").toLowerCase();
      $("tList").innerHTML = all.filter(function (t) { return !q || (t.number + " " + (t.customer || "") + " " + t.object).toLowerCase().indexOf(q) >= 0; }).slice(0, 60).map(function (t) {
        return '<div class="x-linkcard" data-t="' + t.id + '"><span class="x-rm task">' + ic("tasks") + "</span><span><b>№" + E(t.number) + " · " + E(t.customer || "") + "</b><small>" + E(t.object || "") + " · " + E(t.stage) + "</small></span></div>"; }).join("") || '<div class="x-empty">Ничего не найдено</div>';
      $("tList").querySelectorAll("[data-t]").forEach(function (n) { n.onclick = function () { var t = all.filter(function (x) { return x.id === +n.dataset.t; })[0]; T.closeModal(); T.openTaskRoom(t.id, "№" + t.number + " · " + (t.object || "").slice(0, 60)); }; });
    }
    C.call("/../ds/orders").then(function (ts) { all = ts; paint(); }).catch(function (e) { $("tList").innerHTML = '<div class="x-empty">' + E(e) + "</div>"; });
    $("tFind").oninput = paint;
  }
  /* личное сообщение: выбираем сотрудника, чат создаётся (или открывается уже существующий) */
  function newDm() {
    xmodal('<h3>Личное сообщение</h3><p class="x-sub">Переписку видите только вы и собеседник</p><div class="x-field"><input type="text" id="tFindU" placeholder="Поиск сотрудника…" autocomplete="off"></div><div id="tUList" style="max-height:50vh;overflow:auto"><div class="x-empty">Загрузка…</div></div><div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Закрыть</button></div>', true);
    var all = [];
    function paint() {
      var q = ($("tFindU").value || "").toLowerCase(), me = C.me ? C.me.id : 0;
      $("tUList").innerHTML = all.filter(function (u) { return u.id !== me && (!q || (u.name + " " + (u.title || "")).toLowerCase().indexOf(q) >= 0); }).map(function (u) {
        return '<div class="x-linkcard" data-u="' + u.id + '">' + ava(u.name, "sm") + "<span><b>" + E(u.name) + "</b><small>" + E(u.title || "") + "</small></span></div>"; }).join("") || '<div class="x-empty">Никого не найдено</div>';
      $("tUList").querySelectorAll("[data-u]").forEach(function (n) {
        n.onclick = function () {
          C.call("/../ds/dm", { body: { user_id: +n.dataset.u } }).then(function (r) {
            T.closeModal();
            if (cur() === "team") { S.cur = r.id; loadRooms().then(function () { openRoom(r.id); }); } else location.hash = "#/team?room=" + r.id;
          }).catch(function (e) { toast(E(e)); });
        };
      });
    }
    C.call("/people").then(function (l) { all = l; paint(); }).catch(function (e) { $("tUList").innerHTML = '<div class="x-empty">' + E(e) + "</div>"; });
    $("tFindU").oninput = paint;
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
    var fs = ["Все", "Задача", "КП", "Заказчик", "Чат", "Настройки"];
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
  var EVENTS = [["reminder", "Моё напоминание", "Из раздела «Мои задачи»"], ["urgent", "Срочное", "Срочные работы и срочные сообщения в чатах; пробивает тихие часы, если включено ниже"],
    ["mention", "Упоминание и личные сообщения", "Вас позвали через @Имя или написали лично"], ["chat", "Новое сообщение в чате", "Любое сообщение в каналах (может быть шумно)"],
    ["task", "Мне поставлена задача", "Договор подписан, задача пришла на ваш этап, назначены исполнителем, затянулась стадия"], ["deadline", "Скоро срок по договору", "За сколько дней — настраивает руководитель в «Автоматизации»"],
    ["overdue", "Срок по договору просрочен", "По вашей задаче срок по договору прошёл"], ["lead", "Оплата и КП", "Аванс и оплата получены, КП без ответа, аванс не пришёл"],
    ["mail", "Заказчик написал", "Новые сообщения заказчиков в Telegram, MAX и почте"]];
  var POS_TITLE = { owner: "Руководитель", design: "Руководитель проектного отдела", sales: "Руководитель отдела продаж", ops: "Операционный менеджер", acc: "Бухгалтер", designer: "Проектировщик" };

  function renderMe() {
    var el = $("me-app"), sub = "Настройки уведомлений, профиль и доступ сотрудников";
    if (!gate(el, "Личный кабинет", sub, renderMe)) return;
    var u = C.me, tabs = [["notif", "bell", "Уведомления"], ["info", "user", "Профиль"]].concat(u.role === "admin" ? [["staff", "users", "Сотрудники"]] : []);
    el.innerHTML = head("Личный кабинет", sub) + '<div class="wrap"><div class="prof2">' + ava(u.name, "xl") + "<div><h2>" + E(u.name) + "</h2><p>" + (u.title ? E(u.title) + " · " : "") + (POS_TITLE[u.position] || (u.role === "admin" ? "Руководитель" : "Сотрудник")) + '</p><div class="pf-pills"><span>' + (u.tg ? "Telegram подключён" : "Telegram не подключён") + '</span><span>' + (C.pushOn && C.pushOn() ? "Push включён" : "Push выключен") + '</span></div></div>' + '<div class="pf-stats"><div><b>' + ((C.sync || {}).notif_unread || 0) + '</b><small>новых уведомлений</small></div><div><b>' + ((C.sync || {}).team_unread || 0) + '</b><small>непрочитано в «Команде»</small></div><div><b>' + (((C.sync || {}).urgent || []).length) + '</b><small>срочных</small></div></div><button class="x-btn ghost" id="meOut">Выйти</button></div>'
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
      + '<div class="x-chc"><div class="t"><span class="x-rm">' + ic("phone") + "</span><div><b>Push на это устройство</b><small>" + (pushOk ? (pushOn ? "Подключено" : "Выключено") : (C.pushWhy ? C.pushWhy() : "") || "Недоступно на этом устройстве") + '</small></div></div><button class="x-btn ' + (pushOn ? "ghost" : "primary") + '" id="mePush" ' + "" + ">" + (pushOn ? "Отключить" : "Включить") + "</button></div>"
      + '<div class="x-chc"><div class="t"><span class="x-rm">' + ic("send") + "</span><div><b>Telegram</b><small>" + (!C.bot ? "Бот не подключён на сервере" : tg ? "Подключён" : "Не привязан") + '</small></div></div>' + (C.bot ? '<button class="x-btn ' + (tg ? "ghost" : "primary") + '" id="meTg">' + (tg ? "Отвязать" : "Получить код") + "</button>" : '<span class="x-pill">нужен TG_BOT_TOKEN</span>') + '<div id="meTgCode"></div></div></div>'
      + '<div class="x-panel" style="margin-bottom:18px"><div style="padding:18px 20px 4px"><h3>Что и куда присылать</h3><p class="x-sub">Отметьте, какие события вам важны и в каком канале о них сообщать</p></div><div style="overflow-x:auto"><table class="x-mx"><thead><tr><th>Событие</th><th>В приложении</th><th>Push</th><th>Telegram</th></tr></thead><tbody>'
      + EVENTS.map(function (e) { return "<tr><td>" + e[1] + "<small>" + e[2] + "</small></td>" + ["app", "push", "telegram"].map(function (ch) { return '<td><button class="x-cb ' + (pr.events[e[0]][ch] ? "on" : "") + '" data-e="' + e[0] + '" data-c="' + ch + '">' + ic("check") + "</button></td>"; }).join("") + "</tr>"; }).join("")
      + "</tbody></table></div></div>"
      + '<div class="x-panel pad"><h3>Тихие часы</h3><p class="x-sub">Чтобы работа не мешала отдыху. «Срочное» можно оставить сквозным</p>'
      + '<div class="x-qrow"><div><b>Не беспокоить</b><small>Push и Telegram молчат, внутри приложения всё сохраняется</small></div><button class="x-sw ' + (pr.quiet.on ? "on" : "") + '" id="qOn"></button></div>'
      + '<div class="x-qrow"><div><b>С</b></div><input type="time" id="qFrom" value="' + pr.quiet.from + '"><div style="margin-left:14px"><b>До</b></div><input type="time" id="qTo" value="' + pr.quiet.to + '"></div>'
      + '<div class="x-qrow"><div><b>«Срочное» пробивает тишину</b><small>Срочные сообщения придут всегда</small></div><button class="x-sw ' + (pr.quiet.urgent_through ? "on" : "") + '" id="qUrg"></button></div></div>'
      + '</div><div class="x-sticky"><div class="x-panel pad"><h3>Проверка</h3><p class="x-sub">Отправим тестовое уведомление по вашим настройкам</p><button class="x-btn primary" id="meTest" style="width:100%;justify-content:center">' + ic("bell") + 'Отправить тест</button><div class="x-hint" id="meTestOut"></div>'
      + '<h3 style="margin-top:16px">Звук в CRM</h3><p class="x-sub">Сигнал при новых сообщениях и уведомлениях, пока CRM открыта</p>'
      + '<div class="x-qrow"><div><b>Звук включён</b></div><button class="x-sw ' + (window.DSSound && DSSound.get().on ? "on" : "") + '" id="sndOn"></button></div>'
      + '<div class="x-qrow"><div><b>Громкость</b></div><input type="range" id="sndVol" min="0.1" max="1" step="0.1" value="' + (window.DSSound ? DSSound.get().vol : 0.9) + '" style="flex:1;margin-left:12px"></div>'
      + '<button class="x-btn ghost" id="sndTest" style="width:100%;justify-content:center">Проверить звук</button></div></div></div>';
    var sOn = $("sndOn"), sVol = $("sndVol"), sTest = $("sndTest");
    if (sOn) sOn.onclick = function () { var on = !DSSound.get().on; DSSound.set({ on: on }); sOn.classList.toggle("on", on); };
    if (sVol) sVol.oninput = function () { DSSound.set({ vol: sVol.value }); };
    if (sTest) sTest.onclick = function () { DSSound.test(); };
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
      C.call("/me/pin", { body: { old: $("pOld").value, new: $("pNew").value } }).then(function () { C.me = null; try { localStorage.removeItem("ds_session"); } catch (e) {} toast("PIN изменён — войдите заново"); renderMe(); }).catch(function (e) { $("pErr").textContent = String(e); });
    };
  }
  function paintStaff() {
    var body = $("meBody"); body.innerHTML = '<div class="x-panel"><div class="x-empty">Загрузка…</div></div>';
    C.call("/admin/users").then(function (us) {
      body.innerHTML = '<div class="x-two"><div class="x-panel" id="stList">' + us.map(function (u) { return '<div class="x-urow">' + ava(u.name) + "<div><b>" + E(u.name) + "</b><small>" + (POS_TITLE[u.position] || "роль не назначена") + (u.tg ? " · Telegram" : "") + (u.active ? "" : " · отключён") + '</small></div><div class="acts"><button class="x-btn ghost" style="padding:7px 12px" data-pin="' + u.id + '">Сбросить PIN</button><select data-pos="' + u.id + '" style="border:1px solid var(--line);border-radius:10px;padding:6px 8px;background:var(--surface);color:var(--ink)">' + (u.position ? "" : '<option value="">— роль —</option>') + Object.keys(POS_TITLE).map(function (k) { return '<option value="' + k + '"' + (u.position === k ? " selected" : "") + ">" + POS_TITLE[k] + "</option>"; }).join("") + '</select><button class="x-sw ' + (u.active ? "on" : "") + '" data-act="' + u.id + '" title="Доступ"></button></div></div>'; }).join("") + "</div>"
        + '<div class="x-sticky"><div class="x-panel pad"><h3>Новый сотрудник</h3><p class="x-sub">PIN сообщите сотруднику лично</p><div class="x-field"><label>Имя</label><input type="text" id="nName"></div><div class="x-field"><label>Роль в CRM</label><select id="nPos">' + Object.keys(POS_TITLE).map(function (k) { return '<option value="' + k + '"' + (k === "designer" ? " selected" : "") + ">" + POS_TITLE[k] + "</option>"; }).join("") + '</select></div><div class="x-field"><label>PIN (4–8 цифр)</label><input type="password" id="nPin" inputmode="numeric" maxlength="8"></div><div class="x-err" id="nErr"></div><button class="x-btn primary" id="nAdd">' + ic("plus") + "Добавить</button></div></div></div>";
      $("nAdd").onclick = function () { C.call("/admin/users", { body: { name: $("nName").value, pin: $("nPin").value, role: $("nPos").value === "owner" ? "admin" : "user", position: $("nPos").value } }).then(function () { toast("Сотрудник добавлен"); paintStaff(); }).catch(function (e) { $("nErr").textContent = String(e); }); };
      body.querySelectorAll("[data-act]").forEach(function (b) { b.onclick = function () { var on = !b.classList.contains("on"); C.call("/admin/users/" + b.dataset.act + "/active", { body: { active: on } }).then(paintStaff).catch(function (e) { toast(E(e)); }); }; });
      body.querySelectorAll("[data-pos]").forEach(function (s) { s.onchange = function () { if (!s.value) return; C.call("/admin/users/" + s.dataset.pos + "/position", { body: { position: s.value } }).then(function () { toast("Роль изменена"); paintStaff(); }).catch(function (e) { toast(E(e)); paintStaff(); }); }; });
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
