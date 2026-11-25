// ส่วนประกอบหน้าจอที่ใช้ร่วมกันทุกบทบาท: โครงหน้า, รายการเอกสาร, รายละเอียดเอกสาร, หน้าพิมพ์/PDF
const Views = (function () {
  'use strict';
  const { h, dateTH, dateTimeTH, fmt } = UI;

  function badge(status, label) { return h('span', { class: 'badge ' + status }, label || status); }

  // ไอคอนเส้น (24x24) ใช้ร่วมกันทั้งเมนูและปุ่ม
  const ICONS = {
    home: 'M3 11l9-8 9 8M5 9.5V20h14V9.5M10 20v-6h4v6',
    tasks: 'M9 4h6v3H9zM7 5.5H6a2 2 0 0 0-2 2V20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5a2 2 0 0 0-2-2h-1M9 15l2 2 4-4',
    doc: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
    inbox: 'M3 13h5l1 3h6l1-3h5M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z',
    truck: 'M1.5 6h12v10h-12zM13.5 9.5h4l3.5 3.5v3h-7.5zM6.5 16v.01M17.5 16v.01M6.5 19a2 2 0 1 0 .01 0M17.5 19a2 2 0 1 0 .01 0',
    chart: 'M4 20V11M10 20V4M16 20v-7M22 20H2',
    sliders: 'M4 6h8M16 6h4M4 12h2M10 12h10M4 18h10M18 18h2M14 4v4M8 10v4M16 16v4',
    logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    plus: 'M12 5v14M5 12h14'
  };
  function icon(name) {
    const sp = h('span', { class: 'ic', 'aria-hidden': 'true' });
    sp.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + (ICONS[name] || ICONS.doc) + '"/></svg>';
    return sp;
  }

  function layout(opts, content) {
    const me = Api.session;
    const bar = h('header', { class: 'topbar' }, [
      h('a', { href: '#/', class: 'logo', 'aria-label': 'กลับหน้าแรก' }, h('img', { src: 'assets/logo.png', alt: 'inchantree meedao' })),
      me ? h('div', { class: 'who' }, [
        h('div', null, [h('b', null, me.name), h('span', { class: 'rolename' }, me.role === 'admin' ? 'ผู้ดูแลระบบ' : 'หัวหน้าแม่บ้าน')]),
        h('button', { class: 'btn small ghost iconbtn', 'aria-label': 'ออกจากระบบ', title: 'ออกจากระบบ', onclick: async () => { await Api.logout(); location.hash = '#/'; location.reload(); } }, [icon('logout'), h('span', { class: 'lbl' }, 'ออก')])
      ]) : null
    ]);
    const tabs = opts.tabs ? h('nav', { class: 'navtabs', 'aria-label': 'เมนูหลัก' }, opts.tabs.map(t => h('a', { href: t.href, class: t.cta ? 'cta' : null, 'aria-current': t.current ? 'page' : null }, [icon(t.icon), h('span', { class: 'tl' }, t.label)]))) : null;
    return [bar, tabs, h('main', { class: 'page' + (opts.wide ? ' wide' : '') + (tabs ? ' hasnav' : '') }, content)];
  }

  function slipRow(s, href, hint) {
    const late = s.days_out > (hint && hint.overdue || 5) && ['sent', 'dispute', 'confirmed', 'short'].indexOf(s.status) >= 0;
    const needs = s.status === 'dispute' || s.status === 'short';
    return h('a', { class: 'item-row' + (needs ? ' needs' : ''), href }, [
      h('div', { class: 't' }, [s.doc_no, ' ', badge(s.status, hint && hint.statuses[s.status])]),
      h('div', { class: 'meta' }, [s.vendor_name || 'ยังไม่เลือกร้าน', ' · ส่ง ', dateTH(s.send_date) || '—', s.days_out && ['closed', 'void', 'draft'].indexOf(s.status) < 0 ? ' · ผ่านไป ' + s.days_out + ' วัน' : '']),
      h('div', { class: 'side' }, [
        h('b', { class: 'num' }, fmt(s.send_total) + ' ชิ้น'),
        s.outstanding ? h('span', { class: 'bad small' }, 'ค้าง ' + fmt(s.outstanding) + ' ชิ้น') : null,
        late ? h('span', { class: 'badge late' }, 'เกินกำหนด') : null
      ])
    ]);
  }

  function colBadge(status) { return h('span', { class: 'badge ' + (status === 'pending' ? 'confirmed' : status === 'sent' ? 'sent' : 'void') }, (App.boot.col_statuses || {})[status] || status); }

  function colRow(c, href) {
    return h('a', { class: 'item-row' + (c.status === 'pending' ? ' todo' : ''), href }, [
      h('div', { class: 't' }, [c.col_no, ' ', colBadge(c.status)]),
      h('div', { class: 'meta' }, ['เก็บเมื่อ ', dateTH(c.col_date), c.rooms ? ' · ห้อง ' + c.rooms : '', c.doc_no ? ' · ใบส่งผ้า ' + c.doc_no : '']),
      h('div', { class: 'side' }, h('b', { class: 'num' }, fmt(c.total) + ' ชิ้น'))
    ]);
  }

  function colLinesTable(view) {
    const nm = {};
    view.items.forEach(i => { nm[i.seq] = i.name; });
    const zones = view.zones;
    const tot = zones.map((_, k) => view.lines.reduce((a, l) => a + (l['z' + (k + 1)] || 0), 0));
    return h('div', { class: 'tablewrap' }, h('table', { class: 'plain' }, [
      h('thead', null, h('tr', null, [h('th', null, 'รายการผ้า'), zones.map(z => h('th', { class: 'r' }, z)), h('th', { class: 'r' }, 'รวม'), h('th', null, 'หมายเหตุ')])),
      h('tbody', null, view.lines.map(l => h('tr', null, [h('td', null, [h('span', { class: 'muted' }, l.item_seq + '. '), nm[l.item_seq]]),
        zones.map((_, k) => h('td', { class: 'r' }, l['z' + (k + 1)] || '')), h('td', { class: 'r' }, h('b', null, l.qty)), h('td', { class: 'small' }, l.note)]))),
      h('tfoot', null, h('tr', null, [h('td', null, h('b', null, 'รวม')), tot.map(v => h('td', { class: 'r' }, h('b', null, v || ''))), h('td', { class: 'r' }, h('b', null, view.col.total)), h('td')]))
    ]));
  }

  // รายละเอียดใบเก็บผ้า (แม่บ้านและ Admin ใช้ร่วมกัน)
  function colDetail(view, actions) {
    const c = view.col;
    return h('div', { class: 'stack' }, [
      h('div', { class: 'card' }, h('dl', { class: 'kv' }, [
        h('dt', null, 'เลขที่เอกสาร'), h('dd', null, h('b', null, c.col_no)), h('dt', null, 'สถานะ'), h('dd', null, colBadge(c.status)),
        h('dt', null, 'วันที่เก็บผ้า'), h('dd', null, dateTH(c.col_date)), h('dt', null, 'ผู้เก็บผ้า'), h('dd', null, c.prepared_by),
        c.rooms ? [h('dt', null, 'ห้องที่เก็บ'), h('dd', null, c.rooms)] : null, c.note ? [h('dt', null, 'หมายเหตุ'), h('dd', null, c.note)] : null,
        c.doc_no ? [h('dt', null, 'รวมในใบส่งผ้า'), h('dd', null, h('a', { href: '#/slip/' + c.doc_no }, c.doc_no))] : null,
        c.void_reason ? [h('dt', null, 'เหตุผลที่ยกเลิก'), h('dd', { class: 'bad' }, c.void_reason)] : null
      ])),
      actions,
      h('div', { class: 'card' }, [h('h2', null, 'รายการผ้าที่เก็บ (' + fmt(c.total) + ' ชิ้น)'), colLinesTable(view)]),
      view.revisions.length ? h('div', { class: 'card notice' }, [h('h2', null, 'ประวัติการแก้ไขเอกสาร'), h('div', { class: 'stack-s' }, view.revisions.slice().reverse().map(r => h('div', { class: 'revbox' }, [h('b', null, dateTimeTH(r.at) + ' · ' + r.by), h('div', null, 'เหตุผล: ' + r.reason), h('ul', null, r.changes.map(x => h('li', null, x)))])))]) : null,
      h('div', { class: 'card' }, [h('h2', null, 'ความเคลื่อนไหว'), timeline(view)]),
      h('a', { class: 'btn', href: '#/printcol/' + c.col_no }, 'เปิดรายงาน / บันทึกเป็น PDF')
    ]);
  }

  function printColPage(view, backHref) {
    return printShell(view.col.col_no, Forms.buildCollectionPack(view), backHref);
  }

  // การ์ดรวมยอดผ้าสะสมรอส่ง (หน้าแรกของแม่บ้าน)
  function pendingCard(p, actions) {
    return h('div', { class: 'card' + (p.count ? '' : ''), style: 'border-left:5px solid var(--forest)' }, [
      h('div', { class: 'row-sb' }, [h('h2', null, 'ผ้าสะสมรอส่งซัก'), h('span', { class: 'badge ' + (p.count ? 'confirmed' : 'closed') }, p.count ? p.count + ' ใบเก็บผ้า' : 'ไม่มีผ้าสะสม')]),
      p.count ? h('p', null, [h('b', { class: 'num', style: 'font-size:1.6rem' }, fmt(p.total)), ' ชิ้น · เก็บมาตั้งแต่ ', dateTH(p.oldest), p.days ? ' (' + p.days + ' วันแล้ว)' : '']) : h('p', { class: 'muted' }, 'เมื่อเก็บผ้ารายวัน ยอดจะมาสะสมที่นี่จนกว่าจะส่งซัก'),
      actions ? h('div', { class: 'row', style: 'margin-top:.6rem' }, actions) : null
    ]);
  }

  function vendorLink(token) { return location.origin + location.pathname.replace(/index\.html$/, '') + '?t=' + token; }

  function linkCard(slip) {
    if (!slip.token) return null;
    const url = vendorLink(slip.token);
    return h('div', { class: 'card' }, [
      h('h2', null, 'ลิงก์ให้ร้านซัก'),
      h('p', { class: 'muted small' }, 'ส่งลิงก์นี้ให้ร้านซัก (เช่น ทาง LINE ส่วนตัว) ร้านเปิดบนมือถือเพื่อนับ ตรวจ และเซ็นรับได้เลย ไม่ต้องสมัครหรือล็อกอิน'),
      h('input', { type: 'text', readOnly: true, value: url, 'aria-label': 'ลิงก์ร้านซัก', onfocus: e => e.target.select(), style: 'margin:.5rem 0' }),
      h('div', { class: 'row' }, [
        h('button', { class: 'btn small', onclick: () => UI.copyText(url).then(() => UI.toast('คัดลอกลิงก์แล้ว'), () => UI.toast('คัดลอกไม่ได้ กดค้างที่ช่องลิงก์แล้วคัดลอกเอง', true)) }, 'คัดลอกลิงก์'),
        h('button', { class: 'btn small', onclick: () => UI.shareLink('ใบส่งผ้า ' + slip.doc_no, 'กรุณาตรวจนับและเซ็นรับผ้า ' + slip.doc_no, url) }, 'แชร์…')
      ])
    ]);
  }

  function totalsCard(view) {
    const d = view.derived;
    const hasR = view.receipts.length > 0;
    return h('div', { class: 'stats' }, [
      h('div', { class: 'stat' }, [h('div', { class: 'v' }, fmt(view.slip.send_total)), h('div', { class: 'l' }, 'ชิ้นที่ส่งซัก')]),
      h('div', { class: 'stat' }, [h('div', { class: 'v' }, hasR ? fmt(d.received_total) : '—'), h('div', { class: 'l' }, 'ชิ้นที่รับคืนแล้ว')]),
      h('div', { class: 'stat' + (d.missing_total ? ' hot' : '') }, [h('div', { class: 'v' }, hasR ? fmt(d.missing_total) : '—'), h('div', { class: 'l' }, 'ชิ้นที่ขาด')]),
      h('div', { class: 'stat' + (d.defect_total ? ' mid' : '') }, [h('div', { class: 'v' }, hasR ? fmt(d.defect_total) : '—'), h('div', { class: 'l' }, 'ชิ้นชำรุด / คราบ')])
    ]);
  }

  function linesTable(view) {
    const nm = {};
    view.items.forEach(i => { nm[i.seq] = i.name; });
    const d = view.derived;
    const hasR = view.receipts.length > 0;
    const hasAcc = !!(view.collections && view.collections.length);
    const rows = view.lines.filter(l => l.qty > 0 || l.agreed_qty > 0 || (hasAcc && l.acc_qty > 0));
    return h('div', { class: 'tablewrap' }, h('table', { class: 'plain' }, [
      h('thead', null, h('tr', null, [h('th', null, 'รายการผ้า'), h('th', { class: 'r' }, 'ส่ง'), hasAcc ? h('th', { class: 'r' }, 'สะสม') : null, view.slip.vendor_sig ? h('th', { class: 'r' }, 'ร้านนับ') : null, hasR ? h('th', { class: 'r' }, 'รับคืน') : null, hasR ? h('th', { class: 'r' }, 'ขาด') : null, hasR ? h('th', { class: 'r' }, 'ชำรุด') : null, h('th', null, 'หมายเหตุ')])),
      h('tbody', null, rows.map(l => h('tr', null, [
        h('td', null, [h('span', { class: 'muted' }, l.item_seq + '. '), nm[l.item_seq]]),
        h('td', { class: 'r' }, l.agreed_qty !== l.qty ? [h('s', { class: 'muted' }, l.qty), ' ', l.agreed_qty] : l.qty),
        hasAcc ? h('td', { class: 'r' + (l.acc_qty !== l.qty ? ' bad' : '') }, l.acc_qty || '') : null,
        view.slip.vendor_sig ? h('td', { class: 'r' + (l.vendor_qty >= 0 && l.vendor_qty !== l.agreed_qty ? ' bad' : '') }, l.vendor_qty >= 0 ? l.vendor_qty : '') : null,
        hasR ? h('td', { class: 'r' }, d.received[l.item_seq] || 0) : null,
        hasR ? h('td', { class: 'r' + (d.missing[l.item_seq] ? ' bad' : '') }, d.missing[l.item_seq] || '') : null,
        hasR ? h('td', { class: 'r' + (d.defect[l.item_seq] ? ' bad' : '') }, d.defect[l.item_seq] || '') : null,
        h('td', { class: 'small' }, l.note)
      ])))
    ]));
  }

  function timeline(view) {
    const warn = { vendor_dispute: 1, receive_short: 1, admin_edit: 1, void: 1 };
    return h('ol', { class: 'timeline' }, view.events.map(e => h('li', { class: warn[e.action] ? 'warn' : '' }, h('div', null, [
      h('b', null, e.label), h('div', { class: 'when' }, dateTimeTH(e.at) + ' · ' + e.actor), e.detail ? h('div', { class: 'detail' }, e.detail) : null
    ]))));
  }

  function revisionsBox(view) {
    if (!view.revisions || !view.revisions.length) return null;
    return h('div', { class: 'card notice' }, [
      h('h2', null, 'ประวัติการแก้ไขเอกสาร (' + view.revisions.length + ' ครั้ง)'),
      h('div', { class: 'stack-s' }, view.revisions.slice().reverse().map(r => h('div', { class: 'revbox' }, [
        h('b', null, dateTimeTH(r.at) + ' · ' + r.by), h('div', null, 'เหตุผล: ' + r.reason),
        h('ul', null, r.changes.map(c => h('li', null, c)))
      ])))
    ]);
  }

  function shortageCard(view) {
    const open = view.shortages.filter(s => s.status === 'open' || s.status === 'acknowledged').slice(-1)[0];
    if (!open) return null;
    const nm = {};
    view.items.forEach(i => { nm[i.seq] = i.name; });
    return h('div', { class: 'card alert' }, [
      h('div', { class: 'row-sb' }, [h('h2', null, 'ใบแจ้งผ้าขาด/ชำรุด ' + open.rpt_no), badge(open.status === 'open' ? 'dispute' : 'confirmed', open.status === 'open' ? 'รอร้านซักรับทราบ' : 'ร้านรับทราบแล้ว')]),
      h('ul', { style: 'margin:.3rem 0 .5rem;padding-left:1.2rem' }, open.lines.map(l => h('li', null, [nm[l.item_seq], ' — ', l.missing ? h('b', null, 'ขาด ' + l.missing + ' ') : null, l.defect ? h('b', null, 'ชำรุด/คราบ ' + l.defect + ' ') : null, l.note ? '(' + l.note + ')' : null]))),
      open.ack_name ? h('p', { class: 'small' }, 'ร้านรับทราบโดย ' + open.ack_name + ' เมื่อ ' + dateTimeTH(open.ack_at) + (open.expect_date ? ' · นัดส่งผ้า ' + dateTH(open.expect_date) : '') + (open.ack_note ? ' · "' + open.ack_note + '"' : '')) : null
    ]);
  }

  function headCard(view) {
    const s = view.slip;
    return h('div', { class: 'card' }, h('dl', { class: 'kv' }, [
      h('dt', null, 'เลขที่เอกสาร'), h('dd', null, h('b', null, s.doc_no)),
      h('dt', null, 'สถานะ'), h('dd', null, badge(s.status, view.status_label)),
      h('dt', null, 'ร้านซัก'), h('dd', null, s.vendor_name || '—'),
      h('dt', null, 'ผู้จัดเตรียม'), h('dd', null, s.prepared_by),
      h('dt', null, 'วันที่ส่งผ้า'), h('dd', null, dateTH(s.send_date) || '—'),
      h('dt', null, 'วันที่รับผ้า'), h('dd', null, dateTH(s.receive_date) || '—'),
      view.derived.days_out ? [h('dt', null, 'อยู่ที่ร้าน'), h('dd', null, view.derived.days_out + ' วัน')] : null,
      s.note ? [h('dt', null, 'หมายเหตุ'), h('dd', null, s.note)] : null,
      s.void_reason ? [h('dt', null, 'เหตุผลที่ยกเลิก'), h('dd', { class: 'bad' }, s.void_reason)] : null
    ]));
  }

  /** รายละเอียดเอกสาร (ทุกบทบาทใช้ร่วมกัน) — actions คือปุ่มที่แต่ละบทบาทใส่เพิ่ม */
  function slipDetail(view, actions, role) {
    const printHref = role === 'vendor' ? null : '#/print/' + view.slip.doc_no;
    return h('div', { class: 'stack' }, [
      headCard(view),
      view.slip.status === 'draft' ? null : totalsCard(view),
      shortageCard(view),
      actions,
      role === 'vendor' || !view.collections || !view.collections.length ? null : h('div', { class: 'card' }, [
        h('h2', null, 'รวมจากใบเก็บผ้ารายวัน (' + view.collections.length + ' ใบ)'),
        h('p', { class: 'muted small', style: 'margin-bottom:.5rem' }, 'ยอดสะสมจากใบเก็บผ้า ' + fmt(view.lines.reduce((a, l) => a + l.acc_qty, 0)) + ' ชิ้น · ส่งซักจริง ' + fmt(view.slip.send_total) + ' ชิ้น' + (view.lines.some(l => l.acc_qty !== l.qty) ? ' · มีรายการที่นับจริงต่างจากยอดสะสม (แสดงสีแดงในตารางด้านล่าง)' : '')),
        h('div', { class: 'list' }, view.collections.map(c => colRow(c, '#/col/' + c.col_no)))]),
      role === 'vendor' ? null : linkCard(view.slip),
      h('div', { class: 'card' }, [h('h2', null, 'รายการผ้า'), linesTable(view)]),
      revisionsBox(view),
      h('div', { class: 'card' }, [h('h2', null, 'ความเคลื่อนไหว'), view.events.length ? timeline(view) : h('p', { class: 'muted' }, 'ยังไม่มีความเคลื่อนไหว')]),
      printHref && view.slip.status !== 'draft' ? h('a', { class: 'btn', href: printHref }, 'เปิดเอกสาร / บันทึกเป็น PDF') : null
    ]);
  }

  /** หน้าตัวอย่างเอกสาร A4 แนวนอน พร้อมปุ่มพิมพ์/บันทึก PDF */
  function printPage(view, backHref, which, isVendor) {
    return printShell(view.slip.doc_no, Forms.buildPack(view, which), backHref);
  }
  function printShell(title, pages, backHref) {
    const root = h('div', { class: 'printroot' });
    const sheets = h('div', { class: 'sheets' }, pages);
    function fit() {
      const avail = Math.min(window.innerWidth, document.documentElement.clientWidth) - 16;
      const need = 297 * 3.7795;
      const z = Math.min(1, avail / need);
      sheets.style.zoom = z < 1 ? String(z) : '';
    }
    window.addEventListener('resize', fit);
    const bar = h('div', { class: 'printbar' }, [
      h('a', { class: 'btn small', href: backHref }, '← กลับ'),
      h('b', null, title),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: () => { sheets.style.zoom = ''; setTimeout(() => { window.print(); fit(); }, 60); } }, 'พิมพ์ / บันทึกเป็น PDF')
    ]);
    const tip = h('p', { class: 'hint center noprint', style: 'padding:.4rem 1rem' }, 'กด "พิมพ์ / บันทึกเป็น PDF" แล้วเลือกปลายทางเป็น "บันทึกเป็น PDF" (ขนาด A4 แนวนอน) · มี ' + pages.length + ' หน้า');
    UI.append(root, [bar, tip, sheets]);
    setTimeout(fit, 0);
    return root;
  }

  return { icon, badge, colBadge, colRow, colDetail, colLinesTable, printColPage, pendingCard, layout, slipRow, slipDetail, printPage, vendorLink, totalsCard, linesTable, timeline, shortageCard, headCard };
})();
