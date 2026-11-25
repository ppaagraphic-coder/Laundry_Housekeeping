// ตารางกรอกจำนวน (หน้าตาเหมือนแบบฟอร์มกระดาษ) + หน้าเอกสารสำหรับพิมพ์/บันทึก PDF (A4 แนวนอน)
const Forms = (function () {
  'use strict';
  const { h, fmt, dateTH } = UI;
  const num = v => Math.max(0, Math.floor(Number(v) || 0));

  function numInput(value, onInput, label) {
    const i = h('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 5, autocomplete: 'off', 'aria-label': label || 'จำนวน', value: value ? String(value) : '' });
    i.addEventListener('focus', () => i.select());
    i.addEventListener('input', () => {
      const d = i.value.replace(/[^0-9]/g, '');
      if (d !== i.value) i.value = d;
      i.classList.toggle('has', num(d) > 0);
      onInput(num(d));
    });
    i.classList.toggle('has', num(value) > 0);
    return i;
  }
  function textInput(value, onInput, label, ph) {
    const i = h('input', { type: 'text', maxlength: 200, value: value || '', 'aria-label': label, placeholder: ph || '' });
    i.addEventListener('input', () => onInput(i.value));
    return i;
  }

  /**
   * ตารางกรอกจำนวนส่งซักแยกตามชั้น  items:[{seq,name}]  zones:[ชื่อ]  values:{seq:{z:[...],note}}
   * คืน {el, getLines(), total()}
   */
  function sendGrid(items, zones, values, onChange, acc, label) {
    const st = {};
    items.forEach(i => {
      const v = (values && values[i.seq]) || {};
      st[i.seq] = { z: zones.map((_, k) => num(v.z && v.z[k])), note: v.note || '' };
    });
    const totCells = {}, accCells = {}, zoneFoot = [], grand = h('td', { class: 'num' }, '0');
    const sum = seq => st[seq].z.reduce((a, b) => a + b, 0);
    function refresh() {
      let g = 0;
      items.forEach(i => {
        totCells[i.seq].textContent = sum(i.seq) || '';
        totCells[i.seq].parentNode.classList.toggle('zero', sum(i.seq) === 0 && !(acc && acc[i.seq]));
        if (acc) totCells[i.seq].parentNode.classList.toggle('diff', (acc[i.seq] || 0) !== sum(i.seq));
        g += sum(i.seq);
      });
      zones.forEach((_, k) => { zoneFoot[k].textContent = items.reduce((a, i) => a + st[i.seq].z[k], 0) || ''; });
      grand.textContent = g;
      if (onChange) onChange(g);
    }
    const head = h('thead', null, h('tr', null, [
      h('th', { class: 'nm' }, 'รายการผ้า'),
      zones.map(z => h('th', null, z)), h('th', null, 'รวม'), acc ? h('th', { title: 'ยอดรวมจากใบเก็บผ้ารายวัน' }, 'สะสม') : null, h('th', null, 'หมายเหตุ (ขาด / คราบ / ตำหนิ)')
    ]));
    const body = h('tbody', null, items.map(i => {
      totCells[i.seq] = h('td', { class: 'tot' });
      return h('tr', null, [
        h('td', { class: 'nm' }, [h('span', { class: 'no' }, i.seq), i.name]),
        zones.map((z, k) => h('td', { class: 'q' }, numInput(st[i.seq].z[k], v => { st[i.seq].z[k] = v; refresh(); }, i.name + ' ' + z))),
        totCells[i.seq],
        acc ? h('td', { class: 'c num muted' }, acc[i.seq] || '') : null,
        h('td', { class: 'note' }, textInput(st[i.seq].note, v => { st[i.seq].note = v; }, 'หมายเหตุ ' + i.name))
      ]);
    }));
    const foot = h('tfoot', null, h('tr', null, [
      h('td', { class: 'nm' }, label || 'รวมจำนวนผ้าที่ส่ง'),
      zones.map((_, k) => (zoneFoot[k] = h('td', { class: 'num' }))), grand, acc ? h('td', { class: 'num' }, Object.keys(acc).reduce((a, k) => a + acc[k], 0)) : null, h('td')
    ]));
    const el = h('div', { class: 'gridwrap' }, h('table', { class: 'ledger' }, [head, body, foot]));
    refresh();
    return {
      el,
      total: () => items.reduce((a, i) => a + sum(i.seq), 0),
      getLines: () => items.map(i => ({ item_seq: i.seq, z: st[i.seq].z.slice(), note: st[i.seq].note.trim() }))
        .filter(l => l.z.some(v => v > 0) || l.note)
    };
  }

  /**
   * ตารางตรวจรับผ้าคืน — โหมด 'receive' (รับ + ชำรุด + หมายเหตุ) ใช้ทั้งรับครั้งแรกและรับส่วนที่ขาดเพิ่ม
   * lines: [{item_seq, agreed_qty}], items, received:{seq:จำนวนที่รับไปแล้ว}
   */
  function receiveGrid(items, lines, received, supplement) {
    const nm = {};
    items.forEach(i => { nm[i.seq] = i.name; });
    const rows = lines.filter(l => l.agreed_qty > 0 && (!supplement || (l.agreed_qty - (received[l.item_seq] || 0)) > 0));
    const st = {};
    rows.forEach(l => { st[l.item_seq] = { qty: '', defect: 0, note: '' }; });
    const cells = {}, inputs = {};
    function refresh() {
      rows.forEach(l => {
        const s = st[l.item_seq];
        const before = received[l.item_seq] || 0;
        const c = cells[l.item_seq];
        const filled = s.qty !== '';
        const miss = filled ? Math.max(0, l.agreed_qty - before - s.qty) : null;
        c.miss.textContent = miss === null ? '' : (miss > 0 ? 'ขาด ' + miss : (s.qty + before > l.agreed_qty ? 'เกิน ' + (s.qty + before - l.agreed_qty) : '✓'));
        c.miss.className = 'c' + (miss > 0 ? ' bad' : (filled ? ' good' : ''));
        c.tr.classList.toggle('diff', miss > 0 || s.defect > 0);
      });
    }
    const head = h('thead', null, h('tr', null, [
      h('th', { class: 'nm' }, 'รายการผ้า'), h('th', null, supplement ? 'ที่ยังค้าง' : 'โรงแรมส่ง'),
      h('th', null, supplement ? 'รับเพิ่มครั้งนี้' : 'นับได้จริง'), h('th', null, 'ชำรุด/คราบ'), h('th', null, 'ผลตรวจ'), h('th', null, 'หมายเหตุ')
    ]));
    const body = h('tbody', null, rows.map(l => {
      const s = st[l.item_seq];
      const before = received[l.item_seq] || 0;
      const qin = numInput('', v => { s.qty = v; refresh(); }, 'นับได้ ' + nm[l.item_seq]);
      qin.addEventListener('input', () => { if (qin.value === '') { s.qty = ''; refresh(); } });
      inputs[l.item_seq] = { qin, set: v => { qin.value = String(v); qin.classList.toggle('has', v > 0); s.qty = v; } };
      const c = cells[l.item_seq] = { miss: h('td', { class: 'c' }), tr: null };
      c.tr = h('tr', null, [
        h('td', { class: 'nm' }, [h('span', { class: 'no' }, l.item_seq), nm[l.item_seq]]),
        h('td', { class: 'c num' }, supplement ? l.agreed_qty - before : l.agreed_qty),
        h('td', { class: 'q' }, qin),
        h('td', { class: 'q' }, numInput(0, v => { s.defect = v; refresh(); }, 'ชำรุดหรือคราบ ' + nm[l.item_seq])),
        c.miss,
        h('td', { class: 'note' }, textInput('', v => { s.note = v; }, 'หมายเหตุ ' + nm[l.item_seq], 'เช่น ขอบขาด / คราบเหลือง'))
      ]);
      return c.tr;
    }));
    const el = h('div', { class: 'gridwrap' }, h('table', { class: 'ledger', style: 'min-width:560px' }, [head, body]));
    return {
      el, count: rows.length,
      fillAllOk() { rows.forEach(l => inputs[l.item_seq].set(supplement ? l.agreed_qty - (received[l.item_seq] || 0) : l.agreed_qty)); refresh(); },
      validate() {
        if (supplement) return rows.some(l => st[l.item_seq].qty !== '' && st[l.item_seq].qty > 0) ? '' : 'ยังไม่ได้กรอกจำนวนผ้าที่รับเพิ่ม';
        const empty = rows.filter(l => st[l.item_seq].qty === '');
        if (empty.length) return 'ยังไม่ได้กรอกจำนวน ' + empty.length + ' รายการ (ถ้าไม่มีผ้ารายการนั้นให้ใส่ 0)';
        const bad = rows.find(l => st[l.item_seq].defect > st[l.item_seq].qty);
        if (bad) return 'ชำรุด/คราบ มากกว่าจำนวนที่รับ: ' + nm[bad.item_seq];
        return '';
      },
      getLines: () => rows.map(l => ({ item_seq: l.item_seq, qty: st[l.item_seq].qty === '' ? 0 : st[l.item_seq].qty, defect: st[l.item_seq].defect, note: st[l.item_seq].note.trim() })),
      summary() {
        let miss = 0, defect = 0;
        rows.forEach(l => {
          const s = st[l.item_seq]; const before = received[l.item_seq] || 0;
          if (s.qty !== '') miss += Math.max(0, l.agreed_qty - before - s.qty);
          defect += s.defect;
        });
        return { miss, defect };
      }
    };
  }

  /** ตารางให้ร้านซักนับ: ช่องกรอกยอดที่นับได้เทียบกับยอดโรงแรมส่ง */
  function vendorGrid(items, lines, zones) {
    const nm = {};
    items.forEach(i => { nm[i.seq] = i.name; });
    const rows = lines.filter(l => l.qty > 0);
    const st = {}, cells = {}, inputs = {};
    rows.forEach(l => { st[l.item_seq] = ''; });
    function refresh() {
      rows.forEach(l => {
        const v = st[l.item_seq];
        const c = cells[l.item_seq];
        if (v === '') { c.res.textContent = ''; c.res.className = 'c'; c.tr.classList.remove('diff'); return; }
        const d = v - l.agreed_qty;
        c.res.textContent = d === 0 ? '✓ ตรง' : (d < 0 ? 'ขาด ' + (-d) : 'เกิน ' + d);
        c.res.className = 'c ' + (d === 0 ? 'good' : 'bad');
        c.tr.classList.toggle('diff', d !== 0);
      });
    }
    const head = h('thead', null, h('tr', null, [h('th', { class: 'nm' }, 'รายการผ้า'), zones.map(z => h('th', null, z)), h('th', null, 'โรงแรมส่ง'), h('th', null, 'ร้านนับได้'), h('th', null, 'ผล'), h('th', null, 'หมายเหตุจากโรงแรม')]));
    const body = h('tbody', null, rows.map(l => {
      const qin = numInput('', v => { st[l.item_seq] = v; refresh(); }, 'ร้านนับได้ ' + nm[l.item_seq]);
      qin.addEventListener('input', () => { if (qin.value === '') { st[l.item_seq] = ''; refresh(); } });
      inputs[l.item_seq] = v => { qin.value = String(v); qin.classList.toggle('has', v > 0); st[l.item_seq] = v; };
      const c = cells[l.item_seq] = { res: h('td', { class: 'c' }), tr: null };
      c.tr = h('tr', null, [
        h('td', { class: 'nm' }, [h('span', { class: 'no' }, l.item_seq), nm[l.item_seq]]),
        zones.map((z, k) => h('td', { class: 'c num muted' }, l['z' + (k + 1)] || '')),
        h('td', { class: 'c num' }, h('b', null, l.agreed_qty)),
        h('td', { class: 'q' }, qin), c.res, h('td', { class: 'note' }, h('span', { class: 'small', style: 'padding:0 .5rem' }, l.note || ''))
      ]);
      return c.tr;
    }));
    const el = h('div', { class: 'gridwrap' }, h('table', { class: 'ledger', style: 'min-width:600px' }, [head, body]));
    return {
      el,
      fillAllOk() { rows.forEach(l => inputs[l.item_seq](l.agreed_qty)); refresh(); },
      validate() { const n = rows.filter(l => st[l.item_seq] === '').length; return n ? 'ยังไม่ได้กรอกยอดนับ ' + n + ' รายการ (ไม่มีให้ใส่ 0)' : ''; },
      counts: () => { const o = {}; rows.forEach(l => { o[l.item_seq] = st[l.item_seq] === '' ? 0 : st[l.item_seq]; }); return o; },
      diffCount: () => rows.filter(l => st[l.item_seq] !== '' && st[l.item_seq] !== l.agreed_qty).length
    };
  }

  // ============================================================ เอกสารสำหรับพิมพ์ / บันทึกเป็น PDF
  function letterhead(view, title) {
    const ht = view.hotel;
    return [
      h('div', { class: 'lh' }, [
        h('img', { src: 'assets/logo.png', alt: 'inchantree meedao' }),
        h('div', { class: 'addr' }, [h('b', null, ht.name), h('div', null, ht.line1), h('div', null, ht.line2), h('div', null, ht.line3)])
      ]),
      h('div', { class: 'rule' }), h('h1', { class: 'doc' }, title)
    ];
  }
  function meta(pairs) {
    return h('div', { class: 'meta' }, pairs.map(p => h('div', null, [h('span', null, p[0]), h('span', { class: 'v' }, p[1] || '')])));
  }
  function sigCell(label, sigId, name, at, view) {
    const png = sigId && view.sigs[sigId];
    return h('div', { class: 'sig' }, [
      h('div', { class: 'img' }, png ? h('img', { src: png, alt: 'ลายเซ็น ' + name }) : null),
      h('div', { class: 'ln' }, [label + (name ? '  ' + name : ''), h('small', null, at ? dateTH((at || '').slice(0, 10)) + ' ' + (at || '').slice(11, 16) + ' น.' : '')])
    ]);
  }
  const foot = (view, page) => h('div', { class: 'foot' }, (view.slip ? view.slip.doc_no : view.col.col_no) + ' · ' + page + ' · พิมพ์จากระบบติดตามผ้าซัก ' + dateTH(Core.todayBKK()));

  function colRef(view) {
    const cs = view.collections || [];
    if (!cs.length) return '';
    const a = cs[0].col_date, b = cs[cs.length - 1].col_date;
    return ' (รวมจากใบเก็บผ้า ' + cs.length + ' ใบ · ' + dateTH(a) + (b !== a ? ' – ' + dateTH(b) : '') + ')';
  }

  // ใบรายงานเก็บผ้ารายวัน
  function collectionSheet(view) {
    const { col, lines, items, zones } = view;
    const byseq = {};
    lines.forEach(l => { byseq[l.item_seq] = l; });
    const zsum = zones.map((_, k) => lines.reduce((a, l) => a + (l['z' + (k + 1)] || 0), 0));
    const sheet = h('section', { class: 'sheet' }, [
      letterhead(view, 'รายงานเก็บผ้ารายวัน'),
      meta([['ผู้เก็บผ้า', col.prepared_by], ['เลขที่เอกสาร', col.col_no], ['วันที่เก็บผ้า', dateTH(col.col_date)], ['ห้องที่เก็บ', col.rooms],
        ['สถานะ', view.status_label + (col.doc_no ? ' (' + col.doc_no + ')' : '')], ['หมายเหตุ', col.note]]),
      h('table', { class: 'f' }, [
        h('thead', null, [
          h('tr', null, [h('th', { rowspan: 2, style: 'width:11mm' }, 'ลำดับ'), h('th', { rowspan: 2, style: 'width:78mm' }, 'รายการผ้า'), h('th', { colspan: zones.length + 1 }, 'จำนวนผ้าที่เก็บ / ชั้น'), h('th', { rowspan: 2 }, 'หมายเหตุ')]),
          h('tr', null, [zones.map(z => h('th', { style: 'width:13mm' }, z)), h('th', { style: 'width:15mm' }, 'รวม')])
        ]),
        h('tbody', null, items.map((i, n) => {
          const l = byseq[i.seq];
          return h('tr', null, [h('td', { class: 'n' }, n + 1), h('td', null, i.name),
            zones.map((_, k) => h('td', { class: 'q' }, l && l['z' + (k + 1)] ? l['z' + (k + 1)] : '')), h('td', { class: 'q' }, l && l.qty ? l.qty : ''), h('td', { class: 'nt' }, l ? l.note : '')]);
        })),
        h('tfoot', null, h('tr', null, [h('td', { colspan: 2 }, 'รวมจำนวนผ้าที่เก็บ'), zsum.map(v => h('td', null, v || '')), h('td', null, col.total || ''), h('td')]))
      ]),
      h('div', { class: 'sigs' }, [sigCell('ผู้เก็บผ้า', col.sig_id, col.signer, col.created_at, view), sigCell('ผู้ตรวจสอบ', null, '', '', view)]),
      foot(view, 'รายงานเก็บผ้ารายวัน')
    ]);
    if (col.status === 'void') sheet.appendChild(h('div', { class: 'stamp void' }, 'ยกเลิก'));
    return sheet;
  }

  // หน้า 1: ใบส่งผ้า (ตรงตามแบบฟอร์มเดิม: 19 รายการ x ชั้น)
  function sendSheet(view) {
    const { slip, lines, items, zones } = view;
    const byseq = {};
    lines.forEach(l => { byseq[l.item_seq] = l; });
    const zsum = zones.map((_, k) => lines.reduce((a, l) => a + (l['z' + (k + 1)] || 0), 0));
    const sheet = h('section', { class: 'sheet' }, [
      letterhead(view, 'รายการส่งผ้า'),
      meta([['ผู้จัดเตรียม', slip.prepared_by], ['เลขที่เอกสาร', slip.doc_no], ['วันที่', dateTH(slip.doc_date)], ['วันที่ส่งผ้า', dateTH(slip.send_date)], ['บริษัทรับซัก', slip.vendor_name], ['วันที่รับผ้า', dateTH(slip.receive_date)]]),
      h('table', { class: 'f' }, [
        h('thead', null, [
          h('tr', null, [h('th', { rowspan: 2, style: 'width:11mm' }, 'ลำดับ'), h('th', { rowspan: 2, style: 'width:78mm' }, 'รายการผ้า'), h('th', { colspan: zones.length + 1 }, 'จำนวนผ้า / ชั้น'), h('th', { rowspan: 2 }, 'หมายเหตุ')]),
          h('tr', null, [zones.map(z => h('th', { style: 'width:13mm' }, z)), h('th', { style: 'width:15mm' }, 'รวม')])
        ]),
        h('tbody', null, items.map((i, n) => {
          const l = byseq[i.seq];
          return h('tr', null, [h('td', { class: 'n' }, n + 1), h('td', null, i.name),
            zones.map((_, k) => h('td', { class: 'q' }, l && l['z' + (k + 1)] ? l['z' + (k + 1)] : '')), h('td', { class: 'q' }, l && l.qty ? l.qty : ''), h('td', { class: 'nt' }, l ? l.note : '')]);
        })),
        h('tfoot', null, h('tr', null, [h('td', { colspan: 2 }, 'รวมจำนวนผ้าที่ส่ง'), zsum.map(v => h('td', null, v || '')), h('td', null, slip.send_total || ''), h('td')]))
      ]),
      h('div', { class: 'sigs' }, [
        sigCell('ผู้ส่ง', slip.sender_sig, slip.sender_name, slip.sent_at, view),
        sigCell('ผู้รับ (ร้านซัก)', slip.vendor_sig, slip.vendor_signer, slip.vendor_signed_at, view)
      ]),
      foot(view, 'ใบส่งผ้า' + colRef(view))
    ]);
    if (slip.status === 'void') sheet.appendChild(h('div', { class: 'stamp void' }, 'ยกเลิก'));
    else if (slip.status === 'dispute') sheet.appendChild(h('div', { class: 'stamp' }, 'ยอดไม่ตรง รอตกลง'));
    return sheet;
  }

  // หน้า 2+: ใบตรวจรับผ้าคืน (เทียบกับยอดส่ง)
  function receiptSheet(view) {
    const { slip, lines, items, receipts, derived } = view;
    const lineBy = {};
    lines.forEach(l => { lineBy[l.item_seq] = l; });
    const rcCols = receipts.map(rc => h('th', { style: 'width:15mm' }, 'รับ ' + (rc.kind === 'supplement' ? 'เพิ่ม ' : '') + '#' + rc.rcpt_no));
    const used = items.filter(i => lineBy[i.seq] && lineBy[i.seq].agreed_qty > 0);
    const last = receipts[receipts.length - 1];
    const sheet = h('section', { class: 'sheet' }, [
      letterhead(view, 'ใบตรวจรับผ้าคืน'),
      meta([['เลขที่เอกสาร', slip.doc_no], ['บริษัทรับซัก', slip.vendor_name], ['วันที่ส่งผ้า', dateTH(slip.send_date)], ['วันที่รับผ้า', receipts.map(r => dateTH(r.receive_date)).join(', ')]]),
      h('table', { class: 'f' }, [
        h('thead', null, h('tr', null, [h('th', { style: 'width:11mm' }, 'ลำดับ'), h('th', null, 'รายการผ้า'), h('th', { style: 'width:17mm' }, 'ส่ง'), rcCols,
          h('th', { style: 'width:17mm' }, 'รับรวม'), h('th', { style: 'width:15mm' }, 'ขาด'), h('th', { style: 'width:17mm' }, 'ชำรุด/คราบ'), h('th', { style: 'width:50mm' }, 'หมายเหตุ')])),
        h('tbody', null, used.map(i => {
          const l = lineBy[i.seq];
          const r = derived.received[i.seq] || 0, ms = derived.missing[i.seq] || 0, df = derived.defect[i.seq] || 0;
          const notes = receipts.map(rc => (rc.lines.find(x => x.item_seq === i.seq) || {}).note).filter(Boolean).join('; ');
          return h('tr', { class: ms > 0 || df > 0 ? 'hl' : '' }, [h('td', { class: 'n' }, i.seq), h('td', null, i.name), h('td', { class: 'q' }, l.agreed_qty),
            receipts.map(rc => h('td', { class: 'q' }, (rc.lines.find(x => x.item_seq === i.seq) || {}).qty || '')),
            h('td', { class: 'q' }, r), h('td', { class: 'q' }, ms || ''), h('td', { class: 'q' }, df || ''), h('td', { class: 'nt' }, notes)]);
        })),
        h('tfoot', null, h('tr', null, [h('td', { colspan: 2 }, 'รวม'), h('td', null, derived.agreed_total), receipts.map(rc => h('td', null, rc.lines.reduce((a, x) => a + x.qty, 0))),
          h('td', null, derived.received_total), h('td', null, derived.missing_total || ''), h('td', null, derived.defect_total || ''), h('td')]))
      ]),
      h('div', { class: 'sigs' }, [
        sigCell('ผู้ตรวจรับ (โรงแรม)', last && last.receiver_sig, last && last.receiver_name, last && last.received_at, view),
        sigCell('ผู้ส่งมอบ (ร้านซัก)', null, last && last.deliverer_name, '', view)
      ]),
      foot(view, 'ใบตรวจรับผ้าคืน')
    ]);
    const done = slip.status === 'closed';
    sheet.appendChild(h('div', { class: 'stamp' + (done && derived.missing_total === 0 ? '' : '') }, done ? 'ปิดงานแล้ว' : (derived.missing_total ? 'ผ้าขาด ' + derived.missing_total + ' ชิ้น' : 'มีผ้าชำรุด/คราบ')));
    if (done && derived.missing_total === 0) sheet.lastChild.style.cssText = 'border-color:#2c6a4d;color:#2c6a4d!important';
    return sheet;
  }

  // หน้าสุดท้าย: ใบแจ้งผ้าขาด/ชำรุด ถึงคู่ค้า (ฉบับล่าสุด)
  function shortageSheet(view, sh) {
    const { slip, items } = view;
    const nm = {};
    items.forEach(i => { nm[i.seq] = i.name; });
    const sheet = h('section', { class: 'sheet' }, [
      letterhead(view, 'ใบแจ้งผ้าขาด / ชำรุด'),
      meta([['เลขที่ใบแจ้ง', sh.rpt_no], ['อ้างอิงใบส่งผ้า', slip.doc_no], ['เรียน', slip.vendor_name], ['วันที่ออกใบแจ้ง', dateTH((sh.created_at || '').slice(0, 10))]]),
      h('table', { class: 'f' }, [
        h('thead', null, h('tr', null, [h('th', { style: 'width:11mm' }, 'ลำดับ'), h('th', null, 'รายการผ้า'), h('th', { style: 'width:22mm' }, 'ขาด (ชิ้น)'), h('th', { style: 'width:26mm' }, 'ชำรุด/คราบ (ชิ้น)'), h('th', { style: 'width:80mm' }, 'หมายเหตุ')])),
        h('tbody', null, sh.lines.map(l => h('tr', null, [h('td', { class: 'n' }, l.item_seq), h('td', null, nm[l.item_seq]), h('td', { class: 'q' }, l.missing || ''), h('td', { class: 'q' }, l.defect || ''), h('td', { class: 'nt' }, l.note)]))),
        h('tfoot', null, h('tr', null, [h('td', { colspan: 2 }, 'รวม'), h('td', null, sh.lines.reduce((a, l) => a + l.missing, 0) || ''), h('td', null, sh.lines.reduce((a, l) => a + l.defect, 0) || ''), h('td')]))
      ]),
      h('p', { style: 'margin-top:3mm;font-size:10pt' }, 'โรงแรมได้ตรวจรับผ้าตามใบส่งผ้าเลขที่ ' + slip.doc_no + ' พบรายการข้างต้น ขอให้ตรวจสอบและแจ้งกำหนดส่งคืน/ชดเชยกลับมา'),
      h('div', { class: 'sigs' }, [
        sigCell('ผู้แจ้ง (โรงแรม)', (view.receipts.slice(-1)[0] || {}).receiver_sig, sh.created_by, sh.created_at, view),
        sigCell('ผู้รับทราบ (ร้านซัก)', sh.ack_sig, sh.ack_name, sh.ack_at, view)
      ]),
      foot(view, 'ใบแจ้งผ้าขาด/ชำรุด ' + sh.rpt_no)
    ]);
    if (sh.ack_name && sh.expect_date) sheet.appendChild(h('div', { class: 'stamp', style: 'top:46mm' }, 'ร้านนัดส่ง ' + dateTH(sh.expect_date)));
    return sheet;
  }

  const buildCollectionPack = view => [collectionSheet(view)];

  /** ชุดเอกสารทั้งหมดของใบส่งผ้า 1 ใบ */
  function buildPack(view, which) {
    const pages = [];
    const hasReceipt = view.receipts.length > 0;
    if (!which || which === 'all' || which === 'send') pages.push(sendSheet(view));
    if (hasReceipt && (!which || which === 'all' || which === 'receipt')) pages.push(receiptSheet(view));
    const sh = view.shortages.filter(s => s.status !== 'superseded' && s.status !== 'resolved').slice(-1)[0] || view.shortages.slice(-1)[0];
    if (sh && (!which || which === 'all' || which === 'shortage')) pages.push(shortageSheet(view, sh));
    return pages;
  }

  return { numInput, textInput, sendGrid, receiveGrid, vendorGrid, buildPack, buildCollectionPack, collectionSheet, sendSheet, receiptSheet, shortageSheet };
})();
