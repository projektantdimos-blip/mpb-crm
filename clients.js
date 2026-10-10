/* МПБ CRM v2 — клиенты: карточка заказчика и поиск дублей.
   Отдельной таблицы клиентов нет: клиент — это заказчик из задач и заявок КП (поле «Заказчик»). Названия, написанные по-разному
   («ООО «Ромашка»» / «Ромашка ООО»), сводятся к одному ключу. Объединение дублей переименовывает заказчика в задачах и заявках
   обычным сохранением (api_saveTask / api_kpregSave), поэтому каждая правка попадает в «Журнал изменений» и отменяется там же. */
(function () {
  "use strict";
  var K = window.MPBK = {}, T = window.MPBT, U = T && T.util;
  if (!U) return;
  var E = U.E, ic = U.ic;
  function $(id) { return document.getElementById(id); }
  var TASK_KEYS = ["customer", "address", "contractNo", "workType", "startDate", "dueDate", "stage", "deadline", "siteContact", "siteContactPhone", "comment", "closed", "manager"];
  var LEAD_KEYS = ["date", "customer", "contact", "phoneEmail", "funnel", "object", "essence", "amount", "status", "lastContact", "owner", "comment"];
  var LEGAL = { ооо: 1, оао: 1, зао: 1, пао: 1, ао: 1, ип: 1, тоо: 1, нко: 1, мбоу: 1, гбоу: 1, мдоу: 1, мбдоу: 1, оу: 1 };
  var S = { at: 0, tasks: [], leads: [], list: [], by: {}, dups: [], q: "", sort: "act", tab: "all", busy: false };
  var DKEY = "mpb_notdup";

  /* ---------- нормализация ---------- */
  function norm(s) {
    s = String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[«»"'“”„`]/g, " ").replace(/№|n°|\bn\b/g, " ").replace(/[^a-zа-я0-9]+/g, " ");
    return s.split(" ").filter(function (w) { return w && !LEGAL[w]; }).join(" ");
  }
  function toks(k) { return k.split(" ").filter(function (w) { return /\d/.test(w) || w.length >= 3; }); }
  function nums(a) { return a.filter(function (w) { return /\d/.test(w); }).sort().join(","); }
  function lev(a, b) {
    var m = a.length, n = b.length, p = [], i, j, c;
    for (j = 0; j <= n; j++) p[j] = j;
    for (i = 1; i <= m; i++) { var prev = p[0]; p[0] = i; for (j = 1; j <= n; j++) { var t = p[j]; c = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1; p[j] = Math.min(p[j] + 1, p[j - 1] + 1, prev + c); prev = t; } }
    return p[n];
  }
  function similar(a, b) {                           // насколько похожи два ключа названий: текст причины или ""
    var ta = toks(a), tb = toks(b);
    if (!ta.length || !tb.length || nums(ta) !== nums(tb)) return "";
    var inter = ta.filter(function (w) { return tb.indexOf(w) >= 0; }).length, uni = ta.length + tb.length - inter;
    var small = ta.length <= tb.length ? ta : tb, big = small === ta ? tb : ta;
    var sub = small.every(function (w) { return big.indexOf(w) >= 0; });
    if (sub && (small.length >= 2 || small[0].length >= 6)) return "одно название входит в другое";
    if (uni && inter / uni >= 0.75) return "почти одинаковые слова";
    if (a.length >= 6 && Math.abs(a.length - b.length) <= 3 && 1 - lev(a, b) / Math.max(a.length, b.length) >= 0.86) return "похожее написание";
    return "";
  }
  function phones(s) { var out = [], m = String(s || "").match(/\+?\d[\d\s\-()]{8,}\d/g) || []; m.forEach(function (x) { var d = x.replace(/\D/g, ""); if (d.length >= 10) out.push(d.slice(-10)); }); return out; }
  function emails(s) { return (String(s || "").toLowerCase().match(/[a-z0-9._+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/g) || []); }
  function money(n) { return Math.round(n || 0).toLocaleString("ru-RU") + " ₽"; }
  function dmy(d) { if (!d) return "—"; var p = String(d).slice(0, 10).split("-"); return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : d; }
  function nz(n, a, b, c) { var m = n % 100, k = n % 10; return (m >= 11 && m <= 14) ? c : k === 1 ? a : (k >= 2 && k <= 4) ? b : c; }
  function dismissed() { try { return JSON.parse(localStorage.getItem(DKEY) || "[]"); } catch (e) { return []; } }
  function dismiss(sig) { var d = dismissed(); if (d.indexOf(sig) < 0) d.push(sig); try { localStorage.setItem(DKEY, JSON.stringify(d)); } catch (e) {} }

  /* ---------- сборка клиентов ---------- */
  function build() {
    var by = {}, list = [];
    function get(raw) {
      var k = norm(raw); if (!k) return null;
      if (!by[k]) { by[k] = { key: k, names: {}, tasks: [], leads: [], contacts: {}, phones: {}, emails: {} }; list.push(by[k]); }
      by[k].names[raw] = (by[k].names[raw] || 0) + 1;
      return by[k];
    }
    function contact(c, name, text) {
      if (!name && !text) return;
      var id = (String(name || "").trim() + "|" + String(text || "").trim()).toLowerCase();
      if (!c.contacts[id]) c.contacts[id] = { name: String(name || "").trim(), text: String(text || "").trim() };
      phones(text).forEach(function (p) { c.phones[p] = 1; }); emails(text).forEach(function (m) { c.emails[m] = 1; });
    }
    S.tasks.forEach(function (t) { var c = get(t.customer); if (!c) return; c.tasks.push(t); contact(c, t.siteContact, t.siteContactPhone); });
    S.leads.forEach(function (l) { var c = get(l.customer); if (!c) return; c.leads.push(l); contact(c, l.contact, l.phoneEmail); });
    list.forEach(function (c) {
      var best = "", n = 0; Object.keys(c.names).forEach(function (r) { if (c.names[r] > n || (c.names[r] === n && r.length > best.length)) { best = r; n = c.names[r]; } });
      c.name = best;
      c.open = c.tasks.filter(function (t) { return !t.closed; });
      c.closedN = c.tasks.length - c.open.length;
      c.won = c.leads.filter(function (l) { return l.status === "Выиграно"; });
      c.live = c.leads.filter(function (l) { return ["Выиграно", "Отказ", "Отложено"].indexOf(l.status) < 0; });
      c.wonSum = c.won.reduce(function (s, l) { return s + (+l.amount || 0); }, 0);
      c.liveSum = c.live.reduce(function (s, l) { return s + (+l.amount || 0); }, 0);
      var last = ""; c.leads.forEach(function (l) { var d = String(l.lastContact || l.date || "").slice(0, 10); if (d > last) last = d; }); c.last = last;
      var ppl = {}; c.tasks.forEach(function (t) { if (t.manager) ppl[t.manager] = 1; }); c.leads.forEach(function (l) { if (l.owner) ppl[l.owner] = 1; }); c.people = Object.keys(ppl);
      c.activity = c.open.length * 3 + c.live.length * 2 + (c.last || "0");
    });
    S.by = by; S.list = list; S.dups = findDups(list);
    list.forEach(function (c) { c.dup = 0; });
    S.dups.forEach(function (d) { d.keys.forEach(function (k) { by[k].dup = 1; }); });
  }
  function findDups(list) {
    var par = {}, why = {};
    function f(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
    list.forEach(function (c) { par[c.key] = c.key; });
    function link(a, b, reason) { var ra = f(a), rb = f(b); if (ra !== rb) par[ra] = rb; var r = f(a); (why[r] = why[r] || {}); why[r][reason] = 1; (why[ra] = why[ra] || {})[reason] = 1; }
    var i, j;
    for (i = 0; i < list.length; i++) for (j = i + 1; j < list.length; j++) { var r = similar(list[i].key, list[j].key); if (r) link(list[i].key, list[j].key, r.charAt(0).toUpperCase() + r.slice(1)); }
    var byP = {}, byM = {};
    list.forEach(function (c) { Object.keys(c.phones).forEach(function (p) { (byP[p] = byP[p] || []).push(c); }); Object.keys(c.emails).forEach(function (m) { (byM[m] = byM[m] || []).push(c); }); });
    [[byP, "Совпадает телефон "], [byM, "Совпадает почта "]].forEach(function (pair) {
      Object.keys(pair[0]).forEach(function (v) { var cs = pair[0][v]; if (cs.length >= 2 && cs.length <= 3) for (var x = 1; x < cs.length; x++) link(cs[0].key, cs[x].key, pair[1] + (pair[1].indexOf("телефон") > 0 ? "+7 " + v.slice(0, 3) + " … " + v.slice(-4) : v)); });
    });
    var groups = {};
    list.forEach(function (c) { var r = f(c.key); (groups[r] = groups[r] || []).push(c); });
    var out = [], hid = dismissed();
    Object.keys(groups).forEach(function (r) {
      var cs = groups[r], variants = 0, reasons = {};
      cs.forEach(function (c) { variants += Object.keys(c.names).length; if (Object.keys(c.names).length > 1) reasons["Одно и то же название, написанное по-разному"] = 1; });
      Object.keys(why[r] || {}).forEach(function (x) { reasons[x] = 1; });
      if (cs.length < 2 && variants < 2) return;
      var keys = cs.map(function (c) { return c.key; }).sort(), sig = keys.join("||");
      if (hid.indexOf(sig) >= 0) return;
      out.push({ keys: keys, sig: sig, clients: cs, reasons: Object.keys(reasons), strong: cs.length < 2 || !!reasons["Одно и то же название, написанное по-разному"] });
    });
    out.sort(function (a, b) { return (b.strong - a.strong) || (b.clients.length - a.clients.length); });
    return out;
  }

  /* ---------- загрузка ---------- */
  function load(force) {
    if (!force && Date.now() - S.at < 60000 && S.list.length) return Promise.resolve();
    return Promise.all([callServer("api_listTasks"), callServer("api_kpregList")]).then(function (r) { S.tasks = r[0] || []; S.leads = r[1] || []; S.at = Date.now(); build(); });
  }
  function route() { var h = decodeURIComponent(location.hash || ""); h = h.replace(/^#\/clients\/?/, ""); return h; }
  function shell(title, sub, extra, body) { return U.head(title, sub, extra || "") + '<div class="wrap">' + body + "</div>"; }
  function render() {
    var el = $("clients-app");
    el.innerHTML = shell("Клиенты", "Единая карточка заказчика: заявки, договоры, задачи, КП и переписка — вместе", "", '<div class="x-empty">Загрузка…</div>');
    load(false).then(function () { paint(); }).catch(function (e) { el.innerHTML = shell("Клиенты", "", "", '<div class="x-panel"><div class="x-empty">Не удалось загрузить данные: ' + E(e) + "</div></div>"); });
  }
  function paint() {
    var r = route();
    S.tab = r === "dups" ? "dups" : "all";
    paintMain(r && r !== "dups" ? S.by[r] : null);
  }
  function kindOf(c) {
    var cnt = {}, best = "", n = 0;
    c.tasks.forEach(function (t) { var w = t.workType || ""; if (w) cnt[w] = (cnt[w] || 0) + 1; });
    Object.keys(cnt).forEach(function (w) { if (cnt[w] > n) { n = cnt[w]; best = w; } });
    return best || (c.leads[0] && c.leads[0].object) || "Клиент";
  }
  function filtered() {
    var q = norm(S.q), raw = S.q.toLowerCase(), digits = S.q.replace(/\D/g, "");
    var list = S.list.filter(function (c) {
      if (S.tab === "dups" && !c.dup) return false;
      if (!q && !raw) return true;
      return c.key.indexOf(q) >= 0 || Object.keys(c.names).some(function (n) { return n.toLowerCase().indexOf(raw) >= 0; }) || (digits.length >= 4 && Object.keys(c.phones).some(function (p) { return p.indexOf(digits) >= 0; }));
    });
    return list.sort(S.sort === "name" ? function (a, b) { return a.name.localeCompare(b.name, "ru"); } : S.sort === "sum" ? function (a, b) { return (b.wonSum + b.liveSum) - (a.wonSum + a.liveSum); } : function (a, b) { return a.activity < b.activity ? 1 : a.activity > b.activity ? -1 : 0; });
  }
  function listHtml(list, sel) {
    return list.map(function (c) {
      var pill = c.dup ? '<span class="x-pill soon">дубль?</span>' : c.open.length ? '<span class="x-pill blue">' + c.open.length + " в работе</span>" : "";
      return '<div class="cl2-item ' + (sel && sel.key === c.key ? "on" : "") + '" data-k="' + E(c.key) + '"><span class="cl2-av">' + E((c.name.replace(/[^A-Za-zА-Яа-я0-9]/, "").charAt(0) || "?").toUpperCase()) + '</span><div class="cl2-t"><b>' + E(c.name) + "</b><small>" + E(kindOf(c)) + "</small></div>" + pill + "</div>";
    }).join("") || '<p class="cl2-none">Не найдено</p>';
  }
  function paintMain(sel) {
    var el = $("clients-app"), list = filtered(), nd = S.dups.length;
    if (!sel && list.length) sel = list[0];
    el.innerHTML = shell("Клиенты", "Единая карточка заказчика: заявки, договоры, задачи, КП и переписка — вместе", '<button class="x-btn accent" id="clNewTop">' + ic("plus") + "Новый клиент</button>",
      '<div class="cl2"><div class="x-panel cl2-left"><div class="cl2-top"><label class="cl2-search">' + ic("search") + '<input id="clQ" placeholder="Найти клиента, телефон…" value="' + E(S.q) + '"></label>'
      + '<div class="cl2-tabs"><button data-t="all" class="' + (S.tab === "all" ? "on" : "") + '">Все · ' + S.list.length + '</button><button data-t="dups" class="' + (S.tab === "dups" ? "on" : "") + '">Дубли' + (nd ? " · " + nd : "") + '</button></div></div>'
      + '<div id="clList" class="cl2-list">' + listHtml(list, sel) + '</div></div><div id="clCard" class="cl2-card"></div></div>');
    $("clNewTop").onclick = function () { K.createClient("", "", null); };
    var qi = $("clQ"); qi.oninput = function () { S.q = qi.value; var pos = qi.selectionStart; var l2 = filtered(); $("clList").innerHTML = listHtml(l2, sel); bindList(sel); };
    el.querySelectorAll(".cl2-tabs button").forEach(function (b) { b.onclick = function () { location.hash = b.dataset.t === "dups" ? "#/clients/dups" : "#/clients"; }; });
    bindList(sel);
    var card = $("clCard");
    if (!sel) { card.innerHTML = '<div class="x-panel"><div class="x-empty">' + (S.tab === "dups" ? "Дублей не найдено — каждый заказчик записан одним способом" : "Клиентов пока нет. Нажмите «Новый клиент» или создайте клиента из переписки.") + "</div></div>"; return; }
    cardInto(card, sel);
  }
  function bindList(sel) {
    $("clList").querySelectorAll(".cl2-item").forEach(function (r) { r.onclick = function () { location.hash = "#/clients/" + encodeURIComponent(r.dataset.k); }; });
  }

  /* путь клиента: заявка → КП → договор → работа → ТО */
  function chainOf(c) {
    var lead = c.leads.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })[0];
    var steps = [], isTO = function (t) { return /(^|[^а-яё])то([^а-яё]|$)|обслуж/i.test(" " + (t.workType || "") + " "); };
    steps.push(lead ? ["done", "Заявка № " + (lead.row - 1), dmy(lead.date)] : ["todo", "Заявка", ""]);
    var won = c.won[0], kp = c.live[0] || lead;
    if (won) steps.push(["done", "КП", money(+won.amount) + " · выиграно"]);
    else if (kp) steps.push(["cur", "КП", (kp.status || "") + (+kp.amount ? " · " + money(+kp.amount) : "")]);
    else steps.push(["todo", "КП", ""]);
    var withC = c.tasks.filter(function (t) { return t.contractNo; })[0];
    steps.push(withC ? ["done", "№ " + withC.contractNo, "договор"] : ["new", "Договор", "создать"]);
    var work = c.open.filter(function (t) { return !isTO(t); })[0], doneWork = c.tasks.filter(function (t) { return t.closed && !isTO(t); })[0];
    if (work) { var n = window.stagesFor ? stagesFor(work.workType).length : 0, i = window.stageIndex ? stageIndex(work.stage, work.workType) + 1 : 0; steps.push(["cur", work.workType || "Работа", n ? "этап " + i + " из " + n : work.stage]); }
    else if (doneWork) steps.push(["done", doneWork.workType || "Работа", "сдана"]);
    else steps.push(["todo", "Работа", ""]);
    var to = c.tasks.filter(isTO)[0];
    steps.push(to ? [to.closed ? "done" : "cur", "ТО", "обслуживание"] : [doneWork ? "new" : "todo", "ТО", doneWork ? "предложить" : "после сдачи"]);
    return steps;
  }
  function chainHtml(steps) {
    return '<div class="cl2-chain">' + steps.map(function (s, i) {
      return '<div class="cs ' + s[0] + '"><span class="dot">' + (s[0] === "done" ? ic("check") : s[0] === "cur" ? ic("clock") : s[0] === "new" ? ic("plus") : String(i + 1)) + "</span><b>" + E(s[1]) + "</b><small>" + E(s[2] || "") + "</small></div>";
    }).join("") + "</div>";
  }
  function timeline(c) {
    var ev = [];
    c.leads.forEach(function (l) {
      if (l.date) ev.push([String(l.date).slice(0, 10), "kp", "Заявка: " + (l.object || l.essence || "—"), (l.status || "") + (+l.amount ? " · " + money(+l.amount) : "")]);
      if (l.lastContact && l.lastContact !== l.date) ev.push([String(l.lastContact).slice(0, 10), "chat", "Контакт с клиентом", l.owner || ""]);
    });
    c.tasks.forEach(function (t) {
      if (t.startDate) ev.push([String(t.startDate).slice(0, 10), "contract", "Договор " + (t.contractNo ? "№ " + t.contractNo + " · " : "") + (t.workType || ""), t.manager || ""]);
      if (!t.closed && t.deadline) ev.push([String(t.deadline).slice(0, 10), "task", "Дедлайн этапа «" + (t.stage || "") + "»", t.responsible || ""]);
    });
    ev.sort(function (a, b) { return a[0] < b[0] ? 1 : -1; });
    var ico = { kp: "file", contract: "briefcase", task: "tasks", chat: "chat" };
    return ev.slice(0, 9).map(function (e) { return '<div class="ev ' + e[1] + '"><span class="pt">' + ic(ico[e[1]] || "file") + "</span>" + E(e[2]) + "<small>" + dmy(e[0]) + (e[3] ? " · " + E(e[3]) : "") + "</small></div>"; }).join("") || '<p class="x-sub">Событий пока нет</p>';
  }
  function threadFor(c) {
    var th = window.__chatThreads ? window.__chatThreads() : [];
    var found = th.filter(function (t) {
      if (norm(t.title) === c.key) return true;
      var p = phones(t.peer), m = emails(t.peer);
      return p.some(function (x) { return c.phones[x]; }) || m.some(function (x) { return c.emails[x]; });
    })[0];
    return found || null;
  }
  function cardInto(card, c) {
    var mydups = S.dups.filter(function (d) { return d.keys.indexOf(c.key) >= 0; }), others = [];
    mydups.forEach(function (d) { d.clients.forEach(function (x) { if (x.key !== c.key && others.indexOf(x) < 0) others.push(x); }); });
    var cons = Object.keys(c.contacts).map(function (k) { return c.contacts[k]; });
    function link(t) { var m = emails(t); if (m.length) return '<a href="mailto:' + E(m[0]) + '">' + E(t) + "</a>"; var p = phones(t); return p.length ? '<a href="tel:+7' + p[0] + '">' + E(t) + "</a>" : E(t); }
    var toN = c.tasks.filter(function (t) { return /(^|[^а-яё])то([^а-яё]|$)|обслуж/i.test(" " + (t.workType || "") + " "); }).length;
    var tags = {}; c.tasks.forEach(function (t) { if (t.workType) tags[t.workType] = 1; });
    var rel = function (h, b) { return '<div class="rel"><h6>' + h + "</h6>" + b + "</div>"; };
    var li = function (go, icn, main, sub) { return '<div class="li" data-go="' + go + '">' + ic(icn) + "<div><b>" + main + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + "</div></div>"; };
    var leadsH = c.leads.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 5).map(function (l) { return li("#/kpreg/lead/" + l.row, "file", "КП № " + (l.row - 1) + " · " + E(l.object || "заявка"), E(l.status || "") + (+l.amount ? " · " + money(+l.amount) : "")); }).join("") || '<p class="hint2">Нет</p>';
    var tasksH = c.tasks.filter(function (t) { return !t.closed; }).slice(0, 5).map(function (t) { return li("#/task/" + t.row, "tasks", E(t.workType || "Работа") + " · " + E(t.address || ""), E(t.stage || "") + (t.deadline ? " · срок " + dmy(t.deadline) : "")); }).join("") || '<p class="hint2">Нет активных</p>';
    var contrH = c.tasks.filter(function (t) { return t.contractNo; }).slice(0, 4).map(function (t) { return li("#/task/" + t.row, "briefcase", "№ " + E(t.contractNo) + " · " + E(t.workType || ""), t.closed ? "выполнен" : "в работе"); }).join("") || '<p class="hint2">Нет</p>';
    card.innerHTML = '<div class="x-panel pad"><div class="cl2-hd"><span class="cl2-av lg">' + E((c.name.replace(/[^A-Za-zА-Яа-я0-9]/, "").charAt(0) || "?").toUpperCase()) + '</span><div class="cl2-hdt"><h2>' + E(c.name) + "</h2><p>" + E(kindOf(c)) + (c.people.length ? " · ответственный: " + E(c.people.join(", ")) : "") + "</p>"
      + '<div class="cl2-tags">' + Object.keys(tags).slice(0, 5).map(function (t) { return '<span class="x-pill blue">' + E(t) + "</span>"; }).join("") + "</div></div>"
      + '<div class="cl2-act"><button class="x-btn ghost" id="clMsg">' + ic("chat") + 'Написать</button><button class="x-btn primary" id="clKp">' + ic("file") + "Создать КП</button></div></div></div>"
      + (others.length ? '<div class="cl2-dup">' + ic("alert") + "<span>Возможный дубль: «" + E(others.map(function (x) { return x.name; }).join("», «")) + "». Один и тот же заказчик? Объедините карточки, чтобы история не раздваивалась.</span>" + '<button class="x-btn primary" id="clMerge">' + ic("repeat") + "Объединить</button></div>" : "")
      + '<div class="x-panel pad" style="margin-top:16px"><h3>Путь клиента</h3><p class="x-sub">От первой заявки до обслуживания — всё связано автоматически</p>' + chainHtml(chainOf(c)) + "</div>"
      + '<div class="cl2-mini"><div><small>Договоры, сумма</small><b>' + money(c.wonSum) + "</b></div><div><small>КП в работе</small><b>" + c.live.length + "</b></div><div><small>Задач в работе</small><b>" + c.open.length + "</b></div><div><small>Объектов на ТО</small><b>" + toN + "</b></div></div>"
      + '<div class="cl2-two"><div class="x-panel pad"><h3>История</h3><p class="x-sub">Все события по клиенту в одной ленте</p><div class="tl">' + timeline(c) + "</div></div>"
      + '<div class="x-panel pad"><h3>Связанное</h3><p class="x-sub">' + (cons.length ? "Контакт: " + cons.slice(0, 2).map(function (k) { return E(k.name || "") + (k.text ? " · " + link(k.text) : ""); }).join("; ") : "Контактов нет") + "</p>"
      + rel("Заявки и КП", leadsH) + rel("Договоры", contrH) + rel("Задачи", tasksH) + "</div></div>";
    card.querySelectorAll("[data-go]").forEach(function (r) { r.onclick = function () { location.hash = r.dataset.go; }; });
    $("clMsg").onclick = function () {
      var th = threadFor(c);
      if (th) location.hash = "#/chat?t=" + encodeURIComponent(th.id);
      else U.toast("Диалога с этим клиентом ещё нет — он появится после первого сообщения");
    };
    $("clKp").onclick = function () { kpPicker(c); };
    var mg = $("clMerge"); if (mg) mg.onclick = function () { mergeDlg(mydups[0]); };
  }
  function kpPicker(c) {
    if (!window.MPBP) { U.toast("Модуль КП не загружен — обновите страницу"); return; }
    var hdr = { object: c.name, address: addrOf(c) };
    MPBP.templateList().then(function (tpls) {
      var v = U.xmodal('<h3>Создать КП для «' + E(c.name) + '»</h3><p class="x-sub">Выберите шаблон или начните с пустого — заказчик и адрес подставятся</p>'
        + '<div class="cl2-tpls"><div class="cl2-tpl" data-i="-1"><b>Пустое КП</b><small>выберу услуги сам</small></div>' + tpls.map(function (t, i) { return '<div class="cl2-tpl" data-i="' + i + '"><b>' + E(t.name) + "</b><small>" + E(t.descr || "") + "</small></div>"; }).join("") + '</div><div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button></div>', true);
      v.querySelectorAll(".cl2-tpl").forEach(function (d) { d.onclick = function () { var i = +d.dataset.i; MPBP.prepareKp(hdr, i >= 0 ? tpls[i] : null, S.thread); }; });
    }).catch(function () { MPBP.prepareKp(hdr, null, S.thread); });
  }
  K.summary = function (title, peer) {
    return load(false).then(function () { return findFor(title, peer); }).catch(function () { return null; });
  };

  /* ---------- дубли ---------- */
  function dupsHtml() {
    if (!S.dups.length) return '<div class="x-panel"><div class="x-empty">Дублей не найдено — каждый заказчик записан одним способом</div></div>';
    return '<p class="x-sub" style="margin:0 0 14px">Проверьте группы и объедините — заказчик переименуется во всех задачах и заявках. Каждое изменение попадёт в «Журнал изменений» и отменяется там же.</p>'
      + S.dups.map(function (d, i) {
        return '<div class="x-panel pad cl-dup"><div class="cl-dh"><div>' + d.reasons.map(function (r) { return '<span class="x-pill ' + (d.strong ? "over" : "soon") + '">' + E(r) + "</span>"; }).join(" ") + '</div><div class="x-row" style="margin:0"><button class="x-btn ghost" data-nd="' + i + '" style="padding:7px 13px">Это разные клиенты</button><button class="x-btn primary" data-mg="' + i + '" style="padding:7px 15px">Объединить…</button></div></div>'
          + d.clients.map(function (c) {
            return '<div class="cl-row" data-k="' + E(c.key) + '" style="padding:10px 0"><div class="cl-main"><b>' + Object.keys(c.names).map(E).join(" · ") + "</b><small>" + c.tasks.length + " " + nz(c.tasks.length, "задача", "задачи", "задач") + " · " + c.leads.length + " " + nz(c.leads.length, "заявка", "заявки", "заявок") + (c.people.length ? " · " + E(c.people.join(", ")) : "") + "</small></div></div>";
          }).join("") + "</div>";
      }).join("");
  }
  function bindDups(el) {
    el.querySelectorAll("[data-mg]").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); mergeDlg(S.dups[+b.dataset.mg]); }; });
    el.querySelectorAll("[data-nd]").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); dismiss(S.dups[+b.dataset.nd].sig); build(); paintList(); U.toast("Запомнил: эти клиенты — разные"); }; });
  }
  function mergeDlg(d) {
    var vars = [];
    d.clients.forEach(function (c) { Object.keys(c.names).forEach(function (n) { vars.push({ raw: n, tasks: c.tasks.filter(function (t) { return t.customer === n; }), leads: c.leads.filter(function (l) { return l.customer === n; }) }); }); });
    var best = vars.slice().sort(function (a, b) { return (b.tasks.length + b.leads.length) - (a.tasks.length + a.leads.length) || b.raw.length - a.raw.length; })[0];
    var sel = {}; vars.forEach(function (v) { sel[v.raw] = true; });
    var target = best.raw, custom = "";
    function draw() {
      var tn = custom.trim() || target;
      var ops = 0, tk = 0, ld = 0; vars.forEach(function (v) { if (sel[v.raw] && v.raw !== tn) { tk += v.tasks.length; ld += v.leads.length; } }); ops = tk + ld;
      var v = U.xmodal('<h3>Объединить клиентов</h3><p class="x-sub">Выберите, как называть клиента, и какие написания заменить</p>'
        + vars.map(function (x, i) { return '<label class="cl-var"><input type="checkbox" data-c="' + i + '" ' + (sel[x.raw] ? "checked" : "") + '><span><b>' + E(x.raw) + "</b><small>" + x.tasks.length + " " + nz(x.tasks.length, "задача", "задачи", "задач") + ", " + x.leads.length + " " + nz(x.leads.length, "заявка", "заявки", "заявок") + '</small></span><span class="cl-t"><input type="radio" name="clT" data-r="' + i + '" ' + (!custom && x.raw === target ? "checked" : "") + "> основное</span></label>"; }).join("")
        + '<div class="x-field" style="margin-top:12px"><label>Или другое название</label><input type="text" id="clCustom" value="' + E(custom) + '" placeholder="например: ООО «Северный парк»"></div>'
        + '<div class="x-hint">Будет заменено: <b>' + ops + "</b> " + nz(ops, "запись", "записи", "записей") + " (задач " + tk + ", заявок " + ld + '). Название станет «' + E(tn) + '».</div><div class="x-err" id="clErr"></div>'
        + '<div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button><button class="x-btn primary" id="clGo" ' + (ops ? "" : "disabled") + ">Объединить</button></div>", true);
      v.querySelectorAll("[data-c]").forEach(function (cb) { cb.onchange = function () { sel[vars[+cb.dataset.c].raw] = cb.checked; draw(); }; });
      v.querySelectorAll("[data-r]").forEach(function (rb) { rb.onchange = function () { target = vars[+rb.dataset.r].raw; custom = ""; draw(); }; });
      var ci = $("clCustom"); ci.onchange = function () { custom = ci.value; draw(); };
      $("clGo").onclick = function () { run(vars, sel, tn); };
    }
    draw();
  }
  function run(vars, sel, tn) {
    var jobs = [];
    vars.forEach(function (v) {
      if (!sel[v.raw] || v.raw === tn) return;
      v.tasks.forEach(function (t) { var d = {}; TASK_KEYS.forEach(function (k) { if (t[k] !== undefined) d[k] = t[k]; }); d.customer = tn; jobs.push(["api_saveTask", t.row, d]); });
      v.leads.forEach(function (l) { var d = {}; LEAD_KEYS.forEach(function (k) { if (l[k] !== undefined) d[k] = l[k]; }); d.customer = tn; jobs.push(["api_kpregSave", l.row, d]); });
    });
    if (!jobs.length) return;
    var go = $("clGo"), err = $("clErr"), done = 0, fails = 0; go.disabled = true;
    (function next(i) {
      if (i >= jobs.length) { T.closeModal(); S.at = 0; U.toast(fails ? "Готово, но " + fails + " не удалось — обновите и повторите" : "Объединено: " + done + " " + nz(done, "запись", "записи", "записей")); location.hash = "#/clients/" + encodeURIComponent(norm(tn)); render(); return; }
      go.textContent = "Сохраняю " + (i + 1) + " из " + jobs.length + "…";
      callServer(jobs[i][0], jobs[i][1], jobs[i][2]).then(function () { done++; }, function (e) { fails++; err.textContent = String(e); }).then(function () { next(i + 1); });
    })(0);
  }

  /* ---------- «О клиенте» из переписки: найти заказчика по собеседнику и показать его дела ---------- */
  function findFor(title, peer) {
    var ph = phones(peer), em = emails(peer), i, c;
    for (i = 0; i < S.list.length; i++) { c = S.list[i]; if (ph.some(function (p) { return c.phones[p]; }) || em.some(function (m) { return c.emails[m]; })) return { c: c, why: "по телефону или почте" }; }
    var k = norm(title);
    if (k && S.by[k]) return { c: S.by[k], why: "по названию" };
    if (k) for (i = 0; i < S.list.length; i++) { c = S.list[i]; if (similar(k, c.key) || (k.length >= 5 && (c.key.indexOf(k) >= 0 || (k.indexOf(c.key) >= 0 && c.key.length >= 5)))) return { c: c, why: "по похожему названию" }; }
    return null;
  }
  function infoHtml(c, why) {
    function row(h, main, side) { return '<div class="cl-row" data-h="' + h + '" style="padding:9px 0"><div class="cl-main"><b>' + main[0] + "</b><small>" + main[1] + '</small></div><div class="cl-side"><b>' + (side[0] || "") + "</b><small>" + (side[1] || "") + "</small></div></div>"; }
    var tasks = c.tasks.slice().sort(function (a, b) { return (a.closed ? 1 : 0) - (b.closed ? 1 : 0); }).slice(0, 6).map(function (t) { return row("#/task/" + t.row, [E(t.workType || "Работа") + (t.closed ? " · закрыто" : ""), E(t.address || "")], [E(t.stage || ""), t.closed ? "" : "срок " + dmy(t.deadline)]); }).join("") || '<div class="x-empty" style="padding:8px">Задач нет</div>';
    var leads = c.leads.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 5).map(function (l) { return row("#/kpreg/lead/" + l.row, [E(l.object || l.essence || "Заявка"), dmy(l.date) + (l.owner ? " · " + E(l.owner) : "")], [+l.amount ? money(+l.amount) : "", E(l.status || "")]); }).join("") || '<div class="x-empty" style="padding:8px">Заявок нет</div>';
    return "<h3>" + E(c.name) + '</h3><p class="x-sub">Найден ' + E(why) + (c.people.length ? " · ведёт: " + E(c.people.join(", ")) : "") + "</p>"
      + '<div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:12px"><div class="kpi"><div class="v">' + c.open.length + '</div><div class="l">Задач в работе</div></div><div class="kpi"><div class="v">' + c.live.length + '</div><div class="l">Активных заявок</div></div><div class="kpi"><div class="v" style="font-size:1.05rem">' + money(c.wonSum) + '</div><div class="l">Выиграно</div></div></div>'
      + '<div class="x-grp" style="padding:4px 0">Задачи и договоры</div>' + tasks + '<div class="x-grp" style="padding:10px 0 4px">Заявки и КП</div>' + leads
      + '<div class="cl-kp"><b>Коммерческое предложение</b><div class="x-row" style="margin:6px 0 0;justify-content:flex-start"><select id="clTpl" class="sg-sel"><option value="">Пустое КП</option></select><button class="x-btn accent" id="clKp">Подготовить КП</button></div></div>'
      + '<div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Закрыть</button><button class="x-btn primary" id="clOpen">Открыть карточку клиента</button></div>';
  }
  function showInfo(c, why) {
    var v = U.xmodal(infoHtml(c, why), true);
    v.querySelectorAll("[data-h]").forEach(function (r) { r.onclick = function () { T.closeModal(); location.hash = r.dataset.h; }; });
    $("clOpen").onclick = function () { T.closeModal(); location.hash = "#/clients/" + encodeURIComponent(c.key); };
    wireKp(c);
  }
  function addrOf(c) {
    var t = c.tasks.filter(function (x) { return x.address; }).sort(function (a, b) { return String(b.startDate).localeCompare(String(a.startDate)); })[0];
    if (t) return t.address;
    var l = c.leads.filter(function (x) { return x.object; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })[0];
    return l ? l.object : "";
  }
  function wireKp(c) {                                           // «Подготовить КП» из окна «О клиенте»
    var sel = $("clTpl"), go = $("clKp"), tpls = [];
    if (!go) return;
    if (window.MPBP && MPBP.templateList) MPBP.templateList().then(function (l) { tpls = l; if (sel) sel.innerHTML += l.map(function (t, i) { return '<option value="' + i + '">' + E(t.name) + "</option>"; }).join(""); }).catch(function () {});
    go.onclick = function () {
      if (!window.MPBP) { U.toast("Модуль КП не загружен — обновите страницу"); return; }
      var hdr = { object: c.name, address: addrOf(c) };
      MPBP.prepareKp(hdr, sel && sel.value !== "" ? tpls[+sel.value] : null, S.thread);
    };
  }
  S.thread = null;
  /* «Создать клиента» из диалога: клиент = заявка в реестре КП (так он появляется в «Клиентах», календаре и автоматизациях) */
  K.createClient = function (title, peer, tid) {
    if (tid) S.thread = { id: tid, title: title };
    var d = new Date(), today = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    var funnels = (window.FUNNEL_SOURCES && FUNNEL_SOURCES.length) ? FUNNEL_SOURCES : ["Переписка"];
    var me = (window.MPBC && MPBC.me && MPBC.me.name) || "";
    var isMail = /@/.test(peer || ""), phone = (peer || "");
    var v = U.xmodal('<h3>Создать клиента</h3><p class="x-sub">В реестре КП появится новая заявка со статусом «Новое обращение»; клиент сразу будет виден в разделе «Клиенты»</p>'
      + '<div class="x-field"><label>Заказчик</label><input id="ncCust" value="' + E(title || "") + '"></div><div class="x-field"><label>Контактное лицо</label><input id="ncContact" value="' + E(isMail ? "" : (title || "")) + '"></div>'
      + '<div class="x-field"><label>Телефон / почта</label><input id="ncPhone" value="' + E(phone) + '"></div><div class="x-field"><label>Объект / что нужно</label><input id="ncObj" placeholder="адрес или кратко: что хочет клиент"></div>'
      + '<div class="x-field"><label>Откуда клиент</label><select id="ncFun">' + funnels.map(function (f) { return "<option>" + E(f) + "</option>"; }).join("") + '</select></div>'
      + '<div class="x-field"><label>Ответственный</label><input id="ncOwn" value="' + E(me) + '"></div><div class="x-err" id="ncErr"></div>'
      + '<div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button><button class="x-btn primary" id="ncGo">Создать клиента</button></div>');
    $("ncGo").onclick = function () {
      var name = $("ncCust").value.trim();
      if (!name) { $("ncErr").textContent = "Укажите заказчика"; return; }
      var go = $("ncGo"); go.disabled = true; go.textContent = "Создаю…";
      var data = { date: today, customer: name, funnel: $("ncFun").value, contact: $("ncContact").value.trim(), phoneEmail: $("ncPhone").value.trim(), object: $("ncObj").value.trim(), essence: "", amount: 0, status: "Новое обращение", owner: $("ncOwn").value.trim(), lastContact: today, comment: "Создано из переписки" };
      callServer("api_kpregCreate", data).then(function () {
        S.at = 0; T.closeModal(); U.toast("Клиент «" + name + "» создан");
        K.forThread(name, $("ncPhone") ? "" : peer, tid);
      }).catch(function (e) { go.disabled = false; go.textContent = "Создать клиента"; $("ncErr").textContent = String(e); });
    };
  };
  K.forThread = function (title, peer, tid) {
    if (tid) S.thread = { id: tid, title: title };
    U.toast("Ищу клиента…");
    load(false).then(function () {
      var r = findFor(title, peer);
      if (r) { showInfo(r.c, r.why); return; }
      var v = U.xmodal('<h3>' + E(title || peer || "Собеседник") + '</h3><p class="x-sub">В задачах и заявках такого заказчика не найдено. Создайте клиента или найдите существующего вручную:</p><div class="x-row" style="justify-content:flex-start;margin:0 0 10px"><button class="x-btn accent" id="clNew">➕ Создать клиента</button></div><div class="x-field"><input id="clFind" placeholder="Или найти по названию…"></div><div id="clFound"></div><div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Закрыть</button></div>');
      $("clNew").onclick = function () { T.closeModal(); K.createClient(title, peer, tid); };
      $("clFind").oninput = function () {
        var q = norm(this.value), res = q.length < 2 ? [] : S.list.filter(function (c) { return c.key.indexOf(q) >= 0; }).slice(0, 6);
        $("clFound").innerHTML = res.map(function (c) { return '<div class="cl-row" data-k="' + E(c.key) + '" style="padding:9px 0"><div class="cl-main"><b>' + E(c.name) + "</b><small>" + c.open.length + " задач в работе · " + c.live.length + " активных заявок</small></div></div>"; }).join("") || (q.length >= 2 ? '<div class="x-empty">Не найдено</div>' : "");
        $("clFound").querySelectorAll(".cl-row").forEach(function (r) { r.onclick = function () { showInfo(S.by[r.dataset.k], "вручную"); }; });
      };
    }).catch(function (e) { U.toast("Не удалось загрузить данные: " + E(e)); });
  };
  K.invalidate = function () { S.at = 0; };
  /* КП ушло клиенту: заявка в реестре получает статус «КП отправлено» (или создаётся новая) */
  K.registerKp = function (info) {
    var d = new Date(), today = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
    return load(true).then(function () {
      var c = S.by[norm(info.name)], closed = ["Выиграно", "Отказ", "Отложено"];
      var lead = c ? c.leads.filter(function (l) { return closed.indexOf(l.status) < 0; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })[0] : null;
      if (lead) {
        var data = {}; LEAD_KEYS.forEach(function (k) { if (lead[k] !== undefined) data[k] = lead[k]; });
        data.status = "КП отправлено"; data.amount = info.total; data.lastContact = today;
        data.essence = (data.essence ? data.essence + " · " : "") + "КП № " + info.num;
        return callServer("api_kpregSave", lead.row, data).then(function () { S.at = 0; return { created: false, row: lead.row }; });
      }
      var n = { date: today, customer: info.name, funnel: (window.FUNNEL_SOURCES && FUNNEL_SOURCES[0]) || "Переписка", contact: "", phoneEmail: info.phone || "", object: info.address || "", essence: "КП № " + info.num, amount: info.total, status: "КП отправлено", owner: info.owner || "", lastContact: today, comment: "Создано при отправке КП из переписки" };
      return callServer("api_kpregCreate", n).then(function () { S.at = 0; return { created: true }; });
    });
  };  K.render = render;
})();
