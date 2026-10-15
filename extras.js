/* МПБ CRM v2 — этап 2 (без сервера): Сводка, Календарь, Мои задачи.
   Данные берутся теми же запросами, что и в основном приложении (api_listTasks, api_kpregList).
   «Мои задачи» хранятся на этом устройстве (localStorage: mpb_my). Подключается в index.html после основных скриптов. */
(function () {
  "use strict";
  var X = window.MPBX = {};
  var OVERDUE_DAYS = 5;                       // как в реестре КП: «давно не звонили»
  var ARCHIVE = { "Отложено": 1, "Выиграно": 1, "Отказ": 1 };
  var STATUS_ORDER = [["Новое обращение", "#3a86d6"], ["КП отправлено", "#6f6fe0"], ["Переговоры", "#e0a21c"], ["Согласование условий", "#1fb3b3"], ["Выиграно", "#1f9d63"]];
  var MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  var MSHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  var DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  var MY_COLOR = "#8b6fe0";

  /* ---------- утилиты ---------- */
  function $(id) { return document.getElementById(id); }
  function E(s) { return window.esc ? window.esc(s) : String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function p2(n) { return n < 10 ? "0" + n : "" + n; }
  function iso(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function pd(s) {                              // "2026-10-09" -> локальная дата без времени
    if (!s) return null;
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(s); return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function addD(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function diffD(a, b) { return Math.round((b - a) / 864e5); }
  function dmy(d) { return p2(d.getDate()) + "." + p2(d.getMonth() + 1); }
  function money(n) { return Math.round(n || 0).toLocaleString("ru-RU") + " ₽"; }
  function mln(n) { return n >= 1e6 ? (n / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 1 }) + " млн ₽" : money(n); }
  function ic(n) { return window.icon ? window.icon(n) : ""; }
  function personColor(p) { return (window.PERSON_COLOR && PERSON_COLOR[p]) || "#8794ab"; }
  function stageName(t) { return t.stage || ""; }
  function stageIdx(t) { return window.stageIndex ? stageIndex(t.stage, t.workType) : 0; }
  function stageCount(t) { return window.stagesFor ? stagesFor(t.workType).length || 1 : ((window.STAGES || []).length || 1); }
  function isOpen(t) { return !t.closed; }
  function when(d) {                            // человеческая подпись даты
    var df = diffD(today(), d);
    return df === 0 ? "сегодня" : df === 1 ? "завтра" : df === -1 ? "вчера" : dmy(d);
  }
  function head(title, sub, extra) {
    return '<header class="top"><div class="brand"><div><h1>' + title + "</h1><p>" + sub + "</p></div></div>" + (extra || "") + "</header>";
  }
  function go(h) { location.hash = h; }

  /* ---------- данные ---------- */
  var S = { tasks: null, leads: null, ts: 0, err: "" };
  function load(force) {
    if (!force && S.tasks && Date.now() - S.ts < 60000) return Promise.resolve(S);
    return Promise.all([
      callServer("api_listTasks").catch(function (e) { throw e; }),
      callServer("api_kpregList").catch(function () { return []; })     // реестр КП не обязателен для календаря задач
    ]).then(function (r) { S.tasks = r[0] || []; S.leads = r[1] || []; S.ts = Date.now(); S.err = ""; return S; });
  }
  function leadBase(l) { return pd(l.lastContact) || pd(l.date); }
  function leadDays(l) { var b = leadBase(l); return b ? diffD(b, today()) : 0; }
  function leadActive(l) { return !ARCHIVE[l.status]; }
  function leadOverdue(l) { return leadActive(l) && leadDays(l) >= OVERDUE_DAYS; }
  function taskDeadlineStatus(t) { return window.deadlineStatus ? deadlineStatus(t.deadline) : ""; }

  var root = {};
  function mount(id) { if (!root[id]) root[id] = $(id); return root[id]; }

  /* ================================================================
     СВОДКА
     ================================================================ */
  function capGet() { try { return Math.max(1, +localStorage.getItem("mpb_cap") || 8); } catch (e) { return 8; } }
  function capSet(v) { try { localStorage.setItem("mpb_cap", String(v)); } catch (e) {} }

  function renderDash() {
    var el = mount("dash-app");
    var refresh = '<button class="refresh" id="xRef">⟳ Обновить</button>';
    el.innerHTML = head("Сводка", "Картина по задачам и заявкам: загрузка команды, сроки и деньги в работе", refresh) + '<div class="wrap"><div class="loading">Загружаю данные…</div></div>';
    el.querySelector("#xRef").onclick = function () { S.ts = 0; renderDash(); };
    load(false).then(function () { if (cur() === "dash") paintDash(el, refresh); }).catch(function (e) { fail(el, "Сводка", e, renderDash); });
  }
  function fail(el, title, e, retry) {
    el.innerHTML = head(title, "Не удалось загрузить данные") + '<div class="wrap"><div class="err">Ошибка: ' + E(e) + '. Проверьте подключение (⚙) и попробуйте ещё раз.</div><button class="ghost" id="xRetry">Повторить</button></div>';
    el.querySelector("#xRetry").onclick = function () { S.ts = 0; retry(); };
  }
  function cur() { return window.sectionForHash ? sectionForHash(location.hash) : ""; }

  function paintDash(el, refresh) {
    var tasks = S.tasks.filter(isOpen), leads = S.leads, tdy = today();
    var overT = tasks.filter(function (t) { return taskDeadlineStatus(t) === "overdue"; });
    var soonT = tasks.filter(function (t) { return taskDeadlineStatus(t) === "soon"; });
    var act = leads.filter(leadActive), actSum = act.reduce(function (s, l) { return s + (+l.amount || 0); }, 0);
    var overL = act.filter(leadOverdue);
    var kp = '<div class="kpis">'
      + kpiHtml("hero", "layers", tasks.length, "Задач в работе · срочных " + soonT.length)
      + kpiHtml("", "wallet", mln(actSum), "Сумма КП в работе · заявок " + act.length, "c-blue")
      + kpiHtml("", "alert", overT.length, "Просрочено задач", "c-bad")
      + kpiHtml("", "phone", overL.length, "Заявок без контакта " + OVERDUE_DAYS + "+ дн.", "c-warn")
      + "</div>";

    /* загрузка команды */
    var cap = capGet(), people = (window.ALL_PEOPLE || []).slice();
    tasks.forEach(function (t) { if (t.responsible && people.indexOf(t.responsible) < 0) people.push(t.responsible); });
    var load_ = people.map(function (p) {
      var mine = tasks.filter(function (t) { return t.responsible === p; });
      return { p: p, n: mine.length, o: mine.filter(function (t) { return taskDeadlineStatus(t) === "overdue"; }).length };
    }).filter(function (x) { return x.n > 0 || (window.ALL_PEOPLE || []).indexOf(x.p) >= 0; });
    var loadH = load_.map(function (x) {
      var pc = Math.round(x.n / cap * 100), w = Math.min(pc, 100), ow = x.n ? Math.min(w, Math.round(x.o / x.n * w)) : 0;
      return '<div class="x-load"><span class="x-ava" style="background:' + personColor(x.p) + '">' + E(x.p.charAt(0)) + '</span><div class="nm">' + E(x.p) + "<small>" + x.n + " задач" + (x.o ? " · просрочено " + x.o : "") + "</small></div>"
        + '<div class="tr"><i style="width:' + (w - ow) + "%;background:" + (pc >= 100 ? "var(--bad)" : pc >= 85 ? "var(--warn)" : "var(--brand-2)") + '"></i>' + (ow ? '<i style="width:' + ow + '%;background:var(--bad)"></i>' : "") + '</div><span class="pc" style="color:' + (pc >= 85 ? "var(--warn)" : "var(--ink)") + '">' + pc + "%</span></div>";
    }).join("") || '<div class="x-empty">Нет задач</div>';

    /* задачи по этапам */
    /* у разных видов работ свои этапы, поэтому считаем по названию этапа; порядок — как в наборах (сначала набор по умолчанию) */
    var names = (window.MPBS && MPBS.allNames) ? MPBS.allNames() : (window.STAGES || []).map(function (s) { return s.name; }), byStage = {}, multi = window.MPBS && MPBS.multi && MPBS.multi();
    tasks.forEach(function (t) { var n = stageName(t); byStage[n] = (byStage[n] || 0) + 1; if (names.indexOf(n) < 0) names.push(n); });
    var maxS = 0; Object.keys(byStage).forEach(function (k) { maxS = Math.max(maxS, byStage[k]); });
    var stH = names.map(function (n, i) { return byStage[n] ? '<div class="x-fn"><span class="lb" title="' + E(n) + '">' + (multi ? "" : (i + 1) + ". ") + E(n) + '</span><div class="tr"><i style="width:' + Math.max(byStage[n] / maxS * 100, 6) + "%;--sc:" + personColor((window.MPBS && MPBS.whoOf && MPBS.whoOf(n, "")) || "") + '"></i></div><span class="v">' + byStage[n] + "</span></div>" : ""; }).join("") || '<div class="x-empty">Нет задач</div>';

    /* структура по видам работ */
    var groups = {}, order = [];
    tasks.forEach(function (t) { var k = String(t.workType || "Без вида").trim() || "Без вида"; if (!groups[k]) { groups[k] = 0; order.push(k); } groups[k]++; });
    order.sort(function (a, b) { return groups[b] - groups[a]; });
    var top = order.slice(0, 6), rest = order.slice(6).reduce(function (s, k) { return s + groups[k]; }, 0);
    var parts = top.map(function (k) { return [k, groups[k], wtColor(k)]; });
    if (rest) parts.push(["Другое", rest, "var(--t-other)"]);
    var total = tasks.length || 1, C = 2 * Math.PI * 54, off = 0, arcs = "", leg = "";
    parts.forEach(function (p) { var len = C * p[1] / total; arcs += '<circle cx="70" cy="70" r="54" fill="none" stroke-width="20" style="stroke:' + p[2] + '" stroke-dasharray="' + len + " " + (C - len) + '" stroke-dashoffset="' + (-off) + '" transform="rotate(-90 70 70)"/>'; off += len; leg += '<span><i style="background:' + p[2] + '"></i>' + E(p[0]) + "<b>" + Math.round(p[1] / total * 100) + "%</b></span>"; });
    var donut = tasks.length ? '<div style="display:flex;gap:22px;align-items:center;flex-wrap:wrap"><svg viewBox="0 0 140 140" style="width:150px;flex:none">' + arcs + '<text x="70" y="68" text-anchor="middle" style="fill:var(--ink);font-size:20px;font-weight:800">' + tasks.length + '</text><text x="70" y="84" text-anchor="middle" style="fill:var(--muted);font-size:9px">задач</text></svg><div class="x-legd" style="flex:1;min-width:150px">' + leg + "</div></div>" : '<div class="x-empty">Нет задач</div>';

    /* воронка КП */
    var fnMax = 0, fn = STATUS_ORDER.map(function (s) { var ls = leads.filter(function (l) { return l.status === s[0]; }), sum = ls.reduce(function (a, l) { return a + (+l.amount || 0); }, 0); fnMax = Math.max(fnMax, sum, ls.length); return { n: s[0], c: s[1], cnt: ls.length, sum: sum }; });
    var fnH = fn.map(function (f) { return '<div class="x-fn"><span class="lb">' + E(f.n) + '</span><div class="tr"><i style="width:' + (f.cnt ? Math.max((f.sum || f.cnt) / (fnMax || 1) * 100, 5) : 0) + "%;--sc:" + f.c + '"></i></div><span class="v">' + (f.cnt ? f.cnt + " · " + mln(f.sum) : "—") + "</span></div>"; }).join("");

    /* заявки по месяцам (6 последних) */
    var mo = [], base = new Date(tdy.getFullYear(), tdy.getMonth() - 5, 1), i;
    for (i = 0; i < 6; i++) { var d0 = new Date(base.getFullYear(), base.getMonth() + i, 1); mo.push({ y: d0.getFullYear(), m: d0.getMonth(), all: 0, won: 0 }); }
    leads.forEach(function (l) { var d = pd(l.date); if (!d) return; mo.forEach(function (x) { if (x.y === d.getFullYear() && x.m === d.getMonth()) { x.all += +l.amount || 0; if (l.status === "Выиграно") x.won += +l.amount || 0; } }); });
    var mx = 0; mo.forEach(function (x) { mx = Math.max(mx, x.all); }); mx = mx || 1;
    var W = 560, H = 210, pl = 8, pb = 26, gap = (W - pl - 8) / 6, bw = 40, ch = H - pb - 18, bars = "";
    mo.forEach(function (x, k) { var xx = pl + k * gap + (gap - bw) / 2, h1 = ch * x.all / mx, h2 = ch * x.won / mx, y1 = H - pb - h1;
      bars += '<rect x="' + xx + '" y="' + y1 + '" width="' + bw + '" height="' + Math.max(h1, 2) + '" rx="8" style="fill:color-mix(in srgb,var(--brand-2) 40%,var(--card))"/>'
        + (x.won ? '<rect x="' + xx + '" y="' + (H - pb - h2) + '" width="' + bw + '" height="' + h2 + '" rx="8" style="fill:var(--ok)"/>' : "")
        + '<text x="' + (xx + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" style="fill:var(--muted);font-size:10.5px">' + MSHORT[x.m] + "</text>"
        + (x.all ? '<text x="' + (xx + bw / 2) + '" y="' + (y1 - 6) + '" text-anchor="middle" style="fill:var(--ink);font-size:10px;font-weight:800">' + mln(x.all).replace(" ₽", "") + "</text>" : ""); });

    /* внимание + ближайшие сроки */
    var risks = [];
    overT.forEach(function (t) { risks.push({ k: 0, h: "#/task/" + t.row, i: "alert", c: "c-bad", b: E(t.customer) + " — просрочен дедлайн", s: E(stageName(t)) + " · " + E(t.responsible || "") + " · " + dmy(pd(t.deadline) || tdy) }); });
    overL.sort(function (a, b) { return leadDays(b) - leadDays(a); }).forEach(function (l) { risks.push({ k: 1, h: "#/kpreg/lead/" + l.row, i: "phone", c: "c-warn", b: E(l.customer) + " — нет контакта " + leadDays(l) + " дн.", s: E(l.status) + " · " + money(+l.amount) + " · " + E(l.owner || "") }); });
    soonT.forEach(function (t) { risks.push({ k: 2, h: "#/task/" + t.row, i: "clock", c: "c-warn", b: E(t.customer) + " — дедлайн " + when(pd(t.deadline) || tdy), s: E(stageName(t)) + " · " + E(t.responsible || "") }); });
    var riskH = risks.slice(0, 7).map(function (r) { return '<div class="x-risk" data-href="' + r.h + '"><span class="ri ' + r.c + '">' + ic(r.i) + "</span><div><b>" + r.b + "</b><small>" + r.s + "</small></div></div>"; }).join("") || '<div class="x-empty">Всё спокойно — просроченного нет</div>';
    var next = tasks.filter(function (t) { var d = pd(t.deadline); return d && d >= tdy; }).sort(function (a, b) { return pd(a.deadline) - pd(b.deadline); }).slice(0, 6);
    var nextH = next.map(function (t) { return '<div class="x-risk" data-href="#/task/' + t.row + '"><span class="ri" style="background:color-mix(in srgb,' + wtColor(t.workType) + ' 16%,transparent)">' + ic("clock") + "</span><div><b>" + E(t.customer) + "</b><small>" + E(stageName(t)) + " · " + E(t.responsible || "") + '</small></div><span class="x-pill ' + (taskDeadlineStatus(t) === "soon" ? "soon" : "") + '" style="margin-left:auto">' + when(pd(t.deadline)) + "</span></div>"; }).join("") || '<div class="x-empty">Ближайших дедлайнов нет</div>';

    el.innerHTML = head("Сводка", "Картина по задачам и заявкам: загрузка команды, сроки и деньги в работе", refresh) + '<div class="wrap">' + kp + '<div class="x-dgrid">'
      + '<div class="x-panel pad x-s4"><h3>Загрузка команды</h3><p class="x-sub">Открытые задачи на текущем этапе у каждого</p>' + loadH + '<label class="x-cap">Норма задач на человека <input type="number" min="1" id="xCap" value="' + cap + '"></label></div>'
      + '<div class="x-panel pad x-s4"><h3>Воронка КП</h3><p class="x-sub">Количество и сумма по стадиям</p>' + fnH + "</div>"
      + '<div class="x-panel pad x-s4"><h3>Структура работ</h3><p class="x-sub">Задачи в работе по видам</p>' + donut + "</div>"
      + '<div class="x-panel pad x-s8"><h3>Заявки по месяцам</h3><p class="x-sub">Сумма КП созданных заявок · зелёным — выиграно</p><svg viewBox="0 0 ' + W + " " + H + '" style="width:100%;height:auto">' + bars + "</svg></div>"
      + '<div class="x-panel pad x-s4"><h3>Требует внимания</h3><p class="x-sub">Что горит прямо сейчас</p>' + riskH + "</div>"
      + '<div class="x-panel pad x-s4"><h3>Где задачи по этапам</h3><p class="x-sub">Сколько задач на каждом этапе</p>' + stH + "</div>"
      + '<div class="x-panel pad x-s8"><h3>Ближайшие дедлайны</h3><p class="x-sub">Открытые задачи по сроку этапа</p>' + nextH + "</div>"
      + "</div></div>";
    el.querySelector("#xRef").onclick = function () { S.ts = 0; renderDash(); };
    el.querySelector("#xCap").onchange = function () { capSet(Math.max(1, +this.value || 8)); paintDash(el, refresh); };
    el.querySelectorAll("[data-href]").forEach(function (n) { n.onclick = function () { go(n.dataset.href); }; });
  }

  /* ================================================================
     КАЛЕНДАРЬ
     ================================================================ */
  var cal = { v: "month", y: new Date().getFullYear(), m: new Date().getMonth(), kind: "all", who: "all", sel: iso(today()) };
  var KINDS = [["all", "Всё", "#9aa7bd"], ["dl", "Дедлайны этапов", "var(--bad)"], ["due", "Сроки по договорам", "#1f5c99"], ["call", "Контакт с клиентами", "#e0a21c"], ["to", "ТО МПБ", "#1f9d8a"], ["my", "Мои напоминания", MY_COLOR]];

  function calEvents() {
    var ev = [], tdy = today();
    (S.tasks || []).filter(isOpen).forEach(function (t) {
      var d = pd(t.deadline);
      if (d) ev.push({ d: iso(d), k: "dl", c: wtColor(t.workType), t: t.customer + " · " + stageName(t), sub: "Дедлайн этапа · " + (t.workType || ""), who: t.responsible, h: "#/task/" + t.row, over: d < tdy });
      var du = pd(t.dueDate);
      if (du) ev.push({ d: iso(du), k: "due", c: "#1f5c99", t: "Срок договора: " + t.customer, sub: "Срок по договору " + (t.contractNo || ""), who: t.manager || t.responsible, h: "#/task/" + t.row, over: du < tdy });
    });
    (S.leads || []).filter(leadActive).forEach(function (l) {
      var b = leadBase(l); if (!b) return;
      var d = addD(b, OVERDUE_DAYS), over = d < tdy; if (over) d = tdy;
      ev.push({ d: iso(d), k: "call", c: "#e0a21c", t: "Связаться: " + l.customer, sub: (over ? "Просрочено · " : "") + "Заявка · " + (l.status || ""), who: l.owner, h: "#/kpreg/lead/" + l.row, over: over });
    });
    ((S.to && S.to.events) || []).forEach(function (e) {                         // график ТО (мост читает вкладку «ТО МПБ»)
      var d = e.date, over = false, t, sub;
      if (e.kind === "plan") { if (e.from <= iso(tdy) && iso(tdy) <= e.to) d = iso(tdy); t = "ТО: " + e.name; sub = "Плановое ТО · с 15 по 20 число" + (e.address ? " · " + e.address : ""); }
      else if (e.kind === "no") { over = e.date < iso(tdy); t = "ТО не проведено: " + e.name; sub = (e.deadline ? "Провести до " + dmy(pd(e.deadline)) : "Срок не указан") + (e.reason ? " · " + e.reason : ""); }
      else if (e.kind === "missed") { over = true; t = "ТО без отметки: " + e.name; sub = "Месяц прошёл, отметки о ТО нет"; }
      else { t = "ТО проведено: " + e.name; sub = "Отмечено во вкладке «ТО МПБ»"; }
      ev.push({ d: d, k: "to", c: e.kind === "done" ? "#9aa7bd" : "#1f9d8a", t: t, sub: sub, who: e.spec, h: "#/to", over: over });
    });
    myList().filter(function (x) { return !x.done; }).forEach(function (x) { ev.push({ d: x.d, k: "my", c: MY_COLOR, t: (x.tm ? x.tm + " " : "") + x.t, sub: "Моё напоминание", who: "me", h: "#/my" }); });
    return ev.filter(function (e) { return (cal.kind === "all" || e.k === cal.kind) && (cal.who === "all" || e.who === cal.who || (e.who === "me" && cal.who === "me")); });
  }

  function toLoad() {
    if (!(window.MPBC && MPBC.loggedIn && MPBC.loggedIn())) return Promise.resolve();
    if (S.toAt && Date.now() - S.toAt < 60000) return Promise.resolve();
    return MPBC.call("/to/calendar").then(function (r) { S.to = r; S.toAt = Date.now(); }).catch(function () { S.to = null; });
  }
  function renderCal() {
    var el = mount("cal-app");
    var refresh = '<button class="refresh" id="xRef">⟳ Обновить</button>';
    el.innerHTML = head("Календарь", "Дедлайны этапов, сроки договоров, контакты с клиентами и ваши напоминания", refresh) + '<div class="wrap"><div class="loading">Загружаю данные…</div></div>';
    el.querySelector("#xRef").onclick = function () { S.ts = 0; S.toAt = 0; renderCal(); };
    Promise.all([load(false), myLoad(), toLoad()]).then(function () { if (cur() === "cal") paintCal(el, refresh); }).catch(function (e) { fail(el, "Календарь", e, renderCal); });
  }
  function paintCal(el, refresh) {
    var people = ["all"], peopleSet = {};
    (window.ALL_PEOPLE || []).forEach(function (p) { peopleSet[p] = 1; });
    S.tasks.forEach(function (t) { if (t.responsible) peopleSet[t.responsible] = 1; });
    S.leads.forEach(function (l) { if (l.owner) peopleSet[l.owner] = 1; });
    Object.keys(peopleSet).forEach(function (p) { people.push(p); });
    var ev = calEvents(), tdy = today(), tdyIso = iso(tdy), html = "";
    var top = '<div class="x-bar"><div class="x-seg" id="xV"><button data-v="month" class="' + (cal.v === "month" ? "on" : "") + '">' + ic("cal") + 'Месяц</button><button data-v="gantt" class="' + (cal.v === "gantt" ? "on" : "") + '">' + ic("layers") + "График этапов</button></div>"
      + '<div class="x-chips">' + KINDS.map(function (k) { return '<span class="x-chip ' + (cal.kind === k[0] ? "on" : "") + '" data-k="' + k[0] + '"><i style="background:' + k[2] + '"></i>' + k[1] + "</span>"; }).join("") + '</div><div class="x-spacer"></div>'
      + '<div class="x-chips">' + people.map(function (p) { return '<span class="x-chip ' + (cal.who === p ? "on" : "") + '" data-w="' + E(p) + '">' + (p === "all" ? "Все" : '<span class="x-ava sm" style="background:' + personColor(p) + '">' + E(p.charAt(0)) + "</span>" + E(p)) + "</span>"; }).join("") + "</div></div>";
    var toNote = (S.to && S.to.error) ? "ТО в календаре: " + S.to.error : (S.to && !S.to.configured && MPBC.me && MPBC.me.role === "admin") ? "Чтобы в календаре появилось ТО, задайте TO_BRIDGE_PIN в .env моста (bridge/INSTALL.md, шаг 11, п. 10)." : "";
    if (toNote) top += '<p class="x-hint" style="margin:-6px 0 14px">' + E(toNote) + "</p>";
    if (cal.v === "month") {
      var first = new Date(cal.y, cal.m, 1), startOff = (first.getDay() + 6) % 7, start = addD(first, -startOff), cells = "", i;
      DAYS.forEach(function (d) { cells += '<div class="dh">' + d + "</div>"; });
      var weeks = Math.ceil((startOff + new Date(cal.y, cal.m + 1, 0).getDate()) / 7);
      for (i = 0; i < weeks * 7; i++) {
        var d = addD(start, i), k = iso(d), de = ev.filter(function (e) { return e.d === k; });
        cells += '<div class="dc ' + (d.getMonth() !== cal.m ? "out" : "") + (k === tdyIso ? " today" : "") + (k === cal.sel ? " sel" : "") + '" data-d="' + k + '"><span class="n">' + d.getDate() + "</span>"
          + de.slice(0, 3).map(function (e) { return '<span class="x-ev" style="--ec:' + e.c + '">' + E(e.t) + "</span>"; }).join("") + (de.length > 3 ? '<span class="x-more">ещё ' + (de.length - 3) + "</span>" : "") + "</div>";
      }
      var inMonth = ev.filter(function (e) { var d = pd(e.d); return d && d.getFullYear() === cal.y && d.getMonth() === cal.m; }).length;
      var sel = ev.filter(function (e) { return e.d === cal.sel; }), sd = pd(cal.sel) || tdy;
      html = '<div class="x-cal"><div class="x-panel"><div class="x-mh"><h3>' + MONTHS[cal.m] + " " + cal.y + '</h3><span class="x-pill">' + inMonth + ' событий</span><button class="x-nb" data-nav="-1" title="Назад">' + '<svg class="i" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button><button class="x-btn ghost" data-nav="0" style="padding:8px 14px">Сегодня</button><button class="x-nb" data-nav="1" title="Вперёд"><svg class="i" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button></div><div class="x-mg">' + cells + "</div></div>"
        + '<div class="x-panel pad x-sticky"><h3>' + sd.getDate() + " " + MONTHS[sd.getMonth()].replace(/ь$/, "я").replace(/т$/, "та").replace(/й$/, "я") + '</h3><p class="x-sub">' + (sel.length ? "Событий: " + sel.length : "Свободный день") + "</p>"
        + (sel.map(function (e) { return '<div class="x-dayev" data-href="' + e.h + '" style="--ec:' + e.c + '"><i></i><div><b>' + E(e.t) + "</b><small>" + E(e.sub) + (e.who && e.who !== "me" ? " · " + E(e.who) : "") + "</small></div></div>"; }).join("") || '<div class="x-empty">Здесь пока ничего нет</div>')
        + '<button class="x-btn ghost" style="margin-top:14px;width:100%;justify-content:center" data-href="#/my">' + ic("bell") + "Поставить напоминание</button></div></div>";
    } else {
      var rows = S.tasks.filter(isOpen).filter(function (t) { return cal.who === "all" || t.responsible === cal.who; });
      rows = rows.filter(function (t) { return pd(t.startDate) || pd(t.dueDate); }).sort(function (a, b) { return (pd(a.dueDate) || tdy) - (pd(b.dueDate) || tdy); });
      var ws = addD(tdy, -30), we = addD(tdy, 150);
      rows.forEach(function (t) { var s = pd(t.startDate), e = pd(t.dueDate); if (s && s < ws) ws = s < addD(tdy, -75) ? addD(tdy, -75) : s; if (e && e > we) we = e > addD(tdy, 270) ? addD(tdy, 270) : e; });
      ws = new Date(ws.getFullYear(), ws.getMonth(), 1); we = new Date(we.getFullYear(), we.getMonth() + 1, 0);
      var span = Math.max(1, diffD(ws, we)), gp = function (d) { return Math.max(0, Math.min(100, diffD(ws, d) / span * 100)); }, mons = "", mm = new Date(ws);
      while (mm <= we) { mons += '<span style="left:' + gp(mm) + '%">' + MONTHS[mm.getMonth()] + (mm.getMonth() === 0 || mm.getTime() === ws.getTime() ? " " + mm.getFullYear() : "") + "</span>"; mm = new Date(mm.getFullYear(), mm.getMonth() + 1, 1); }
      var tdp = gp(tdy);
      html = '<div class="x-panel" style="overflow-x:auto"><div class="x-gantt"><div class="x-gh"><div style="padding:10px 16px">Задача</div><div class="tm">' + mons + "</div></div>"
        + (rows.map(function (t) {
          var s = pd(t.startDate) || tdy, e = pd(t.dueDate) || addD(s, 30), l = gp(s), r = gp(e), w = Math.max(r - l, 2), n = stageCount(t), pc = (stageIdx(t) + 0.5) / n * 100, dd = pd(t.deadline);
          return '<div class="x-gr" data-href="#/task/' + t.row + '"><div class="nm"><b>' + E(t.customer) + "</b><small>" + E(t.workType || "") + " · " + E(t.responsible || "") + '</small></div><div class="tm" style="--tc:' + wtColor(t.workType) + ";--wk:" + (7 / span * 100) + '%"><span class="x-gtd" style="left:' + tdp + '%"></span><div class="x-gbar" style="left:' + l + "%;width:" + w + '%"><i style="width:' + pc + '%"></i><span>' + E(stageName(t)) + " · " + (stageIdx(t) + 1) + "/" + n + "</span></div>" + (dd ? '<span class="x-gdl" style="left:calc(' + gp(dd) + '% - 7px)" title="Дедлайн этапа ' + dmy(dd) + '"></span>' : "") + "</div></div>";
        }).join("") || '<div class="x-empty">Нет задач для графика</div>') + '</div></div><p class="x-hint">Полоса — срок от начала до даты по договору, заливка — пройденная часть этапов. Красный ромб — дедлайн текущего этапа, оранжевая линия — сегодня.</p>';
    }
    el.innerHTML = head("Календарь", "Дедлайны этапов, сроки договоров, контакты с клиентами и ваши напоминания", refresh) + '<div class="wrap">' + top + html + "</div>";
    el.querySelector("#xRef").onclick = function () { S.ts = 0; renderCal(); };
    el.querySelectorAll("#xV button").forEach(function (b) { b.onclick = function () { cal.v = b.dataset.v; paintCal(el, refresh); }; });
    el.querySelectorAll(".x-chip[data-k]").forEach(function (b) { b.onclick = function () { cal.kind = b.dataset.k; paintCal(el, refresh); }; });
    el.querySelectorAll(".x-chip[data-w]").forEach(function (b) { b.onclick = function () { cal.who = b.dataset.w; paintCal(el, refresh); }; });
    el.querySelectorAll("[data-nav]").forEach(function (b) { b.onclick = function () { var v = +b.dataset.nav; if (!v) { cal.y = tdy.getFullYear(); cal.m = tdy.getMonth(); cal.sel = tdyIso; } else { var d = new Date(cal.y, cal.m + v, 1); cal.y = d.getFullYear(); cal.m = d.getMonth(); } paintCal(el, refresh); }; });
    el.querySelectorAll(".x-mg .dc").forEach(function (b) { b.onclick = function () { cal.sel = b.dataset.d; paintCal(el, refresh); }; });
    el.querySelectorAll("[data-href]").forEach(function (b) { b.onclick = function () { go(b.dataset.href); }; });
  }

  /* ================================================================
     МОИ ЗАДАЧИ + напоминания
     Режим «сервер» (после входа по PIN): напоминания хранятся на сервере, приходят на все устройства,
     в Telegram и push даже при закрытом приложении. Режим «устройство» (без входа): как раньше — localStorage.
     ================================================================ */
  var MY = null, myNext = 1, mySel = null;
  function srv() { return !!(window.MPBC && MPBC.loggedIn()); }
  function fromServer(r) {
    return { id: r.id, t: r.title, d: r.d, tm: r.tm, b: r.before, rep: r.rep, task: r.task_row, tl: r.task_label, done: !!r.done, fired: !!r.fired, fireTs: r.fire_ts * 1000, created: (r.created || 0) * 1000, server: true };
  }
  function localLoad() {
    var a; try { a = JSON.parse(localStorage.getItem("mpb_my") || "[]"); } catch (e) { a = []; }
    a.forEach(function (x) { if (x.id >= myNext) myNext = x.id + 1; });
    return a;
  }
  function myList() { if (!MY) MY = srv() ? [] : localLoad(); return MY; }
  function mySave() { if (!srv()) { try { localStorage.setItem("mpb_my", JSON.stringify(MY)); } catch (e) {} } X.badge(); }

  /* загрузка списка: с сервера или с устройства; при первом входе переносит локальные записи на сервер */
  function myLoad() {
    if (!srv()) { MY = localLoad(); return Promise.resolve(MY); }
    return MPBC.call("/reminders").then(function (rs) {
      MY = rs.map(fromServer);
      var done = false; try { done = localStorage.getItem("mpb_my_imported") === "1"; } catch (e) {}
      var loc = done ? [] : localLoad().filter(function (x) { return !x.done && fireAtLocal(x) > Date.now() - 29 * 864e5; });
      if (!loc.length) { try { localStorage.setItem("mpb_my_imported", "1"); } catch (e) {} return MY; }
      var items = loc.map(function (x) { return { title: x.t, d: x.d || "", tm: x.tm || "", before: x.b || 0, fire_ts: fireAtLocal(x) / 1000, rep: x.rep || "", task_row: x.task || 0, task_label: x.tl || "" }; });
      return MPBC.call("/reminders/import", { body: { items: items } }).then(function () {
        try { localStorage.setItem("mpb_my_backup", localStorage.getItem("mpb_my") || "[]"); localStorage.removeItem("mpb_my"); localStorage.setItem("mpb_my_imported", "1"); } catch (e) {}
        toast("Перенёс личные напоминания на сервер: " + loc.length);
        return MPBC.call("/reminders").then(function (rs2) { MY = rs2.map(fromServer); return MY; });
      }, function () { return MY; });
    }).catch(function () { return MY || []; });
  }
  function fireAtLocal(x) {
    var d = pd(x.d); if (!d) return 0;
    var hm = String(x.tm || "09:00").split(":");
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), +hm[0] || 0, +hm[1] || 0).getTime() - (x.b || 0) * 60000;
  }
  function fireAt(x) {
    if (x.server) return x.fireTs;
    if (x.snoozeTo) return x.snoozeTo;
    var f = fireAtLocal(x); return f || null;
  }
  var BEFORE = [[0, "в момент срока"], [15, "за 15 минут"], [60, "за 1 час"], [1440, "за 1 день"]];
  function beforeLabel(b) { for (var i = 0; i < BEFORE.length; i++) if (BEFORE[i][0] === b) return BEFORE[i][1]; return "за " + b + " мин"; }
  var REPS = [["", "не повторять"], ["day", "каждый день"], ["week", "каждую неделю"], ["month", "каждый месяц"]];
  function repLabel(r) { for (var i = 0; i < REPS.length; i++) if (REPS[i][0] === r) return REPS[i][1]; return ""; }
  function nextDate(x) {
    var d = pd(x.d) || today();
    if (x.rep === "day") d = addD(d, 1); else if (x.rep === "week") d = addD(d, 7); else if (x.rep === "month") d = new Date(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return iso(d);
  }

  /* всплывающие уведомления внутри приложения + системные (если разрешены) */
  function banners() { var b = $("xBanners"); if (!b) { b = document.createElement("div"); b.id = "xBanners"; b.className = "x-banners"; document.body.appendChild(b); } return b; }
  function toast(msg, undo) {
    var t = $("xToast"); if (!t) { t = document.createElement("div"); t.id = "xToast"; t.className = "x-toast"; document.body.appendChild(t); }
    t.innerHTML = "<span>" + msg + "</span>" + (undo ? '<button id="xUndo">Отменить</button>' : ""); t.className = "x-toast on";
    if (undo) $("xUndo").onclick = function () { undo(); t.className = "x-toast"; };
    clearTimeout(toast.h); toast.h = setTimeout(function () { t.className = "x-toast"; }, undo ? 7000 : 3200);
  }
  function notifState() { return ("Notification" in window) ? Notification.permission : "unsupported"; }
  function systemNotify(x) {
    if (notifState() !== "granted") return;
    if (srv() && window.MPBC && MPBC.pushOn()) return;          // push с сервера уже покажет системное уведомление
    var opts = { body: x.t, icon: "icon-512.png", badge: "icon-180.png", tag: "mpb-my-" + x.id, renotify: true, data: { url: "./index.html#/my" } };
    var title = "МПБ · " + (x.b ? "напоминание " + beforeLabel(x.b) : "напоминание");
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.showNotification(title, opts); else new Notification(title, opts); }, function () { try { new Notification(title, opts); } catch (e) {} });
    } else { try { new Notification(title, opts); } catch (e) {} }
  }
  var shown = {};
  try { shown = JSON.parse(localStorage.getItem("mpb_shown") || "{}"); } catch (e) {}
  function markShown(k) {
    shown[k] = Date.now();
    var ks = Object.keys(shown); if (ks.length > 200) ks.sort(function (a, b) { return shown[a] - shown[b]; }).slice(0, ks.length - 200).forEach(function (z) { delete shown[z]; });
    try { localStorage.setItem("mpb_shown", JSON.stringify(shown)); } catch (e) {}
  }
  function fire(x) {
    if (x.server) markShown(x.id + ":" + x.fireTs); else { x.fired = true; x.snoozeTo = null; mySave(); }
    var b = document.createElement("div"); b.className = "x-banner";
    b.innerHTML = "<b>Напоминание" + (x.b ? " · " + beforeLabel(x.b) : "") + "</b><p>" + E(x.t) + (x.tm ? " — " + E(when(pd(x.d) || today())) + ", " + E(x.tm) : "") + '</p><div class="acts"><button class="x-btn primary" data-a="done" style="padding:8px 14px">Выполнено</button><button class="x-btn ghost" data-a="snz" style="padding:8px 14px">Через 10 мин</button>' + (x.task ? '<button class="x-btn ghost" data-a="open" style="padding:8px 14px">Открыть задачу</button>' : "") + "</div>";
    b.querySelector('[data-a="done"]').onclick = function () { setDone(x, true); b.remove(); };
    b.querySelector('[data-a="snz"]').onclick = function () { snooze(x); b.remove(); };
    var op = b.querySelector('[data-a="open"]'); if (op) op.onclick = function () { go("#/task/" + x.task); b.remove(); };
    banners().appendChild(b);
    systemNotify(x); paintMyIfOpen();
  }
  function snooze(x) {
    if (x.server) { MPBC.call("/reminders/" + x.id + "/snooze", { body: { minutes: 10 } }).then(function () { return myLoad(); }).then(function () { paintMyIfOpen(); toast("Напомню через 10 минут"); }).catch(function (e) { toast(E(e)); }); return; }
    x.fired = false; x.snoozeTo = Date.now() + 10 * 60000; mySave(); paintMyIfOpen(); toast("Напомню через 10 минут");
  }
  function tick() {
    var now = Date.now(), changed = false;
    myList().forEach(function (x) {
      if (x.done) return;
      var t = fireAt(x); if (t == null || now < t) return;
      if (x.server) { if (!shown[x.id + ":" + x.fireTs] && now - Math.max(t, x.created || 0) < 12 * 3600e3) { fire(x); changed = true; } else if (!shown[x.id + ":" + x.fireTs]) markShown(x.id + ":" + x.fireTs); }
      else if (!x.fired) { fire(x); changed = true; }
    });
    return changed;
  }
  function setDone(x, done) {
    if (x.server) {
      MPBC.call("/reminders/" + x.id + "/done", { body: { done: done } }).then(function () { return myLoad(); }).then(function () { X.badge(); paintMyIfOpen(); }).catch(function (e) { toast(E(e)); });
      return;
    }
    x.done = done;
    if (done && x.rep) { var nx = JSON.parse(JSON.stringify(x)); nx.id = myNext++; nx.d = nextDate(x); nx.done = false; nx.fired = false; nx.snoozeTo = null; MY.push(nx); }
    mySave(); paintMyIfOpen();
  }
  function paintMyIfOpen() { if (cur() === "my") paintMy(); }

  X.badge = function () {
    var n = myList().filter(function (x) { return !x.done && pd(x.d) && pd(x.d) <= today(); }).length;
    document.querySelectorAll('#topnav button[data-goto="#/my"], #bottomnav button[data-goto="#/my"]').forEach(function (b) {
      var o = b.querySelector(".chat-badge"); if (o) o.remove();
      if (n) { var s = document.createElement("span"); s.className = "chat-badge"; s.textContent = n; b.appendChild(s); }
    });
  };

  var myPrefill = null;
  X.remindTask = function (row, customer) { myPrefill = { task: row, text: "Задача: " + (customer || "") + " — " }; if (location.hash === "#/my") renderMy(); else go("#/my"); };

  function renderMy() {
    var el = mount("my-app");
    el.innerHTML = head("Мои задачи", "Поставьте себе задачу — приложение напомнит в нужное время", "") + '<div class="wrap"><div id="myBody"></div></div>';
    paintMy();
    myLoad().then(function () { if (cur() === "my") paintMy(); X.badge(); });
    load(false).then(function () { if (cur() === "my") fillTaskSelect(); }, function () {});
  }
  function fillTaskSelect() {
    var sel = $("myTask"); if (!sel || !S.tasks) return;
    var keep = sel.value;
    sel.innerHTML = '<option value="">— без привязки —</option>' + S.tasks.filter(isOpen).map(function (t) { return '<option value="' + t.row + '">' + E(t.customer) + " · " + E(t.workType || "") + "</option>"; }).join("");
    if (myPrefill && myPrefill.task) sel.value = String(myPrefill.task); else sel.value = keep;
  }
  function taskLabel(row) { var t = (S.tasks || []).filter(function (x) { return x.row === +row; })[0]; return t ? t.customer : "Задача"; }

  function todoHtml(x) {
    var d = pd(x.d), over = d && d < today() && !x.done;
    return '<div class="x-todo ' + (x.done ? "done" : "") + '" data-id="' + x.id + '"><button class="ck" data-a="ck" title="Выполнено">' + ic("check") + '</button><div class="bx"><div class="tt">' + E(x.t) + '</div><div class="mt">'
      + '<span class="x-pill ' + (over ? "over" : "blue") + '">' + ic("bell") + (d ? when(d) : "без даты") + (x.tm ? ", " + E(x.tm) : "") + " · " + beforeLabel(x.b || 0) + "</span>"
      + (x.rep ? '<span class="x-pill">' + ic("repeat") + repLabel(x.rep) + "</span>" : "")
      + (x.task ? '<span class="x-pill acc" style="cursor:pointer" data-a="task">' + ic("tasks") + E(x.tl || taskLabel(x.task)) + "</span>" : "") + '</div></div><button class="del" data-a="del" title="Удалить">' + ic("trash") + "</button></div>";
  }
  function paintMy() {
    var body = $("myBody"); if (!body) return;
    var list = myList(), tdy = today(), tdyIso = iso(tdy), i;
    var keepText = $("myText") ? $("myText").value : (myPrefill ? myPrefill.text : "");
    var kd = $("myDate") ? $("myDate").value : tdyIso, kt = $("myTime") ? $("myTime").value : "16:00", kb = $("myBefore") ? $("myBefore").value : "60", kr = $("myRep") ? $("myRep").value : "", kk = $("myTask") ? $("myTask").value : "";
    var wk = "";
    for (i = -2; i < 5; i++) { var d = addD(tdy, i), k = iso(d), n = list.filter(function (x) { return x.d === k && !x.done; }).length;
      wk += '<div class="' + (i === 0 ? "today" : "") + " " + (mySel === k ? "sel" : "") + '" data-d="' + k + '"><small>' + DAYS[(d.getDay() + 6) % 7] + "</small><b>" + d.getDate() + "</b><i>" + (n ? n + " зад." : "") + "</i></div>"; }
    var items = list.filter(function (x) { return !mySel || x.d === mySel; });
    var open = items.filter(function (x) { return !x.done; }).sort(function (a, b) { return (fireAt(a) || 0) < (fireAt(b) || 0) ? -1 : 1; });
    function grp(t, arr, cls) { return arr.length ? '<div class="x-gl ' + (cls || "") + '">' + t + " · " + arr.length + "</div>" + arr.map(todoHtml).join("") : ""; }
    var t1 = iso(addD(tdy, 1));
    var done = items.filter(function (x) { return x.done; }).slice(-5).reverse();
    var lh = grp("Просрочено", open.filter(function (x) { return x.d < tdyIso; }), "red") + grp("Сегодня", open.filter(function (x) { return x.d === tdyIso; })) + grp("Завтра", open.filter(function (x) { return x.d === t1; })) + grp("Позже", open.filter(function (x) { return x.d > t1; })) + grp("Выполнено", done);
    var nx = list.filter(function (x) { return !x.done; }).sort(function (a, b) { return (fireAt(a) || 0) - (fireAt(b) || 0); })[0];
    var ns = notifState(), nCls = ns === "granted" ? "on" : ns === "denied" ? "bad" : "", nTxt = ns === "granted" ? ["Системные уведомления включены", "Напоминания появятся и в системе, пока приложение открыто (в том числе свёрнутое)"] : ns === "denied" ? ["Уведомления заблокированы в браузере", "Разрешите их в настройках сайта — иначе будут только сообщения внутри приложения"] : ns === "unsupported" ? ["Браузер не поддерживает уведомления", "Напоминания будут показываться внутри приложения"] : ["Системные уведомления выключены", "Включите, чтобы напоминания приходили поверх других окон"];
    var mode = srv() ? ["on", "Напоминания на сервере", "Хранятся на сервере и придут на все ваши устройства, в Telegram и push — даже при закрытом приложении (если включены в «Личном кабинете»)"] : ["", "Только на этом устройстве", "Напоминания придут, пока приложение открыто. Войдите по PIN в «Личном кабинете» — тогда они переедут на сервер"];
    var now = new Date(), nowTxt = p2(now.getHours()) + ":" + p2(now.getMinutes());
    var phone = nx ? '<div class="x-push"><span class="pi"><img src="bear.png" alt=""></span><div><b>МПБ · напоминание' + (nx.b ? " " + beforeLabel(nx.b) : "") + "</b><small>" + E(nx.t) + '</small></div><span class="pt">' + E(nx.tm || "") + "</span></div>" : '<div class="x-push"><div><b>Пока пусто</b><small>Добавьте первое напоминание слева</small></div></div>';
    body.innerHTML = '<div class="x-two"><div>'
      + '<div class="x-wk" id="myWk">' + wk + "</div>"
      + '<div class="x-panel pad x-qadd" style="margin-bottom:18px"><div class="big"><input type="text" id="myText" placeholder="Что нужно сделать? Например: позвонить заказчику по пропускам" autocomplete="off"><button class="x-btn accent" id="myAdd">' + ic("plus") + "Добавить</button></div>"
      + '<div class="x-opts"><div class="x-opt"><label>Дата</label><input type="date" id="myDate"></div><div class="x-opt"><label>Время</label><input type="time" id="myTime"></div>'
      + '<div class="x-opt"><label>Напомнить</label><select id="myBefore">' + BEFORE.map(function (b) { return '<option value="' + b[0] + '">' + b[1] + "</option>"; }).join("") + "</select></div>"
      + '<div class="x-opt"><label>Повтор</label><select id="myRep">' + REPS.map(function (r) { return '<option value="' + r[0] + '">' + r[1] + "</option>"; }).join("") + "</select></div>"
      + '<div class="x-opt"><label>Привязать к задаче</label><select id="myTask"><option value="">— без привязки —</option></select></div></div></div>'
      + '<div class="x-panel">' + (lh || '<div class="x-empty">Пока ничего нет. Добавьте напоминание — оно сработает в нужное время</div>') + "</div></div>"
      + '<div class="x-sticky"><div class="x-panel pad" style="margin-bottom:16px"><h3>Как придёт оповещение</h3><p class="x-sub">Telegram и push — в «Личном кабинете»</p>'
      + '<div class="x-notif ' + (mode[0] ? "on" : "") + '"><span class="dot"></span><div><b>' + mode[1] + "</b><small>" + mode[2] + "</small></div></div>"
      + (srv() ? "" : '<button class="x-btn ghost" id="myLogin" style="width:100%;justify-content:center;margin-bottom:12px">Войти по PIN</button>')
      + '<div class="x-notif ' + nCls + '"><span class="dot"></span><div><b>' + nTxt[0] + "</b><small>" + nTxt[1] + "</small></div></div>"
      + (ns === "default" ? '<button class="x-btn primary" id="myAllow" style="width:100%;justify-content:center;margin-bottom:14px">' + ic("bell") + "Включить уведомления</button>" : "")
      + '<div class="x-phone"><div class="clk"><b>' + nowTxt + "</b><small>так выглядит напоминание</small></div>" + phone + "</div></div></div></div>";
    $("myText").value = keepText || ""; $("myDate").value = kd || tdyIso; $("myTime").value = kt || "16:00"; $("myBefore").value = kb || "60"; $("myRep").value = kr || "";
    fillTaskSelect(); if (kk && $("myTask")) $("myTask").value = kk;
    if (myPrefill) { if (myPrefill.text) $("myText").value = myPrefill.text; if (myPrefill.task && $("myTask")) $("myTask").value = String(myPrefill.task); $("myText").focus(); myPrefill = null; }
    function add() {
      var tx = $("myText").value.trim(); if (!tx) { $("myText").focus(); return; }
      var row = +$("myTask").value || 0;
      var it = { id: myNext++, t: tx, d: $("myDate").value || tdyIso, tm: $("myTime").value || "09:00", b: +$("myBefore").value || 0, rep: $("myRep").value, task: row, tl: row ? taskLabel(row) : "", done: false, fired: false };
      var f = fireAtLocal(it), soon = f && f <= Date.now();
      if (srv()) {
        $("myAdd").disabled = true;
        MPBC.call("/reminders", { body: { title: it.t, d: it.d, tm: it.tm, before: it.b, fire_ts: f / 1000, rep: it.rep, task_row: it.task, task_label: it.tl } })
          .then(function () { mySel = null; return myLoad(); }).then(function () { $("myText").value = ""; paintMy(); X.badge(); toast("Напоминание создано" + (soon ? " — сработает сразу" : "")); tick(); })
          .catch(function (e) { $("myAdd").disabled = false; toast(E(e)); });
        return;
      }
      myList().push(it); mySave(); mySel = null; $("myText").value = ""; paintMy();
      toast("Напоминание создано" + (soon ? " — сработает сразу" : ""));
      tick();
    }
    $("myAdd").onclick = add; $("myText").onkeydown = function (e) { if (e.key === "Enter") add(); };
    var al = $("myAllow"); if (al) al.onclick = function () { Notification.requestPermission().then(function () { paintMy(); }); };
    var ml = $("myLogin"); if (ml) ml.onclick = function () { MPBC.requireLogin().then(function () { renderMy(); }, function () {}); };
    body.querySelectorAll("#myWk div").forEach(function (b) { b.onclick = function () { mySel = (mySel === b.dataset.d) ? null : b.dataset.d; paintMy(); }; });
    body.querySelectorAll(".x-todo").forEach(function (r) {
      var x = myList().filter(function (z) { return z.id === +r.dataset.id; })[0]; if (!x) return;
      r.querySelector('[data-a="ck"]').onclick = function () { var was = x.done; setDone(x, !was); if (!was) toast("Готово", function () { setDone(x, false); }); };
      r.querySelector('[data-a="del"]').onclick = function () {
        if (x.server) {
          var back = { title: x.t, d: x.d, tm: x.tm, before: x.b, fire_ts: x.fireTs / 1000, rep: x.rep, task_row: x.task || 0, task_label: x.tl || "" };
          MPBC.call("/reminders/" + x.id + "/delete", { body: {} }).then(function () { return myLoad(); }).then(function () { paintMy(); X.badge(); toast("Напоминание удалено", function () { MPBC.call("/reminders", { body: back }).then(myLoad).then(function () { paintMy(); X.badge(); }); }); }).catch(function (e) { toast(E(e)); });
          return;
        }
        var ix = MY.indexOf(x); MY.splice(ix, 1); mySave(); paintMy(); toast("Напоминание удалено", function () { MY.splice(ix, 0, x); mySave(); paintMy(); });
      };
      var tl = r.querySelector('[data-a="task"]'); if (tl) tl.onclick = function () { go("#/task/" + x.task); };
    });
  }

  /* при входе/выходе список перечитывается из нужного места */
  if (window.MPBC) {
    MPBC.on("login", function () { MY = null; myLoad().then(function () { X.badge(); paintMyIfOpen(); }); });
    MPBC.on("logout", function () { MY = null; myList(); X.badge(); paintMyIfOpen(); });
  }

  /* ================================================================
     «Ещё» на телефоне
     ================================================================ */
  X.more = function () {
    var L = [["#/dash", "chart", "Сводка"], ["#/", "tasks", "Задачи"], ["#/cal", "cal", "Календарь"], ["#/my", "bell", "Мои задачи"], ["#/clients", "users", "Клиенты"], ["#/kpreg/", "list", "Реестр КП"], ["#/kpc", "calc", "Конструктор КП"], ["#/contracts", "file", "Договоры"], ["#/to", "wrench", "ТО МПБ"], ["#/team", "team", "Команда"], ["#/chat", "chat", "Переписка"], ["#/auto", "zap", "Автоматизация"], ["#/stages", "layers", "Этапы и сроки"], ["#/log", "history", "Журнал"], ["#/me", "user", "Кабинет"]];
    var v = document.createElement("div"); v.className = "x-veil on";
    v.innerHTML = '<div class="x-sheet"><h3>Все разделы</h3><div class="grid">' + L.map(function (x) { return '<button data-g="' + x[0] + '">' + ic(x[1]) + x[2] + "</button>"; }).join("") + "</div></div>";
    v.onclick = function (e) { if (e.target === v) v.remove(); };
    v.querySelectorAll("[data-g]").forEach(function (b) { b.onclick = function () { v.remove(); go(b.dataset.g); }; });
    document.body.appendChild(v);
  };

  /* ---------- маршрутизация ---------- */
  X.render = function (sec) {
    if (sec === "dash") renderDash(); else if (sec === "cal") renderCal(); else if (sec === "my") renderMy();
  };
  X.ready = true;
  var s0 = cur(); if (s0 === "dash" || s0 === "cal" || s0 === "my") X.render(s0);
  X.badge();
  tick();
  setInterval(function () { if (tick()) X.badge(); }, 20000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { tick(); X.badge(); } });
})();
