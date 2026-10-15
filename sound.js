/* Звук уведомлений CRM. Свой файл: положите рядом с index.html файл sound.mp3 (или .ogg/.wav) — он будет играть вместо встроенного сигнала.
   Настройки (включён, громкость) хранятся в браузере. Браузер разрешает звук после первого нажатия на странице. */
(function () {
  "use strict";
  var LS = "ds_sound", ctx = null, fileUrl = null, fileChecked = false, lastAt = 0;
  function cfg() {
    try { var c = JSON.parse(localStorage.getItem(LS) || "{}"); return { on: c.on !== false, vol: c.vol > 0 ? Math.min(1, c.vol) : 0.9 }; }
    catch (e) { return { on: true, vol: 0.9 }; }
  }
  function save(c) { try { localStorage.setItem(LS, JSON.stringify(c)); } catch (e) {} }
  function audioCtx() {
    if (!ctx) { var C = window.AudioContext || window.webkitAudioContext; if (C) ctx = new C(); }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function chime(vol) {                         // двухтональный «динь-дон», как у мессенджеров и CRM
    var a = audioCtx(); if (!a) return;
    var t0 = a.currentTime + 0.01, master = a.createGain();
    master.gain.value = vol; master.connect(a.destination);
    [[880, 0, 0.22], [1318.5, 0.16, 0.5]].forEach(function (n) {
      [1, 2].forEach(function (h) {
        var o = a.createOscillator(), g = a.createGain();
        o.type = h === 1 ? "sine" : "triangle"; o.frequency.value = n[0] * h;
        var s = t0 + n[1], v = h === 1 ? 0.9 : 0.25;
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(v, s + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, s + n[2]);
        o.connect(g); g.connect(master); o.start(s); o.stop(s + n[2] + 0.05);
      });
    });
  }
  function findFile(cb) {
    if (fileChecked) return cb(fileUrl);
    fileChecked = true;
    var names = ["sound.mp3", "sound.ogg", "sound.wav"], i = 0;
    (function next() {
      if (i >= names.length) return cb(null);
      var n = names[i++];
      fetch(n, { method: "HEAD", cache: "no-store" }).then(function (r) { if (r.ok && /audio|octet/.test(r.headers.get("content-type") || "")) { fileUrl = n; cb(n); } else next(); }, next);
    })();
  }
  function play(force) {
    var c = cfg();
    if (!c.on && !force) return;
    var now = Date.now(); if (now - lastAt < 700 && !force) return;      // не чаще раза в 0,7 с
    lastAt = now;
    findFile(function (u) {
      if (u) { try { var au = new Audio(u); au.volume = c.vol; au.play().then(null, function () { chime(c.vol); }); return; } catch (e) {} }
      try { chime(c.vol); } catch (e) {}
    });
  }
  document.addEventListener("click", function () { audioCtx(); }, { once: true });
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", function (e) { if (e.data && e.data.type === "push-sound") play(); });
  window.DSSound = { play: play, test: function () { play(true); }, get: cfg, set: function (p) { var c = cfg(); if ("on" in p) c.on = !!p.on; if ("vol" in p) c.vol = Math.max(0.1, Math.min(1, +p.vol || 0.9)); save(c); return c; } };
})();
