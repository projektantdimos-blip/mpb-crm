/* МПБ CRM v2 — боковая панель диалога («Переписка»): клиент, создание клиента и сборка КП рядом с диалогом.
   Вкладки: «Клиент» · «Создать клиента» · «КП». КП уходит в диалог текстом и файлом PDF, попадает в реестр КП
   (заявка получает статус «КП отправлено») и сохраняется версией. Услуги и формулировки — те же, что в «Конструкторе КП». */
(function () {
  "use strict";
  var T = window.MPBT, D = window.MPBD = {};
  if (!T || !T.util) return;
  var U = T.util, E = U.E;
  var per = {};                                                  // состояние панели по диалогам
  function $(id) { return document.getElementById(id); }
  function Kc() { return window.__kpc; }
  function money(n) { return Math.round(n || 0).toLocaleString("ru-RU") + " ₽"; }
  function aiOn() { return !!(D.ai && D.ai.configured && D.ai.enabled); }
  function st(t) { return per[t.id] || (per[t.id] = { tab: aiOn() ? "a" : "c", rows: [], num: "", object: "", address: "", init: false, errors: [], busy: false, cl: undefined }); }
  function crm() { return !!(window.MPBC && MPBC.loggedIn && MPBC.loggedIn()); }

  /* ---------- конвертация строк панели в состояние конструктора ---------- */
  function svcOf(id) { var c = Kc(); return c ? c.CATALOG.filter(function (s) { return s.id === id; })[0] : null; }
  function qtyField(svc) { return (svc.fields || []).filter(function (f) { return f.type === "int"; })[0]; }
  function unitPrice(svc) {
    if (!window.MPBP || !MPBP.suggest) return 0;
    var f = {}, qf = qtyField(svc); if (qf) f[qf.id] = "1";
    return MPBP.suggest(svc, { fields: f }) || 0;
  }
  function toSaved(s) {
    var services = {};
    s.rows.forEach(function (r) {
      var svc = svcOf(r.id); if (!svc) return;
      var cur = services[r.id], q = Math.max(1, +r.q || 1), qf = qtyField(svc), f = {};
      var prev = cur ? (+cur._q || 0) : 0;
      if (qf) f[qf.id] = String(prev + q);
      services[r.id] = { on: true, price: String(Math.round(((cur ? +cur.price : 0)) + q * (+r.p || 0))), fields: f, _q: prev + q };
    });
    Object.keys(services).forEach(function (k) { delete services[k]._q; });
    return { num: s.num, object: s.object, address: s.address, noAddress: !s.address, services: services };
  }
  function total(s) { return s.rows.reduce(function (a, r) { return a + (svcOf(r.id) ? Math.max(1, +r.q || 1) * (+r.p || 0) : 0); }, 0); }

  /* ---------- вкладки ---------- */
  D.render = function (box, t, name) {
    var s = st(t);
    if (!s.init) { s.init = true; s.object = name; }
    box.innerHTML = '<div class="cp-tabs">' + (aiOn() ? [["a", "ИИ"]] : []).concat([["c", "Клиент"], ["n", "Создать клиента"], ["k", "КП"]]).map(function (x) { return '<button data-t="' + x[0] + '" class="' + (s.tab === x[0] ? "on" : "") + '">' + x[1] + "</button>"; }).join("") + '</div><div class="cp-body" id="cpBody"></div>';
    box.querySelectorAll(".cp-tabs button").forEach(function (b) { b.onclick = function () { s.tab = b.dataset.t; D.render(box, t, name); }; });
    var body = $("cpBody");
    if (s.tab === "a") tabAi(body, t, name, s, box);
    else if (s.tab === "c") tabClient(body, t, name, s, box);
    else if (s.tab === "n") tabNew(body, t, name, s, box);
    else tabKp(body, t, name, s, box);
  };

  /* ---------- «ИИ»: подсказка YandexGPT по диалогу (мост: /api/crm/ai). Только подсказки — решает сотрудник ---------- */
  D.ai = null;                                                   // {configured, enabled} — узнаём один раз после входа
  function aiStatus() {
    if (!crm()) return;
    MPBC.call("/ai/status").then(function (r) { D.ai = r; }).catch(function () { D.ai = null; });
  }
  if (window.MPBC && MPBC.on) { MPBC.on("login", aiStatus); if (crm()) aiStatus(); }
  var URG = { high: "срочно", normal: "", low: "не срочно" };
  function tabAi(body, t, name, s, box) {
    var path = "/ai/thread/" + encodeURIComponent(t.id);
    function wait(txt) { body.innerHTML = '<div class="cp-empty">' + txt + "</div>"; }
    function err(e) { body.innerHTML = '<p class="cp-note" style="color:var(--bad)">' + E(e) + '</p><button class="x-btn ghost cp-w" id="aiRetry">Повторить</button>'; $("aiRetry").onclick = function () { tabAi(body, t, name, s, box); }; }
    function run() { wait("ИИ разбирает переписку…"); MPBC.call(path + "/triage", { body: {} }).then(function (r) { paint(r.triage); }).catch(err); }
    function paint(tr) {
      if (!$("cpBody") || $("cpBody") !== body) return;
      if (!tr) { body.innerHTML = '<p class="cp-note">Этот диалог ИИ ещё не разбирал. Новые входящие он разбирает сам через полминуты после письма.</p><button class="x-btn primary cp-w" id="aiRun">Разобрать сейчас</button>'; $("aiRun").onclick = run; return; }
      var d = tr.data || {}, f = [["Организация", d.org], ["Контакт", d.contact], ["Телефон", d.phone], ["Почта", d.email], ["ИНН", d.inn], ["Объект", d.object], ["Что нужно", d.need]].filter(function (x) { return x[1]; });
      body.innerHTML = '<div class="ai-head"><span class="x-pill ' + (d.kind === "spam" ? "" : "ok") + '">' + E(d.kind_label || d.kind) + "</span>" + (URG[d.urgency] ? ' <span class="x-pill' + (d.urgency === "high" ? " bad" : "") + '">' + URG[d.urgency] + "</span>" : "") + "</div>"
        + (tr.stale ? '<p class="cp-note">Пришли новые сообщения — <a href="#" id="aiRe">разобрать заново</a></p>' : "")
        + '<p class="ai-sum">' + E(d.summary) + "</p>"
        + (f.length ? '<div class="ai-facts">' + f.map(function (x) { return "<div><small>" + x[0] + "</small><b>" + E(x[1]) + "</b></div>"; }).join("") + "</div>" : "")
        + (d.auto_assigned ? '<div class="ai-route"><span>Передано автоматически: <b>' + E(d.auto_assigned) + "</b>" + (d.route_reason ? "<small>" + E(d.route_reason) + "</small>" : "") + "</span><span>✓</span></div>"
          : d.route_user_id ? '<div class="ai-route"><span>Передать: <b>' + E(d.route_to) + "</b>" + (d.route_reason ? "<small>" + E(d.route_reason) + "</small>" : "") + '</span><button class="x-btn ghost" id="aiAssign">Передать</button></div>' : "")
        + '<div class="cp-two" style="margin-top:10px">' + (d.kind !== "spam" ? '<button class="x-btn ghost cp-w" id="aiClient">Создать клиента</button>' : "") + '<button class="x-btn ghost cp-w" id="aiRe2">Разобрать заново</button></div>'
        + '<div class="ai-draft"><div class="cp-f"><label>Черновик ответа</label><input id="aiHint" placeholder="пожелание: например, предложить выезд на объект"></div>'
        + '<button class="x-btn primary cp-w" id="aiDraft">Предложить ответ</button><div id="aiOut"></div></div>'
        + '<p class="ai-foot">Подсказка ИИ (YandexGPT) — проверьте перед использованием. ИИ ничего не отправляет сам.</p>';
      [$("aiRe"), $("aiRe2")].forEach(function (b) { if (b) b.onclick = function (e) { e.preventDefault(); run(); }; });
      if ($("aiAssign")) $("aiAssign").onclick = function () {
        var b = this; b.disabled = true;
        MPBC.call("/mail/assign", { body: { thread_id: t.id, user_id: d.route_user_id, note: "по подсказке ИИ: " + (d.summary || "").slice(0, 200) } })
          .then(function () { U.toast("Диалог передан: " + d.route_to); b.textContent = "Передано ✓"; }).catch(function (e) { b.disabled = false; U.toast(String(e)); });
      };
      if ($("aiClient")) $("aiClient").onclick = function () {
        s.prefill = { cust: d.org || d.contact || name, contact: d.contact, phone: d.phone || d.email, obj: [d.object, d.need].filter(Boolean).join(" — ") };
        s.tab = "n"; D.render(box, t, name);
      };
      $("aiDraft").onclick = function () {
        var b = this; b.disabled = true; b.textContent = "Пишу черновик…";
        MPBC.call(path + "/draft", { body: { hint: $("aiHint").value } }).then(function (r) {
          b.disabled = false; b.textContent = "Предложить другой вариант";
          $("aiOut").innerHTML = '<textarea id="aiText" rows="8"></textarea><button class="x-btn primary cp-w" id="aiPut">Вставить в ответ</button>';
          $("aiText").value = r.text;
          $("aiPut").onclick = function () {
            var ta = $("chatText"); if (!ta) { U.toast("Поле ответа не найдено"); return; }
            ta.value = $("aiText").value; ta.dispatchEvent(new Event("input", { bubbles: true })); ta.focus();
            U.toast("Черновик вставлен — проверьте и отправьте");
          };
        }).catch(function (e) { b.disabled = false; b.textContent = "Предложить ответ"; $("aiOut").innerHTML = '<p class="cp-note" style="color:var(--bad)">' + E(e) + "</p>"; });
      };
    }
    if (!crm()) { wait("Войдите в CRM, чтобы видеть подсказки ИИ"); return; }
    wait("Загрузка…");
    MPBC.call(path).then(function (r) {
      if (!r.configured) { body.innerHTML = '<p class="cp-note">ИИ-помощник не подключён. Руководителю: ключ YandexGPT в настройках моста — см. «Автоматизация → ИИ-помощник».</p>'; return; }
      paint(r.triage);
    }).catch(function (e) { err(String(e).indexOf("требует обновления сервера") >= 0 ? "ИИ-помощник появится после обновления сервера моста" : e); });
  }

  function tabClient(body, t, name, s, box) {
    body.innerHTML = '<div class="cp-empty">Ищу в задачах и заявках…</div>';
    if (!window.MPBK || !MPBK.summary) { body.innerHTML = '<div class="cp-empty">Раздел «Клиенты» не загружен</div>'; return; }
    MPBK.summary(name, t.peer).then(function (r) {
      s.cl = r ? r.c : null;
      if (!$("cpBody") || $("cpBody") !== body) return;
      if (!r) {
        body.innerHTML = '<p class="cp-note">Клиента нет в задачах и заявках. Внесите данные справа, не закрывая диалог — карточка появится в разделе «Клиенты».</p><button class="x-btn primary cp-w" id="cpGoNew">Создать клиента</button>';
        $("cpGoNew").onclick = function () { s.tab = "n"; D.render(box, t, name); };
        return;
      }
      var c = r.c, h = '<a class="cp-card" data-go="#/clients/' + encodeURIComponent(c.key) + '"><span class="cp-av">' + E((c.name || "?").charAt(0)) + "</span><span><b>" + E(c.name) + "</b><small>" + c.open.length + " в работе · заявок: " + c.live.length + "</small></span></a>";
      c.open.slice(0, 3).forEach(function (x) { h += '<a class="cp-card" data-go="#/task/' + x.row + '"><span><b>' + E(x.workType || "Работа") + "</b><small>" + E(x.stage || "") + "</small></span></a>"; });
      c.live.slice(0, 2).forEach(function (x) { h += '<a class="cp-card" data-go="#/kpreg/lead/' + x.row + '"><span><b>' + E(x.object || "Заявка") + "</b><small>" + E(x.status || "") + (+x.amount ? " · " + money(+x.amount) : "") + "</small></span></a>"; });
      h += '<button class="x-btn primary cp-w" id="cpGoKp">Составить КП</button>';
      body.innerHTML = h;
      body.querySelectorAll("[data-go]").forEach(function (a) { a.onclick = function () { location.hash = a.getAttribute("data-go"); }; });
      $("cpGoKp").onclick = function () { s.tab = "k"; s.object = c.name; D.render(box, t, name); };
    });
  }

  function tabNew(body, t, name, s, box) {
    var pf = s.prefill || {}; s.prefill = null;                  // из подсказки ИИ («Создать клиента»)
    var me = (window.MPBC && MPBC.me && MPBC.me.name) || "", mail = /@/.test(t.peer || ""), funnels = ["Переписка"].concat((window.FUNNEL_SOURCES || []).filter(function (f) { return f !== "Переписка"; }));
    body.innerHTML = '<div class="cp-f"><label>Заказчик</label><input id="ncCust" value="' + E(pf.cust || name) + '"></div><div class="cp-f"><label>Контактное лицо</label><input id="ncContact" value="' + E(pf.contact || (mail ? "" : name)) + '"></div>'
      + '<div class="cp-f"><label>Телефон / почта</label><input id="ncPhone" value="' + E(pf.phone || t.peer || "") + '"></div><div class="cp-f"><label>Объект / что нужно</label><input id="ncObj" value="' + E(pf.obj || "") + '" placeholder="адрес или кратко: что хочет клиент"></div>'
      + '<div class="cp-f"><label>Откуда клиент</label><select id="ncFun">' + funnels.map(function (f) { return "<option>" + E(f) + "</option>"; }).join("") + '</select></div>'
      + '<div class="cp-f"><label>Ответственный</label><input id="ncOwn" value="' + E(me) + '"></div><div class="x-err" id="ncErr"></div><button class="x-btn primary cp-w" id="ncGo">Создать клиента</button>';
    $("ncGo").onclick = function () {
      var cust = $("ncCust").value.trim(); if (!cust) { $("ncErr").textContent = "Укажите заказчика"; return; }
      var d = new Date(), today = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2), go = $("ncGo");
      go.disabled = true; go.textContent = "Создаю…";
      callServer("api_kpregCreate", { date: today, customer: cust, funnel: $("ncFun").value, contact: $("ncContact").value.trim(), phoneEmail: $("ncPhone").value.trim(), object: $("ncObj").value.trim(), essence: "", amount: 0, status: "Новое обращение", owner: $("ncOwn").value.trim(), lastContact: today, comment: "Создано из переписки" })
        .then(function () {
          if (window.MPBK && MPBK.invalidate) MPBK.invalidate();
          s.object = cust; s.address = $("ncObj").value.trim(); s.tab = "k"; U.toast("Клиент «" + cust + "» создан — составьте КП");
          D.render(box, t, name);
        }).catch(function (e) { go.disabled = false; go.textContent = "Создать клиента"; $("ncErr").textContent = String(e); });
    };
  }

  function tabKp(body, t, name, s, box) {
    var kc = Kc();
    if (!kc) { body.innerHTML = '<div class="cp-empty">Конструктор КП ещё не загружен — обновите страницу</div>'; return; }
    if (!s.rows.length) s.rows.push({ id: kc.CATALOG[0].id, q: 1, p: unitPrice(kc.CATALOG[0]) });
    if (!s.num) suggestNum(s, function () { if ($("cpNum") && !$("cpNum").value) $("cpNum").value = s.num; });
    function draw() {
      var saved = toSaved(s), chk = null;
      try { chk = kc.checkSaved(saved); } catch (e) { chk = { ok: false, errors: [{ msg: String(e) }] }; }
      s.errors = chk.errors || [];
      body.innerHTML = '<div class="cp-two"><div class="cp-f"><label>№ предложения</label><input id="cpNum" inputmode="numeric" value="' + E(s.num) + '" placeholder="212"></div>'
        + '<div class="cp-f"><label>Объект (заказчик)</label><input id="cpObj" value="' + E(s.object) + '"></div></div><div class="cp-f"><label>Адрес объекта</label><input id="cpAddr" value="' + E(s.address) + '" placeholder="не указывать — оставьте пустым"></div>'
        + s.rows.map(function (r, i) {
          return '<div class="cp-row" data-i="' + i + '"><div class="cp-r1"><select data-f="id">' + kc.CATALOG.map(function (c) { return '<option value="' + c.id + '"' + (c.id === r.id ? " selected" : "") + ">" + E(c.title) + "</option>"; }).join("") + '</select>'
            + '<button data-del="' + i + '" title="Убрать строку">×</button></div>'
            + '<div class="cp-r2"><label>Кол-во<input data-f="q" type="number" min="1" value="' + r.q + '"></label><label>Цена за ед., ₽<input data-f="p" type="number" min="0" value="' + r.p + '"></label><span class="cp-sum">' + money(Math.max(1, +r.q || 1) * (+r.p || 0)) + "</span></div></div>";
        }).join("")
        + '<button class="x-btn ghost cp-w" id="cpAdd">+ Добавить строку</button>'
        + '<div class="cp-tot"><span>Итого</span><b>' + money(total(s)) + '</b></div>'
        + (s.errors.length ? '<ul class="cp-err">' + s.errors.slice(0, 4).map(function (e) { return "<li>" + E(e.msg) + "</li>"; }).join("") + (s.errors.length > 4 ? "<li>и ещё " + (s.errors.length - 4) + "…</li>" : "") + "</ul>" : '<p class="cp-ok">Всё заполнено — можно отправлять</p>')
        + '<div class="cp-acts"><button class="x-btn ghost" id="cpTpl">Шаблон…</button><button class="x-btn ghost" id="cpOpen">В конструктор</button></div>'
        + '<button class="x-btn primary cp-w" id="cpSend"' + (s.busy ? " disabled" : "") + ">" + (s.busy ? "Отправляю…" : "Отправить в чат (текст + PDF)") + "</button>"
        + '<p class="cp-hint">КП уйдёт сообщением и файлом PDF, а заявка клиента в реестре получит статус «КП отправлено».</p>';
      $("cpNum").oninput = function () { s.num = this.value; };
      $("cpObj").oninput = function () { s.object = this.value; };
      $("cpAddr").oninput = function () { s.address = this.value; };
      body.querySelectorAll(".cp-row").forEach(function (row) {
        var i = +row.dataset.i, r = s.rows[i];
        row.querySelectorAll("[data-f]").forEach(function (inp) {
          inp.onchange = function () {
            var f = inp.dataset.f;
            if (f === "id") { r.id = inp.value; r.p = unitPrice(svcOf(r.id)) || r.p; } else r[f] = +inp.value || 0;
            draw();
          };
        });
      });
      body.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { if (s.rows.length > 1) s.rows.splice(+b.dataset.del, 1); draw(); }; });
      $("cpAdd").onclick = function () { var c = kc.CATALOG[Math.min(1, kc.CATALOG.length - 1)]; s.rows.push({ id: c.id, q: 1, p: unitPrice(c) }); draw(); };
      $("cpOpen").onclick = function () { kc.load(toSaved(s)); location.hash = "#/kpc"; };
      $("cpTpl").onclick = function () {
        if (!window.MPBP || !MPBP.templateList) { U.toast("Модуль шаблонов не загружен"); return; }
        MPBP.templateList().then(function (l) {
          var v = U.xmodal('<h3>Шаблон КП</h3><p class="x-sub">Услуги шаблона заменят строки в панели</p>' + l.map(function (x, i) { return '<div class="cp-card" data-i="' + i + '"><span><b>' + E(x.name) + "</b><small>" + E(x.descr || "") + "</small></span></div>"; }).join("") + '<div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button></div>');
          v.querySelectorAll(".cp-card").forEach(function (c) {
            c.onclick = function () {
              var tpl = l[+c.dataset.i], ids = Object.keys(tpl.state.services || {}).filter(function (k) { return tpl.state.services[k].on && svcOf(k); });
              s.rows = ids.map(function (k) { return { id: k, q: 1, p: unitPrice(svcOf(k)) }; }); T.closeModal(); draw();
            };
          });
        });
      };
      $("cpSend").onclick = function () { sendKp(t, s, draw); };
    }
    draw();
  }

  function suggestNum(s, cb) {
    if (!crm()) return;
    MPBC.call("/kp/versions?limit=200").then(function (l) {
      var m = 0; l.forEach(function (x) { var n = parseInt(x.num, 10); if (n > m) m = n; });
      if (m && !s.num) { s.num = String(m + 1); cb(); }
    }).catch(function () {});
  }

  function b64(blob) {
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(",")[1]); }; fr.onerror = rej; fr.readAsDataURL(blob); });
  }
  function sendKp(t, s, redraw) {
    var kc = Kc(), saved = toSaved(s), chk = kc.checkSaved(saved);
    if (!chk.ok) { U.toast("Исправьте замечания к КП — они показаны под таблицей"); return; }
    var text = kc.textFor(saved);
    if (!confirm("Отправить КП в диалог «" + (t.title || t.peer) + "» (текст и PDF)?\n\n" + text.slice(0, 380) + (text.length > 380 ? "…" : ""))) return;
    s.busy = true; redraw();
    var info = { name: s.object, address: s.address, total: total(s), num: s.num, phone: t.peer || "", owner: (window.MPBC && MPBC.me && MPBC.me.name) || "" };
    kc.pdf(saved).then(function (pdf) { return b64(pdf.blob).then(function (data) { return window.__chatSendFile(t.id, text, pdf.name, data); }); })
      .then(function () {
        U.toast("КП отправлено в диалог: сообщение и PDF");
        var jobs = [];
        if (window.MPBK && MPBK.registerKp) jobs.push(MPBK.registerKp(info).then(function (r) { U.toast(r.created ? "Заявка создана в реестре КП" : "Заявка в реестре: статус «КП отправлено»"); }));
        if (crm() && info.num) jobs.push(MPBC.call("/kp/versions", { body: { num: String(info.num), object: info.name || "", total: info.total, state: saved, note: "Отправлено в чат: " + (t.title || t.peer), status: "sent" } }));
        return Promise.all(jobs.map(function (j) { return j.catch(function (e) { U.toast("Не удалось записать в реестр: " + e); }); }));
      })
      .catch(function (e) { U.toast("Не отправлено: " + e); })
      .then(function () { s.busy = false; redraw(); });
  }
})();
