/* МПБ CRM v2 — этап 2б: связь с мостом (/api/crm), вход по PIN, уведомления, журнал изменений.
   Адрес и ключ моста — те же, что у «Общения» (⚙, localStorage: mpb_bridge). Личная сессия — localStorage: mpb_session.
   Если мост не подключён или вход не выполнен, остальное приложение работает как раньше. */
(function () {
  "use strict";
  var C = window.MPBC = { me: null, prefs: null, sync: null, bot: false, users: [] };
  var listeners = {};
  C.on = function (n, f) { (listeners[n] = listeners[n] || []).push(f); };
  function emit(n, a) { (listeners[n] || []).forEach(function (f) { try { f(a); } catch (e) { console.error(e); } }); }
  function $(id) { return document.getElementById(id); }
  function E(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function ic(n) { return window.icon ? window.icon(n) : ""; }

  /* ---------- настройки и запросы ---------- */
  function cfg() {
    try { var c = JSON.parse(localStorage.getItem("mpb_bridge") || "{}"); return { url: String(c.url || "").replace(/\/+$/, ""), key: c.key || "" }; }
    catch (e) { return { url: "", key: "" }; }
  }
  function tok() { try { return localStorage.getItem("mpb_session") || ""; } catch (e) { return ""; } }
  function setSession(t) { try { if (t) localStorage.setItem("mpb_session", t); else localStorage.removeItem("mpb_session"); } catch (e) {} }
  C.configured = function () { var c = cfg(); return !!(c.url && c.key); };
  C.loggedIn = function () { return !!(C.me && tok()); };

  C.call = function (path, opts) {
    opts = opts || {};
    var c = cfg();
    if (!c.url || !c.key) return Promise.reject("Мост не подключён: адрес и ключ — в ⚙ (как для «Общения»)");
    var h = { "X-Api-Key": c.key, "Content-Type": "application/json" };
    if (opts.auth !== false && tok()) h["X-Session"] = tok();
    return fetch(c.url + "/api/crm" + path, {
      method: opts.method || (opts.body ? "POST" : "GET"), cache: "no-store", headers: h,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 401 && opts.auth !== false && tok()) { C.me = null; setSession(""); emit("logout"); throw "Сессия истекла — войдите снова"; }
      if (!r.ok) {
        return r.json().then(function (j) { return j; }, function () { return {}; }).then(function (j) {
          throw (j && typeof j.detail === "string") ? j.detail : ("Ошибка сервера " + r.status);
        });
      }
      return r.json();
    }, function () { throw "Сервер недоступен. Проверьте адрес моста в ⚙ и интернет"; });
  };

  /* ---------- вход ---------- */
  C.init = function () {
    if (!tok() || !C.configured()) { emit("ready"); return Promise.resolve(); }
    return C.call("/me").then(function (r) { C.me = r.user; C.prefs = r.prefs; C.bot = r.bot; startPolling(); emit("login", C.me); })
      .catch(function () { /* сессия недействительна — просто не вошли */ }).then(function () { emit("ready"); });
  };
  C.login = function (name, pin) {
    return C.call("/auth/login", { auth: false, body: { name: name, pin: pin, tz: -new Date().getTimezoneOffset() } }).then(function (r) {
      setSession(r.token); C.me = r.user;
      return C.call("/me").then(function (m) { C.prefs = m.prefs; C.bot = m.bot; startPolling(); emit("login", C.me); return C.me; });
    });
  };
  C.logout = function () {
    var p = C.loggedIn() ? C.call("/auth/logout", { method: "POST", body: {} }).catch(function () {}) : Promise.resolve();
    return p.then(function () { C.me = null; C.sync = null; setSession(""); stopPolling(); emit("logout"); });
  };

  /* окно входа; возвращает Promise, который выполняется после успешного входа */
  C.requireLogin = function () {
    if (C.loggedIn()) return Promise.resolve(C.me);
    return new Promise(function (resolve, reject) {
      var v = $("xLoginVeil");
      if (!v) { v = document.createElement("div"); v.id = "xLoginVeil"; v.className = "x-mveil"; document.body.appendChild(v); }
      v.className = "x-mveil on";
      v.innerHTML = '<div class="x-modal"><h3>Вход в CRM</h3><p class="x-sub">Выберите себя и введите PIN</p><div class="x-field"><label>Сотрудник</label><select id="xLName"><option>Загрузка…</option></select></div>'
        + '<div class="x-field"><label>PIN</label><input type="password" id="xLPin" class="x-pin" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="••••"></div><div class="x-err" id="xLErr"></div>'
        + '<div class="x-row"><button class="x-btn ghost" id="xLCancel">Отмена</button><button class="x-btn primary" id="xLGo">Войти</button></div></div>';
      function close() { v.className = "x-mveil"; v.innerHTML = ""; }
      $("xLCancel").onclick = function () { close(); reject("cancel"); };
      v.onclick = function (e) { if (e.target === v) { close(); reject("cancel"); } };
      C.call("/auth/users", { auth: false }).then(function (names) {
        C.users = names;
        $("xLName").innerHTML = names.length ? names.map(function (n) { return "<option>" + E(n) + "</option>"; }).join("") : "<option value=''>Нет сотрудников</option>";
        var last = ""; try { last = localStorage.getItem("mpb_last_user") || ""; } catch (e) {}
        if (last && names.indexOf(last) >= 0) $("xLName").value = last;
        $("xLPin").focus();
      }).catch(function (e) { $("xLErr").textContent = String(e); });
      function go() {
        var n = $("xLName").value, p = $("xLPin").value;
        if (!n || !p) { $("xLErr").textContent = "Выберите сотрудника и введите PIN"; return; }
        $("xLGo").disabled = true;
        C.login(n, p).then(function (u) { try { localStorage.setItem("mpb_last_user", u.name); } catch (e) {} close(); resolve(u); })
          .catch(function (e) { $("xLGo").disabled = false; $("xLErr").textContent = String(e); $("xLPin").value = ""; $("xLPin").focus(); });
      }
      $("xLGo").onclick = go; $("xLPin").onkeydown = function (e) { if (e.key === "Enter") go(); };
    });
  };

  /* ---------- опрос состояния, срочные и уведомления ---------- */
  var timer = null, shownUrgent = {};
  function startPolling() { stopPolling(); C.refresh(); timer = setInterval(C.refresh, 15000); }
  function stopPolling() { if (timer) { clearInterval(timer); timer = null; } }
  C.refresh = function () {
    if (!C.loggedIn() || document.hidden) return Promise.resolve();
    return C.call("/sync").then(function (s) {
      var prev = C.sync; C.sync = s; paintBadges();
      (s.urgent || []).slice(0, 3).forEach(function (m) { if (!shownUrgent[m.id]) { shownUrgent[m.id] = 1; if (prev || Date.now() / 1000 - m.ts < 86400) urgentBanner(m); } });   // после входа — свежие неподтверждённые срочные тоже всплывают
      emit("sync", s);
    }).catch(function () {});
  };
  document.addEventListener("visibilitychange", function () { if (!document.hidden) C.refresh(); });

  function banners() { var b = $("xBanners"); if (!b) { b = document.createElement("div"); b.id = "xBanners"; b.className = "x-banners"; document.body.appendChild(b); } return b; }
  function urgentBanner(m) {
    var b = document.createElement("div"); b.className = "x-banner urgent";
    b.innerHTML = "<b>" + ic("flame") + " Срочно · " + E(m.room) + "</b><p>" + E(m.user) + ": " + E(m.text) + '</p><div class="acts"><button class="x-btn primary" data-a="ack" style="padding:8px 14px">Прочитал</button><button class="x-btn ghost" data-a="open" style="padding:8px 14px">Открыть</button></div>';
    b.querySelector('[data-a="ack"]').onclick = function () { C.call("/team/messages/" + m.id + "/ack", { body: {} }).then(function () { b.remove(); C.refresh(); }).catch(function () {}); };
    b.querySelector('[data-a="open"]').onclick = function () { b.remove(); location.hash = "#/team?room=" + encodeURIComponent(m.room_id); };
    banners().appendChild(b);
  }
  function paintBadges() {
    var s = C.sync || {}, team = s.team_unread || 0, urg = (s.urgent || []).length;
    document.querySelectorAll('#topnav button[data-goto="#/team"], #bottomnav button[data-goto="#/team"]').forEach(function (b) {
      var o = b.querySelector(".nav-badge"); if (o) o.remove();
      if (team || urg) { var x = document.createElement("span"); x.className = "nav-badge" + (urg ? " red" : ""); x.textContent = team || urg; b.appendChild(x); }
    });
    document.querySelectorAll('#topnav button[data-notif]').forEach(function (b) {
      var o = b.querySelector(".nav-badge"); if (o) o.remove();
      if (s.notif_unread) { var x = document.createElement("span"); x.className = "nav-badge"; x.textContent = s.notif_unread; b.appendChild(x); }
    });
  }
  C.afterNav = function () {                       // вызывается после перерисовки меню
    paintBadges();
    var chip = $("meChip");
    if (chip) {
      chip.innerHTML = C.me ? E(C.me.name) + "<small>" + (C.me.role === "admin" ? "руководитель · кабинет" : "личный кабинет") + "</small>" : "Войти<small>вход по PIN</small>";
      chip.onclick = function () { location.hash = "#/me"; };
    }
    var nb = document.querySelector('#topnav button[data-notif]');
    if (nb) nb.onclick = function (e) { e.stopPropagation(); C.toggleNotifs(); };
  };
  C.on("login", C.afterNav); C.on("logout", C.afterNav); C.on("ready", C.afterNav);

  /* колокольчик: список уведомлений */
  C.toggleNotifs = function () {
    var p = $("xPop");
    if (p && p.classList.contains("on")) { p.classList.remove("on"); return; }
    C.requireLogin().then(function () {
      if (!p) { p = document.createElement("div"); p.id = "xPop"; p.className = "x-pop"; document.body.appendChild(p); }
      p.classList.add("on"); p.innerHTML = '<h6>Уведомления</h6><div class="x-empty" style="padding:20px">Загрузка…</div>';
      C.call("/notifications").then(function (r) {
        p.innerHTML = '<h6>Уведомления<span id="xReadAll">Прочитать все</span></h6>' + (r.items.map(function (n) {
          return '<div class="x-nt ' + (n.is_read ? "" : "unread") + (n.urgent ? " urg" : "") + '" data-u="' + E(n.url) + '"><span class="ni ' + (n.urgent ? "c-bad" : "c-blue") + '">' + ic(n.urgent ? "flame" : "bell") + "</span><div><b>" + E(n.title) + "</b><small>" + E(n.body) + "</small><small>" + new Date(n.ts * 1000).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) + "</small></div></div>";
        }).join("") || '<div class="x-empty" style="padding:26px">Пока уведомлений нет</div>');
        var ra = $("xReadAll"); if (ra) ra.onclick = function () { C.call("/notifications/read", { body: {} }).then(function () { C.refresh(); C.toggleNotifs(); }); };
        p.querySelectorAll(".x-nt").forEach(function (n) { n.onclick = function () { p.classList.remove("on"); var u = n.dataset.u || ""; var i = u.indexOf("#"); if (i >= 0) location.hash = u.slice(i); }; });
        C.call("/notifications/read", { body: {} }).then(function () { setTimeout(C.refresh, 500); }).catch(function () {});
      }).catch(function (e) { p.innerHTML = '<div class="x-empty" style="padding:20px">' + E(e) + "</div>"; });
    }, function () {});
  };
  document.addEventListener("click", function (e) { var p = $("xPop"); if (p && p.classList.contains("on") && !e.target.closest("#xPop") && !e.target.closest("[data-notif]")) p.classList.remove("on"); });

  /* ---------- push на это устройство ---------- */
  function b64ToU8(s) { var p = "=".repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  C.pushSupported = function () { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; };
  C.pushOn = function () { try { return C.pushSupported() && Notification.permission === "granted" && localStorage.getItem("mpb_push_user") === (C.me ? String(C.me.id) : "x"); } catch (e) { return false; } };
  C.enablePush = function () {
    if (!C.pushSupported()) return Promise.reject("Этот браузер не поддерживает push. На iPhone приложение нужно сначала добавить на экран «Домой».");
    return Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") throw "Уведомления не разрешены в браузере";
      return navigator.serviceWorker.register("sw.js").then(function () { return navigator.serviceWorker.ready; });
    }).then(function (reg) {
      return C.call("/push/key").then(function (k) { return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(k.key) }); });
    }).then(function (sub) { return C.call("/me/push/subscribe", { body: sub.toJSON() }); })
      .then(function () { try { localStorage.setItem("mpb_push_user", String(C.me.id)); } catch (e) {} emit("push"); });
  };
  C.disablePush = function () {
    return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      var p = sub ? C.call("/me/push/unsubscribe", { body: { endpoint: sub.endpoint } }).catch(function () {}).then(function () { return sub.unsubscribe(); }) : Promise.resolve();
      return p;
    }).then(function () { try { localStorage.removeItem("mpb_push_user"); } catch (e) {} emit("push"); });
  };

  /* ---------- журнал изменений: перехват сохранений задач и заявок ---------- */
  var known = { tasks: {}, leads: {} };
  C.known = known;
  var TASK_KEYS = ["customer", "address", "contractNo", "workType", "startDate", "dueDate", "stage", "deadline", "siteContact", "siteContactPhone", "comment", "closed", "manager"];
  var LEAD_KEYS = ["date", "customer", "contact", "phoneEmail", "funnel", "object", "essence", "amount", "status", "lastContact", "owner", "comment"];
  var LABELS = { customer: "Заказчик", address: "Адрес", contractNo: "Договор", workType: "Вид работ", startDate: "Начало", dueDate: "Срок договора", stage: "Этап", deadline: "Дедлайн этапа", siteContact: "Контакт на объекте", siteContactPhone: "Телефон", comment: "Комментарий", closed: "Закрыта", manager: "Ответственный за заказчика",
    date: "Дата заявки", contact: "Контакт", phoneEmail: "Телефон / Email", funnel: "Воронка", object: "Объект", essence: "Суть", amount: "Сумма", status: "Статус", lastContact: "Последний контакт", owner: "Кто выставил" };
  function pick(o, keys) { var r = {}; keys.forEach(function (k) { if (o && o[k] !== undefined) r[k] = o[k]; }); return r; }
  function diff(before, after, keys) { var ch = []; keys.forEach(function (k) { if (after[k] !== undefined && String(before[k] == null ? "" : before[k]) !== String(after[k] == null ? "" : after[k])) ch.push(k); }); return ch; }
  function short(v) { v = String(v == null ? "" : v); return v.length > 80 ? v.slice(0, 77) + "…" : (v || "—"); }

  function learn(fn, res) {
    if (fn === "api_listTasks" && Array.isArray(res)) res.forEach(function (t) { known.tasks[t.row] = t; });
    else if (fn === "api_getTask" && res && res.row) known.tasks[res.row] = res;
    else if (fn === "api_kpregList" && Array.isArray(res)) res.forEach(function (l) { known.leads[l.row] = l; });
  }
  function record(fn, args, snap) {
    if (!C.loggedIn()) return;
    var e = null;
    if (fn === "api_saveTask") {
      var row = args[0], data = args[1] || {}, b = snap || {}, ch = diff(b, data, TASK_KEYS), name = "Задача · " + (data.customer || b.customer || "№" + row);
      if (!ch.length) return;
      if (ch.indexOf("stage") >= 0) e = { entity: name, action: "Этап", before: short(b.stage), after: short(data.stage) };
      else e = { entity: name, action: "Изменено: " + ch.map(function (k) { return LABELS[k] || k; }).slice(0, 3).join(", "), before: short(b[ch[0]]), after: short(data[ch[0]]) };
      if (snap) e.undo = { type: "task_save", row: row, data: pick(b, Object.keys(pick(data, TASK_KEYS))) };
      known.tasks[row] = Object.assign({}, b, data);
    } else if (fn === "api_createTask") e = { entity: "Задача · " + (args[0] || {}).customer, action: "Создана", before: "", after: short((args[0] || {}).stage) };
    else if (fn === "api_deleteTask") { var bt = snap || {}; e = { entity: "Задача · " + (bt.customer || "№" + args[0]), action: "Удалена", before: short(bt.stage), after: "", undo: snap ? { type: "task_create", data: pick(bt, TASK_KEYS) } : null }; }
    else if (fn === "api_kpregSave") {
      var r2 = args[0], d2 = args[1] || {}, b2 = snap || {}, c2 = diff(b2, d2, LEAD_KEYS), n2 = "КП · " + (d2.customer || b2.customer || "заявка");
      if (!c2.length) return;
      if (c2.indexOf("status") >= 0) e = { entity: n2, action: "Статус", before: short(b2.status), after: short(d2.status) };
      else e = { entity: n2, action: "Изменено: " + c2.map(function (k) { return LABELS[k] || k; }).slice(0, 3).join(", "), before: short(b2[c2[0]]), after: short(d2[c2[0]]) };
      if (snap) e.undo = { type: "lead_save", row: r2, data: pick(b2, Object.keys(pick(d2, LEAD_KEYS))) };
      known.leads[r2] = Object.assign({}, b2, d2);
    } else if (fn === "api_kpregCreate") e = { entity: "КП · " + (args[0] || {}).customer, action: "Заявка создана", before: "", after: short((args[0] || {}).status) };
    else if (fn === "api_kpregDelete") { var bl = snap || {}; e = { entity: "КП · " + (bl.customer || "заявка"), action: "Заявка удалена", before: short(bl.status), after: "", undo: snap ? { type: "lead_create", data: pick(bl, LEAD_KEYS) } : null }; }
    if (e) C.call("/journal", { body: e }).catch(function () {});
    if (e || /^api_(createTask|deleteTask|kpregCreate|kpregDelete)$/.test(fn)) pingAuto();
  }
  (function hook() {
    var orig = window.callServer;
    if (typeof orig !== "function" || orig.__mpb) return;
    var wrapped = function (fn) {
      var args = Array.prototype.slice.call(arguments, 1), p = orig.apply(this, arguments);
      if (/^api_(listTasks|getTask|kpregList)$/.test(fn)) p.then(function (r) { learn(fn, r); }, function () {});
      else if (/^api_(saveTask|createTask|deleteTask|kpregSave|kpregCreate|kpregDelete)$/.test(fn)) {
        var src = /Task/.test(fn) ? known.tasks : known.leads, snap = null;
        if (/save|delete/i.test(fn) && src[args[0]]) snap = JSON.parse(JSON.stringify(src[args[0]]));
        p.then(function () { record(fn, args, snap); }, function () {});
      }
      return p;
    };
    wrapped.__mpb = true; window.callServer = wrapped;
  })();

  /* после изменения задач/заявок просим мост сразу сверить таблицу (автоматизации сработают без ожидания расписания) */
  var pingT = null;
  function pingAuto() { clearTimeout(pingT); pingT = setTimeout(function () { if (C.loggedIn()) C.call("/automation/ping", { body: {} }).catch(function () {}); }, 4000); }

  /* отмена записи журнала */
  C.undoEntry = function (e) {
    var u = e.undo; if (!u) return Promise.reject("Это действие отменить нельзя");
    var p;
    if (u.type === "task_save") p = callServer("api_saveTask", u.row, Object.assign({}, known.tasks[u.row] ? pick(known.tasks[u.row], TASK_KEYS) : {}, u.data));
    else if (u.type === "lead_save") p = callServer("api_kpregSave", u.row, Object.assign({}, known.leads[u.row] || {}, u.data));
    else if (u.type === "task_create") p = callServer("api_createTask", u.data);
    else if (u.type === "lead_create") p = callServer("api_kpregCreate", u.data);
    else return Promise.reject("Неизвестный тип отмены");
    return p.then(function () { return C.call("/journal/" + e.id + "/undone", { body: {} }); });
  };

  /* ---------- старт ---------- */
  C.init();
})();
