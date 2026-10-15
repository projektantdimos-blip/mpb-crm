/* МПБ CRM v2 — этап 2б, часть 2: экран «Автоматизация» (правила «когда → если → тогда», журнал срабатываний, Telegram-бот).
   Правила хранятся и выполняются на сервере-мосте. Смотреть может любой сотрудник, менять — руководитель. */
(function () {
  "use strict";
  var C = window.MPBC, T = window.MPBT, A = window.MPBA = {};
  if (!C || !T || !T.util) return;
  var U = T.util, E = U.E, ic = U.ic;
  function $(id) { return document.getElementById(id); }

  var S = { tab: "rules", rules: [], meta: null, status: null, log: [] };
  var TO_RU = { responsible: "исполнителю этапа / ответственному за заявку", owner: "ответственному за заявку", manager: "ответственному за заказчика", admins: "руководителям", all: "всем сотрудникам" };
  function toRu(t) { return t.indexOf("user:") === 0 ? t.slice(5) : (TO_RU[t] || t); }
  function isAdmin() { return C.me && C.me.role === "admin"; }

  function trigText(r) {
    var m = S.meta && S.meta.triggers[r.trigger], p = r.params || {}, l = m ? m.label : r.trigger;
    l = l.replace("N", p.days != null ? p.days : "N");
    if (r.trigger === "lead_no_reply") l += " (статус «" + p.status + "»)";
    if (r.trigger === "lead_status") l = "Заявка получила статус «" + p.status + "»";
    if (r.trigger === "stage_reached") l = "Задача дошла до этапа «" + p.stage + "»";
    return l;
  }
  function actNodes(r) {
    return r.actions.map(function (a) {
      if (a.type === "notify") return '<span class="node a">' + ic(a.urgent ? "flame" : "bell") + "Уведомить " + E(toRu(a.to)) + (a.urgent ? " · срочно" : "") + "</span>";
      if (a.type === "reminder") return '<span class="node a">' + ic("clock") + "Поставить напоминание: " + E(toRu(a.to)) + "</span>";
      if (a.type === "room_message") return '<span class="node a">' + ic("chat") + "Написать в чат задачи" + (a.urgent ? " · срочно" : "") + "</span>";
      if (a.type === "create_task") return '<span class="node a warn">' + ic("tasks") + "Создать задачу в таблице</span>";
      return "";
    }).join("");
  }
  function agoText(ts) { if (!ts) return "ещё не срабатывало"; var m = Math.round((Date.now() / 1000 - ts) / 60); return m < 1 ? "только что" : m < 60 ? m + " мин назад" : m < 1440 ? Math.round(m / 60) + " ч назад" : Math.round(m / 1440) + " дн. назад"; }

  function render() {
    var el = $("auto-app"), sub = "Система сама напоминает, переносит этапы и сообщает о просрочках — вам не нужно держать это в голове";
    if (!U.gate(el, "Автоматизация", sub, render)) return;
    el.innerHTML = U.head("Автоматизация", sub, isAdmin() ? '<button class="x-btn accent" id="auNew">' + ic("plus") + "Новая автоматизация</button>" : "")
      + '<div class="wrap"><div class="x-bar"><div class="x-seg" id="auTabs"><button data-t="rules" class="' + (S.tab === "rules" ? "on" : "") + '">' + ic("zap") + 'Правила</button><button data-t="mail" class="' + (S.tab === "mail" ? "on" : "") + '">' + ic("chat") + 'Письма</button><button data-t="bot" class="' + (S.tab === "bot" ? "on" : "") + '">' + ic("send") + 'Telegram-бот</button></div></div><div id="auBody"><div class="x-empty">Загрузка…</div></div></div>';
    $("auTabs").querySelectorAll("button").forEach(function (b) { b.onclick = function () { S.tab = b.dataset.t; render(); }; });
    var nb = $("auNew"); if (nb) nb.onclick = function () { if (S.tab === "mail") mailEditor(null); else editor(null); };
    load();
  }
  function load() {
    Promise.all([C.call("/automation/rules"), C.call("/automation/log")]).then(function (r) {
      S.rules = r[0].rules; S.meta = r[0].meta; S.status = r[0].status; S.log = r[1]; paint();
    }).catch(function (e) { $("auBody").innerHTML = '<div class="x-panel"><div class="x-empty">' + E(e) + "</div></div>"; });
  }
  function statusCard() {
    var s = S.status, ok = s.configured && !s.last_error;
    var line = !s.configured ? "Таблица не подключена к мосту — правила по задачам и заявкам не работают. Администратору: в .env моста задать APPS_SCRIPT_URL и APPS_SCRIPT_KEY (см. bridge/INSTALL.md, шаг 11)."
      : s.last_error ? "Последняя сверка не удалась: " + E(s.last_error)
      : s.last_sync ? "Сверка с таблицей: " + agoText(s.last_sync) + " · задач " + s.tasks + ", заявок " + s.leads + " · каждые " + s.sync_minutes + " мин" + (s.baseline ? "" : " · первая сверка ещё не прошла")
      : "Первая сверка ещё не прошла — подождите несколько минут" + (isAdmin() ? " или нажмите «Проверить сейчас»" : "");
    return '<div class="x-notif ' + (ok ? "on" : (s.configured ? "bad" : "")) + '" style="margin-bottom:16px"><span class="dot"></span><div style="flex:1"><b>' + (ok ? "Автоматизации работают" : s.configured ? "Нужно внимание" : "Не подключена таблица") + "</b><small>" + line + "</small></div>"
      + (isAdmin() && s.configured ? '<button class="x-btn ghost" id="auRun" style="padding:8px 14px">Проверить сейчас</button>' : "") + "</div>";
  }
  function paint() {
    var b = $("auBody"); if (!b) return;
    if (S.tab === "bot") { paintBot(b); return; }
    if (S.tab === "mail") { paintMail(b); return; }
    b.innerHTML = statusCard() + '<div class="x-two"><div class="x-panel">' + (S.rules.map(function (r) {
      return '<div class="auto ' + (r.enabled ? "" : "offr") + '" data-id="' + r.id + '">' + (isAdmin() ? '<button class="x-sw ' + (r.enabled ? "on" : "") + '" data-sw="' + r.id + '" title="Включить/выключить"></button>' : '<span class="x-pill ' + (r.enabled ? "ok" : "") + '">' + (r.enabled ? "вкл" : "выкл") + "</span>")
        + '<div class="fl"><span class="node t">' + ic("clock") + E(trigText(r)) + '</span><span class="arr">' + ic("arrow") + "</span>" + actNodes(r) + '</div><span class="runs"><b>' + r.runs + "</b> срабат.<br>" + agoText(r.last_ts) + "</span></div>";
    }).join("") || '<div class="x-empty">Правил пока нет</div>') + "</div>"
      + '<div class="x-panel pad"><h3>Последние срабатывания</h3><p class="x-sub">Что система сделала сама</p>' + (S.log.slice(0, 12).map(function (l) { return '<div class="cmd"><span class="x-pill">' + U.when(l.ts) + '</span><div style="font-size:.84rem"><b>' + E(l.rule) + '</b><div style="color:var(--muted)">' + E(l.summary.replace(l.rule + ": ", "")) + "</div></div></div>"; }).join("") || '<div class="x-empty">Пока ничего не срабатывало</div>') + "</div></div>";
    b.querySelectorAll("[data-sw]").forEach(function (s) { s.onclick = function (e) { e.stopPropagation(); var on = !s.classList.contains("on"); C.call("/automation/rules/" + s.dataset.sw + "/enabled", { body: { enabled: on } }).then(load).catch(function (er) { U.toast(E(er)); }); }; });
    if (isAdmin()) b.querySelectorAll(".auto").forEach(function (row) { row.onclick = function () { editor(S.rules.filter(function (r) { return r.id === +row.dataset.id; })[0]); }; });
    var run = $("auRun"); if (run) run.onclick = function () { run.disabled = true; C.call("/automation/run", { body: {} }).then(function (r) { U.toast(r.ok ? "Сверка выполнена: сработало " + r.fired.length : E(r.error || "Ошибка")); load(); }).catch(function (e) { run.disabled = false; U.toast(E(e)); }); };
  }
  function paintBot(b) {
    var st = S.status, linked = C.me && C.me.tg;
    b.innerHTML = '<div class="x-two"><div><div class="x-panel pad" style="margin-bottom:16px"><h3>Кнопки в Telegram</h3><p class="x-sub">Уведомления приходят с кнопками — действие выполняется прямо из чата, CRM открывать не нужно</p>'
      + '<div class="cmd"><code>✅ Этап выполнен</code>Переводит задачу на следующий этап (срок нового этапа — ' + st.stage_days + ' дн.), исполнитель следующего этапа получает уведомление</div>'
      + '<div class="cmd"><code>⏰ Срок +1 день</code>Переносит дедлайн этапа на день вперёд (от сегодняшнего, если срок уже прошёл)</div>'
      + '<div class="cmd"><code>📞 Контакт сегодня</code>Отмечает в заявке дату последнего контакта — «нет контакта» обнуляется</div>'
      + '<div class="cmd"><code>↩ Отменить</code>Возвращает прежние значения (2 часа после нажатия)</div>'
      + '<div class="cmd"><code>✅ Выполнено / ⏰ +10 мин</code>Под напоминаниями из «Моих задач»</div>'
      + '<div class="cmd"><code>👀 Прочитал(а)</code>Под срочными сообщениями из «Команды»</div></div>'
      + '<div class="x-panel pad"><h3>Права</h3><p class="x-sub" style="margin:0">Закрыть этап или перенести срок может исполнитель этапа, ответственный за заказчика и руководитель. Отметить контакт — ответственный за заявку и руководитель. Все действия попадают в «Журнал изменений».</p></div></div>'
      + '<div class="x-sticky"><div class="x-panel pad"><h3>Статус</h3><p class="x-sub">Бот: ' + (st.bot ? "подключён на сервере" : "не подключён (нужен TG_BOT_TOKEN)") + "<br>Ваш Telegram: " + (linked ? "привязан" : "не привязан") + '</p>'
      + '<button class="x-btn primary" id="auTest" style="width:100%;justify-content:center" ' + (st.bot && linked ? "" : "disabled") + ">" + ic("send") + 'Прислать образец в Telegram</button><div class="x-hint" id="auTestOut">' + (!st.bot ? "Создайте бота у @BotFather и задайте токен — см. bridge/INSTALL.md" : !linked ? "Привяжите Telegram в «Личном кабинете»" : "") + "</div></div></div></div>";
    var t = $("auTest"); if (t) t.onclick = function () { C.call("/automation/test-bot", { body: {} }).then(function () { $("auTestOut").textContent = "Отправлено — проверьте Telegram"; }).catch(function (e) { $("auTestOut").textContent = String(e); }); };
  }

  /* ---------- редактор правила ---------- */
  function editor(rule) {
    var m = S.meta, r = rule ? JSON.parse(JSON.stringify(rule)) : { name: "", trigger: "deadline_before", params: { days: 1 }, actions: [{ type: "notify", to: "responsible" }], enabled: true };
    function recSel(v, id) {
      var opts = Object.keys(TO_RU).map(function (k) { return '<option value="' + k + '"' + (v === k ? " selected" : "") + ">" + E(TO_RU[k]) + "</option>"; }).join("")
        + m.users.map(function (n) { return '<option value="user:' + E(n) + '"' + (v === "user:" + n ? " selected" : "") + ">" + E(n) + " (лично)</option>"; }).join("");
      return '<select data-f="to" data-i="' + id + '">' + opts + "</select>";
    }
    function paramsHtml() {
      var p = r.params || {}, t = r.trigger, h = "";
      if (t === "deadline_before" || t === "deadline_overdue" || t === "lead_idle" || t === "lead_no_reply" || t === "to_before" || t === "to_not_done") h += '<div class="x-field"><label>Дней</label><input type="number" min="0" max="365" id="edDays" value="' + (p.days != null ? p.days : 1) + '"></div>';
      if (t === "lead_no_reply" || t === "lead_status") h += '<div class="x-field"><label>Статус заявки</label><select id="edStatus">' + m.statuses.map(function (s) { return "<option" + (p.status === s ? " selected" : "") + ">" + E(s) + "</option>"; }).join("") + "</select></div>";
      if (t === "stage_reached") h += '<div class="x-field"><label>Этап</label><select id="edStage">' + m.stages.map(function (s) { return "<option" + (p.stage === s ? " selected" : "") + ">" + E(s) + "</option>"; }).join("") + "</select></div>";
      return h;
    }
    function actsHtml() {
      return r.actions.map(function (a, i) {
        var h = '<div class="x-panel pad" style="margin-bottom:10px;padding:14px"><div class="x-opts"><div class="x-opt"><label>Действие</label><select data-f="type" data-i="' + i + '">'
          + [["notify", "Уведомить"], ["reminder", "Поставить напоминание"], ["room_message", "Написать в чат задачи"], ["create_task", "Создать задачу в таблице"]].map(function (o) { return '<option value="' + o[0] + '"' + (a.type === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div>";
        if (a.type === "notify" || a.type === "reminder") h += '<div class="x-opt"><label>Кому</label>' + recSel(a.to, i) + "</div>";
        if (a.type === "notify" || a.type === "room_message") h += '<div class="x-opt" style="flex:0 0 120px"><label>Срочно</label><button type="button" class="x-sw ' + (a.urgent ? "on" : "") + '" data-f="urgent" data-i="' + i + '"></button></div>';
        h += "</div>";
        if (a.type !== "create_task") h += '<div class="x-field" style="margin:10px 0 0"><label>Текст (необязательно; {customer} {stage} {deadline} {days} {status} {amount} {address} {reason})</label><input type="text" data-f="text" data-i="' + i + '" value="' + E(a.text || "") + '" placeholder="по умолчанию — стандартный текст"></div>';
        else h += '<p class="x-sub" style="margin:10px 0 0">⚠ Меняет таблицу: создаёт задачу из заявки (вид работ «Монтаж», первый этап, ответственный — владелец заявки).</p>';
        if (r.actions.length > 1) h += '<button class="x-btn ghost" style="padding:6px 12px;margin-top:10px" data-del="' + i + '">Убрать действие</button>';
        return h + "</div>";
      }).join("");
    }
    function draw() {
      var timeT = ["deadline_before", "deadline_overdue", "lead_idle", "lead_no_reply", "to_not_done", "to_missed"].indexOf(r.trigger) >= 0;
      var v = U.xmodal('<h3>' + (rule ? "Правило" : "Новая автоматизация") + '</h3><p class="x-sub">Когда произойдёт событие — система сделает действие сама</p>'
        + '<div class="x-field"><label>Название</label><input type="text" id="edName" value="' + E(r.name) + '" placeholder="Например: Просрочка 3 дня — руководителю"></div>'
        + '<div class="x-field"><label>Когда</label><select id="edTrig">' + Object.keys(m.triggers).map(function (k) { return '<option value="' + k + '"' + (r.trigger === k ? " selected" : "") + ">" + E(m.triggers[k].label) + "</option>"; }).join("") + "</select></div>"
        + paramsHtml() + '<div class="x-grp" style="padding:8px 0">Тогда</div>' + actsHtml()
        + '<button class="x-btn ghost" id="edAdd" style="margin-bottom:12px">' + ic("plus") + "Добавить действие</button>"
        + (timeT ? '<div class="x-qrow"><div><b>Сразу разослать про уже наступившее</b><small>По умолчанию старые просрочки молчат — уведомляем только о новых</small></div><button class="x-sw" id="edExisting"></button></div>' : "")
        + '<div class="x-err" id="edErr"></div><div class="x-row">' + (rule ? '<button class="x-btn ghost" id="edDel" style="margin-right:auto;color:var(--bad)">Удалить</button>' : "") + '<button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button><button class="x-btn primary" id="edSave">Сохранить</button></div>', true);
      var existing = false;
      function sync() {
        r.name = $("edName").value;
        if ($("edDays")) r.params.days = +$("edDays").value; if ($("edStatus")) r.params.status = $("edStatus").value; if ($("edStage")) r.params.stage = $("edStage").value;
      }
      $("edTrig").onchange = function () { sync(); r.trigger = this.value; r.params = JSON.parse(JSON.stringify(m.triggers[r.trigger].params)); draw(); };
      v.querySelectorAll("[data-f]").forEach(function (el) {
        var i = +el.dataset.i, f = el.dataset.f;
        if (el.tagName === "BUTTON") el.onclick = function () { sync(); r.actions[i][f] = !r.actions[i][f]; draw(); };
        else el.onchange = el.oninput = function () { sync(); r.actions[i][f] = el.value; if (f === "type") { var a = r.actions[i]; if ((a.type === "notify" || a.type === "reminder") && !a.to) a.to = "responsible"; draw(); } };
      });
      v.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { sync(); r.actions.splice(+b.dataset.del, 1); draw(); }; });
      $("edAdd").onclick = function () { sync(); r.actions.push({ type: "notify", to: "responsible" }); draw(); };
      var ex = $("edExisting"); if (ex) ex.onclick = function () { existing = !existing; ex.classList.toggle("on", existing); };
      var del = $("edDel"); if (del) del.onclick = function () { if (confirm("Удалить правило «" + rule.name + "»?")) C.call("/automation/rules/" + rule.id + "/delete", { body: {} }).then(function () { U.xmodal(""); T.closeModal(); load(); }); };
      $("edSave").onclick = function () {
        sync();
        var body = { name: r.name, trigger: r.trigger, params: r.params, actions: r.actions.map(function (a) { var o = { type: a.type }; ["to", "urgent", "text"].forEach(function (k) { if (a[k] != null && a[k] !== "") o[k] = a[k]; }); return o; }), enabled: rule ? rule.enabled : true, notify_existing: existing };
        C.call(rule ? "/automation/rules/" + rule.id : "/automation/rules", { body: body }).then(function () { T.closeModal(); U.toast("Правило сохранено"); load(); }).catch(function (e) { $("edErr").textContent = String(e); });
      };
    }
    draw();
  }

  /* ---------- письма: правила передачи сотрудникам ---------- */
  var MR = { rules: [], people: [] };
  function kwText(a) { return (a || []).join(", "); }
  function ruleText(m) {
    var p = [];
    if ((m.subject || []).length) p.push("в теме: " + kwText(m.subject));
    if ((m.files || []).length) p.push("в названии файла: " + kwText(m.files));
    if ((m.text || []).length) p.push("в тексте: " + kwText(m.text));
    if ((m.from || []).length) p.push("от: " + kwText(m.from));
    if (m.attach) p.push("только с вложением");
    return p.join(" · ");
  }
  function paintMail(b) {
    b.innerHTML = '<div class="x-empty">Загрузка…</div>';
    Promise.all([C.call("/mail/rules"), C.call("/people")]).then(function (r) {
      MR.rules = r[0]; MR.people = r[1];
      b.innerHTML = '<div class="x-two"><div class="x-panel">' + (MR.rules.map(function (x) {
        return '<div class="auto ' + (x.enabled ? "" : "offr") + '" data-mr="' + x.id + '"><div class="fl"><span class="node t">' + ic("chat") + E(x.name) + '</span><span class="arr">' + ic("arrow") + '</span><span class="node a">' + ic("user") + "Передать: " + E(x.user || "—") + '</span></div><span class="runs"><b>' + x.runs + "</b> передано<br>" + E(ruleText(x.match)) + "</span></div>";
      }).join("") || '<div class="x-empty">Правил пока нет. Нажмите «Новая автоматизация» — например, «письма со счетами → бухгалтеру».</div>') + "</div>"
        + '<div class="x-panel pad"><h3>Как это работает</h3><p class="x-sub">Каждое новое входящее письмо проверяется по правилам по порядку. Подошло — оно передаётся сотруднику: в «Переписке» у диалога появляется отметка «→ имя», сотрудник получает уведомление и видит письмо во вкладке «Мне передали».</p><p class="x-sub" style="margin:0">Письма можно также передавать вручную кнопкой «📨 Передать» в диалоге.</p></div></div>';
      if (isAdmin()) b.querySelectorAll("[data-mr]").forEach(function (row) { row.onclick = function () { mailEditor(MR.rules.filter(function (x) { return x.id === +row.dataset.mr; })[0]); }; });
    }).catch(function (e) { b.innerHTML = '<div class="x-panel"><div class="x-empty">' + E(e) + "</div></div>"; });
  }
  function mailEditor(rule) {
    if (!isAdmin()) { U.toast("Правила настраивает руководитель"); return; }
    var r = rule ? JSON.parse(JSON.stringify(rule)) : { name: "", user_id: 0, match: { subject: [], files: ["счет", "счёт", "invoice"], text: [], from: [], attach: true }, note: "", enabled: true };
    function people() { return MR.people.length ? Promise.resolve(MR.people) : C.call("/people").then(function (p) { MR.people = p; return p; }); }
    people().then(function (ppl) {
      U.xmodal('<h3>' + (rule ? "Правило передачи писем" : "Новое правило передачи писем") + '</h3><p class="x-sub">Если новое письмо подходит под условия — оно передаётся сотруднику. Условия соединяются «и»; слова внутри одного поля — «или»</p>'
        + '<div class="x-field"><label>Название</label><input id="mrName" value="' + E(r.name) + '" placeholder="Например: Счета на оплату — бухгалтеру"></div>'
        + '<div class="x-field"><label>Кому передавать</label><select id="mrUser">' + ppl.map(function (p) { return '<option value="' + p.id + '"' + (p.id === r.user_id ? " selected" : "") + ">" + E(p.name) + (p.title ? " — " + E(p.title) : "") + "</option>"; }).join("") + "</select></div>"
        + '<div class="x-field"><label>Слова в теме письма (через запятую)</label><input id="mrSubj" value="' + E(kwText(r.match.subject)) + '" placeholder="счёт, оплата"></div>'
        + '<div class="x-field"><label>Слова в названии вложенного файла</label><input id="mrFiles" value="' + E(kwText(r.match.files)) + '" placeholder="счет, счёт, invoice"></div>'
        + '<div class="x-field"><label>Слова в тексте письма</label><input id="mrText" value="' + E(kwText(r.match.text)) + '"></div>'
        + '<div class="x-field"><label>Отправитель содержит (адрес или имя)</label><input id="mrFrom" value="' + E(kwText(r.match.from)) + '" placeholder="@postavshik.ru"></div>'
        + '<div class="x-qrow"><div><b>Только письма с вложением</b><small>Письмо без файла под правило не подойдёт</small></div><button type="button" class="x-sw ' + (r.match.attach ? "on" : "") + '" id="mrAtt"></button></div>'
        + '<div class="x-field"><label>Что сказать сотруднику (необязательно)</label><input id="mrNote" value="' + E(r.note || "") + '" placeholder="Счёт на оплату"></div><div class="x-err" id="mrErr"></div>'
        + '<div class="x-row">' + (rule ? '<button class="x-btn ghost" id="mrDel" style="margin-right:auto;color:var(--bad)">Удалить</button><button class="x-btn ghost" id="mrApply">Применить к письмам за 30 дней</button>' : "") + '<button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button><button class="x-btn primary" id="mrSave">Сохранить</button></div>', true);
      var att = r.match.attach; function $e(id) { return document.getElementById(id); }
      $e("mrAtt").onclick = function () { att = !att; this.classList.toggle("on", att); };
      function kws(id) { return $e(id).value.split(/[,;\n]/).map(function (x) { return x.trim(); }).filter(Boolean); }
      $e("mrSave").onclick = function () {
        C.call("/mail/rules", { body: { id: rule ? rule.id : 0, name: $e("mrName").value, user_id: +$e("mrUser").value, match: { subject: kws("mrSubj"), files: kws("mrFiles"), text: kws("mrText"), from: kws("mrFrom"), attach: att }, note: $e("mrNote").value, enabled: rule ? rule.enabled : true } })
          .then(function () { T.closeModal(); U.toast("Правило сохранено"); paintMail($("auBody")); }).catch(function (e) { $e("mrErr").textContent = String(e); });
      };
      var del = $e("mrDel"); if (del) del.onclick = function () { if (confirm("Удалить правило?")) C.call("/mail/rules/" + rule.id + "/delete", { body: {} }).then(function () { T.closeModal(); paintMail($("auBody")); }); };
      var ap = $e("mrApply"); if (ap) ap.onclick = function () { C.call("/mail/rules/" + rule.id + "/apply", { body: {} }).then(function (x) { U.toast("Передано писем: " + x.assigned + " (без уведомлений)"); }).catch(function (e) { $e("mrErr").textContent = String(e); }); };
    });
  }

  A.render = render;
  var oldRender = T.render;
  T.render = function (sec) { if (sec === "auto") render(); else oldRender(sec); };
  C.on("login", function () { if (U.cur() === "auto") render(); });
  C.on("logout", function () { if (U.cur() === "auto") render(); });
  if (U.cur() === "auto") render();
})();
