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
  function st(t) { return per[t.id] || (per[t.id] = { tab: "c", rows: [], num: "", object: "", address: "", init: false, errors: [], busy: false, cl: undefined }); }
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
    box.innerHTML = '<div class="cp-tabs">' + [["c", "Клиент"], ["n", "Создать клиента"], ["k", "КП"]].map(function (x) { return '<button data-t="' + x[0] + '" class="' + (s.tab === x[0] ? "on" : "") + '">' + x[1] + "</button>"; }).join("") + '</div><div class="cp-body" id="cpBody"></div>';
    box.querySelectorAll(".cp-tabs button").forEach(function (b) { b.onclick = function () { s.tab = b.dataset.t; D.render(box, t, name); }; });
    var body = $("cpBody");
    if (s.tab === "c") tabClient(body, t, name, s, box);
    else if (s.tab === "n") tabNew(body, t, name, s, box);
    else tabKp(body, t, name, s, box);
  };

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
    var me = (window.MPBC && MPBC.me && MPBC.me.name) || "", mail = /@/.test(t.peer || ""), funnels = (window.FUNNEL_SOURCES && FUNNEL_SOURCES.length) ? FUNNEL_SOURCES : ["Переписка"];
    body.innerHTML = '<div class="cp-f"><label>Заказчик</label><input id="ncCust" value="' + E(name) + '"></div><div class="cp-f"><label>Контактное лицо</label><input id="ncContact" value="' + E(mail ? "" : name) + '"></div>'
      + '<div class="cp-f"><label>Телефон / почта</label><input id="ncPhone" value="' + E(t.peer || "") + '"></div><div class="cp-f"><label>Объект / что нужно</label><input id="ncObj" placeholder="адрес или кратко: что хочет клиент"></div>'
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
        + '<div class="cp-cols"><span>Услуга</span><span>Кол-во</span><span>Цена, ₽</span><span></span></div>'
        + s.rows.map(function (r, i) {
          return '<div class="cp-row" data-i="' + i + '"><select data-f="id">' + kc.CATALOG.map(function (c) { return '<option value="' + c.id + '"' + (c.id === r.id ? " selected" : "") + ">" + E(c.title) + "</option>"; }).join("") + '</select>'
            + '<input data-f="q" type="number" min="1" value="' + r.q + '"><input data-f="p" type="number" min="0" value="' + r.p + '"><button data-del="' + i + '" title="Убрать строку">×</button></div>';
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
        return Promise.all(jobs.map(function (j) { return j.catch(function (e) { U.toast("Не удалось записать в реестр: " + E(e)); }); }));
      })
      .catch(function (e) { U.toast("Не отправлено: " + E(e)); })
      .then(function () { s.busy = false; redraw(); });
  }
})();
