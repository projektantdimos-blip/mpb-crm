/* МПБ CRM v2 — этапы по видам работ.
   Ядро: у каждого вида работ свой набор этапов (исполнитель + срок по умолчанию). Наборы хранит мост, приложение берёт их при входе,
   держит копию в браузере и подменяет «ответственного» у задач (таблица считает его по старому общему списку).
   Экран «Этапы и сроки» (#/stages): смотреть может любой сотрудник, менять — руководитель. */
(function () {
  "use strict";
  var C = window.MPBC, T = window.MPBT, S = window.MPBS = {};
  var KEY = "mpb_stages", PAL = ["#2f6fe4", "#ee9264", "#2fa67a", "#e0a02b", "#8e6fd6", "#d65d8a", "#3bb0c9", "#7a8a3a"];
  var doc = null;
  var LEGACY = { version: 0, default: "std", pools: [{ id: "std", name: "Стандартный", keys: [], stages: (window.STAGES || []).map(function (s) { return { name: s.name, who: s.who, days: s.days != null ? s.days : 3 }; }) }] };
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function lsGet() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function lsSet(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function cur() { return doc || LEGACY; }

  /* ---------- выбор набора ---------- */
  function pick(pools, def, wt) {
    var w = String(wt || "").trim().toLowerCase(), i, j;
    if (w) {
      for (i = 0; i < pools.length; i++) if (pools[i].name.toLowerCase() === w) return pools[i];
      for (i = 0; i < pools.length; i++) for (j = 0; j < (pools[i].keys || []).length; j++) if (w.indexOf(String(pools[i].keys[j]).toLowerCase()) >= 0) return pools[i];
    }
    for (i = 0; i < pools.length; i++) if (pools[i].id === def) return pools[i];
    return pools[0];
  }
  S.poolFor = function (wt) { var d = cur(); return pick(d.pools, d.default, wt); };
  S.stagesFor = function (wt) { return S.poolFor(wt).stages; };
  S.allNames = function () { var out = []; cur().pools.forEach(function (p) { p.stages.forEach(function (s) { if (out.indexOf(s.name) < 0) out.push(s.name); }); }); return out; };
  S.whoOf = function (stage, wt) {
    var st = S.stagesFor(wt), i, p, j;
    for (i = 0; i < st.length; i++) if (st[i].name === stage) return st[i].who;
    for (p = 0; p < cur().pools.length; p++) for (j = 0; j < cur().pools[p].stages.length; j++) if (cur().pools[p].stages[j].name === stage) return cur().pools[p].stages[j].who;
    return undefined;
  };
  S.multi = function () { return cur().pools.length > 1; };
  S.poolNames = function () { return cur().pools.map(function (p) { return p.name; }); };

  /* ---------- применить набор к глобальным переменным приложения ---------- */
  function fill(arr, items) { arr.length = 0; items.forEach(function (x) { arr.push(x); }); }
  function apply(d) {
    doc = d; lsSet(d);
    var def = pick(d.pools, d.default, ""), people = [];
    if (window.STAGES) fill(window.STAGES, def.stages.map(function (s) { return { name: s.name, who: s.who, days: s.days }; }));   // старый код читает общий STAGES — это набор по умолчанию
    d.pools.forEach(function (p) { p.stages.forEach(function (s) { if (s.who && people.indexOf(s.who) < 0) people.push(s.who); }); });
    if (window.ALL_PEOPLE) fill(window.ALL_PEOPLE, people);
    if (window.PERSON_COLOR) people.forEach(function (n, i) { if (!PERSON_COLOR[n]) PERSON_COLOR[n] = PAL[i % PAL.length]; });
  }
  var cached = lsGet();
  if (cached && cached.pools && cached.pools.length) apply(cached);              // копия с прошлого входа; нет её — до входа всё работает как раньше

  function rerender() {
    var h = location.hash;
    if (h.indexOf("#/task") === 0 || h === "#/new" || h.indexOf("#/stages") === 0) return;    // не стираем открытую форму
    if (window.globalRouter) window.globalRouter();
  }
  S.load = function () {
    if (!C || !C.loggedIn || !C.loggedIn()) return Promise.resolve(null);
    return C.call("/stages").then(function (d) {
      var changed = !doc || doc.version !== d.version;
      apply(d);
      if (changed) rerender();
      return d;
    }).catch(function () { return null; });
  };
  if (C) {
    C.on("login", S.load);
    C.on("sync", function (s) { if (s && s.stages_v != null && doc && s.stages_v !== doc.version) S.load(); });
  }

  /* «Ответственный» в таблице считается по общему списку; здесь подменяем на того, кто указан в наборе вида работ */
  function fixTask(t) {
    if (!t || typeof t !== "object" || !t.stage) return;
    var w = S.whoOf(t.stage, t.workType);
    if (w !== undefined) t.responsible = w;
  }
  (function hook() {
    var orig = window.callServer;
    if (typeof orig !== "function" || orig.__mpbs) return;
    var w = function (fn) {
      var p = orig.apply(this, arguments);
      if (/^api_(listTasks|getTask)$/.test(fn)) return p.then(function (r) { if (Array.isArray(r)) r.forEach(fixTask); else fixTask(r); return r; });
      return p;
    };
    w.__mpbs = true; w.__mpb = orig.__mpb; window.callServer = w;
  })();

  /* ====================================================== экран «Этапы и сроки» ====================================================== */
  if (!C || !T || !T.util) return;
  var U = T.util, E = U.E, ic = U.ic;
  function $(id) { return document.getElementById(id); }
  var G = { draft: null, ver: -1, sel: 0, usage: {}, users: [], dirty: false };
  function isAdmin() { return C.me && C.me.role === "admin"; }
  function color(n) { return (window.PERSON_COLOR && PERSON_COLOR[n]) || "#8794ab"; }
  function dn(n) { var m = n % 100, k = n % 10; return n + " " + ((m >= 11 && m <= 14) ? "дней" : k === 1 ? "день" : (k >= 2 && k <= 4) ? "дня" : "дней"); }
  function nz(n, a, b, c) { var m = n % 100, k = n % 10; return (m >= 11 && m <= 14) ? c : k === 1 ? a : (k >= 2 && k <= 4) ? b : c; }

  function render() {
    var el = $("stages-app"), sub = "У каждого вида работ свой порядок этапов, исполнители и сроки по умолчанию";
    if (!U.gate(el, "Этапы и сроки", sub, render)) return;
    if (!doc) { el.innerHTML = U.head("Этапы и сроки", sub) + '<div class="wrap"><div class="x-empty">Загрузка…</div></div>'; S.load().then(function (d) { if (d) render(); else el.innerHTML = U.head("Этапы и сроки", sub) + '<div class="wrap"><div class="x-panel"><div class="x-empty">Не удалось загрузить наборы этапов. Проверьте связь с мостом (в ⚙) и обновите страницу.</div></div></div>'; }); return; }
    if (!G.draft || (!G.dirty && G.ver !== doc.version)) { G.draft = { default: doc.default, pools: clone(doc.pools) }; G.ver = doc.version; G.sel = Math.min(G.sel, G.draft.pools.length - 1); }
    var jobs = [C.call("/auth/users", { auth: false }).catch(function () { return []; }), isAdmin() ? C.call("/stages/usage").catch(function () { return { usage: {} }; }) : Promise.resolve({ usage: {} })];
    Promise.all(jobs).then(function (r) { G.users = r[0] || []; G.usage = r[1].usage || {}; paint(); });
  }

  function paint() {
    var el = $("stages-app"), adm = isAdmin();
    el.innerHTML = U.head("Этапы и сроки", "У каждого вида работ свой порядок этапов, исполнители и сроки по умолчанию",
      adm ? '<div class="x-row" style="margin:0"><button class="x-btn ghost" id="sgReset">Отменить правки</button><button class="x-btn primary" id="sgSave">Сохранить</button></div>' : "")
      + '<div class="wrap">' + (adm ? "" : '<div class="x-notif on" style="margin-bottom:16px"><span class="dot"></span><div><b>Только просмотр</b><small>Менять наборы этапов может руководитель</small></div></div>')
      + '<div class="sg"><div class="sg-list" id="sgList"></div><div id="sgEd"></div></div></div>';
    paintList(); paintEd(); bar();
    var s = $("sgSave"); if (s) s.onclick = function () { save(false); };
    var r = $("sgReset"); if (r) r.onclick = function () { if (G.dirty && !confirm("Отменить все несохранённые правки?")) return; G.draft = null; G.dirty = false; G.sel = 0; render(); };
  }
  function bar() { var s = $("sgSave"), r = $("sgReset"); if (s) { s.disabled = !G.dirty; s.textContent = G.dirty ? "Сохранить изменения" : "Сохранено"; } if (r) r.disabled = !G.dirty; }
  function touch() { G.dirty = true; bar(); }

  function busy(p) { var u = G.usage[p.id], n = 0; if (u) Object.keys(u).forEach(function (k) { n += u[k]; }); return n; }
  function paintList() {
    var d = G.draft, adm = isAdmin();
    $("sgList").innerHTML = d.pools.map(function (p, i) {
      var n = busy(p);
      return '<div class="sg-pool ' + (i === G.sel ? "on" : "") + '" data-i="' + i + '"><div class="t"><b>' + E(p.name || "Без названия") + "</b>" + (d.default === p.id ? '<span class="x-pill blue">по умолчанию</span>' : "") + "</div>"
        + "<small>" + p.stages.length + " " + nz(p.stages.length, "этап", "этапа", "этапов") + (n ? " · сейчас в работе: " + n : "") + "</small>"
        + (p.keys && p.keys.length ? '<div class="sg-keys">' + p.keys.slice(0, 5).map(function (k) { return "<span>" + E(k) + "</span>"; }).join("") + "</div>" : "") + "</div>";
    }).join("") + (adm ? '<button class="x-btn ghost" id="sgAdd" style="justify-content:center">' + ic("plus") + "Добавить набор</button><p class=\"sg-hintln\">Новый набор создаётся как копия выбранного — удобно поменять только то, что отличается</p>" : "");
    $("sgList").querySelectorAll(".sg-pool").forEach(function (b) { b.onclick = function () { G.sel = +b.dataset.i; paintList(); paintEd(); }; });
    var a = $("sgAdd");
    if (a) a.onclick = function () {
      var src = d.pools[G.sel], nm = "Новый набор", k = 1; while (d.pools.some(function (p) { return p.name.toLowerCase() === nm.toLowerCase(); })) nm = "Новый набор " + (++k);
      d.pools.push({ id: "p" + Date.now().toString(36), name: nm, keys: [], stages: clone(src.stages) }); G.sel = d.pools.length - 1; touch(); paintList(); paintEd();
      var f = $("sgName"); if (f) { f.focus(); f.select(); }
    };
  }

  function testText(wt) {
    var d = G.draft, p = pick(d.pools, d.default, wt);
    return wt ? "попадёт в набор <b>«" + E(p.name) + "»</b>" + (d.default === p.id && !(String(wt).trim().toLowerCase() === p.name.toLowerCase()) ? " (набор по умолчанию)" : "") : "";
  }
  function chain(p) {
    return '<div class="sg-chain">' + p.stages.map(function (s, i) {
      return (i ? '<span class="sg-sep">›</span>' : "") + '<span class="sg-chip" style="--c:' + color(s.who) + '"><b>' + (i + 1) + "</b>" + E(s.name || "…") + "<small>" + E(s.who || "—") + (s.days ? " · " + s.days + " дн." : "") + "</small></span>";
    }).join("") + "</div>";
  }
  function paintEd() {
    var d = G.draft, p = d.pools[G.sel], adm = isAdmin(), dis = adm ? "" : " disabled", use = G.usage[p.id] || {};
    var people = []; G.users.concat(window.ALL_PEOPLE || []).forEach(function (n) { if (n && people.indexOf(n) < 0) people.push(n); });
    d.pools.forEach(function (q) { q.stages.forEach(function (s) { if (s.who && people.indexOf(s.who) < 0) people.push(s.who); }); });
    var isDef = d.default === p.id;
    $("sgEd").innerHTML = '<div class="x-panel pad"><div class="x-field"><label>Название набора</label><input type="text" id="sgName" maxlength="60" value="' + E(p.name) + '"' + dis + ' placeholder="Например: Испытания"></div>'
      + '<div class="x-field"><label>Ключевые слова вида работ</label><input type="text" id="sgKeys" value="' + E((p.keys || []).join(", ")) + '"' + dis + ' placeholder="через запятую: испыт, сопротивл, рр"><p class="sg-hintln">Если в поле «Вид работы» задачи есть любое из этих слов (или оно совпадает с названием набора), задача пойдёт по этому набору. Остальные виды работ идут по набору «по умолчанию».</p></div>'
      + '<div class="x-qrow" style="border-bottom:0;padding-bottom:4px"><div><b>Набор по умолчанию</b><small>' + (isDef ? "Для всех видов работ, которые не подошли другим наборам" : "Включите, чтобы все прочие виды работ шли по этому набору") + '</small></div><button type="button" class="x-sw ' + (isDef ? "on" : "") + '" id="sgDef"' + dis + "></button></div>"
      + '<div class="sg-test" style="margin-top:10px"><span>Проверка:</span><input type="text" id="sgTest" placeholder="введите вид работы, например «Испытания ВПВ»"><span id="sgTestOut"></span></div></div>'
      + '<datalist id="sgPeople">' + people.map(function (n) { return '<option value="' + E(n) + '">'; }).join("") + "</datalist>"
      + '<div class="x-panel" style="margin-top:16px"><div class="sg-h"><h3>Этапы по порядку</h3>' + (adm && d.pools.length > 1 && !isDef ? '<button class="x-btn ghost" id="sgDel" style="padding:7px 13px;color:var(--bad)">Удалить набор</button>' : "") + "</div>"
      + '<div class="sg-cols"><span></span><span>Этап</span><span>Исполнитель</span><span title="Срок этапа по умолчанию. 0 — как в настройке моста (3 дня)">Срок, дн.</span><span style="text-align:center">В работе</span><span></span></div>'
      + p.stages.map(function (s, i) {
        return '<div class="sg-row" data-i="' + i + '"><span class="n">' + (i + 1) + '</span><input class="nm" data-f="name" maxlength="80" value="' + E(s.name) + '"' + dis + '><input class="who" data-f="who" list="sgPeople" maxlength="40" value="' + E(s.who) + '"' + dis + ' placeholder="кто делает"><input class="dy" data-f="days" type="number" min="0" max="365" value="' + s.days + '"' + dis + '>'
          + '<span class="use">' + (use[s.name] ? '<span class="x-pill soon">' + use[s.name] + "</span>" : '<span style="color:var(--muted)">—</span>') + "</span>"
          + (adm ? '<span class="mv"><button data-mv="-1" title="Выше"' + (i === 0 ? " disabled" : "") + '>▲</button><button data-mv="1" title="Ниже"' + (i === p.stages.length - 1 ? " disabled" : "") + '>▼</button><button class="rm" data-rm="1" title="Убрать этап"' + (p.stages.length < 2 ? " disabled" : "") + ">✕</button></span>" : "<span></span>") + "</div>";
      }).join("")
      + (adm ? '<div style="padding:12px 18px"><button class="x-btn ghost" id="sgAddSt">' + ic("plus") + "Добавить этап</button></div>" : "") + "</div>"
      + '<div class="x-panel pad" style="margin-top:16px"><h3>Как это увидят в задаче</h3><p class="x-sub">Цвет — по исполнителю. «В работе» — сколько открытых задач сейчас на этапе.</p><div id="sgChain">' + chain(p) + "</div></div>";
    $("sgTest").oninput = function () { $("sgTestOut").innerHTML = testText(this.value); };
    if (!adm) return;
    $("sgName").oninput = function () { p.name = this.value; touch(); paintList(); };
    $("sgKeys").onchange = function () { p.keys = this.value.split(/[,;\n]/).map(function (x) { return x.trim(); }).filter(Boolean); this.value = p.keys.join(", "); touch(); paintList(); };
    $("sgDef").onclick = function () { d.default = p.id; touch(); paintList(); paintEd(); };
    var del = $("sgDel"); if (del) del.onclick = function () { if (!confirm("Удалить набор «" + p.name + "»? Задачи этого вида работ пойдут по набору по умолчанию.")) return; d.pools.splice(G.sel, 1); G.sel = 0; touch(); paintList(); paintEd(); };
    $("sgAddSt").onclick = function () { p.stages.push({ name: "", who: "", days: 3 }); touch(); paintList(); paintEd(); var rows = $("sgEd").querySelectorAll(".sg-row .nm"); rows[rows.length - 1].focus(); };
    $("sgEd").querySelectorAll(".sg-row").forEach(function (row) {
      var i = +row.dataset.i, s = p.stages[i];
      row.querySelectorAll("input[data-f]").forEach(function (inp) {
        inp.oninput = function () { var f = inp.dataset.f; s[f] = f === "days" ? Math.max(0, Math.min(365, parseInt(inp.value, 10) || 0)) : inp.value; touch(); $("sgChain").innerHTML = chain(p); };
      });
      row.querySelectorAll("[data-mv]").forEach(function (b) { b.onclick = function () { var j = i + +b.dataset.mv; p.stages.splice(j, 0, p.stages.splice(i, 1)[0]); touch(); paintEd(); }; });
      var rm = row.querySelector("[data-rm]"); if (rm) rm.onclick = function () {
        var n = use[s.name] || 0;
        if (n && !confirm("На этапе «" + s.name + "» сейчас " + n + " " + nz(n, "задача", "задачи", "задач") + ". Всё равно убрать этап?")) return;
        p.stages.splice(i, 1); touch(); paintList(); paintEd();
      };
    });
  }

  function save(force) {
    C.call("/stages", { body: { pools: G.draft.pools, default: G.draft.default, force: !!force } }).then(function (r) {
      if (!r.ok) { orphans(r); return; }
      apply({ version: r.version, default: r.default, pools: r.pools });
      G.draft = null; G.dirty = false; G.ver = -1; U.toast("Этапы сохранены — у всех обновятся в течение минуты");
      T.closeModal(); render();
    }).catch(function (e) { U.toast(E(e)); });
  }
  function orphans(r) {
    var v = U.xmodal('<h3>На этих этапах стоят задачи</h3><p class="x-sub">После сохранения для ' + r.orphans_total + " " + nz(r.orphans_total, "задачи", "задач", "задач") + " этап пропадёт из набора. В таблице название останется прежним, но в CRM у такой задачи не будет отметок пройденных этапов, пока вы не выберете этап заново.</p>"
      + '<div style="max-height:34vh;overflow:auto">' + r.orphans.map(function (o) { return '<div class="cmd"><span class="x-pill">' + E(o.stage) + "</span><b>" + E(o.customer) + "</b></div>"; }).join("") + (r.orphans_total > r.orphans.length ? '<div class="x-hint">…и ещё ' + (r.orphans_total - r.orphans.length) + "</div>" : "") + "</div>"
      + '<div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Вернуться к правке</button><button class="x-btn primary" id="sgForce">Сохранить всё равно</button></div>', true);
    $("sgForce").onclick = function () { save(true); };
  }

  S.render = render;
  C.on("login", function () { if (U.cur() === "stages") render(); });
  C.on("logout", function () { if (U.cur() === "stages") render(); });
  if (U.cur() === "stages") render();
})();
