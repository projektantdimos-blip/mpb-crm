// Интерфейс, база клиентов и договоров (localStorage)
(function () {
  const { EX, TYPES, clientPre, shortFio } = CT;
  // В CRM «Проекты DS» оформляются только договоры на услуги от ИП (МПБ и ТО/монтаж отсюда убраны)
  Object.keys(TYPES).forEach(k => { if (k !== 'services') delete TYPES[k]; });
  TYPES.services.companies = ['shub'];
  const { num, r2 } = U;
  const $ = (s, el) => (el || document).querySelector(s);

  /* ---------- DOM helper ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return el;
  }

  /* ---------- База ---------- */
  const KEY = 'contracts_db_v1';
  let DB = { clients: [], contracts: [] };
  let storageOk = true;
  function loadDB() {
    try { const raw = localStorage.getItem(KEY); if (raw) DB = Object.assign({ clients: [], contracts: [] }, JSON.parse(raw)); }
    catch (e) { storageOk = false; }
  }
  function saveDB() {
    try { localStorage.setItem(KEY, JSON.stringify(DB)); }
    catch (e) { storageOk = false; alert('Не удалось сохранить в браузере. Скачайте резервную копию на вкладке «Резерв».'); }
    scheduleSync();
  }

  /* ---------- Общая папка (сервер) ---------- */
  // Приложение запускается через «Запуск.bat»: локальный мини-сервер пишет базу в \\176.197.21.187\ServAmani\ContractsApp
  let apiOk = false, syncTimer = null, syncBusy = false, serverInfo = null;
  function setSync(s, msg) {
    const el = $('#syncBadge'); if (!el) return;
    el.className = 'badge ' + s;
    el.textContent = s === 'ok' ? '● Сохранено в CRM' : s === 'busy' ? '● Синхронизация…' : s === 'err' ? '● Ошибка связи с CRM ' + (msg || '') : '● Нет связи с CRM — договоры сохраняются только в этом браузере';
    el.title = 'База договоров хранится в CRM; копии файлов — на сервере CRM';
  }
  function mergeLists(a, b, dead) {
    const m = new Map();
    for (const x of [...(a || []), ...(b || [])]) {
      if (dead.has(x.id)) continue;
      const o = m.get(x.id);
      if (!o || (x.updatedAt || '') > (o.updatedAt || '')) m.set(x.id, x);
    }
    return [...m.values()];
  }
  function mergeDB(a, b) {
    const dead = new Set([...(a.deleted || []), ...(b.deleted || [])]);
    return { clients: mergeLists(a.clients, b.clients, dead), contracts: mergeLists(a.contracts, b.contracts, dead), deleted: [...dead] };
  }
  async function syncNow() {
    if (!apiOk || syncBusy) return false;
    syncBusy = true;
    try {
      setSync('busy');
      const remote = await (await fetch('/api/db', { cache: 'no-store' })).json();
      DB = mergeDB(DB, remote);
      const r = await fetch('/api/db', { method: 'PUT', body: JSON.stringify(DB, null, 1) });
      if (!r.ok) throw new Error(await r.text());
      try { localStorage.setItem(KEY, JSON.stringify(DB)); } catch (e) {}
      setSync(serverInfo && serverInfo.mode === 'local' ? 'local' : 'ok');
      return true;
    } catch (e) { console.error(e); setSync('err', e.message); return false; }
    finally { syncBusy = false; }
  }
  function scheduleSync() { if (!apiOk) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 500); }
  async function connectFolder() {
    if (!apiOk) { await initFolder(); if (!apiOk) return alert('Приложение открыто не через сервер.\nЗакройте эту вкладку и запустите файл «Запуск.bat» в папке приложения (окно с чёрным фоном не закрывать).'); }
    if (await syncNow()) { refreshPage(); toast('Синхронизировано'); }
  }
  async function initFolder() {
    try {
      serverInfo = await (await fetch('/api/status', { cache: 'no-store' })).json();
      apiOk = true;
      await syncNow(); refreshPage();
    } catch (e) { apiOk = false; setSync('off'); }
  }
  async function saveCopy(blob, rec, ext) { // копия файла договора в папку сервера
    if (!apiOk) return;
    try {
      // МПБ: файл кладётся в папку договора «МПБ\№номер Заказчик» на сервере; ИП Шубинов — как раньше
      const q = rec.company === 'mpb'
        ? `mpb=1&dir=${encodeURIComponent(folderName(rec))}`
        : `dir=${encodeURIComponent('ИП Шубинов Д.А.')}`;
      await fetch(`/api/file?${q}&name=${encodeURIComponent(fileName(rec) + '.' + ext)}`, { method: 'PUT', body: blob });
    } catch (e) { console.error(e); }
  }
  /* ---------- Вход по PIN (если на сервере включён: файл pins.json) ---------- */
  let pin = ''; try { pin = localStorage.getItem('contracts_pin') || ''; } catch (e) {}
  const rawFetch = window.fetch.bind(window);
  let asking = null;
  // Хранилище — мост CRM (адрес, ключ и сессия те же, что у CRM): /api/db → {мост}/api/cg/db
  function bridgeCfg() { try { const c = JSON.parse(localStorage.getItem('ds_bridge') || '{}'); return { url: String(c.url || '').replace(/\/+$/, ''), key: c.key || '' }; } catch (e) { return { url: '', key: '' }; } }
  window.fetch = (url, opts) => {
    if (typeof url === 'string' && url.startsWith('/api/')) {
      const c = bridgeCfg();
      if (!c.url || !c.key) return Promise.reject(new Error('Мост CRM не настроен'));
      let sess = ''; try { sess = localStorage.getItem('ds_session') || ''; } catch (e) {}
      url = c.url + '/api/cg/' + url.slice(5);
      opts = Object.assign({}, opts, { headers: Object.assign({}, opts && opts.headers, { 'X-Api-Key': c.key, 'X-Session': sess }) });
    }
    return rawFetch(url, opts);
  };
  async function ensureAuth() { return; }   // вход выполняется в самой CRM
  function askPin(msg) {
    if (asking) return asking;
    asking = new Promise(resolve => {
      const err = h('div', { style: 'color:#b42318;min-height:1.3em;margin:6px 0' }, msg || '');
      const inp = h('input', { type: 'password', inputmode: 'numeric', maxlength: '8', autocomplete: 'off', placeholder: 'PIN', style: 'width:100%;font-size:22px;text-align:center;letter-spacing:.3em;padding:10px;border:1px solid #c4ccd8;border-radius:8px' });
      const btn = h('button', { class: 'btn primary', style: 'width:100%;margin-top:6px', type: 'button' }, 'Войти');
      const box = h('div', { style: 'position:fixed;inset:0;background:#f3f5f8;z-index:200;display:flex;align-items:center;justify-content:center' },
        h('div', { style: 'background:#fff;border:1px solid #d9dee6;border-radius:12px;padding:24px 28px;width:min(340px,92vw);box-shadow:0 4px 20px #0002' },
          h('h2', { style: 'margin:0 0 4px' }, '🔥 Генератор договоров'), h('div', { style: 'color:#6b7785;margin-bottom:10px' }, 'Введите ваш PIN'), inp, err, btn));
      const go = async () => {
        const v = inp.value.trim(); if (!v) return;
        btn.disabled = true;
        try {
          const r = await rawFetch('/api/auth', { headers: { 'X-Pin': v } });
          if (r.ok) { pin = v; try { localStorage.setItem('contracts_pin', v); } catch (e) {} box.remove(); asking = null; resolve(); return; }
          err.textContent = r.status === 401 && (await r.text()) === 'locked' ? 'Слишком много попыток. Подождите 10 минут.' : 'Неверный PIN';
        } catch (e) { err.textContent = 'Нет связи с сервером'; }
        btn.disabled = false; inp.value = ''; inp.focus();
      };
      btn.addEventListener('click', go); inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      document.body.append(box); inp.focus();
    });
    return asking;
  }
  function refreshPage() { const on = document.querySelector('nav button.on'); if (on && on.dataset.p !== 'new') show(on.dataset.p); }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ---------- Справочники ---------- */
  const SVC_PRESETS = [
    'Разработка проектной документации системы пожарной сигнализации и системы оповещения и управления эвакуацией людей при пожаре (СПС, СОУЭ)',
    'Разработка проектной документации системы пожарной сигнализации (СПС)',
    'Разработка проектной документации системы оповещения и управления эвакуацией людей при пожаре (СОУЭ)',
    'Разработка проектной документации аварийного освещения',
    'Разработка проектной документации огнезащитной обработки',
    'Расчет пожарного риска',
    'Расчет категорий помещений по взрывопожарной и пожарной опасности',
    'Разработка планов эвакуации',
    'Разработка документации по пожарной безопасности',
    'Выезд специалиста на объект',
  ];
  const EXT_PRESETS = ['Огнетушитель порошковый ОП-2', 'Огнетушитель порошковый ОП-4', 'Огнетушитель порошковый ОП-5', 'Огнетушитель порошковый ОП-8', 'Огнетушитель порошковый ОП-10', 'Огнетушитель порошковый ОП-25',
    'Огнетушитель углекислотный ОУ-2', 'Огнетушитель углекислотный ОУ-3', 'Огнетушитель углекислотный ОУ-5', 'Огнетушитель углекислотный ОУ-8'];

  const FIELDS = {
    services: [
      { k: 'object', label: 'Адрес объекта (после «на объекте, по адресу:»)', ph: 'Санкт-Петербург, ул. Орджоникидзе, д. 59, корп. 2', w: 2 },
      { k: 'termDays', label: 'Срок оказания услуг, раб. дней', kind: 'number' },
      { k: 'payDays', label: 'Срок оплаты аванса и остатка, раб. дней', kind: 'number' },
      { k: 'advPct', label: 'Аванс, %', kind: 'number' },
      { k: 'warranty', label: 'Гарантия, мес.', kind: 'number' },
      { k: 'msgs', label: 'Мессенджеры рабочего чата', w: 2 },
      { k: 'survey', label: 'Объем услуг включает обследование объекта', kind: 'check', w: 3 },
      { k: 'withPrint', label: 'С печатью документации (заказчику: PDF + бумажные экземпляры)', kind: 'check', w: 3 },
      { k: 'printCopies', label: 'Печатных экземпляров, шт.', kind: 'number', show: d => d.withPrint },
      { k: 'printPrice', label: 'Цена печати за 1 экз., руб.', kind: 'number', show: d => d.withPrint },
      { k: 'withTz', label: 'Приложение № 3 «Техническое задание»', kind: 'check', w: 3 },
      { k: 'tzSheets', label: 'ТЗ — количество листов', show: d => d.withTz },
      { k: 'rows', kind: 'rows', label: 'Услуги (Приложение № 1)', presets: SVC_PRESETS, addLabel: '+ Добавить услугу', cols: [
        { k: 'name', label: 'Наименование услуги (можно править / писать свою)', type: 'area', w: 5 },
        { k: 'price', label: 'Цена за ед., руб.', type: 'number', w: 1.4 },
        { k: 'unit', label: 'Ед. изм.', w: 1 },
        { k: 'qty', label: 'Кол-во', type: 'number', w: 0.8 }] },
    ],
    install: [
      { k: 'address', label: 'Адрес объекта', w: 3, ph: 'г. Санкт-Петербург, ул. …' },
      { k: 'projCode', label: 'Шифр проекта' },
      { k: 'sysAbbr', label: 'Системы (аббревиатура)' },
      { k: 'sysFull', label: 'Системы (полное наименование, в род. падеже: «для …»)', w: 2 },
      { k: 'eqCost', label: 'Стоимость оборудования и материалов, руб.', kind: 'number' },
      { k: 'workCost', label: 'Стоимость работ, руб.', kind: 'number' },
      { k: 'advEqPct', label: 'Аванс от оборудования, %', kind: 'number' },
      { k: 'advWorkPct', label: 'Аванс от работ, %', kind: 'number' },
      { k: 'payDays', label: 'Срок оплаты, раб. дней', kind: 'number' },
      { k: 'termDays', label: 'Срок поставки и работ, раб. дней', kind: 'number' },
      { k: 'warranty', label: 'Гарантия на работы, мес.', kind: 'number' },
      { k: 'fixDays', label: 'Устранение недостатков, раб. дней', kind: 'number' },
      { k: 'fixCritDays', label: 'Устранение при неработоспособности, раб. дней', kind: 'number' },
      { k: 'docCopies', label: 'Экз. исполнительной документации (бумага)', kind: 'number' },
      { k: 'msgs', label: 'Мессенджеры рабочего чата' },
      { k: 'eqName', label: 'Приложение № 1 — строка оборудования (пусто = стандартная)', w: 3 },
      { k: 'workName', label: 'Приложение № 1 — строка работ (пусто = стандартная)', w: 3 },
    ],
    toSps: [
      { k: 'address', label: 'Адрес объекта', w: 3 },
      { k: 'sps', label: 'ТО СПС (пожарная сигнализация)', kind: 'check' },
      { k: 'sou', label: 'ТО СОУЭ (оповещение и эвакуация)', kind: 'check' },
      { k: 'price', label: 'Стоимость ТО в месяц, руб.', kind: 'number' },
      { k: 'tripPrice', label: 'Стоимость доп. выезда, руб.', kind: 'number' },
      { k: 'freeTrips', label: 'Бесплатных выездов на ложные срабатывания в квартал', kind: 'number' },
      { k: 'payDays', label: 'Срок оплаты, банковских дней', kind: 'number' },
      { k: 'react1', label: 'Реакция: полная неработоспособность, раб. дн.', kind: 'number' },
      { k: 'react2', label: 'Реакция: иные неисправности, раб. дн.', kind: 'number' },
      { k: 'react3', label: 'Срок замены блоков, раб. дн.', kind: 'number' },
      { k: 'indexation', label: 'Ежегодная индексация по ИПЦ (п. 3.6)', kind: 'check' },
      { k: 'msgs', label: 'Мессенджеры рабочего чата' },
      { k: 'officials', kind: 'rows', label: 'Должностные лица Заказчика (п. 5.5)', addLabel: '+ Добавить', cols: [
        { k: 'pos', label: 'Должность', w: 2 }, { k: 'fio', label: 'ФИО', w: 2 }, { k: 'phone', label: 'Телефон', w: 1.5 }] },
    ],
    toMod: null,
    toExt: [
      { k: 'address', label: 'Адрес объекта', w: 3 },
      { k: 'price', label: 'Стоимость ТО за квартал, руб.', kind: 'number' },
      { k: 'payDays', label: 'Срок оплаты, раб. дней', kind: 'number' },
      { k: 'endDate', label: 'Договор действует до', kind: 'date' },
      { k: 'autoProlong', label: 'Автопролонгация на следующий год', kind: 'check' },
      { k: 'indexation', label: 'Индексация по ИПЦ с 1 января', kind: 'check', show: d => d.autoProlong },
      { k: 'msgs', label: 'Мессенджеры рабочего чата' },
      { k: 'items', kind: 'rows', label: 'Перечень огнетушителей', presets: EXT_PRESETS, addLabel: '+ Добавить тип', cols: [
        { k: 'name', label: 'Наименование (выберите или впишите)', w: 4 }, { k: 'qty', label: 'Кол-во, шт.', type: 'number', w: 1 }] },
    ],
  };

  FIELDS.toMpt = FIELDS.toSps.filter(f => f.k !== 'sps' && f.k !== 'sou').concat([{ k: 'items', kind: 'rows', label: 'Модули пожаротушения (в составе установки)', presets: ['Модуль порошкового пожаротушения МПП-100', 'Модуль порошкового пожаротушения МПП-50', 'Модуль газового пожаротушения'], addLabel: '+ Добавить модуль', cols: [{ k: 'name', label: 'Наименование модуля', w: 4 }, { k: 'qty', label: 'Кол-во, шт.', type: 'number', w: 1 }] }]);
  FIELDS.toMod = FIELDS.toExt.map(f => f.k === 'items' ? Object.assign({}, f, { label: 'Перечень модулей пожаротушения', presets: ['Модуль порошкового пожаротушения МПП-100', 'Модуль порошкового пожаротушения МПП-50', 'Модуль порошкового пожаротушения «Буран-2,5»', 'Модуль газового пожаротушения', 'Модуль тонкораспыленной воды'], addLabel: '+ Добавить тип модуля', cols: [{ k: 'name', label: 'Наименование модуля (выберите или впишите)', w: 4 }, { k: 'qty', label: 'Кол-во, шт.', type: 'number', w: 1 }] }) : f);

  function defaults(type, company) {
    const ex = EX[company];
    const y = new Date().getFullYear();
    switch (type) {
      case 'services': return { object: '', termDays: 30, payDays: 5, advPct: 50, warranty: 24, msgs: company === 'shub' ? 'WhatsApp, Telegram, Max' : 'WhatsApp, Telegram, Max',
        survey: true, withPrint: false, printCopies: 1, printPrice: '', withTz: true, tzSheets: '', rows: [{ name: '', price: '', unit: 'Услуга', qty: 1 }] };
      case 'install': return { address: '', projCode: '', sysAbbr: 'СПС и СОУЭ', sysFull: 'системы пожарной сигнализации и системы оповещения и управления эвакуацией людей при пожаре',
        eqCost: '', workCost: '', advEqPct: 100, advWorkPct: 50, payDays: 5, termDays: 20, warranty: 12, fixDays: 10, fixCritDays: 3, docCopies: 1, msgs: 'MAX', eqName: '', workName: '' };
      case 'toSps': return { address: '', sps: true, sou: true, price: '', tripPrice: 3000, freeTrips: 5, payDays: 5, react1: 1, react2: 3, react3: 15, indexation: true, msgs: ex.msgs,
        officials: [{ pos: '', fio: '', phone: '' }, { pos: '', fio: '', phone: '' }] };
      case 'toMpt': return Object.assign(defaults('toSps', company), { items: [{ name: 'Модуль порошкового пожаротушения МПП-100', qty: '' }] });
      case 'toMod': return Object.assign(defaults('toExt', company), { items: [{ name: 'Модуль порошкового пожаротушения МПП-100', qty: '' }] });
      case 'toExt': return { address: '', price: '', payDays: 5, endDate: `${y}-12-31`, autoProlong: true, indexation: true, msgs: ex.msgs, items: [{ name: 'Огнетушитель порошковый ОП-4', qty: '' }] };
    }
  }
  const blankClient = () => ({ type: 'org', gender: 'm', full: '', short: '', posGen: 'Генерального директора', fioGen: '', basis: 'Устава', ipFio: '',
    inn: '', kpp: '', ogrn: '', addr: '', rs: '', bank: '', bankInn: '', bik: '', ks: '', email: '', phone: '', signPos: 'Генеральный директор', signOrg: '', signFio: '', pre: '', preManual: false });

  /* ---------- Состояние формы ---------- */
  let S = null;
  function newContract(type, company) {
    type = type || 'services'; company = company || 'shub';
    const c = blankClient(); c.pre = clientPre(c);
    return { id: null, type, company, number: '', date: today(), city: EX[company].city, clientId: '', client: c, data: defaults(type, company) };
  }

  /* ---------- Построение документа ---------- */
  function buildDoc(rec) { return TYPES[rec.type].build(rec); }
  function fileName(rec) {
    const c = rec.client;
    const who = c.type === 'ip' ? c.ipFio : (c.short || c.full);
    return `Договор №${rec.number} ${who || ''}`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  }
  function clientName(rec) { const c = rec.client; return (c.type === 'ip' ? c.ipFio : (c.short || c.full)) || ''; }
  function folderName(rec) { // папка договора на сервере, как уже заведено: «118-ТО ВЕЛЕСАРТ ГРУПП» (номер + заказчик без ООО/ИП и кавычек)
    const who = clientName(rec).replace(/^(ООО|ИП|АО|ПАО|ЗАО|НКО|ОАО)\s+/i, '').replace(/[«»"]/g, '');
    return `${String(rec.number).trim()} ${who}`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  }

  /* ---------- Связь с CRM МПБ: новый договор МПБ → задача + папка на сервере ---------- */
  const CRM_URL = 'https://script.google.com/macros/s/AKfycby6jhByQ02pEOiEn1CYeN45o1lDE6d72UNU0Qn2B-09KqzEKxcQLiem5TDJHhkwUfs-/exec';
  const CRM_STAGE = 'Договор Подписать'; // первый этап в CRM («Подписать договор»)
  function crmCfg() { try { return JSON.parse(localStorage.getItem('mpb_crm') || '{}'); } catch (e) { return {}; } }
  async function crmCall(fn, ...args) {
    const cfg = crmCfg();
    let key = cfg.key;
    if (!key) {
      key = (prompt('Ключ доступа к CRM МПБ (API_KEY из настроек скрипта).\nНужен один раз — для создания задач из договоров.') || '').trim();
      if (!key) throw new Error('не задан ключ CRM');
    }
    const r = await fetch(cfg.url || CRM_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key, fn, args }) });
    const j = await r.json();
    if (!j || !j.ok) { if (j && /ключ/i.test(j.error || '')) { try { localStorage.removeItem('mpb_crm'); } catch (e) {} } throw new Error((j && j.error) || 'ошибка сервера CRM'); }
    try { localStorage.setItem('mpb_crm', JSON.stringify({ url: cfg.url || CRM_URL, key })); } catch (e) {}
    return j.data;
  }
  let crmBusy = false;
  async function crmSync(rec) {          // выполняется один раз на договор: папка + задача
    if (rec.company !== 'mpb' || crmBusy || !rec.crm || !rec.crm.pending) return;
    const done = rec.crm;
    crmBusy = true;
    const msgs = [], res = { folder: done.folder, task: done.task };
    try {
      if (!res.folder && apiOk) {
        try {
          const r = await fetch(`/api/mkdir?name=${encodeURIComponent(folderName(rec))}`, { method: 'POST' });
          if (r.ok) { res.folder = (await r.json()).path; msgs.push('папка создана'); }
          else msgs.push('папка НЕ создана');
        } catch (e) { msgs.push('папка НЕ создана'); }
      } else if (!res.folder) msgs.push('папка НЕ создана (нет связи с сервером)');
      if (!res.task) {
        try {
          const d = rec.data || {};
          await crmCall('api_createTask', {
            customer: clientName(rec), workType: TYPES[rec.type].label, address: d.address || d.object || '',
            contractNo: String(rec.number).trim(), manager: '', startDate: rec.date, dueDate: '', stage: CRM_STAGE, deadline: '',
            siteContact: '', siteContactPhone: '', closed: false,
            comment: `Договор №${rec.number} от ${rec.date} создан в генераторе договоров.` + (res.folder ? `\nПапка: ${res.folder}` : '')
          });
          res.task = true; msgs.push('задача создана в CRM');
        } catch (e) { msgs.push('задача в CRM НЕ создана: ' + e.message); }
      }
      res.pending = !(res.folder && res.task);   // пока что-то не сделано — повторим при следующем сохранении
      const upd = x => { if (x) x.crm = Object.assign({}, x.crm, res); };
      upd(S && S.id === rec.id ? S : null); upd(DB.contracts.find(c => c.id === rec.id));
      saveDB();
      toast(msgs.join(', '));
    } finally { crmBusy = false; }
  }
  function validate(rec) {
    const errs = [];
    if (!String(rec.number).trim()) errs.push('Не указан номер договора');
    if (!rec.date) errs.push('Не указана дата договора');
    const c = rec.client;
    if (!(c.type === 'ip' ? c.ipFio : c.full)) errs.push('Не заполнен Заказчик');
    return errs;
  }
  function saveContract() {
    const errs = validate(S);
    if (errs.length) { alert(errs.join('\n')); return false; }
    const dup = DB.contracts.find(c => c.company === S.company && c.id !== S.id && String(c.number).trim().toLowerCase() === String(S.number).trim().toLowerCase());
    if (dup && !confirm(`В базе ${EX[S.company].label} уже есть договор № ${S.number} (${dup.client.short || dup.client.full || dup.client.ipFio}). Всё равно сохранить?`)) return false;
    if (!S.id && S.company === 'mpb') S.crm = { pending: true };   // только НОВЫЕ договоры МПБ создают задачу и папку
    const rec = clone(S);
    rec.updatedAt = new Date().toISOString();
    if (!rec.id) { rec.id = uid(); rec.createdAt = rec.updatedAt; S.id = rec.id; DB.contracts.push(rec); }
    else { const i = DB.contracts.findIndex(c => c.id === rec.id); if (i >= 0) { rec.createdAt = DB.contracts[i].createdAt; DB.contracts[i] = rec; } else DB.contracts.push(rec); }
    saveDB();
    crmSync(rec);
    return true;
  }

  /* ---------- Элементы формы ---------- */
  function inputFor(f, obj, onChange) {
    const kind = f.kind || 'text';
    if (kind === 'check') {
      return h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: obj[f.k], onchange: e => { obj[f.k] = e.target.checked; onChange(true); } }), ' ' + f.label);
    }
    const inp = h(f.type === 'area' ? 'textarea' : 'input', {
      type: f.type === 'area' ? null : (kind === 'number' ? 'text' : kind === 'date' ? 'date' : 'text'),
      inputmode: kind === 'number' ? 'decimal' : null, placeholder: f.ph || '', rows: f.type === 'area' ? 2 : null,
      value: obj[f.k] == null ? '' : obj[f.k], oninput: e => { obj[f.k] = e.target.value; onChange(false); },
    });
    return h('label', { class: 'fld w' + (f.w || 1) }, h('span', {}, f.label), inp);
  }

  function rowsWidget(f, d, onChange) {
    const box = h('div', { class: 'rows w3' });
    const draw = () => {
      box.innerHTML = '';
      box.append(h('div', { class: 'rows-title' }, f.label));
      (d[f.k] || []).forEach((row, i) => {
        const line = h('div', { class: 'rowline' });
        if (f.presets) {
          line.append(h('select', { class: 'preset', onchange: e => { if (e.target.value) { row.name = e.target.value; onChange(false); draw(); } } },
            h('option', { value: '' }, '— выбрать из списка —'), f.presets.map(p => h('option', { value: p }, p.length > 60 ? p.slice(0, 58) + '…' : p))));
        }
        const cells = h('div', { class: 'cells' });
        f.cols.forEach(c => cells.append(h('label', { class: 'fld', style: `flex:${c.w || 1}` }, h('span', {}, c.label),
          h(c.type === 'area' ? 'textarea' : 'input', { type: 'text', rows: c.type === 'area' ? 2 : null, inputmode: c.type === 'number' ? 'decimal' : null, value: row[c.k] == null ? '' : row[c.k],
            oninput: e => { row[c.k] = e.target.value; onChange(false); } }))));
        cells.append(h('button', { class: 'x', title: 'Удалить строку', type: 'button', onclick: () => { d[f.k].splice(i, 1); onChange(false); draw(); } }, '✕'));
        line.append(cells);
        box.append(line);
      });
      box.append(h('button', { class: 'btn small', type: 'button', onclick: () => {
        const r = {}; f.cols.forEach(c => r[c.k] = c.k === 'qty' ? 1 : (c.k === 'unit' ? 'Услуга' : '')); d[f.k].push(r); onChange(false); draw();
      } }, f.addLabel || '+ Добавить'));
    };
    draw();
    return box;
  }

  /* ---------- Форма клиента ---------- */
  function clientForm(cl, onChange, rerender) {
    const refreshPre = () => { if (!cl.preManual) cl.pre = clientPre(cl); };
    const upd = (structural) => { refreshPre(); if (structural) rerender(); else { const t = $('#preTa'); if (t && !cl.preManual) t.value = cl.pre; } onChange(); };
    const F = (k, label, w, ph) => ({ k, label, w, ph });
    const org = cl.type !== 'ip';
    const grid = h('div', { class: 'grid' });
    grid.append(h('label', { class: 'fld' }, h('span', {}, 'Тип заказчика'),
      h('select', { onchange: e => { cl.type = e.target.value; if (cl.type === 'ip') { cl.signPos = 'Индивидуальный предприниматель'; } else if (cl.signPos === 'Индивидуальный предприниматель') cl.signPos = 'Генеральный директор'; upd(true); } },
        h('option', { value: 'org', selected: org }, 'Организация (ООО, АО, НКО…)'), h('option', { value: 'ip', selected: !org }, 'Индивидуальный предприниматель'))));
    const list = org ? [
      F('full', 'Полное наименование', 3, 'Общество с ограниченной ответственностью «…»'), F('short', 'Краткое наименование', 1, 'ООО «…»'),
      F('posGen', 'В лице (должность, род. падеж)', 1, 'Генерального директора'), F('fioGen', 'ФИО в род. падеже', 1, 'Иванова Ивана Ивановича'), F('basis', 'Действует на основании', 1, 'Устава'),
      F('kpp', 'КПП'), F('signPos', 'Должность подписанта (для подписи)', 1, 'Генеральный директор'), F('signOrg', 'Организация в подписи', 1, 'ООО «…»'), F('signFio', 'Подписант: Фамилия И.О.', 1, 'Иванов И.И.'),
    ] : [
      F('ipFio', 'ФИО индивидуального предпринимателя', 3, 'Иванов Иван Иванович'),
    ];
    list.forEach(f => grid.append(inputFor(f, cl, () => upd(false))));
    if (!org) grid.append(h('label', { class: 'fld' }, h('span', {}, 'Пол ИП'), h('select', { onchange: e => { cl.gender = e.target.value; upd(false); } },
      h('option', { value: 'm', selected: cl.gender !== 'f' }, 'мужской (действующий / именуемый)'), h('option', { value: 'f', selected: cl.gender === 'f' }, 'женский (действующая / именуемая)'))));
    [F('inn', 'ИНН'), F('ogrn', org ? 'ОГРН' : 'ОГРНИП'), F('addr', 'Юридический адрес', 3), F('rs', 'Расчётный счёт'), F('bank', 'Банк', 2), F('bik', 'БИК'), F('ks', 'Корр. счёт'), F('bankInn', 'ИНН банка (если нужен)'), F('email', 'E-mail'), F('phone', 'Телефон')]
      .forEach(f => grid.append(inputFor(f, cl, () => upd(false))));
    const pre = h('div', { class: 'w3 pre' },
      h('label', { class: 'fld' }, h('span', {}, 'Текст о Заказчике в начале договора (формируется автоматически, можно править вручную)'),
        h('textarea', { id: 'preTa', rows: 3, value: cl.pre, oninput: e => { cl.pre = e.target.value; cl.preManual = true; onChange(); } })),
      h('button', { class: 'btn small', type: 'button', onclick: () => { cl.preManual = false; cl.pre = clientPre(cl); rerender(); onChange(); } }, 'Собрать текст заново'));
    grid.append(pre);
    return grid;
  }

  /* ---------- Страница «Новый договор» ---------- */
  let previewTimer = null;
  function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 250); }
  function renderPreview() {
    const box = $('#preview'); if (!box) return;
    try { box.innerHTML = R.toHtml(buildDoc(S)); } catch (e) { box.innerHTML = '<p style="color:#b00">Ошибка предпросмотра: ' + e.message + '</p>'; console.error(e); }
    renderSummary();
  }
  function summaryText() {
    const d = S.data, f = U.fmt;
    if (S.type === 'services') {
      const rows = (d.rows || []).filter(r => (r.name || '').trim());
      const t = r2(rows.reduce((s, r) => s + num(r.price) * num(r.qty), 0) + (d.withPrint ? num(d.printPrice) * (num(d.printCopies) || 1) : 0));
      const adv = r2(t * (num(d.advPct) || 50) / 100);
      return `Итого: ${f(t)} ₽ · аванс ${f(adv)} ₽ · остаток ${f(r2(t - adv))} ₽`;
    }
    if (S.type === 'install') {
      const t = r2(num(d.eqCost) + num(d.workCost));
      const a = r2(num(d.eqCost) * num(d.advEqPct) / 100 + num(d.workCost) * num(d.advWorkPct) / 100);
      return `Итого: ${f(t)} ₽ · аванс ${f(a)} ₽ · окончательный расчёт ${f(r2(t - a))} ₽`;
    }
    if (S.type === 'toSps') return `ТО в месяц: ${f(num(d.price))} ₽ · в год: ${f(num(d.price) * 12)} ₽`;
    return `ТО за квартал: ${f(num(d.price))} ₽ · в год: ${f(num(d.price) * 4)} ₽`;
  }
  function renderSummary() { const s = $('#summary'); if (s) s.textContent = summaryText(); }

  function lastNumbers(company) {
    return DB.contracts.filter(c => c.company === company).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 3).map(c => c.number).join(', ');
  }

  function pageNew() {
    const root = h('div', { class: 'two-col' });
    const left = h('div', { class: 'form' }), right = h('div', { class: 'prev' });
    root.append(left, right);
    right.append(h('div', { class: 'prev-title' }, 'Предварительный просмотр'), h('div', { id: 'preview', class: 'paper' }));

    const draw = () => {
      left.innerHTML = '';
      const ex = EX[S.company];
      const allowed = TYPES[S.type].companies;

      // 1. Тип и исполнитель
      const sec1 = h('section', {}, h('h3', {}, '1. Тип договора и Исполнитель'));
      const g1 = h('div', { class: 'grid' });
      g1.append(h('label', { class: 'fld w2' }, h('span', {}, 'Тип договора'), h('select', { onchange: e => {
        S.type = e.target.value; if (!TYPES[S.type].companies.includes(S.company)) S.company = TYPES[S.type].companies[0];
        S.data = defaults(S.type, S.company); S.city = EX[S.company].city; draw(); renderPreview();
      } }, Object.entries(TYPES).map(([k, v]) => h('option', { value: k, selected: S.type === k }, v.label)))));
      const radios = h('div', { class: 'fld' }, h('span', {}, 'Исполнитель (база договоров)'));
      Object.values(EX).forEach(e => {
        if (e.key !== 'shub') return;
        const dis = !allowed.includes(e.key);
        radios.append(h('label', { class: 'radio' + (dis ? ' dis' : '') }, h('input', { type: 'radio', name: 'co', disabled: dis, checked: S.company === e.key, onchange: () => {
          const wasDefaultCity = S.city === EX[S.company].city;
          S.company = e.key; if (wasDefaultCity) S.city = EX[S.company].city;
          S.data.msgs = (S.type === 'install') ? 'MAX' : EX[S.company].msgs; draw(); renderPreview();
        } }), ' ' + e.label));
      });
      g1.append(radios);
      sec1.append(g1);
      if (S.type === 'services' && S.company === 'mpb') sec1.append(h('p', { class: 'hint' }, 'Для МПБ подставляются реквизиты МПБ, налог (УСН), подсудность СПб и ЛО.'));
      left.append(sec1);

      // 2. Реквизиты договора
      const sec2 = h('section', {}, h('h3', {}, '2. Номер, дата, город'));
      const g2 = h('div', { class: 'grid' });
      g2.append(h('label', { class: 'fld' }, h('span', {}, `Номер договора (вручную) — база ${ex.label}`),
        h('input', { type: 'text', value: S.number, placeholder: TYPES[S.type].prefix ? '123' + TYPES[S.type].prefix : '123', oninput: e => { S.number = e.target.value; schedulePreview(); checkDup(); } })));
      g2.append(h('label', { class: 'fld' }, h('span', {}, 'Дата договора'), h('input', { type: 'date', value: S.date, oninput: e => { S.date = e.target.value; schedulePreview(); } })));
      g2.append(h('label', { class: 'fld' }, h('span', {}, 'Город'), h('input', { type: 'text', value: S.city, oninput: e => { S.city = e.target.value; schedulePreview(); } })));
      sec2.append(g2, h('p', { class: 'hint', id: 'dupHint' }, `Последние номера в базе ${ex.label}: ${lastNumbers(S.company) || '—'}`));
      left.append(sec2);

      // 3. Заказчик
      const sec3 = h('section', {}, h('h3', {}, '3. Заказчик'));
      const pick = h('select', { onchange: e => {
        const c = DB.clients.find(x => x.id === e.target.value);
        S.clientId = e.target.value;
        if (c) { S.client = clone(c.data); if (!S.client.pre) S.client.pre = clientPre(S.client); }
        else { S.client = blankClient(); S.client.pre = clientPre(S.client); }
        draw(); renderPreview();
      } }, h('option', { value: '' }, '— новый заказчик / выбрать из базы —'),
        DB.clients.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(c => h('option', { value: c.id, selected: S.clientId === c.id }, c.name)));
      sec3.append(h('label', { class: 'fld' }, h('span', {}, 'Клиент из базы'), pick));
      sec3.append(clientForm(S.client, () => schedulePreview(), () => { const sc = left.scrollTop; draw(); renderPreview(); }));
      sec3.append(h('div', { class: 'actions' }, h('button', { class: 'btn small', type: 'button', onclick: () => {
        const name = S.client.type === 'ip' ? S.client.ipFio : (S.client.short || S.client.full);
        if (!name) return alert('Заполните наименование заказчика');
        const rec = { id: S.clientId || uid(), name, data: clone(S.client), updatedAt: new Date().toISOString() };
        const i = DB.clients.findIndex(c => c.id === rec.id);
        if (i >= 0) DB.clients[i] = rec; else DB.clients.push(rec);
        S.clientId = rec.id; saveDB(); draw(); toast(i >= 0 ? 'Клиент обновлён в базе' : 'Клиент добавлен в базу');
      } }, S.clientId ? 'Обновить клиента в базе' : 'Сохранить клиента в базу')));
      left.append(sec3);

      // 4. Параметры
      const sec4 = h('section', {}, h('h3', {}, '4. Условия договора: ' + TYPES[S.type].label));
      const g4 = h('div', { class: 'grid' });
      FIELDS[S.type].forEach(f => {
        if (f.show && !f.show(S.data)) return;
        if (f.kind === 'rows') g4.append(rowsWidget(f, S.data, () => schedulePreview()));
        else g4.append(inputFor(f, S.data, (structural) => { if (structural) { draw(); } renderPreview(); }));
      });
      sec4.append(g4, h('div', { class: 'summary', id: 'summary' }));
      left.append(sec4);

      // Кнопки
      left.append(h('div', { class: 'actions sticky' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => out('docx') }, '⬇ Скачать Word (.docx)'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => out('pdf') }, '⬇ Скачать PDF'),
        h('button', { class: 'btn', type: 'button', onclick: () => { if (saveContract()) { toast('Сохранено в историю'); draw(); } } }, 'Сохранить в историю'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { if (confirm('Очистить форму и начать новый договор?')) { S = newContract(S.type, S.company); draw(); renderPreview(); } } }, 'Новый')));
      renderSummary();
    };
    function checkDup() {
      const el = $('#dupHint'); if (!el) return;
      const dup = DB.contracts.find(c => c.company === S.company && c.id !== S.id && String(c.number).trim().toLowerCase() === String(S.number).trim().toLowerCase() && S.number);
      el.className = 'hint' + (dup ? ' warn' : '');
      el.textContent = dup ? `⚠ Номер ${S.number} уже есть в базе ${EX[S.company].label} (${dup.client.short || dup.client.full || dup.client.ipFio})` : `Последние номера в базе ${EX[S.company].label}: ${lastNumbers(S.company) || '—'}`;
    }
    async function out(kind) {
      if (!saveContract()) return;
      const doc = buildDoc(S), name = fileName(S);
      try {
        if (kind === 'docx') { const bl = await R.downloadDocx(doc, name); saveCopy(bl, S, 'docx'); }
        else { const bl = await R.downloadPdf(doc, name); saveCopy(bl, S, 'pdf'); }
        toast(kind === 'docx' ? 'Word-файл сформирован' : 'PDF-файл сформирован');
      } catch (e) { alert('Ошибка формирования: ' + e.message); console.error(e); }
    }
    root._init = () => { draw(); renderPreview(); };
    return root;
  }

  /* ---------- История ---------- */
  let hFilter = { company: 'all', type: 'all', q: '' };
  function pageHistory() {
    const root = h('div', { class: 'page' });
    const draw = () => {
      root.innerHTML = '';
      const bar = h('div', { class: 'bar' },
        h('div', { class: 'seg' }, [['all', 'Все'], ['shub', 'ИП Шубинов'], ['mpb', 'МПБ']].map(([k, l]) =>
          h('button', { class: hFilter.company === k ? 'on' : '', onclick: () => { hFilter.company = k; draw(); } }, l))),
        h('select', { onchange: e => { hFilter.type = e.target.value; draw(); } }, h('option', { value: 'all' }, 'Все типы'),
          Object.entries(TYPES).map(([k, v]) => h('option', { value: k, selected: hFilter.type === k }, v.label))),
        h('input', { type: 'search', placeholder: 'Поиск по номеру или клиенту', value: hFilter.q, oninput: e => { hFilter.q = e.target.value; drawTable(); } }));
      root.append(h('h2', {}, 'История договоров'), bar);
      const holder = h('div', {}); root.append(holder);
      function drawTable() {
        const q = hFilter.q.toLowerCase();
        const list = DB.contracts.filter(c => (hFilter.company === 'all' || c.company === hFilter.company) && (hFilter.type === 'all' || c.type === hFilter.type)
          && (!q || String(c.number).toLowerCase().includes(q) || (c.client.full + c.client.short + c.client.ipFio).toLowerCase().includes(q)))
          .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
        holder.innerHTML = '';
        if (!list.length) { holder.append(h('p', { class: 'empty' }, 'Договоров нет.')); return; }
        holder.append(h('table', { class: 'list' }, h('thead', {}, h('tr', {}, ['№', 'Дата', 'База', 'Тип', 'Заказчик', ''].map(x => h('th', {}, x)))),
          h('tbody', {}, list.map(c => h('tr', {},
            h('td', {}, c.number), h('td', {}, U.dShort(c.date)), h('td', {}, EX[c.company].label), h('td', {}, TYPES[c.type].label),
            h('td', {}, c.client.type === 'ip' ? 'ИП ' + c.client.ipFio : (c.client.short || c.client.full)),
            h('td', { class: 'acts' },
              h('button', { class: 'btn small', onclick: () => { S = clone(c); show('new'); } }, 'Открыть'),
              h('button', { class: 'btn small', onclick: () => R.downloadDocx(buildDoc(c), fileName(c)) }, 'Word'),
              h('button', { class: 'btn small', onclick: () => R.downloadPdf(buildDoc(c), fileName(c)) }, 'PDF'),
              h('button', { class: 'btn small', title: 'Копия с новым номером', onclick: () => { S = clone(c); S.id = null; S.number = ''; S.date = today(); show('new'); toast('Копия создана — укажите новый номер'); } }, 'Копия'),
              h('button', { class: 'btn small danger', onclick: () => { if (confirm(`Удалить договор № ${c.number} из базы?`)) { DB.contracts = DB.contracts.filter(x => x.id !== c.id); (DB.deleted = DB.deleted || []).push(c.id); saveDB(); drawTable(); } } }, '✕')))))));
      }
      drawTable();
    };
    root._init = draw;
    return root;
  }

  /* ---------- Клиенты ---------- */
  function pageClients() {
    const root = h('div', { class: 'page' });
    let editing = null, q = '';
    const draw = () => {
      root.innerHTML = '';
      root.append(h('h2', {}, 'База клиентов'));
      if (editing) {
        const cl = editing.data;
        root.append(h('h3', {}, editing.isNew ? 'Новый клиент' : 'Редактирование клиента'),
          clientForm(cl, () => {}, draw),
          h('div', { class: 'actions' },
            h('button', { class: 'btn primary', onclick: () => {
              const name = cl.type === 'ip' ? cl.ipFio : (cl.short || cl.full);
              if (!name) return alert('Заполните наименование');
              const rec = { id: editing.id || uid(), name, data: clone(cl), updatedAt: new Date().toISOString() };
              const i = DB.clients.findIndex(c => c.id === rec.id);
              if (i >= 0) DB.clients[i] = rec; else DB.clients.push(rec);
              saveDB(); editing = null; draw();
            } }, 'Сохранить'),
            h('button', { class: 'btn', onclick: () => { editing = null; draw(); } }, 'Отмена')));
        return;
      }
      root.append(h('div', { class: 'bar' }, h('button', { class: 'btn primary', onclick: () => { const c = blankClient(); c.pre = clientPre(c); editing = { id: null, isNew: true, data: c }; draw(); } }, '+ Новый клиент'),
        h('input', { type: 'search', placeholder: 'Поиск', value: q, oninput: e => { q = e.target.value; drawList(); } })));
      const holder = h('div'); root.append(holder);
      function drawList() {
        const list = DB.clients.filter(c => !q || (c.name + c.data.inn).toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        holder.innerHTML = '';
        if (!list.length) { holder.append(h('p', { class: 'empty' }, 'Клиентов нет. Они добавляются здесь или кнопкой «Сохранить клиента в базу» при создании договора.')); return; }
        holder.append(h('table', { class: 'list' }, h('thead', {}, h('tr', {}, ['Клиент', 'ИНН', 'Договоров', ''].map(x => h('th', {}, x)))),
          h('tbody', {}, list.map(c => h('tr', {}, h('td', {}, c.name), h('td', {}, c.data.inn), h('td', {}, DB.contracts.filter(x => x.clientId === c.id).length),
            h('td', { class: 'acts' },
              h('button', { class: 'btn small', onclick: () => { editing = { id: c.id, data: clone(c.data) }; draw(); } }, 'Изменить'),
              h('button', { class: 'btn small', onclick: () => { S = newContract(S.type, S.company); S.clientId = c.id; S.client = clone(c.data); show('new'); } }, 'Договор'),
              h('button', { class: 'btn small danger', onclick: () => { if (confirm(`Удалить клиента «${c.name}» из базы? Уже созданные договоры останутся.`)) { DB.clients = DB.clients.filter(x => x.id !== c.id); (DB.deleted = DB.deleted || []).push(c.id); saveDB(); drawList(); } } }, '✕')))))));
      }
      drawList();
    };
    root._init = draw;
    return root;
  }

  /* ---------- Резерв ---------- */
  function pageBackup() {
    const root = h('div', { class: 'page' });
    root._init = () => {
      root.innerHTML = '';
      root.append(h('h2', {}, 'Резервная копия'),
        h('p', {}, 'Данные хранятся в этом браузере на этом компьютере. Чтобы не потерять базу (очистка браузера, переезд на другой ПК) — регулярно скачивайте копию и храните её рядом с приложением.'),
        h('p', {}, `Сейчас в базе: клиентов — ${DB.clients.length}, договоров — ${DB.contracts.length} (ИП Шубинов: ${DB.contracts.filter(c => c.company === 'shub').length}, МПБ: ${DB.contracts.filter(c => c.company === 'mpb').length}).`),
        h('div', { class: 'actions' },
          h('button', { class: 'btn primary', onclick: () => {
            const blob = new Blob([JSON.stringify(DB, null, 1)], { type: 'application/json' });
            const a = h('a', { href: URL.createObjectURL(blob), download: `база-договоров-${today()}.json` }); document.body.append(a); a.click(); a.remove();
          } }, '⬇ Скачать резервную копию'),
          h('label', { class: 'btn' }, 'Загрузить копию…', h('input', { type: 'file', accept: '.json', style: 'display:none', onchange: e => {
            const f = e.target.files[0]; if (!f) return;
            f.text().then(t => {
              const j = JSON.parse(t);
              if (!Array.isArray(j.clients) || !Array.isArray(j.contracts)) throw new Error('Неверный формат файла');
              if (!confirm(`Заменить текущую базу данными из файла (клиентов: ${j.clients.length}, договоров: ${j.contracts.length})?`)) return;
              DB = Object.assign({ deleted: [] }, j); saveDB(); root._init(); toast('База загружена');
            }).catch(err => alert('Ошибка: ' + err.message));
          } }))));
    };
    return root;
  }

  /* ---------- Каркас ---------- */
  const pages = {};
  function show(name) {
    const main = $('#main');
    main.innerHTML = '';
    pages[name] = ({ new: pageNew, history: pageHistory, clients: pageClients, backup: pageBackup })[name]();
    main.append(pages[name]);
    pages[name]._init();
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.p === name));
  }
  function toast(msg) {
    const t = h('div', { class: 'toast' }, msg); document.body.append(t);
    setTimeout(() => t.classList.add('hide'), 2200); setTimeout(() => t.remove(), 2800);
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadDB();
    const st = document.createElement('style'); st.textContent = R.DOC_CSS; document.head.append(st);
    S = newContract('services', 'shub');
    document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => show(b.dataset.p)));
    if (!storageOk) alert('Браузер не разрешает сохранять данные. База работать не будет — откройте приложение в Chrome/Edge.');
    show('new');
    document.getElementById('syncBadge').addEventListener('click', connectFolder);
    ensureAuth().then(initFolder);
  });
})();
