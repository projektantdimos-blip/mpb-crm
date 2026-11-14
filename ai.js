/* МПБ CRM v2 — «ИИ-менеджер», этап 1: окно «Поручить» и поручения (мост: bridge/app/crm_orders.py).
   Одна фраза (пишут или диктуют микрофоном клавиатуры): поручить сотруднику, напомнить себе, спросить «что по задаче»,
   перевести задачу на этап, добавить комментарий. ИИ разбирает — человек проверяет и подтверждает.
   Этап и комментарий сохраняются обычным api_saveTask: журнал, отмена и автоматизации — как при ручной правке. */
(function () {
  "use strict";
  var C = window.MPBC, T = window.MPBT;
  if (!C || !T || !T.util) return;
  var U = T.util, E = U.E, ic = U.ic;
  var TASK_KEYS = ["customer", "address", "contractNo", "workType", "startDate", "dueDate", "stage", "deadline", "siteContact", "siteContactPhone", "comment", "closed", "manager"];
  var S = { data: null, people: null, tasks: null, tasksTs: 0, ctx: 0, busy: false, P: null, A: null, counts: null };
  var EX = [
    ["Поручить", "Скажи Игорю, чтобы сделал закрывающие по Северу до пятницы"],
    ["Напомнить себе", "Напомни мне позвонить заказчику завтра в 10:00"],
    ["Спросить", "Что по задаче …?"],
    ["Этап", "Поставь … на закупку оборудования"],
    ["Комментарий", "Добавь по …, что оборудование закупили, лежит на складе"]
  ];
  function $(id) { return document.getElementById(id); }
  function p2(n) { return ("0" + n).slice(-2); }
  function iso(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function plusDays(n) { var d = new Date(); d.setDate(d.getDate() + (n || 0)); return iso(d); }
  function ddmm(due, tm) { return due ? due.slice(8, 10) + "." + due.slice(5, 7) + (tm ? " " + tm : "") : ""; }
  function hm(ts) { if (!ts) return ""; var d = new Date(ts * 1000), n = new Date(); return d.toDateString() === n.toDateString() ? p2(d.getHours()) + ":" + p2(d.getMinutes()) : p2(d.getDate()) + "." + p2(d.getMonth() + 1); }
  function pick(o, keys) { var r = {}; keys.forEach(function (k) { if (o && o[k] !== undefined) r[k] = o[k]; }); return r; }
  function low1(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function cut(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function label(t) { return [t.customer, t.address].filter(Boolean).join(" · ") || ("Задача №" + t.row); }
  function isMe(id) { return C.me && id === C.me.id; }
  var DAT = function (n) { n = String(n || ""); var f = n.split(" ")[0]; if (/й$/.test(f)) return f.slice(0, -1) + "ю" + n.slice(f.length); if (/ь$/.test(f)) return f.slice(0, -1) + "ю" + n.slice(f.length); if (/а$/.test(f)) return f.slice(0, -1) + "е" + n.slice(f.length); if (/я$/.test(f)) return f.slice(0, -1) + "е" + n.slice(f.length); if (/[бвгджзклмнпрстфхцчшщ]$/.test(f)) return f + "у" + n.slice(f.length); return n; };

  function people() { return S.people ? Promise.resolve(S.people) : C.call("/people").then(function (l) { S.people = l; return l; }); }
  function tasks() {
    if (C.isEngineer() || typeof window.callServer !== "function") return Promise.resolve([]);
    if (S.tasks && Date.now() - S.tasksTs < 120000) return Promise.resolve(S.tasks);
    return callServer("api_listTasks").then(function (ts) { S.tasks = (ts || []).filter(function (t) { return !t.closed; }); S.tasksTs = Date.now(); return S.tasks; })
      .catch(function () { return S.tasks || []; });
  }
  function taskByRow(row) { return (S.tasks || []).filter(function (t) { return +t.row === +row; })[0] || null; }
  function stagesOf(wt) { return (typeof window.stagesFor === "function" ? window.stagesFor(wt) : []).map(function (s) { return { name: s.name, days: s.days || 0, who: s.who || "" }; }); }

  /* ================================================================ раздел «ИИ-менеджер»: поручения */
  function render() {
    var el = $("ai-app"), sub = "Поручения сотрудникам и себе — напомню исполнителю и прослежу, чтобы вы не забыли проверить";
    if (!U.gate(el, "ИИ-менеджер", sub, render)) return;
    el.innerHTML = U.head("ИИ-менеджер", sub, '<button class="x-btn primary" data-qt>' + ic("plus") + "Поручить</button>")
      + '<div class="wrap" id="aiBody"><div class="x-panel"><div class="x-empty">Загрузка…</div></div></div>';
    load();
  }
  function load() {
    return C.call("/orders").then(function (d) { S.data = d; badge(d.counts); paint(); })
      .catch(function (e) { var b = $("aiBody"); if (b) b.innerHTML = '<div class="x-panel"><div class="x-empty">' + E(e) + "</div></div>"; });
  }
  function steps(o) {
    var st = o.status, k = st === "sent" ? 0 : st === "done" || st === "accepted" ? 2 : 1;
    var L = [["Отправлено", o.ts], ["Прочитано", o.read_ts], ["Выполнено", o.done_ts]];
    return '<div class="ai-st">' + L.map(function (x, i) { return '<span class="' + (i < k ? "ok" : i === k ? "cur" : "") + '">' + x[0] + (i <= k && x[1] ? " · " + hm(x[1]) : "") + "</span>"; }).join("")
      + (st === "work" && o.note && /^Вернул/.test(o.note) ? '<span class="back">возвращено</span>' : "") + "</div>";
  }
  function meta(o) {
    return [o.task_row ? '<a href="#/task/' + o.task_row + '">' + E(cut(o.task_label || "Задача №" + o.task_row, 60)) + "</a>" : "", o.due ? "срок " + ddmm(o.due, o.tm) : "без срока"].filter(Boolean).join(" · ");
  }
  function byMeHtml(o) {
    var acts = o.status === "done"
      ? '<button class="x-btn primary" data-oa="accept" data-id="' + o.id + '">Принять</button><button class="x-btn ghost" data-oa="return" data-id="' + o.id + '">Вернуть</button>'
      : '<button class="x-btn ' + (o.over ? "primary" : "ghost") + '" data-oa="ping" data-id="' + o.id + '">Напомнить</button><button class="x-btn ghost" data-oa="cancel" data-id="' + o.id + '">Отменить</button>';
    return '<div class="ai-dt' + (o.status === "done" ? " chk" : "") + (o.over ? " over" : "") + '">' + U.ava(o.to_name)
      + '<div class="t"><b>' + E(DAT(o.to_name)) + " · " + E(o.what) + "</b><small>" + meta(o) + (o.over ? ' · <em class="bad">просрочено, не отметил</em>' : "") + "</small>" + steps(o)
      + (o.note ? '<div class="ai-note">«' + E(o.note) + "»</div>" : "") + "</div>"
      + '<div class="ai-dact">' + acts + "</div></div>";
  }
  function mineHtml(o) {
    var self = o.from_id === o.to_id, wait = o.status === "done";
    return '<div class="ai-dt' + (wait ? " wait" : "") + (o.over ? " over" : "") + '">' + (self ? '<span class="x-ava ai-me">Я</span>' : U.ava(o.from_name))
      + '<div class="t"><b>' + E(o.what) + "</b><small>" + (self ? "себе" : "от " + E(o.from_name)) + " · " + meta(o) + (o.over ? ' · <em class="bad">срок прошёл</em>' : "") + "</small>"
      + (o.note && !wait ? '<div class="ai-note">«' + E(o.note) + "»</div>" : "")
      + (wait ? '<div class="ai-note">Отмечено «Выполнено» — ждёт проверки: ' + E(o.from_name) + "</div>" : "") + "</div>"
      + '<div class="ai-dact">' + (wait ? "" : '<button class="x-btn primary" data-oa="done" data-id="' + o.id + '">Выполнено</button>') + "</div></div>";
  }
  function paint() {
    var d = S.data, b = $("aiBody"); if (!d || !b) return;
    var check = d.by_me.filter(function (o) { return o.status === "done"; }).length;
    b.innerHTML = '<div class="ai-grid2">'
      + '<div class="x-panel pad"><div class="ai-ph"><h3>Я поручил — жду · ' + d.by_me.length + "</h3>" + (check ? '<span class="x-pill ok">на проверку: ' + check + "</span>" : "") + "</div>"
      + '<p class="x-sub">Слежу за сроком и напоминаю исполнителю. Отметит «Выполнено» — подтвердите здесь</p>'
      + (d.by_me.length ? d.by_me.map(byMeHtml).join("") : '<div class="x-empty">Никому ничего не поручено — нажмите «Поручить»</div>')
      + (d.accepted.length ? '<details class="ai-det"><summary>Принято за неделю · ' + d.accepted.length + "</summary>" + d.accepted.map(function (o) { return '<div class="ai-dt done">' + U.ava(o.to_name) + '<div class="t"><b>' + E(DAT(o.to_name)) + " · " + E(o.what) + "</b><small>принято " + hm(o.acc_ts) + "</small></div></div>"; }).join("") + "</details>" : "")
      + "</div>"
      + '<div class="x-panel pad"><h3>Мне поручили · ' + d.mine.filter(function (o) { return o.status !== "done"; }).length + "</h3>"
      + '<p class="x-sub">Поручения коллег и свои напоминания — они же в «Моих задачах»</p>'
      + (d.mine.length ? d.mine.map(mineHtml).join("") : '<div class="x-empty">Поручений нет</div>')
      + "</div></div>";
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("#ai-app [data-oa]"); if (!b) return;
    var id = +b.dataset.id, a = b.dataset.oa;
    if (a === "done" || a === "return") { noteModal(id, a); return; }
    if (a === "cancel" && !confirm("Отменить поручение?")) return;
    act(id, a, "");
  });
  function act(id, a, note) {
    return C.call("/orders/" + id + "/" + a, { body: { note: note || "" } }).then(function () {
      U.toast({ accept: "Принято — поручение закрыто", ping: "Напомнил исполнителю", cancel: "Поручение отменено", done: "Отмечено — поручивший получит уведомление", "return": "Вернул на доработку" }[a] || "Готово");
      C.fast && C.fast(); load();
    }).catch(function (e) { U.toast(String(e)); });
  }
  function noteModal(id, a) {
    var done = a === "done";
    U.xmodal('<h3>' + (done ? "Выполнено" : "Вернуть на доработку") + '</h3><p class="x-sub">' + (done ? "Коротко, что сделано — увидит тот, кто поручил (можно пусто)" : "Что доделать — исполнитель получит уведомление") + "</p>"
      + '<div class="x-field"><textarea id="aiNote" rows="3" placeholder="' + (done ? "Акты отправил, скан в карточке" : "Нет акта за сентябрь") + '"></textarea></div>'
      + '<div class="x-row"><button class="x-btn ghost" id="aiNoteNo">Отмена</button><button class="x-btn primary" id="aiNoteOk">' + (done ? "Отметить выполненным" : "Вернуть") + "</button></div>");
    var t = $("aiNote"); if (t) t.focus();
    $("aiNoteNo").onclick = T.closeModal;
    $("aiNoteOk").onclick = function () { var v = $("aiNote").value.trim(); if (!done && !v) { $("aiNote").focus(); return; } T.closeModal(); act(id, a, v); };
  }

  /* ================================================================ счётчик в меню */
  function badge(cn) {
    if (cn) S.counts = cn;
    var n = S.counts ? (S.counts.mine || 0) + (S.counts.check || 0) : 0;
    document.querySelectorAll('#topnav button[data-goto="#/ai"], #bottomnav button[data-goto="#/ai"]').forEach(function (b) {
      var o = b.querySelector(".chat-badge"); if (o) o.remove();
      if (n) { var s = document.createElement("span"); s.className = "chat-badge"; s.textContent = n; b.appendChild(s); }
    });
    var f = $("aiFab"); if (f) f.classList.toggle("dot", !!(S.counts && (S.counts["new"] || S.counts.check)));
  }
  C.on("sync", function (s) {
    if (!s || !s.orders) return;
    var was = S.counts ? JSON.stringify(S.counts) : "";
    badge(s.orders);
    if (was && was !== JSON.stringify(s.orders) && location.hash.indexOf("#/ai") === 0) load();
  });

  /* ================================================================ окно «Поручить или спросить» */
  function sheet() {
    var v = $("qtVeil"); if (v) return v;
    v = document.createElement("div"); v.id = "qtVeil"; v.className = "x-mveil ai-qtv";
    v.innerHTML = '<div class="x-modal ai-qt" role="dialog" aria-modal="true" aria-labelledby="qtTitle">'
      + '<div class="ai-qh"><div><h3 id="qtTitle">Поручить или спросить</h3><p class="x-sub">Напишите или надиктуйте микрофоном клавиатуры — разберу и покажу, что сделаю</p></div>'
      + '<button class="x-btn ghost" data-qx aria-label="Закрыть">✕</button></div>'
      /* шаг 1 */
      + '<div id="qtS1"><textarea id="qtText" class="ai-qtta" rows="3" enterkeyhint="send" autocapitalize="sentences" placeholder="Скажи Игорю, чтобы сделал закрывающие по Северу до пятницы"></textarea>'
      + '<div class="ai-qhint" id="qtHint"></div>'
      + '<div class="ai-qex">' + EX.map(function (x) { return '<span class="x-chip" data-qex="' + E(x[1]) + '" title="' + E(x[1]) + '">' + E(x[0]) + "</span>"; }).join("") + "</div>"
      + '<div class="ai-qgo"><a href="#/ai" data-qx class="ai-qlink">Мои поручения</a><button class="x-btn primary" id="qtGo">Разобрать</button></div></div>'
      /* поручение */
      + '<div id="qtS2" hidden><div class="ai-qsrc" id="qtSrc2"></div>'
      + '<div class="ai-two"><div class="x-field"><label for="qtWho">Кому</label><select id="qtWho"></select></div>'
      + '<div class="x-field"><label for="qtDue">Срок</label><div class="ai-dt2"><input id="qtDue" type="date"><input id="qtTm" type="time"></div></div></div>'
      + '<div class="x-field"><label for="qtWhat">Что сделать</label><input id="qtWhat" maxlength="300"></div>'
      + '<div class="ai-two"><div class="x-field"><label for="qtTask">По задаче</label><select id="qtTask"></select></div>'
      + '<div class="x-field"><label for="qtRem">Напоминание исполнителю</label><select id="qtRem"><option value="before2h">за 2 ч до срока (или утром)</option><option value="morning">утром в день срока</option><option value="none">без уведомления</option></select></div></div>'
      + '<div class="x-qrow ai-qsw" id="qtWaitRow"><div><b>Жду подтверждения о выполнении</b><small>покажу в «Я поручил — жду»; не отметит к сроку — скажу вам</small></div><button class="x-sw on" id="qtWait"></button></div>'
      + '<span class="ai-lbl" id="qtMsgL">Что получит исполнитель</span><div class="ai-letter" id="qtMsg"></div>'
      + '<div class="ai-qfoot"><button class="x-btn ghost" data-qback>Назад</button><button class="x-btn primary" id="qtSend">Отправить</button></div></div>'
      /* ответ */
      + '<div id="qtSA" hidden><div class="ai-m me" id="qtQ"></div><div class="ai-ans" id="qtA"></div><div class="ai-qfoot"><button class="x-btn ghost" data-qback>Ещё вопрос или поручение</button></div></div>'
      /* этап / комментарий */
      + '<div id="qtS3" hidden><b class="ai-q3t" id="qtT3"></b><div class="ai-qsrc" id="qtSrc3"></div>'
      + '<div class="x-field"><label for="qtTask3">Задача</label><select id="qtTask3"></select></div>'
      + '<div id="qtStg"><span class="ai-lbl">Этап</span><div class="ai-stg"><span id="qtFrom">—</span><span class="arr">→</span><select id="qtTo" aria-label="Новый этап"></select></div>'
      + '<div class="x-field"><label for="qtDl">Срок этапа</label><input id="qtDl" type="date"><small class="ai-qhint" id="qtDlH"></small></div></div>'
      + '<div id="qtCom"><div class="x-field"><label for="qtComT">Комментарий в задачу</label><textarea id="qtComT" rows="3" maxlength="1000"></textarea></div>'
      + '<div class="x-qrow ai-qsw" id="qtNextRow" hidden><div><b id="qtNextL"></b></div><button class="x-sw" id="qtNext"></button></div></div>'
      + '<div class="x-qrow ai-qsw"><div><b>Написать в чат задачи</b><small>увидят все, кто обсуждает задачу</small></div><button class="x-sw on" id="qtChat"></button></div>'
      + '<span class="ai-lbl">Что сделаю</span><div class="ai-letter" id="qtDo"></div>'
      + '<div class="ai-qfoot"><button class="x-btn ghost" data-qback>Назад</button><button class="x-btn primary" id="qtApply">Применить</button></div></div>'
      + "</div>";
    document.body.appendChild(v);
    wire(v);
    return v;
  }
  function step(id) { ["qtS1", "qtS2", "qtSA", "qtS3"].forEach(function (x) { $(x).hidden = x !== id; }); var m = $("qtVeil").querySelector(".ai-qt"); if (m) m.scrollTop = 0; }
  function open(text) {
    if (!C.loggedIn()) { C.requireLogin().then(function () { open(text); }, function () {}); return; }
    var v = sheet(); step("qtS1"); $("qtHint").textContent = ""; $("qtText").value = text || "";
    v.classList.add("on"); document.body.style.overflow = "hidden";
    $("qtText").focus();                                      // сразу клавиатура — можно диктовать её микрофоном
    tasks(); people();                                        // подгружаем заранее, пока человек пишет
  }
  function close() { var v = $("qtVeil"); if (v) v.classList.remove("on"); document.body.style.overflow = ""; }
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-qt]"); if (b) { e.preventDefault(); open(); } });

  function busy(on, txt) { S.busy = on; var b = $("qtGo"); if (b) { b.disabled = on; b.textContent = on ? (txt || "Разбираю…") : "Разобрать"; } }
  function go() {
    var text = $("qtText").value.trim();
    if (!text) { $("qtText").focus(); return; }
    if (S.busy) return;
    busy(true); $("qtHint").textContent = "";
    tasks().then(function (ts) {
      var brief = ts.slice(0, 400).map(function (t) { return { row: +t.row, customer: cut(t.customer, 200), address: cut(t.address, 300), workType: cut(t.workType, 200), stage: cut(t.stage, 120), closed: !!t.closed }; });
      return C.call("/orders/parse", { body: { text: text, tasks: brief, ctx_row: S.ctx || 0 } });
    }).then(function (r) {
      busy(false); S.P = r;
      if (r.task) S.ctx = r.task.row;
      if (r.intent === "assign" || r.intent === "self") return openAssign(r);
      if (r.intent === "question") return r.task ? ask(r) : noTask(r);
      if (r.intent === "stage" || r.intent === "comment") return openAction(r);
      $("qtHint").textContent = "Не понял, что сделать. Например: «Скажи Игорю…», «Напомни мне…», «Что по …?», «Поставь … на этап …», «Добавь по …, что …».";
    }).catch(function (e) { busy(false); $("qtHint").textContent = String(e); });
  }

  /* ---------- поручение ---------- */
  function taskOptions(sel, row, empty) {
    var ts = (S.tasks || []).slice().sort(function (a, b) { return String(a.customer || "").localeCompare(String(b.customer || ""), "ru"); });
    sel.innerHTML = '<option value="">' + (empty || "Без привязки") + "</option>" + ts.map(function (t) { return '<option value="' + t.row + '"' + (+t.row === +row ? " selected" : "") + ">" + E(cut(label(t), 70)) + "</option>"; }).join("");
  }
  function openAssign(r) {
    return people().then(function (pl) {
      $("qtSrc2").textContent = "«" + r.text + "»";
      var who = r.assignee ? r.assignee.id : 0;
      $("qtWho").innerHTML = (who ? "" : '<option value="">Кому поручить?</option>') + pl.map(function (p) { return '<option value="' + p.id + '"' + (p.id === who ? " selected" : "") + ">" + E(isMe(p.id) ? "Себе" : p.name) + "</option>"; }).join("");
      $("qtDue").value = r.due || ""; $("qtTm").value = r.tm || "";
      $("qtWhat").value = r.what || r.text;
      taskOptions($("qtTask"), r.task ? r.task.row : 0);
      $("qtTask").closest(".x-field").hidden = C.isEngineer();
      $("qtRem").value = "before2h"; $("qtWait").classList.add("on");
      step("qtS2"); drawAssign();
    });
  }
  function drawAssign() {
    var id = +$("qtWho").value, self = isMe(id), p = (S.people || []).filter(function (x) { return x.id === id; })[0];
    var what = $("qtWhat").value.trim(), due = $("qtDue").value, tm = $("qtTm").value, t = taskByRow($("qtTask").value);
    $("qtWaitRow").hidden = self;
    $("qtMsgL").textContent = self ? "Задача себе — появится в «Моих задачах»" : p ? "Что получит " + p.name + " (уведомление и «Мои задачи»)" : "Что получит исполнитель";
    var s = (self ? "Себе: " : p ? p.name.split(" ")[0] + ", " : "") + low1(what) + "."
      + (t ? "\nПо задаче: " + label(t) + "." : "") + (due ? "\nСрок — " + ddmm(due, tm) + "." : "")
      + (!self && p && $("qtWait").classList.contains("on") ? "\nКогда сделаешь — отметь «Выполнено», " + C.me.name + " ждёт подтверждения." : "");
    $("qtMsg").textContent = s;
    $("qtSend").textContent = self ? "Поставить себе" : p ? "Отправить " + DAT(p.name.split(" ")[0]) : "Отправить";
    $("qtSend").disabled = !id || !what;
  }
  function send() {
    var id = +$("qtWho").value, t = taskByRow($("qtTask").value), self = isMe(id);
    var body = { to_id: id, what: $("qtWhat").value.trim(), due: $("qtDue").value, tm: $("qtDue").value ? $("qtTm").value : "", task_row: t ? +t.row : 0,
      task_label: t ? cut(label(t), 160) : "", remind: $("qtRem").value, wait: $("qtWait").classList.contains("on"), src: "ai" };
    $("qtSend").disabled = true;
    C.call("/orders", { body: body }).then(function (o) {
      if (t) S.ctx = +t.row;
      close(); U.toast(self ? "Поставлено себе — напомню" : "Поручено: " + o.to_name + (body.wait ? " — жду подтверждения" : ""));
      C.fast && C.fast();
      if (location.hash.indexOf("#/ai") === 0) load();
    }).catch(function (e) { $("qtSend").disabled = false; U.toast(String(e)); });
  }

  /* ---------- «Что по задаче?» ---------- */
  function noTask(r) {
    step("qtSA"); $("qtQ").textContent = r.text;
    $("qtA").innerHTML = '<p>Не нашёл задачу по этому вопросу. Назовите заказчика или адрес — например, «Что по Атланту?».</p>';
  }
  function ask(r) {
    step("qtSA"); $("qtQ").textContent = r.text;
    $("qtA").innerHTML = '<div class="x-empty">Собираю карточку задачи, чат, поручения и переписку…</div>';
    var row = r.task.row;
    callServer("api_getTask", row).then(function (t) {
      var task = { row: +row };
      var lim = { customer: 200, address: 300, workType: 200, stage: 120, deadline: 30, dueDate: 30, contractNo: 60, manager: 80, siteContact: 200 };
      Object.keys(lim).forEach(function (k) { task[k] = cut(t && t[k] != null ? String(t[k]) : "", lim[k]); });
      task.comment = String(t && t.comment || "").slice(-7990);              // свежие записи в конце — их и берём
      task.closed = !!(t && t.closed);
      return C.call("/orders/ask", { body: { text: r.text, task: task } });
    }).then(function (a) {
      var tk = a.task;
      $("qtA").innerHTML = '<div class="ah"><b>' + E(tk.label) + '</b><a href="#/task/' + tk.row + '" data-qx>Открыть задачу</a></div>'
        + '<small class="am">' + (tk.closed ? "Задача закрыта" : "Этап «" + E(tk.stage || "—") + "»" + (tk.deadline ? " · срок " + E(ddmm(tk.deadline)) : "") + (tk.who ? " · отвечает " + E(tk.who) : "")) + "</small>"
        + (a.headline ? '<p class="ahl">' + E(a.headline) + "</p>" : "")
        + (a.facts.length ? '<ul class="af">' + a.facts.map(function (f) { return '<li class="' + f.level + '"><span>' + E(f.text) + "</span>" + (f.source ? "<em>" + E(f.source) + "</em>" : "") + "</li>"; }).join("") + "</ul>" : '<p class="x-sub">Данных по задаче мало.</p>')
        + (a.suggest.length ? '<div class="as"><span class="ai-lbl">Предлагаю</span>' + a.suggest.map(function (s) { return '<div class="asr"><span>' + E(s.label || s.command) + '</span><button class="x-btn primary" data-qex="' + E(s.command) + '">Поручить</button></div>'; }).join("") + "</div>" : "")
        + '<small class="an">Из карточки задачи, чата задачи (' + a.sources.chat + "), поручений (" + a.sources.orders + "), переписки с заказчиком (" + a.sources.dialogs + "). Звонки и личные мессенджеры вне CRM не видны.</small>";
    }).catch(function (e) { $("qtA").innerHTML = '<div class="x-empty">' + E(e) + "</div>"; });
  }

  /* ---------- этап и комментарий ---------- */
  function openAction(r) {
    if (C.isEngineer()) { $("qtHint").textContent = "Задачи доступны руководителю и менеджерам"; return; }
    var row = r.task ? r.task.row : (S.ctx || 0);
    S.A = { kind: r.intent, stage: r.stage, next: r.next, done: r.stage_done, text: r.text };
    $("qtT3").textContent = r.intent === "stage" ? "Перевести задачу на этап" : "Добавить комментарий в задачу";
    $("qtSrc3").textContent = "«" + r.text + "»";
    taskOptions($("qtTask3"), taskByRow(row) ? row : 0, "Выберите задачу…");
    $("qtComT").value = r.comment || "";
    $("qtStg").hidden = r.intent !== "stage"; $("qtCom").hidden = r.intent !== "comment";
    $("qtChat").classList.add("on"); $("qtNext").classList.remove("on");
    step("qtS3"); fillStages(true); drawAction();
  }
  function fillStages(initial) {
    var t = taskByRow($("qtTask3").value), A = S.A;
    $("qtFrom").textContent = t ? (t.stage || "—") : "—";
    var st = t ? stagesOf(t.workType) : [], cur = t ? t.stage : "", idx = st.map(function (s) { return s.name; }).indexOf(cur);
    var want = initial && A.stage ? A.stage : (idx >= 0 && st[idx + 1] ? st[idx + 1].name : "");
    $("qtTo").innerHTML = st.map(function (s, i) { return '<option value="' + E(s.name) + '"' + (s.name === want ? " selected" : "") + ">" + (i + 1) + ". " + E(s.name) + "</option>"; }).join("");
    A.nextName = idx >= 0 && st[idx + 1] ? st[idx + 1].name : "";
    setDl();
  }
  function setDl() {
    var t = taskByRow($("qtTask3").value), st = t ? stagesOf(t.workType) : [], s = st.filter(function (x) { return x.name === $("qtTo").value; })[0];
    $("qtDl").value = s && s.days ? plusDays(s.days) : (t && t.deadline) || "";
    $("qtDlH").textContent = s && s.days ? "обычно на этот этап " + s.days + " дн." + (s.who ? " · ответственный " + s.who : "") : "";
  }
  function drawAction() {
    var A = S.A, t = taskByRow($("qtTask3").value), L = [], move = "";
    var sug = A.kind === "comment" && t && A.nextName && (A.done || /закупил|купил|на склад|получил|пришл|привез|оплатил|подписал|сдал/i.test($("qtComT").value));
    $("qtNextRow").hidden = !sug;
    if (sug) $("qtNextL").textContent = "Похоже, этап «" + t.stage + "» выполнен — перевести на «" + A.nextName + "»?";
    if (A.kind === "stage") move = $("qtTo").value;
    else if (sug && $("qtNext").classList.contains("on")) move = A.nextName;
    if (!t) { $("qtDo").textContent = "Выберите задачу — покажу, что сделаю."; $("qtApply").disabled = true; return; }
    if (A.kind === "comment") L.push("• Комментарий в карточку задачи: «" + $("qtComT").value.trim() + "»");
    if (move && move !== t.stage) {
      var s = stagesOf(t.workType).filter(function (x) { return x.name === move; })[0];
      L.push("• Этап: " + (t.stage || "—") + " → " + move + ($("qtDl").value && A.kind === "stage" ? ", срок " + ddmm($("qtDl").value) : ""));
      if (s && s.who) L.push("• Автоматизация сообщит ответственному этапа: " + s.who);
    }
    if ($("qtChat").classList.contains("on")) L.push("• Запись в чат задачи");
    L.push("• Изменение попадёт в «Журнал изменений», его можно отменить");
    $("qtDo").textContent = L.join("\n");
    A.move = move && move !== t.stage ? move : "";
    $("qtApply").disabled = A.kind === "stage" ? !A.move : !$("qtComT").value.trim();
    $("qtApply").textContent = A.kind === "stage" ? "Перевести этап" : (A.move ? "Добавить и перевести" : "Добавить комментарий");
  }
  function apply() {
    var A = S.A, t = taskByRow($("qtTask3").value); if (!t) return;
    var row = +t.row, com = A.kind === "comment" ? $("qtComT").value.trim() : "", dl = A.kind === "stage" ? $("qtDl").value : "";
    if (A.move && A.kind === "comment") { var s = stagesOf(t.workType).filter(function (x) { return x.name === A.move; })[0]; if (s && s.days) dl = plusDays(s.days); }
    $("qtApply").disabled = true;
    var d = new Date(), stamp = p2(d.getDate()) + "." + p2(d.getMonth() + 1) + "." + d.getFullYear() + " " + C.me.name + ": ";
    callServer("api_getTask", row).then(function (cur) {
      var data = pick(cur || t, TASK_KEYS), from = data.stage;
      if (com) data.comment = (cur && cur.comment ? String(cur.comment).replace(/\s+$/, "") + "\n" : "") + stamp + com;
      if (A.move) { data.stage = A.move; if (dl) data.deadline = dl; }
      return callServer("api_saveTask", row, data).then(function () {
        S.tasks = null; S.ctx = row;
        if (!$("qtChat").classList.contains("on")) return;
        var note = (com ? "📝 " + com : "") + (A.move ? (com ? "\n" : "") + "➡️ Этап: " + from + " → " + A.move : "") + " (через ИИ-менеджер)";
        return C.call("/orders/tasknote", { body: { task_row: row, label: cut(label(t), 160), text: note } }).catch(function () {});
      });
    }).then(function () {
      close(); U.toast(A.move && com ? "Комментарий добавлен, этап переведён" : A.move ? "Этап: «" + A.move + "»" : "Комментарий добавлен в задачу");
      if (location.hash === "#/task/" + row && window.__route) window.__route();
    }).catch(function (e) { $("qtApply").disabled = false; U.toast(String(e)); });
  }

  function wire(v) {
    v.addEventListener("click", function (e) {
      if (e.target === v || e.target.closest("[data-qx]")) { close(); return; }
      if (e.target.closest("[data-qback]")) { step("qtS1"); $("qtText").focus(); return; }
      var ex = e.target.closest("[data-qex]");
      if (ex) { var s = ex.dataset.qex; $("qtText").value = s; step("qtS1"); if (s.indexOf("…") < 0) go(); else { $("qtText").focus(); var i = s.indexOf("…"); $("qtText").setSelectionRange(i, i + 1); } }
    });
    $("qtGo").onclick = go;
    $("qtText").addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } });
    ["qtWho", "qtDue", "qtTm", "qtWhat", "qtTask"].forEach(function (id) { $(id).addEventListener("input", drawAssign); $(id).addEventListener("change", drawAssign); });
    $("qtWait").onclick = function () { this.classList.toggle("on"); drawAssign(); };
    $("qtSend").onclick = send;
    $("qtTask3").addEventListener("change", function () { fillStages(false); drawAction(); });
    $("qtTo").addEventListener("change", function () { setDl(); drawAction(); });
    $("qtDl").addEventListener("change", drawAction);
    $("qtComT").addEventListener("input", drawAction);
    $("qtNext").onclick = function () { this.classList.toggle("on"); drawAction(); };
    $("qtChat").onclick = function () { this.classList.toggle("on"); drawAction(); };
    $("qtApply").onclick = apply;
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && v.classList.contains("on")) close(); });
  }

  /* ================================================================ кнопка «+» */
  function fab() {
    var f = $("aiFab");
    if (!f) { f = document.createElement("button"); f.id = "aiFab"; f.className = "ai-fab"; f.setAttribute("data-qt", ""); f.setAttribute("aria-label", "Поручить или спросить"); f.innerHTML = ic("plus"); document.body.appendChild(f); }
    var sec = typeof window.sectionForHash === "function" ? sectionForHash(location.hash) : "";
    f.hidden = !C.loggedIn() || sec === "chat" || sec === "team" || sec === "kpc";
  }
  window.addEventListener("hashchange", fab);
  C.on("login", function () { fab(); S.people = null; S.tasks = null; S.data = null; if (sectionForHash(location.hash) === "ai") render(); });
  C.on("logout", function () { fab(); S.counts = null; badge(); close(); });

  window.MPBAI = { render: render, open: open, badge: function () { badge(); fab(); } };
  fab();
  if (typeof window.sectionForHash === "function" && sectionForHash(location.hash) === "ai") render();
})();
