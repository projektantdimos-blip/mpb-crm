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
  var G = { draft: null, tab: "price" };
  function render() {
    var el = $("price-app"), sub = "Цены по услугам конструктора КП — конструктор подсказывает их при составлении предложения";
    if (!U.gate(el, "Прайс", sub, render)) return;
    if (!K()) { el.innerHTML = U.head("Прайс", sub) + '<div class="wrap"><div class="x-empty">Загрузка…</div></div>'; setTimeout(render, 400); return; }
    C.call("/price").then(function (d) { doc = d; lsSet(d); G.draft = JSON.parse(JSON.stringify(d.items)); if (G.tab !== "price") paintTpl(); else paint(d); }).catch(function (e) { el.innerHTML = U.head("Прайс", sub) + '<div class="wrap"><div class="x-panel"><div class="x-empty">' + E(e) + "</div></div></div>"; });
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
    el.querySelector(".wrap").insertAdjacentHTML("afterbegin", tabsHtml()); bindTabs(el);
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

  /* ---------- отправить КП в чат ---------- */
  function kpText() {
    var m = K().model(), nb = /\u00a0/g;
    var lines = ["Коммерческое предложение № " + m.num + " от " + m.date, "Объект: " + m.object];
    if (m.address) lines.push(m.address);
    lines.push("");
    m.rows.forEach(function (r, i) { lines.push((i + 1) + ". " + r.lines.join(" ") + " — " + r.priceLines.join(" / ")); });
    lines.push("", "Итого: " + m.total + " (НДС не облагается, АУСН)", "");
    m.note.forEach(function (n) { lines.push(n); });
    return lines.join("\n").replace(nb, " ");
  }
  function doSend(th) {
    var text = kpText(), res = K().check();
    if (!res.ok && !confirm("В КП есть незаполненные или неверные поля (" + res.errors.length + "). Отправить всё равно?")) return;
    if (!confirm("Отправить КП в диалог «" + (th.title || th.id) + "»?\n\n" + text.slice(0, 400) + (text.length > 400 ? "…" : ""))) return;
    window.__chatSend(th.id, text).then(function () {
      T.closeModal(); U.toast("КП отправлено в диалог «" + (th.title || th.id) + "»");
      var s = K().state, num = String(s.num || "").trim();
      if (num && C.loggedIn && C.loggedIn()) C.call("/kp/versions", { body: { num: num, object: s.object || "", total: K().total(), state: snapshot(), note: "Отправлено в чат: " + (th.title || th.id), status: "sent" } }).then(function (r) { U.toast("Версия " + r.version + " сохранена со статусом «Отправлено»"); }).catch(function () {});
    }).catch(function (e) { U.toast("Не отправлено: " + E(e)); });
  }
  P.sendToChat = function () {
    if (!window.__chatSend) { U.toast("Чат не загружен — обновите страницу"); return; }
    if (P.thread) { doSend(P.thread); return; }
    var all = window.__chatThreads ? window.__chatThreads() : [];
    if (!all.length) { U.toast("Нет диалогов: откройте «Переписку» и убедитесь, что мост подключён"); return; }
    var v = U.xmodal('<h3>Отправить КП в чат</h3><p class="x-sub">Выберите диалог. КП уйдёт текстом сообщения: услуги, цены и итог</p><div class="x-field"><input id="scQ" placeholder="Поиск по имени…"></div><div id="scList" style="max-height:46vh;overflow:auto"></div><div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button></div>', true);
    function draw() {
      var q = ($("scQ").value || "").toLowerCase();
      $("scList").innerHTML = all.filter(function (t) { return !q || (t.title || t.peer || "").toLowerCase().indexOf(q) >= 0; }).slice(0, 40).map(function (t, i) { return '<div class="cl-row" data-id="' + E(t.id) + '" style="padding:9px 0"><div class="cl-main"><b>' + E(t.title || t.peer) + "</b><small>" + E(t.channel || "") + " · " + E(t.peer || "") + "</small></div></div>"; }).join("") || '<div class="x-empty">Ничего не найдено</div>';
      $("scList").querySelectorAll(".cl-row").forEach(function (r) { r.onclick = function () { var th = all.filter(function (t) { return t.id === r.dataset.id; })[0]; doSend(th); }; });
    }
    $("scQ").oninput = draw; draw();
  };
  /* ====================================================== шаблоны КП и договоров ====================================================== */
  var TPL = null;
  function loadTpl(force) {
    if (TPL && !force) return Promise.resolve(TPL);
    return C.call("/templates").then(function (d) { TPL = d; return d; });
  }
  function svcTitle(id) { var s = K().CATALOG.filter(function (x) { return x.id === id; })[0]; return s ? s.title : id; }
  function saveTpl(patch) {
    return C.call("/templates", { body: { kp: patch.kp || TPL.kp, contracts: patch.contracts || TPL.contracts } }).then(function (d) { TPL = d; return d; });
  }
  P.templateList = function () { return loadTpl(false).then(function (d) { return d.kp; }); };
  P.thread = null;                                                // диалог, из которого начали готовить КП (для «Отправить в чат»)
  P.prepareKp = function (hdr, t, thread) {                      // КП для клиента: объект и адрес подставляем, услуги — по шаблону или пустое
    P.thread = thread || null;
    if (t) return P.useTemplate(t, hdr);
    T.closeModal(); location.hash = "#/kpc";
    setTimeout(function () { K().load({ object: hdr.object, address: hdr.address || "", services: {} }); U.toast("КП для «" + hdr.object + "»: отметьте услуги и укажите № предложения"); }, 150);
  };
  P.useTemplate = function (t, hdr) {
    var saved = hdr ? { object: hdr.object, address: hdr.address || "" } : snapshot();
    saved.services = JSON.parse(JSON.stringify(t.state.services || {}));
    if (t.state.deadline) saved.deadline = t.state.deadline;
    if (t.state.custom) saved.custom = t.state.custom;
    K().CATALOG.forEach(function (s) {
      var x = saved.services[s.id];
      if (x && x.on && !x.price) { var sg = P.suggest(s, { fields: x.fields || {} }); if (sg) x.price = String(sg); }
    });
    T.closeModal();
    location.hash = "#/kpc";
    setTimeout(function () { K().load(saved); U.toast("Шаблон «" + t.name + "» применён" + (hdr ? " для «" + hdr.object + "»" : "") + " — укажите № предложения, объёмы и цены"); }, 150);
  };
  function kpTplCards(withDel) {
    return '<div class="tpl-grid">' + (TPL.kp.map(function (t, i) {
      var ids = Object.keys(t.state.services || {}).filter(function (k) { return t.state.services[k].on; });
      return '<div class="tpl-card"><div style="display:flex;gap:10px;align-items:center"><span class="tpl-ic">' + ic("file") + '</span><div><b>' + E(t.name) + "</b><small>" + E(t.descr || "") + "</small></div></div><ul>"
        + ids.map(function (k) { return "<li>" + E(svcTitle(k)) + "</li>"; }).join("") + '</ul><div class="tpl-act"><button class="x-btn primary" data-use="' + i + '" style="padding:7px 14px">Использовать</button>'
        + (withDel && isAdmin() ? '<button class="x-btn ghost" data-del="' + i + '" style="padding:7px 12px;color:var(--bad)">Удалить</button>' : "") + "</div></div>";
    }).join("") || '<div class="x-empty" style="grid-column:1/-1">Шаблонов пока нет</div>') + "</div>";
  }
  function bindKp(root) {
    root.querySelectorAll("[data-use]").forEach(function (b) { b.onclick = function () { P.useTemplate(TPL.kp[+b.dataset.use]); }; });
    root.querySelectorAll("[data-del]").forEach(function (b) {
      b.onclick = function () {
        var t = TPL.kp[+b.dataset.del]; if (!confirm("Удалить шаблон «" + t.name + "»?")) return;
        saveTpl({ kp: TPL.kp.filter(function (x) { return x !== t; }) }).then(function () { U.toast("Шаблон удалён"); render(); }).catch(function (e) { U.toast(E(e)); });
      };
    });
  }
  /* окно «Шаблоны» из конструктора КП */
  P.templates = function () {
    if (!need()) return;
    loadTpl(true).then(function () {
      var v = U.xmodal('<h3>Шаблоны КП</h3><p class="x-sub">Готовый набор услуг: выберите — и конструктор заполнится, останется указать объёмы</p><div style="max-height:56vh;overflow:auto">' + kpTplCards(true) + "</div>"
        + '<div class="x-row">' + (isAdmin() ? '<button class="x-btn ghost" id="tpSaveCur" style="margin-right:auto">Сохранить текущее КП как шаблон</button>' : "") + '<button class="x-btn ghost" onclick="MPBT.closeModal()">Закрыть</button></div>', true);
      bindKp(v);
      var sc = $("tpSaveCur");
      if (sc) sc.onclick = function () {
        var cur = snapshot(), on = Object.keys(cur.services).filter(function (k) { return cur.services[k].on; });
        if (!on.length) { U.toast("Сначала отметьте услуги в конструкторе"); return; }
        var name = prompt("Название шаблона:", ""); if (!name) return;
        var st = { services: {}, deadline: cur.deadline };
        on.forEach(function (k) { st.services[k] = { on: true, fields: cur.services[k].fields }; });
        var kp = TPL.kp.concat([{ id: "", name: name, descr: "Сохранено из конструктора", state: st }]);
        saveTpl({ kp: kp }).then(function () { U.toast("Шаблон «" + name + "» сохранён"); P.templates(); }).catch(function (e) { U.toast(E(e)); });
      };
    }).catch(function (e) { U.toast(E(e)); });
  };

  /* ---------- договор по шаблону ---------- */
  var PAYS = ["Предоплата 50%, остаток — после подписания акта", "Предоплата 100% до начала работ", "Оплата по акту в течение 5 рабочих дней"];
  function money0(n) { return Math.round(n || 0).toLocaleString("ru-RU") + " ₽"; }
  function ctHtml(t, f) {
    var body = t.body.replace(/\{object\}/g, f.object || "—").replace(/\{sum\}/g, money0(+f.sum)).replace(/\{days\}/g, f.days || "—").replace(/\{pay\}/g, f.pay).replace(/\{client\}/g, f.client || "—").replace(/\{num\}/g, f.num).replace(/\{date\}/g, f.date);
    return '<div class="ct-paper"><div class="ct-h"><img src="bear.png" alt=""><div><b>МПБ</b><small>Полный спектр защиты</small></div><div class="ct-r">г. Санкт-Петербург<br>' + E(f.date) + "</div></div>"
      + "<h2>ДОГОВОР " + E(f.num) + '</h2><div class="ct-t">' + E(t.type || t.name) + "</div>"
      + '<div class="ct-meta"><span>Заказчик</span><b>' + E(f.client || "—") + "</b><span>Объект</span><b>" + E(f.object || "—") + "</b><span>Стоимость</span><b>" + money0(+f.sum) + "</b></div>"
      + body.split("\n").map(function (p) { return "<p>" + E(p) + "</p>"; }).join("")
      + '<div class="ct-sign"><span>Исполнитель ____________</span><span>Заказчик ____________</span></div><p class="ct-note">Образец договора. Перед подписанием согласуйте текст с руководителем или юристом.</p></div>';
  }
  var CT_CSS = "body{font-family:Arial,sans-serif;font-size:13pt;color:#111;margin:30px 40px}.ct-h{display:flex;gap:14px;align-items:center;border-bottom:2px solid #1f5c99;padding-bottom:10px}.ct-h img{height:60px}.ct-h small{display:block;color:#555}.ct-r{margin-left:auto;text-align:right;font-size:11pt}h2{text-align:center;margin:18px 0 2px}.ct-t{text-align:center;color:#555;margin-bottom:14px}.ct-meta{display:grid;grid-template-columns:140px 1fr;gap:4px 12px;margin-bottom:14px}.ct-meta span{color:#555}p{line-height:1.45;margin:8px 0}.ct-sign{display:flex;justify-content:space-between;margin-top:46px}.ct-note{color:#888;font-size:10pt;margin-top:30px}";
  P.makeContract = function (t) {
    var d = new Date(), f = { num: "№ ", date: d.toLocaleDateString("ru-RU"), client: "", object: "", sum: "", days: "30", pay: PAYS[0] };
    function open(names) {
      var v = U.xmodal('<h3>Договор: ' + E(t.name) + '</h3><p class="x-sub">Заполните поля — справа договор формируется сразу</p><div class="ct-form"><div><div class="x-field"><label>Номер договора</label><input id="ctNum" value="' + E(f.num) + '" placeholder="№ 129/26"></div>'
        + '<div class="x-field"><label>Заказчик</label><input id="ctCl" list="ctCls" value="' + E(f.client) + '"><datalist id="ctCls">' + names.map(function (n) { return '<option value="' + E(n) + '">'; }).join("") + '</datalist></div>'
        + '<div class="x-field"><label>Объект</label><input id="ctObj" value="' + E(f.object) + '" placeholder="адрес или название объекта"></div>'
        + '<div class="x-field"><label>Стоимость, ₽</label><input id="ctSum" inputmode="numeric" value="' + E(f.sum) + '"></div><div class="x-field"><label>Срок, календарных дней</label><input id="ctDays" inputmode="numeric" value="' + E(f.days) + '"></div>'
        + '<div class="x-field"><label>Порядок оплаты</label><select id="ctPay">' + PAYS.map(function (p) { return "<option" + (p === f.pay ? " selected" : "") + ">" + E(p) + "</option>"; }).join("") + "</select></div></div>"
        + '<div id="ctPrev" class="ct-prev"></div></div><div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Закрыть</button><button class="x-btn ghost" id="ctPrint">Печать</button><button class="x-btn primary" id="ctDoc">Скачать .doc</button></div>', true);
      v.querySelector(".x-modal").style.width = "min(980px,100%)";
      function upd() {
        f.num = $("ctNum").value; f.client = $("ctCl").value; f.object = $("ctObj").value; f.sum = $("ctSum").value.replace(/\D/g, ""); f.days = $("ctDays").value.replace(/\D/g, ""); f.pay = $("ctPay").value;
        $("ctPrev").innerHTML = ctHtml(t, f);
      }
      ["ctNum", "ctCl", "ctObj", "ctSum", "ctDays", "ctPay"].forEach(function (id) { $(id).oninput = $(id).onchange = upd; });
      upd();
      $("ctPrint").onclick = function () { var w = window.open("", "_blank"); if (!w) { U.toast("Разрешите всплывающие окна для печати"); return; } w.document.write("<html><head><meta charset=utf-8><title>Договор</title><style>" + CT_CSS + "</style></head><body>" + ctHtml(t, f) + "</body></html>"); w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 300); };
      $("ctDoc").onclick = function () {
        var html = "<html><head><meta charset=utf-8><style>" + CT_CSS.replace(/display:flex;|display:grid;/g, "") + "</style></head><body>" + ctHtml(t, f).replace(/<img[^>]*>/, "") + "</body></html>";
        var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿", html], { type: "application/msword" }));
        a.download = "Договор " + (f.num.replace(/[^\wА-Яа-я№.\-]+/g, " ").trim() || "МПБ") + ".doc"; document.body.appendChild(a); a.click(); a.remove();
      };
    }
    var names = [];
    (window.callServer ? callServer("api_listTasks") : Promise.resolve([])).then(function (ts) { ts.forEach(function (x) { if (x.customer && names.indexOf(x.customer) < 0) names.push(x.customer); }); }).catch(function () {}).then(function () { open(names); });
  };
  function editCt(i) {
    var t = i >= 0 ? TPL.contracts[i] : { id: "", name: "", type: "", body: "1. Предмет договора. …\n2. Стоимость и порядок расчётов. Стоимость работ составляет {sum}. {pay}.\n3. Сроки. {days} календарных дней." };
    var v = U.xmodal('<h3>' + (i >= 0 ? "Шаблон договора" : "Новый шаблон договора") + '</h3><p class="x-sub">В тексте можно использовать: {client} {object} {sum} {days} {pay} {num} {date}</p><div class="x-field"><label>Название</label><input id="etName" value="' + E(t.name) + '"></div><div class="x-field"><label>Тип (подпись под заголовком)</label><input id="etType" value="' + E(t.type) + '"></div><div class="x-field"><label>Текст</label><textarea id="etBody" rows="10" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--ink);font:inherit">' + E(t.body) + '</textarea></div><div class="x-err" id="etErr"></div><div class="x-row">' + (i >= 0 ? '<button class="x-btn ghost" id="etDel" style="margin-right:auto;color:var(--bad)">Удалить</button>' : "") + '<button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button><button class="x-btn primary" id="etSave">Сохранить</button></div>', true);
    $("etSave").onclick = function () {
      var n = { id: t.id, name: $("etName").value, type: $("etType").value, body: $("etBody").value }, list = TPL.contracts.slice();
      if (i >= 0) list[i] = n; else list.push(n);
      saveTpl({ contracts: list }).then(function () { T.closeModal(); U.toast("Шаблон сохранён"); render(); }).catch(function (e) { $("etErr").textContent = String(e); });
    };
    var d = $("etDel"); if (d) d.onclick = function () { if (!confirm("Удалить шаблон?")) return; saveTpl({ contracts: TPL.contracts.filter(function (x, k) { return k !== i; }) }).then(function () { T.closeModal(); render(); }); };
  }
  function tabsHtml() {
    return '<div class="x-bar"><div class="x-seg" id="prTabs">' + [["price", "list", "Прайс"], ["kp", "file", "Шаблоны КП"], ["ct", "file", "Шаблоны договоров"]].map(function (t) { return '<button data-t="' + t[0] + '" class="' + (G.tab === t[0] ? "on" : "") + '">' + ic(t[1]) + t[2] + "</button>"; }).join("") + "</div></div>";
  }
  function bindTabs(el) { var s = el.querySelector("#prTabs"); if (s) s.querySelectorAll("button").forEach(function (b) { b.onclick = function () { G.tab = b.dataset.t; render(); }; }); }
  function paintTpl() {
    var el = $("price-app"), adm = isAdmin();
    el.innerHTML = U.head("Прайс и шаблоны", "Цены, готовые наборы услуг для КП и шаблоны договоров", "") + '<div class="wrap">' + tabsHtml() + '<div id="tpBody"><div class="x-empty">Загрузка…</div></div></div>';
    bindTabs(el);
    loadTpl(true).then(function () {
      var b = $("tpBody");
      if (G.tab === "kp") {
        b.innerHTML = kpTplCards(true) + '<p class="x-hint">«Использовать» откроет конструктор КП с отмеченными услугами. Новый шаблон: соберите КП в конструкторе → «Шаблоны» → «Сохранить текущее КП как шаблон».</p>';
        bindKp(b);
      } else {
        b.innerHTML = '<div class="tpl-grid">' + TPL.contracts.map(function (t, i) {
          return '<div class="tpl-card"><div style="display:flex;gap:10px;align-items:center"><span class="tpl-ic">' + ic("file") + "</span><div><b>" + E(t.name) + "</b><small>" + E(t.type || "") + '</small></div></div><p class="tpl-body">' + E(t.body.slice(0, 220)) + (t.body.length > 220 ? "…" : "") + '</p><div class="tpl-act"><button class="x-btn primary" data-mk="' + i + '" style="padding:7px 14px">Составить договор</button>' + (adm ? '<button class="x-btn ghost" data-ed="' + i + '" style="padding:7px 12px">Изменить</button>' : "") + "</div></div>";
        }).join("") + "</div>" + (adm ? '<div style="margin-top:14px"><button class="x-btn ghost" id="ctAdd">' + ic("plus") + "Добавить шаблон договора</button></div>" : "")
          + '<p class="x-hint">Готовый договор печатается или скачивается как .doc. Генератор договоров МПБ (вкладка «Договоры») остаётся рядом — шаблоны здесь для быстрых типовых случаев.</p>';
        b.querySelectorAll("[data-mk]").forEach(function (x) { x.onclick = function () { P.makeContract(TPL.contracts[+x.dataset.mk]); }; });
        b.querySelectorAll("[data-ed]").forEach(function (x) { x.onclick = function () { editCt(+x.dataset.ed); }; });
        var ad = $("ctAdd"); if (ad) ad.onclick = function () { editCt(-1); };
      }
    }).catch(function (e) { $("tpBody").innerHTML = '<div class="x-panel"><div class="x-empty">' + E(e) + "</div></div>"; });
  }

  if (U.cur() === "price") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render); else render();
  }
  C.on("login", function () { if (U.cur() === "price") render(); });
  C.on("logout", function () { if (U.cur() === "price") render(); });
})();
