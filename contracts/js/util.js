// Вспомогательные функции: числа прописью, деньги, даты
(function () {
  const M = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять',
    'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const F = M.slice(); F[1] = 'одна'; F[2] = 'две';
  const T = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const H = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

  function triple(n, fem) {
    const out = [];
    out.push(H[Math.floor(n / 100)]);
    const r = n % 100;
    if (r < 20) out.push((fem ? F : M)[r]);
    else { out.push(T[Math.floor(r / 10)]); out.push((fem ? F : M)[r % 10]); }
    return out.filter(Boolean).join(' ');
  }
  function plural(n, a, b, c) {
    const m = n % 100, d = n % 10;
    if (m >= 11 && m <= 19) return c;
    if (d === 1) return a;
    if (d >= 2 && d <= 4) return b;
    return c;
  }
  function words(n) {
    n = Math.floor(n);
    if (n === 0) return 'ноль';
    const parts = [];
    const bil = Math.floor(n / 1e9), mil = Math.floor(n / 1e6) % 1000, th = Math.floor(n / 1e3) % 1000, rest = n % 1000;
    if (bil) parts.push(triple(bil) + ' ' + plural(bil, 'миллиард', 'миллиарда', 'миллиардов'));
    if (mil) parts.push(triple(mil) + ' ' + plural(mil, 'миллион', 'миллиона', 'миллионов'));
    if (th) parts.push(triple(th, true) + ' ' + plural(th, 'тысяча', 'тысячи', 'тысяч'));
    if (rest) parts.push(triple(rest));
    return parts.join(' ');
  }
  // родительный падеж (для «5 (пяти) рабочих дней»)
  const UG = ['', 'одного', 'двух', 'трех', 'четырех', 'пяти', 'шести', 'семи', 'восьми', 'девяти', 'десяти',
    'одиннадцати', 'двенадцати', 'тринадцати', 'четырнадцати', 'пятнадцати', 'шестнадцати', 'семнадцати', 'восемнадцати', 'девятнадцати'];
  const TG = ['', '', 'двадцати', 'тридцати', 'сорока', 'пятидесяти', 'шестидесяти', 'семидесяти', 'восьмидесяти', 'девяносто'];
  function wordsGen(n) {
    n = Math.floor(n);
    if (n > 0 && n < 20) return UG[n];
    if (n >= 20 && n < 100) return (TG[Math.floor(n / 10)] + (n % 10 ? ' ' + UG[n % 10] : ''));
    return words(n);
  }
  function num(v) {
    if (typeof v === 'number') return v;
    const s = String(v == null ? '' : v).replace(/[\s ]/g, '').replace(',', '.');
    const x = parseFloat(s);
    return isNaN(x) ? 0 : x;
  }
  const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
  function fmt(n) {
    return r2(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, ' ');
  }
  function fmtInt(n) {
    return Math.floor(n).toLocaleString('ru-RU').replace(/[  ]/g, ' ');
  }
  // 35 500 (тридцать пять тысяч пятьсот) рублей 00 коп.
  function money(n, longKop) {
    n = r2(num(n));
    const rub = Math.floor(n + 1e-9), kop = Math.round((n - rub) * 100);
    const kw = longKop ? plural(kop, 'копейка', 'копейки', 'копеек') : 'коп.';
    return `${fmtInt(rub)} (${words(rub)}) ${plural(rub, 'рубль', 'рубля', 'рублей')} ${String(kop).padStart(2, '0')} ${kw}`;
  }
  // 5 (пяти) рабочих дней
  function days(n, kind) {
    n = Math.round(num(n));
    const k = kind || 'рабочих';
    const one = { 'рабочих': 'рабочего', 'банковских': 'банковского', 'календарных': 'календарного' }[k] || k;
    if (n % 10 === 1 && n % 100 !== 11) return `${n} (${n === 1 ? 'одного' : wordsGen(n)}) ${one} дня`;
    return `${n} (${wordsGen(n)}) ${k} дней`;
  }
  function monthsPhrase(n) {
    n = Math.round(num(n));
    return `${n} (${words(n)}) ${plural(n, 'месяц', 'месяца', 'месяцев')}`;
  }
  function countPhrase(n) { // 1 (один)
    n = Math.round(num(n));
    return `${n} (${words(n)})`;
  }
  const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function dparts(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return { d: '__', mon: '__________', y: '20__', dd: '__', mm: '__' };
    return { d: String(+m[3]), dd: m[3], mm: m[2], mon: MON[+m[2] - 1], y: m[1] };
  }
  const dLong = iso => { const p = dparts(iso); return `«${p.d}» ${p.mon} ${p.y} г.`; };
  const dShort = iso => { const p = dparts(iso); return `${p.dd}.${p.mm}.${p.y}`; };
  const dMid = iso => { const p = dparts(iso); return `${p.d} ${p.mon} ${p.y} г.`; };

  window.U = { words, wordsGen, num, r2, fmt, fmtInt, money, days, monthsPhrase, countPhrase, dLong, dShort, dMid, dparts, plural };
})();
