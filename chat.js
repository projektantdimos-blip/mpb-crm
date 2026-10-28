/* Вкладка «Общение»: единая лента Telegram + почта через «мост» (см. bridge/INSTALL.md).
   Подключается в index.html после основного скрипта. Адрес и ключ моста — в ⚙ (localStorage: mpb_bridge). */
(function () {
  "use strict";

  /* ---------- звук уведомлений (Web Audio; работает, пока приложение открыто) ---------- */
  var MPBSound = window.MPBSound = (function () {
    var ctx = null, last = 0;
    function on() { try { return localStorage.getItem("mpb_sound") !== "0"; } catch (e) { return true; } }
    function ac() {
      if (!ctx) { var C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { ctx = new C(); } catch (e) { return null; } }
      return ctx;
    }
    function unlock() {                     // браузер разрешает звук только после первого касания страницы
      var c = ac(); if (c && c.state === "suspended") c.resume().then(null, function () {});
    }
    ["pointerdown", "keydown", "touchstart"].forEach(function (n) { document.addEventListener(n, unlock, { passive: true }); });
    function tone(c, f, t0, dur, vol) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    function play(force) {
      if (!force && !on()) return;
      var now = Date.now();
      if (!force && now - last < 2000) return;       // push и опрос могут сработать одновременно — один сигнал
      last = now;
      var c = ac(); if (!c) return;
      try {
        if (c.state === "suspended") c.resume();
        var t = c.currentTime + 0.01;
        tone(c, 880, t, 0.22, 0.35); tone(c, 1318, t + 0.16, 0.34, 0.35);
      } catch (e) {}
      try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) {}
    }
    return { play: play, on: on, set: function (v) { try { localStorage.setItem("mpb_sound", v ? "1" : "0"); } catch (e) {} } };
  })();
  // service worker сообщает, что пришёл push, а вкладка открыта: сам он звук воспроизвести не может
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (e) { if (e.data && e.data.type === "push") MPBSound.play(); });
  }

  /* ---------- «приложение» на телефоне: страница закреплена, списки тянутся сами; потянуть вниз — обновить ---------- */
  window.__ptr = window.__ptr || {};
  (function () {
    var startY = 0, ptr = null, ind = null;
    function scrollable(el) {
      while (el && el !== document.body && el !== document.documentElement) {
        var cs = window.getComputedStyle(el), oy = cs.overflowY;
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) return el;
        el = el.parentElement;
      }
      return null;
    }
    function indicator() {
      if (!ind) { ind = document.createElement("div"); ind.className = "ptr-ind"; ind.innerHTML = '<span></span>'; document.body.appendChild(ind); }
      return ind;
    }
    function reset(el, spin) {
      el.style.transition = "transform .25s ease"; el.style.transform = "";
      var i = indicator(); i.classList.remove("on", "spin"); i.style.opacity = 0;
    }
    document.addEventListener("touchstart", function (e) {
      startY = e.touches[0].clientY; ptr = null;
      if (!document.body.classList.contains("shell") || e.touches.length !== 1) return;
      var el = e.target.closest ? e.target.closest("[data-ptr]") : null;
      if (el && el.scrollTop <= 0) ptr = { el: el, top: el.getBoundingClientRect().top, active: false, dy: 0 };
    }, { passive: true });
    document.addEventListener("touchmove", function (e) {
      if (!document.body.classList.contains("shell") || e.touches.length !== 1) return;
      var dy = e.touches[0].clientY - startY;
      if (ptr && dy > 0 && ptr.el.scrollTop <= 0) {                    // потянули вниз от верха списка: двигаем сам список
        ptr.active = true; ptr.dy = Math.min(dy * 0.5, 96);
        if (e.cancelable) e.preventDefault();
        ptr.el.style.transition = "none"; ptr.el.style.transform = "translateY(" + ptr.dy + "px)";
        var i = indicator(); i.style.top = (ptr.top + 6) + "px"; i.style.opacity = Math.min(1, ptr.dy / 55);
        i.classList.toggle("on", ptr.dy >= 55); i.firstChild.style.transform = "rotate(" + Math.round(ptr.dy * 4) + "deg)";
        return;
      }
      if (ptr && ptr.active) { ptr.active = false; reset(ptr.el); }
      if (!scrollable(e.target) && e.cancelable) e.preventDefault();   // под пальцем нечего прокручивать — страница не едет
    }, { passive: false });
    function finish() {
      if (!ptr || !ptr.active) { ptr = null; return; }
      var el = ptr.el, ok = ptr.dy >= 55, fn = window.__ptr[el.getAttribute("data-ptr")]; ptr = null;
      if (ok && fn) {
        var i = indicator(); i.classList.add("spin"); i.style.opacity = 1;
        el.style.transition = "transform .2s ease"; el.style.transform = "translateY(46px)";
        var done = function () { reset(el); };
        try { Promise.resolve(fn()).then(done, done); } catch (er) { done(); }
        setTimeout(done, 8000);
      } else reset(el);
    }
    document.addEventListener("touchend", finish, { passive: true });
    document.addEventListener("touchcancel", finish, { passive: true });
  })();
  var root = document.getElementById("chat-app");
  if (!root) return;

  var CH = {
    tg:   { label: "Telegram", color: "#2b8ac6" },
    mail: { label: "Почта",    color: "#ee9264" },
    max:  { label: "Макс",     color: "#7a55a8" },
    site: { label: "Сайт",     color: "#d8453a" },
    avito: { label: "Авито",   color: "#00aaff" }
  };
  var st = { threads: [], sel: null, msgs: [], filter: "all", q: "", err: "", built: false, sending: false, tick: 0 };
  var el = {};

  function cfg() {
    try {
      var c = JSON.parse(localStorage.getItem("mpb_bridge") || "{}");
      return { url: String(c.url || "").replace(/\/+$/, ""), key: c.key || "" };
    } catch (e) { return { url: "", key: "" }; }
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function fmtTime(ts) {
    if (!ts) return "";
    var d = new Date(ts * 1000), n = new Date();
    if (d.toDateString() === n.toDateString()) return pad(d.getHours()) + ":" + pad(d.getMinutes());
    return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + (d.getFullYear() !== n.getFullYear() ? "." + d.getFullYear() : "");
  }
  function fmtFull(ts) {
    var d = new Date(ts * 1000);
    return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  var IC = {
    clip: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11.1l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/></svg>',
    vol: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    mute: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>',
    bell: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>',
    camera: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    flip: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>',
    done: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>',
    sent: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    warn: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/></svg>',
    sort: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M6 12h12M10 18h4"/></svg>',
    clip: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11.1l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/></svg>',
    unread: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M22 7l-10 7L2 7"/><circle cx="19" cy="5" r="3.2" fill="currentColor" stroke="none"/></svg>'
  };
  function chInfo(id) { return CH[id] || { label: id, color: "#888" }; }

  /* push-уведомления на это устройство: регистрация service worker при загрузке страницы */
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").then(null, function () {});
  }

  function api(path, opts) {
    var c = cfg();
    if (!c.url || !c.key) return Promise.reject("NOCFG");
    opts = opts || {};
    return fetch(c.url + path, {
      method: opts.method || "GET", cache: "no-store",
      headers: { "X-Api-Key": c.key, "Content-Type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 401) throw "Неверный ключ моста — проверьте ⚙";
      if (!r.ok) {
        return r.json().then(function (j) { return j; }, function () { return {}; }).then(function (j) {
          throw (j && j.detail) ? String(j.detail) : ("Ошибка сервера " + r.status);
        });
      }
      return r.json();
    }, function () { throw "Мост недоступен. Проверьте адрес в ⚙ и интернет"; });
  }

  /* ---------- стили ---------- */
  var css = document.createElement("style");
  css.textContent =
    ".chat-badge{display:inline-block;min-width:18px;padding:0 5px;margin-left:6px;border-radius:9px;background:var(--orange);color:#fff;font-size:.72rem;font-weight:700;line-height:18px;text-align:center}" +
    "#chat-app{max-width:1400px;margin:0 auto;padding:14px 16px 24px}" +
    ".chat-banner{margin-bottom:10px;padding:9px 12px;border-radius:8px;background:var(--bad-l);color:var(--bad);font-size:.88rem}" +
    ".chat-wrap{display:grid;grid-template-columns:340px 1fr;height:calc(100vh - 230px);min-height:440px;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}" +
    ".chat-list{display:flex;flex-direction:column;border-right:1px solid var(--line);min-height:0}" +
    ".chat-tools{padding:10px;border-bottom:1px solid var(--line)}" +
    ".chat-tools input{width:100%;padding:8px 10px;border:1px solid #b9c4d0;border-radius:8px;font:inherit;background:var(--card);color:var(--ink)}" +
    ".chat-sync{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-size:.75rem;color:var(--muted)}" +
    ".chat-sync button{border:0;background:none;color:var(--blue);font:inherit;cursor:pointer;padding:2px 4px}" +
    ".chat-sync .right{display:flex;align-items:center;gap:8px}" +
    "#chatPush{font-size:1rem;opacity:.55}#chatPush.on{opacity:1}" +
    ".chat-chips{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}" +
    ".chat-chips button{border:1px solid var(--line);background:var(--card);color:var(--muted);border-radius:14px;padding:3px 10px;font:inherit;font-size:.8rem;cursor:pointer}" +
    ".chat-chips button.on{background:var(--blue);border-color:var(--blue);color:#fff}" +
    "#chatThreads{overflow-y:auto;flex:1}" +
    ".ct{display:flex;gap:10px;padding:10px 12px;border-bottom:1px solid var(--line);cursor:pointer}" +
    ".ct:hover{background:var(--bg)}.ct.on{background:var(--blue-l)}" +
    ".ct .ava,#chatHead .hava{border-radius:50%;flex:none;display:grid;place-items:center;color:#fff;font-weight:700;background-size:cover;background-position:center}" +
    ".ct .ava{width:38px;height:38px}#chatHead .hava{width:34px;height:34px}" +
    "#chatHead .hbtn{border:1px solid var(--line);background:var(--card);border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:.95rem;color:var(--muted);flex:none}" +
    "#chatHead .hbtn:hover{border-color:var(--blue);color:var(--blue)}" +
    ".ct .mid{flex:1;min-width:0}" +
    ".ct .r1{display:flex;gap:8px;align-items:baseline}" +
    ".ct .nm{font-weight:600;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".ct .tm{color:var(--muted);font-size:.75rem;flex:none}" +
    ".ct .r2{display:flex;gap:8px;align-items:center;margin-top:2px}" +
    ".ct .pv{color:var(--muted);font-size:.85rem;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".ct .un{background:var(--blue);color:#fff;border-radius:10px;min-width:20px;padding:0 6px;font-size:.75rem;font-weight:700;line-height:20px;text-align:center;flex:none}" +
    ".chat-empty{padding:28px 16px;text-align:center;color:var(--muted)}" +
    ".chat-thread{display:flex;flex-direction:column;min-height:0;min-width:0}" +
    "#chatHead{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line);min-height:52px}" +
    "#chatHead .back{display:none;border:0;background:none;font-size:1.3rem;cursor:pointer;color:var(--blue);padding:0 4px}" +
    "#chatHead b{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".chat-pill{border-radius:10px;padding:2px 9px;font-size:.75rem;font-weight:600;color:#fff;flex:none}" +
    "#chatMsgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:var(--bg)}" +
    ".cm{max-width:min(620px,82%);padding:8px 12px;border-radius:12px;background:var(--card);border:1px solid var(--line);white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}" +
    ".cm.out{align-self:flex-end;background:var(--blue-l);border-color:transparent}" +
    ".cm .sj{font-size:.78rem;font-weight:600;color:var(--muted);margin-bottom:3px}" +
    ".cm .mt{font-size:.7rem;color:var(--muted);margin-top:4px;text-align:right}" +
    ".cm .sj-b{margin:6px 0 0;padding-top:6px;border-top:1px dashed var(--line)}" +
    ".cm .fl{display:flex;flex-direction:column;gap:5px;margin-top:6px}" +
    ".cm .cf{display:flex;gap:8px;align-items:center;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--blue);font-size:.85rem;cursor:pointer;text-align:left;font-family:inherit;white-space:normal}" +
    ".cm .cf:hover{border-color:var(--blue)}" +
    ".cm .cf .sz{color:var(--muted);font-size:.75rem;margin-left:auto;flex:none}" +
    "#chatComposer{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line);align-items:flex-end}" +
    "#chatComposer textarea{flex:1;resize:none;height:44px;max-height:140px;padding:10px 12px;border:1px solid #b9c4d0;border-radius:10px;font:inherit;background:var(--card);color:var(--ink)}" +
    "#chatComposer button{height:44px;padding:0 18px;border:0;border-radius:10px;background:var(--blue);color:#fff;font:inherit;font-weight:600;cursor:pointer}" +
    "#chatComposer button:disabled{opacity:.5;cursor:default}" +
    ".chat-setup{max-width:560px;margin:40px auto;padding:22px;background:var(--card);border:1px solid var(--line);border-radius:12px;text-align:center}" +
    ".chat-setup button{margin-top:12px;padding:9px 18px;border:0;border-radius:8px;background:var(--blue);color:#fff;font:inherit;cursor:pointer}" +
    "@media(max-width:760px){#chat-app{padding:8px}.chat-wrap{grid-template-columns:1fr;height:calc(100vh - 150px)}" +
    ".chat-wrap .chat-thread{display:none}.chat-wrap.has-sel .chat-list{display:none}.chat-wrap.has-sel .chat-thread{display:flex}" +
    "#chatHead .back{display:block}}";
  document.head.appendChild(css);

  /* ---------- каркас ---------- */
  function buildSetup() {
    st.built = false;
    root.innerHTML =
      '<div class="chat-setup"><h2 style="margin:0 0 6px">💬 Общение</h2>' +
      '<p style="color:var(--muted);margin:0">Единая лента Telegram и почты. Нужно подключить «мост» — адрес и ключ вводятся в настройках (⚙ слева внизу). Инструкция: <b>bridge/INSTALL.md</b>.</p>' +
      '<button id="chatOpenCfg">Открыть настройки</button></div>';
    document.getElementById("chatOpenCfg").onclick = function () { if (window.openApiSettings) openApiSettings(); };
  }

  function build() {
    root.innerHTML =
      '<header class="top"><div class="brand"><div><h1>Общение с клиентами</h1><p>Почта, Telegram и Max — в одном окне, с привязкой к клиентам и задачам</p></div></div></header>' +
      '<div id="chatBanner"></div>' +
      '<div class="chat-wrap" id="chatWrap">' +
        '<aside class="chat-list"><div class="chat-tools"><button type="button" id="chatNew" class="chat-new">' + IC.plus + 'Новое сообщение</button><div class="chat-chips" id="chatChips"></div><input id="chatQ" type="search" placeholder="Поиск по имени и тексту">' +
        '<div class="chat-sync"><span id="chatSyncT">Загрузка…</span><span class="right">' +
        '<button type="button" id="chatSound" class="ibtn" title="Звук новых сообщений"></button>' +
        '<button type="button" id="chatPush" class="ibtn" title="Уведомления на этом устройстве">' + IC.bell + '</button>' +
        '<button type="button" id="chatRefresh" class="ibtn" title="Обновить сейчас">' + IC.refresh + '</button></span></div></div>' +
        '<div id="chatThreads"></div></aside>' +
        '<section class="chat-thread"><div id="chatHead"></div><div id="chatAssign"></div><div id="chatMsgs"></div>' +
        '<div id="chatComposer"><div id="chatFileBar" class="chat-filebar" hidden></div><button type="button" id="chatAttach" class="chat-attach" title="Прикрепить файл (до 10 МБ)">' + IC.clip + '</button><input type="file" id="chatFile" hidden><textarea id="chatText" placeholder="Ответ… (Ctrl+Enter — отправить)"></textarea><button id="chatSend">Отправить</button></div></section>' +
        '<aside class="chat-info" id="chatInfoPane"></aside>' +
      '</div>';
    el.banner = document.getElementById("chatBanner");
    el.wrap = document.getElementById("chatWrap");
    el.threads = document.getElementById("chatThreads");
    el.threads.setAttribute("data-ptr", "chat");
    el.head = document.getElementById("chatHead");
    el.assign = document.getElementById("chatAssign");
    el.info = document.getElementById("chatInfoPane");
    el.msgs = document.getElementById("chatMsgs");
    el.text = document.getElementById("chatText");
    if (window.innerWidth <= 760) el.text.placeholder = "Сообщение…";
    el.send = document.getElementById("chatSend");
    el.q = document.getElementById("chatQ");
    if (window.innerWidth <= 760) { var h1 = root.querySelector('header.top h1'); if (h1) h1.textContent = "Переписка"; }
    el.chips = document.getElementById("chatChips");
    el.q.oninput = function () { st.q = el.q.value.trim().toLowerCase(); renderThreads(); };
    el.send.onclick = sendMsg;
    el.fileBar = document.getElementById("chatFileBar");
    var fileIn = document.getElementById("chatFile");
    document.getElementById("chatAttach").onclick = function () { fileIn.click(); };
    fileIn.multiple = true;
    fileIn.onchange = function () { addFiles(fileIn.files); fileIn.value = ""; };
    el.fileBar.onclick = function (e) {
      var x = e.target.getAttribute && e.target.getAttribute("data-x");
      if (x !== null && x !== undefined) { st.files.splice(+x, 1); showFileBar(); }
    };
    // перетаскивание файлов в диалог и вставка из буфера
    var thr = document.querySelector(".chat-thread"), depth = 0;
    function hasFiles(e) { var t = e.dataTransfer && e.dataTransfer.types; return !!t && Array.prototype.indexOf.call(t, "Files") >= 0; }
    thr.addEventListener("dragenter", function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth++; thr.classList.add("drop"); });
    thr.addEventListener("dragover", function (e) { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
    thr.addEventListener("dragleave", function (e) { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) thr.classList.remove("drop"); });
    thr.addEventListener("drop", function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault(); depth = 0; thr.classList.remove("drop");
      addFiles(e.dataTransfer.files);
    });
    el.text.addEventListener("paste", function (e) {
      var fl = e.clipboardData && e.clipboardData.files;
      if (fl && fl.length) { e.preventDefault(); addFiles(fl); }
    });
    // браузер по умолчанию открывает бросок мимо поля как файл — гасим это на странице чата
    ["dragover", "drop"].forEach(function (n) {
      window.addEventListener(n, function (e) { if (inChat() && hasFiles(e) && !thr.contains(e.target)) e.preventDefault(); });
    });
    document.getElementById("chatRefresh").onclick = function () { refreshNow(); };
    document.getElementById("chatNew").onclick = newDialog;
    document.getElementById("chatPush").onclick = togglePush;
    var sndBtn = document.getElementById("chatSound");
    function paintSnd() { sndBtn.innerHTML = MPBSound.on() ? IC.vol : IC.mute; sndBtn.title = MPBSound.on() ? "Звук включён — нажмите, чтобы выключить" : "Звук выключен — нажмите, чтобы включить"; }
    sndBtn.onclick = function () { MPBSound.set(!MPBSound.on()); paintSnd(); if (MPBSound.on()) MPBSound.play(true); };
    paintSnd();
    showSync();
    refreshPushBtn();
    el.msgs.onclick = function (e) {
      var d = e.target.closest ? e.target.closest(".mdel") : null;
      if (d) {
        if (!confirm("Убрать это сообщение из CRM?\n\nУ получателя (в почте или Telegram) оно останется.")) return;
        api("/api/messages/" + d.getAttribute("data-mid") + "/delete", { method: "POST" }).then(function () {
          return Promise.all([loadMessages(true), loadThreads()]);
        }).then(null, function (er) { setErr(String(er)); });
        return;
      }
      var b = e.target.closest ? e.target.closest(".cf") : null;
      if (b && b.classList.contains("cimg") && imgCache[b.getAttribute("data-fid")] && imgCache[b.getAttribute("data-fid")] !== "pending") { lightbox(imgCache[b.getAttribute("data-fid")], b.getAttribute("data-name")); return; }
      if (b) openFile(b.getAttribute("data-fid"), b.getAttribute("data-name"), b.getAttribute("data-mime"));
    };
    el.text.addEventListener("input", growText);
    el.text.onkeydown = function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMsg(); } };
    st.built = true;
    renderChips(); renderThreads(); renderThread();
  }

  /* ---------- передача писем сотрудникам (нужен вход в CRM) ---------- */
  st.assign = [];
  function crmOn() { return !!(window.MPBC && MPBC.loggedIn && MPBC.loggedIn() && MPBC.me); }
  function myOpen() { return crmOn() ? st.assign.filter(function (a) { return a.user_id === MPBC.me.id && a.status === "open"; }) : []; }
  function assignsFor(tid) { return st.assign.filter(function (a) { return a.thread_id === tid && a.status === "open"; }); }
  function assignPill(t) {
    var l = assignsFor(t.id); if (!l.length) return "";
    return '<span class="as-pill" title="Передано: ' + esc(l.map(function (a) { return a.user; }).join(", ")) + '">→ ' + esc(l[0].user) + (l.length > 1 ? " +" + (l.length - 1) : "") + "</span>";
  }
  function loadAssign() {
    if (!crmOn()) { if (st.assign.length) { st.assign = []; } return Promise.resolve(); }
    return MPBC.call("/mail/assignments?status=open").then(function (l) { st.assign = l; if (st.built) { renderChips(); renderThreads(); renderAssign(); } }).catch(function () {});
  }
  function renderAssign() {
    if (!el.assign) return;
    var t = curThread(), l = t ? assignsFor(t.id) : [];
    el.assign.innerHTML = l.map(function (a) {
      return '<div class="as-bar"><span>📨 Передано: <b>' + esc(a.user) + "</b>" + (a.by_name ? " · от " + esc(a.by_name) : " · автоматически") + (a.note ? " — " + esc(a.note) : "") + '</span><button class="hbtn" data-done="' + a.id + '">Готово</button></div>';
    }).join("");
    Array.prototype.forEach.call(el.assign.querySelectorAll("[data-done]"), function (b) {
      b.onclick = function () { MPBC.call("/mail/assignments/" + b.getAttribute("data-done") + "/done", { body: { done: true } }).then(loadAssign).catch(function (e) { alert(String(e)); }); };
    });
  }
  function assignDialog(t) {
    if (!crmOn()) { alert("Войдите в «Личном кабинете», чтобы передавать письма сотрудникам"); return; }
    var U = window.MPBT && MPBT.util; if (!U) return;
    var lastIn = null; for (var i = st.msgs.length - 1; i >= 0; i--) { if (st.msgs[i].direction === "in") { lastIn = st.msgs[i]; break; } }
    MPBC.call("/people").then(function (people) {
      var others = people.filter(function (p) { return p.id !== MPBC.me.id; });
      var v = U.xmodal('<h3>Передать сотруднику</h3><p class="x-sub">' + esc(t.title || t.peer) + (lastIn && lastIn.subject ? " · " + esc(lastIn.subject) : "") + '</p>'
        + '<div class="x-field"><label>Кому</label><select id="asTo">' + others.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + (p.title ? " — " + esc(p.title) : "") + "</option>"; }).join("") + '</select></div>'
        + '<div class="x-field"><label>Что нужно сделать</label><input id="asNote" maxlength="300" placeholder="Например: оплатить счёт до пятницы"></div><div class="x-err" id="asErr"></div>'
        + '<div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button><button class="x-btn primary" id="asGo">Передать</button></div>');
      document.getElementById("asGo").onclick = function () {
        MPBC.call("/mail/assign", { body: { thread_id: t.id, user_id: +document.getElementById("asTo").value, note: document.getElementById("asNote").value, message_id: lastIn ? lastIn.id : 0 } })
          .then(function (r) { MPBT.closeModal(); U.toast(r.already ? "Уже передано этому сотруднику" : "Передано"); loadAssign(); })
          .catch(function (e) { document.getElementById("asErr").textContent = String(e); });
      };
    }).catch(function (e) { alert(String(e)); });
  }

  function renderChips() {
    var items = [["all", "Все"], ["tg", "Telegram"], ["max", "Макс"], ["mail", "Почта"], ["avito", "Авито"], ["site", "Сайт"], ["done", "Отработано"]], n = myOpen().length, mine = st.filter === "mine";
    var seg = crmOn()
      ? '<div class="seg"><button data-f="all" class="' + (mine ? "" : "on") + '">Все диалоги</button>' +
        '<button data-f="mine" class="' + (mine ? "on" : "") + '">' + IC.sort + 'Мне передали' + (n ? '<b class="cnt">' + n + "</b>" : "") + "</button></div>"
      : "";
    el.chips.innerHTML = seg + '<div class="chs' + (mine ? " dim" : "") + '">' + items.map(function (i) {
      return '<button data-f="' + i[0] + '" class="' + (!mine && st.filter === i[0] ? "on" : "") + '">' + i[1] + "</button>";
    }).join("") + "</div>";
    Array.prototype.forEach.call(el.chips.querySelectorAll("button"), function (b) {
      b.onclick = function () { st.filter = b.getAttribute("data-f"); renderChips(); renderThreads(); };
    });
  }

  function visibleThreads() {
    return st.threads.filter(function (t) {
      if (st.filter === "mine") { if (!myOpen().some(function (a) { return a.thread_id === t.id; })) return false; }
      else if (st.filter === "done") { if (!t.done) return false; }
      else if (st.filter !== "all" && t.channel !== st.filter) return false;
      if (st.q && (t.title + " " + t.last_text + " " + t.peer).toLowerCase().indexOf(st.q) < 0) return false;
      return true;
    });
  }

  function renderThreads() {
    var list = visibleThreads(), keep = el.threads.scrollTop;      // при автообновлении не сбрасываем прокрутку списка
    if (!list.length) {
      el.threads.innerHTML = '<div class="chat-empty">' + (st.threads.length ? "Ничего не найдено" : "Сообщений пока нет") + "</div>";
      return;
    }
    el.threads.innerHTML = list.map(function (t) {
      var ci = chInfo(t.channel), ini = (t.title || "?").trim().charAt(0).toUpperCase(), av = avUrl(t);
      return '<div class="ct' + (t.id === st.sel ? " on" : "") + (t.unread ? " is-un" : "") + (t.done ? " is-done" : "") + '" data-id="' + esc(t.id) + '">' +
        '<button type="button" class="udot' + (t.unread ? " on" : "") + '" data-u="' + esc(t.id) + '" title="' + (t.unread ? "Отметить прочитанным" : "Отметить непрочитанным") + '" aria-label="Непрочитано"></button>' +
        '<div class="ava" style="' + avStyle(ci, av) + '">' + (av ? "" : esc(ini)) + "</div>" +
        '<div class="mid"><div class="r1"><span class="nm">' + esc(t.title || t.peer) + '</span><span class="tm">' + fmtTime(t.last_ts) + '</span><button type="button" class="dchk' + (t.done ? " on" : "") + '" data-dn="' + esc(t.id) + '" title="' + (t.done ? "Отработано — нажмите, чтобы снять отметку" : "Отметить отработанным") + '" aria-label="Отработано">' + IC.done + "</button></div>" +
        '<div class="r2"><span class="pv">' + esc(t.last_text) + "</span>" + assignPill(t) + (t.unread ? '<span class="un">' + t.unread + "</span>" : "") + "</div></div></div>";
    }).join("");
    Array.prototype.forEach.call(el.threads.querySelectorAll(".dchk"), function (b) {
      b.onclick = function (e) { e.stopPropagation(); toggleDone(b.getAttribute("data-dn")); };
    });
    Array.prototype.forEach.call(el.threads.querySelectorAll(".udot"), function (b) {
      b.onclick = function (e) { e.stopPropagation(); toggleUnread(b.getAttribute("data-u")); };
    });
    Array.prototype.forEach.call(el.threads.querySelectorAll(".ct"), function (d) {
      d.onclick = function () { openThread(d.getAttribute("data-id")); };
    });
    el.threads.scrollTop = keep;
  }

  /* режим «перевернуть письма»: блоки текста (разделённые пустой строкой) идут в обратном порядке */
  function flipOn() {
    try { return localStorage.getItem("mpb_chat_flip") !== "0"; } catch (e) { return true; }
  }
  function setFlip(on) { try { localStorage.setItem("mpb_chat_flip", on ? "1" : "0"); } catch (e) {} }
  function flipBlocks(text) {
    var blocks = String(text || "").replace(/\r/g, "").split(/\n[ \t]*\n+/).map(function (b) { return b.replace(/^\n+|\n+$/g, ""); })
      .filter(function (b) { return b.trim() !== ""; });
    return blocks.reverse().join("\n\n");
  }

  function curThread() {
    for (var i = 0; i < st.threads.length; i++) if (st.threads[i].id === st.sel) return st.threads[i];
    return null;
  }

  function renderThread(keepScroll) {
    var t = curThread();
    el.wrap.classList.toggle("has-sel", !!t);
    var site = !!t && t.channel === "site";                // заявка с сайта: отвечаем по телефону или письмом
    el.text.disabled = el.send.disabled = !t || st.sending || site;
    el.text.placeholder = site ? "Заявка с сайта — позвоните клиенту или напишите ему письмо («Новый диалог» → Почта)" : "Ответ… (Ctrl+Enter — отправить)";
    if (!t) {
      if (el.assign) el.assign.innerHTML = "";
      renderInfo(null);
      el.head.innerHTML = '<b style="color:var(--muted);font-weight:400">Выберите переписку слева</b>';
      el.msgs.innerHTML = "";
      return;
    }
    var ci = chInfo(t.channel), av = avUrl(t), ini = (t.title || "?").trim().charAt(0).toUpperCase();
    el.head.innerHTML = '<button class="back" id="chatBack" title="К списку">←</button>' +
      '<div class="hava" style="' + avStyle(ci, av) + '">' + (av ? "" : esc(ini)) + "</div>" +
      '<div class="hmain"><b>' + esc(t.title || t.peer) + "</b><small>" + esc(t.peer) + "</small></div>" +
      '<span class="hacts"><button class="hbtn hdone' + (t.done ? " on" : "") + '" id="chatDone" title="' + (t.done ? "Отработано — снять отметку" : "Отметить отработанным") + '">' + IC.done + "</button>" + (t.channel === "mail" ? '<button class="hbtn" id="chatFlip" title="' + (flipOn() ? "Показать письма в обычном порядке" : "Перевернуть порядок частей письма") + '"' +
        (flipOn() ? ' style="border-color:var(--blue);color:var(--blue)"' : "") + ">" + IC.flip + "</button>" : "") +
      '<button class="hbtn" id="chatAv" title="Загрузить фото собеседника">' + IC.camera + "</button>" +
      (t.avatar_ts ? '<button class="hbtn" id="chatAvDel" title="Убрать фото">✕</button>' : "") + "</span>" +
      '<button class="hbtn chat-infobtn" id="chatInfoBtn" title="Клиент, создание клиента и КП">Клиент · КП</button>' +
      '<span class="chat-pill" style="background:' + ci.color + '">' + esc(ci.label) + "</span>" +
      '<input type="file" id="chatAvFile" accept="image/*" hidden>';
    document.getElementById("chatBack").onclick = function () { st.sel = null; renderThreads(); renderThread(); };
    document.getElementById("chatDone").onclick = function () { toggleDone(t.id); };
    var flipBtn = document.getElementById("chatFlip");
    if (flipBtn) flipBtn.onclick = function () { setFlip(!flipOn()); renderThread(false); };
    renderAssign();
    renderInfo(t);
    document.getElementById("chatInfoBtn").onclick = function () { el.wrap.classList.add("show-info"); };
    document.getElementById("chatAv").onclick = function () { document.getElementById("chatAvFile").click(); };
    document.getElementById("chatAvFile").onchange = function () { if (this.files[0]) uploadAvatar(t.id, this.files[0]); this.value = ""; };
    var del = document.getElementById("chatAvDel");
    if (del) del.onclick = function () { if (confirm("Убрать фото у «" + (t.title || t.peer) + "»?")) removeAvatar(t.id); };
    var atBottom = el.msgs.scrollHeight - el.msgs.scrollTop - el.msgs.clientHeight < 60;
    var flip = flipOn() && t.channel === "mail";
    el.msgs.innerHTML = st.msgs.map(function (m) {
      var subj = m.subject ? '<div class="sj' + (flip && m.direction === "in" ? " sj-b" : "") + '">' + esc(m.subject) + "</div>" : "";
      if (flip && m.direction === "in") {
        // «перевёрнутое» письмо: подпись/ссылки сверху, затем текст, тема внизу
        return '<div class="cm in">' + esc(flipBlocks(m.text)) + filesHtml(m.files) + subj +
          '<div class="mt">' + fmtFull(m.ts) + delBtn(m) + "</div></div>";
      }
      return '<div class="cm ' + (m.direction === "out" ? "out" : "in") + '">' +
        subj + esc(m.text) + filesHtml(m.files) +
        '<div class="mt">' + fmtFull(m.ts) + (m.direction === "out" ? ' <span class="sent" title="Отправлено">' + IC.sent + "</span>" : "") + delBtn(m) + "</div></div>";
    }).join("") + (st.pending[t.id] || []).filter(function (p) {
      return !(p.state === "sending" && st.msgs.some(function (m) { return m.direction === "out" && m.text === p.text && m.ts >= p.t0 - 5; }));
    }).map(function (p, i) {
      return '<div class="cm out pend ' + p.state + '">' + esc(p.text) + (p.files ? '<div class="pf">' + esc(p.files) + "</div>" : "") +
        '<div class="mt">' + (p.state === "failed"
          ? '<span class="fail">' + IC.warn + " Не отправлено" + (p.err ? ": " + esc(p.err) : "") + '</span> <button type="button" class="pdel" data-pi="' + (st.pending[t.id] || []).indexOf(p) + '">Убрать</button>'
          : '<span class="wait">' + IC.clock + " Отправляется…</span>") + "</div></div>";
    }).join("");
    Array.prototype.forEach.call(el.msgs.querySelectorAll(".pdel"), function (b) {
      b.onclick = function () { (st.pending[t.id] || []).splice(+b.getAttribute("data-pi"), 1); renderThread(true); };
    });
    loadChatImages();
    if (!keepScroll || atBottom) el.msgs.scrollTop = el.msgs.scrollHeight;
  }

  /* ---------- правая панель: клиент, связанные дела, быстрые действия (как в макете) ---------- */
  function ic2(n) { return window.icon ? window.icon(n) : ""; }
  var infoKey = "";
  function renderInfo(t) {
    if (!el.info) return;
    if (!t) { el.info.innerHTML = '<div class="chat-empty">Выберите диалог слева</div>'; return; }
    var ci = chInfo(t.channel), av = avUrl(t), ini = (t.title || "?").trim().charAt(0).toUpperCase(), name = t.title || t.peer;
    if (window.MPBD && MPBD.render) {                              // боковая панель с вкладками: клиент / создать клиента / КП
      el.info.innerHTML = '<button class="cp-close" id="cpClose">← К диалогу</button><div class="who"><div class="hava big" style="' + avStyle(ci, av) + '">' + (av ? "" : esc(ini)) + "</div><b>" + esc(name) + '</b><div class="sub">' + esc(t.peer) + '</div><span class="chat-pill" style="background:' + ci.color + '">' + esc(ci.label) + "</span></div>" +
        (crmOn() ? '<button class="x-btn ghost cp-w" id="qaAssign">' + ic2("send") + 'Передать сотруднику</button>' : "") + '<div id="chatPanel"></div>';
      document.getElementById("cpClose").onclick = function () { el.wrap.classList.remove("show-info"); };
      var qa0 = document.getElementById("qaAssign"); if (qa0) qa0.onclick = function () { assignDialog(t); };
      MPBD.render(document.getElementById("chatPanel"), t, name);
      return;
    }
    el.info.innerHTML = '<div class="who"><div class="hava big" style="' + avStyle(ci, av) + '">' + (av ? "" : esc(ini)) + "</div><b>" + esc(name) + '</b><div class="sub">' + esc(t.peer) + '</div><span class="chat-pill" style="background:' + ci.color + '">' + esc(ci.label) + "</span></div>" +
      '<div><h6>Клиент</h6><div id="chatCl"><div class="chat-empty" style="padding:8px">Ищу в задачах и заявках…</div></div></div>' +
      '<div><h6>Быстрые действия</h6>' +
      '<a class="linkcard" id="qaKp">' + ic2("file") + "<span><b>Создать КП</b><small>по шаблону или с нуля</small></span></a>" +
      '<a class="linkcard" id="qaNew">' + ic2("plus") + "<span><b>Создать клиента</b><small>заявка в реестре КП</small></span></a>" +
      (crmOn() ? '<a class="linkcard" id="qaAssign">' + ic2("send") + "<span><b>Передать сотруднику</b><small>письмо или диалог целиком</small></span></a>" : "") +
      "</div>";
    var open = function (fn) { return function () { if (window.MPBK && MPBK[fn]) MPBK[fn](name, t.peer, t.id); else alert("Раздел «Клиенты» не загружен — обновите страницу"); }; };
    document.getElementById("qaKp").onclick = open("forThread");
    document.getElementById("qaNew").onclick = open("createClient");
    var qa = document.getElementById("qaAssign"); if (qa) qa.onclick = function () { assignDialog(t); };
    var key = t.id; infoKey = key;
    if (window.MPBK && MPBK.summary) MPBK.summary(name, t.peer).then(function (r) {
      var box = document.getElementById("chatCl"); if (!box || infoKey !== key) return;
      if (!r) { box.innerHTML = '<div class="chat-empty" style="padding:10px 4px;text-align:left">Клиент не найден в задачах и заявках. Нажмите «Создать клиента», и его карточка появится в разделе «Клиенты».</div>'; return; }
      var c = r.c, h = '<a class="linkcard" data-go="#/clients/' + encodeURIComponent(c.key) + '"><span class="cl-mini">' + esc((c.name || "?").charAt(0)) + "</span><span><b>" + esc(c.name) + "</b><small>" + c.open.length + " в работе · заявок: " + c.live.length + "</small></span></a>";
      c.open.slice(0, 3).forEach(function (x) { h += '<a class="linkcard" data-go="#/task/' + x.row + '">' + ic2("tasks") + "<span><b>" + esc(x.workType || "Работа") + "</b><small>" + esc(x.stage || "") + (x.deadline ? " · срок " + esc(String(x.deadline).split("-").reverse().join(".")) : "") + "</small></span></a>"; });
      c.live.slice(0, 2).forEach(function (x) { h += '<a class="linkcard" data-go="#/kpreg/lead/' + x.row + '">' + ic2("list") + "<span><b>" + esc(x.object || "Заявка") + "</b><small>" + esc(x.status || "") + (+x.amount ? " · " + Math.round(+x.amount).toLocaleString("ru-RU") + " ₽" : "") + "</small></span></a>"; });
      box.innerHTML = h;
      Array.prototype.forEach.call(box.querySelectorAll("[data-go]"), function (a) { a.onclick = function () { location.hash = a.getAttribute("data-go"); }; });
    });
  }

  /* ---------- фото собеседников (загружаются вручную) ---------- */
  var avCache = {};                       // "id@время" -> blob-адрес | "pending"
  function avKey(t) { return t.id + "@" + t.avatar_ts; }
  function avUrl(t) {
    var u = t.avatar_ts ? avCache[avKey(t)] : null;
    return u && u !== "pending" ? u : "";
  }
  function avStyle(ci, url) {
    return "background-color:" + ci.color + (url ? ";background-image:url(" + url + ")" : "");
  }
  function loadAvatars() {
    var c = cfg(), any = false;
    st.threads.forEach(function (t) {
      if (!t.avatar_ts || avCache[avKey(t)]) return;
      var k = avKey(t); avCache[k] = "pending"; any = true;
      fetch(c.url + "/api/threads/" + encodeURIComponent(t.id) + "/avatar", { headers: { "X-Api-Key": c.key } }).then(function (r) {
        if (!r.ok) throw 0; return r.blob();
      }).then(function (b) {
        avCache[k] = URL.createObjectURL(b);
        if (st.built) { renderThreads(); if (st.sel === t.id) renderThread(true); }
      }).then(null, function () { delete avCache[k]; });
    });
    return any;
  }
  function uploadAvatar(tid, file) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onerror = function () { URL.revokeObjectURL(url); setErr("Не удалось прочитать изображение"); };
    img.onload = function () {
      var s = Math.min(img.width, img.height), cv = document.createElement("canvas");
      cv.width = cv.height = 192;
      cv.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 192, 192);
      URL.revokeObjectURL(url);
      cv.toBlob(function (blob) {
        var c = cfg();
        fetch(c.url + "/api/threads/" + encodeURIComponent(tid) + "/avatar", {
          method: "POST", headers: { "X-Api-Key": c.key, "Content-Type": "image/jpeg" }, body: blob
        }).then(function (r) { return r.ok ? r.json() : r.json().then(function (j) { throw j.detail || "Ошибка " + r.status; }); })
          .then(function (j) {
            for (var i = 0; i < st.threads.length; i++) if (st.threads[i].id === tid) st.threads[i].avatar_ts = j.avatar_ts;
            setErr(""); loadAvatars(); renderThreads(); renderThread(true);
          }).then(null, function (e) { setErr(typeof e === "string" ? e : "Не удалось загрузить фото"); });
      }, "image/jpeg", 0.85);
    };
    img.src = url;
  }
  function removeAvatar(tid) {
    api("/api/threads/" + encodeURIComponent(tid) + "/avatar/delete", { method: "POST" }).then(function () {
      for (var i = 0; i < st.threads.length; i++) if (st.threads[i].id === tid) st.threads[i].avatar_ts = 0;
      renderThreads(); renderThread(true);
    }, function (e) { setErr(String(e)); });
  }

  /* ---------- push-уведомления на это устройство ---------- */
  function pushSupported() { return "serviceWorker" in navigator && "PushManager" in window; }
  function urlB64ToUint8Array(b64) {
    var pad = "=".repeat((4 - (b64.length % 4)) % 4);
    var raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function currentPushSub() {
    if (!pushSupported()) return Promise.resolve(null);
    return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); });
  }
  function refreshPushBtn() {
    var b = document.getElementById("chatPush");
    if (!b) return;
    if (!pushSupported()) { b.style.display = "none"; return; }
    currentPushSub().then(function (sub) {
      if (crmPush()) sub = sub && MPBC.pushOn() ? sub : null;   // «включено» — только если подписка привязана к вам
      b.classList.toggle("on", !!sub);
      b.title = sub ? "Уведомления включены на этом устройстве — нажмите, чтобы отключить"
                     : "Включить уведомления о новых сообщениях на этом устройстве";
    });
  }
  function enablePush() {
    if (Notification.permission === "denied") {
      setErr("Уведомления запрещены в браузере для этого сайта — разрешите их в его настройках"); return;
    }
    Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") return;
      var reg;
      return navigator.serviceWorker.ready.then(function (r) { reg = r; return api("/api/push/vapid-key"); })
        .then(function (j) { return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(j.key) }); })
        .then(function (sub) { return api("/api/push/subscribe", { method: "POST", body: sub.toJSON() }); })
        .then(function () { setErr(""); refreshPushBtn(); })
        .then(null, function (e) { setErr(typeof e === "string" ? e : "Не удалось включить уведомления"); refreshPushBtn(); });
    });
  }
  function disablePush() {
    currentPushSub().then(function (sub) {
      if (!sub) return;
      var endpoint = sub.endpoint;
      return sub.unsubscribe().then(function () { return api("/api/push/unsubscribe", { method: "POST", body: { endpoint: endpoint } }); });
    }).then(refreshPushBtn, refreshPushBtn);
  }
  function crmPush() { return window.MPBC && MPBC.loggedIn && MPBC.loggedIn() && MPBC.enablePush; }
  function togglePush() {
    if (crmPush()) {                                    // на устройстве одна подписка — та же, что в «Личном кабинете → Уведомления»
      (MPBC.pushOn() ? MPBC.disablePush() : MPBC.enablePush())
        .then(function () { setErr(""); refreshPushBtn(); }, function (e) { setErr(String(e)); refreshPushBtn(); });
      return;
    }
    currentPushSub().then(function (sub) { if (sub) disablePush(); else enablePush(); });
  }

  /* ---------- вложения ---------- */
  var INLINE_RE = /^(application\/pdf|image\/(png|jpe?g|gif|webp))$/;
  function fmtSize(n) {
    if (n < 1024) return n + " Б";
    if (n < 1048576) return Math.round(n / 1024) + " КБ";
    return (n / 1048576).toFixed(1) + " МБ";
  }
  function fileIcon(mime) {
    return mime === "application/pdf" ? "📄" : /^image\//.test(mime) ? "🖼" : "📎";
  }
  var DOC_KIND = { pdf: ["PDF", "#d64545"], doc: ["DOC", "#2b6cb0"], docx: ["DOC", "#2b6cb0"], xls: ["XLS", "#1d8a4e"], xlsx: ["XLS", "#1d8a4e"], csv: ["CSV", "#1d8a4e"], ppt: ["PPT", "#d9822b"], pptx: ["PPT", "#d9822b"], zip: ["ZIP", "#7f77dd"], rar: ["RAR", "#7f77dd"], "7z": ["7Z", "#7f77dd"], txt: ["TXT", "#5f5e5a"], dwg: ["DWG", "#0f6e56"], dxf: ["DXF", "#0f6e56"] };
  var imgCache = {};
  function fileExt(n) { var m = /\.([A-Za-z0-9]{1,5})$/.exec(n || ""); return m ? m[1].toLowerCase() : ""; }
  function filesHtml(files) {
    if (!files || !files.length) return "";
    return '<div class="fl">' + files.map(function (f) {
      if (/^image\/(png|jpe?g|gif|webp)$/i.test(f.mime || "")) {
        return '<button type="button" class="cf cimg" data-fid="' + f.id + '" data-name="' + esc(f.name) + '" data-mime="' + esc(f.mime) + '" title="' + esc(f.name) + '"><img alt="' + esc(f.name) + '"><span class="ld">Загрузка фото…</span></button>';
      }
      var k = DOC_KIND[fileExt(f.name)] || [(fileExt(f.name) || "ФАЙЛ").toUpperCase().slice(0, 4), "#5f5e5a"];
      return '<button type="button" class="cf cdoc" data-fid="' + f.id + '" data-name="' + esc(f.name) + '" data-mime="' + esc(f.mime) + '"><span class="dk" style="background:' + k[1] + '">' + esc(k[0]) + '</span><span class="dn"><b>' + esc(f.name) + "</b><small>" + k[0] + " · " + fmtSize(f.size) + "</small></span></button>";
    }).join("") + "</div>";
  }
  function loadChatImages() {
    Array.prototype.forEach.call(el.msgs.querySelectorAll(".cimg"), function (b) {
      var id = b.getAttribute("data-fid"), im = b.querySelector("img");
      if (imgCache[id] && imgCache[id] !== "pending") { im.src = imgCache[id]; b.classList.add("ok"); return; }
      if (imgCache[id] === "pending") return;
      imgCache[id] = "pending";
      api("/api/files/" + id + "/link", { method: "POST" }).then(function (j) { return fetch(cfg().url + j.path); })
        .then(function (r) { if (!r.ok) throw 0; return r.blob(); })
        .then(function (bl) {
          imgCache[id] = URL.createObjectURL(bl);
          Array.prototype.forEach.call(document.querySelectorAll('.cimg[data-fid="' + id + '"]'), function (x) { x.querySelector("img").src = imgCache[id]; x.classList.add("ok"); });
        }).then(null, function () { delete imgCache[id]; var l = b.querySelector(".ld"); if (l) l.textContent = "Фото не загрузилось — нажмите, чтобы открыть"; b.classList.add("fail"); });
    });
  }
  function lightbox(url, name) {
    var v = document.createElement("div"); v.className = "x-lbox";
    v.innerHTML = '<div class="bar"><span>' + esc(name || "") + '</span><a href="' + url + '" download="' + esc(name || "photo") + '">Скачать</a><button type="button" aria-label="Закрыть">×</button></div><img src="' + url + '" alt="">';
    v.onclick = function (e) { if (e.target === v || e.target.tagName === "BUTTON") v.remove(); };
    document.body.appendChild(v);
  }  function openFile(fid, name, mime) {
    // PDF и картинки — в новой вкладке (окно открываем сразу, иначе его заблокирует браузер), остальное — скачивание.
    // Мост выдаёт короткоживущую ссылку, файл грузится обычным переходом, без хранения в памяти страницы.
    var inline = INLINE_RE.test(mime);
    var w = inline ? window.open("", "_blank") : null;
    api("/api/files/" + fid + "/link", { method: "POST" }).then(function (j) {
      var url = cfg().url + j.path + (w ? "" : "?dl=1");
      if (w) { w.location.href = url; return; }
      var a = document.createElement("a");
      a.href = url; a.setAttribute("download", name);
      document.body.appendChild(a); a.click(); a.remove();
    }).then(null, function (e) { if (w) w.close(); setErr(typeof e === "string" ? e : "Не удалось получить файл"); });
  }

  function setErr(msg) {
    st.err = msg || "";
    if (el.banner) el.banner.innerHTML = st.err ? '<div class="chat-banner">' + esc(st.err) + "</div>" : "";
  }

  /* ---------- данные ---------- */
  function totalUnread() {
    return st.threads.reduce(function (s, t) { return s + (t.unread || 0); }, 0);
  }
  function showSync() {
    var e = document.getElementById("chatSyncT");
    if (e && st.synced) e.textContent = "Обновлено " + pad(st.synced.getHours()) + ":" + pad(st.synced.getMinutes()) + ":" + pad(st.synced.getSeconds());
  }
  window.__chatBadge = function () { applyBadge(); };
  function applyBadge() {
    var un = totalUnread();      // счётчик и в заголовке вкладки браузера
    document.title = (un ? "(" + un + ") " : "") + "МПБ — Рабочие инструменты";
    var n = totalUnread();
    document.querySelectorAll('#topnav button[data-goto="#/chat"], #bottomnav button[data-goto="#/chat"]').forEach(function (b) {
      var old = b.querySelector(".chat-badge"); if (old) old.remove();
      if (n) { var s = document.createElement("span"); s.className = "chat-badge"; s.textContent = n > 99 ? "99+" : n; b.appendChild(s); }
    });
  }

  function loadThreads() {
    return api("/api/threads").then(function (list) {
      var uq = 0; list.forEach(function (x) { uq += x.unread || 0; });
      if (st.unreadSum != null && uq > st.unreadSum) MPBSound.play();      // появились новые входящие
      st.unreadSum = uq;
      st.threads = list; setErr("");
      st.synced = new Date(); showSync();
      if (st.built) renderThreads();
      applyBadge();
      loadAvatars();
      loadAssign();
    }, function (e) { if (e !== "NOCFG") setErr(String(e)); });
  }

  function loadMessages(keepScroll) {
    var id = st.sel; if (!id) return Promise.resolve();
    return api("/api/threads/" + encodeURIComponent(id) + "/messages").then(function (list) {
      if (id !== st.sel) return;
      var changed = list.length !== st.msgs.length || (list.length && list[list.length - 1].id !== st.msgs[st.msgs.length - 1].id);
      st.msgs = list;
      if (changed || !keepScroll) renderThread(keepScroll);
    }, function (e) { setErr(String(e)); });
  }

  /* ---------- новое сообщение тому, кого ещё нет в переписке ---------- */
  function newDialog() {
    var U = window.MPBT && MPBT.util;
    if (!U || !U.xmodal) { alert("Окно не загрузилось — обновите страницу"); return; }
    var files = [];
    U.xmodal('<h3>Новое сообщение</h3><p class="x-sub">Напишите человеку, которого ещё нет в списке диалогов</p>' +
      '<div class="x-field"><label>Куда</label><select id="ndCh"><option value="mail">Почта (e-mail)</option><option value="tg">Telegram</option></select></div>' +
      '<div class="x-field"><label id="ndToL">Адрес почты</label><input id="ndTo" type="text" placeholder="name@company.ru" autocomplete="off"></div>' +
      '<div class="x-field"><label>Имя или компания <small>(необязательно)</small></label><input id="ndName" type="text" maxlength="120" placeholder="Например: ООО «Фирма»"></div>' +
      '<div class="x-field" id="ndSubjW"><label>Тема письма</label><input id="ndSubj" type="text" maxlength="200" placeholder="Коммерческое предложение"></div>' +
      '<div class="x-field"><label>Сообщение</label><textarea id="ndText" rows="5" placeholder="Текст сообщения"></textarea></div>' +
      '<div class="x-field"><button type="button" class="x-btn ghost" id="ndAttach">' + IC.clip + 'Прикрепить файлы</button><input type="file" id="ndFile" multiple hidden><div id="ndFiles" class="nd-files"></div></div>' +
      '<div class="x-err" id="ndErr"></div>' +
      '<div class="x-row"><button class="x-btn ghost" onclick="MPBT.closeModal()">Отмена</button><button class="x-btn primary" id="ndGo">Отправить</button></div>');
    var g = function (i) { return document.getElementById(i); };
    function paint() {
      g("ndFiles").innerHTML = files.map(function (f, i) { return '<span class="chat-fchip"><span class="fn">' + esc(f.name) + '</span> <small>' + Math.max(1, Math.round(f.size / 1024)) + ' КБ</small><button type="button" data-x="' + i + '">✕</button></span>'; }).join("");
      Array.prototype.forEach.call(g("ndFiles").querySelectorAll("[data-x]"), function (b) { b.onclick = function () { files.splice(+b.getAttribute("data-x"), 1); paint(); }; });
    }
    g("ndCh").onchange = function () {
      var mail = g("ndCh").value === "mail";
      g("ndToL").textContent = mail ? "Адрес почты" : "Telegram: @username или номер +7…";
      g("ndTo").placeholder = mail ? "name@company.ru" : "@username или +79991234567";
      g("ndSubjW").style.display = mail ? "" : "none";
    };
    g("ndAttach").onclick = function () { g("ndFile").click(); };
    g("ndFile").onchange = function () {
      Array.prototype.forEach.call(this.files, function (f) {
        if (!f.size || f.size > MAX_ONE) g("ndErr").textContent = "Файл «" + f.name + "» пустой или больше 10 МБ";
        else if (files.length < MAX_FILES) files.push(f);
      });
      this.value = ""; paint();
    };
    g("ndGo").onclick = function () {
      var to = g("ndTo").value.trim(), text = g("ndText").value.trim();
      if (!to) { g("ndErr").textContent = "Укажите, кому писать"; return; }
      if (!text && !files.length) { g("ndErr").textContent = "Напишите текст или приложите файл"; return; }
      g("ndGo").disabled = true; g("ndGo").textContent = "Отправка…"; g("ndErr").textContent = "";
      Promise.all(files.map(readB64)).then(function (d) {
        return api("/api/threads/new", { method: "POST", body: {
          channel: g("ndCh").value, to: to, name: g("ndName").value.trim(), subject: g("ndSubj").value.trim(), text: text,
          files: files.map(function (f, i) { return { filename: f.name, mime: f.type || "application/octet-stream", data: d[i] }; }) } });
      }).then(function (r) {
        MPBT.closeModal();
        return loadThreads().then(function () { if (r && r.id) openThread(r.id); });
      }).then(null, function (e) { g("ndErr").textContent = String(e); g("ndGo").disabled = false; g("ndGo").textContent = "Отправить"; });
    };
    setTimeout(function () { g("ndTo").focus(); }, 50);
  }

  function toggleDone(id) {
    var t = null; for (var i = 0; i < st.threads.length; i++) if (st.threads[i].id === id) t = st.threads[i];
    if (!t) return;
    var want = !t.done;
    t.done = want ? 1 : 0; if (want) t.unread = 0;
    st.unreadSum = null; renderThreads(); if (st.sel === id) renderThread(true); applyBadge();
    api("/api/threads/" + encodeURIComponent(id) + "/done", { method: "POST", body: { done: want } }).then(null, function (e) {
      t.done = want ? 0 : 1; renderThreads(); if (st.sel === id) renderThread(true); setErr(String(e));
    });
  }

  function toggleUnread(id) {
    var t = null; for (var i = 0; i < st.threads.length; i++) if (st.threads[i].id === id) t = st.threads[i];
    if (!t) return;
    if (!t.unread) { markUnread(id); return; }
    t.unread = 0; st.unreadSum = null; renderThreads(); applyBadge();
    api("/api/threads/" + encodeURIComponent(id) + "/read", { method: "POST" }).then(null, function (e) { setErr(String(e)); });
  }

  function markUnread(id) {
    api("/api/threads/" + encodeURIComponent(id) + "/unread", { method: "POST" }).then(function () {
      for (var i = 0; i < st.threads.length; i++) if (st.threads[i].id === id) st.threads[i].unread = Math.max(1, st.threads[i].unread || 0);
      st.unreadSum = null;                                  // свой же счётчик не должен «пикать»
      st.sel = null; renderThreads(); renderThread(); applyBadge();
    }, function (e) { setErr(String(e)); });
  }

  function openThread(id) {
    st.sel = id; st.msgs = [];
    if (st.files && st.files.length) { st.files = []; showFileBar(); }     // вложения не должны уйти другому клиенту
    renderThreads(); renderThread();
    loadMessages(false).then(function () { el.text.focus(); });
    var t = curThread();
    if (t && t.unread) {
      t.unread = 0; renderThreads(); applyBadge();
      api("/api/threads/" + encodeURIComponent(id) + "/read", { method: "POST" }).then(null, function () {});
    }
  }

  st.files = [];
  st.pending = {};
  var MAX_FILES = 10, MAX_ONE = 10 * 1024 * 1024, MAX_ALL = 25 * 1024 * 1024;
  function addFiles(list) {
    if (!curThread()) { setErr("Сначала выберите переписку"); return; }
    var msg = "";
    Array.prototype.forEach.call(list || [], function (f) {
      var sum = st.files.reduce(function (a, x) { return a + x.size; }, 0);
      if (!f.size) msg = "Файл «" + f.name + "» пустой";
      else if (f.size > MAX_ONE) msg = "Файл «" + f.name + "» больше 10 МБ";
      else if (st.files.length >= MAX_FILES) msg = "Не больше 10 файлов за раз";
      else if (sum + f.size > MAX_ALL) msg = "Файлы вместе больше 25 МБ";
      else st.files.push(f);
    });
    setErr(msg); showFileBar();
  }
  function delBtn(m) {
    return m.id ? ' <button type="button" class="mdel" data-mid="' + m.id + '" title="Убрать сообщение из CRM" aria-label="Удалить">' + IC.trash + "</button>" : "";
  }
  function growText() {
    if (!el.text) return;
    el.text.style.height = "auto";
    el.text.style.height = Math.min(el.text.scrollHeight, Math.round(window.innerHeight * 0.4)) + "px";
  }
  function showFileBar() {
    if (!el.fileBar) return;
    el.fileBar.hidden = !st.files.length;
    el.fileBar.innerHTML = st.files.map(function (f, i) {
      return '<span class="chat-fchip">📄 <span class="fn">' + esc(f.name) + "</span> <small>" + (f.size >= 1048576 ? (f.size / 1048576).toFixed(1) + " МБ" : Math.max(1, Math.round(f.size / 1024)) + " КБ") + '</small><button type="button" data-x="' + i + '" title="Убрать">✕</button></span>';
    }).join("");
  }
  function sendBtnLabel() { return st.files.length ? "Отправить (" + st.files.length + ")" : "Отправить"; }
  function readB64(f) {
    return new Promise(function (ok, bad) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result || ""); ok(s.slice(s.indexOf(",") + 1)); };
      r.onerror = function () { bad("Не удалось прочитать файл"); };
      r.readAsDataURL(f);
    });
  }

  function sendMsg() {
    var t = curThread(), text = el.text.value.trim(), fs = st.files.slice();
    if (!t || (!text && !fs.length) || st.sending) return;
    st.sending = true; el.send.disabled = true; el.send.textContent = "Отправка…";
    var pend = { t0: Date.now() / 1000, text: text, files: fs.map(function (f) { return f.name; }).join(", "), state: "sending", err: "" };
    (st.pending[t.id] = st.pending[t.id] || []).push(pend);
    el.text.value = ""; growText(); st.files = []; showFileBar();            // сообщение сразу уходит из поля, как в мессенджере
    renderThread(false);
    var job = fs.length
      ? Promise.all(fs.map(readB64)).then(function (d) {
          var body = { text: text, filename: fs[0].name, mime: fs[0].type || "application/octet-stream", data: d[0], more: [] };
          for (var i = 1; i < fs.length; i++) body.more.push({ filename: fs[i].name, mime: fs[i].type || "application/octet-stream", data: d[i] });
          return api("/api/threads/" + encodeURIComponent(t.id) + "/send-file", { method: "POST", body: body });
        })
      : api("/api/threads/" + encodeURIComponent(t.id) + "/send", { method: "POST", body: { text: text } });
    job.then(function (r) {
      setErr("");
      if (r && r.file === false) setErr("В Max файл не передаётся — ушёл только текст. Отправьте файл по почте или в Telegram.");
      var arr = st.pending[t.id] || []; arr.splice(arr.indexOf(pend), 1);
      return Promise.all([loadMessages(false), loadThreads()]);
    }).then(null, function (e) {
      pend.state = "failed"; pend.err = String(e); setErr(String(e));
      if (!el.text.value) { el.text.value = text; growText(); }                // не ушло — возвращаем текст в поле
      if (!st.files.length) { st.files = fs; showFileBar(); }
      if (st.sel === t.id) renderThread(true);
    }).then(function () {
      st.sending = false; el.send.textContent = "Отправить"; el.send.disabled = !curThread();
    });
  }

  /* для «Конструктора КП»: отправить готовое предложение в диалог */
  window.__chatThreads = function () { return st.threads.slice(); };
  window.__chatSendFile = function (tid, text, filename, b64, mime) {
    return api("/api/threads/" + encodeURIComponent(tid) + "/send-file", { method: "POST", body: { text: text, filename: filename, mime: mime || "application/pdf", data: b64 } })
      .then(function (r) { try { loadThreads(); if (st.sel === tid) loadMessages(false); } catch (e) {} return r; });
  };
  window.__chatSend = function (tid, text) {
    return api("/api/threads/" + encodeURIComponent(tid) + "/send", { method: "POST", body: { text: text } }).then(function () { try { loadThreads(); if (st.sel === tid) loadMessages(false); } catch (e) {} });
  };

  /* ---------- показ / опрос ---------- */
  function inChat() { return location.hash.indexOf("#/chat") === 0; }

  function onShow() {
    var c = cfg();
    if (!c.url || !c.key) { buildSetup(); return; }
    if (!st.built) build();
    loadThreads().then(function () {
      var m = location.hash.match(/[?&]t=([^&]+)/);
      if (m) { var tid = decodeURIComponent(m[1]); if (st.sel !== tid && st.threads.some(function (x) { return x.id === tid; })) openThread(tid); }
      if (st.sel) loadMessages(true);
    });
  }

  function refreshNow() {
    var c = cfg(); if (!c.url || !c.key || !st.built) return Promise.resolve();
    return loadThreads().then(function () { if (st.sel) return loadMessages(true); });
  }
  setInterval(function () {
    if (document.hidden) return;
    var c = cfg(); if (!c.url || !c.key) return;
    st.tick++;
    if (inChat()) refreshNow();
    else if (st.tick % 6 === 0) loadThreads();      // вне вкладки — раз в минуту, только для значка
  }, 10000);
  // вернулись на вкладку / появилась сеть — обновляем сразу, не дожидаясь таймера
  document.addEventListener("visibilitychange", function () { if (!document.hidden && inChat()) refreshNow(); });
  window.addEventListener("focus", function () { if (inChat()) refreshNow(); });
  window.addEventListener("online", function () { if (inChat()) refreshNow(); });
  window.__ptr.chat = function () { return refreshNow(); };

  window.addEventListener("hashchange", function () { setTimeout(applyBadge, 0); });
  window.__subRouters = window.__subRouters || {};
  window.__subRouters.chat = onShow;

  if (cfg().key) loadThreads();
  if (inChat()) onShow();
})();
