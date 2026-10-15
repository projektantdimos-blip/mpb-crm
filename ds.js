/* Проекты DS — экран «Задачи» и окно задачи. Данные — только с моста (/api/ds), уже отфильтрованные по роли:
   скрытые стадии сюда не приходят, поэтому интерфейс их не «прячет», а просто не получает. */
(function () {
  "use strict";
  var C = window.MPBC;
  var DS = window.DS = {};
  var S = { orders: null, meta: null, kb: "p", open: null, tab: "info", err: "", customers: null, people: null, history: null, tasks: null, form: null, busy: false, mount: null, ov: { type: "p", tile: "", stage: "", q: "" }, ld: "week", edit: null, cu: { sel: null, draft: null, err: "" }, wk: null, kp: null, kpf: null, ct: null, rp: null, st: null, price: null, pd: null, pdErr: "", comp: null, compErr: "", stg: null, stgD: null, stgErr: "", au: null, fl: null, flStep: null, flTab: "map", flOrder: 0, flHist: null, tzov: null, tz: null, tzNew: "" };

  var STAGE_COLOR = { "Ожидает аванс": "#b0883a", "Сбор данных": "#8794ab", "Готов к проектированию": "#2b8a9a", "В проектировании": "#3a86d6", "Проверка": "#8b6fe0", "На согласовании": "#e0a21c", "Корректировка": "#d9782f", "Сдано": "#1f9d63", "Закрыто": "#6a768c" };
  var STAGE_ORDER = ["Ожидает аванс", "Сбор данных", "Готов к проектированию", "В проектировании", "Проверка", "На согласовании", "Корректировка", "Сдано", "Закрыто"];
  var ROLE_NAME = { owner: "Руководитель", design: "Руководитель проектного отдела", sales: "Руководитель отдела продаж", ops: "Операционный менеджер", acc: "Бухгалтер", designer: "Проектировщик" };
  var ROLE_NOTE = {
    owner: "Вы видите всё, включая закрытый кабинет «Статистика».",
    design: "Вы видите проекты на стадиях «Готов к проектированию», «В проектировании», «Проверка» и «Корректировка». Звонки заказчикам делаете вы.",
    sales: "Проектные, операционные и продажи, заказчики, договоры, реестр КП и переписка.",
    ops: "Проектные, операционные и продажи, заказчики, договоры, реестр КП и переписка.",
    acc: "Закрытие проектов: акт, счёт, оплата и галочка «Закрыто».",
    designer: "Только ваши проекты. Договорных сумм, контактов заказчиков и чужих проектов здесь нет."
  };
  var COL = { Ольга: "linear-gradient(135deg,#f5ab86,#e07a46)", Кристина: "linear-gradient(135deg,#bd96ee,#8a5fd0)", Иван: "linear-gradient(135deg,#46c28a,#238a58)", Мария: "linear-gradient(135deg,#5aa2ee,#2f6fbd)", Пётр: "linear-gradient(135deg,#4fc3c3,#1f9a9a)", Елена: "linear-gradient(135deg,#e58bb0,#c2527f)" };

  function E(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function plural(n, f) { n = Math.abs(n); var a = n % 10, b = n % 100; return n + " " + (a === 1 && b !== 11 ? f[0] : a >= 2 && a <= 4 && (b < 10 || b >= 20) ? f[1] : f[2]); }
  function leftText(l) { if (l == null) return "Без срока"; if (l < 0) return "Просрочено " + plural(l, ["день", "дня", "дней"]); if (l === 0) return "Срок сегодня"; return "Осталось " + plural(l, ["день", "дня", "дней"]); }
  function tone(o) { var l = o.left_days; return l == null ? "muted" : l < 0 ? "bad" : l <= 3 ? "warn" : "info"; }
  function dmy(iso) { var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ""); return m ? m[3] + "." + m[2] + "." + m[1] : "—"; }
  function money(n) { return Number(n || 0).toLocaleString("ru-RU") + " ₽"; }
  var PCOLORS = { "Ольга": "#e07a46", "Оля": "#e07a46", "Кристина": "#8a5fd0", "Иван": "#238a58", "Мария": "#2f6fbd", "Пётр": "#1f9a9a", "Елена": "#c2527f", "Дмитрий": "#b8892a" };
  var PALETTE = ["#2f6fbd", "#238a58", "#8a5fd0", "#1f9a9a", "#c2527f", "#b8892a", "#5a6fd0", "#4c8f2f"];
  function personColor(n) {
    n = n || "?";
    if (PCOLORS[n]) return PCOLORS[n];
    var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }
  function ava(n, c) { n = n || "?"; var col = COL[n] || ("linear-gradient(135deg," + personColor(n) + "," + personColor(n) + ")"); return '<span class="ava ' + (c || "") + '" style="background:' + col + '">' + E(n[0]) + "</span>"; }
  function pos() { return (C && C.me && (C.me.position || (C.me.role === "admin" ? "owner" : ""))) || ""; }
  function api(path, body) { return C.call("/../ds" + path, body ? { body: body } : {}); }
  function toast(m) { if (window.toast) window.toast(m); else alert(m); }
  function can(k) { return S.meta && S.meta.can && S.meta.can[k]; }
  function find(id) { return (S.orders || []).filter(function (o) { return o.id === id; })[0]; }
  var ICON = { plus: '<path d="M12 5v14M5 12h14"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>' };
  function ic(n) { return '<svg class="i" viewBox="0 0 24 24">' + (ICON[n] || "") + "</svg>"; }

  /* ---------- загрузка ---------- */
  function load() {
    S.err = "";
    return Promise.all([api("/meta"), api("/orders"), api("/tasks")]).then(function (r) {
      S.meta = r[0]; S.orders = r[1]; S.tasks = r[2];
      var p = r[0].position;
      var extra = [];
      if (r[0].can.customers && S.customers == null) extra.push(api("/customers").then(function (c) { S.customers = c; }, function () { S.customers = []; }));
      if ((p === "owner" || p === "design") && S.people == null) extra.push(api("/people").then(function (x) { S.people = x; }, function () { S.people = []; }));
      return Promise.all(extra);
    });
  }
  function root() { return document.getElementById("tasks-app"); }
  function modalRoot() {
    var m = document.getElementById("ds-modal");
    if (!m) { m = document.createElement("div"); m.id = "ds-modal"; m.className = "ds"; document.body.appendChild(m); }
    return m;
  }

  var TITLES = { tasks: "Задачи", ov: "Обзор", load: "Занятость", cust: "Заказчики", week: "План на неделю", kp: "Реестр КП", kpc: "Конструктор КП", contract: "Конструктор договора", report: "Недельный отчёт", stats: "Статистика", price: "Прайс", stages: "Этапы и сроки", auto: "Автоматизация", flow: "Конвейер заказа", tz: "Технические задания" };
  function mount(kind, el) {
    if (!el) return;
    S.mount = { kind: kind, el: el };
    var m = /^#\/task\/(\d+)/.exec(location.hash);
    if (m) S.open = +m[1];
    if (!C || !C.loggedIn()) {
      el.innerHTML = '<div class="ds dspage"><div class="head"><div><h1>' + TITLES[kind] + '</h1><p>Войдите, чтобы увидеть данные вашей роли</p></div><button class="btn primary" id="dsLogin">Войти по PIN</button></div></div>';
      var b = document.getElementById("dsLogin"); if (b) b.onclick = function () { C.requireLogin().then(function () { mount(kind, el); }); };
      modalRoot().innerHTML = "";
      return;
    }
    if (S.orders == null) { el.innerHTML = '<div class="ds dspage"><div class="loading">Загружаю…</div></div>'; }
    var need = S.orders == null ? load() : Promise.resolve();
    if ((kind === "tasks" || kind === "ov") && /^(owner|sales|ops)$/.test(pos())) need = need.then(loadKp);
    if (kind === "week") need = need.then(loadWeek);
    if (kind === "ov") need = need.then(function () { return api("/comments").then(function (c) { S.cm = c; }, function () { S.cm = S.cm || {}; }); });
    if (kind === "kp" || kind === "kpc" || kind === "contract") need = need.then(loadKp);
    if (kind === "price" || kind === "kpc") need = need.then(loadPrice);
    if (kind === "contract") need = need.then(loadPrice).then(loadContractDraft);
    if (kind === "price") need = need.then(loadCompany);
    if (kind === "stages") need = need.then(loadStages);
    if (kind === "flow") need = need.then(loadFlow);
    if (kind === "tz") need = need.then(loadTz);
    if (kind === "auto") need = need.then(loadAuto);
    if (kind === "report") need = need.then(loadReport);
    if (kind === "stats") need = need.then(loadStats);
    need.then(function () { return S.open ? api("/orders/" + S.open + "/history").then(function (h2) { S.history = h2; }, function () { S.history = []; }) : null; })
      .then(paint, function (e) { S.err = String(e); paint(); });
  }
  DS.route = function () { mount("tasks", root()); };
  DS.mount = mount;
  DS.reload = function () { S.orders = null; S.history = null; if (S.mount) mount(S.mount.kind, S.mount.el); };
  /* ---------- экран «Задачи» ---------- */
  function needPhone(o) {
    if (!o.customer_id || !(S.customers || []).length) return false;
    var cu = (S.customers || []).filter(function (c) { return c.id === o.customer_id; })[0];
    return !!cu && !(cu.contacts || []).some(function (x) { return x.phone && String(x.phone).trim(); });
  }
  function card(o, withStage) {
    var stage = o.stage, money_ = can("money") && o.amount != null;
    return '<button class="task ' + (o.urgent ? "urgent" : "") + '" data-open="' + o.id + '"><span class="stripe" style="--c:' + (o.urgent || (o.left_days != null && o.left_days < 0) ? "var(--bad)" : (STAGE_COLOR[stage] || "var(--brand)")) + '"></span><span class="body">'
      + '<span class="r1"><span class="num">№' + E(o.number) + "</span><span>" + E(o.customer || "") + '</span><span class="fl">' + (o.urgent ? '<span class="pill urg">⚡ Срочно</span>' : "") + "</span></span>"
      + '<span class="ttl" style="display:block">' + E(o.object) + "</span>"
      + '<span class="con ' + (o.left_days != null && o.left_days < 0 ? "bad" : "") + '" style="display:block">Договор до ' + dmy(o.due_date) + "</span>"
      + '<span class="meta">' + (o.executor ? ava(o.executor, "sm") + '<span style="font-size:.84rem;margin-right:auto">' + E(o.executor) + "</span>" : '<span class="pill muted" style="margin-right:auto">не назначен</span>')
      + (needPhone(o) ? '<span class="pill bad" title="В карточке заказчика не указан сотовый телефон">Нет телефона</span>' : "")
      + (withStage ? '<span class="pill muted"><i class="dot" style="background:' + (STAGE_COLOR[stage] || "#999") + '"></i>' + E(stage) + "</span>" : "")
      + (money_ ? (o.post_paid ? '<span class="pill ok">₽ Оплачено</span>' : '<span class="pill warn">₽ Не оплачено</span>') : "")
      + '<span class="pill ' + tone(o) + '">' + E(leftText(o.left_days)) + "</span></span></span></button>";
  }
  /* ---------- операционные задачи и продажи: сроки, ответственные, состояния ---------- */
  function taskTone(t) { return t.left_days == null ? "muted" : t.left_days < 0 ? "bad" : t.left_days <= 2 ? "warn" : "info"; }
  function taskCard(t) {
    var tn = taskTone(t), kindName = t.kind === "acc" ? "Бухгалтерия" : t.kind === "ops" ? "Операционная" : t.kind === "chat" ? "Переписка" : t.kind === "design" ? "Проектный отдел" : "Продажи";
    var btns = [];
    if (t.step === "a1" || t.step === "a2") {
      btns.push('<button class="btn ghost sm" data-lead="' + t.id + ':skip" title="Закрыть: по этому обращению задача не нужна">Задача не требуется</button>');
      btns.push('<button class="btn primary sm" data-lead="' + t.id + ':next">Передать дальше → ' + (t.step === "a1" ? "Сбор вводных" : "КП") + "</button>");
    }
    if (t.thread_id) btns.push('<button class="btn primary sm" data-chatopen="' + E(t.thread_id) + '">Открыть диалог</button>');
    if (t.order_id && t.kind === "design") btns.push('<button class="btn primary sm" data-open="' + t.order_id + '">Открыть задачу</button>');
    if (t.state !== "work") btns.push('<button class="btn ghost sm" data-tstate="' + t.id + ':work">В работу</button>');
    if (t.state !== "wait") btns.push('<button class="btn ghost sm" data-tstate="' + t.id + ':wait">Ждём ответа</button>');
    btns.push('<button class="btn ok sm" data-tstate="' + t.id + ':done">Выполнено</button>');
    return '<div class="task"><span class="stripe" style="--c:' + (tn === "bad" ? "var(--bad)" : tn === "warn" ? "var(--accent)" : "var(--org)") + '"></span><span class="body">'
      + '<span class="r1">' + (t.order_id ? '<button class="num" style="color:var(--org);font-size:1.1rem" data-open="' + t.order_id + '">№' + E(t.order_number) + "</button>" : '<span class="num" style="color:var(--org);font-size:1.1rem">' + E(kindName) + "</span>")
      + "<span>" + E(t.assignee || "") + "</span></span>"
      + '<span class="ttl" style="display:block">' + E(t.title.replace(/:\s*№.*$/, "")) + "</span>"
      + (t.object ? '<span class="con" style="display:block">' + E(t.object) + "</span>" : "")
      + (t.note ? '<span class="con" style="display:block;color:var(--muted)">' + E(t.note) + "</span>" : "")
      + (t.author ? '<span class="con" style="display:block;font-size:.78rem;color:var(--muted)">Поставил(а): ' + E(t.author) + "</span>" : "")
      + '<span class="meta" style="margin-bottom:8px"><span class="pill ' + tn + '">' + (t.due ? "до " + dmy(t.due).slice(0, 5) + " · " : "") + E(leftText(t.left_days)) + "</span></span>"
      + '<span class="meta" style="gap:6px">' + btns.join("") + "</span></span></div>";
  }
  function opsBoard(items, emptyText) {
    if (!items.length) return '<div class="panel pad"><p class="sub" style="margin:0">' + emptyText + "</p></div>";
    var cols = [["new", "Новые"], ["work", "В работе"], ["wait", "Ждёт ответа заказчика"]];
    return '<div class="board">' + cols.map(function (c) {
      var arr = items.filter(function (x) { return (x.state || "new") === c[0]; }).sort(function (a, b) { return (a.left_days == null ? 999 : a.left_days) - (b.left_days == null ? 999 : b.left_days); });
      return '<div class="col"><div class="col-h"><b>' + c[1] + '</b><span class="n">' + arr.length + "</span></div>" + arr.map(taskCard).join("") + "</div>";
    }).join("") + "</div>";
  }
  var KP_COLS = [["Обращение", "Обращение"], ["Сбор вводных", "Сбор вводных"], ["КП отправлено", "КП отправлено"], ["Договор подписан", "Договор подписан · ждём оплату"]];
  function kpTone(k) { return k.last_days == null ? "muted" : k.last_days > 5 ? "bad" : k.last_days >= 3 ? "warn" : "info"; }
  function kpCard(k) {
    var tn = kpTone(k);
    return '<a class="task" href="#/kpreg/" style="text-decoration:none;color:inherit"><span class="stripe" style="--c:' + (tn === "bad" ? "var(--bad)" : "var(--org)") + '"></span><span class="body">'
      + '<span class="r1"><span class="num" style="color:var(--org);font-size:1.1rem">' + E(k.number) + "</span><span>" + E(k.customer) + '</span><span class="fl"><b>' + money(k.amount) + "</b></span></span>"
      + '<span class="ttl" style="display:block">' + E(k.object || "—") + "</span>"
      + '<span class="meta"><span class="pill ' + tn + '">' + (k.last_days == null ? "нет общения" : k.last_days === 0 ? "общались сегодня" : "без общения " + plural(k.last_days, ["день", "дня", "дней"])) + "</span>"
      + (k.issued_date ? '<span class="pill muted">выставлено ' + dmy(k.issued_date).slice(0, 5) + "</span>" : "") + (k.manager ? '<span class="pill muted">' + E(k.manager) + "</span>" : "") + "</span></span></a>";
  }
  function salesBoard() {
    var kps = (S.kp || []).filter(function (k) { return k.status !== "Оплачено" && k.status !== "Отказ"; });
    var tasks = (S.tasks || []).filter(function (x) { return x.kind === "sales"; });
    var cols = KP_COLS.map(function (c) {
      var arr = kps.filter(function (k) { return k.status === c[0]; });
      return '<div class="col"><div class="col-h"><b>' + c[1] + '</b><span class="n">' + arr.length + "</span></div>" + arr.map(kpCard).join("") + "</div>";
    }).join("");
    var tcol = '<div class="col"><div class="col-h"><b>Задачи продаж</b><span class="n">' + tasks.length + "</span></div>" + tasks.map(taskCard).join("") + "</div>";
    return '<div class="board">' + cols + tcol + "</div>";
  }
  function screen() {
    var p = pos(), canAll = p === "owner" || p === "sales" || p === "ops", isAcc = p === "acc";
    var TABS = canAll ? [["p", "Проектные"], ["o", "Операционные"], ["s", "Продажи"], ["a", "Бухгалтерия"]] : isAcc ? [["a", "Бухгалтерия"], ["p", "Проектные"]] : [];
    var kb = TABS.length ? (TABS.some(function (x) { return x[0] === S.kb; }) ? S.kb : TABS[0][0]) : "p";
    var seg = TABS.length ? '<div class="bar" style="margin-bottom:16px"><div class="seg">' + TABS.map(function (x) { return '<button data-kb="' + x[0] + '" class="' + (kb === x[0] ? "on" : "") + '">' + x[1] + "</button>"; }).join("") + "</div></div>" : "";
    var body;
    if (kb === "p") {
      var stages = (S.meta.stages || []).filter(function (s) { return s !== "Закрыто"; });
      var filled = stages.filter(function (st) { return S.orders.some(function (o) { return o.stage === st; }); });
      var empty = stages.filter(function (st) { return filled.indexOf(st) < 0; });
      body = '<div class="board">' + filled.map(function (st) {
        var items = S.orders.filter(function (o) { return o.stage === st; });
        return '<div class="col"><div class="col-h"><i class="dot" style="background:' + (STAGE_COLOR[st] || "#999") + '"></i><b>' + E(st) + '</b><span class="n">' + items.length + "</span></div>" + items.map(card).join("") + "</div>";
      }).join("") + "</div>"
        + (empty.length ? '<div class="empty-stages"><span>Пустые этапы:</span>' + empty.map(function (st) { return '<span class="pill muted"><i class="dot" style="background:' + (STAGE_COLOR[st] || "#999") + '"></i>' + E(st) + "</span>"; }).join("") + "</div>" : "");
    } else if (kb === "s") {
      body = salesBoard();
    } else if (kb === "a") {
      body = opsBoard((S.tasks || []).filter(function (x) { return x.kind === "acc"; }), "Бухгалтерских задач нет.");
    } else {
      body = opsBoard((S.tasks || []).filter(function (x) { return x.kind === "ops"; }), "Операционных задач нет.");
    }
    var newBtn = '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn ghost" data-ntopen="1">' + ic("plus") + "Поставить задачу</button>"
      + ((p === "owner" || p === "sales" || p === "ops") ? '<button class="btn accent" data-new="1">' + ic("plus") + "Новая проектная задача</button>" : "") + "</div>";
    return '<div class="ds dspage"><div class="head"><div><h1>Задачи</h1><p>' + (kb === "p" ? "Проекты по стадиям; нажмите на карточку, чтобы открыть окно задачи" : kb === "o" ? "Операционные: сбор данных, отправка проектов заказчику, постпродажа" : kb === "a" ? "Бухгалтерия: счета на аванс, акты, оплата" : "Продажи: от обращения до подписания договора") + "</p></div>" + newBtn + "</div>"
      + "" + seg + body + "</div>";
  }

  /* ---------- окно задачи ---------- */
  function nextStep(o) {
    var p = pos(), st = o.stage, ownerOk = p === "owner";
    var map = {
      "Ожидает аванс": { roles: ["acc"], text: "Ждём аванс. Оплата из 1С переведёт задачу на «Сбор данных»", btn: "Аванс получен", pay: "advance" },
      "Сбор данных": { roles: ["ops"], text: "Все данные собраны: передать на проектирование", btn: "Передать «Готов к проектированию»", to: "Готов к проектированию" },
      "Готов к проектированию": { roles: ["design"], text: "Назначить проектировщика и начать проектирование", btn: "В проектирование", to: "В проектировании", needExec: true },
      "В проектировании": { roles: ["designer", "design"], text: "Проект готов: передать на проверку", btn: "Передать на проверку", to: "Проверка" },
      "Проверка": { roles: ["design"], text: "Проверка пройдена: отправить заказчику", btn: "На согласование", to: "На согласовании", back: { btn: "Вернуть на доработку", to: "В проектировании" } },
      "На согласовании": { roles: ["sales"], text: "Ждём ответа заказчика", btn: "Заказчик принял: «Сдано»", to: "Сдано", back: { btn: "Есть замечания", to: "Корректировка" } },
      "Корректировка": { roles: ["designer", "design"], text: "Правки внесены: вернуть на согласование", btn: "Вернуть на согласование", to: "На согласовании" },
      "Сдано": { roles: ["acc"], text: "Акт подписан, оплата получена: закрыть задачу", btn: "Закрыто", to: "Закрыто" }
    };
    var n = map[st];
    if (!n || !(ownerOk || n.roles.indexOf(p) >= 0)) return null;
    return n;
  }
  function stepper(o) {
    var st = (S.meta.stages || []);
    var cur = st.indexOf(o.stage);
    return '<div class="stepper">' + st.map(function (s, i) { return '<div class="stp ' + (i < cur ? "done" : i === cur ? "cur" : "") + '">' + E(s) + "</div>"; }).join("") + "</div>";
  }
  function customerOf(o) {
    return (S.customers || []).filter(function (c) { return c.id === o.customer_id; })[0];
  }
  function docRow(done, title, sub) { return '<div class="doc ' + (done ? "done" : "wait") + '"><span>' + (done ? "✅" : "⏳") + "</span><div><b>" + E(title) + "</b><small>" + E(sub) + "</small></div></div>"; }
  function infoTab(o) {
    var p = pos(), cu = customerOf(o), designerView = p === "designer";
    var dl = '<div class="dl ' + (o.left_days != null && o.left_days < 0 ? "bad" : "") + '"><div><small style="color:var(--muted);font-weight:700;text-transform:uppercase;font-size:.68rem">Дедлайн</small><br><b>' + dmy(o.due_date) + "</b></div><b style=\"font-size:.95rem\">" + E(leftText(o.left_days)) + "</b></div>";
    var work = '<div class="panel pad"><h3>Работа</h3>' + dl + '<div class="kv"><span>Исполнитель</span><span><b>' + E(o.executor || "не назначен") + "</b></span><span>Стадия</span><span>" + E(o.stage) + "</span>"
      + (o.contract_date ? "<span>Договор от</span><span>" + dmy(o.contract_date) + "</span>" : "") + "<span>Приоритет</span><span>" + E(o.priority) + "</span>"
      + (designerView ? "" : "<span>Правок</span><span>" + (o.edits || 0) + "</span>") + "</div></div>";
    var cust = "";
    if (o.customer && !designerView) {
      var phoneOf = cu && cu.contacts ? (cu.contacts.filter(function (x) { return x.phone && String(x.phone).trim(); })[0] || {}) : {};
      var phoneB = phoneOf.phone
        ? '<div class="phoneb"><small>Сотовый телефон заказчика</small><b>' + E(phoneOf.phone) + (phoneOf.fio ? " · " + E(phoneOf.fio) : "") + "</b></div>"
        : '<div class="phoneb bad"><b>⚠ Не указан сотовый телефон заказчика</b><small>Менеджер: заполните контактное лицо и номер в карточке заказчика — без него руководителю проектного отдела нельзя позвонить.</small><a class="btn primary sm" href="#/clients" style="text-decoration:none">Заполнить в карточке</a></div>';
      cust = '<div class="panel pad"><h3>Заказчик</h3>' + phoneB + '<div class="kv" style="margin-top:10px"><span>Компания</span><span><b>' + E(o.customer) + "</b>" + (cu && cu.regular ? ' <span class="pill ok">постоянный</span>' : "") + "</span></div>"
        + (cu && cu.contacts ? cu.contacts.map(function (x) { return '<div class="ctt" style="margin-top:10px"><b>' + E(x.fio) + "</b><small>" + E(x.pos || "должность не указана") + "</small><div>" + E(x.phone || "—") + "</div></div>"; }).join("") : "")
        + (cu && cu.tz ? '<div class="kv"><span>Часовой пояс</span><span>' + E(cu.tz) + " · сейчас <b>" + nowIn(cu.tz) + "</b></span></div>" : "")
        + (cu && cu.comment ? '<div class="note">📝 Комментарий менеджера: ' + E(cu.comment) + "</div>" : "") + "</div>";
    }
    var mon = "";
    if (can("money") && o.amount != null) {
      var adv = o.adv_mode === "advance";
      mon = '<div class="panel pad"><h3>Деньги и документы <span class="pill sys">из 1С</span></h3><div style="margin-top:10px">'
        + docRow(true, "Договор №" + o.number + " · " + money(o.amount), "подписан" + (o.contract_date ? " " + dmy(o.contract_date) : ""))
        + docRow(!adv || o.adv_paid, "Аванс" + (adv ? " " + money(o.adv_sum) : ""), !adv ? "не предусмотрен" : o.adv_paid ? "оплачен " + dmy(o.adv_date) : "ждём оплату")
        + docRow(!!o.act_signed, "Акт", o.act_signed ? "подписан" : o.act_sent ? "отправлен, ждём подпись" : "будет после сдачи")
        + docRow(!!o.post_paid, "Постоплата", o.post_paid ? "получена " + dmy(o.post_date) : "ожидается") + "</div>"
        + accButtons(o) + "</div>";
    }
    var canCreate = p === "owner" || p === "sales" || p === "ops";
    var fol = '<div class="panel pad"><h3>Папка и чат</h3><div class="doc" style="margin-top:10px"><span>📂</span><div style="flex:1"><b>\\\\176.197.21.187\\ServAmani\\' + E(o.number) + ". " + E(o.object) + "</b><small>Откроется в проводнике (нужен VPN и установленная кнопка)</small></div></div>"
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 10px"><a class="btn ghost sm" style="text-decoration:none" href="' + folderUrl(o, false) + '">Перейти в папку на сервере</a>'
      + (canCreate ? '<a class="btn ghost sm" style="text-decoration:none" href="' + folderUrl(o, true) + '">Создать папку</a>' : "") + "</div>"
      + '<div class="doc"><span>💬</span><div style="flex:1"><b>Чат проекта</b><small>Обсуждение задачи №' + E(o.number) + '</small></div><a class="btn ghost sm" style="text-decoration:none" href="#/team?room=t' + o.id + '">Открыть</a></div></div>';
    return '<div class="grid g2">' + work + cust + mon + fol + "</div>";
  }
  function folderUrl(o, create) {
    return "mpb://open?num=" + encodeURIComponent(o.number) + "&name=" + encodeURIComponent(o.object || "") + (create ? "&create=1" : "");
  }
  function accButtons(o) {
    var p = pos();
    if (p !== "acc" && p !== "owner") return "";
    var b = [];
    if (o.stage === "Сдано") {
      if (!o.act_sent) b.push('<button class="btn ghost sm" data-act="sent">Акт отправлен</button>');
      if (!o.act_signed) b.push('<button class="btn ghost sm" data-act="signed">Акт подписан</button>');
      if (!o.post_paid) b.push('<button class="btn ghost sm" data-pay="post">Оплата получена</button>');
    }
    return b.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' + b.join("") + "</div>" : "";
  }
  function nowIn(tz) { try { return new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: tz }); } catch (e) { return "—"; } }
  function logTab() {
    var h = S.history || [];
    if (!h.length) return '<div class="note">Событий пока нет</div>';
    return '<div class="trace">' + h.slice().reverse().map(function (e) {
      var d = new Date(e.ts * 1000);
      return '<div class="ev" style="--c:var(--brand)"><time>' + d.toLocaleDateString("ru-RU") + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) + "</time><b>" + E(e.action) + (e.detail ? ": " + E(e.detail) : "") + '</b><span class="note" style="margin:0">' + E(e.user_name) + "</span></div>";
    }).join("") + "</div>";
  }
  function windowHtml(o) {
    var p = pos(), n = nextStep(o), showUrgent = o.stage === "Готов к проектированию" && (p === "owner" || p === "design" || p === "ops" || p === "sales");
    var nx = "";
    if (n) {
      var sel = "";
      if (n.needExec && S.people) {
        sel = '<select id="dsExec" style="padding:9px 12px;border:1px solid var(--line);border-radius:11px;background:var(--surface)"><option value="">— исполнитель —</option>'
          + S.people.map(function (u) { return '<option value="' + u.id + '"' + (u.id === o.executor_id ? " selected" : "") + ">" + E(u.name) + "</option>"; }).join("") + "</select>";
      }
      nx = '<div class="next"><div style="flex:1;min-width:200px"><small style="color:var(--muted);font-weight:700;text-transform:uppercase;font-size:.7rem">Следующий шаг</small><br><b>' + E(n.text) + "</b>"
        + '<div style="font-size:.84rem;color:var(--muted)">Система сама оповестит следующего исполнителя</div></div>' + sel
        + (n.pay ? '<button class="btn primary" data-pay="' + n.pay + '">' + E(n.btn) + "</button>"
          : '<button class="btn primary" data-go="' + E(n.to) + '"' + (n.needExec ? ' data-needexec="1"' : "") + ">" + E(n.btn) + "</button>")
        + (n.back ? '<button class="btn ghost" data-go="' + E(n.back.to) + '">' + E(n.back.btn) + "</button>" : "")
        + (showUrgent ? '<button class="btn ghost" data-urgent="' + (o.urgent ? 0 : 1) + '">⚡ ' + (o.urgent ? "Снять срочность" : "Срочная") + "</button>" : "") + "</div>";
    } else if (showUrgent) {
      nx = '<div class="next"><div style="flex:1"><b>Срочность</b></div><button class="btn ghost" data-urgent="' + (o.urgent ? 0 : 1) + '">⚡ ' + (o.urgent ? "Снять срочность" : "Срочная") + "</button></div>";
    }
    var tabs = [["info", "Информация"]];
    if (["owner", "ops", "sales", "design"].indexOf(p) >= 0) tabs.push(["tz", "Тех. задание"]);
    tabs.push(["log", "История"]);
    var body = S.tab === "log" ? logTab() : S.tab === "tz" ? tzTab() : infoTab(o);
    var money_ = can("money") && o.amount != null;
    return '<div class="modal-bg" data-bg="1"><div class="modal"><div class="m-head"><div class="row"><h2>№' + E(o.number) + (o.customer ? " · " + E(o.customer) : "") + "</h2>"
      + (o.urgent ? '<span class="pill urg">⚡ Срочно</span>' : "") + (money_ ? (o.post_paid ? '<span class="pill ok">₽ Оплачено</span>' : '<span class="pill warn">₽ Не оплачено</span>') : "")
      + '<button class="x" data-close="1">✕</button></div><div style="color:var(--muted);margin-top:2px">' + E(o.object) + "</div>" + stepper(o) + "</div>"
      + '<div class="m-body">' + nx + '<div class="tabs">' + tabs.map(function (t) { return '<button data-tab="' + t[0] + '" class="' + (S.tab === t[0] ? "on" : "") + '">' + t[1] + "</button>"; }).join("") + "</div>" + body + "</div></div></div>";
  }
  function formHtml() {
    var f = S.form;
    return '<div class="modal-bg" data-bg="1" style="align-items:center;justify-content:center;padding:16px"><div class="modal" style="width:min(520px,100%);height:auto;max-height:92vh;border-radius:20px">'
      + '<div class="m-head"><div class="row"><h2 style="font-size:1.2rem">Новая задача из договора</h2><button class="x" data-close="1">✕</button></div></div><div class="m-body">'
      + '<div class="fld"><label>Номер договора</label><input id="nfNum" value="' + E(f.number) + '"></div>'
      + '<div class="fld"><label>Заказчик (компания)</label><input id="nfCust" value="' + E(f.customer) + '" list="dsCust"></div><datalist id="dsCust">' + (S.customers || []).map(function (c) { return '<option value="' + E(c.name) + '">'; }).join("") + "</datalist>"
      + '<div class="fld"><label>Объект</label><input id="nfObj" value="' + E(f.object) + '"></div>'
      + '<div class="g2f"><div class="fld"><label>Срок по договору</label><input id="nfDue" type="date" value="' + E(f.due) + '"></div><div class="fld"><label>Сумма, ₽</label><input id="nfSum" type="number" min="0" value="' + E(f.amount) + '"></div></div>'
      + '<div class="fld"><label><input type="checkbox" id="nfAdv" ' + (f.adv ? "checked" : "") + '> Предусмотрен аванс</label></div>'
      + '<div class="fld" ' + (f.adv ? "" : 'style="display:none"') + ' id="nfAdvBox"><label>Сумма аванса, ₽</label><input id="nfAdvSum" type="number" min="0" value="' + E(f.advSum) + '"></div>'
      + '<div class="dbox"><small>Что произойдёт</small>' + (f.adv ? "Задача встанет на паузу «Ожидает аванс», бухгалтеру уйдёт «Выставить счёт на аванс»." : "Задача сразу попадёт на «Сбор данных» к операционному менеджеру.") + "</div>"
      + '<div class="err" id="nfErr">' + E(f.err || "") + '</div><button class="btn primary block" data-create="1">Создать задачу</button></div></div></div>';
  }
  function paint() {
    if (!S.mount) return;
    var el = S.mount.el;
    if (S.err) { el.innerHTML = '<div class="ds dspage"><div class="err">Ошибка: ' + E(S.err) + '</div><button class="btn ghost" id="dsRetry">Повторить</button></div>'; var r = document.getElementById("dsRetry"); if (r) r.onclick = DS.reload; return; }
    if (!S.meta) return;
    var q = document.activeElement && document.activeElement.id === "dsQ";
    var k = S.mount.kind;
    if (k === "contract" && S.cmode !== "kp") {                 // рабочий генератор договоров: окно не перерисовываем, чтобы не терять введённое
      if (!el.querySelector("#cgFrame")) el.innerHTML = '<div class="ds dspage">' + genScreen() + "</div>";
      return;
    }
    el.innerHTML = k === "ov" ? '<div class="ds dspage">' + overview() + "</div>" : k === "load" ? '<div class="ds dspage">' + loadScreen() + "</div>"
      : k === "flow" ? '<div class="ds dspage">' + flowScreen() + "</div>" : k === "tz" ? '<div class="ds dspage">' + tzScreen() + "</div>"
      : k === "stages" ? '<div class="ds dspage">' + stagesScreen() + "</div>" : k === "auto" ? '<div class="ds dspage">' + autoScreen() + "</div>"
      : k === "price" ? '<div class="ds dspage">' + priceScreen() + "</div>" : k === "report" ? '<div class="ds dspage">' + reportScreen() + "</div>" : k === "stats" ? '<div class="ds dspage">' + statsScreen() + "</div>"
      : k === "kp" ? '<div class="ds dspage">' + kpScreen() + "</div>" : k === "kpc" ? '<div class="ds dspage">' + kpcScreen() + "</div>" : k === "contract" ? '<div class="ds dspage">' + contractScreen() + "</div>"
      : k === "cust" ? '<div class="ds dspage">' + custScreen() + "</div>" : k === "week" ? '<div class="ds dspage">' + weekScreen() + "</div>" : screen();
    if (q) { var qe = document.getElementById("dsQ"); if (qe) { qe.focus(); qe.setSelectionRange(qe.value.length, qe.value.length); } }
    var m = modalRoot();
    if (S.nt) { m.innerHTML = ntHtml(); return; }
    if (S.form) { m.innerHTML = formHtml(); return; }
    if (S.edit) { m.innerHTML = planHtml(); return; }
    var o = S.open ? find(S.open) : null;
    if (S.open && !o) { m.innerHTML = '<div class="modal-bg" data-bg="1" style="align-items:center;justify-content:center"><div class="modal" style="width:min(420px,100%);height:auto;border-radius:20px"><div class="m-body"><h3>Задача не найдена</h3><p class="note">Её нет или она вам недоступна.</p><button class="btn ghost" data-close="1">Закрыть</button></div></div></div>'; return; }
    m.innerHTML = o ? windowHtml(o) : "";
    var sp = m.querySelector('.stepper'), cu = m.querySelector('.stp.cur'); if (sp && cu) sp.scrollLeft = Math.max(0, cu.offsetLeft - sp.clientWidth / 2 + cu.offsetWidth / 2);
  }

  /* ---------- «Поставить задачу»: по этапу конвейера или лично сотруднику (с привязкой / без привязки) ---------- */
  var NT_STEPS = [["", "Личная задача сотруднику"], ["a1", "Обращение: операционному менеджеру"], ["a2", "Сбор вводных: продажам (срок 1 день)"], ["a3", "КП отправлено: продажам"]];
  var NT_ROLE = { a1: "операционный менеджер", a2: "отдел продаж", a3: "отдел продаж" };
  function ntHtml() {
    var n = S.nt; if (!n) return "";
    var fld = 'style="width:100%;border:1px solid var(--line);border-radius:10px;padding:9px 11px;background:var(--surface);color:var(--ink);font:inherit"';
    var users = S.assignable || [], ords = (S.orders || []).filter(function (o) { return DONE_ST.indexOf(o.stage) < 0 || o.id === +n.order; });
    var POSN = { owner: "Руководитель", design: "Руководитель проектного отдела", sales: "Отдел продаж", ops: "Операционный менеджер", acc: "Бухгалтер", designer: "Проектировщик" };
    return '<div class="modal-bg" data-bg="1" style="align-items:center;justify-content:center;padding:16px"><div class="modal" style="width:min(560px,100%);height:auto;max-height:92vh;border-radius:20px">'
      + '<div class="m-head"><div class="row"><div><h2 style="font-size:1.2rem">Поставить задачу</h2>'
      + (n.thread ? '<div style="color:var(--muted);font-size:.86rem">Привязана к диалогу: ' + E(n.thread_title || n.thread) + "</div>" : "") + '</div><button class="x" data-close="1">✕</button></div></div><div class="m-body">'
      + '<div class="fld"><label>Что это</label><select data-nt="step" ' + fld + ">" + NT_STEPS.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === n.step ? " selected" : "") + ">" + E(s[1]) + "</option>"; }).join("") + "</select></div>"
      + '<div class="fld"><label>Кому</label><select data-nt="assignee" ' + fld + '><option value="0">' + (n.step ? "— по этапу: " + NT_ROLE[n.step] + " —" : "— мне —") + "</option>"
      + users.map(function (u) { return '<option value="' + u.id + '"' + (u.id === +n.assignee ? " selected" : "") + ">" + E(u.name) + " — " + E(POSN[u.position] || u.position || "") + "</option>"; }).join("") + "</select></div>"
      + '<div class="fld"><label>Что нужно сделать</label><input data-nt="title" ' + fld + ' value="' + E(n.title) + '" placeholder="' + (n.step ? "Можно оставить пустым — возьмём название этапа" : "Например: позвонить заказчику и уточнить площадь") + '"></div>'
      + '<div class="g2f"><div class="fld"><label>Срок</label><input type="date" data-nt="due" ' + fld + ' value="' + E(n.due) + '"></div>'
      + '<div class="fld"><label>Привязать к проектной задаче</label><select data-nt="order" ' + fld + '><option value="0">— без привязки —</option>'
      + ords.map(function (o) { return '<option value="' + o.id + '"' + (o.id === +n.order ? " selected" : "") + ">№" + E(o.number) + " · " + E(o.customer || "") + " · " + E((o.object || "").slice(0, 40)) + "</option>"; }).join("") + "</select></div></div>"
      + '<div class="fld"><label>Комментарий</label><textarea rows="3" data-nt="note" ' + fld + ">" + E(n.note) + "</textarea></div>"
      + (n.err ? '<div class="err">' + E(n.err) + "</div>" : "")
      + '<button class="btn primary block" data-ntsave="1">Поставить задачу</button></div></div></div>';
  }
  function ntField(el) { var k = el.dataset.nt; if (k && S.nt) S.nt[k] = el.value; }
  function ntOpen(opts) {
    opts = opts || {};
    var need = [];
    if (S.assignable == null) need.push(api("/users/assignable").then(function (u) { S.assignable = u; }, function () { S.assignable = []; }));
    if (S.orders == null) need.push(load().then(null, function () {}));
    return Promise.all(need).then(function () {
      S.nt = { step: opts.step || "", assignee: 0, title: opts.title || "", due: "", order: opts.order || 0, thread: opts.thread_id || "", thread_title: opts.thread_title || "", note: "", err: "" };
      modalRoot().innerHTML = ntHtml();
    });
  }
  function ntSave() {
    var n = S.nt; if (!n) return;
    if (!n.title.trim() && !n.step) { n.err = "Опишите, что нужно сделать"; modalRoot().innerHTML = ntHtml(); return; }
    api("/tasks", { title: n.title, assignee_id: +n.assignee || 0, due: n.due, step: n.step, order_id: +n.order || 0, thread_id: n.thread, note: n.note }).then(function (r) {
      S.nt = null; modalRoot().innerHTML = ""; toast("Задача поставлена: " + r.assignee); S.tasks = null;
      if (S.mount) return load().then(paint);
    }, function (e) { n.err = String(e); modalRoot().innerHTML = ntHtml(); });
  }
  DS.newTask = ntOpen;
  DS.orders = function () { return (S.orders || []).map(function (o) { return { id: o.id, label: "№" + o.number + " · " + (o.customer || "") + " · " + (o.object || "") }; }); };
  DS.ensureOrders = function () { return S.orders == null && C && C.loggedIn() ? load().then(null, function () {}) : Promise.resolve(); };

  /* ---------- «Обзор»: одна задача — одна строка, комментарии прямо в строке ---------- */
  function ovRow(o) {
    var cm = (S.cm || {})[o.id] || [], opened = S.cmOpen && S.cmOpen[o.id], last = cm[cm.length - 1];
    var tn = o.left_days == null ? "muted" : o.left_days < 0 ? "bad" : o.left_days <= 2 ? "warn" : "info";
    var head = '<div class="ovl' + (o.urgent ? " urg" : "") + '"><button class="num" data-open="' + o.id + '" title="Открыть окно задачи">№' + E(o.number) + "</button>"
      + '<span class="cu" title="' + E(o.customer || "") + '">' + E(o.customer || "—") + '</span><span class="ob" title="' + E(o.object || "") + '">' + E(o.object || "") + "</span>"
      + '<span class="pill muted"><i class="dot" style="background:' + (STAGE_COLOR[o.stage] || "#999") + '"></i>' + E(o.stage) + "</span>"
      + '<span class="ex">' + E(o.executor || "не назначен") + "</span>"
      + '<span class="pill ' + tn + '">' + E(o.left_days == null ? "Без срока" : leftText(o.left_days)) + "</span>"
      + '<span class="lc" title="' + E(last ? last.user + ": " + last.text : "") + '">' + (last ? "<b>" + E(last.user) + ":</b> " + E(last.text) : "") + "</span>"
      + '<button class="cmb' + (opened ? " on" : "") + '" data-cmtoggle="' + o.id + '" title="Комментарии">💬 ' + cm.length + "</button></div>";
    if (!opened) return '<div class="ovr">' + head + "</div>";
    var items = cm.map(function (x) {
      var d = new Date(x.ts * 1000);
      return '<div class="ovc-i"><b>' + E(x.user) + '</b> <small>' + d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) + "</small><div>" + E(x.text) + "</div></div>";
    }).join("") || '<div class="note" style="margin:0">Комментариев пока нет</div>';
    S.cmDraft = S.cmDraft || {};
    return '<div class="ovr open">' + head + '<div class="ovc">' + items
      + '<div class="ovc-f"><textarea rows="2" data-cmd="' + o.id + '" placeholder="Написать комментарий…">' + E(S.cmDraft[o.id] || "") + '</textarea><button class="btn primary sm" data-cmsend="' + o.id + '">Отправить</button></div></div></div>';
  }

  /* ---------- «Обзор» ---------- */
  function isoDay(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
  function monday() { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  var DONE_ST = ["Сдано", "Закрыто"];
  function overview() {
    var p = pos(), canAll = p === "owner" || p === "sales" || p === "ops", f = S.ov, type = canAll ? f.type : "p";
    var seg = canAll ? '<div class="bar" style="margin:0 0 16px"><div class="seg">' + [["p", "Проектные"], ["o", "Операционные"], ["s", "Продажи"]].map(function (x) { return '<button data-otype="' + x[0] + '" class="' + (type === x[0] ? "on" : "") + '">' + x[1] + "</button>"; }).join("") + "</div></div>" : "";
    var newBtn = (p === "owner" || p === "sales" || p === "ops") ? '<button class="btn accent" data-new="1">' + ic("plus") + "Новая задача</button>" : "";
    var head = '<div class="head"><div><h1>Обзор</h1><p>Нажмите на показатель, чтобы увидеть именно эти задачи</p></div>' + newBtn + "</div>"
      + "" + seg;
    var search = '<div class="tools"><label class="search" style="flex:1;display:flex;gap:10px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:10px 14px"><input id="dsQ" style="border:0;background:transparent;outline:0;width:100%" placeholder="Номер, заказчик, объект, исполнитель…" value="' + E(f.q) + '"></label></div>';
    var q = (f.q || "").toLowerCase();
    function tiles(arr) { return '<div class="tiles">' + arr.map(function (x) { return '<button class="tile ' + (f.tile === x[0] ? "on" : "") + '" data-tile="' + x[0] + '" style="--c:' + x[2] + '"><div class="n">' + x[3] + '</div><div class="l">' + x[1] + "</div></button>"; }).join("") + "</div>"; }
    if (type === "o" || type === "s") {
      var tk = (S.tasks || []).filter(function (x) { return type === "o" ? (x.kind === "ops" || x.kind === "acc") : x.kind === "sales"; });
      var kp_ = type === "s" ? (S.kp || []).filter(function (k) { return k.status !== "Оплачено" && k.status !== "Отказ"; }) : [];
      var rows = tk.map(function (x) { return { kind: "t", left: x.left_days, wait: x.state === "wait", text: (x.title + " " + (x.assignee || "") + " " + (x.object || "")), html: taskCard(x) }; })
        .concat(kp_.map(function (k) { return { kind: "k", left: k.last_days != null && k.last_days > 5 ? -1 : (k.last_days != null && k.last_days >= 3 ? 1 : 9), wait: k.status === "КП отправлено", text: (k.number + " " + k.customer + " " + k.object), html: kpCard(k) }; }));
      var cnt = { all: rows.length, over: rows.filter(function (x) { return x.left != null && x.left < 0; }).length, hot: rows.filter(function (x) { return x.left != null && x.left >= 0 && x.left <= 2; }).length, wait: rows.filter(function (x) { return x.wait; }).length };
      var tl = [["all", "В работе", "var(--org)", cnt.all], ["over", type === "s" ? "КП без общения 5+ дн. / просрочено" : "Просрочено", "var(--bad)", cnt.over], ["hot", "Горят (≤ 2 дн.)", "var(--accent)", cnt.hot], ["wait", type === "o" ? "Ждут ответа заказчика" : "КП ждут ответа", "var(--warn)", cnt.wait]];
      var shown = rows.filter(function (x) {
        if (f.tile === "over" && !(x.left != null && x.left < 0)) return false;
        if (f.tile === "hot" && !(x.left != null && x.left >= 0 && x.left <= 2)) return false;
        if (f.tile === "wait" && !x.wait) return false;
        return !q || x.text.toLowerCase().indexOf(q) >= 0;
      }).sort(function (a, b) { return (a.left == null ? 999 : a.left) - (b.left == null ? 999 : b.left); });
      return head + tiles(tl) + search + '<div class="list">' + (shown.map(function (x) { return x.html; }).join("") || '<div class="note">Ничего не найдено</div>') + "</div>";
    }
    var all = S.orders || [], act_ = all.filter(function (o) { return DONE_ST.indexOf(o.stage) < 0; });
    var hasMoney = can("money");
    var cnt = {
      active: act_.length,
      over: act_.filter(function (o) { return o.left_days != null && o.left_days < 0; }).length,
      hot: act_.filter(function (o) { return o.left_days != null && o.left_days >= 0 && o.left_days <= 2; }).length,
      review: all.filter(function (o) { return o.stage === "На согласовании"; }).length,
      edits: all.filter(function (o) { return o.edits > 0; }).length,
      unpaid: hasMoney ? all.filter(function (o) { return !o.post_paid && o.stage !== "Закрыто"; }).length : 0
    };
    var visStages = S.meta.stages || [];
    var T = [["active", "В работе", "var(--brand)"], ["over", "Просрочено", "var(--bad)"], ["hot", "Горят (≤ 2 дн.)", "var(--accent)"]];
    if (visStages.indexOf("На согласовании") >= 0) T.push(["review", "На согласовании", "#e0a21c"]);
    T.push(["edits", "Правок от заказчиков", "#8b6fe0"]);
    if (hasMoney) T.push(["unpaid", "Не оплачено", "var(--ok)"]);
    var list = all.filter(function (o) {
      var isAct = DONE_ST.indexOf(o.stage) < 0, l = o.left_days;
      if (f.tile === "active" && !isAct) return false;
      if (f.tile === "over" && !(isAct && l != null && l < 0)) return false;
      if (f.tile === "hot" && !(isAct && l != null && l >= 0 && l <= 2)) return false;
      if (f.tile === "review" && o.stage !== "На согласовании") return false;
      if (f.tile === "edits" && !(o.edits > 0)) return false;
      if (f.tile === "unpaid" && (o.post_paid || o.stage === "Закрыто")) return false;
      if (f.stage && o.stage !== f.stage) return false;
      if (q && (o.number + " " + (o.customer || "") + " " + o.object + " " + (o.executor || "")).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || (a.left_days == null ? 9999 : a.left_days) - (b.left_days == null ? 9999 : b.left_days); });
    var chips = '<div class="chips"><button class="chip ' + (!f.stage ? "on" : "") + '" data-ostage="">Все стадии</button>'
      + visStages.map(function (s) { return '<button class="chip ' + (f.stage === s ? "on" : "") + '" data-ostage="' + E(s) + '"><i class="dot" style="background:' + (STAGE_COLOR[s] || "#999") + '"></i>' + E(s) + "</button>"; }).join("") + "</div>";
    return head + tiles(T.map(function (x) { return [x[0], x[1], x[2], cnt[x[0]]]; })) + search + chips
      + '<div class="ovlist">' + (list.map(ovRow).join("") || '<div class="note">Ничего не найдено</div>') + "</div>";
  }

  /* ---------- «Занятость» ---------- */
  var ACTIVE_WORK = ["В проектировании", "Проверка", "Корректировка"];
  var WD = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
  function span(o) { return [o.plan_start || o.start_date || "", o.plan_end || o.due_date || ""]; }
  function staff() {
    var by = {};
    (S.people || []).forEach(function (u) { by[u.name] = { id: u.id, name: u.name }; });
    (S.orders || []).forEach(function (o) { if (o.executor && !by[o.executor]) by[o.executor] = { id: o.executor_id, name: o.executor }; });
    return Object.keys(by).map(function (k) { return by[k]; });
  }
  function loadScreen() {
    var p = pos(), people = staff(), mon = monday(), today = isoDay(new Date());
    var canEdit = p === "owner" || p === "design";
    var act_ = (S.orders || []).filter(function (o) { return ACTIVE_WORK.indexOf(o.stage) >= 0 && o.executor; });
    var unassigned = (S.orders || []).filter(function (o) { return o.stage === "Готов к проектированию" && !o.executor; });
    var cards = people.map(function (u) {
      var mine = act_.filter(function (o) { return o.executor_id === u.id || o.executor === u.name; });
      var late = mine.filter(function (o) { return o.left_days != null && o.left_days < 0; }).length;
      return '<div class="panel person" style="display:flex;gap:12px;align-items:center;padding:13px 15px">' + ava(u.name, "lg") + "<div><b>" + E(u.name) + '</b><br><small style="color:var(--muted)">' + mine.length + " активн." + (late ? ' · <span style="color:var(--bad)">' + late + " просроч.</span>" : "") + "</small></div></div>";
    }).join("") + '<div class="panel person" style="display:flex;gap:12px;align-items:center;padding:13px 15px"><span class="ava lg" style="background:var(--line);color:var(--muted)">?</span><div><b>Не назначено</b><br><small style="color:var(--muted)">' + unassigned.length + " готовы к проектированию</small></div></div>";
    var head = '<div class="head"><div><h1>Занятость</h1><p>Кто чем занят. Серым показаны задачи без исполнителя, готовые к проектированию.' + (canEdit ? " Нажмите на любую полоску: можно назначить исполнителя и сроки прямо здесь." : "") + '</p></div>'
      + '<div class="seg"><button data-ld="week" class="' + (S.ld === "week" ? "on" : "") + '">План на неделю</button><button data-ld="tl" class="' + (S.ld === "tl" ? "on" : "") + '">Месяц</button></div></div>'
      + ""
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px">' + cards + "</div>";
    var open = canEdit ? "data-edit" : "data-open";
    if (S.ld === "week") {
      var wkDays = []; for (var i = 0; i < 7; i++) wkDays.push(isoDay(addDays(mon, i)));
      var lbl = dmy(wkDays[0]).slice(0, 5) + " — " + dmy(wkDays[6]).slice(0, 5);
      return head + '<div class="wk" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px">' + people.map(function (u) {
        var mine = act_.filter(function (o) { return o.executor_id === u.id || o.executor === u.name; });
        return '<div class="panel"><div style="display:flex;gap:10px;align-items:center;padding:13px 15px;background:var(--surface-2);border-bottom:1px solid var(--line)">' + ava(u.name) + '<div style="flex:1"><b>' + E(u.name) + '</b><br><small style="color:var(--muted)">' + mine.length + " в плане · " + lbl + "</small></div></div>"
          + (mine.map(function (o) {
            var sp = span(o), tn = tone(o);
            return '<button style="display:block;width:100%;text-align:left;padding:11px 15px;border-bottom:1px solid var(--line)" ' + open + '="' + o.id + '"><div style="display:flex;gap:10px;align-items:baseline"><span style="font-weight:800;color:var(--brand);font-size:1.15rem">№' + E(o.number) + '</span><span style="font-weight:600">' + E(o.object) + "</span></div>"
              + '<div style="margin-top:6px"><span class="pill ' + tn + '">' + E(leftText(o.left_days)) + '</span></div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-top:8px">'
              + wkDays.map(function (d) { var on = sp[0] && sp[1] && d >= sp[0] && d <= sp[1]; return '<span title="' + dmy(d).slice(0, 5) + '" style="height:9px;border-radius:3px;border:1px solid ' + (on ? (tn === "bad" ? "var(--bad)" : "var(--brand)") : "var(--line)") + ";background:" + (on ? (tn === "bad" ? "var(--bad)" : "var(--brand)") : "var(--surface-2)") + '"></span>'; }).join("") + "</div></button>";
          }).join("") || '<div class="note" style="padding:14px 15px;margin:0">Задач в плане нет</div>') + "</div>";
      }).join("") + "</div>";
    }
    /* месяц: колонки по дням, выходные закрашены, у каждого сотрудника свой цвет, отмечен последний день загрузки */
    var off = Math.max(0, (S.ldo | 0)), dim = 30, iso = [], dow = [];
    for (var k = 0; k < dim; k++) { var dd = addDays(new Date(), off + k); iso.push(isoDay(dd)); dow.push((dd.getDay() + 6) % 7); }
    var cols = "160px repeat(" + dim + ",minmax(30px,1fr))", minw = 160 + dim * 32;
    var nav = '<div class="seg" style="margin-bottom:12px"><button data-ldn="-1"' + (off ? "" : " disabled") + '>← назад</button><button data-ldn="0" class="on">' + dmy(iso[0]).slice(0, 5) + " — " + dmy(iso[dim - 1]).slice(0, 5) + (off ? "" : " · с сегодняшнего дня") + '</button><button data-ldn="1">вперёд →</button></div>';
    function cellBg(i, row) {
      var we = dow[i] >= 5, td = iso[i] === today;
      return '<div style="grid-column:' + (i + 2) + ";grid-row:" + row + ";border-left:1px solid var(--line);" + (td ? "background:color-mix(in srgb,var(--accent) 18%,transparent);" : we ? "background:color-mix(in srgb,var(--bad) 10%,var(--surface-2));" : "") + '"></div>';
    }
    function bar(o, un, color, row, isLast) {
      var sp = span(o), s0 = sp[0] || iso[0], e0 = sp[1] || iso[dim - 1];
      if (e0 < iso[0] || s0 > iso[dim - 1]) return "";
      var a = Math.max(0, iso.indexOf(s0)), b = iso.indexOf(e0);
      if (s0 < iso[0]) a = 0;
      if (b < 0) b = e0 > iso[dim - 1] ? dim - 1 : 0;
      if (b < a) b = a;
      var late = o.left_days != null && o.left_days < 0;
      var bg = un ? "background:color-mix(in srgb,var(--muted) 35%,transparent);border:1px dashed var(--muted);color:var(--ink);" : "background:" + color + ";color:#fff;" + (late ? "outline:2px solid var(--bad);" : "");
      return '<div ' + open + '="' + o.id + '" title="' + E("№" + o.number + " · " + (o.object || "") + " · " + dmy(s0) + " — " + dmy(e0)) + '" style="grid-column:' + (a + 2) + "/" + (b + 3) + ";grid-row:" + row + ";height:28px;margin:5px 2px;border-radius:8px;" + bg
        + "font-size:.76rem;font-weight:700;padding:0 9px;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;cursor:pointer;position:relative;z-index:1;"
        + (isLast ? "box-shadow:inset -5px 0 0 rgba(0,0,0,.35);" : "") + '">' + (late ? "⚠ " : "") + "№" + E(o.number) + " · " + E(un ? "назначить" : (o.object || "").split(",")[0]) + (isLast && sp[1] ? " · до " + dmy(sp[1]).slice(0, 5) : "") + "</div>";
    }
    var header = '<div style="display:grid;grid-template-columns:' + cols + ';background:var(--surface-2);color:var(--muted);min-width:' + minw + 'px;border-bottom:1px solid var(--line)"><div style="padding:8px 12px">Сотрудник</div>'
      + iso.map(function (d, i) {
        var we = dow[i] >= 5, td = d === today;
        return '<div style="padding:6px 2px;text-align:center;font-size:.72rem;border-left:1px solid var(--line);' + (td ? "color:var(--accent);font-weight:800;background:color-mix(in srgb,var(--accent) 18%,transparent);" : we ? "color:var(--bad);background:color-mix(in srgb,var(--bad) 10%,var(--surface-2));" : "") + '">' + WD[dow[i]] + "<br><b>" + d.slice(8, 10) + "</b></div>";
      }).join("") + "</div>";
    function block(u) {
      var color = personColor(u.name);
      var mine = act_.filter(function (o) { return o.executor_id === u.id || o.executor === u.name; });
      var ends = mine.map(function (o) { return span(o)[1]; }).filter(Boolean).sort();
      var last = ends.length ? ends[ends.length - 1] : "";
      var lastO = mine.filter(function (o) { return span(o)[1] === last; })[0];
      var shown = mine.filter(function (o) { var sp = span(o); return !(sp[1] && sp[1] < iso[0]) && !(sp[0] && sp[0] > iso[dim - 1]); });
      var nm = '<div style="padding:8px 6px 8px 12px;display:flex;gap:8px;align-items:flex-start;grid-row:1/span ' + Math.max(1, shown.length) + '">' + ava(u.name, "sm") + "<div><b>" + E(u.name) + '</b><br><small style="color:var(--muted)">' + mine.length + " в работе"
        + (last ? '<br><span style="color:' + color + ';font-weight:700">загружен до ' + dmy(last).slice(0, 5) + "</span>" : "") + "</small></div></div>";
      if (!shown.length) return '<div style="display:grid;grid-template-columns:' + cols + ';min-width:' + minw + 'px;border-bottom:1px solid var(--line);min-height:52px">' + nm + iso.map(function (d, i) { return cellBg(i, 1); }).join("") + "</div>";
      return '<div style="display:grid;grid-template-columns:' + cols + ';min-width:' + minw + 'px;border-bottom:1px solid var(--line)">' + nm
        + shown.map(function (o, r) { return iso.map(function (d, i) { return cellBg(i, r + 1); }).join("") + bar(o, false, color, r + 1, o === lastO); }).join("") + "</div>";
    }
    var body = people.map(block).join("")
      + (unassigned.length ? '<div style="display:grid;grid-template-columns:' + cols + ';min-width:' + minw + 'px;border-top:2px solid var(--line)"><div style="padding:8px 12px;font-weight:700;color:var(--muted);grid-row:1/span ' + unassigned.length + '">Не назначены</div>'
        + unassigned.map(function (o, r) { return iso.map(function (d, i) { return cellBg(i, r + 1); }).join("") + bar(o, true, "", r + 1, false); }).join("") + "</div>" : "");
    return head + nav + '<div class="panel" style="overflow:auto">' + header + (body || '<div class="note" style="padding:16px;margin:0">Задач в плане нет</div>') + "</div>"
      + '<div class="note">Каждому сотруднику свой цвет. Выходные закрашены красноватым, сегодня — оранжевым; жирный край полоски и подпись «до …» — последний день загрузки специалиста.'
      + (canEdit ? " Нажатие на полоску открывает окно: исполнитель, начало и срок." : "") + "</div>";
  }
  function planHtml() {
    var o = find(S.edit); if (!o) return "";
    var sp = span(o), today = isoDay(new Date());
    var people = staff().filter(function (u) { return u.id; });
    return '<div class="modal-bg" data-bg="1" style="align-items:center;justify-content:center;padding:16px"><div class="modal" style="width:min(520px,100%);height:auto;max-height:92vh;border-radius:20px">'
      + '<div class="m-head"><div class="row"><div><h2 style="font-size:1.2rem">Назначить сроки · №' + E(o.number) + '</h2><div style="color:var(--muted);font-size:.86rem">' + E(o.object) + '</div></div><button class="x" data-close="1">✕</button></div></div><div class="m-body">'
      + '<div class="fld"><label>Исполнитель</label><select id="pl-who"><option value="0">— не назначен —</option>' + people.map(function (u) { return '<option value="' + u.id + '"' + (u.id === o.executor_id ? " selected" : "") + ">" + E(u.name) + "</option>"; }).join("") + "</select></div>"
      + '<div class="g2f"><div class="fld"><label>Начало работ</label><input id="pl-s" type="date" value="' + E(o.plan_start || (o.start_date > today ? o.start_date : today)) + '"></div>'
      + '<div class="fld"><label>Срок сдачи</label><input id="pl-e" type="date" value="' + E(o.plan_end || o.due_date || "") + '"></div></div>'
      + '<div class="dbox"><small>Что произойдёт</small>' + (o.stage === "Готов к проектированию" ? "Исполнитель получит уведомление «Вам поставлена задача №" + E(o.number) + "», стадия станет «В проектировании»; срок появится в «Занятости» и в окне задачи." : "Изменятся исполнитель и сроки плана; стадия останется прежней.") + "</div>"
      + '<button class="btn primary block" data-saveplan="' + o.id + '">Сохранить</button>'
      + '<button class="btn ghost block" style="margin-top:10px" data-open="' + o.id + '">Открыть окно задачи</button></div></div></div>';
  }
  /* ---------- «Заказчики» ---------- */
  var TZ = [["Europe/Kaliningrad", "Калининград (−1 к МСК)"], ["Europe/Moscow", "Москва (МСК)"], ["Europe/Samara", "Самара (+1 к МСК)"], ["Asia/Yekaterinburg", "Екатеринбург (+2 к МСК)"],
    ["Asia/Omsk", "Омск (+3 к МСК)"], ["Asia/Krasnoyarsk", "Красноярск (+4 к МСК)"], ["Asia/Irkutsk", "Иркутск (+5 к МСК)"], ["Asia/Yakutsk", "Якутск (+6 к МСК)"],
    ["Asia/Vladivostok", "Владивосток (+7 к МСК)"], ["Asia/Magadan", "Магадан (+8 к МСК)"], ["Asia/Kamchatka", "Камчатка (+9 к МСК)"]];
  function custScreen() {
    var p = pos(), canEdit = p === "owner" || p === "sales" || p === "ops", list = S.customers || [], d = S.cu.draft;
    if (!can("customers")) return '<div class="head"><div><h1>Заказчики</h1></div></div><div class="note">Раздел недоступен для вашей роли.</div>';
    var title = p === "design" ? "Кому звонить" : "Заказчики";
    var head = '<div class="head"><div><h1>' + title + "</h1><p>" + (p === "design" ? "Заказчики ваших проектов: контакты, часовой пояс и комментарий менеджера. Звонки делаете вы." : "Компании, контактные лица, часовой пояс и комментарии менеджера") + "</p></div>"
      + (canEdit ? '<button class="btn accent" data-cnew="1">' + ic("plus") + "Новый заказчик</button>" : "") + "</div>"
      + "";
    var rows = list.map(function (c) {
      var m = (c.contacts && c.contacts[0]) || null;
      return '<button style="display:flex;gap:14px;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line);width:100%;text-align:left;' + (S.cu.sel === c.id ? "background:var(--brand-soft);box-shadow:inset 3px 0 0 var(--brand)" : "") + '" data-csel="' + c.id + '">'
        + ava(c.name, "lg") + '<div style="min-width:0"><b>' + E(c.name) + "</b> " + (c.regular ? '<span class="pill ok">постоянный</span>' : "") + '<div style="color:var(--muted);font-size:.86rem">' + (m && m.fio ? E(m.fio) + (m.pos ? " · " + E(m.pos) : "") : "контакт не указан") + "</div></div>"
        + '<div style="margin-left:auto;text-align:right"><b style="font-size:1.25rem;display:block">' + (c.works || 0) + '</b><small style="color:var(--muted)">работ за всё время</small>'
        + (c.fill != null ? '<div class="fillbar" title="Заполненность карточки: ' + c.fill + '%"><i style="width:' + c.fill + '%;background:' + (c.fill < 40 ? "var(--bad,#d33)" : c.fill < 75 ? "var(--warn,#e8a317)" : "var(--ok,#2a9d5c)") + '"></i></div><small style="color:var(--muted)">карточка ' + c.fill + "%</small>" : "")
        + "</div></button>";
    }).join("") || '<div class="note" style="padding:16px;margin:0">Заказчиков пока нет</div>';
    var det;
    if (!d) det = '<div class="panel pad"><p class="sub" style="margin:0">Выберите заказчика слева</p></div>';
    else {
      var ro = canEdit ? "" : " disabled";
      var tzOpts = TZ.map(function (z) { return '<option value="' + z[0] + '"' + (d.tz === z[0] ? " selected" : "") + ">" + E(z[1]) + "</option>"; }).join("");
      if (!TZ.some(function (z) { return z[0] === d.tz; }) && d.tz) tzOpts += '<option value="' + E(d.tz) + '" selected>' + E(d.tz) + "</option>";
      var jobs = (S.orders || []).filter(function (o) { return o.customer_id === d.id; });
      det = '<div class="panel pad"><h3>' + (d.id ? "Карточка заказчика" : "Новый заказчик") + "</h3>"
        + '<div class="fld" style="margin-top:12px"><label>Наименование компании</label><input data-cf="name" value="' + E(d.name) + '"' + ro + "></div>"
        + '<div class="fld"><label><input type="checkbox" data-cfchk="1" ' + (d.regular ? "checked" : "") + ro + "> Постоянный заказчик</label></div>"
        + "<h3 style=\"margin-top:14px\">Контактные лица</h3>"
        + (d.contacts || []).map(function (c, i) {
          return '<div class="ctt" style="margin-top:10px"><div class="fld" style="margin-bottom:8px"><label>ФИО</label><input data-cf="c.' + i + '.fio" value="' + E(c.fio) + '"' + ro + "></div>"
            + '<div><div class="fld" style="margin-bottom:8px"><label>Должность</label><input data-cf="c.' + i + '.pos" value="' + E(c.pos) + '"' + ro + "></div>"
            + '<div class="fld" style="margin-bottom:0"><label>Сотовый телефон <span style="color:var(--bad)">*</span></label><input data-cf="c.' + i + '.phone" value="' + E(c.phone) + '" placeholder="+7 …"' + (c.phone ? "" : ' style="border-color:var(--bad);background:var(--bad-soft)"') + ro + "></div></div>"
            + '<div class="fld" style="margin:8px 0 0"><label>E-mail (по нему диалоги привязываются к заказчику)</label><input data-cf="c.' + i + '.email" value="' + E(c.email || "") + '"' + ro + "></div>"
            + (canEdit && d.contacts.length > 1 ? '<button class="btn ghost sm" style="margin-top:8px" data-cdel="' + i + '">Убрать</button>' : "") + "</div>";
        }).join("")
        + (canEdit ? '<button class="btn ghost sm" style="margin:6px 0 12px" data-cadd="1">+ Контактное лицо</button>' : "")
        + reqBlock(d, ro)
        + '<div class="fld"><label>Часовой пояс</label><select data-cftz="1"' + ro + ">" + tzOpts + '</select><div class="note" style="margin-top:6px">Сейчас у заказчика: <b>' + nowIn(d.tz) + "</b></div></div>"
        + '<div class="fld"><label>Комментарий менеджера</label><textarea data-cf="comment"' + ro + ">" + E(d.comment || "") + "</textarea></div>"
        + (S.cu.err ? '<div class="err">' + E(S.cu.err) + "</div>" : "")
        + (canEdit ? '<button class="btn primary block" data-csave="1">Сохранить</button>' : "")
        + (jobs.length ? '<h3 style="margin-top:16px">Задачи</h3>' + jobs.map(function (o) { return '<button class="doc" style="width:100%;text-align:left" data-open="' + o.id + '"><span>📁</span><div><b>№' + E(o.number) + " · " + E(o.object) + "</b><small>" + E(o.stage) + "</small></div></button>"; }).join("") : "")
        + "</div>";
    }
    return head + '<div class="dsg21" style="align-items:start"><div class="panel">' + rows + "</div><div>" + det + "</div></div>";
  }
  function reqBlock(d, ro) {
    if (d.inn === undefined && !pos().match(/^(owner|sales|ops)$/)) return "";          // роли без доступа к реквизитам блок не видят
    var f = function (k, label, ph) { return '<div class="fld" style="margin-bottom:8px"><label>' + label + '</label><input data-cf="' + k + '" value="' + E(d[k] || "") + '" placeholder="' + (ph || "") + '"' + ro + "></div>"; };
    return '<h3 style="margin-top:14px">Реквизиты</h3><p class="note" style="margin-top:2px">Попадают в договор. ИНН проверяется по контрольной сумме.</p>'
      + '<div class="g2f">' + f("inn", "ИНН", "10 или 12 цифр") + f("kpp", "КПП", "9 цифр") + "</div>"
      + f("address", "Юридический адрес", "") + f("bank_name", "Банк", "")
      + '<div class="g2f">' + f("bik", "БИК", "9 цифр") + f("signer_pos", "Должность подписанта", "в лице … (род. п.)") + "</div>"
      + f("rs", "Расчётный счёт", "20 цифр") + f("ks", "Корр. счёт", "20 цифр") + f("signer_fio", "ФИО подписанта", "Иванов Иван Иванович");
  }
  function saveCustomer() {
    var d = S.cu.draft; if (!d) return;
    if (!(d.name || "").trim()) { S.cu.err = "Укажите наименование компании"; return paint(); }
    var body = { name: d.name.trim(), regular: !!d.regular, tz: d.tz, comment: d.comment || "", contacts: (d.contacts || []).filter(function (c) { return c.fio || c.pos || c.phone || c.email; }) };
    ["inn", "kpp", "address", "bank_name", "bik", "rs", "ks", "signer_fio", "signer_pos"].forEach(function (k) { if (d[k] !== undefined) body[k] = d[k]; });
    var p = d.id ? api("/customers/" + d.id, body) : api("/customers", body);
    p.then(function (r) {
      S.customers = null; S.orders = null;
      var keep = d.id || (r && r.id) || null;
      return load().then(function () { S.cu.sel = keep; var c = (S.customers || []).filter(function (x) { return x.id === keep; })[0]; S.cu.draft = c ? JSON.parse(JSON.stringify(c)) : null; S.cu.err = ""; paint(); toast("Сохранено"); });
    }, function (er) { S.cu.err = String(er); paint(); });
  }

  /* ---------- «План на неделю» проектировщика ---------- */
  function loadWeek() {
    if (!S.wk) S.wk = { start: isoDay(monday()), days: [] };
    return api("/week?start=" + S.wk.start).then(function (d) { S.wk.days = d; }, function () { S.wk.days = []; });
  }
  function dayRec(day) { return (S.wk && S.wk.days || []).filter(function (x) { return x.day === day; })[0] || { day: day, worked: 0, off: 0, comment: "" }; }
  function act2(p, reloadWeek) {
    return p.then(function () { return reloadWeek ? loadWeek() : null; }).then(paint, function (e) { toast(String(e && e.message || e)); });
  }
  /* «Мои задачи» руководителя проектного отдела: корректировки по замечаниям, переданные диалоги; рядом — план недели */
  function myTasksScreen() {
    var items = (S.tasks || []).slice().sort(function (a, b) { return (a.left_days == null ? 999 : a.left_days) - (b.left_days == null ? 999 : b.left_days); });
    var head = '<div class="head"><div><h1>Мои задачи</h1><p>Личные задачи: корректировки по замечаниям заказчиков и диалоги, которые вам передали. Выполненные уходят из списка.</p></div></div>';
    if (!items.length) return head + '<div class="panel pad"><p class="sub" style="margin:0">Личных задач пока нет.</p></div>';
    return head + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px">' + items.map(taskCard).join("") + "</div>";
  }
  function weekScreen() {
    if (pos() !== "design") return weekPlan();
    var tab = S.mt || "tasks", n = (S.tasks || []).length;
    var seg = '<div class="seg" style="margin-bottom:16px"><button data-mt="tasks" class="' + (tab === "tasks" ? "on" : "") + '">Мои задачи' + (n ? " · " + n : "") + '</button><button data-mt="week" class="' + (tab === "week" ? "on" : "") + '">План на неделю</button></div>';
    return seg + (tab === "tasks" ? myTasksScreen() : weekPlan());
  }
  function weekPlan() {
    var p = pos(), me = C && C.me ? C.me.id : 0, days = (S.wk && S.wk.days) || [], today = isoDay(new Date());
    var mine = (S.orders || []).filter(function (o) { return o.executor_id === me && ACTIVE_WORK.indexOf(o.stage) >= 0; });
    var off = days.filter(function (d) { return d.off; }).length, done = days.filter(function (d) { return d.worked && !d.off; }).length, work = 7 - off;
    var lbl = days.length ? dmy(days[0].day).slice(0, 5) + " — " + dmy(days[6].day).slice(0, 5) : "";
    var head = '<div class="head"><div><h1>План на неделю</h1><p>Отмечайте отработанные дни, выходные назначаете сами. Комментарий под днём увидит руководитель в недельном отчёте.</p></div>'
      + '<div class="seg"><button data-wnav="-1">← Пред.</button><button data-wnav="0" class="on">' + lbl + '</button><button data-wnav="1">След. →</button></div></div>'
      + ""
      + '<div class="tiles" style="margin-bottom:16px"><div class="tile" style="--c:var(--ok)"><div class="n">' + done + " из " + work + '</div><div class="l">Рабочих дней отработано</div></div>'
      + '<div class="tile" style="--c:var(--accent)"><div class="n">' + off + '</div><div class="l">Отдыхал(а) на неделе, дн.</div></div>'
      + '<div class="tile" style="--c:var(--brand)"><div class="n">' + mine.length + '</div><div class="l">Проектов в работе</div></div></div>';
    var WN = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    return head + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px">' + days.map(function (d, i) {
      var tasks = mine.filter(function (o) { var sp = span(o); return sp[0] && sp[1] && d.day >= sp[0] && d.day <= sp[1] && !d.off; });
      return '<div class="panel" style="padding:12px;display:flex;flex-direction:column;gap:9px;min-height:260px;' + (d.day === today ? "border-color:var(--accent);box-shadow:0 0 0 2px var(--accent) inset;" : "") + (d.off ? "background:var(--surface-2);opacity:.92;" : "") + '">'
        + '<div style="display:flex;justify-content:space-between"><b>' + WN[i] + '</b><small style="color:var(--muted)">' + dmy(d.day).slice(0, 5) + "</small></div>"
        + (d.off ? '<div style="height:40px;border-radius:12px;background:var(--line);display:grid;place-items:center;font-weight:700;color:var(--muted);font-size:.86rem">Выходной</div>'
          : tasks.map(function (o) { return '<div style="border:1px solid var(--line);border-left:4px solid var(--brand);background:var(--surface-2);border-radius:10px;padding:7px 9px;font-size:.82rem"><b>№' + E(o.number) + "</b> " + E((o.object || "").split(",")[0]) + "</div>"; }).join("")
            + '<button data-wmark="' + d.day + '" style="height:40px;border-radius:12px;font-weight:800;font-size:.86rem;' + (d.worked ? "border:1.5px solid var(--ok);background:var(--ok-soft);color:var(--ok)" : "border:1.5px dashed var(--accent);color:#d0702f") + '">' + (d.worked ? "✓ Отработал(а)" : "Отметить отработанным") + "</button>")
        + '<textarea data-wc="' + d.day + '" placeholder="Комментарий к дню…" style="width:100%;min-height:62px;border:1px solid var(--line);border-radius:10px;padding:7px 9px;font-size:.8rem;resize:vertical;background:var(--surface);color:var(--ink)">' + E(d.comment || "") + "</textarea>"
        + '<button data-woff="' + d.day + '" style="font-size:.76rem;color:var(--muted);text-decoration:underline;text-align:center">' + (d.off ? "Снять выходной" : "Сделать выходным") + "</button></div>";
    }).join("") + "</div>";
  }
  /* ---------- реестр КП, конструктор КП, договор ---------- */
  var KP_TONE = { "Обращение": "info", "Сбор вводных": "info", "КП отправлено": "info", "Договор подписан": "ok", "Оплачено": "paid", "Отказ": "bad" };
  var KP_FUNNEL = ["Обращение", "Сбор вводных", "КП отправлено", "Договор подписан", "Оплачено"];
  var KP_MANUAL = ["Обращение", "Сбор вводных", "КП отправлено", "Договор подписан", "Оплачено", "Отказ"];
  var PAYS = [["adv50", "Аванс 50%, остаток по акту"], ["adv30", "Аванс 30%, остаток по акту"], ["post100", "100% по акту"]];
  var PRICE = [];
  var CT_TYPES = ["Проектирование СПС, СОУЭ", "Проектирование АУП, ВПВ", "Проектирование (комплекс)", "Обследование объекта", "Расчёт пожарного риска, категорирование", "Разработка исполнительной документации"];
  function execName() { return (S.comp && S.comp.name) || "ИП Шубинов Д.А."; }
  function loadKp() { return api("/kp").then(function (k) { S.kp = k; }, function (e) { S.kp = []; S.err = String(e); }); }
  function kpIsLate(k) { return k.last_days != null && k.last_days > 5 && k.status !== "Оплачено" && k.status !== "Отказ"; }
  function kpScreen() {
    var p = pos(), canEdit = p === "owner" || p === "sales" || p === "ops", list = S.kp || [];
    var head = '<div class="head"><div><h1>Реестр КП</h1><p>Выставленные стоимости: аванс и постоплата отдельно. Красным выделены КП, по которым нет общения более 5 дней</p></div>'
      + (canEdit ? '<div style="display:flex;gap:10px"><a class="btn accent" href="#/kpc" style="text-decoration:none">' + ic("plus") + "Составить КП</a></div>" : "") + "</div>"
      + "";
    var funnel = '<div class="panel pad" style="margin-bottom:16px"><h3>Воронка</h3><p class="sub">Статус «Оплачено» ставится автоматически, когда вся оплата (аванс и постоплата) пришла из 1С</p><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      + KP_FUNNEL.map(function (s, i) { var n = list.filter(function (k) { return k.status === s; }).length; return '<span class="pill ' + KP_TONE[s] + '" style="height:30px;padding:0 14px">' + E(s) + " · " + n + "</span>" + (i < KP_FUNNEL.length - 1 ? '<span style="color:var(--muted)">→</span>' : ""); }).join("") + "</div></div>";
    function advTxt(k) { if (!k.has_adv) return k.order_id ? "без аванса" : "—"; return money(k.adv_sum) + " · " + (k.adv_paid ? "оплачен " + dmy(k.adv_date).slice(0, 5) : (k.order_id ? "ждём" : "план")); }
    function postTxt(k) { if (!k.order_id && !k.post_sum) return "—"; return money(k.post_sum) + " · " + (k.post_paid ? "оплачена " + dmy(k.post_date).slice(0, 5) : (k.order_id ? "ждём" : "план")); }
    var rows = list.map(function (k) {
      var late = kpIsLate(k);
      var st = canEdit && !k.order_id ? '<select data-kpstatus="' + k.id + '" style="min-width:150px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);padding:5px 8px">' + KP_MANUAL.map(function (s) { return "<option" + (s === k.status ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select>" : '<span class="pill ' + (KP_TONE[k.status] || "info") + '">' + E(k.status) + "</span>";
      var acts = canEdit && !k.order_id && k.status !== "Отказ" ? '<button class="btn ghost sm" data-kpcontract="' + k.id + '">Договор</button> ' : "";
      if (canEdit && !k.order_id) acts += '<button class="btn ghost sm" data-kptouch="' + k.id + '">Был контакт</button> ';
      acts += docButtons(k);
      var del = canEdit && !k.order_id ? '<button class="btn ghost sm kpx" data-kpdel="' + k.id + '" title="Удалить КП из реестра">✕</button>' : "";
      var svc = k.services.map(function (s) { return s.name; }).join(", ");
      return '<tr class="' + (late ? "late" : "") + '"><td><b>' + E(k.number) + "</b></td><td>" + E(k.customer) + '</td><td class="ell" title="' + E(k.object + " — " + svc) + '">' + E(k.object) + " <small>" + E(svc) + "</small></td>"
        + "<td>" + (k.issued_date ? dmy(k.issued_date) : "—") + "</td><td><b>" + money(k.amount) + "</b></td><td>" + st + "</td><td>" + advTxt(k) + "</td><td>" + postTxt(k) + "</td>"
        + '<td class="lastc ' + (late ? "late" : "") + '">' + (k.last_days == null ? "—" : k.last_days === 0 ? "сегодня" : plural(k.last_days, ["день", "дня", "дней"]) + " назад") + (late ? " ⚠" : "") + "</td><td>" + E(k.manager) + '</td><td class="nw">' + acts + '</td><td class="kpd">' + del + "</td></tr>";
    }).join("");
    function docButtons(k) {
      var b = '<button class="btn ghost sm" title="КП в PDF" data-doc="' + k.id + ':kp:pdf">КП PDF</button> <button class="btn ghost sm" title="КП в Word" data-doc="' + k.id + ':kp:docx">КП Word</button>';
      if (canEdit && k.contract_number) b += ' <button class="btn ghost sm" title="Договор в PDF" data-doc="' + k.id + ':contract:pdf">Дог. PDF</button> <button class="btn ghost sm" title="Договор в Word" data-doc="' + k.id + ':contract:docx">Дог. Word</button>';
      return b;
    }
    return head + funnel + '<div class="panel" style="overflow:auto"><table class="tbl grid-c kpt"><tr><th>№ КП</th><th>Заказчик</th><th>Объект / услуги</th><th>Дата выставления КП</th><th>Сумма</th><th>Статус</th><th>Аванс</th><th>Постоплата</th><th>Последнее общение</th><th>Менеджер</th><th>Действия и документы</th><th></th></tr>'
      + (rows || '<tr><td colspan="12">КП пока нет</td></tr>') + "</table></div>";
  }
  function kpTotal() { return (S.kpf ? S.kpf.items : []).reduce(function (a, i) { return a + (i.on ? (+i.price || 0) : 0); }, 0); }
  function kpcInit() {
    if (S.kpf) return;
    S.kpf = { id: 0, customer_id: 0, object: "", pay: "adv50", err: "", items: [] };
  }
  /* строка в составе КП: добавить или обновить по названию */
  function kpAddLine(name, price) {
    kpcInit();
    var ex = S.kpf.items.filter(function (i) { return i.name === name; })[0];
    if (ex) { ex.on = true; if (price != null) ex.price = price; } else S.kpf.items.push({ name: name, price: price || 0, on: true, custom: true });
  }
  function kpcScreen() {
    var p = pos();
    if (!(p === "owner" || p === "sales" || p === "ops")) return '<div class="head"><div><h1>Конструктор КП</h1></div></div><div class="note">Раздел недоступен для вашей роли.</div>';
    kpcInit();
    var f = S.kpf, cs = S.customers || [], total = kpTotal(), pay = PAYS.filter(function (x) { return x[0] === f.pay; })[0] || PAYS[0];
    var pct = f.pay === "adv50" ? 0.5 : f.pay === "adv30" ? 0.3 : 0, adv = Math.round(total * pct);
    var inpS = 'style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--surface);color:var(--ink)"';
    var lines = f.items.map(function (i, idx) {
      return '<div class="dsv on" style="display:grid;grid-template-columns:1fr 112px auto;gap:6px;align-items:start">'
        + '<textarea rows="2" data-kf="i.' + idx + '.name" placeholder="Наименование" ' + inpS + ">" + E(i.name) + "</textarea>"
        + '<input type="number" min="0" data-kf="i.' + idx + '.price" value="' + (+i.price || 0) + '" ' + inpS + ">"
        + '<button class="btn ghost sm" data-kdel="' + idx + '" title="Убрать из КП">✕</button></div>';
    }).join("") || '<div class="note">Выберите услуги в прайсе справа или рассчитайте стоимость в калькуляторе</div>';
    var form = '<div class="panel pad"><h3>Состав КП</h3><p class="sub">Услуги можно править: название и цену</p>'
      + '<div class="fld"><label>Заказчик (из базы заказчиков)</label><select data-kf="customer_id"><option value="0">— выберите —</option>' + cs.map(function (c) { return '<option value="' + c.id + '"' + (c.id === f.customer_id ? " selected" : "") + ">" + E(c.name) + "</option>"; }).join("") + "</select></div>"
      + '<div class="fld"><label>Объект</label><input data-kf="object" value="' + E(f.object) + '"></div>'
      + lines
      + '<button class="btn ghost sm" data-kadd="1" style="margin:6px 0 12px">+ Своя позиция</button>'
      + '<div class="fld"><label>Оплата</label><select data-kf="pay">' + PAYS.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === f.pay ? " selected" : "") + ">" + E(x[1]) + "</option>"; }).join("") + "</select></div>"
      + '<div class="dbox"><small>Итого</small><b id="kTotal" style="font-size:1.3rem">' + money(total) + "</b>" + (adv ? "<div>Аванс " + money(adv) + ", остаток по акту " + money(total - adv) + "</div>" : "<div>Без аванса, оплата по акту</div>") + "</div>"
      + (f.err ? '<div class="err">' + E(f.err) + "</div>" : "")
      + '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" data-ksave="send">Выставить КП</button><button class="btn ghost" data-ksave="draft">Сохранить черновик</button></div></div>';
    var tab = S.kt || "price";
    var seg = '<div class="seg" style="margin-bottom:12px">' + [["price", "Услуги"], ["calc", "Калькулятор"], ["print", "Печать"]].map(function (x) {
      return '<button data-kt="' + x[0] + '" class="' + (tab === x[0] ? "on" : "") + '">' + x[1] + "</button>";
    }).join("") + "</div>";
    var side;
    if (!S.price) side = '<div class="note">Прайс-лист недоступен.</div>';
    else if (tab === "calc") side = priceCalc(true);
    else if (tab === "print") side = pricePrint(true);
    else side = '<div class="panel pad"><h3>Прайс-лист</h3><p class="sub">Нажмите «+», чтобы добавить услугу в КП. Цену можно поправить слева</p>'
      + S.price.items.filter(function (i) { return i.active; }).map(function (i, j) {
        var inKp = f.items.some(function (x) { return x.name === i.name; });
        return '<div class="dsv ' + (inKp ? "on" : "") + '" style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center"><span>' + E(i.name) + (i.note ? '<br><small style="color:var(--muted)">' + E(i.note) + "</small>" : "") + "</span>"
          + "<b>" + money(i.price) + '</b><button class="btn ' + (inKp ? "ghost" : "primary") + ' sm" data-kpadd="' + j + '" title="Добавить в КП">' + (inKp ? "✓" : "+") + "</button></div>";
      }).join("") + "</div>";
    return '<div class="head"><div><h1>Конструктор КП</h1><p>Слева состав предложения, справа прайс, калькулятор и печать. «Выставить КП» вносит предложение в реестр с датой выставления</p></div></div>'
      + '<div class="kpc kpc-wide"><div>' + form + "</div><div>" + seg + side + "</div></div>";
  }
  function saveKp(send) {
    var f = S.kpf;
    if (!f.customer_id) { f.err = "Выберите заказчика"; return paint(); }
    var items = f.items.filter(function (i) { return i.on && i.name && +i.price > 0; }).map(function (i) { return { name: i.name, price: +i.price }; });
    if (!items.length) { f.err = "Отметьте хотя бы одну услугу с ценой"; return paint(); }
    api("/kp", { customer_id: f.customer_id, object: f.object, services: items, pay: f.pay, send: !!send }).then(function () {
      S.kpf = null; toast(send ? "КП выставлено и добавлено в реестр" : "Черновик сохранён в реестре"); location.hash = "#/kpreg/";
    }, function (er) { f.err = String(er); paint(); });
  }
  /* ---------- конструктор договора (шаблон ИП: 15 разделов + приложения) ---------- */
  function ctGet(path) {
    var o = S.ct && S.ct.data, parts = path.split(".");
    for (var i = 0; i < parts.length && o != null; i++) o = o[parts[i]];
    return o == null ? "" : o;
  }
  function ctSetPath(path, val) {
    var o = S.ct.data, parts = path.split(".");
    for (var i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null) o[parts[i]] = {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = val;
  }
  function ctParty(cu) {
    var head = String(cu.name_full || "").trim(), sh = String(cu.name_short || "").trim();
    if (sh && sh !== head) head += " (" + sh + ")";
    if (cu.type === "ip") return head + ", действующий на основании " + (cu.basis || "листа записи из ЕГРИП") + (cu.ogrn ? ", ОГРНИП № " + cu.ogrn : "");
    if (cu.type === "person") return head + ", действующий от собственного имени";
    return head + ", в лице " + (cu.position_gen || "Генерального директора") + " " + (cu.fio_gen || "____________________") + ", действующего на основании " + (cu.basis || "Устава");
  }
  function ctMissing(d) {
    var m = [], cu = d.customer || {}, s = function (v) { return String(v == null ? "" : v).trim(); };
    function need(ok, f, msg) { if (!ok) m.push([f, msg]); }
    var inn = s(cu.inn).replace(/\D/g, "");
    need(s(d.number), "number", "Номер договора");
    need(/^\d{4}-\d\d-\d\d$/.test(s(d.date)), "date", "Дата договора");
    need(s(d.city), "city", "Город");
    need(s(cu.name_full), "customer.name_full", "Полное наименование заказчика");
    need(s(cu.name_short), "customer.name_short", "Краткое наименование");
    need(innOk(inn), "customer.inn", "ИНН заказчика (10 или 12 цифр, контрольная сумма)");
    if ((cu.type || "org") === "org") {
      need(s(cu.position_gen), "customer.position_gen", "Должность подписанта (в родительном падеже)");
      need(s(cu.fio_gen), "customer.fio_gen", "ФИО подписанта (в родительном падеже)");
      need(s(cu.basis), "customer.basis", "Основание (Устав и т. п.)");
      need(s(cu.position_sign), "customer.position_sign", "Должность подписанта для подписи");
      if (inn.length === 10) need(s(cu.kpp).replace(/\D/g, "").length === 9, "customer.kpp", "КПП заказчика (9 цифр)");
    }
    need(s(cu.signer_fio), "customer.signer_fio", "Подписант: Фамилия И.О.");
    need(s(cu.address), "customer.address", "Юридический адрес заказчика");
    need(s(cu.rs), "customer.rs", "Расчётный счёт");
    need(s(cu.bank), "customer.bank", "Банк");
    need(s(cu.bik), "customer.bik", "БИК");
    need(s(cu.ks), "customer.ks", "Корр. счёт");
    need(s(cu.email) || s(cu.phone), "customer.phone", "Телефон или e-mail заказчика");
    need(s(cu.party_text), "customer.party_text", "Текст о заказчике");
    need(s(d.object_address), "object_address", "Адрес объекта");
    need(+d.days >= 1, "days", "Срок оказания услуг");
    need(+d.pay_days >= 1, "pay_days", "Срок оплаты");
    need(d.adv_pct !== "" && +d.adv_pct >= 0 && +d.adv_pct <= 100, "adv_pct", "Аванс, %");
    need(+d.warranty >= 1, "warranty", "Гарантия, мес.");
    need(s(d.messengers), "messengers", "Мессенджеры рабочего чата");
    if (d.tz) need(+d.tz_sheets >= 1, "tz_sheets", "Количество листов ТЗ");
    if (d.paper) need(+d.paper_copies >= 1, "paper_copies", "Количество бумажных экземпляров");
    var sv = d.services || [];
    need(sv.length > 0, "services", "Добавьте хотя бы одну услугу");
    sv.forEach(function (x, i) {
      need(s(x.name), "services." + i + ".name", "Услуга " + (i + 1) + ": наименование");
      need(+x.unit_price > 0, "services." + i + ".unit_price", "Услуга " + (i + 1) + ": цена");
      need(+x.qty > 0, "services." + i + ".qty", "Услуга " + (i + 1) + ": количество");
    });
    return m;
  }
  function ctTotals(d) {
    var amount = (d.services || []).reduce(function (a, x) { return a + (+x.unit_price || 0) * (+x.qty || 0); }, 0);
    var adv = Math.round(amount * (+d.adv_pct || 0) / 100);
    return { amount: amount, adv: adv, post: amount - adv };
  }
  function loadContractDraft() {
    var open = (S.kp || []).filter(function (k) { return !k.order_id && k.status !== "Отказ"; });
    if (!S.ct || !S.ct.kid) { if (!open.length) { S.ct = null; return Promise.resolve(); } S.ct = { kid: open[0].id }; }
    var c = S.ct;
    if (c.data && c.loadedFor === c.kid) return Promise.resolve();
    return api("/kp/" + c.kid + "/contract/draft").then(function (r) {
      c.data = r.data; c.exec = r.executor; c.saved = r.saved; c.signed = r.signed; c.types = r.customer_types; c.loadedFor = c.kid; c.err = ""; c.upd = false;
    }, function (e) { c.data = null; c.err = String(e); c.loadedFor = c.kid; });
  }
  function ctField(path, label, o) {
    o = o || {};
    var bad = S.ct.miss && S.ct.miss.some(function (x) { return x[0] === path; });
    var v = ctGet(path);
    var st = bad ? ' style="border-color:var(--bad);background:var(--bad-soft)"' : "";
    return '<div class="fld"' + (o.wide ? ' style="grid-column:1/-1"' : "") + "><label>" + label + (o.req === false ? "" : ' <span style="color:var(--bad)">*</span>') + "</label>"
      + (o.area ? '<textarea data-ctp="' + path + '" rows="' + (o.rows || 3) + '"' + st + ">" + E(v) + "</textarea>"
        : '<input ' + (o.type ? 'type="' + o.type + '" ' : "") + 'data-ctp="' + path + '" value="' + E(v) + '"' + (o.ph ? ' placeholder="' + E(o.ph) + '"' : "") + st + ">") + "</div>";
  }
  function ctPaper(d) {
    var t = ctTotals(d), cu = d.customer || {};
    return '<h4>ДОГОВОР № ' + E(d.number || "—") + '</h4><p class="c">г. ' + E(d.city || "—") + " · " + E(d.date ? dmy(d.date) : "—") + "</p>"
      + "<p>" + E(cu.party_text || "—") + "; <b>" + E((S.ct.exec && S.ct.exec.name_short) || execName()) + "</b> (Исполнитель)</p>"
      + "<p><b>Объект:</b> " + E(d.object_address || "—") + "</p>"
      + "<table><tr><th>Услуга</th><th>Кол-во</th><th>Сумма</th></tr>" + (d.services || []).map(function (x) { return "<tr><td>" + E(x.name) + "</td><td>" + E(x.qty) + "</td><td>" + money((+x.unit_price || 0) * (+x.qty || 0)) + "</td></tr>"; }).join("") + "</table>"
      + "<p><b>Итого: " + money(t.amount) + "</b> (НДС не облагается)</p>"
      + "<p>Аванс " + (+d.adv_pct || 0) + "%: " + money(t.adv) + ", остаток " + money(t.post) + "; срок " + (+d.days || 0) + " раб. дн.; гарантия " + (+d.warranty || 0) + " мес.</p>"
      + '<p class="c">Полный текст (15 разделов, приложения 1–3) формируется в Word и PDF</p>';
  }
  function ctMissHtml(m) {
    return m.length ? '<div class="dbox" style="border-color:var(--bad);background:var(--bad-soft)"><small style="color:var(--bad)">Заполните, чтобы создать договор (' + m.length + ")</small>"
      + '<div style="font-size:.86rem">' + m.slice(0, 12).map(function (x) { return "• " + E(x[1]); }).join("<br>") + (m.length > 12 ? "<br>…и ещё " + (m.length - 12) : "") + "</div></div>"
      : '<div class="dbox sys"><small>Проверка</small>Все обязательные поля заполнены</div>';
  }
  function ctForceHtml(c) {
    if ((!c.miss || !c.miss.length) && !c.errForce) return "";
    return '<label style="display:flex;gap:8px;align-items:flex-start;margin:10px 0;padding:10px 12px;border:1px dashed var(--bad);border-radius:10px"><input type="checkbox" data-ctforce="1"' + (c.force ? " checked" : "") + ' style="margin-top:3px">'
      + "<span>Я понимаю, что не все поля заполнены, но хочу скачать договор</span></label>";
  }
  function ctRefresh() {
    var c = S.ct; if (!c || !c.data) return;
    c.miss = ctMissing(c.data);
    var mh = document.getElementById("ctMiss"); if (mh) mh.innerHTML = ctMissHtml(c.miss);
    var pp = document.getElementById("ctPaper"); if (pp) pp.innerHTML = ctPaper(c.data);
    var tot = document.getElementById("ctTotal"); if (tot) { var t = ctTotals(c.data); tot.textContent = money(t.amount) + " · аванс " + money(t.adv) + " · остаток " + money(t.post); }
    var fb = document.getElementById("ctForceBox"); if (fb) { if (!c.miss.length && !c.errForce) c.force = false; fb.innerHTML = ctForceHtml(c); }
    var mk = document.getElementById("ctMake"); if (mk) { var blocked = c.miss.length > 0 && !c.force; mk.disabled = blocked; mk.style.opacity = blocked ? ".5" : ""; }
    document.querySelectorAll("[data-ctp]").forEach(function (el) {
      var bad = c.miss.some(function (x) { return x[0] === el.dataset.ctp; });
      if (el.type === "checkbox") return;
      el.style.borderColor = bad ? "var(--bad)" : ""; el.style.background = bad ? "var(--bad-soft)" : "";
    });
  }
  function cmodeSeg() {
    return '<div class="seg" style="margin-bottom:12px"><button data-cmode="gen" class="' + (S.cmode !== "kp" ? "on" : "") + '">Генератор договоров</button><button data-cmode="kp" class="' + (S.cmode === "kp" ? "on" : "") + '">Договор по КП</button></div>';
  }
  function genScreen() {
    return '<div class="head"><div><h1>Договоры</h1><p>Генератор договоров ИП: Word и PDF, база клиентов и история. Данные хранятся в CRM, документы собираются в браузере.</p></div></div>' + cmodeSeg()
      + '<iframe id="cgFrame" src="contracts/index.html" title="Генератор договоров" style="width:100%;height:calc(100vh - 230px);min-height:640px;border:1px solid var(--line);border-radius:12px;background:#fff"></iframe>';
  }
  function innOk(s) {
    var d = s.split("").map(Number);
    function sum(w) { return w.reduce(function (a, x, i) { return a + x * d[i]; }, 0) % 11 % 10; }
    if (s.length === 10) return d[9] === sum([2, 4, 10, 3, 5, 9, 4, 6, 8]);
    if (s.length === 12) return d[10] === sum([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) && d[11] === sum([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]);
    return false;
  }
  function contractScreen() {
    var p = pos();
    if (!(p === "owner" || p === "sales" || p === "ops")) return '<div class="head"><div><h1>Конструктор договора</h1></div></div><div class="note">Раздел недоступен для вашей роли.</div>';
    var open = (S.kp || []).filter(function (x) { return !x.order_id && x.status !== "Отказ"; });
    var head = '<div class="head"><div><h1>Конструктор договора</h1><p>Договор на услуги ИП по вашему шаблону: заполняется из КП и карточки заказчика либо вводится самостоятельно</p></div><button class="btn accent" data-ctstandalone="1">' + ic("plus") + "Договор без КП</button></div>";
    head += cmodeSeg();
    if (!S.ct || !S.ct.kid) return head + '<div class="note">Нет КП, по которым можно оформить договор. Выставьте КП в «Конструкторе КП» или создайте договор без КП.</div><button class="btn accent" data-ctstandalone="1">' + ic("plus") + "Договор без КП</button>";
    var c = S.ct, k = (S.kp || []).filter(function (x) { return x.id === c.kid; })[0];
    if (!c.data) return head + '<div class="err">' + E(c.err || "Не удалось загрузить данные договора") + "</div>";
    var d = c.data, cu = d.customer || {}, t = ctTotals(d);
    c.miss = ctMissing(d);
    var sel = 'style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--surface);color:var(--ink)"';
    var chk = function (path, label, on) { return '<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" data-ctp="' + path + '"' + (on ? " checked" : "") + "> " + label + "</label>"; };
    var kpPick = '<div class="fld"><label>КП</label><select data-ctpick="1">' + open.map(function (x) { return '<option value="' + x.id + '"' + (x.id === c.kid ? " selected" : "") + ">" + E(x.number + " · " + x.customer + " · " + money(x.amount)) + "</option>"; }).join("") + "</select></div>";
    var priceOpts = (S.price && S.price.items ? S.price.items.filter(function (i) { return i.active; }) : []);
    var f1 = '<div class="panel pad"><h3>1. Исполнитель</h3>' + kpPick
      + '<div class="g2f"><div class="fld"><label>Тип договора</label><select disabled ' + sel + "><option>Договор на услуги (проектирование)</option></select></div>"
      + '<div class="fld"><label>Исполнитель</label><input disabled value="' + E((c.exec && c.exec.name_short) || execName()) + '"></div></div>'
      + '<p class="sub" style="margin:0">Договоры оформляются только от ИП; реквизиты исполнителя берутся из «Прайс → Реквизиты компании».</p></div>';
    var f2 = '<div class="panel pad" style="margin-top:14px"><h3>2. Номер, дата, город</h3><div class="g2f">'
      + ctField("number", "Номер договора") + ctField("date", "Дата договора", { type: "date" }) + "</div>" + ctField("city", "Город") + "</div>";
    var f3 = '<div class="panel pad" style="margin-top:14px"><h3>3. Заказчик</h3>'
      + '<div class="fld"><label>Тип заказчика</label><select data-ctp="customer.type" ' + sel + ">" + [["org", "Организация (ООО, АО и др.)"], ["ip", "Индивидуальный предприниматель"], ["person", "Физическое лицо"]]
        .map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === (cu.type || "org") ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div>"
      + '<div class="g2f">' + ctField("customer.name_full", "Полное наименование") + ctField("customer.name_short", "Краткое наименование") + "</div>"
      + ((cu.type || "org") === "org" ? '<div class="g2f">' + ctField("customer.position_gen", "В лице (должность, род. падеж)", { ph: "Генерального директора" }) + ctField("customer.fio_gen", "ФИО в род. падеже", { ph: "Иванова Ивана Ивановича" }) + "</div>"
        + '<div class="g2f">' + ctField("customer.basis", "Действует на основании", { ph: "Устава" }) + ctField("customer.kpp", "КПП") + "</div>"
        + '<div class="g2f">' + ctField("customer.position_sign", "Должность подписанта (для подписи)", { ph: "Генеральный директор" }) + ctField("customer.org_sign", "Организация в подписи", { req: false }) + "</div>"
        : '<div class="g2f">' + ctField("customer.basis", "Действует на основании", { ph: "листа записи из ЕГРИП" }) + ctField("customer.ogrn", "ОГРНИП", { req: false }) + "</div>")
      + '<div class="g2f">' + ctField("customer.signer_fio", "Подписант: Фамилия И.О.", { ph: "Иванов И.И." }) + ctField("customer.inn", "ИНН") + "</div>"
      + ctField("customer.address", "Юридический адрес", { wide: true })
      + '<div class="g2f">' + ctField("customer.rs", "Расчётный счёт") + ctField("customer.bank", "Банк") + "</div>"
      + '<div class="g2f">' + ctField("customer.bik", "БИК") + ctField("customer.ks", "Корр. счёт") + "</div>"
      + '<div class="g2f">' + ctField("customer.email", "E-mail", { req: false }) + ctField("customer.phone", "Телефон (сотовый)", { ph: "+7 …" }) + "</div>"
      + ctField("customer.party_text", "Текст о Заказчике в начале договора (собирается автоматически, можно править)", { area: true, rows: 3, wide: true })
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px"><button class="btn ghost sm" data-ctparty="1">Собрать текст заново</button></div>'
      + chk("__upd", "Обновить реквизиты в карточке заказчика при создании договора", !!c.upd) + "</div>";
    var f4 = '<div class="panel pad" style="margin-top:14px"><h3>4. Условия договора</h3>'
      + ctField("object_address", "Адрес объекта (после «на объекте, по адресу»)", { wide: true })
      + '<div class="g2f">' + ctField("days", "Срок оказания услуг, раб. дней", { type: "number" }) + ctField("pay_days", "Срок оплаты аванса и остатка, раб. дней", { type: "number" }) + "</div>"
      + '<div class="g2f">' + ctField("adv_pct", "Аванс, %", { type: "number" }) + ctField("warranty", "Гарантия, мес.", { type: "number" }) + "</div>"
      + ctField("messengers", "Мессенджеры рабочего чата", { wide: true })
      + chk("survey", "Объём услуг включает обследование объекта (п. 1.4, 4.1.7)", d.survey)
      + chk("paper", "С печатью документации (заказчику: PDF + бумажные экземпляры)", d.paper) + (d.paper ? ctField("paper_copies", "Бумажных экземпляров", { type: "number" }) : "")
      + chk("tz", "Приложение № 3 «Техническое задание»", d.tz) + (d.tz ? ctField("tz_sheets", "ТЗ — количество листов", { type: "number" }) : "") + "</div>";
    var rows = (d.services || []).map(function (x, i) {
      var inpS = 'style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--surface);color:var(--ink);width:100%"';
      return '<div class="dsv on" style="display:grid;grid-template-columns:1fr 70px 70px 110px 36px;gap:6px;align-items:center">'
        + '<input data-ctp="services.' + i + '.name" value="' + E(x.name) + '" placeholder="Наименование услуги" ' + inpS + ">"
        + '<input data-ctp="services.' + i + '.unit" value="' + E(x.unit) + '" placeholder="ед." ' + inpS + ">"
        + '<input type="number" min="0" step="0.01" data-ctp="services.' + i + '.qty" value="' + E(x.qty) + '" ' + inpS + ">"
        + '<input type="number" min="0" data-ctp="services.' + i + '.unit_price" value="' + E(x.unit_price) + '" ' + inpS + ">"
        + '<button class="btn ghost sm" data-ctsvdel="' + i + '">✕</button></div>';
    }).join("");
    var f5 = '<div class="panel pad" style="margin-top:14px"><h3>5. Услуги (Приложение № 1)</h3><p class="sub">Наименование · ед. · кол-во · цена за единицу</p>' + rows
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0"><select data-ctsvadd="1" ' + sel + ' style="flex:1;min-width:220px"><option value="">+ добавить из прайса…</option>'
      + priceOpts.map(function (i, j) { return '<option value="' + j + '">' + E(i.name) + " — " + money(i.price) + "</option>"; }).join("") + '</select>'
      + '<button class="btn ghost sm" data-ctsvnew="1">+ Своя позиция</button></div>'
      + '<div class="dbox"><small>Итого</small><b id="ctTotal" style="font-size:1.15rem">' + money(t.amount) + " · аванс " + money(t.adv) + " · остаток " + money(t.post) + "</b></div></div>";
    var acts = '<div class="panel pad" style="margin-top:14px"><div id="ctMiss">' + ctMissHtml(c.miss) + "</div>"
      + (c.err ? '<div class="err">' + E(c.err) + "</div>" : "")
      + '<div id="ctForceBox">' + ctForceHtml(c) + "</div>"
      + '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" id="ctMake" data-ctmake="1"' + ((c.miss.length && !c.force) ? ' disabled style="opacity:.5"' : "") + ">" + ic("file") + (c.miss.length && c.force ? "Скачать договор (не все поля заполнены)" : c.saved ? "Сохранить договор" : "Создать договор") + "</button>"
      + (k && k.contract_number ? '<button class="btn ghost" data-doc="' + k.id + ':contract:docx">Скачать Word</button><button class="btn ghost" data-doc="' + k.id + ':contract:pdf">Скачать PDF</button><button class="btn ok" data-ctsign="1">Договор подписан</button>' : "") + "</div>"
      + (k && k.contract_number ? '<div class="autolist"><b>Договор №' + E(k.contract_number) + " сформирован.</b><ul style=\"margin-top:8px\"><li>Привязан к КП " + E(k.number) + " и заказчику «" + E(k.customer) + "»</li>"
        + "<li>После «Договор подписан» система создаст проектную задачу, папку на сервере и чат проекта</li>"
        + "<li>" + (k.has_adv ? "Есть аванс: задача ждёт оплату, бухгалтеру уйдёт «Выставить счёт на аванс»" : "Аванса нет: задача сразу уйдёт на «Сбор данных»") + "</li></ul></div>" : "") + "</div>";
    return head + '<div class="kpc"><div>' + f1 + f2 + f3 + f4 + f5 + acts + '</div><div><div class="paper" id="ctPaper" style="position:sticky;top:14px">' + ctPaper(d) + "</div></div></div>";
  }
  function makeContract() {
    var c = S.ct; c.err = ""; c.miss = ctMissing(c.data);
    var force = !!(c.force && (c.miss.length || c.errForce));
    if (c.miss.length && !force) { c.err = "Заполните обязательные поля или отметьте, что хотите скачать договор без них"; return paint(); }
    api("/kp/" + c.kid + "/contract", { data: c.data, save_customer: !!c.upd, force: force }).then(function () { c.saved = true; c.loadedFor = null; return loadKp(); })
      .then(function () { return loadContractDraft(); })
      .then(function () { toast("Договор сформирован" + (force ? ": скачиваю Word" : "")); paint(); if (force) return downloadDoc(c.kid, "contract", "docx"); },
        function (e) { c.err = String(e); if (/обязательные поля/i.test(c.err)) c.errForce = true; paint(); });
  }
  function newStandalone() {
    return api("/contracts/standalone", {}).then(function (r) { S.ct = { kid: r.id }; S.cmode = "kp"; return loadKp(); }).then(function () { return loadContractDraft(); })
      .then(function () { toast("Пустой договор создан: заполните данные"); if (location.hash !== "#/contracts") location.hash = "#/contracts"; else paint(); }, function (e) { toast(String(e)); });
  }
  function signContract() {
    var c = S.ct;
    var kpRow = (S.kp || []).filter(function (x) { return x.id === c.kid; })[0];
    api("/kp/" + c.kid + "/sign", {}).then(function (r) {
      S.ct = null; S.orders = null; S.tasks = null;
      try {                                                   // создаём папку на сервере через установленную кнопку (нужен VPN)
        var a = document.createElement("a");
        a.href = folderUrl({ number: r.number, object: kpRow ? kpRow.object : "" }, true);
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) {}
      toast("Договор подписан: создана задача №" + r.number + (r.stage === "Ожидает аванс" ? " (ждёт аванс)" : " (на «Сборе данных»)"));
      location.hash = "#/";
    }, function (e) { c.err = String(e); paint(); });
  }
  /* ---------- конвейер процесса ---------- */
  function loadFlow() {
    return api("/flow").then(function (r) { S.fl = r; }, function (e) { S.fl = null; S.err = String(e); });
  }
  function loadPath() {
    if (S.flTab !== "path" || !S.flOrder) return Promise.resolve();
    return api("/orders/" + S.flOrder + "/history").then(function (h) { S.flHist = h; }, function () { S.flHist = []; });
  }
  function flowScreen() {
    var r = S.fl, p = pos();
    if (!r) return '<div class="head"><div><h1>Конвейер заказа</h1></div></div><div class="note">' + (S.err ? E(S.err) : "Нет данных") + "</div>";
    var head = '<div class="head"><div><h1>Конвейер заказа</h1><p>Заказ идёт слева направо и сверху вниз. Нажмите на шаг: под полосой откроется описание (что запускает, кто получает, что делает система).</p></div>'
      + '<div class="seg"><button data-fltab="map" class="' + (S.flTab === "map" ? "on" : "") + '">Схема</button><button data-fltab="path" class="' + (S.flTab === "path" ? "on" : "") + '">Путь заказа</button></div></div>'
      + "";
    if (S.flTab === "path") {
      var os = S.orders || [];
      var sel = '<div class="fld" style="max-width:520px"><label>Задача</label><select id="flOrder">' + os.map(function (o) { return '<option value="' + o.id + '"' + (o.id === S.flOrder ? " selected" : "") + ">№" + E(o.number) + " · " + E(o.customer || "") + " · " + E(o.object) + "</option>"; }).join("") + "</select></div>";
      var h = S.flHist || [];
      return head + '<div class="panel pad"><h3>Путь заказа</h3><p class="sub">От подписания договора до архива: кто и когда что сделал</p>' + sel
        + (h.length ? '<div class="trace">' + h.map(function (e) {
          var d = new Date(e.ts * 1000), c = /Стадия/.test(e.action) ? "var(--brand)" : /Оплата|Договор/.test(e.action) ? "var(--ok)" : e.user_name === "Система" || e.user_name === "Импорт" ? "var(--sys)" : "var(--accent)";
          return '<div class="ev" style="--c:' + c + '"><time>' + d.toLocaleDateString("ru-RU") + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) + "</time><b>" + E(e.action) + (e.detail ? ": " + E(e.detail) : "") + '</b><span class="note" style="margin:0">' + E(e.user_name) + "</span></div>";
        }).join("") + "</div>" : '<p class="note">Событий пока нет</p>') + "</div>";
    }
    var counts = r.counts || {};
    var lanes = r.lanes.map(function (l) {
      var detail = "";
      l.steps.forEach(function (s) {
        if (s.id === S.flStep) {
          detail = '<div class="sdet"><div class="sh"><div><h3>Шаг ' + s.n + ". " + E(s.title) + "</h3><small>Ответственный: <b>" + E(s.who) + "</b>" + (s.days != null ? " · срок: " + s.days + " дн." : (s.label ? " · срок: " + E(s.label) : "")) + '</small></div><button class="x" data-flstep="' + s.id + '">✕</button></div>'
            + '<div class="sg"><div class="dbox"><small>Что запускает шаг</small>' + E(s.trig || "") + '</div><div class="dbox"><small>Кто получает и когда</small>' + E(s.recv || "") + "</div>"
            + '<div class="dbox"><small>Что видит исполнитель</small>' + E(s.sees || "") + '</div><div class="dbox sys"><small>⚙ Что система делает сама</small><ul>' + (s.sys || []).map(function (x) { return "<li>" + E(x) + "</li>"; }).join("") + "</ul></div></div>"
            + '<div class="note" style="margin:0">Далее: <b>' + E(s.next || "") + "</b></div></div>";
        }
      });
      return '<div class="lane ' + l.id + '"><div class="lane-h"><span>' + E(l.title) + "</span><small>" + E(l.sub) + "</small></div>"
        + '<div class="steps">' + l.steps.map(function (s, i) {
          var cnt = r.show_counts && counts[s.id] != null ? '<span class="cn">' + counts[s.id] + "</span>" : "";
          var term = s.days != null ? "срок " + s.days + " дн." : (s.label || "");
          return '<div class="stepbox"><button class="node ' + (S.flStep === s.id ? "on" : "") + '" data-flstep="' + s.id + '"><span class="nh"><span class="no">' + s.n + "</span>" + cnt + "</span><b>" + E(s.title) + '</b><span class="ow">' + E(s.who) + "</span>"
            + (term ? '<span class="tm">' + E(term) + "</span>" : "") + "</button></div>";
        }).join("") + "</div>" + detail + "</div>";
    }).join("");
    return head + lanes;
  }

  /* ---------- технические задания ---------- */
  function loadTz() {
    return api("/tz").then(function (r) { S.tzov = r; S.err = ""; }, function (e) { S.tzov = null; S.err = String(e); });
  }
  function tzScreen() {
    var r = S.tzov, p = pos();
    if (!r) return '<div class="head"><div><h1>Технические задания</h1></div></div><div class="note">' + (S.err ? E(S.err) : "Нет данных") + "</div>";
    var ok = r.filter(function (x) { return x.status === "Утверждено"; }).length, late = r.filter(function (x) { return x.late; }).length;
    var canEdit = p === "owner" || p === "ops";
    var tile = function (c, n, l) { return '<div class="tile" style="--c:' + c + '"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>"; };
    return '<div class="head"><div><h1>Технические задания</h1><p>Что собрано по каждой задаче и где процесс встал. Когда все пункты закрыты, задача сама уходит руководителю проектного отдела</p></div></div>'
      + ""
      + '<div class="tiles" style="margin-bottom:16px">' + tile("var(--ok)", ok, "ТЗ утверждены") + tile("var(--brand)", r.length - ok - late, "В работе") + tile("var(--bad)", late, "Затянуты (5+ дней)") + "</div>"
      + '<div class="panel" style="overflow:auto"><table class="tbl"><tr><th>Задача</th><th>Заказчик</th><th>Стадия</th><th>Пункты ТЗ</th><th>Статус</th><th>Без движения</th><th></th></tr>'
      + (r.map(function (x) {
        return '<tr><td><b>№' + E(x.number) + "</b><br><small>" + E(x.object) + "</small></td><td>" + E(x.customer || "") + "</td><td>" + E(x.stage) + "</td>"
          + '<td><div style="display:flex;gap:10px;align-items:center"><div class="meter" style="flex:1;--c:' + (x.late ? "var(--bad)" : x.done === x.all ? "var(--ok)" : "var(--brand)") + '"><i style="width:' + (x.all ? x.done / x.all * 100 : 0) + '%"></i></div><b>' + x.done + "/" + x.all + "</b></div></td>"
          + '<td><span class="pill ' + x.tone + '">' + E(x.status) + "</span></td><td>" + (x.late ? '<span class="pill bad">' + plural(x.days, ["день", "дня", "дней"]) + "</span>" : plural(x.days, ["день", "дня", "дней"])) + "</td>"
          + '<td class="r"><button class="btn ghost sm" data-tzopen="' + x.id + '">Открыть</button> ' + (canEdit || p === "owner" ? '<button class="btn ghost sm" data-tzremind="' + x.id + '">Напомнить</button>' : "") + "</td></tr>";
      }).join("") || '<tr><td colspan="7">Задач на стадиях до проектирования нет</td></tr>') + "</table></div>";
  }
  function loadTzItem(id) {
    return api("/orders/" + id + "/tz").then(function (r) { S.tz = r; }, function (e) { S.tz = { err: String(e) }; });
  }
  function tzCall(path, body) {
    return api(path, body).then(function () { return loadTzItem(S.open); }).then(function () { S.orders = null; return load(); }).then(function () { return S.open ? api("/orders/" + S.open + "/history").then(function (h) { S.history = h; }, function () { S.history = []; }) : null; })
      .then(function () { if (S.mount && S.mount.kind === "tz") return loadTz(); }).then(function () {
        if (S.open && !find(S.open)) { S.open = null; S.tab = "info"; toast("Готово: задача передана дальше и теперь вам не видна"); }
        paint();
      }, function (e) { toast(String(e && e.message || e)); });
  }
  function tzTab() {
    var r = S.tz;
    if (!r) return '<div class="note">Загрузка…</div>';
    if (r.err) return '<div class="note">' + E(r.err) + "</div>";
    var s = r.summary;
    return '<div class="panel pad"><h3>Техническое задание <span class="pill ' + s.tone + '">' + E(s.status) + "</span></h3><p class=\"sub\">Закрыто пунктов: " + s.done + " из " + s.all + (s.late ? " · без движения " + plural(s.days, ["день", "дня", "дней"]) : "") + "</p>"
      + r.items.map(function (i) {
        return '<div class="chk ' + (i.done ? "ok" : "") + '">' + (r.can_edit ? '<button data-tzset="' + i.idx + ":" + (i.done ? 0 : 1) + '" title="Отметить" style="display:contents"><i>' + (i.done ? "✓" : "") + "</i></button>" : "<i>" + (i.done ? "✓" : "") + "</i>")
          + '<span style="flex:1">' + E(i.title) + "</span>" + (i.done && i.who ? '<small style="color:var(--muted)">' + E(i.who) + "</small>" : "")
          + (r.can_edit && i.custom ? ' <button class="btn ghost sm" data-tzdel="' + i.idx + '">✕</button>' : "") + "</div>";
      }).join("")
      + ""
      + (r.stage === "Сбор данных" && r.can_edit ? '<div class="note">Когда закрыты все пункты, задача сама перейдёт в «Готов к проектированию».</div>' : "") + "</div>";
  }

  /* ---------- этапы и сроки ---------- */
  var LANE_BG = { sales: "linear-gradient(135deg,#9a76c8,#7a55a8)", design: "linear-gradient(135deg,#3a86d6,#1f5c99)", close: "linear-gradient(135deg,#46c28a,#238a58)", after: "linear-gradient(135deg,#f2a65a,#d9782f)" };
  function loadStages() {
    return api("/stages").then(function (r) {
      S.stg = r; S.stgD = {};
      r.lanes.forEach(function (l) { l.steps.forEach(function (s) { S.stgD[s.id] = { title: s.title, who: s.who, days: s.days == null ? "" : s.days, label: s.label || "", auto: s.auto || "" }; }); });
    }, function (e) { S.stg = null; S.err = String(e); });
  }
  var WHO_OPTS = ["Менеджер продаж", "Операционный менеджер", "Руководитель проектного отдела", "Проектировщик", "Бухгалтер", "Бухгалтер, 1С", "Система"];
  function stagesScreen() {
    var r = S.stg, p = pos();
    if (!r) return '<div class="head"><div><h1>Этапы и сроки</h1></div></div><div class="note">' + (S.err ? E(S.err) : "Нет данных") + "</div>";
    var ed = r.can_edit;
    var head = '<div class="head"><div><h1>Этапы и сроки</h1><p>Этапы конвейера, ответственные и сроки. ' + (ed ? "Можно менять название этапа, ответственного, срок в днях, подпись срока и описание: изменения видны на схеме «Конвейер», в напоминаниях и подсказках. Пустое значение возвращает стандартное." : "Правит руководитель.") + "</p></div>"
      + (ed ? '<button class="btn primary" data-stsave="1">Сохранить</button>' : "") + "</div>"
      + "";
    var inp = 'style="width:100%;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--surface);color:var(--ink);font:inherit"';
    var body = r.lanes.map(function (l) {
      return '<div class="panel" style="margin-bottom:16px;overflow:auto"><div style="padding:12px 18px;font-weight:800;color:#fff;background:' + LANE_BG[l.id] + '">' + E(l.title) + ' <span style="font-weight:500;opacity:.9;float:right">' + E(l.sub) + "</span></div>"
        + '<table class="tbl"><tr><th style="width:36px">№</th><th style="min-width:180px">Этап</th><th style="min-width:190px">Ответственный</th><th style="width:210px">Срок</th><th style="min-width:260px">Что делает система</th></tr>'
        + l.steps.map(function (s) {
          var d = S.stgD[s.id] || {};
          if (!ed) return "<tr><td>" + s.n + "</td><td><b>" + E(s.title) + "</b></td><td>" + E(s.who) + "</td><td>" + (s.days != null ? (s.days === 0 ? "в день" : s.days + " дн.") : E(s.label || "—")) + "</td><td><small>" + E(s.auto) + "</small></td></tr>";
          return "<tr><td>" + s.n + '</td><td><input data-sd="' + s.id + '.title" value="' + E(d.title) + '" ' + inp + '></td>'
            + '<td><input list="whoList" data-sd="' + s.id + '.who" value="' + E(d.who) + '" ' + inp + "></td>"
            + '<td><div style="display:flex;gap:6px;align-items:center"><input type="number" min="0" max="90" data-sd="' + s.id + '.days" value="' + E(d.days) + '" placeholder="дн." style="width:70px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--surface);color:var(--ink)">'
            + '<input data-sd="' + s.id + '.label" value="' + E(d.label) + '" placeholder="подпись срока" ' + inp + "></div></td>"
            + '<td><textarea data-sd="' + s.id + '.auto" rows="2" ' + inp + ">" + E(d.auto) + "</textarea></td></tr>";
        }).join("") + "</table></div>";
    }).join("");
    return head + (ed ? '<datalist id="whoList">' + WHO_OPTS.map(function (w) { return '<option value="' + E(w) + '">'; }).join("") + "</datalist>" : "") + body + (S.stgErr ? '<div class="err">' + E(S.stgErr) + "</div>" : "");
  }
  function saveStages() {
    S.stgErr = "";
    var steps = {};
    Object.keys(S.stgD).forEach(function (k) {
      var d = S.stgD[k];
      steps[k] = { title: d.title, who: d.who, days: d.days === "" ? "" : +d.days, label: d.label, auto: d.auto };
    });
    api("/stages", { steps: steps }).then(function (r) { S.stg = r; toast("Этапы и сроки сохранены"); return loadStages(); }).then(paint, function (e) { S.stgErr = String(e); paint(); });
  }

  /* ---------- автоматизация ---------- */
  function loadAuto() {
    return api("/auto").then(function (r) { S.au = r; }, function (e) { S.au = null; S.err = String(e); });
  }
  function autoScreen() {
    var r = S.au;
    if (pos() !== "owner") return '<div class="head"><div><h1>Автоматизация</h1></div></div><div class="note">Раздел виден только руководителю.</div>';
    if (!r) return '<div class="head"><div><h1>Автоматизация</h1></div></div><div class="note">' + (S.err ? E(S.err) : "Нет данных") + "</div>";
    var head = '<div class="head"><div><h1>Автоматизация</h1><p>Напоминания и эскалации по срокам. Каждое событие по задаче или КП срабатывает один раз. Проверка идёт сама примерно раз в 10 минут</p></div>'
      + '<button class="btn ghost" data-aurun="1">Проверить сейчас</button></div>'
      + '<div class="rolebar" style="background:var(--warn-soft);color:var(--warn)">' + ic("lock") + "<span>Этот раздел виден только руководителю.</span></div>";
    var inp = 'style="width:80px;border:1px solid var(--line);border-radius:8px;padding:5px 8px;background:var(--surface);color:var(--ink)"';
    var rules = '<div class="panel" style="margin-bottom:16px"><table class="tbl"><tr><th style="width:70px">Включено</th><th>Правило</th><th style="width:170px">Порог</th><th style="width:110px">Сработало</th></tr>'
      + r.rules.map(function (x) {
        return '<tr><td><input type="checkbox" data-aur="' + x.id + '" data-aue="' + x.id + '" ' + (x.enabled ? "checked" : "") + "></td><td><b>" + E(x.title) + "</b><br><small>" + E(x.descr) + "</small></td>"
          + '<td><input type="number" min="0" max="365" data-aur="' + x.id + '" data-auv="' + x.id + '" value="' + x.value + '" ' + inp + "> " + E(x.unit) + "</td><td>" + (x.fired || 0) + "</td></tr>";
      }).join("") + "</table></div>";
    var log = '<div class="panel pad"><h3>Последние срабатывания</h3>' + (r.log.length ? '<div class="trace" style="margin-top:12px">' + r.log.map(function (e) {
      var d = new Date(e.ts * 1000);
      return '<div class="ev" style="--c:var(--accent)"><time>' + d.toLocaleDateString("ru-RU") + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) + "</time><b>" + E(e.title) + '</b><span class="note" style="margin:0">' + E(e.rule_title) + "</span></div>";
    }).join("") + "</div>" : '<p class="note">Пока ничего не срабатывало</p>') + "</div>";
    return head + rules + log;
  }

  /* ---------- прайс-лист ---------- */
  function loadPrice() {
    return api("/price").then(function (p) { S.price = p; if (!S.pd) S.pd = JSON.parse(JSON.stringify(p.items)); }, function (e) { S.price = null; S.err = String(e); });
  }
  function priceServices() {
    var p = pos(), pr = S.price;
    if (!pr) return '<div class="head"><div><h1>Прайс</h1></div></div><div class="note">' + (S.err ? E(S.err) : "Прайс-лист недоступен для вашей роли.") + "</div>";
    var edit = pr.can_edit, rows = edit ? S.pd : pr.items;
    var head = '<div class="head"><div><h1>Прайс-лист</h1><p>Услуги и цены для конструктора КП. ' + (edit ? "Изменения применяются к новым КП; выставленные КП не меняются." : "Правит руководитель или руководитель отдела продаж.") + "</p></div>"
      + (edit ? '<div style="display:flex;gap:10px"><button class="btn ghost" data-prreset="1">Отменить правки</button><button class="btn primary" data-prsave="1">Сохранить</button></div>' : "") + "</div>"
      + "";
    var inp = 'style="width:100%;border:1px solid var(--line);border-radius:8px;padding:7px 9px;background:var(--surface);color:var(--ink)"';
    var body = rows.map(function (r, i) {
      return edit ? "<tr><td><input data-prf=\"" + i + ".name\" value=\"" + E(r.name) + "\" " + inp + "></td><td><input type=\"number\" min=\"0\" data-prf=\"" + i + ".price\" value=\"" + (+r.price || 0) + "\" " + inp + " ></td>"
        + "<td><input data-prf=\"" + i + ".note\" value=\"" + E(r.note || "") + "\" " + inp + "></td><td><input type=\"checkbox\" data-prfa=\"" + i + "\" " + (r.active ? "checked" : "") + "></td>"
        + "<td><button class=\"btn ghost sm\" data-prdel=\"" + i + "\">✕</button></td></tr>"
        : "<tr" + (r.active ? "" : ' style="opacity:.5"') + "><td>" + E(r.name) + '</td><td class="r"><b>' + money(r.price) + "</b></td><td>" + E(r.note || "") + "</td><td>" + (r.active ? "в продаже" : "снято") + "</td></tr>";
    }).join("");
    return head + '<div class="panel" style="overflow:auto"><table class="tbl"><tr><th>Услуга</th><th style="width:170px">' + (edit ? "Цена, ₽" : "Цена") + '</th><th>Примечание</th><th style="width:90px">В продаже</th>' + (edit ? '<th style="width:50px"></th>' : "") + "</tr>"
      + (body || '<tr><td colspan="5">Пусто</td></tr>') + "</table></div>"
      + (edit ? '<button class="btn ghost" style="margin-top:12px" data-pradd="1">+ Позиция</button>' + (S.pdErr ? '<div class="err">' + E(S.pdErr) + "</div>" : "") : "") + companyBlock();
  }
  /* вкладки прайса: Услуги · Калькулятор · Печать */
  function f2(n) { return Number(n || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function priceScreen() {
    var pr = S.price;
    if (!pr) return priceServices();
    var tab = S.pt || "services";
    var seg = '<div class="seg" style="margin-bottom:16px">' + [["services", "Услуги"], ["calc", "Калькулятор"], ["print", "Печать"]].map(function (x) {
      return '<button data-pt="' + x[0] + '" class="' + (tab === x[0] ? "on" : "") + '">' + x[1] + "</button>";
    }).join("") + "</div>";
    return seg + (tab === "calc" ? priceCalc(false) : tab === "print" ? pricePrint(false) : priceServices());
  }
  /* ---- «Печать»: 4 варианта по площади объекта; цена за 1 экземпляр, следующий экземпляр дешевле; доставка входит */
  function ppInit() {
    if (!S.pp && S.price && S.price.print) S.pp = JSON.parse(JSON.stringify(S.price.print));
    return S.pp;
  }
  function pcState() {
    if (!S.pc) S.pc = { tier: -1, copies: 1 };
    return S.pc;
  }
  function printCost(tier, copies) {
    var pp = (S.pp || (S.price && S.price.print)), t = pp && pp.tiers[tier];
    if (!t) return 0;
    var n = Math.max(1, Math.round(+copies || 1)), p = +t.price || 0;
    return Math.round((p + (n - 1) * p * (1 - (+pp.discount || 0) / 100)) * 100) / 100;
  }
  function printLine(tier, copies) {
    var t = S.price.print.tiers[tier], n = Math.max(1, Math.round(+copies || 1));
    return { name: t.name + (n > 1 ? ", " + n + " экз." : ", 1 экз."), price: printCost(tier, n) };
  }
  function pcTotalHtml() {
    var pc = pcState(), pp = S.pp || S.price.print;
    if (pc.tier < 0) return '<div class="dbox"><small>Печать документации</small>Выберите вариант по площади объекта</div>';
    var n = Math.max(1, Math.round(+pc.copies || 1)), p = +pp.tiers[pc.tier].price || 0, nxt = Math.round(p * (1 - (+pp.discount || 0) / 100) * 100) / 100;
    return '<div class="dbox"><small>Печать документации, ' + n + " экз.</small><b style=\"font-size:1.2rem\">" + f2(printCost(pc.tier, n)) + " ₽</b>"
      + "<div>1-й экземпляр: " + f2(p) + " ₽" + (n > 1 ? " · каждый следующий: " + f2(nxt) + " ₽ (−" + (+pp.discount || 0) + "%)" : "") + "</div><div>Доставка входит в стоимость</div></div>";
  }
  function pricePrint(forKp) {
    var pr = S.price, pp = ppInit(), edit = pr.can_edit && !forKp, pc = pcState();
    if (!pp) return '<div class="note">Прайс на печать недоступен.</div>';
    var inp = 'style="width:100%;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--surface);color:var(--ink)"';
    var head = forKp ? "" : '<div class="head"><div><h1>Печать документации</h1><p>Цена за 1 экземпляр комплекта по площади объекта, доставка входит. Каждый следующий экземпляр дешевле на ' + (+pp.discount || 0) + "%.</p></div>"
      + (edit ? '<div style="display:flex;gap:10px"><button class="btn ghost" data-ppreset="1">Отменить правки</button><button class="btn primary" data-ppsave="1">Сохранить цены</button></div>' : "") + "</div>";
    var rows = pp.tiers.map(function (r, i) {
      return '<label class="dsv ' + (pc.tier === i ? "on" : "") + '" style="display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;cursor:pointer;margin-bottom:8px">'
        + '<input type="radio" name="pctier" data-pct="' + i + '"' + (pc.tier === i ? " checked" : "") + ">"
        + (edit ? '<input data-ppf="t.' + i + '.name" value="' + E(r.name) + '" ' + inp + ">" : "<span><b>" + E(r.name) + "</b></span>")
        + (edit ? '<span style="display:flex;gap:6px;align-items:center"><input type="number" min="0" data-ppf="t.' + i + '.price" value="' + (+r.price || 0) + '" style="width:110px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--surface);color:var(--ink)"> ₽</span>'
          : '<span><b>' + money(r.price) + "</b></span>") + "</label>";
    }).join("");
    var ctl = edit ? '<div class="fld" style="max-width:300px"><label>Скидка на 2-й и последующие экземпляры, %</label><input type="number" min="0" max="100" data-ppf="discount" value="' + (+pp.discount || 0) + '"></div>' : "";
    var bottom = '<div class="panel pad" style="margin-top:12px"><div class="fld" style="max-width:260px"><label>Количество экземпляров</label><input type="number" min="1" step="1" data-pcn="1" value="' + (+pc.copies || 1) + '"></div>'
      + '<div id="pcTotal">' + pcTotalHtml() + "</div>"
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">' + (forKp ? '<button class="btn primary" data-pcadd="1">Добавить в КП</button>' : '<button class="btn primary" data-pcadd="1">Создать КП с печатью</button>')
      + '<button class="btn ghost" data-pcreset="1">Сбросить</button></div></div>';
    return head + '<div class="panel pad">' + rows + ctl + "</div>" + bottom + (S.ppErr ? '<div class="err">' + E(S.ppErr) + "</div>" : "");
  }
  function pcAddToKp() {
    var pc = pcState();
    if (pc.tier < 0) return toast("Выберите вариант печати по площади объекта");
    var l = printLine(pc.tier, pc.copies);
    kpAddLine(l.name, l.price);
    if (S.mount && S.mount.kind === "kpc") { toast("Строка добавлена в КП"); return paint(); }
    location.hash = "#/kpc";
  }
  function savePrint() {
    S.ppErr = "";
    var pp = S.pp;
    api("/price/print", { discount: +pp.discount || 0, tiers: pp.tiers.map(function (r) { return { name: r.name, price: +r.price || 0 }; }) }).then(function (r) {
      S.price = Object.assign({}, S.price, { print: r }); S.pp = null; toast("Прайс на печать сохранён"); paint();
    }, function (e) { S.ppErr = String(e); paint(); });
  }
  /* ---- «Калькулятор»: проектирование по площади + обследование + печать (из вкладки «Печать») + доставка; без смет и экспертизы */
  function calcState() {
    if (!S.calc) S.calc = { syss: [], area: "", survey: false, city: true, pump: false, stairs: -1, print: false, copies: 1 };
    return S.calc;
  }
  function tierIdx(sys, area) {
    var idx = 0;
    for (var i = 0; i < sys.from.length; i++) if (area >= sys.from[i]) idx = i;
    return idx;
  }
  function tierLabel(sys, i) {
    var f = sys.from, n = f[i + 1];
    if (n == null) return "более " + (f[i] - 1).toLocaleString("ru-RU") + " м²";
    return (i === 0 ? "до " + (n - 1).toLocaleString("ru-RU") : "от " + f[i].toLocaleString("ru-RU") + " до " + (n - 1).toLocaleString("ru-RU")) + " м²";
  }
  function calcLines() {
    var pr = S.price, cf = pr.calc, pp = pr.print, c = calcState(), lines = [], ask = false;
    var selSys = cf.systems.filter(function (s) { return (c.syss || []).indexOf(s.id) >= 0; }), area = +c.area || 0;
    if (area > 0) selSys.forEach(function (sys) {           // каждая система — отдельной строкой
      var i = tierIdx(sys, area), v = sys.price[i];
      if (v == null) ask = true;
      lines.push({ name: sys.name + " (" + tierLabel(sys, i) + ")", price: v });
    });
    if (c.survey) {
      lines.push({ name: "Обследование объекта", price: area > 3000 ? cf.survey.over3000 : cf.survey.to3000 });
      if (!c.city) lines.push({ name: "Выезд на обследование вне города", price: cf.survey.out_of_city });
    }
    if (selSys.some(function (s) { return s.pump; }) && c.pump) lines.push({ name: "Проектирование насосной станции пожаротушения", price: cf.pump });
    if (c.stairs >= 0 && cf.stairs[c.stairs]) { var st = cf.stairs[c.stairs]; if (st[1] == null) ask = true; lines.push({ name: st[0], price: st[1] }); }
    if (c.print && area > 0) {
      var ti = 0; while (ti < pp.tiers.length - 1 && pp.tiers[ti].up_to != null && area > pp.tiers[ti].up_to) ti++;
      lines.push(printLine(ti, c.copies || 1));
    }
    return { lines: lines, ask: ask, total: lines.reduce(function (a, l) { return a + (l.price == null ? 0 : l.price); }, 0) };
  }
  function calcResHtml() {
    var r = calcLines();
    if (!r.lines.length) return '<div class="note">Выберите систему и укажите площадь</div>';
    return "<table class=\"tbl\">" + r.lines.map(function (l) { return "<tr><td>" + E(l.name) + '</td><td class="r"><b>' + (l.price == null ? "по запросу" : f2(l.price) + " ₽") + "</b></td></tr>"; }).join("")
      + '<tr><td><b>Итого</b></td><td class="r"><b style="font-size:1.15rem">' + f2(r.total) + " ₽</b></td></tr></table>"
      + (r.ask ? '<div class="note">Часть позиций «по запросу»: стоимость согласуется индивидуально, в итог они не входят.</div>' : "");
  }
  function priceCalc(compact) {
    var pr = S.price, cf = pr.calc, pp = pr.print, c = calcState();
    var anyPump = cf.systems.some(function (s) { return (c.syss || []).indexOf(s.id) >= 0 && s.pump; });
    var sel = 'style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--surface);color:var(--ink)"';
    var chk = function (k, label, on) { return '<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" data-ccb="' + k + '"' + (on ? " checked" : "") + "> " + label + "</label>"; };
    var form = '<div class="panel pad"><h3>Расчёт стоимости</h3><p class="sub">' + E(cf.note) + "</p>"
      + '<div class="fld"><label>Системы (отметьте нужные: каждая — отдельной строкой в КП)</label>'
      + cf.systems.map(function (s) { return '<label style="display:flex;gap:8px;align-items:flex-start;margin:6px 0"><input type="checkbox" data-ccs="' + s.id + '"' + ((c.syss || []).indexOf(s.id) >= 0 ? " checked" : "") + ' style="margin-top:3px"> <span>' + E(s.name) + "</span></label>"; }).join("") + "</div>"
      + '<div class="fld"><label>Площадь объекта, м²</label><input type="number" min="0" data-cc="area" value="' + E(c.area) + '" placeholder="например 2500"></div>'
      + chk("survey", "Требуется обследование", c.survey) + (c.survey ? chk("city", "Объект в городе (иначе +" + money(cf.survey.out_of_city) + " за выезд)", c.city) : "")
      + (anyPump ? chk("pump", "Насосная станция (+" + money(cf.pump) + ")", c.pump) : "")
      + '<div class="fld"><label>Проектирование пожарных лестниц</label><select data-cc="stairs" ' + sel + '><option value="-1">— не требуется —</option>'
      + cf.stairs.map(function (s, i) { return '<option value="' + i + '"' + (i === c.stairs ? " selected" : "") + ">" + E(s[0]) + " — " + (s[1] == null ? "индивидуально" : money(s[1])) + "</option>"; }).join("") + "</select></div>"
      + chk("print", "Печать документации (вариант по площади, доставка входит)", c.print)
      + (c.print ? '<div class="fld"><label>Экземпляров (2-й и далее −' + (+pp.discount || 0) + "%)</label><input type=\"number\" min=\"1\" step=\"1\" data-cc=\"copies\" value=\"" + (c.copies || 1) + "\"></div>" : "")
      + "</div>";
    var res = '<div class="panel pad" style="margin-top:12px"><h3>Итого</h3><div id="calcRes">' + calcResHtml() + "</div>"
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"><button class="btn primary" data-cckp="1">' + (compact ? "Добавить в КП" : "Создать КП из расчёта") + '</button><button class="btn ghost" data-ccreset="1">Сбросить</button></div></div>';
    if (compact) return form + res;
    return '<div class="head"><div><h1>Калькулятор стоимости</h1><p>Проектирование по площади, обследование, печать, сборка и доставка. Сметы и экспертиза не входят</p></div></div><div class="kpc"><div>' + form + "</div><div>" + res.replace("margin-top:12px", "") + "</div></div>";
  }
  function calcToKp() {
    var r = calcLines(), items = r.lines.filter(function (l) { return l.price == null || l.price > 0; });
    if (!items.length) return toast("Сначала выполните расчёт");
    items.forEach(function (l) { kpAddLine(l.name, l.price == null ? 0 : l.price); });          // «по запросу» — строка с нулевой ценой: цену вносят в КП
    if (S.mount && S.mount.kind === "kpc") { toast("Строки добавлены в КП"); return paint(); }
    location.hash = "#/kpc";
  }
  function loadCompany() {
    return api("/settings/company").then(function (c) { S.comp = c; }, function () { S.comp = null; });
  }
  function companyBlock() {
    var c = S.comp; if (!c) return "";
    var ro = c.can_edit ? "" : " disabled";
    var f = function (k, label, ph) { return '<div class="fld"><label>' + label + '</label><input data-cmp="' + k + '" value="' + E(c[k] == null ? "" : c[k]) + '" placeholder="' + (ph || "") + '"' + ro + "></div>"; };
    return '<div class="panel pad" style="margin-top:16px"><h3>Реквизиты компании</h3><p class="sub">Подставляются в КП, договоры и подпись писем. ' + (c.can_edit ? "" : "Правит руководитель.") + "</p>"
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0 14px">'
      + f("name", "Исполнитель (ИП)", "ИП Шубинов Д.А.") + f("city", "Город договора", "Санкт-Петербург") + f("position", "Должность подписанта", "Индивидуальный предприниматель") + f("director", "Подпись (инициалы, фамилия)", "Д.А. Шубинов")
      + f("phone", "Телефон", "+7 …") + f("email", "E-mail", "info@…") + f("site", "Сайт", "https://…") + f("valid_days", "Срок действия КП, календарных дней", "10") + f("work_days", "Срок работ по КП и договору, рабочих дней", "30") + "</div>"
      + '<h4 style="margin:14px 0 6px">Реквизиты ИП для договора</h4><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0 14px">'
      + f("full_name", "ФИО полностью", "Шубинов Дмитрий Андреевич") + f("ogrnip", "ОГРНИП") + f("inn", "ИНН") + f("tax", "Налогообложение (АУСН или УСН)", "АУСН")
      + f("rs", "Расчётный счёт") + f("bank", "Банк", "АО «ТБанк»") + f("bik", "БИК") + f("ks", "Корр. счёт") + f("messenger_phone", "Telegram / MAX (телефон)", "+7 …") + "</div>"
      + f("address", "Юридический адрес", "650002, Кемеровская область – Кузбасс, г. Кемерово, …")
      + (S.compErr ? '<div class="err">' + E(S.compErr) + "</div>" : "")
      + (c.can_edit ? '<button class="btn primary" data-compsave="1">Сохранить реквизиты</button>' : "") + "</div>";
  }
  function saveCompany() {
    S.compErr = "";
    api("/settings/company", S.comp).then(function (c) { S.comp = Object.assign({}, c, { can_edit: true }); toast("Реквизиты сохранены"); paint(); }, function (e) { S.compErr = String(e); paint(); });
  }
  function downloadDoc(kid, kind, fmt) {
    toast(fmt === "pdf" ? "Готовлю PDF… (первый раз до полминуты, повторно — сразу)" : "Готовлю Word…");
    return C.blob("/ds/kp/" + kid + "/doc?kind=" + kind + "&fmt=" + fmt).then(function (f) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(f.blob); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, function (e) { toast(String(e)); });
  }
  function savePrice() {
    S.pdErr = "";
    api("/price", { items: S.pd.map(function (r) { return { name: r.name, price: +r.price || 0, note: r.note || "", active: !!r.active }; }) }).then(function (r) {
      S.price = Object.assign({}, S.price, { items: r.items, can_edit: true }); S.pd = JSON.parse(JSON.stringify(r.items)); S.kpf = null; toast("Прайс-лист сохранён"); paint();
    }, function (e) { S.pdErr = String(e); paint(); });
  }

  /* ---------- недельные отчёты ---------- */
  function downloadText(name, text, mime) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + text], { type: (mime || "text/plain") + ";charset=utf-8" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }
  function reportKind() { var p = pos(); return p === "ops" ? "ops" : p === "sales" ? "sales" : (p === "owner" ? (S.rp && S.rp.kind) || "design" : "design"); }
  function loadReport() {
    if (!S.rp) S.rp = { kind: reportKind(), start: isoDay(monday()), data: null };
    if (pos() !== "owner") S.rp.kind = reportKind();
    return api("/reports/" + S.rp.kind + "?start=" + S.rp.start).then(function (d) { S.rp.data = d; S.err = ""; }, function (e) { S.rp.data = null; S.err = String(e); });
  }
  function fmtVal(v) { return typeof v === "number" && v > 9999 ? money(v) : String(v); }
  function reportText(r) {
    var l = ["Недельный отчёт: " + r.title + " · " + dmy(r.week_start) + " — " + dmy(r.week_end)];
    r.tiles.forEach(function (x) { l.push("• " + x[2] + ": " + x[1]); });
    r.rows.forEach(function (x) { l.push("• " + x[0] + ": " + fmtVal(x[1])); });
    r.people.forEach(function (x) { l.push("• " + x.name + ": отработано " + x.worked + " из " + x.workdays + ", в работе " + x.in_work + ", просрочено " + x.overdue); });
    r.notes.forEach(function (n) { l.push("• " + n); });
    r.questions.forEach(function (q) { if (q.a) l.push("— " + q.q + " " + q.a); });
    return l.join("\n");
  }
  function reportScreen() {
    var p = pos(), r = S.rp && S.rp.data;
    if (!r) return '<div class="head"><div><h1>Недельный отчёт</h1></div></div><div class="note">' + (S.err ? E(S.err) : "Нет данных") + "</div>";
    var tabs = p === "owner" ? '<div class="tabs">' + [["design", "Проектный отдел"], ["ops", "Операционный менеджер"], ["sales", "Отдел продаж"]].map(function (x) { return '<button data-rpkind="' + x[0] + '" class="' + (S.rp.kind === x[0] ? "on" : "") + '">' + x[1] + "</button>"; }).join("") + "</div>" : "";
    var tone = { ok: "var(--ok)", bad: "var(--bad)", brand: "var(--brand)", warn: "var(--warn)" };
    var head = '<div class="head"><div><h1>Недельный отчёт · ' + E(r.title) + "</h1><p>Формируется каждую пятницу в 17:00 и уходит в закрытый канал «Руководители». Неделя " + dmy(r.week_start).slice(0, 5) + " — " + dmy(r.week_end).slice(0, 5) + "</p></div>"
      + '<div style="display:flex;gap:10px;flex-wrap:wrap"><div class="seg"><button data-rpnav="-1">← Пред.</button><button data-rpnav="0" class="on">Эта</button><button data-rpnav="1">След. →</button></div>'
      + '<button class="btn ghost" data-rpdl="1">Скачать</button><button class="btn primary" data-rppub="1">Отправить в канал руководителей</button></div></div>'
      + "" + tabs;
    var tiles = '<div class="tiles" style="margin-bottom:16px">' + r.tiles.map(function (x) { return '<div class="tile" style="--c:' + (tone[x[0]] || "var(--brand)") + '"><div class="n">' + E(x[1]) + '</div><div class="l">' + E(x[2]) + "</div></div>"; }).join("") + "</div>";
    var rows = r.rows.length ? '<div class="panel pad"><h3>Статистика недели</h3><div class="kv" style="margin-top:10px">' + r.rows.map(function (x) { return "<span>" + E(x[0]) + "</span><span><b>" + E(fmtVal(x[1])) + "</b></span>"; }).join("") + "</div>"
      + r.notes.map(function (n) { return '<div class="note">' + E(n) + "</div>"; }).join("") + "</div>" : "";
    var people = r.people.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:16px">' + r.people.map(function (x) {
      return '<div class="panel pad"><div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">' + ava(x.name, "lg") + "<div><b>" + E(x.name) + '</b><br><small style="color:var(--muted)">в работе ' + x.in_work + " · просрочено " + x.overdue + "</small></div></div>"
        + '<div class="kv"><span>Отработано</span><span><b>' + x.worked + " из " + x.workdays + "</b> дней</span><span>Отдыхал</span><span>" + x.off + " дн.</span></div>"
        + '<div class="note" style="margin-top:12px">Комментарии по дням:</div>'
        + (x.comments.map(function (c) { return '<div class="ctt"><small>' + dmy(c.day).slice(0, 5) + "</small><div>" + E(c.text) + "</div></div>"; }).join("") || '<div class="note">Комментариев нет</div>') + "</div>";
    }).join("") + "</div>" : "";
    var qs = '<div class="panel pad rq"><h3>Вопросы недели</h3><p class="sub">Ответы попадают в отчёт и в канал «Руководители»</p>' + r.questions.map(function (q) { return '<div class="fld"><label>' + E(q.q) + '</label><textarea data-rq="' + q.id + '" placeholder="Ваш ответ…">' + E(q.a) + "</textarea></div>"; }).join("") + "</div>";
    return head + tiles + people + (rows ? '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">' + rows + qs + "</div>" : qs);
  }

  /* ---------- статистика руководителя ---------- */
  var MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  function shiftMonth(m, n) { var y = +m.slice(0, 4), mm = +m.slice(5, 7) - 1 + n; y += Math.floor(mm / 12); mm = ((mm % 12) + 12) % 12; return y + "-" + ("0" + (mm + 1)).slice(-2); }
  function loadStats() {
    if (!S.st) S.st = { month: isoDay(new Date()).slice(0, 7), data: null };
    return api("/stats?month=" + S.st.month).then(function (d) { S.st.data = d; S.err = ""; }, function (e) { S.st.data = null; S.err = String(e); });
  }
  function statsCsv(d) {
    var l = ["Проектировщик;Проектов;На сумму;Отработано дней;Рабочих дней;Отдыхал"];
    d.designers.forEach(function (x) { l.push([x.name, x.projects, x.sum, x.worked, x.workdays, x.off].join(";")); });
    l.push(["Итого", d.totals.projects, d.totals.sum, d.totals.worked, d.totals.workdays, d.totals.off].join(";"));
    l.push(""); l.push("КП выставлено;шт;" + d.kp.issued_n + ";сумма;" + d.kp.issued_sum); l.push("КП оплачено;шт;" + d.kp.paid_n + ";сумма;" + d.kp.paid_sum + ";процент;" + d.kp.pct);
    return l.join("\n");
  }
  function statsScreen() {
    var d = S.st && S.st.data;
    if (pos() !== "owner") return '<div class="head"><div><h1>Статистика</h1></div></div><div class="note">Этот раздел виден только руководителю.</div>';
    if (!d) return '<div class="head"><div><h1>Статистика</h1></div></div><div class="note">' + (S.err ? E(S.err) : "Нет данных") + "</div>";
    var y = d.month.slice(0, 4), mi = +d.month.slice(5, 7) - 1;
    var k = function (c, v, l) { return '<div class="tile" style="--c:' + c + '"><div class="n">' + v + '</div><div class="l">' + l + "</div></div>"; };
    var mx = Math.max.apply(null, d.chart.map(function (c) { return Math.max(c.issued, c.paid); }).concat([1]));
    return '<div class="head"><div><h1>Статистика</h1><p>Закрытый кабинет руководителя: суммы и оплата из 1С, дни из отметок проектировщиков</p></div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap"><div class="seg"><button data-stnav="-1">←</button><button class="on">' + MONTHS[mi] + " " + y + '</button><button data-stnav="1">→</button></div><button class="btn ghost" data-stcsv="1">' + ic("down") + "В Excel (CSV)</button></div></div>"
      + '<div class="rolebar" style="background:var(--warn-soft);color:var(--warn)">' + ic("lock") + "<span>Этот раздел виден только руководителю.</span></div>"
      + '<div class="tiles">' + k("var(--brand)", d.totals.projects, "Проектов сдано") + k("var(--ok)", money(d.totals.sum), "Сумма сданных проектов")
      + k("var(--org)", d.kp.issued_n, "КП выставлено · " + money(d.kp.issued_sum)) + k("var(--accent)", d.kp.pct + "%", d.kp.paid_n + " оплачено · " + money(d.kp.paid_sum)) + "</div>"
      + '<div class="dsg21" style="margin-top:16px"><div class="panel"><div style="padding:18px 22px 0"><h3>Проектировщики за месяц</h3><p class="sub">Руководитель проектного отдела тоже проектирует</p></div>'
      + '<table class="tbl"><tr><th>Проектировщик</th><th class="r">Проектов</th><th class="r">На сумму</th><th>Отработано дней</th><th class="r">Отдыхал</th></tr>'
      + d.designers.map(function (x) { var w = x.workdays || 1; return '<tr><td><span class="ava-t">' + ava(x.name, "sm") + "<b>" + E(x.name) + '</b></span></td><td class="r"><b>' + x.projects + '</b></td><td class="r"><b>' + money(x.sum) + '</b></td><td><div style="display:flex;gap:10px;align-items:center"><div class="meter" style="flex:1"><i style="width:' + Math.min(100, x.worked / w * 100) + '%;--c:var(--ok)"></i></div><b>' + x.worked + " из " + x.workdays + '</b></div></td><td class="r">' + x.off + " дн.</td></tr>"; }).join("")
      + '<tr style="background:var(--surface-2)"><td><b>Итого</b></td><td class="r"><b>' + d.totals.projects + '</b></td><td class="r"><b>' + money(d.totals.sum) + "</b></td><td>" + d.totals.worked + " из " + d.totals.workdays + '</td><td class="r">' + d.totals.off + " дн.</td></tr></table></div>"
      + '<div class="panel pad"><h3>КП: выставлено и оплачено</h3><p class="sub">Тысячи ₽ · синий — выставлено, зелёный — оплачено</p><div class="chart">'
      + d.chart.map(function (c) { return '<div class="g"><div class="bars"><i style="height:' + (c.issued / mx * 100) + '%" title="' + money(c.issued) + '"></i><i class="p" style="height:' + (c.paid / mx * 100) + '%" title="' + money(c.paid) + '"></i></div><small>' + MONTHS[+c.month.slice(5, 7) - 1].slice(0, 3) + "</small></div>"; }).join("") + "</div></div></div>";
  }
  /* ---------- действия ---------- */
  function act(p) {
    if (S.busy) return; S.busy = true;
    return p.then(function () { S.busy = false; S.orders = null; S.tasks = null; return load().then(function () { return S.open ? api("/orders/" + S.open + "/history").then(function (h) { S.history = h; }, function () { S.history = []; }) : null; }); })
      .then(function () {
        if (S.open && !find(S.open)) {              // задача ушла на стадию, которую роль не видит — это нормальная передача дальше
          S.open = null; S.tab = "info"; if (/^#\/task\//.test(location.hash)) history.replaceState(null, "", "#/");
          toast("Готово: задача передана дальше и теперь вам не видна");
        }
        paint();
      }, function (e) { S.busy = false; toast(String(e && e.message || e)); });
  }
  function closeAll() {
    S.form = null; S.edit = null; S.nt = null;
    var mr0 = document.getElementById("ds-modal"); if (mr0) mr0.innerHTML = "";
    if (S.open) { S.open = null; S.tab = "info"; if (/^#\/task\//.test(location.hash)) history.replaceState(null, "", "#/"); }
    paint();
  }

  document.addEventListener("click", function (e) {
    var inModal = !!e.target.closest("#ds-modal");
    if (!inModal && !(S.mount && S.mount.el && S.mount.el.contains(e.target))) return;
    var bg = e.target.getAttribute && e.target.getAttribute("data-bg");
    if (bg) { closeAll(); return; }
    var t = e.target.closest("[data-open],[data-close],[data-tab],[data-kb],[data-go],[data-urgent],[data-pay],[data-act],[data-new],[data-create],[data-tdone],[data-otype],[data-tile],[data-ostage],[data-ld],[data-edit],[data-saveplan],[data-csel],[data-cnew],[data-cadd],[data-cdel],[data-csave],[data-wmark],[data-woff],[data-wnav],[data-kpstatus],[data-kpcontract],[data-kptouch],[data-ksv],[data-ksave],[data-kcust],[data-kadd],[data-kdel],[data-ctmake],[data-ctsign],[data-ctpick],[data-rpkind],[data-rpnav],[data-rppub],[data-rpdl],[data-stnav],[data-stcsv],[data-pradd],[data-prdel],[data-prsave],[data-prreset],[data-doc],[data-compsave],[data-stsave],[data-aurun],[data-tstate],[data-flstep],[data-fltab],[data-tzset],[data-tzadd],[data-tzdel],[data-tzremind],[data-tzopen],[data-ldn],[data-chatopen],[data-mt],[data-kpdel],[data-kt],[data-kpadd],[data-pcadd],[data-pcreset],[data-ctsvdel],[data-ctsvnew],[data-ctparty],[data-pt],[data-ppsave],[data-ppreset],[data-ccadd],[data-ccdel],[data-cckp],[data-ccreset],[data-ntopen],[data-ntsave],[data-lead],[data-cmtoggle],[data-cmsend]");
    if (!t) return;
    var d = t.dataset;
    if (d.close) return closeAll();
    if (d.ntopen != null && t.hasAttribute("data-ntopen")) return ntOpen({});
    if (d.ntsave != null && t.hasAttribute("data-ntsave")) return ntSave();
    if (d.lead) {
      var lp = d.lead.split(":");
      return api("/tasks/" + lp[0] + "/lead", { action: lp[1] }).then(function (r) {
        toast(lp[1] === "skip" ? "Задача закрыта: не требуется" : "Передано дальше: " + r.next); S.tasks = null; return load().then(paint);
      }, function (e) { toast(String(e)); });
    }
    if (d.cmtoggle) { var oi = +d.cmtoggle; S.cmOpen = S.cmOpen || {}; S.cmOpen[oi] = !S.cmOpen[oi]; return paint(); }
    if (d.cmsend) {
      var coid = +d.cmsend, txt = ((S.cmDraft || {})[coid] || "").trim();
      if (!txt) return toast("Напишите комментарий");
      return api("/orders/" + coid + "/comments", { text: txt }).then(function () { S.cmDraft[coid] = ""; return api("/comments"); }).then(function (c) { S.cm = c; S.cmOpen[coid] = true; paint(); }, function (e) { toast(String(e)); });
    }
    if (d.open) {
      S.open = +d.open; S.tab = "info"; S.edit = null;
      return api("/orders/" + S.open + "/history").then(function (h) { S.history = h; }, function () { S.history = []; }).then(paint);
    }
    if (d.csel) { var cc = (S.customers || []).filter(function (c) { return c.id === +d.csel; })[0]; if (cc) { S.cu.sel = cc.id; S.cu.draft = JSON.parse(JSON.stringify(cc)); S.cu.err = ""; } paint(); if (innerWidth < 900) { var cardEl = document.querySelector("#clients-app .dsg21 > div:last-child"); if (cardEl) cardEl.scrollIntoView({ behavior: "smooth", block: "start" }); } return; }
    if (d.cnew != null && t.hasAttribute("data-cnew")) { S.cu.sel = 0; S.cu.draft = { id: 0, name: "", regular: 0, tz: "Europe/Moscow", comment: "", contacts: [{ fio: "", pos: "", phone: "" }] }; S.cu.err = ""; return paint(); }
    if (d.cadd != null && t.hasAttribute("data-cadd")) { S.cu.draft.contacts.push({ fio: "", pos: "", phone: "" }); return paint(); }
    if (d.cdel != null && t.hasAttribute("data-cdel")) { S.cu.draft.contacts.splice(+d.cdel, 1); return paint(); }
    if (d.csave != null && t.hasAttribute("data-csave")) return saveCustomer();
    if (d.wmark) { var wd = dayRec(d.wmark); return act2(api("/week/day", { day: d.wmark, worked: !wd.worked }), true); }
    if (d.woff) { var wf = dayRec(d.woff); return act2(api("/week/day", { day: d.woff, off: !wf.off }), true); }
    if (d.wnav != null && t.hasAttribute("data-wnav")) { S.wk.start = isoDay(addDays(S.wk.start === "" ? monday() : new Date(S.wk.start + "T00:00:00"), d.wnav === "0" ? 0 : (+d.wnav) * 7)); if (d.wnav === "0") S.wk.start = isoDay(monday()); return loadWeek().then(paint); }
    if (d.kpcontract) { S.ct = { kid: +d.kpcontract }; S.cmode = "kp"; if (location.hash === "#/contracts") return DS.reload(); location.hash = "#/contracts"; return; }
    if (d.cmode) { S.cmode = d.cmode; if (d.cmode === "kp") { var cEl = S.mount && S.mount.el; if (cEl) cEl.innerHTML = ""; } return paint(); }
    if (d.kpstatus != null && t.hasAttribute("data-kpstatus")) return;
    if (d.kptouch) return act2(api("/kp/" + d.kptouch + "/touch", {}).then(loadKp), false);
    if (d.ksv != null && t.hasAttribute("data-ksv")) { var it = S.kpf.items[+d.ksv]; it.on = !it.on; return paint(); }
    if (d.kadd != null && t.hasAttribute("data-kadd")) { S.kpf.items.push({ name: "", price: 0, on: true, custom: true }); return paint(); }
    if (d.kdel != null && t.hasAttribute("data-kdel")) { S.kpf.items.splice(+d.kdel, 1); return paint(); }
    if (d.ksave != null && t.hasAttribute("data-ksave")) return saveKp(d.ksave === "send");
    if (d.ctmake != null && t.hasAttribute("data-ctmake")) return makeContract();
    if (d.ctstandalone != null && t.hasAttribute("data-ctstandalone")) { S.cmode = "kp"; return newStandalone(); }
    if (d.ctsign != null && t.hasAttribute("data-ctsign")) return signContract();
    if (d.tstate) { var ts = d.tstate.split(":"); return act2(api("/tasks/" + ts[0] + "/state", { state: ts[1] }).then(function () { S.tasks = null; return load(); }), false); }
    if (d.flstep) { S.flStep = S.flStep === d.flstep ? null : d.flstep; return paint(); }
    if (d.fltab) { S.flTab = d.fltab; if (d.fltab === "path" && !S.flOrder && (S.orders || []).length) S.flOrder = S.orders[0].id; return loadPath().then(paint); }
    if (d.tzset != null && t.hasAttribute("data-tzset")) { var tp = d.tzset.split(":"); return tzCall("/orders/" + S.open + "/tz", { idx: +tp[0], done: tp[1] === "1" }); }
    if (d.tzadd != null && t.hasAttribute("data-tzadd")) { var ti = document.getElementById("tzNew"); var tt = ti ? ti.value.trim() : ""; if (!tt) return toast("Введите название пункта"); return tzCall("/orders/" + S.open + "/tz/add", { title: tt }); }
    if (d.tzdel != null && t.hasAttribute("data-tzdel")) return tzCall("/orders/" + S.open + "/tz/delete", { idx: +d.tzdel });
    if (d.tzremind) return act2(api("/orders/" + d.tzremind + "/tz/remind", {}).then(function () { toast("Напоминание отправлено операционному менеджеру"); }), false);
    if (d.tzopen) { S.open = +d.tzopen; S.tab = "tz"; S.edit = null; return Promise.all([api("/orders/" + S.open + "/history").then(function (h) { S.history = h; }, function () { S.history = []; }), loadTzItem(S.open)]).then(paint); }
    if (d.stsave != null && t.hasAttribute("data-stsave")) return saveStages();
    if (d.aurun != null && t.hasAttribute("data-aurun")) return act2(api("/auto/run", {}).then(function (r) { var n = Object.keys(r.fired).reduce(function (a, k) { return a + r.fired[k]; }, 0); toast(n ? "Сработало правил: " + n : "Сейчас ничего не требует внимания"); return loadAuto(); }), false);
    if (d.doc) { var dd = d.doc.split(":"); return downloadDoc(+dd[0], dd[1], dd[2]); }
    if (d.compsave != null && t.hasAttribute("data-compsave")) return saveCompany();
    if (d.ctsvdel != null && t.hasAttribute("data-ctsvdel")) { S.ct.data.services.splice(+d.ctsvdel, 1); return paint(); }
    if (d.ctsvnew != null && t.hasAttribute("data-ctsvnew")) { S.ct.data.services.push({ name: "", unit: "услуга", qty: 1, unit_price: 0 }); return paint(); }
    if (d.ctparty != null && t.hasAttribute("data-ctparty")) { var cu0 = S.ct.data.customer; cu0.party_custom = false; cu0.party_text = ctParty(cu0); return paint(); }
    if (d.pt) { S.pt = d.pt; return paint(); }
    if (d.ppreset != null && t.hasAttribute("data-ppreset")) { S.pp = null; S.ppErr = ""; return paint(); }
    if (d.ppsave != null && t.hasAttribute("data-ppsave")) return savePrint();
    if (d.kt) { S.kt = d.kt; return paint(); }
    if (d.mt) { S.mt = d.mt; return paint(); }
    if (d.chatopen) { location.hash = "#/chat?t=" + encodeURIComponent(d.chatopen); return; }
    if (d.kpdel) { var kpr = (S.kp || []).filter(function (x) { return x.id === +d.kpdel; })[0]; if (!confirm("Удалить КП " + (kpr ? kpr.number + " · " + kpr.customer : "") + " из реестра? Это нельзя отменить.")) return; return act2(api("/kp/" + d.kpdel + "/delete", {}).then(loadKp), false); }
    if (d.kpadd != null && t.hasAttribute("data-kpadd")) { var pit = S.price.items.filter(function (i) { return i.active; })[+d.kpadd]; if (pit) { kpAddLine(pit.name, pit.price); return paint(); } return; }
    if (d.pcadd != null && t.hasAttribute("data-pcadd")) return pcAddToKp();
    if (d.pcreset != null && t.hasAttribute("data-pcreset")) { S.pc = null; return paint(); }
    if (d.cckp != null && t.hasAttribute("data-cckp")) return calcToKp();
    if (d.ccreset != null && t.hasAttribute("data-ccreset")) { S.calc = null; return paint(); }
    if (d.pradd != null && t.hasAttribute("data-pradd")) { S.pd.push({ name: "", price: 0, note: "", active: true }); return paint(); }
    if (d.prdel != null && t.hasAttribute("data-prdel")) { S.pd.splice(+d.prdel, 1); return paint(); }
    if (d.prreset != null && t.hasAttribute("data-prreset")) { S.pd = JSON.parse(JSON.stringify(S.price.items)); S.pdErr = ""; return paint(); }
    if (d.prsave != null && t.hasAttribute("data-prsave")) return savePrice();
    if (d.rpkind) { S.rp.kind = d.rpkind; return loadReport().then(paint); }
    if (d.rpnav != null && t.hasAttribute("data-rpnav")) { S.rp.start = isoDay(addDays(new Date(S.rp.start + "T00:00:00"), d.rpnav === "0" ? 0 : (+d.rpnav) * 7)); if (d.rpnav === "0") S.rp.start = isoDay(monday()); return loadReport().then(paint); }
    if (d.rppub != null && t.hasAttribute("data-rppub")) return act2(api("/reports/" + S.rp.kind + "/publish?start=" + S.rp.start, {}).then(function () { toast("Отчёт отправлен в канал «Руководители»"); }), false);
    if (d.rpdl != null && t.hasAttribute("data-rpdl")) return downloadText("otchet-" + S.rp.kind + "-" + S.rp.start + ".txt", reportText(S.rp.data));
    if (d.stnav != null && t.hasAttribute("data-stnav")) { S.st.month = shiftMonth(S.st.month, +d.stnav); return loadStats().then(paint); }
    if (d.stcsv != null && t.hasAttribute("data-stcsv")) return downloadText("statistika-" + S.st.month + ".csv", statsCsv(S.st.data), "text/csv");
    if (d.otype) { S.ov.otype = d.otype; S.ov.type = d.otype; S.ov.tile = ""; return paint(); }
    if (d.tile) { S.ov.tile = S.ov.tile === d.tile ? "" : d.tile; return paint(); }
    if (d.ostage != null && t.hasAttribute("data-ostage")) { S.ov.stage = d.ostage; return paint(); }
    if (d.ld) { S.ld = d.ld; return paint(); }
    if (d.ldn != null && t.hasAttribute("data-ldn")) {
      if (d.ldn === "0") { S.ldo = 0; return paint(); }
      S.ldo = Math.max(0, (S.ldo | 0) + 30 * (+d.ldn)); return paint();
    }
    if (d.edit) { if (!(pos() === "owner" || pos() === "design")) return toast("Исполнителя и сроки назначает руководитель проектного отдела"); S.edit = +d.edit; S.open = null; return paint(); }
    if (d.saveplan) {
      var w = +document.getElementById("pl-who").value, s = document.getElementById("pl-s").value, en = document.getElementById("pl-e").value;
      var id2 = S.edit; S.edit = null;
      return act(api("/orders/" + id2 + "/plan", { executor_id: w, start: s, end: en }));
    }
    if (d.tab) { S.tab = d.tab; if (d.tab === "tz") return loadTzItem(S.open).then(paint); return paint(); }
    if (d.kb) { S.kb = d.kb; return paint(); }
    if (d.new) { S.form = { number: "", customer: "", object: "", due: "", amount: "", adv: false, advSum: "", err: "" }; return paint(); }
    if (d.tdone) return act(api("/tasks/" + d.tdone + "/done", {}));
    if (d.create) return createOrder();
    var o = find(S.open); if (!o) return;
    if (d.go) {
      if (d.needexec) {
        var ex = document.getElementById("dsExec"), id = ex ? +ex.value : 0;
        if (!id && !o.executor_id) return toast("Сначала выберите исполнителя");
        var chain = (id && id !== o.executor_id) ? api("/orders/" + o.id + "/assign", { executor_id: id }) : Promise.resolve();
        return act(chain.then(function () { return api("/orders/" + o.id + "/stage", { stage: d.go }); }));
      }
      return act(api("/orders/" + o.id + "/stage", { stage: d.go }));
    }
    if (d.urgent != null && d.urgent !== "") return act(api("/orders/" + o.id + "/urgent", { urgent: d.urgent === "1" }));
    if (d.pay) return act(api("/orders/" + o.id + "/payment", { kind: d.pay }));
    if (d.act) { var b = {}; b[d.act] = true; return act(api("/orders/" + o.id + "/act", b)); }
  });
  document.addEventListener("input", function (e) {
    if (e.target.dataset && e.target.dataset.nt && S.nt && e.target.tagName !== "SELECT") { ntField(e.target); return; }
    if (e.target.dataset && e.target.dataset.cmd != null) { (S.cmDraft = S.cmDraft || {})[e.target.dataset.cmd] = e.target.value; return; }
    if (e.target.id === "dsQ") { S.ov.q = e.target.value; return paint(); }
    var sd = e.target.dataset && e.target.dataset.sd;
    if (sd && S.stgD) { var sp_ = sd.split("."); if (S.stgD[sp_[0]]) S.stgD[sp_[0]][sp_[1]] = e.target.value; return; }
    var cmp = e.target.dataset && e.target.dataset.cmp;
    if (cmp && S.comp) { S.comp[cmp] = e.target.value; return; }
    var ppf = e.target.dataset && e.target.dataset.ppf;
    if (ppf && S.pp) {
      if (ppf === "discount") S.pp.discount = +e.target.value || 0;
      else { var q1 = ppf.split("."); S.pp.tiers[+q1[1]][q1[2]] = q1[2] === "price" ? (+e.target.value || 0) : e.target.value; }
      var tt0 = document.getElementById("pcTotal"); if (tt0) tt0.innerHTML = pcTotalHtml();
      return;
    }
    var ccv = e.target.dataset && e.target.dataset.cc;
    if (ccv === "copies" && S.calc) { S.calc.copies = Math.max(1, Math.round(+e.target.value || 1)); var rs2 = document.getElementById("calcRes"); if (rs2) rs2.innerHTML = calcResHtml(); return; }
    if (ccv === "area" && S.calc) { S.calc.area = e.target.value; var rs = document.getElementById("calcRes"); if (rs) rs.innerHTML = calcResHtml(); return; }
    var pcn = e.target.dataset && e.target.dataset.pcn;
    if (pcn != null && S.price) {
      pcState().copies = Math.max(1, Math.round(+e.target.value || 1));
      var tt_ = document.getElementById("pcTotal"); if (tt_) tt_.innerHTML = pcTotalHtml();
      return;
    }
    var prf = e.target.dataset && e.target.dataset.prf;
    if (prf && S.pd) { var pp = prf.split("."); var row = S.pd[+pp[0]]; row[pp[1]] = pp[1] === "price" ? (+e.target.value || 0) : e.target.value; return; }
    var kf = e.target.dataset && e.target.dataset.kf;
    if (e.target.dataset && e.target.dataset.rq != null && S.rp) { S.rp.data.questions[+e.target.dataset.rq].a = e.target.value; return; }
    if (kf && S.kpf) {
      var kp_ = kf.split(".");
      if (kp_[0] === "i") S.kpf.items[+kp_[1]][kp_[2]] = kp_[2] === "price" ? (+e.target.value || 0) : e.target.value; else S.kpf[kp_[0]] = e.target.value;
      if (kp_[0] === "i" && kp_[2] === "price") { var tt = document.getElementById("kTotal"); if (tt) tt.textContent = money(kpTotal()); }
      return;
    }
    var ctp = e.target.dataset && e.target.dataset.ctp;
    if (ctp && S.ct && S.ct.data && e.target.type !== "checkbox" && e.target.tagName !== "SELECT") {
      var cv = e.target.value;
      if (e.target.type === "number" && cv !== "") cv = +cv;
      ctSetPath(ctp, cv);
      var cu1 = S.ct.data.customer;
      if (ctp === "customer.party_text") cu1.party_custom = true;
      else if (/^customer\.(name_full|name_short|position_gen|fio_gen|basis|ogrn)$/.test(ctp) && !cu1.party_custom) {
        cu1.party_text = ctParty(cu1);
        var ta = document.querySelector("[data-ctp=\"customer.party_text\"]"); if (ta) ta.value = cu1.party_text;
      }
      ctRefresh();
      return;
    }
    var cf = e.target.dataset && e.target.dataset.cf;
    if (cf && S.cu.draft) {
      var parts = cf.split(".");
      if (parts[0] === "c") S.cu.draft.contacts[+parts[1]][parts[2]] = e.target.value; else S.cu.draft[parts[0]] = e.target.value;
      return;
    }
    if (!S.form || !e.target.id) return;
    var f = S.form, map = { nfNum: "number", nfCust: "customer", nfObj: "object", nfDue: "due", nfSum: "amount", nfAdvSum: "advSum" };
    if (map[e.target.id]) f[map[e.target.id]] = e.target.value;
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "nfAdv" && S.form) { S.form.adv = e.target.checked; paint(); }
    var cdt = e.target.dataset || {};
    if (cdt.cc && S.calc && cdt.cc !== "area") { var cs_ = calcState(); cs_[cdt.cc] = cdt.cc === "stairs" ? +e.target.value : e.target.value; if (cdt.cc === "sys") cs_.pump = false; paint(); }
    if (cdt.ccb && S.calc) { S.calc[cdt.ccb] = e.target.checked; paint(); }
    if (cdt.ccs && S.calc) {
      var ss = calcState().syss || (calcState().syss = []), ix = ss.indexOf(cdt.ccs);
      if (e.target.checked && ix < 0) ss.push(cdt.ccs); else if (!e.target.checked && ix >= 0) ss.splice(ix, 1);
      paint();
    }
    if (cdt.nt && S.nt) { ntField(e.target); if (cdt.nt === "step") { var rr = document.getElementById("ds-modal"); if (rr) rr.innerHTML = ntHtml(); } }
    if (cdt.cmd != null && S.cmDraft) S.cmDraft[cdt.cmd] = e.target.value;
    if (cdt.ctforce != null && S.ct) { S.ct.force = e.target.checked; ctRefresh(); return; }
    if (cdt.pct != null && S.price) { pcState().tier = +cdt.pct; paint(); }
    if (e.target.dataset && (e.target.dataset.kf === "customer_id" || e.target.dataset.kf === "pay") && S.kpf) { S.kpf[e.target.dataset.kf] = e.target.dataset.kf === "pay" ? e.target.value : +e.target.value; paint(); }
    if (e.target.dataset && e.target.dataset.ctpick != null && S.ct) { S.ct = { kid: +e.target.value }; loadContractDraft().then(paint); }
    var ctsa = e.target.dataset && e.target.dataset.ctsvadd;
    if (ctsa != null && S.ct && e.target.value !== "") {
      var pr_ = (S.price && S.price.items ? S.price.items.filter(function (i) { return i.active; }) : [])[+e.target.value];
      if (pr_) { S.ct.data.services.push({ name: pr_.name, unit: "услуга", qty: 1, unit_price: pr_.price }); paint(); }
    }
    var ctq = e.target.dataset && e.target.dataset.ctp;
    if (ctq && S.ct && S.ct.data && (e.target.type === "checkbox" || e.target.tagName === "SELECT")) {
      if (ctq === "__upd") { S.ct.upd = e.target.checked; return; }
      ctSetPath(ctq, e.target.type === "checkbox" ? e.target.checked : e.target.value);
      var cu2 = S.ct.data.customer;
      if (ctq === "customer.type") { if (cu2.type === "ip") { cu2.basis = cu2.basis === "Устава" ? "листа записи из ЕГРИП" : cu2.basis; cu2.position_sign = "Индивидуальный предприниматель"; } else if (cu2.type === "org") { cu2.basis = cu2.basis === "листа записи из ЕГРИП" ? "Устава" : cu2.basis; cu2.position_sign = "Генеральный директор"; } if (!cu2.party_custom) cu2.party_text = ctParty(cu2); }
      paint();
    }
    if (e.target.dataset && e.target.dataset.kpstatus && S.kp) { var kid_ = +e.target.dataset.kpstatus; act2(api("/kp/" + kid_ + "/status", { status: e.target.value }).then(loadKp), false); }
    if (e.target.dataset && e.target.dataset.cfchk != null && S.cu.draft) { S.cu.draft.regular = e.target.checked ? 1 : 0; }
    if (e.target.dataset && e.target.dataset.cftz != null && S.cu.draft) { S.cu.draft.tz = e.target.value; paint(); }
    if (e.target.id === "flOrder") { S.flOrder = +e.target.value; loadPath().then(paint); }
    if (e.target.dataset && e.target.dataset.aur && S.au) {
      var rid = e.target.dataset.aur, box = document.querySelector('[data-auv="' + rid + '"]'), en = document.querySelector('[data-aue="' + rid + '"]');
      api("/auto", { rule: rid, enabled: en.checked, value: +box.value || 0 }).then(function (r) { S.au.rules = r.rules.map(function (x) { var o = S.au.rules.filter(function (y) { return y.id === x.id; })[0]; return Object.assign({}, x, { fired: o ? o.fired : 0 }); }); toast("Правило сохранено"); paint(); }, function (er) { toast(String(er)); });
    }
    if (e.target.dataset && e.target.dataset.prfa != null && S.pd) { S.pd[+e.target.dataset.prfa].active = e.target.checked; }
    if (e.target.dataset && e.target.dataset.rq != null && S.rp) {
      api("/reports/" + S.rp.kind + "/answer", { start: S.rp.start, qid: +e.target.dataset.rq, text: e.target.value }).catch(function (er) { toast(String(er)); });
    }
    if (e.target.dataset && e.target.dataset.wc && S.wk) {
      var dr = dayRec(e.target.dataset.wc); dr.comment = e.target.value;
      api("/week/day", { day: e.target.dataset.wc, comment: e.target.value }).catch(function (er) { toast(String(er)); });
    }
  });
  function createOrder() {
    var f = S.form;
    if (!f.number.trim() || !f.customer.trim() || !f.object.trim()) { f.err = "Заполните номер, заказчика и объект"; return paint(); }
    api("/customers", { name: f.customer.trim() }).then(function (c) {
      return api("/orders", { number: f.number.trim(), customer_id: c.id, object: f.object.trim(), due_date: f.due || "", amount: +f.amount || 0,
        adv_mode: f.adv ? "advance" : "none", adv_sum: f.adv ? (+f.advSum || 0) : 0, contract_date: new Date().toISOString().slice(0, 10) });
    }).then(function () { S.form = null; S.customers = null; S.orders = null; DS.route(); }, function (er) { f.err = String(er); paint(); });
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && (S.open || S.form) && document.getElementById("ds-modal")) closeAll(); });
  if (C) { C.on("logout", function () { S.orders = S.meta = S.customers = S.people = S.tasks = null; S.open = null; var m = document.getElementById("ds-modal"); if (m) m.innerHTML = ""; }); }
})();
if (location.hash === '' || location.hash === '#/' || /^#\/task\//.test(location.hash)) { setTimeout(function () { if (document.getElementById('tasks-app') && document.getElementById('tasks-app').style.display !== 'none') DS.route(); }, 0); }
(function () { var h = location.hash; var map = { '#/dash': ['ov', 'dash-app'], '#/cal': ['load', 'cal-app'] }; if (map[h]) setTimeout(function () { DS.mount(map[h][0], document.getElementById(map[h][1])); }, 0); })();
if (window.MPBC && typeof window.globalRouter === "function") {
  ["login", "logout", "ready"].forEach(function (ev) {
    window.MPBC.on(ev, function () { if (ev === "ready") window.DS_READY = true; window.globalRouter(); });
  });
}
(function () { var h = location.hash; var map = { '#/clients': ['cust', 'clients-app'], '#/my': ['week', 'my-app'] }; if (map[h]) setTimeout(function () { var p = window.dsPosition ? dsPosition() : ''; if (h === '#/my' && p !== 'designer' && p !== 'design') return; DS.mount(map[h][0], document.getElementById(map[h][1])); }, 0); })();
DS.ownsMy = function () { var p = pos2(); return p === 'designer' || p === 'design'; }; function pos2() { return (window.MPBC && MPBC.me && (MPBC.me.position || (MPBC.me.role === 'admin' ? 'owner' : ''))) || ''; }
(function () { var h = location.hash; var map = { '#/kpc': ['kpc', 'kpc-app'], '#/contracts': ['contract', 'contracts-app'] }; var k = map[h] || (/^#\/kpreg/.test(h) ? ['kp', 'kpreg-app'] : null); if (k) setTimeout(function () { DS.mount(k[0], document.getElementById(k[1])); }, 0); })();
(function () { var h = location.hash; var map = { '#/report': ['report', 'report-app'], '#/stats': ['stats', 'stats-app'] }; if (map[h]) setTimeout(function () { DS.mount(map[h][0], document.getElementById(map[h][1])); }, 0); })();
(function () { if (location.hash === '#/price') setTimeout(function () { DS.mount('price', document.getElementById('price-app')); }, 0); })();
