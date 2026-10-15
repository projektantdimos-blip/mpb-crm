// Отрисовка документа: HTML (предпросмотр / PDF через печать) и DOCX
(function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = x => Array.isArray(x) ? x : [x];

  /* ---------- HTML ---------- */
  function toHtml(doc) {
    const out = [];
    for (const b of doc.blocks) {
      switch (b.t) {
        case 'hdr': {
          const L = window.LOGOS[b.logo];
          out.push(`<table class="hdr"><tr><td class="hl"><img src="data:image/jpeg;base64,${L.b64}" style="width:62mm"></td><td class="hr">${b.lines.map(esc).join('<br>')}</td></tr></table>`);
          break;
        }
        case 'h': out.push(`<p class="h${b.big ? ' big' : ''}">${esc(b.x)}</p>`); break;
        case 'p': {
          const cls = ['p']; if (b.al) cls.push('al-' + b.al); if (b.b) cls.push('b');
          out.push(`<p class="${cls.join(' ')}"${b.sz ? ` style="font-size:${b.sz}pt"` : ''}>${esc(b.x)}</p>`);
          break;
        }
        case 'lr': out.push(`<div class="lr"><span>${esc(b.l)}</span><span>${esc(b.r)}</span></div>`); break;
        case 'pb': out.push('<div class="pb"></div>'); break;
        case 'tbl': {
          let h = `<table class="tbl"><colgroup>${b.w.map(w => `<col style="width:${w}%">`).join('')}</colgroup>`;
          h += `<tr>${b.head.map(x => `<th>${esc(x)}</th>`).join('')}</tr>`;
          for (const r of b.rows) {
            h += '<tr>';
            let ci = 0;
            for (const cell of r) {
              const o = typeof cell === 'object' && cell && !Array.isArray(cell) ? cell : { x: cell };
              const al = o.al || (b.al && b.al[Math.min(ci, b.al.length - 1)]) || 'l';
              h += `<td class="al-${al}${o.b ? ' b' : ''}"${o.span ? ` colspan="${o.span}"` : ''}${o.rowspan ? ` rowspan="${o.rowspan}"` : ''}>${lines(o.x).map(esc).join('<br>')}</td>`;
              ci += o.span || 1;
            }
            h += '</tr>';
          }
          out.push(h + '</table>');
          break;
        }
        case 'two': {
          const cell = arr => arr.map(l => {
            const o = typeof l === 'object' ? l : { x: l };
            return `<div class="${o.b ? 'b' : ''}">${esc(o.x) || '&nbsp;'}</div>`;
          }).join('');
          let h = `<table class="two${b.plain ? ' plain' : ''}"${b.keep ? ' style="page-break-inside:avoid"' : ''}>`;
          if (b.head) h += `<tr>${b.head.map(x => `<th>${esc(x)}</th>`).join('')}</tr>`;
          h += `<tr><td>${cell(b.left)}</td><td>${cell(b.right)}</td></tr></table>`;
          out.push(h);
          break;
        }
      }
    }
    return `<div class="doc">${out.join('\n')}</div>`;
  }

  const DOC_CSS = `
  .doc{font-family:"Times New Roman",Times,serif;font-size:11pt;line-height:1.2;color:#000}
  .doc p{margin:0 0 3pt}
  .doc .p{text-align:justify}.doc .al-r{text-align:right}.doc .al-c{text-align:center}.doc .al-l{text-align:left}.doc .b{font-weight:bold}
  .doc .h{font-weight:bold;text-align:center;margin:9pt 0 4pt;break-after:avoid}
  .doc .h.big{font-size:13pt;margin:10pt 0 2pt}
  .doc .lr{display:flex;justify-content:space-between;margin-bottom:6pt}
  .doc table{border-collapse:collapse;width:100%;table-layout:fixed;margin:4pt 0}
  .doc table.hdr td{border:0;vertical-align:middle;padding:0}
  .doc table.hdr td.hl{width:50%}
  .doc table.hdr td.hr{text-align:right;font-size:10pt}
  .doc table.tbl th,.doc table.tbl td{border:1px solid #000;padding:2pt 4pt;font-size:10pt;vertical-align:top}
  .doc table.tbl th{text-align:center;font-weight:bold;background:#f0f0f0}
  .doc table.tbl tr{break-inside:avoid}
  .doc table.two td,.doc table.two th{width:50%;vertical-align:top;padding:2pt 6pt 2pt 0;font-size:10pt;text-align:left;border:0}
  .doc table.two th{font-weight:bold;padding-bottom:3pt}
  .doc .pb{break-after:page;height:0}
  `;

  /* ---------- DOCX ---------- */
  function b64ToBytes(b64) {
    const s = atob(b64), a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  function toDocx(doc) {
    const D = window.docx;
    const W = 9638; // ширина текста, twips
    const FONT = 'Times New Roman';
    const AL = { j: D.AlignmentType.JUSTIFIED, c: D.AlignmentType.CENTER, r: D.AlignmentType.RIGHT, l: D.AlignmentType.LEFT };
    const run = (t, o) => new D.TextRun(Object.assign({ text: t, font: FONT, size: 22 }, o));
    const para = (t, o) => {
      o = o || {};
      return new D.Paragraph({
        alignment: AL[o.al || 'j'], spacing: { after: o.after == null ? 60 : o.after, before: o.before || 0, line: 252 },
        keepNext: !!o.keepNext, pageBreakBefore: !!o.pbb, children: [run(t, { bold: !!o.b, size: o.sz || 22 })],
      });
    };
    const NB = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const noB = { top: NB, bottom: NB, left: NB, right: NB };
    const children = [];
    let brk = false;
    for (const b of doc.blocks) {
      if (b.t === 'hdr') {
        const L = window.LOGOS[b.logo];
        const wpx = 235, hpx = Math.round(235 * L.h / L.w);
        children.push(new D.Table({
          width: { size: W, type: D.WidthType.DXA }, columnWidths: [4600, 5038], borders: D.TableBorders.NONE,
          rows: [new D.TableRow({ children: [
            new D.TableCell({ width: { size: 4600, type: D.WidthType.DXA }, borders: noB, verticalAlign: D.VerticalAlign.CENTER,
              children: [new D.Paragraph({ children: [new D.ImageRun({ data: b64ToBytes(L.b64), transformation: { width: wpx, height: hpx } })] })] }),
            new D.TableCell({ width: { size: 5038, type: D.WidthType.DXA }, borders: noB, verticalAlign: D.VerticalAlign.CENTER,
              children: b.lines.map(l => new D.Paragraph({ alignment: D.AlignmentType.RIGHT, spacing: { after: 0 }, children: [run(l, { size: 20 })] })) }),
          ] })],
        }));
        children.push(new D.Paragraph({ spacing: { after: 60 }, children: [] }));
      } else if (b.t === 'h') {
        children.push(para(b.x, { al: 'c', b: true, before: b.big ? 120 : 140, after: b.big ? 40 : 60, sz: b.big ? 26 : 22, keepNext: true }));
      } else if (b.t === 'p') {
        children.push(para(b.x, { al: b.al || 'j', b: b.b, sz: b.sz ? b.sz * 2 : 22, pbb: brk })); brk = false;
      } else if (b.t === 'lr') {
        children.push(new D.Paragraph({
          spacing: { after: 100 }, tabStops: [{ type: D.TabStopType.RIGHT, position: W }],
          children: [run(b.l), new D.TextRun({ text: '\t' + b.r, font: FONT, size: 22 })],
        }));
      } else if (b.t === 'pb') {
        brk = true;
      } else if (b.t === 'tbl') {
        const cw = b.w.map(w => Math.round(W * w / 100));
        const cellP = (txt, o) => lines(txt).map(t => new D.Paragraph({ alignment: AL[o.al] || AL.l, spacing: { after: 0 }, children: [run(t, { size: 20, bold: !!o.b })] }));
        const mk = (o, ci, isHead) => {
          const span = o.span || 1;
          let width = 0; for (let k = 0; k < span; k++) width += cw[ci + k] || 0;
          return new D.TableCell({
            width: { size: width, type: D.WidthType.DXA }, columnSpan: span > 1 ? span : undefined, rowSpan: o.rowspan,
            shading: isHead ? { type: D.ShadingType.CLEAR, fill: 'F0F0F0', color: 'auto' } : undefined,
            margins: { top: 40, bottom: 40, left: 80, right: 80 }, verticalAlign: isHead ? D.VerticalAlign.CENTER : D.VerticalAlign.TOP,
            children: cellP(o.x, { al: isHead ? 'c' : (o.al || (b.al && b.al[Math.min(ci, b.al.length - 1)]) || 'l'), b: isHead || o.b }),
          });
        };
        const rows = [new D.TableRow({ tableHeader: true, cantSplit: true, children: b.head.map((h, i) => mk({ x: h }, i, true)) })];
        for (const r of b.rows) {
          let ci = 0; const cells = [];
          for (const cell of r) {
            const o = typeof cell === 'object' && cell && !Array.isArray(cell) ? cell : { x: cell };
            cells.push(mk(o, ci, false)); ci += o.span || 1;
          }
          rows.push(new D.TableRow({ cantSplit: true, children: cells }));
        }
        children.push(new D.Table({ width: { size: W, type: D.WidthType.DXA }, columnWidths: cw, rows }));
        children.push(new D.Paragraph({ spacing: { after: 60 }, children: [] }));
      } else if (b.t === 'two') {
        const half = Math.round(W / 2);
        const cell = arr => arr.map(l => {
          const o = typeof l === 'object' ? l : { x: l };
          return new D.Paragraph({ spacing: { after: 0 }, children: [run(o.x, { size: 20, bold: !!o.b })] });
        });
        const rows = [];
        if (b.head) rows.push(new D.TableRow({ children: b.head.map(h => new D.TableCell({ width: { size: half, type: D.WidthType.DXA }, borders: noB, children: [new D.Paragraph({ spacing: { after: 60 }, children: [run(h, { size: 20, bold: true })] })] })) }));
        rows.push(new D.TableRow({ cantSplit: true, children: [b.left, b.right].map(arr => new D.TableCell({ width: { size: half, type: D.WidthType.DXA }, borders: noB, margins: { right: 120 }, children: cell(arr) })) }));
        children.push(new D.Paragraph({ spacing: { after: 60 }, children: [] }));
        children.push(new D.Table({ width: { size: W, type: D.WidthType.DXA }, columnWidths: [half, W - half], borders: D.TableBorders.NONE, rows }));
      }
    }
    return new D.Document({
      creator: 'Генератор договоров', title: doc.footer,
      styles: { default: { document: { run: { font: FONT, size: 22 } } } },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 851, right: 1134, bottom: 1134, left: 1134, header: 708, footer: 454 } } },
        footers: { default: new D.Footer({ children: [new D.Paragraph({
          tabStops: [{ type: D.TabStopType.RIGHT, position: W }],
          children: [run(doc.footer, { size: 18 }), new D.TextRun({ text: '\tСтр. ', font: FONT, size: 18 }),
            new D.TextRun({ children: [D.PageNumber.CURRENT], font: FONT, size: 18 }),
            new D.TextRun({ text: ' из ', font: FONT, size: 18 }),
            new D.TextRun({ children: [D.PageNumber.TOTAL_PAGES], font: FONT, size: 18 })],
        })] }) },
        children,
      }],
    });
  }

  async function downloadDocx(doc, name) {
    const blob = await window.docx.Packer.toBlob(toDocx(doc));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name + '.docx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return blob;
  }

  /* ---------- PDF (настоящий файл, без окна печати) ---------- */
  function toPdfDef(doc) {
    const AW = (595.28 - 113.4) * 0.985; // ширина текста, pt (с запасом на границы)
    const al = a => ({ j: 'justify', c: 'center', r: 'right', l: 'left' })[a || 'j'];
    const content = [];
    let brk = false;
    const push = n => { if (brk) { n.pageBreak = 'before'; brk = false; } content.push(n); };
    const txt = x => (Array.isArray(x) ? x : [x]).join('\n');
    for (const b of doc.blocks) {
      if (b.t === 'hdr') {
        push({ table: { widths: ['*', '*'], body: [[{ image: 'data:image/jpeg;base64,' + window.LOGOS[b.logo].b64, width: 175 }, { text: b.lines.join('\n'), alignment: 'right', fontSize: 10, margin: [0, 8, 0, 0] }]] }, layout: 'noBorders', margin: [0, 0, 0, 6] });
      } else if (b.t === 'h') {
        push({ text: b.x, bold: true, alignment: 'center', fontSize: b.big ? 13 : 11, margin: [0, b.big ? 8 : 8, 0, b.big ? 2 : 3] });
      } else if (b.t === 'p') {
        push({ text: b.x, alignment: al(b.al), bold: !!b.b, fontSize: b.sz || 11, margin: [0, 0, 0, 3] });
      } else if (b.t === 'lr') {
        push({ columns: [{ text: b.l }, { text: b.r, alignment: 'right' }], margin: [0, 0, 0, 6] });
      } else if (b.t === 'pb') {
        brk = true;
      } else if (b.t === 'tbl') {
        const widths = b.w.map(w => AW * w / 100);
        const cell = (c, ci, head) => {
          const o = typeof c === 'object' && c && !Array.isArray(c) ? c : { x: c };
          const r = { text: txt(o.x), fontSize: 10, bold: head || !!o.b, alignment: head ? 'center' : al(o.al || (b.al && b.al[Math.min(ci, b.al.length - 1)]) || 'l').replace('justify', 'left') };
          if (head) r.fillColor = '#f0f0f0';
          if (o.span) r.colSpan = o.span;
          return r;
        };
        const fill = row => { const out = []; row.forEach((c, i) => { out.push(c); for (let k = 1; k < (c.colSpan || 1); k++) out.push({}); }); return out; };
        const body = [fill(b.head.map((h, i) => cell(h, i, true)))];
        for (const r of b.rows) { let ci = 0; body.push(fill(r.map(c => { const x = cell(c, ci, false); ci += x.colSpan || 1; return x; }))); }
        push({ table: { headerRows: 1, widths, body, dontBreakRows: true }, margin: [0, 3, 0, 6] });
      } else if (b.t === 'two') {
        const stack = arr => ({ stack: arr.map(l => { const o = typeof l === 'object' ? l : { x: l }; return { text: o.x || ' ', bold: !!o.b, fontSize: 10 }; }) });
        const body = [];
        if (b.head) body.push(b.head.map(h => ({ text: h, bold: true, fontSize: 10, margin: [0, 0, 0, 3] })));
        body.push([stack(b.left), stack(b.right)]);
        push({ table: { widths: ['*', '*'], body, dontBreakRows: true }, layout: 'noBorders', margin: [0, 6, 0, 4], unbreakable: !!b.keep });
      }
    }
    return {
      pageSize: 'A4', pageMargins: [56.7, 42.5, 56.7, 50],
      defaultStyle: { font: 'TNR', fontSize: 11, lineHeight: 1.1 },
      footer: (page, count) => ({ margin: [56.7, 8, 56.7, 0], columns: [{ text: doc.footer, fontSize: 9 }, { text: `Стр. ${page} из ${count}`, fontSize: 9, alignment: 'right' }] }),
      content,
    };
  }
  // Шрифты (js/fonts.js, ~3 МБ) на медленном канале могли не успеть загрузиться вместе со страницей — догружаем при необходимости
  async function ensureFonts() {
    if (window.TNR && window.TNR.regular) return;
    for (let i = 0; i < 2 && !(window.TNR && window.TNR.regular); i++) {
      await new Promise(res => { const s = document.createElement('script'); s.src = 'js/fonts.js?t=' + Date.now(); s.onload = s.onerror = () => { s.remove(); res(); }; document.head.append(s); });
    }
    if (!(window.TNR && window.TNR.regular)) throw new Error('не загрузились шрифты (js/fonts.js, 3 МБ). Обновите страницу (Ctrl+F5) и повторите; если не помогает — проверьте связь с сервером.');
  }
  async function pdfBlob(doc) {
    await ensureFonts();
    pdfMake.vfs = { 'tnr.ttf': window.TNR.regular, 'tnrb.ttf': window.TNR.bold };
    pdfMake.fonts = { TNR: { normal: 'tnr.ttf', bold: 'tnrb.ttf', italics: 'tnr.ttf', bolditalics: 'tnrb.ttf' } };
    return new Promise((res, rej) => { try { pdfMake.createPdf(toPdfDef(doc)).getBlob(res); } catch (e) { rej(e); } });
  }
  async function downloadPdf(doc, name) {
    const blob = await pdfBlob(doc);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name + '.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return blob;
  }

  function printPdf(doc, name) {
    let root = document.getElementById('printRoot');
    if (!root) { root = document.createElement('div'); root.id = 'printRoot'; document.body.appendChild(root); }
    const footer = doc.footer.replace(/"/g, '');
    root.innerHTML = `<style>@page{size:A4;margin:15mm 20mm 17mm 20mm;@bottom-left{content:"${footer}";font:9pt "Times New Roman",serif}@bottom-right{content:"Стр. " counter(page) " из " counter(pages);font:9pt "Times New Roman",serif}}</style>` + toHtml(doc);
    const old = document.title;
    document.title = name;
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); document.title = old; root.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 100);
  }

  window.R = { downloadPdf, pdfBlob, toDocx, toHtml, DOC_CSS, downloadDocx, printPdf };
})();
