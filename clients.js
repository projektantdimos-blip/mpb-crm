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
    el.innerHTML = shell("Клиенты", "Заказчики из задач и заявок КП — вся история в одном месте", "", '<div class="x-empty">Загрузка…</div>');
    load(false).then(function () { paint(); }).catch(function (e) { el.innerHTML = shell("Клиенты", "", "", '<div class="x-panel"><div class="x-empty">Не удалось загрузить данные: ' + E(e) + "</div></div>"); });
  }
  function paint() {
    var r = route();
    if (r === "dups") { S.tab = "dups"; return paintList(); }
    if (r) { var c = S.by[r]; if (c) return paintCard(c); }
    S.tab = "all"; paintList();
  }

  /* ---------- список ---------- */
  function paintList() {
    var el = $("clients-app"), q = norm(S.q), list = S.list.filter(function (c) { return !q || c.key.indexOf(q) >= 0 || Object.keys(c.names).some(function (n) { return n.toLowerCase().indexOf(S.q.toLowerCase()) >= 0; }) || Object.keys(c.phones).some(function (p) { return p.indexOf(S.q.replace(/\D/g, "")) >= 0 && S.q.replace(/\D/g, "").length >= 4; }); });
    list.sort(S.sort === "name" ? function (a, b) { return a.name.localeCompare(b.name, "ru"); } : S.sort === "sum" ? function (a, b) { return (b.wonSum + b.liveSum) - (a.wonSum + a.liveSum); } : function (a, b) { return a.activity < b.activity ? 1 : a.activity > b.activity ? -1 : 0; });
    var nd = S.dups.length, kp = '<div class="kpis">'
      + '<div class="kpi hero"><div class="v">' + S.list.length + '</div><div class="l">Клиентов</div></div>'
      + '<div class="kpi"><div class="v">' + S.list.filter(function (c) { return c.open.length; }).length + '</div><div class="l">С задачами в работе</div></div>'
      + '<div class="kpi"><div class="v">' + S.list.filter(function (c) { return c.live.length; }).length + '</div><div class="l">С активными заявками</div></div>'
      + '<div class="kpi"><div class="v">' + nd + '</div><div class="l">Возможных дублей</div></div></div>';
    var tabs = '<div class="x-seg"><button data-t="all" class="' + (S.tab === "all" ? "on" : "") + '">' + ic("users") + "Все клиенты</button><button data-t=\"dups\" class=\"" + (S.tab === "dups" ? "on" : "") + '">' + ic("repeat") + "Дубли" + (nd ? " · " + nd : "") + "</button></div>";
    var body;
    if (S.tab === "dups") body = dupsHtml();
    else body = '<div class="x-bar">' + tabs + '<input type="search" id="clQ" class="cl-q" placeholder="Поиск по названию или телефону…" value="' + E(S.q) + '"><div class="x-seg" id="clSort">' + [["act", "По активности"], ["sum", "По сумме"], ["name", "По алфавиту"]].map(function (o) { return '<button data-s="' + o[0] + '" class="' + (S.sort === o[0] ? "on" : "") + '">' + o[1] + "</button>"; }).join("") + "</div></div>"
      + '<div class="x-panel">' + (list.map(rowHtml).join("") || '<div class="x-empty">Ничего не найдено</div>') + "</div>";
    if (S.tab === "dups") body = '<div class="x-bar">' + tabs + "</div>" + body;
    el.innerHTML = shell("Клиенты", "Заказчики из задач и заявок КП — вся история в одном месте", '<button class="x-btn ghost" id="clRef">' + ic("repeat") + "Обновить</button>", kp + body);
    el.querySelectorAll("button[data-t]").forEach(function (b) { b.onclick = function () { location.hash = b.dataset.t === "dups" ? "#/clients/dups" : "#/clients"; }; });
    $("clRef").onclick = function () { S.at = 0; render(); };
    var qi = $("clQ"); if (qi) qi.oninput = function () { S.q = qi.value; var pos = qi.selectionStart; paintList(); var n = $("clQ"); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} };
    el.querySelectorAll("#clSort button").forEach(function (b) { b.onclick = function () { S.sort = b.dataset.s; paintList(); }; });
    el.querySelectorAll(".cl-row").forEach(function (r) { r.onclick = function () { location.hash = "#/clients/" + encodeURIComponent(r.dataset.k); }; });
    bindDups(el);
  }
  function rowHtml(c) {
    var parts = [];
    if (c.open.length) parts.push(c.open.length + " " + nz(c.open.length, "задача", "задачи", "задач") + " в работе");
    if (c.live.length) parts.push(c.live.length + " " + nz(c.live.length, "заявка", "заявки", "заявок") + " · " + money(c.liveSum));
    if (!parts.length) parts.push("нет активных дел");
    return '<div class="cl-row" data-k="' + E(c.key) + '"><span class="x-ava cl-av">' + E(c.name.replace(/[^A-Za-zА-Яа-я0-9]/, "").charAt(0) || "?") + '</span><div class="cl-main"><b>' + E(c.name) + (c.dup ? ' <span class="x-pill soon">возможный дубль</span>' : "") + "</b><small>" + E(parts.join(" · ")) + "</small></div>"
      + '<div class="cl-side">' + (c.wonSum ? "<b>" + money(c.wonSum) + "</b><small>выиграно</small>" : "") + "</div>" + '<div class="cl-side"><small>' + (c.last ? "контакт " + dmy(c.last) : "") + "</small></div></div>";
  }

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

  /* ---------- карточка ---------- */
  function paintCard(c) {
    var el = $("clients-app"), names = Object.keys(c.names), cons = Object.keys(c.contacts).map(function (k) { return c.contacts[k]; });
    var mydups = S.dups.filter(function (d) { return d.keys.indexOf(c.key) >= 0; });
    function link(t) { var m = emails(t); if (m.length) return '<a href="mailto:' + E(m[0]) + '">' + E(t) + "</a>"; var p = phones(t); return p.length ? '<a href="tel:+7' + p[0] + '">' + E(t) + "</a>" : E(t); }
    var kp = '<div class="kpis"><div class="kpi hero"><div class="v">' + c.open.length + '</div><div class="l">Задач в работе</div></div><div class="kpi"><div class="v">' + c.live.length + '</div><div class="l">Активных заявок · ' + money(c.liveSum) + '</div></div><div class="kpi"><div class="v">' + money(c.wonSum) + '</div><div class="l">Выиграно (' + c.won.length + ')</div></div><div class="kpi"><div class="v" style="font-size:1.2rem">' + dmy(c.last) + '</div><div class="l">Последний контакт</div></div></div>';
    var tasks = c.tasks.slice().sort(function (a, b) { return (a.closed ? 1 : 0) - (b.closed ? 1 : 0) || String(a.deadline).localeCompare(String(b.deadline)); }).map(function (t) {
      return '<div class="cl-row" data-h="#/task/' + t.row + '"><div class="cl-main"><b>' + E(t.workType || "Работа") + (t.closed ? ' <span class="x-pill">закрыто</span>' : "") + "</b><small>" + E(t.address || "") + " · договор " + E(t.contractNo || "—") + '</small></div><div class="cl-side"><b>' + E(t.stage || "") + "</b><small>" + (t.closed ? "" : "срок " + dmy(t.deadline)) + (t.responsible ? " · " + E(t.responsible) : "") + "</small></div></div>";
    }).join("") || '<div class="x-empty">Задач нет</div>';
    var leads = c.leads.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).map(function (l) {
      return '<div class="cl-row" data-h="#/kpreg/lead/' + l.row + '"><div class="cl-main"><b>' + E(l.object || l.essence || "Заявка") + '</b><small>' + dmy(l.date) + " · " + E(l.funnel || "") + (l.owner ? " · " + E(l.owner) : "") + '</small></div><div class="cl-side"><b>' + (+l.amount ? money(+l.amount) : "") + '</b><small><span class="x-pill ' + (l.status === "Выиграно" ? "ok" : l.status === "Отказ" ? "over" : "blue") + '">' + E(l.status || "") + "</span></small></div></div>";
    }).join("") || '<div class="x-empty">Заявок нет</div>';
    el.innerHTML = shell(E(c.name), "Карточка клиента", '<button class="x-btn ghost" onclick="location.hash=\'#/clients\'">← Все клиенты</button>',
      (mydups.length ? '<div class="x-notif bad" style="margin-bottom:16px"><span class="dot"></span><div style="flex:1"><b>Возможный дубль</b><small>' + E(mydups[0].reasons.join("; ")) + " · " + mydups[0].clients.length + " " + nz(mydups[0].clients.length, "запись", "записи", "записей") + '</small></div><button class="x-btn primary" id="clMg" style="padding:8px 15px">Проверить и объединить</button></div>' : "")
      + kp + '<div class="x-panel pad" style="margin-bottom:16px"><div class="cl-kp" style="margin:0"><b>Подготовить КП для клиента</b><div class="x-row" style="margin:6px 0 0;justify-content:flex-start"><select id="clTpl" class="sg-sel"><option value="">Пустое КП</option></select><button class="x-btn accent" id="clKp">Подготовить КП</button></div></div></div>' + '<div class="x-two"><div><div class="x-panel" style="margin-bottom:16px"><div class="sg-h"><h3>Заявки и КП</h3></div>' + leads + '</div><div class="x-panel"><div class="sg-h"><h3>Задачи и договоры</h3></div>' + tasks + "</div></div>"
      + '<div class="x-sticky"><div class="x-panel pad" style="margin-bottom:16px"><h3>Контакты</h3>' + (cons.map(function (k) { return '<div class="cl-con"><b>' + E(k.name || "—") + "</b><small>" + (k.text ? link(k.text) : "") + "</small></div>"; }).join("") || '<p class="x-sub" style="margin:0">Контактов в заявках и задачах нет</p>') + "</div>"
      + '<div class="x-panel pad"><h3>Ответственные</h3><p class="x-sub" style="margin:0">' + (c.people.length ? E(c.people.join(", ")) : "—") + "</p>" + (names.length > 1 ? '<h3 style="margin-top:14px">Как записан</h3><p class="x-sub" style="margin:0">' + names.map(E).join("<br>") + "</p>" : "") + "</div></div></div>");
    el.querySelectorAll("[data-h]").forEach(function (r) { r.onclick = function () { location.hash = r.dataset.h; }; });
    var mg = $("clMg"); if (mg) mg.onclick = function () { mergeDlg(mydups[0]); };
    wireKp(c);
  }

  /* ---------- «О клиенте» из переписки: найти заказчика по собеседнику и показать его дела ---------- */
  function findFor(title, peer) {
    var ph = phones(peer), em = emails(peer), i, c;
    for (i = 0; i < S.list.length; i++) { c = S.list[i]; if (ph.some(function (p) { return c.phones[p]; }) || em.some(function (m) { return c.emails[m]; })) return { c: c, why: "по телефону или почте" }; }
    var k = norm(title);
    if (k && S.by[k]) return { c: S.by[k], why: "по названию" };
    if (k) for (i = 0; i < S.list.length; i++) { c = S.list[i]; if (similar(k, c.key) || (k.length >= 5 && (c.key.indexOf(k) >= 0 || k.indexOf(c.key) >= 0 && c.key.length >= 5))) return { c: c, why: "по похожему названию" }; }
    return null;
  }
  function infoHtml(c, why) {
    function row(h, main, side) { return '<div class="cl-row" data-h="' + h + '" style="padding:9px 0"><div class="cl-main"><b>' + main[0] + "</b><small>" + main[1] + '</small></div><div class="cl-side"><b>' + (side[0] || "") + "</b><small>" + (side[1] || "") + "</small></div></div>"; }
    var tasks = c.tasks.slice().sort(function (a, b) { return (a.closed ? 1 : 0) - (b.closed ? 1 : 0); }).slice(0, 6).map(function (t) { return row("#/task/" + t.row, [E(t.workType || "Работа") + (t.closed ? " · закрыто" : ""), E(t.address || "")], [E(t.stage || ""), t.closed ? "" : "срок " + dmy(t.deadline)]); }).join("") || '<div class="x-empty" style="padding:8px">Задач нет</div>';
    var leads = c.leads.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 5).map(function (l) { return row("#/kpreg/lead/" + l.row, [E(l.object || l.essence || "Заявка"), dmy(l.date) + (l.owner ? " · " + E(l.owner) : "")], [+l.amount ? money(+l.amount) : "", E(l.status || "")]); }).join("") || '<div class="x-empty" style="padding:8px">Заявок нет</div>';
    return '<h3>' + E(c.name) + '</h3><p class="x-sub">Найден ' + E(why) + (c.people.length ? " · ведёт: " + E(c.people.join(", ")) : "") + "</p>"
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
  function wireKp(c) {                                           // «Подготовить КП» из окна «О клиенте» / карточки клиента
    var sel = $("clTpl"), go = $("clKp"), tpls = [];
    if (!go) return;
    if (window.MPBP && MPBP.templateList) MPBP.templateList().then(function (l) { tpls = l; if (sel) sel.innerHTML += l.map(function (t, i) { return "<option value=\"" + i + "\">" + E(t.name) + "</option>"; }).join(""); }).catch(function () {});
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
  K.render = render;
})();
