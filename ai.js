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
  var S = { data: null, dec: null, people: null, tasks: null, tasksTs: 0, ctx: 0, busy: false, P: null, A: null, counts: null,
    sel: {}, edit: {}, kp: {}, kpBusy: {}, planBusy: {} };
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
    var el = $("ai-app"), sub = "Письма на решение и поручения — подготовлю ответ и КП, напомню исполнителю и прослежу, чтобы вы не забыли проверить";
    if (!U.gate(el, "ИИ-менеджер", sub, render)) return;
    el.innerHTML = U.head("ИИ-менеджер", sub, '<button class="x-btn primary" data-qt>' + ic("plus") + "Поручить</button>")
      + '<div class="wrap" id="aiBody"><div class="x-panel"><div class="x-empty">Загрузка…</div></div></div>';
    load();
  }
  function load() {
    var dec = C.isEngineer() ? Promise.resolve(null) : C.call("/decisions").catch(function (e) { return { error: String(e), items: [], other: 0 }; });
    return Promise.all([C.call("/orders"), dec]).then(function (r) { S.data = r[0]; S.dec = r[1]; badge(r[0].counts); paint(); })
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
    if (S.dec && S.dec.items && S.dec.items.length && !S.people) people().then(function () { if ($("aiBody")) paint(); });
    ((S.dec && S.dec.items) || []).forEach(function (it) {           // рекомендовано «КП» — собираем черновик сразу
      if (it.plan && !it.plan_stale && it.plan.action === "kp" && !S.sel[it.thread_id] && !S.kp[it.thread_id] && !S.kpBusy[it.thread_id]) setTimeout(function () { makeKp(it.thread_id); }, 50);
    });
    var check = d.by_me.filter(function (o) { return o.status === "done"; }).length;
    b.innerHTML = decPanel() + '<div class="ai-grid2">'
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


  /* ================================================================ «Ждут вашего решения» (письма клиентов) */
  var KIND_PILL = { new_request: "blue", kp_reply: "acc", question: "acc", invoice_docs: "soon" };
  var CH = { mail: "почта", tg: "Telegram", max: "Max", site: "сайт", avito: "Авито" };
  function decById(tid) { return ((S.dec && S.dec.items) || []).filter(function (x) { return x.thread_id === tid; })[0]; }
  function decPanel() {
    var d = S.dec; if (!d) return "";
    var items = d.items || [];
    return '<div class="x-panel pad ai-decp"><div class="ai-ph"><h3>Ждут вашего решения · ' + items.length + '</h3><a class="ai-lnk" href="#/chat">Вся переписка →</a></div>'
      + '<p class="x-sub">Письма и сообщения клиентов без ответа: ИИ разобрал, что хотят, и подготовил варианты — ничего не уйдёт без вашей кнопки</p>'
      + (d.error ? '<div class="x-empty">' + E(d.error) + "</div>" : items.length ? '<div class="ai-decg">' + items.map(decCard).join("") + "</div>" : '<div class="x-empty">Все клиенты получили ответ — решений не ждёт</div>')
      + (d.other ? '<small class="ai-dother">Ещё без ответа: ' + d.other + " — реклама, поставщики и сообщения, на которые отвечать не нужно</small>" : "")
      + "</div>";
  }
  function decCard(it) {
    var tr = it.triage || {}, p = it.plan, tid = it.thread_id, opt = S.sel[tid] || (p && p.action) || "reply";
    var top = '<div class="ai-dtop">' + (tr.kind_label ? '<span class="x-pill ' + (KIND_PILL[tr.kind] || "") + '">' + E(tr.kind_label) + "</span>" : "")
      + (tr.urgency === "high" ? '<span class="x-pill over">срочно</span>' : "")
      + "<small>" + E(CH[it.channel] || it.channel) + " · " + E(cut(it.peer, 40)) + " · " + hm(it.ts) + "</small></div>";
    var title = (tr.org || it.title || it.peer) + (tr.object ? " · " + tr.object : "");
    var h = '<div class="ai-card ai-dc" data-tid="' + E(tid) + '">' + top + "<b>" + E(cut(title, 110)) + "</b>"
      + "<p>" + E((p && p.summary) || tr.summary || "ИИ ещё не разобрал сообщение") + "</p>"
      + ((p && p.context) ? '<small class="ai-dctx">По клиенту: ' + E(p.context) + "</small>" : "")
      + (it.assigned.length ? '<small class="ai-dctx">Передано: ' + E(it.assigned.join(", ")) + "</small>" : "")
      + '<details class="ai-det"><summary>' + (it.subject ? E(cut(it.subject, 60)) : "Сообщение клиента") + '</summary><div class="ai-quote">' + E(it.text) + "</div></details>";
    if (!p || it.plan_stale) {
      var busy = S.planBusy[tid];
      h += (it.plan_stale ? '<p class="ai-dwarn">Пришло новое сообщение — решение нужно обновить</p>' : "")
        + '<div class="ai-acts"><button class="x-btn primary" data-dplan="' + E(tid) + '"' + (busy ? " disabled" : "") + ">" + (busy ? "Готовлю…" : it.plan_stale ? "Обновить решение" : "Подготовить решение") + "</button>"
        + '<a class="x-btn ghost" href="#/chat?t=' + encodeURIComponent(tid) + '">Открыть переписку</a><button class="x-btn ghost" data-dno="' + E(tid) + '">Не надо</button></div>';
      return h + "</div>";
    }
    h += '<div class="ai-opts">' + p.options.map(function (o) { return '<span class="x-chip' + (o.action === opt ? " on" : "") + '" data-dopt="' + o.action + '">' + E(o.label) + "</span>"; }).join("")
      + (p.options.some(function (o) { return o.action === "pass"; }) ? "" : '<span class="x-chip' + (opt === "pass" ? " on" : "") + '" data-dopt="pass">Передать</span>') + "</div>";
    h += '<div class="ai-dbody">' + optBody(it, opt) + "</div>";
    h += '<div class="ai-dfoot"><a href="#/chat?t=' + encodeURIComponent(tid) + '">Открыть переписку</a><span class="ai-lnk" data-dplan="' + E(tid) + '">Обновить решение</span><span class="ai-lnk" data-dno="' + E(tid) + '">Не надо</span></div>';
    return h + "</div>";
  }
  function edited(tid, key, dflt) { var k = tid + "|" + key; return S.edit[k] != null ? S.edit[k] : (dflt || ""); }
  function optBody(it, opt) {
    var p = it.plan, tid = it.thread_id;
    if (opt === "reply" || opt === "questions") {
      var dflt = opt === "questions" ? (p.questions || p.reply) : p.reply;
      return '<textarea class="ai-dtext" data-dedit="' + opt + '" rows="7">' + E(edited(tid, opt, dflt)) + "</textarea>"
        + '<div class="ai-acts"><button class="x-btn primary" data-dsend="' + opt + '">' + (opt === "questions" ? "Отправить вопросы" : "Отправить ответ") + "</button></div>";
    }
    if (opt === "kp") {
      var k = S.kp[tid];
      if (S.kpBusy[tid]) return '<div class="x-empty">Собираю КП по прайсу…</div>';
      if (!k) return '<p class="ai-dreq">Что в КП: ' + E(p.kp_request || "—") + '</p><div class="ai-acts"><button class="x-btn primary" data-dkp="1">Собрать КП по прайсу</button></div>';
      if (k.error) return '<p class="ai-dwarn">' + E(k.error) + '</p><div class="ai-acts"><button class="x-btn ghost" data-dkp="1">Попробовать ещё раз</button></div>';
      return '<div class="ai-kpd"><div class="ai-kph"><b>КП № ' + E(k.saved.num || "—") + " · черновик</b><b>" + money(k.total) + "</b></div>"
        + '<div class="ai-kpt">' + E(k.text || "") + "</div>"
        + (k.notes.length ? '<small class="ai-dctx">' + E(k.notes.join(" · ")) + "</small>" : "")
        + (k.missing.length ? '<div class="ai-dwarn">Не хватает — отправить нельзя, пока не заполните в конструкторе:<br>' + k.missing.map(E).join("<br>") + "</div>" : "")
        + "</div>"
        + '<span class="ai-lbl">Письмо к КП</span><textarea class="ai-dtext" data-dedit="kpl" rows="5">' + E(edited(tid, "kpl", p.reply)) + "</textarea>"
        + '<div class="ai-acts"><button class="x-btn primary" data-dkpsend="1"' + (k.ok ? "" : " disabled") + '>Отправить КП с письмом</button><button class="x-btn ghost" data-dkpedit="1">Редактировать в конструкторе</button><button class="x-btn ghost" data-dkp="1">Пересобрать</button></div>';
    }
    if (opt === "pass") {
      var pl = (S.people || []).filter(function (x) { return x.role !== "engineer"; }), cur = edited(tid, "passto", p.pass_to);
      return '<div class="ai-two2"><select class="ai-dsel" data-dedit="passto">' + pl.map(function (x) { return "<option" + (x.name === cur ? " selected" : "") + ">" + E(x.name) + "</option>"; }).join("")
        + '</select><input class="ai-dinp" data-dedit="passnote" placeholder="Пометка сотруднику" value="' + E(edited(tid, "passnote", p.pass_note)) + '"></div>'
        + '<div class="ai-acts"><button class="x-btn primary" data-dpass="1">Передать</button></div>';
    }
    if (opt === "task") {
      return '<p class="ai-dreq">' + E(p.task || "Поручение по этому письму") + '</p><div class="ai-acts"><button class="x-btn primary" data-dtask="1">Открыть в «Поручить»</button></div>';
    }
    return "";
  }
  function money(n) { return Math.round(n || 0).toLocaleString("ru-RU") + " ₽"; }
  function b64(blob) { return new Promise(function (ok, bad) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(",")[1]); }; r.onerror = bad; r.readAsDataURL(blob); }); }
  function repaintCard(tid) {
    var it = decById(tid), el = null;
    document.querySelectorAll("#ai-app .ai-dc").forEach(function (x) { if (x.dataset.tid === tid) el = x; });
    if (!it || !el) { paint(); return; }
    var tmp = document.createElement("div"); tmp.innerHTML = decCard(it); el.replaceWith(tmp.firstChild);
  }
  function makeKp(tid) {
    var it = decById(tid); if (!it || !it.plan) return;
    if (!window.MPBP || !MPBP.kpDraft) { U.toast("Модуль КП не загружен — обновите страницу"); return; }
    S.kpBusy[tid] = 1; repaintCard(tid);
    MPBP.kpDraft(it.plan.kp_request || it.text).then(function (k) {
      if (k.empty) k = { error: "ИИ не понял, какие услуги включить в КП. Уточните у клиента или соберите КП вручную." };
      S.kp[tid] = k;
    }).catch(function (e) { S.kp[tid] = { error: String(e) }; }).then(function () { delete S.kpBusy[tid]; repaintCard(tid); });
  }
  function decDone(tid, msg) { U.toast(msg); delete S.kp[tid]; if (C.fast) C.fast(); setTimeout(load, 600); }
  document.addEventListener("input", function (e) {
    var f = e.target.closest ? e.target.closest("#ai-app [data-dedit]") : null; if (!f) return;
    S.edit[f.closest(".ai-dc").dataset.tid + "|" + f.dataset.dedit] = f.value;
  });
  document.addEventListener("change", function (e) {
    var f = e.target.closest ? e.target.closest("#ai-app select[data-dedit]") : null; if (!f) return;
    S.edit[f.closest(".ai-dc").dataset.tid + "|" + f.dataset.dedit] = f.value;
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("#ai-app [data-dplan],#ai-app [data-dno],#ai-app [data-dopt],#ai-app [data-dsend],#ai-app [data-dkp],#ai-app [data-dkpsend],#ai-app [data-dkpedit],#ai-app [data-dpass],#ai-app [data-dtask]");
    if (!b) return;
    var card = b.closest(".ai-dc"), tid = card ? card.dataset.tid : "", it = decById(tid), enc = encodeURIComponent(tid);
    if (!it) return;
    if (b.hasAttribute("data-dplan")) {
      if (S.planBusy[tid]) return;
      S.planBusy[tid] = 1; repaintCard(tid);
      C.call("/decisions/" + enc + "/plan", { body: {} }).then(function (r) { it.plan = r.plan; it.plan_stale = false; delete S.sel[tid]; delete S.kp[tid]; })
        .catch(function (er) { U.toast(String(er)); }).then(function () { delete S.planBusy[tid]; repaintCard(tid); if (it.plan && it.plan.action === "kp" && !it.plan_stale) makeKp(tid); });
      return;
    }
    if (b.hasAttribute("data-dno")) {
      if (!confirm("Убрать из «Ждут решения»? Клиенту ничего не уйдёт. Новое сообщение от него снова появится здесь.")) return;
      C.call("/decisions/" + enc + "/mark", { body: { status: "dismissed" } }).then(function () { decDone(tid, "Убрано из решений"); }).catch(function (er) { U.toast(String(er)); });
      return;
    }
    if (b.dataset.dopt) {
      S.sel[tid] = b.dataset.dopt; repaintCard(tid);
      if (b.dataset.dopt === "kp" && !S.kp[tid] && !S.kpBusy[tid]) makeKp(tid);
      if (b.dataset.dopt === "pass" && !S.people) people().then(function () { repaintCard(tid); });
      return;
    }
    if (b.dataset.dsend) {
      var ta = card.querySelector("textarea[data-dedit]"), txt = ta ? ta.value.trim() : "";
      if (!txt) { U.toast("Текст пустой"); return; }
      if (!window.__chatSend) { U.toast("Переписка не подключена на этом устройстве — откройте «Переписку» и проверьте мост"); return; }
      if (!confirm("Отправить клиенту «" + (it.title || it.peer) + "»?\n\n" + txt.slice(0, 300) + (txt.length > 300 ? "…" : ""))) return;
      b.disabled = true;
      window.__chatSend(tid, txt).then(function () { delete S.edit[tid + "|" + b.dataset.dsend]; decDone(tid, "Отправлено клиенту"); })
        .catch(function (er) { b.disabled = false; U.toast("Не отправлено: " + er); });
      return;
    }
    if (b.hasAttribute("data-dkp")) { delete S.kp[tid]; makeKp(tid); return; }
    if (b.hasAttribute("data-dkpedit")) {
      var k = S.kp[tid]; if (!k || !k.saved || !window.__kpc) return;
      window.__kpc.load(k.saved);
      if (window.MPBP) MPBP.thread = { id: tid, title: it.title || it.peer };
      location.hash = "#/kpc";
      setTimeout(function () { U.toast("Поправьте КП и нажмите «Отправить в чат» — уйдёт в диалог «" + (it.title || it.peer) + "»"); }, 300);
      return;
    }
    if (b.hasAttribute("data-dkpsend")) {
      var kp = S.kp[tid], letter = card.querySelector('textarea[data-dedit="kpl"]').value.trim();
      if (!kp || !kp.ok) return;
      if (!window.__chatSendFile) { U.toast("Переписка не подключена на этом устройстве — откройте «Переписку» и проверьте мост"); return; }
      if (!confirm("Отправить КП № " + kp.saved.num + " на " + money(kp.total) + " клиенту «" + (it.title || it.peer) + "» — письмо и PDF?")) return;
      b.disabled = true;
      var withText = it.channel !== "mail" && it.channel !== "tg";                 // в Max файл не уходит — добавим текст КП
      window.__kpc.pdf(kp.saved).then(function (pdf) {
        return b64(pdf.blob).then(function (data) { return window.__chatSendFile(tid, (letter + (withText ? "\n\n" + kp.text : "")).trim(), pdf.name, data); });
      }).then(function () {
        var info = { name: kp.saved.object, address: kp.saved.address, total: kp.total, num: kp.saved.num, phone: it.peer || "", owner: (C.me && C.me.name) || "" };
        var jobs = [C.call("/kp/versions", { body: { num: String(kp.saved.num || ""), object: kp.saved.object || "", total: kp.total, state: kp.saved, note: "Отправлено из «Ждут решения»: " + (it.title || it.peer), status: "sent" } })];
        if (window.MPBK && MPBK.registerKp) jobs.push(MPBK.registerKp(info));
        return Promise.all(jobs.map(function (j) { return j.catch(function () {}); }));
      }).then(function () { decDone(tid, "КП № " + kp.saved.num + " отправлено клиенту, записано в реестр"); })
        .catch(function (er) { b.disabled = false; U.toast("Не отправлено: " + er); });
      return;
    }
    if (b.hasAttribute("data-dpass")) {
      var name = card.querySelector('[data-dedit="passto"]').value, note = card.querySelector('[data-dedit="passnote"]').value.trim();
      var u = (S.people || []).filter(function (x) { return x.name === name; })[0]; if (!u) return;
      b.disabled = true;
      C.call("/mail/assign", { body: { thread_id: tid, user_id: u.id, note: note, message_id: it.msg_id } })
        .then(function () { return C.call("/decisions/" + enc + "/mark", { body: { status: "done" } }); })
        .then(function () { decDone(tid, "Передано: " + name); }).catch(function (er) { b.disabled = false; U.toast(String(er)); });
      return;
    }
    if (b.hasAttribute("data-dtask")) { open(it.plan.task || ""); return; }
  });

  /* ================================================================ счётчик в меню */
  function badge(cn) {
    if (cn) S.counts = cn;
    var n = S.counts ? (S.counts.mine || 0) + (S.counts.check || 0) + (S.counts.decide || 0) : 0;
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
    var ae = document.activeElement, typing = ae && ae.closest && ae.closest("#ai-app") && /TEXTAREA|INPUT|SELECT/.test(ae.tagName);
    if (was && was !== JSON.stringify(s.orders) && location.hash.indexOf("#/ai") === 0 && !typing && !Object.keys(S.kpBusy).length) load();
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
