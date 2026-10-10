/* МПБ CRM v2 — прайс-лист и версии коммерческих предложений.
   Прайс (#/price): цена по каждой услуге конструктора КП — фиксированная или «за единицу» (цена × количество из КП). Конструктор
   подсказывает цену по прайсу, но не навязывает её. Версии: «Сохранить версию» в конструкторе запоминает КП целиком (v1, v2…),
   их можно открыть, сравнить с текущим КП и отметить статус (черновик / отправлено / принято / отказ). Данные хранит мост. */
(function () {
  "use strict";
  var C = window.MPBC, T = window.MPBT, P = window.MPBP = {};
  var KEY = "mpb_price";
  var doc = { version: 0, items: {} };
  function lsGet() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function lsSet(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  var cached = lsGet(); if (cached && cached.items) doc = cached;
  function K() { return window.__kpc; }

  /* ---------- подсказка цены ---------- */
  function qtyOf(svc, st) {
    var n = 0;
    (svc.fields || []).forEach(function (f) {
      var v = st.fields && st.fields[f.id];
      if (f.type === "int") { var x = parseInt(v, 10); if (x > 0) n += x; }
      else if (f.type === "list" && Array.isArray(v)) v.forEach(function (it) { var q = parseInt(it.qty, 10); if (q > 0) n += q; });
    });
    return n;
  }
  function hasQty(svc) { return (svc.fields || []).some(function (f) { return f.type === "int" || f.type === "list"; }); }
  P.suggest = function (svc, st) {
    var it = doc.items[svc.id];
    if (!it || !it.price) return 0;
    if (it.mode === "unit") { var q = qtyOf(svc, st); return q > 0 ? it.price * q : 0; }
    return it.price;
  };
  P.note = function (id) { var it = doc.items[id]; return it && it.mode === "unit" ? "за ед. " + it.price.toLocaleString("ru-RU") + " ₽" + (it.note ? ", " + it.note : "") : (it && it.note) || ""; };
  P.load = function () {
    if (!C || !C.loggedIn || !C.loggedIn()) return Promise.resolve();
    return C.call("/price").then(function (d) { doc = d; lsSet(d); if (K()) K().refresh(); }).catch(function () {});
  };
  if (C) C.on("login", P.load);

  if (!C || !T || !T.util) return;
  var U = T.util, E = U.E, ic = U.ic;
  function $(id) { return document.getElementById(id); }
  function isAdmin() { return C.me && C.me.role === "admin"; }
  function money(n) { return Math.round(n || 0).toLocaleString("ru-RU") + " ₽"; }
  function dt(ts) { var d = new Date(ts * 1000); return d.toLocaleDateString("ru-RU") + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }); }
  var ST = { draft: ["Черновик", ""], sent: ["Отправлено", "blue"], accepted: ["Принято", "ok"], rejected: ["Отказ", "over"] };

  /* ====================================================== прайс ====================================================== */
  var G = { draft: null };
  function render() {
    var el = $("price-app"), sub = "Цены по услугам конструктора КП — конструктор подсказывает их при составлении предложения";
    if (!U.gate(el, "Прайс", sub, render)) return;
    if (!K()) { el.innerHTML = U.head("Прайс", sub) + '<div class="wrap"><div class="x-empty">Загрузка…</div></div>'; setTimeout(render, 400); return; }
    C.call("/price").then(function (d) { doc = d; lsSet(d); G.draft = JSON.parse(JSON.stringify(d.items)); paint(d); }).catch(function (e) { el.innerHTML = U.head("Прайс", sub) + '<div class="wrap"><div class="x-panel"><div class="x-empty">' + E(e) + "</div></div></div>"; });
  }
  function paint(d) {
    var el = $("price-app"), adm = isAdmin(), cat = K().CATALOG, dis = adm ? "" : " disabled";
    el.innerHTML = U.head("Прайс", "Цены по услугам конструктора КП — конструктор подсказывает их при составлении предложения", adm ? '<div class="x-row" style="margin:0"><button class="x-btn primary" id="prSave" disabled>Сохранено</button></div>' : "")
      + '<div class="wrap">' + (adm ? "" : '<div class="x-notif on" style="margin-bottom:16px"><span class="dot"></span><div><b>Только просмотр</b><small>Менять прайс может руководитель</small></div></div>')
      + '<div class="x-panel"><div class="sg-h"><h3>Услуги</h3><span class="x-sub" style="margin:0">' + (d.at ? "Обновлено " + dt(d.at) + (d.by ? " · " + E(d.by) : "") : "Прайс ещё не заполнен") + "</span></div>"
      + '<div class="pr-cols"><span>Услуга</span><span>Как считать</span><span>Цена, ₽</span><span>Примечание</span></div>'
      + cat.map(function (s) {
        var it = G.draft[s.id] || { price: 0, mode: "fixed", note: "" }, q = hasQty(s);
        return '<div class="pr-row" data-id="' + E(s.id) + '"><b>' + E(s.title) + '</b><select data-f="mode"' + dis + (q ? "" : " disabled") + '><option value="fixed"' + (it.mode !== "unit" ? " selected" : "") + '>Фиксированная</option><option value="unit"' + (it.mode === "unit" ? " selected" : "") + '>За единицу × количество</option></select>'
          + '<input data-f="price" type="text" inputmode="numeric" value="' + (it.price || "") + '" placeholder="0"' + dis + '><input data-f="note" type="text" maxlength="200" value="' + E(it.note || "") + '" placeholder="например: за дверь"' + dis + "></div>";
      }).join("") + "</div><p class=\"x-hint\">«За единицу» доступно там, где в КП указывается количество (двери, пожарные краны, ПК, оборудование): цена умножается на количество. Конструктор подставляет цену при выборе услуги и показывает подсказку, если она отличается от введённой.</p></div>";
    if (!adm) return;
    var btn = $("prSave");
    el.querySelectorAll(".pr-row").forEach(function (row) {
      row.querySelectorAll("[data-f]").forEach(function (f) {
        f.oninput = f.onchange = function () {
          var id = row.dataset.id, it = G.draft[id] = G.draft[id] || { price: 0, mode: "fixed", note: "" };
          if (f.dataset.f === "price") it.price = parseInt(String(f.value).replace(/\D/g, ""), 10) || 0; else it[f.dataset.f] = f.value;
          btn.disabled = false; btn.textContent = "Сохранить прайс";
        };
      });
    });
    btn.onclick = function () {
      var items = {}; Object.keys(G.draft).forEach(function (k) { var it = G.draft[k]; if (it.price || it.note) items[k] = it; });
      C.call("/price", { body: { items: items } }).then(function (r) { doc = r; lsSet(r); U.toast("Прайс сохранён"); render(); }).catch(function (e) { U.toast(E(e)); });
    };
  }
  P.render = render;

  /* ====================================================== версии КП ====================================================== */
  function snapshot() {
    var s = K().state;
    return JSON.parse(JSON.stringify({ num: s.num, date: s.date, object: s.object, address: s.address, noAddress: s.noAddress, deadline: s.deadline, services: s.services, custom: s.custom }));
  }
  function need() { if (!C.loggedIn || !C.loggedIn()) { U.toast("Войдите в «Личном кабинете» — версии хранятся на сервере"); return false; } return true; }
  P.saveVersion = function () {
    if (!need()) return;
    var s = K().state, num = String(s.num || "").trim();
    if (!num) { U.toast("Сначала укажите № предложения"); return; }
    var total = K().total();
    var v = U.xmodal('<h3>Сохранить версию КП № ' + E(num) + '</h3><p class="x-sub">' + E(s.object || "без названия") + " · итого " + money(total) + '</p><div class="x-field"><label>Что изменилось (необязательно)</label><input type="text" id="kvNote" maxlength="300" placeholder="Например: скидка 10%, добавили ТО дверей"></div>'
      + '<div class="x-field"><label>Статус</label><select id="kvSt">' + Object.keys(ST).map(function (k) { return '<option value="' + k + '">' + ST[k][0] + "</option>"; }).join("") + '</select></div><div class="x-err" id="kvErr"></div><div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button><button class="x-btn primary" id="kvGo">Сохранить</button></div>');
    $("kvGo").onclick = function () {
      C.call("/kp/versions", { body: { num: num, object: s.object || "", total: total, state: snapshot(), note: $("kvNote").value, status: $("kvSt").value } })
        .then(function (r) { T.closeModal(); U.toast("Сохранено: КП № " + num + ", версия " + r.version); }).catch(function (e) { $("kvErr").textContent = String(e); });
    };
  };

  /* сравнение двух состояний конструктора: список понятных изменений */
  function diff(a, b, cat) {
    var out = [];
    function p(x) { var n = parseInt(x, 10); return isNaN(n) ? 0 : n; }
    cat.forEach(function (s) {
      var x = (a.services || {})[s.id] || { on: false, price: "", fields: {} }, y = (b.services || {})[s.id] || { on: false, price: "", fields: {} };
      if (!x.on && y.on) out.push(["add", "Добавлена услуга «" + s.title + "» — " + money(p(y.price))]);
      else if (x.on && !y.on) out.push(["del", "Убрана услуга «" + s.title + "» (была " + money(p(x.price)) + ")"]);
      else if (x.on && y.on) {
        if (p(x.price) !== p(y.price)) out.push(["chg", "«" + s.title + "»: " + money(p(x.price)) + " → " + money(p(y.price))]);
        if (JSON.stringify(x.fields) !== JSON.stringify(y.fields)) out.push(["chg", "«" + s.title + "»: изменены параметры (количество, уточнения)"]);
      }
    });
    var ca = (a.custom && a.custom.on ? a.custom.items : []).filter(function (i) { return i.text; }), cb = (b.custom && b.custom.on ? b.custom.items : []).filter(function (i) { return i.text; });
    ca.forEach(function (i) { var m = cb.filter(function (j) { return j.text === i.text; })[0]; if (!m) out.push(["del", "Убрана своя позиция «" + i.text + "»"]); else if (p(m.price) !== p(i.price)) out.push(["chg", "«" + i.text + "»: " + money(p(i.price)) + " → " + money(p(m.price))]); });
    cb.forEach(function (j) { if (!ca.some(function (i) { return i.text === j.text; })) out.push(["add", "Добавлена своя позиция «" + j.text + "» — " + money(p(j.price))]); });
    var da = a.deadline && a.deadline.on ? a.deadline.days : "", db = b.deadline && b.deadline.on ? b.deadline.days : "";
    if (da !== db) out.push(["chg", "Срок выполнения: " + (da ? da + " раб. дн." : "не указан") + " → " + (db ? db + " раб. дн." : "не указан")]);
    if ((a.object || "") !== (b.object || "") || (a.address || "") !== (b.address || "")) out.push(["chg", "Изменены наименование объекта или адрес"]);
    return out;
  }
  function totalOf(st, cat) {
    var s = 0; cat.forEach(function (v) { var x = (st.services || {})[v.id]; if (x && x.on) s += parseInt(x.price, 10) || 0; });
    if (st.custom && st.custom.on) st.custom.items.forEach(function (i) { s += parseInt(i.price, 10) || 0; });
    return s;
  }
  function compareDlg(a, b, la, lb) {
    var cat = K().CATALOG, d = diff(a, b, cat), ta = totalOf(a, cat), tb = totalOf(b, cat), dl = tb - ta;
    U.xmodal("<h3>Что изменилось</h3><p class=\"x-sub\">" + E(la) + " → " + E(lb) + "</p>"
      + (d.map(function (x) { return '<div class="cmd"><span class="x-pill ' + (x[0] === "add" ? "ok" : x[0] === "del" ? "over" : "soon") + '">' + (x[0] === "add" ? "+" : x[0] === "del" ? "−" : "≈") + "</span><span>" + E(x[1]) + "</span></div>"; }).join("") || '<div class="x-empty">Различий в услугах и ценах нет</div>')
      + '<div class="x-hint">Итого: <b>' + money(ta) + "</b> → <b>" + money(tb) + "</b>" + (dl ? " (" + (dl > 0 ? "+" : "−") + money(Math.abs(dl)) + ")" : "") + '</div><div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Закрыть</button></div>', true);
  }

  function openIn(id) {
    C.call("/kp/versions/" + id).then(function (v) {
      if (!confirm("Открыть КП № " + v.num + ", версию " + v.version + " в конструкторе? Текущее содержимое конструктора будет заменено.")) return;
      T.closeModal(); location.hash = "#/kpc";
      setTimeout(function () { K().load(v.state); U.toast("Открыта версия " + v.version + " — после правок сохраните новую версию"); }, 150);
    }).catch(function (e) { U.toast(E(e)); });
  }
  function listHtml(rows) {
    return rows.map(function (r, i) {
      var prev = rows[i + 1], dlt = prev ? r.total - prev.total : 0;
      return '<div class="kv-row" data-id="' + r.id + '"><span class="kv-v">v' + r.version + '</span><div class="kv-m"><b>' + money(r.total) + (dlt ? ' <small style="color:' + (dlt > 0 ? "var(--bad)" : "var(--ok)") + '">' + (dlt > 0 ? "+" : "−") + money(Math.abs(dlt)) + "</small>" : "") + "</b><small>" + dt(r.ts) + " · " + E(r.author) + (r.note ? " · " + E(r.note) : "") + "</small></div>"
        + '<select data-st="' + r.id + '">' + Object.keys(ST).map(function (k) { return '<option value="' + k + '"' + (r.status === k ? " selected" : "") + ">" + ST[k][0] + "</option>"; }).join("") + "</select>"
        + '<button class="x-btn ghost" data-open="' + r.id + '" style="padding:6px 12px">Открыть</button>' + (prev ? '<button class="x-btn ghost" data-cmp="' + i + '" style="padding:6px 12px">Что изменилось</button>' : "") + "</div>";
    }).join("");
  }
  function showNum(num, back) {
    var body = $("kvBody"); body.innerHTML = '<div class="x-empty">Загрузка…</div>';
    C.call("/kp/versions?num=" + encodeURIComponent(num)).then(function (rows) {
      body.innerHTML = (back ? '<button class="x-btn ghost" id="kvBack" style="margin-bottom:10px;padding:6px 12px">← Все КП</button>' : "") + "<h3 style=\"margin:0 0 8px\">КП № " + E(num) + " · " + E(rows[0] ? rows[0].object : "") + "</h3>" + (listHtml(rows) || '<div class="x-empty">Версий нет</div>');
      var bk = $("kvBack"); if (bk) bk.onclick = function () { showAll(""); };
      body.querySelectorAll("[data-open]").forEach(function (b) { b.onclick = function () { openIn(b.dataset.open); }; });
      body.querySelectorAll("[data-st]").forEach(function (s) { s.onchange = function () { C.call("/kp/versions/" + s.dataset.st + "/status", { body: { status: s.value } }).then(function () { U.toast("Статус обновлён"); }).catch(function (e) { U.toast(E(e)); }); }; });
      body.querySelectorAll("[data-cmp]").forEach(function (b) {
        b.onclick = function () {
          var i = +b.dataset.cmp;
          Promise.all([C.call("/kp/versions/" + rows[i + 1].id), C.call("/kp/versions/" + rows[i].id)]).then(function (r) { compareDlg(r[0].state, r[1].state, "версия " + r[0].version, "версия " + r[1].version); }).catch(function (e) { U.toast(E(e)); });
        };
      });
      // сравнение с тем, что сейчас в конструкторе
      var cur = K().state;
      if (String(cur.num || "").trim() === String(num) && rows[0]) {
        var cb = document.createElement("button"); cb.className = "x-btn ghost"; cb.style.cssText = "margin-top:10px;padding:6px 12px"; cb.textContent = "Сравнить последнюю версию с текущим КП в конструкторе";
        cb.onclick = function () { C.call("/kp/versions/" + rows[0].id).then(function (r) { compareDlg(r.state, snapshot(), "версия " + r.version, "сейчас в конструкторе"); }); };
        body.appendChild(cb);
      }
    }).catch(function (e) { body.innerHTML = '<div class="x-empty">' + E(e) + "</div>"; });
  }
  function showAll(q) {
    var body = $("kvBody"); body.innerHTML = '<div class="x-empty">Загрузка…</div>';
    C.call("/kp/versions?q=" + encodeURIComponent(q || "")).then(function (rows) {
      body.innerHTML = rows.map(function (r) { return '<div class="kv-row" data-num="' + E(r.num) + '" style="cursor:pointer"><span class="kv-v">№' + E(r.num) + '</span><div class="kv-m"><b>' + E(r.object || "без названия") + "</b><small>" + r.versions + " верс. · " + dt(r.ts) + " · " + E(r.author) + '</small></div><span class="x-pill ' + (ST[r.status] || ["", ""])[1] + '">' + (ST[r.status] || [r.status])[0] + "</span><b>" + money(r.total) + "</b></div>"; }).join("") || '<div class="x-empty">Сохранённых КП пока нет</div>';
      body.querySelectorAll("[data-num]").forEach(function (r) { r.onclick = function () { showNum(r.dataset.num, true); }; });
    }).catch(function (e) { body.innerHTML = '<div class="x-empty">' + E(e) + "</div>"; });
  }
  P.versions = function () {
    if (!need()) return;
    var num = String(K().state.num || "").trim();
    U.xmodal('<h3>Версии КП</h3><p class="x-sub">Каждая сохранённая версия хранит КП целиком — её можно открыть и продолжить</p><div class="x-field"><input type="search" id="kvQ" placeholder="Поиск по номеру или заказчику…"></div><div id="kvBody" style="max-height:52vh;overflow:auto"></div><div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Закрыть</button></div>', true);
    $("kvQ").oninput = function () { showAll(this.value); };
    if (num) showNum(num, true); else showAll("");
  };

  if (U.cur() === "price") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render); else render();
  }
  C.on("login", function () { if (U.cur() === "price") render(); });
  C.on("logout", function () { if (U.cur() === "price") render(); });
})();
