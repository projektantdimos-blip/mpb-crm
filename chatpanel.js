/* Проекты DS — боковая панель диалога с заказчиком (переписка Telegram / MAX / почта):
   вкладка «Заказчик» (привязка диалога к заказчику, его задачи и КП) и вкладка «КП» (КП из диалога:
   услуги из прайс-листа, запись в реестр КП с датой выставления и отправка текста заказчику в этот же диалог).
   Данные только с моста (/api/ds); доступ у продаж, операционного менеджера и руководителя. */
(function () {
  "use strict";
  var D = window.MPBD = {};
  var per = {};                       // состояние по диалогам: { tab, kp: {object, pay, items}, link, err }
  var price = null;

  function $(id) { return document.getElementById(id); }
  function E(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function money(n) { return Math.round(n || 0).toLocaleString("ru-RU") + " ₽"; }
  function C() { return window.MPBC; }
  function api(path, body) { return C().call("/../ds" + path, body ? { body: body } : {}); }
  function toast(m) { if (window.MPBT && MPBT.toast) MPBT.toast(m); else if (window.toast) window.toast(m); }
  function st(t) { return per[t.id] || (per[t.id] = { tab: "c", err: "", busy: false, link: null, kp: null }); }

  var css = document.createElement("style");
  css.textContent = ".dsp .tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin:0 0 12px}.dsp .tabs button{padding:8px 12px;font-weight:700;color:var(--muted);border-bottom:3px solid transparent;background:none;border-top:0;border-left:0;border-right:0;cursor:pointer}.dsp .tabs button.on{color:var(--brand);border-color:var(--brand)}"
    + ".dsp .card{display:flex;gap:10px;align-items:center;padding:9px 11px;border:1px solid var(--line);border-radius:12px;margin-bottom:8px;background:var(--surface-2,var(--surface));font-size:.88rem;cursor:pointer;text-decoration:none;color:inherit}.dsp .card small{display:block;color:var(--muted)}"
    + ".dsp .f{margin-bottom:10px}.dsp .f label{display:block;font-size:.7rem;font-weight:700;text-transform:uppercase;color:var(--muted);margin-bottom:4px}.dsp .f input,.dsp .f select{width:100%;border:1px solid var(--line);border-radius:10px;padding:8px 10px;background:var(--surface);color:var(--ink)}"
    + ".dsp .sv{display:flex;gap:8px;align-items:center;padding:6px 8px;border:1px solid var(--line);border-radius:10px;margin-bottom:6px;font-size:.84rem}.dsp .sv.on{border-color:var(--brand-2);background:var(--brand-soft)}.dsp .sv span{flex:1}.dsp .sv input[type=number]{width:96px;border:1px solid var(--line);border-radius:8px;padding:4px 6px;background:var(--surface);color:var(--ink)}"
    + ".dsp .err{color:var(--bad);font-weight:600;margin:6px 0;font-size:.84rem}.dsp .tot{padding:10px 12px;border-radius:12px;background:var(--surface-2,var(--surface));border:1px solid var(--line);margin:8px 0}.dsp .note{font-size:.8rem;color:var(--muted);margin:6px 0}";
  document.head.appendChild(css);

  D.render = function (box, t, name) {
    var s = st(t);
    if (!C() || !MPBC.loggedIn()) { box.innerHTML = '<div class="dsp"><p class="note">Войдите, чтобы работать с заказчиком.</p></div>'; return; }
    box.innerHTML = '<div class="dsp"><div class="tabs">' + [["c", "Заказчик"], ["k", "КП из диалога"]].map(function (x) { return '<button data-t="' + x[0] + '" class="' + (s.tab === x[0] ? "on" : "") + '">' + x[1] + "</button>"; }).join("") + '</div><div id="dspBody"></div></div>';
    box.querySelectorAll(".tabs button").forEach(function (b) { b.onclick = function () { s.tab = b.dataset.t; s.err = ""; D.render(box, t, name); }; });
    var body = $("dspBody");
    body.innerHTML = '<p class="note">Загрузка…</p>';
    api("/threads/" + encodeURIComponent(t.id) + "/link?title=" + encodeURIComponent(name || "") + "&peer=" + encodeURIComponent(t.peer || "")).then(function (l) {
      s.link = l;
      if (s.tab === "k") tabKp(body, t, name, s, box); else tabCustomer(body, t, name, s, box);
    }, function (e) { body.innerHTML = '<p class="err">' + E(e) + "</p>"; });
  };

  function again(box, t, name) { D.render(box, t, name); }

  function tabCustomer(body, t, name, s, box) {
    var l = s.link, h = "";
    if (l.customer) {
      var c = l.customer;
      if (l.auto) h += '<p class="note">Диалог привязан автоматически: ' + E(l.auto) + ".</p>";
      h += '<div class="card" style="cursor:default"><span><b>' + E(c.name) + "</b> " + (c.regular ? "· постоянный" : "") + "<small>" + (c.contacts || []).map(function (x) { return E((x.fio || "") + (x.phone ? " " + x.phone : "") + (x.email ? " " + x.email : "")); }).join("; ") + "</small></span></div>";
      if (c.comment) h += '<p class="note">📝 ' + E(c.comment) + "</p>";
      h += '<div class="note">Задачи заказчика</div>' + (l.orders.map(function (o) { return '<a class="card" href="#/task/' + o.id + '"><span><b>№' + E(o.number) + " · " + E(o.object) + "</b><small>" + E(o.stage) + (o.left_days != null ? " · " + (o.left_days < 0 ? "просрочено" : "осталось") + " " + Math.abs(o.left_days) + " дн." : "") + "</small></span></a>"; }).join("") || '<p class="note">Задач пока нет</p>');
      h += '<div class="note">КП</div>' + (l.kp.map(function (k) { return '<a class="card" href="#/kpreg/"><span><b>' + E(k.number) + " · " + money(k.amount) + "</b><small>" + E(k.status) + " · " + E(k.object) + "</small></span></a>"; }).join("") || '<p class="note">КП пока нет</p>');
      h += '<button class="x-btn ghost" id="dspUnlink" style="width:100%;justify-content:center">Отвязать диалог</button>';
      body.innerHTML = h;
      $("dspUnlink").onclick = function () { api("/threads/" + encodeURIComponent(t.id) + "/link", { customer_id: 0 }).then(function () { again(box, t, name); }, function (e) { toast(String(e)); }); };
      return;
    }
    if (l.suggestions.length) {
      h += '<div class="note">Возможно, это:</div>' + l.suggestions.map(function (x) { return '<div class="card" data-id="' + x.id + '"><span><b>' + E(x.name) + "</b><small>Привязать диалог" + (x.why ? " · совпало: " + E(x.why) : "") + "</small></span></div>"; }).join("");
    }
    h += '<div class="note">Или создать заказчика:</div>'
      + '<div class="f"><label>Наименование компании</label><input id="dspName" value="' + E(name || "") + '"></div>'
      + '<div class="f"><label>Контактное лицо (ФИО)</label><input id="dspFio" value="' + E(name || "") + '"></div>'
      + '<div class="f"><label>Телефон</label><input id="dspPhone" value="' + E(/^[+\d\s()-]{6,}$/.test(t.peer || "") ? t.peer : "") + '"></div>'
      + '<div class="f"><label>E-mail</label><input id="dspMail" value="' + E(/@/.test(t.peer || "") ? t.peer : "") + '"></div>'
      + (s.err ? '<div class="err">' + E(s.err) + "</div>" : "")
      + '<button class="x-btn primary" id="dspCreate" style="width:100%;justify-content:center">Создать заказчика и привязать</button>';
    body.innerHTML = h;
    body.querySelectorAll("[data-id]").forEach(function (n) {
      n.onclick = function () { api("/threads/" + encodeURIComponent(t.id) + "/link", { customer_id: +n.dataset.id }).then(function () { again(box, t, name); }, function (e) { s.err = String(e); again(box, t, name); }); };
    });
    $("dspCreate").onclick = function () {
      var nm = $("dspName").value.trim();
      if (!nm) { s.err = "Укажите наименование компании"; return again(box, t, name); }
      api("/threads/" + encodeURIComponent(t.id) + "/customer", { name: nm, fio: $("dspFio").value.trim(), phone: $("dspPhone").value.trim(), email: $("dspMail").value.trim() })
        .then(function () { s.err = ""; again(box, t, name); }, function (e) { s.err = String(e); again(box, t, name); });
    };
  }

  function tabKp(body, t, name, s, box) {
    if (!s.link.customer) {
      body.innerHTML = '<p class="note">Сначала привяжите диалог к заказчику на вкладке «Заказчик».</p><button class="x-btn ghost" id="dspGo" style="width:100%;justify-content:center">К заказчику</button>';
      $("dspGo").onclick = function () { s.tab = "c"; again(box, t, name); };
      return;
    }
    function draw() {
      var k = s.kp, total = k.items.reduce(function (a, i) { return a + (i.on ? (+i.price || 0) : 0); }, 0);
      var pct = k.pay === "adv50" ? 0.5 : k.pay === "adv30" ? 0.3 : 0, adv = Math.round(total * pct);
      body.innerHTML = '<p class="note">КП для «' + E(s.link.customer.name) + '». Попадёт в реестр КП, а текст появится в окне ответа: вы проверите его и отправите сами.</p>'
        + '<div class="f"><label>Объект</label><input id="dspObj" value="' + E(k.object) + '"></div>'
        + k.items.map(function (i, idx) { return '<div class="sv ' + (i.on ? "on" : "") + '"><input type="checkbox" data-sv="' + idx + '" ' + (i.on ? "checked" : "") + "><span>" + E(i.name) + '</span><input type="number" min="0" data-sp="' + idx + '" value="' + (+i.price || 0) + '"></div>'; }).join("")
        + '<div class="f" style="margin-top:8px"><label>Оплата</label><select id="dspPay">' + [["adv50", "Аванс 50%, остаток по акту"], ["adv30", "Аванс 30%, остаток по акту"], ["post100", "100% по акту"]].map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === k.pay ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + "</select></div>"
        + '<div class="tot"><b id="dspTot">' + money(total) + "</b>" + (adv ? "<div>Аванс " + money(adv) + ", остаток " + money(total - adv) + "</div>" : "<div>Без аванса, оплата по акту</div>") + "</div>"
        + '<label class="note" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="dspPdf" ' + (k.pdf === false ? "" : "checked") + '> Приложить КП файлом PDF (Telegram и почта; в MAX уйдёт текст)</label>'
        + (s.err ? '<div class="err">' + E(s.err) + "</div>" : "")
        + '<button class="x-btn primary" id="dspSend" style="width:100%;justify-content:center"' + (s.busy ? " disabled" : "") + ">Подготовить КП и вставить в окно ответа</button>";
      $("dspPdf").onchange = function () { k.pdf = this.checked; };
      $("dspObj").oninput = function () { k.object = this.value; };
      $("dspPay").onchange = function () { k.pay = this.value; draw(); };
      body.querySelectorAll("[data-sv]").forEach(function (cb) { cb.onchange = function () { k.items[+cb.dataset.sv].on = cb.checked; draw(); }; });
      body.querySelectorAll("[data-sp]").forEach(function (inp) { inp.oninput = function () { k.items[+inp.dataset.sp].price = +inp.value || 0; var tt = $("dspTot"); if (tt) tt.textContent = money(k.items.reduce(function (a, i) { return a + (i.on ? (+i.price || 0) : 0); }, 0)); }; });
      $("dspSend").onclick = send;
    }
    function send() {
      var k = s.kp, items = k.items.filter(function (i) { return i.on && +i.price > 0; }).map(function (i) { return { name: i.name, price: +i.price }; });
      if (!items.length) { s.err = "Отметьте хотя бы одну услугу с ценой"; return draw(); }
      s.busy = true; s.err = ""; draw();
      api("/threads/" + encodeURIComponent(t.id) + "/kp", { object: k.object, services: items, pay: k.pay, send: false }).then(function (r) {
        var withPdf = s.kp.pdf !== false;
        var fileP = withPdf ? C().blob("/ds/kp/" + r.id + "/doc?kind=kp&fmt=pdf").then(function (f) { return new File([f.blob], f.name, { type: "application/pdf" }); }, function () { return null; }) : Promise.resolve(null);
        return fileP.then(function (file) {
          s.busy = false; s.kp = null; s.tab = "c";
          if (window.__chatDraft) window.__chatDraft(r.text, file, r.id);
          toast("КП " + r.number + " готово: проверьте текст в окне ответа и нажмите «Отправить»");
          again(box, t, name);
        });
      }, function (e) { s.busy = false; s.err = String(e); draw(); });
    }
    if (s.kp) { draw(); return; }
    var load = price ? Promise.resolve(price) : api("/price").then(function (p) { price = p.items.filter(function (i) { return i.active; }); return price; });
    load.then(function (items) {
      s.kp = { object: "", pay: "adv50", items: items.map(function (i) { return { name: i.name, price: i.price, on: false }; }) };
      draw();
    }, function (e) { body.innerHTML = '<p class="err">' + E(e) + "</p>"; });
  }
})();
