/* МПБ CRM v2 — «Оплаты»: поступления на расчётный счёт из 1С (мост читает 1С:Fresh, см. bridge/app/onec.py).
   Мост сам разносит оплату: ТО МПБ («Оплачен» по месяцам), задача (строка в комментарии), реестр КП («Оплачено»).
   Здесь — список, «Проверить сейчас» и ручной разбор того, что мост отнести не смог. Только для руководителя. */
(function () {
  "use strict";
  var C = window.MPBC, T = window.MPBT;
  if (!C || !T || !T.util) return;
  var U = T.util, E = U.E, ic = U.ic;
  function $(id) { return document.getElementById(id); }
  var S = { data: null, filter: "all", busy: false };
  var ST = { ok: ["Разнесено", "ok"], manual: ["Разнесено вручную", "ok"], unmatched: ["Не разобрано", "bad"], other: ["Прочие", "muted"], ignored: ["Не по работам", "muted"] };
  var MON = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

  function money(v) { return Math.round(v || 0).toLocaleString("ru-RU") + " ₽"; }
  function rd(iso) { var p = String(iso || "").split("-"); return p.length === 3 ? p[2] + "." + p[1] + "." + p[0] : iso; }
  function ago(ts) { if (!ts) return "ещё не было"; var m = Math.round((Date.now() / 1000 - ts) / 60); return m < 1 ? "только что" : m < 60 ? m + " мин назад" : m < 1440 ? Math.round(m / 60) + " ч назад" : new Date(ts * 1000).toLocaleString("ru-RU"); }

  function load() { return C.call("/onec").then(function (d) { S.data = d; paint(); }).catch(function (e) { $("payBody").innerHTML = '<div class="x-panel"><div class="x-empty">' + E(e) + "</div></div>"; }); }

  function render() {
    var el = $("pay-app"), sub = "Поступления на расчётный счёт МПБ из 1С: CRM сама отмечает оплату ТО, задачи и заявки";
    if (!U.gate(el, "Оплаты", sub, render)) return;
    if (!C.me || C.me.role !== "admin") { el.innerHTML = U.head("Оплаты", sub) + '<div class="wrap"><div class="x-panel"><div class="x-empty">Оплаты видит руководитель</div></div></div>'; return; }
    el.innerHTML = U.head("Оплаты", sub, '<button class="x-btn accent" id="payRun">' + ic("zap") + "Проверить сейчас</button>") + '<div class="wrap" id="payBody"><div class="x-panel"><div class="x-empty">Загрузка…</div></div></div>';
    $("payRun").onclick = function () {
      if (S.busy) return; S.busy = true; this.disabled = true;
      C.call("/onec/run", { body: {} }).then(function (d) { S.data = d; var r = d.result || {}; U.toast(r.new ? "Новых оплат: " + r.new + (r.unmatched ? ", не разобрано: " + r.unmatched : "") : "Новых оплат нет"); paint(); })
        .catch(function (e) { U.toast(String(e)); }).then(function () { S.busy = false; var b = $("payRun"); if (b) b.disabled = false; });
    };
    load();
  }

  function paint() {
    var d = S.data, body = $("payBody"); if (!d || !body) return;
    if (!d.configured) {
      body.innerHTML = '<div class="x-panel pad"><h3>Связь с 1С не настроена</h3><p class="x-sub">Бухгалтер открывает в 1С:Fresh стандартный интерфейс OData и создаёт пользователя для чтения, руководитель вписывает адрес, имя и пароль в .env моста (ONEC_ODATA_URL, ONEC_ODATA_USER, ONEC_ODATA_PASSWORD). Подробно — в инструкции к мосту, шаг 14.</p></div>';
      return;
    }
    var items = d.items.filter(function (r) { return S.filter === "all" || (S.filter === "bad" ? r.status === "unmatched" : S.filter === "ok" ? (r.status === "ok" || r.status === "manual") : r.status === "other" || r.status === "ignored"); });
    var sum = items.reduce(function (a, r) { return a + (r.amount || 0); }, 0);
    var chips = [["all", "Все"], ["bad", "Не разобрано" + (d.attention ? " · " + d.attention : "")], ["ok", "Разнесено"], ["other", "Прочие"]];
    body.innerHTML = '<div class="x-bar"><div class="x-seg" id="payF">' + chips.map(function (c) { return '<button data-f="' + c[0] + '" class="' + (S.filter === c[0] ? "on" : "") + '">' + c[1] + "</button>"; }).join("") + "</div>"
      + '<span class="x-sub" style="margin-left:auto">Проверка раз в ' + d.minutes + " мин · последняя: " + ago(d.last_run) + (d.error ? ' · <b style="color:var(--bad)">' + E(d.error) + "</b>" : "") + "</span></div>"
      + '<div class="x-panel"><table class="pay-t"><thead><tr><th>Дата</th><th>Плательщик</th><th class="r">Сумма</th><th>Назначение</th><th>Куда отнесено</th><th></th></tr></thead><tbody>'
      + (items.length ? items.map(row).join("") : '<tr><td colspan="6" class="x-empty">Оплат нет</td></tr>')
      + '</tbody><tfoot><tr><td colspan="2">Итого: ' + items.length + '</td><td class="r"><b>' + money(sum) + "</b></td><td colspan=\"3\"></td></tr></tfoot></table></div>";
    $("payF").querySelectorAll("button").forEach(function (b) { b.onclick = function () { S.filter = b.dataset.f; paint(); }; });
    body.querySelectorAll("[data-fix]").forEach(function (b) { b.onclick = function () { fix(d.items.filter(function (r) { return r.ref === b.dataset.fix; })[0]); }; });
  }

  function row(r) {
    var st = ST[r.status] || [r.status, "muted"], open = r.status === "unmatched" || r.status === "other" || r.status === "ignored";
    return '<tr class="' + (r.status === "unmatched" ? "bad" : "") + '"><td>' + rd(r.date) + (r.number ? "<small>п/п " + E(r.number) + "</small>" : "") + "</td>"
      + "<td><b>" + E(r.payer || "—") + "</b>" + (r.inn ? "<small>ИНН " + E(r.inn) + "</small>" : "") + "</td>"
      + '<td class="r"><b>' + money(r.amount) + "</b></td><td class=\"pay-p\">" + E(r.purpose || "") + "</td>"
      + '<td><span class="pay-st ' + st[1] + '">' + st[0] + "</span>" + (r.target ? "<b>" + E(r.target) + "</b>" : "") + (r.note ? "<small>" + E(r.note) + "</small>" : "") + "</td>"
      + "<td>" + (open ? '<button class="x-btn ghost" data-fix="' + E(r.ref) + '">Разнести</button>' : "") + "</td></tr>";
  }

  function fix(r) {
    var d = S.data;
    var objs = d.to_objects.map(function (o) { return '<option value="' + o.id + '">' + E(o.name) + (o.cost ? " · " + money(o.cost) : "") + "</option>"; }).join("");
    var tasks = d.tasks.map(function (t) { return '<option value="' + t.row + '">' + E(t.name) + "</option>"; }).join("");
    var v = U.xmodal('<h3>Разнести оплату</h3><p class="x-sub">' + E(r.payer || "Плательщик") + " · " + money(r.amount) + " · " + rd(r.date) + "</p>"
      + '<div class="x-seg" id="fxK"><button data-k="to" class="on">ТО МПБ</button><button data-k="task">Задача</button><button data-k="ignore">Не по работам</button></div>'
      + '<div id="fxTo"><div class="x-field"><label>Объект ТО</label><select id="fxObj">' + (objs || "<option value=\"\">Нет объектов ТО</option>") + '</select></div><label class="x-sub">Месяцы оплаты (' + String(r.date).slice(0, 4) + ")</label><div class=\"pay-months\">"
      + MON.map(function (m, i) { return '<label><input type="checkbox" value="' + (i + 1) + '">' + m + "</label>"; }).join("") + "</div></div>"
      + '<div id="fxTask" hidden><div class="x-field"><label>Задача</label><select id="fxRow">' + (tasks || "<option value=\"\">Нет задач</option>") + "</select></div><p class=\"x-sub\">В комментарий задачи допишется строка об оплате, заявка заказчика в реестре КП получит статус «Оплачено».</p></div>"
      + '<div id="fxIgn" hidden><p class="x-sub">Платёж останется в списке «Прочие» и больше не будет «Не разобрано».</p></div>'
      + '<div class="x-err" id="fxErr"></div><div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button><button class="x-btn primary" id="fxGo">Сохранить</button></div>');
    var kind = "to";
    v.querySelectorAll("#fxK button").forEach(function (b) {
      b.onclick = function () { kind = b.dataset.k; v.querySelectorAll("#fxK button").forEach(function (x) { x.classList.toggle("on", x === b); }); $("fxTo").hidden = kind !== "to"; $("fxTask").hidden = kind !== "task"; $("fxIgn").hidden = kind !== "ignore"; };
    });
    $("fxGo").onclick = function () {
      var body = { ref: r.ref, kind: kind };
      if (kind === "to") { body.obj = +$("fxObj").value || 0; body.months = [].map.call(v.querySelectorAll(".pay-months input:checked"), function (x) { return +x.value; }); }
      if (kind === "task") body.task = +$("fxRow").value || 0;
      C.call("/onec/assign", { body: body }).then(function (dd) { S.data = dd; T.closeModal(); U.toast("Оплата разнесена"); paint(); }).catch(function (e) { $("fxErr").textContent = String(e); });
    };
  }

  window.MPBPay = { render: render };
  C.on("login", function () { if (U.cur && U.cur() === "pay") render(); });
})();
