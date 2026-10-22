/* ДЕМО-ДАННЫЕ ДЛЯ ЛОКАЛЬНОЙ ПРОВЕРКИ ВНЕШНЕГО ВИДА. В продакшен не загружать.
   Подменяет обращения к Apps Script и «мосту» вымышленными данными. */
(function () {
  try {
    localStorage.setItem('mpb_api', JSON.stringify({ url: 'https://script.google.com/macros/s/DEMO/exec', key: 'demo' }));
    localStorage.setItem('mpb_bridge', JSON.stringify({ url: 'http://127.0.0.1:8790', key: 'demo-key-demo-key-demo-key' }));   // стенд моста: dev/crm_dev_app.py
    localStorage.setItem('mpb_to_pin', '0000');
  } catch (e) {}

  function iso(off) { var d = new Date(); d.setDate(d.getDate() + off); return d.toISOString().slice(0, 10); }
  var STAGES = ['Договор Подписать', 'Собрать данные', 'Обследовать', 'Расчет', 'Проектирование', 'Проверка расчета', 'Закупка оборудования', 'Забрать оборудование и доставить на объект', 'Запустить монтаж', 'Сбор данных для исполнительной документации', 'Разработать исполняк', 'Печать документов', 'Сдача работ', 'Работа сдана'];
  var WHO = ['Алексей', 'Алексей', 'Алексей', 'Дмитрий', 'Дмитрий', 'Дмитрий', 'Дмитрий', 'Алексей', 'Алексей', 'Алексей', 'Дмитрий', 'Алексей', 'Алексей', 'Игорь'];
  function T(row, c, a, k, wt, st, off, due, who) {
    return { row: row, customer: c, address: a, contractNo: k, workType: wt, startDate: iso(-60), dueDate: iso(due), stage: STAGES[st], deadline: iso(off), comment: '', siteContact: 'Контактное лицо', siteContactPhone: '+7 900 000-00-00', manager: who || 'Алексей', closed: false, responsible: WHO[st] };
  }
  var tasks = [
    T(2, 'ТЦ «Меридиан»', 'пр. Энергетиков, 14', '118/26', 'Монтаж', 8, 3, 50),
    T(3, 'Школа № 214', 'ул. Лесная, 7', '121/26', 'Монтаж', 3, -1, 70),
    T(4, 'ООО «Северный парк»', 'Парковая ул., 2', '124/26', 'Проектирование', 4, 5, 40),
    T(5, 'БЦ «Атлант»', 'Невский пр., 88', '109/26', 'Монтаж', 11, 1, 16),
    T(6, 'Склад «ЛогистПро»', 'Шушары, Московское ш., 3', '127/26', 'Испытания', 2, 7, 22),
    T(7, 'Гостиница «Нева»', 'наб. Мойки, 41', '125/26', 'Аудит', 1, 9, 31),
    T(8, 'Детский сад № 61', 'ул. Садовая, 19', '126/26', 'Разработка документов', 2, 2, 19),
    T(9, 'АЗС «Север-Нефть»', 'Выборгское ш., 120', '115/26', 'Монтаж', 6, 4, 57),
    T(10, 'ООО «Вектор»', 'Заставская ул., 33', '130/26', 'Испытания', 3, 6, 27)
  ];
  var leads = [
    { row: 2, date: iso(-20), customer: 'ТЦ «Меридиан»', contact: 'Сергей Петров', phoneEmail: '+7 911 204-18-33', funnel: 'Сайт', object: 'Монтаж АПС, 3 этажа', essence: 'Монтаж пожарной сигнализации', amount: 1240000, status: 'Согласование условий', lastContact: iso(-1), owner: 'Алексей', comment: '' },
    { row: 3, date: iso(-25), customer: 'ООО «Северный парк»', contact: 'Андрей Лукин', phoneEmail: '+7 905 118-60-09', funnel: 'Сарафан', object: 'Проект противопожарной защиты', essence: 'Проект СПЗ', amount: 380000, status: 'Переговоры', lastContact: iso(-6), owner: 'Дмитрий', comment: '' },
    { row: 4, date: iso(-9), customer: 'Склад «ЛогистПро»', contact: 'Павел Ермаков', phoneEmail: '+7 911 903-44-70', funnel: 'Алексей', object: 'Испытания ВПВ и огнезащита', essence: 'Испытания', amount: 215000, status: 'КП отправлено', lastContact: iso(-2), owner: 'Алексей', comment: '' },
    { row: 5, date: iso(-2), customer: 'Бизнес-парк «Гранит»', contact: '', phoneEmail: '', funnel: 'Сайт', object: 'Разработка СПЗ', essence: '', amount: 0, status: 'Новое обращение', lastContact: iso(0), owner: 'Дмитрий', comment: '' },
    { row: 6, date: iso(-14), customer: 'Гостиница «Нева»', contact: 'Ольга Тихонова', phoneEmail: '+7 981 313-25-60', funnel: 'Дмитрий', object: 'Аудит пожарной безопасности', essence: 'Аудит', amount: 96000, status: 'КП отправлено', lastContact: iso(-7), owner: 'Дмитрий', comment: '' },
    { row: 7, date: iso(-12), customer: 'АЗС «Север-Нефть»', contact: 'Денис Руднев', phoneEmail: '+7 911 800-90-31', funnel: 'Сарафан', object: 'Монтаж пожаротушения', essence: 'Пожаротушение', amount: 1939000, status: 'Переговоры', lastContact: iso(-3), owner: 'Алексей', comment: '' },
    { row: 8, date: iso(-40), customer: 'Школа № 214', contact: 'Ирина Власова', phoneEmail: '+7 921 770-02-45', funnel: 'Сайт', object: 'Монтаж АПС и СОУЭ', essence: '', amount: 860000, status: 'Выиграно', lastContact: iso(-20), owner: 'Алексей', comment: '' },
    { row: 9, date: iso(-60), customer: 'ООО «Вектор»', contact: 'Елена Громова', phoneEmail: '+7 921 124-90-18', funnel: 'Алексей', object: 'Испытания', essence: '', amount: 140000, status: 'Отложено', lastContact: iso(-30), owner: 'Алексей', comment: '' },
    { row: 10, date: iso(-70), customer: 'Кафе «Причал»', contact: '', phoneEmail: '', funnel: 'Сайт', object: 'Огнетушители, ТО', essence: '', amount: 54000, status: 'Отказ', lastContact: iso(-40), owner: 'Дмитрий', comment: '' }
  ];

  function mk(y, to, act, pay) { var o = {}; o[y] = { to: to || {}, act: act || {}, pay: pay || {}, deadline: '', reason: '', note: '' }; return o; }
  var yy = new Date().getFullYear();
  var toData = {
    role: 'admin', name: 'Руководитель', nextId: 6, accPin: true, pins: {},
    specialists: [{ name: 'Игорь', phone: '+7 900 000-00-01' }, { name: 'Максим', phone: '+7 900 000-00-02' }],
    objects: [
      { id: 1, name: 'ТЦ «Меридиан»', address: 'пр. Энергетиков, 14', kind: 'СПС.СОУЭ', contract: '№ 18-ТО', signed: 'Подписан', period: 'Квартал', first: 1, cost: 18500, spec: 'Игорь', phone: '', client: '', code: '', ppkp: '', entry: '', journal: '', instr: '', note: '', years: mk(yy, { 1: 'yes', 4: 'yes', 7: 'yes' }, { 1: 'Подписан', 4: 'Подписан', 7: 'Отправлен' }, { 1: 'Оплачен', 4: 'Оплачен', 7: 'Не оплачен' }) },
      { id: 2, name: 'Школа № 214', address: 'ул. Лесная, 7', kind: 'СПС.СОУЭ', contract: '№ 21-ТО', signed: 'Подписан', period: 'Месяц', first: 1, cost: 12000, spec: 'Максим', phone: '', client: '', code: '', ppkp: '', entry: '', journal: '', instr: '', note: '', years: mk(yy, { 1: 'yes', 2: 'yes', 3: 'yes', 4: 'yes', 5: 'yes', 6: 'yes', 7: 'yes', 8: 'yes', 9: 'no' }, { 1: 'Подписан', 2: 'Подписан', 3: 'Подписан', 4: 'Подписан', 5: 'Подписан', 6: 'Подписан', 7: 'Отправлен', 8: 'Отправлен' }, { 1: 'Оплачен', 2: 'Оплачен', 3: 'Оплачен', 4: 'Оплачен', 5: 'Оплачен', 6: 'Оплачен', 7: 'Не оплачен', 8: 'Не оплачен' }) },
      { id: 3, name: 'БЦ «Атлант»', address: 'Невский пр., 88', kind: 'Огнетушители', contract: '№ 09-ТО', signed: 'Подписан', period: 'Квартал', first: 1, cost: 9500, spec: 'Максим', phone: '', client: '', code: '', ppkp: '', entry: '', journal: '', instr: '', note: '', years: mk(yy, { 1: 'yes', 4: 'yes', 7: 'yes' }, { 1: 'Подписан', 4: 'Подписан', 7: 'Подписан' }, { 1: 'Оплачен', 4: 'Оплачен', 7: 'Оплачен' }) },
      { id: 4, name: 'Детский сад № 61', address: 'ул. Садовая, 19', kind: 'СПС.СОУЭ', contract: '№ 26-ТО', signed: 'Не подписан', period: 'Полугодие', first: 4, cost: 7800, spec: 'Игорь', phone: '', client: '', code: '', ppkp: '', entry: '', journal: '', instr: '', note: '', years: mk(yy, { 4: 'yes' }, { 4: 'Подписан' }, { 4: 'Оплачен' }) },
      { id: 5, name: 'АЗС «Север-Нефть»', address: 'Выборгское ш., 120', kind: 'СПС.СОУЭ', contract: '№ 15-ТО', signed: 'Подписан', period: 'Месяц', first: 1, cost: 15000, spec: 'Игорь', phone: '', client: '', code: '', ppkp: '', entry: '', journal: '', instr: '', note: '', years: mk(yy, { 1: 'yes', 2: 'yes', 3: 'yes', 4: 'yes', 5: 'yes', 6: 'yes', 7: 'yes', 8: 'yes', 9: 'yes' }, { 1: 'Подписан', 2: 'Подписан', 3: 'Подписан', 4: 'Подписан', 5: 'Подписан', 6: 'Подписан', 7: 'Подписан', 8: 'Подписан', 9: 'Отправлен' }, { 1: 'Оплачен', 2: 'Оплачен', 3: 'Оплачен', 4: 'Оплачен', 5: 'Оплачен', 6: 'Оплачен', 7: 'Оплачен', 8: 'Оплачен', 9: 'Не оплачен' }) }
    ]
  };

  var now = Math.floor(Date.now() / 1000);
  var threads = [
    { id: 'tg1', channel: 'tg', title: 'Сергей Петров', peer: '@petrov', last_text: 'Хорошо, ждём вас в понедельник', last_ts: now - 600, unread: 2, avatar_ts: 0 },
    { id: 'ml1', channel: 'mail', title: 'Ирина Власова', peer: 'info@school.demo', last_text: 'Re: Акт обследования — подписан', last_ts: now - 7200, unread: 0, avatar_ts: 0 },
    { id: 'mx1', channel: 'max', title: 'Павел Ермаков', peer: '+7 911 000-00-00', last_text: 'Счёт на испытания получили', last_ts: now - 14400, unread: 1, avatar_ts: 0 },
    { id: 'ml2', channel: 'mail', title: 'Ольга Тихонова', peer: 'o@nevahotel.demo', last_text: 'Вопрос по срокам аудита', last_ts: now - 90000, unread: 0, avatar_ts: 0 },
    { id: 'tg2', channel: 'tg', title: 'Денис Руднев', peer: '@rudnev', last_text: 'Фото с объекта отправил', last_ts: now - 100000, unread: 3, avatar_ts: 0 }
  ];
  var msgs = {
    tg1: [{ id: 1, direction: 'in', text: 'Добрый день! Когда планируете выезд на монтаж?', ts: now - 3000, subject: '', files: [] }, { id: 2, direction: 'out', text: 'Здравствуйте, Сергей! Бригада будет в понедельник к 9:00. Пропуска оформили?', ts: now - 2400, subject: '', files: [] }, { id: 3, direction: 'in', text: 'Да, пропуска у охраны. Подъезд со двора.', ts: now - 900, subject: '', files: [] }, { id: 4, direction: 'in', text: 'Хорошо, ждём вас в понедельник', ts: now - 600, subject: '', files: [] }],
    ml1: [{ id: 1, direction: 'in', text: 'Направляю подписанный акт обследования, скан во вложении.', ts: now - 7300, subject: 'Акт обследования', files: [{ id: 1, name: 'Акт.pdf', size: 482113 }] }, { id: 2, direction: 'out', text: 'Спасибо! Принято, передаю в расчёт.', ts: now - 7200, subject: 'Re: Акт обследования', files: [] }]
  };

  function resp(obj, status) { return Promise.resolve(new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json' } })); }
  var realFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    url = String(url);
    function localApi(fn, a) {
      var d = null;
      if (fn === 'api_listTasks') d = tasks;
      else if (fn === 'api_getTask') d = tasks.filter(function (t) { return t.row === a[0]; })[0] || tasks[0];
      else if (fn === 'api_kpregList') d = leads;
      else d = true;
      return new Response(JSON.stringify({ ok: true, data: d }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.indexOf('script.google.com') >= 0) {
      var b = {}; try { b = JSON.parse(opts.body); } catch (e) {}
      var fn = b.fn, a = b.args || [], d = null;
      if (/^api_/.test(fn)) {           // таблица — общая со стендом моста (v2/dev/crm_dev_app.py), чтобы действия из бота были видны в приложении
        return realFetch('http://127.0.0.1:8790/dev/sheet', { method: 'POST', body: JSON.stringify({ fn: fn, args: a }) }).catch(function () { return null; }).then(function (r) { if (r) return r; return localApi(fn, a); });
      }
      if (fn === 'api_listTasks') d = tasks;
      else if (fn === 'api_getTask') d = tasks.filter(function (t) { return t.row === a[0]; })[0] || tasks[0];
      else if (fn === 'api_createTask') { d = { row: 99 }; }
      else if (/^api_(save|delete)/.test(fn)) d = true;
      else if (fn === 'api_kpregList') d = leads;
      else if (/^api_kpreg(Save|Create|Delete)/.test(fn)) d = { row: 99 };
      else if (fn === 'to_load') d = toData;
      else if (fn === 'to_apply') d = { ok: true, errors: [] };
      else d = true;
      return new Promise(function (r) { setTimeout(function () { r(new Response(JSON.stringify({ ok: true, data: d }), { headers: { 'Content-Type': 'application/json' } })); }, 120); });
    }
    if (url.indexOf('bridge.demo') >= 0) {
      var m;
      if (/\/api\/threads$/.test(url)) return resp(threads);
      if ((m = url.match(/\/api\/threads\/([^/]+)\/messages/))) return resp(msgs[decodeURIComponent(m[1])] || []);
      if (/\/(read|send)$/.test(url)) return resp({ ok: true });
      return resp({ detail: 'demo' }, 404);
    }
    return realFetch(url, opts);
  };
})();
