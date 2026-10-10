/* Вкладка «Общение»: единая лента Telegram + почта через «мост» (см. bridge/INSTALL.md).
   Подключается в index.html после основного скрипта. Адрес и ключ моста — в ⚙ (localStorage: mpb_bridge). */
(function () {
  "use strict";
  var root = document.getElementById("chat-app");
  if (!root) return;

  var CH = {
    tg:   { label: "Telegram", color: "#2b8ac6" },
    mail: { label: "Почта",    color: "#ee9264" },
    max:  { label: "Макс",     color: "#7a55a8" }
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
      '<header class="top"><div class="brand"><div><h1>Переписка</h1><p>Клиенты: Telegram, почта и Max — в одном окне</p></div></div></header>' +
      '<div id="chatBanner"></div>' +
      '<div class="chat-wrap" id="chatWrap">' +
        '<aside class="chat-list"><div class="chat-tools"><input id="chatQ" type="search" placeholder="Поиск по имени и тексту">' +
        '<div class="chat-chips" id="chatChips"></div>' +
        '<div class="chat-sync"><span id="chatSyncT">Загрузка…</span><span class="right">' +
        '<button type="button" id="chatPush" title="Уведомления на этом устройстве">🔔</button>' +
        '<button type="button" id="chatRefresh" title="Обновить сейчас">⟳ Обновить</button></span></div></div>' +
        '<div id="chatThreads"></div></aside>' +
        '<section class="chat-thread"><div id="chatHead"></div><div id="chatMsgs"></div>' +
        '<div id="chatComposer"><textarea id="chatText" placeholder="Ответ… (Ctrl+Enter — отправить)"></textarea><button id="chatSend">Отправить</button></div></section>' +
      '</div>';
    el.banner = document.getElementById("chatBanner");
    el.wrap = document.getElementById("chatWrap");
    el.threads = document.getElementById("chatThreads");
    el.head = document.getElementById("chatHead");
    el.msgs = document.getElementById("chatMsgs");
    el.text = document.getElementById("chatText");
    el.send = document.getElementById("chatSend");
    el.q = document.getElementById("chatQ");
    el.chips = document.getElementById("chatChips");
    el.q.oninput = function () { st.q = el.q.value.trim().toLowerCase(); renderThreads(); };
    el.send.onclick = sendMsg;
    document.getElementById("chatRefresh").onclick = function () { refreshNow(); };
    document.getElementById("chatPush").onclick = togglePush;
    showSync();
    refreshPushBtn();
    el.msgs.onclick = function (e) {
      var b = e.target.closest ? e.target.closest(".cf") : null;
      if (b) openFile(b.getAttribute("data-fid"), b.getAttribute("data-name"), b.getAttribute("data-mime"));
    };
    el.text.onkeydown = function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendMsg(); } };
    st.built = true;
    renderChips(); renderThreads(); renderThread();
  }

  function renderChips() {
    var items = [["all", "Все"], ["tg", "Telegram"], ["max", "Макс"], ["mail", "Почта"]];
    el.chips.innerHTML = items.map(function (i) {
      return '<button data-f="' + i[0] + '" class="' + (st.filter === i[0] ? "on" : "") + '">' + i[1] + "</button>";
    }).join("");
    Array.prototype.forEach.call(el.chips.querySelectorAll("button"), function (b) {
      b.onclick = function () { st.filter = b.getAttribute("data-f"); renderChips(); renderThreads(); };
    });
  }

  function visibleThreads() {
    return st.threads.filter(function (t) {
      if (st.filter !== "all" && t.channel !== st.filter) return false;
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
      return '<div class="ct' + (t.id === st.sel ? " on" : "") + '" data-id="' + esc(t.id) + '">' +
        '<div class="ava" style="' + avStyle(ci, av) + '">' + (av ? "" : esc(ini)) + "</div>" +
        '<div class="mid"><div class="r1"><span class="nm">' + esc(t.title || t.peer) + '</span><span class="tm">' + fmtTime(t.last_ts) + "</span></div>" +
        '<div class="r2"><span class="pv">' + esc(t.last_text) + "</span>" + (t.unread ? '<span class="un">' + t.unread + "</span>" : "") + "</div></div></div>";
    }).join("");
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
    el.text.disabled = el.send.disabled = !t || st.sending;
    if (!t) {
      el.head.innerHTML = '<b style="color:var(--muted);font-weight:400">Выберите переписку слева</b>';
      el.msgs.innerHTML = "";
      return;
    }
    var ci = chInfo(t.channel), av = avUrl(t), ini = (t.title || "?").trim().charAt(0).toUpperCase();
    el.head.innerHTML = '<button class="back" id="chatBack" title="К списку">←</button>' +
      '<div class="hava" style="' + avStyle(ci, av) + '">' + (av ? "" : esc(ini)) + "</div><b>" + esc(t.title || t.peer) + "</b>" +
      (t.channel === "mail" ? '<button class="hbtn" id="chatFlip" title="' + (flipOn() ? "Показать письма в обычном порядке" : "Перевернуть порядок частей письма") + '"' +
        (flipOn() ? ' style="border-color:var(--blue);color:var(--blue)"' : "") + ">⇅</button>" : "") +
      '<button class="hbtn" id="chatInfo" title="О клиенте: задачи, КП, контакты">👤 О клиенте</button>' +
      '<button class="hbtn" id="chatAv" title="Загрузить фото">📷</button>' +
      (t.avatar_ts ? '<button class="hbtn" id="chatAvDel" title="Убрать фото">✕</button>' : "") +
      '<input type="file" id="chatAvFile" accept="image/*" hidden>' +
      '<span class="chat-pill" style="background:' + ci.color + '">' + esc(ci.label) + "</span>";
    document.getElementById("chatBack").onclick = function () { st.sel = null; renderThreads(); renderThread(); };
    var flipBtn = document.getElementById("chatFlip");
    if (flipBtn) flipBtn.onclick = function () { setFlip(!flipOn()); renderThread(false); };
    document.getElementById("chatInfo").onclick = function () { if (window.MPBK && MPBK.forThread) MPBK.forThread(t.title || t.peer, t.peer); else alert("Раздел «Клиенты» не загружен — обновите страницу"); };
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
          '<div class="mt">' + fmtFull(m.ts) + "</div></div>";
      }
      return '<div class="cm ' + (m.direction === "out" ? "out" : "in") + '">' +
        subj + esc(m.text) + filesHtml(m.files) +
        '<div class="mt">' + fmtFull(m.ts) + "</div></div>";
    }).join("");
    if (!keepScroll || atBottom) el.msgs.scrollTop = el.msgs.scrollHeight;
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
  function togglePush() {
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
  function filesHtml(files) {
    if (!files || !files.length) return "";
    return '<div class="fl">' + files.map(function (f) {
      return '<button type="button" class="cf" data-fid="' + f.id + '" data-name="' + esc(f.name) + '" data-mime="' + esc(f.mime) + '">' +
        fileIcon(f.mime) + " <span>" + esc(f.name) + '</span><span class="sz">' + fmtSize(f.size) + "</span></button>";
    }).join("") + "</div>";
  }
  function openFile(fid, name, mime) {
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
      st.threads = list; setErr("");
      st.synced = new Date(); showSync();
      if (st.built) renderThreads();
      applyBadge();
      loadAvatars();
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

  function openThread(id) {
    st.sel = id; st.msgs = [];
    renderThreads(); renderThread();
    loadMessages(false).then(function () { el.text.focus(); });
    var t = curThread();
    if (t && t.unread) {
      t.unread = 0; renderThreads(); applyBadge();
      api("/api/threads/" + encodeURIComponent(id) + "/read", { method: "POST" }).then(null, function () {});
    }
  }

  function sendMsg() {
    var t = curThread(), text = el.text.value.trim();
    if (!t || !text || st.sending) return;
    st.sending = true; el.send.disabled = true; el.send.textContent = "Отправка…";
    api("/api/threads/" + encodeURIComponent(t.id) + "/send", { method: "POST", body: { text: text } }).then(function () {
      el.text.value = ""; setErr("");
      return Promise.all([loadMessages(false), loadThreads()]);
    }).then(null, function (e) { setErr(String(e)); }).then(function () {
      st.sending = false; el.send.textContent = "Отправить"; el.send.disabled = !curThread();
    });
  }

  /* ---------- показ / опрос ---------- */
  function inChat() { return location.hash.indexOf("#/chat") === 0; }

  function onShow() {
    var c = cfg();
    if (!c.url || !c.key) { buildSetup(); return; }
    if (!st.built) build();
    loadThreads().then(function () { if (st.sel) loadMessages(true); });
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

  window.addEventListener("hashchange", function () { setTimeout(applyBadge, 0); });
  window.__subRouters = window.__subRouters || {};
  window.__subRouters.chat = onShow;

  if (cfg().key) loadThreads();
  if (inChat()) onShow();
})();
