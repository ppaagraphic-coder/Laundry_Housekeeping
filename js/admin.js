// หน้าจอของ Admin: แดชบอร์ดมอนิเตอร์, เอกสารทั้งหมด, แก้ไขพร้อมเหตุผล, ตั้งค่า / สต็อกมาตรฐาน (par)
const Admin = (function () {
  'use strict';
  const { h, dateTH, dateTimeTH, fmt } = UI;
  const tabs = cur => [{ href: '#/', icon: 'home', label: 'ภาพรวม', current: cur === 'home' }, { href: '#/slips', icon: 'truck', label: 'ใบส่งผ้า', current: cur === 'slips' }, { href: '#/collections', icon: 'inbox', label: 'ใบเก็บผ้า', current: cur === 'col' }, { href: '#/report/day', icon: 'chart', label: 'รายงาน', current: cur === 'report' }, { href: '#/settings', icon: 'sliders', label: 'ตั้งค่า', current: cur === 'settings' }];
  const show = (root, cur, content) => UI.mount(root, Views.layout({ tabs: tabs(cur), wide: true }, content));
  const hint = () => ({ statuses: App.boot.statuses, overdue: App.boot.overdue_days });

  // ---------------------------------------------------------------- ภาพรวม
  async function home(root) {
    const d = await Api.call('dashboard');
    const c = d.counts;
    const overdueN = d.vendors.reduce((a, v) => a + v.slips.filter(s => s.overdue).length, 0);
    const maxOut = Math.max(1, ...d.items.map(i => i.at_laundry));

    const vendors = d.vendors.length ? d.vendors.map(v => h('div', { class: 'card' }, [
      h('div', { class: 'row-sb' }, [h('h2', null, v.name), h('span', null, [h('b', { class: 'num' }, fmt(v.total)), ' ชิ้นค้างที่ร้าน'])]),
      h('div', { class: 'list', style: 'margin-top:.6rem' }, v.slips.map(s => h('a', { class: 'item-row' + (s.status === 'dispute' || s.status === 'short' ? ' needs' : ''), href: '#/slip/' + s.doc_no }, [
        h('div', { class: 't' }, [s.doc_no, ' ', Views.badge(s.status, App.boot.statuses[s.status])]),
        h('div', { class: 'meta' }, 'ส่งเมื่อ ' + dateTH(s.send_date) + ' · ผ่านไป ' + s.days_out + ' วัน'),
        h('div', { class: 'side' }, [h('b', { class: 'num' }, s.outstanding ? fmt(s.outstanding) + ' ชิ้น' : 'รอปิดงาน'), s.overdue ? h('span', { class: 'badge late' }, 'เกิน ' + d.overdue_days + ' วัน') : null])
      ])))
    ])) : [h('div', { class: 'empty' }, [h('b', null, 'ไม่มีผ้าค้างที่ร้านซัก'), 'ผ้าทั้งหมดอยู่ที่โรงแรม'])];

    const items = h('div', { class: 'card' }, [h('div', { class: 'row-sb' }, [h('h2', null, 'ผ้าแยกตามรายการ เทียบสต็อกมาตรฐาน (par)'), h('a', { class: 'btn small', href: '#/settings' }, 'กรอก par')]),
      h('div', { class: 'tablewrap' }, h('table', { class: 'plain' }, [
        h('thead', null, h('tr', null, [h('th', null, 'รายการ'), h('th', { class: 'r' }, 'par'), h('th', { class: 'r' }, 'สะสมรอส่ง'), h('th', { class: 'r' }, 'อยู่ที่ร้านซัก'), h('th', null, ''), h('th', { class: 'r' }, 'คงเหลือโรงแรม'), h('th', { class: 'r' }, 'ขาดค้าง')])),
        h('tbody', null, d.items.map(i => h('tr', null, [
          h('td', null, [h('span', { class: 'muted' }, i.seq + '. '), i.name]), h('td', { class: 'r' }, i.par || '—'), h('td', { class: 'r' }, i.pending || ''), h('td', { class: 'r' }, i.at_laundry || ''),
          h('td', null, h('div', { class: 'bar' + (i.short_open ? ' rust' : '') }, h('i', { style: 'width:' + Math.round(i.at_laundry / maxOut * 100) + '%' }))),
          h('td', { class: 'r' + (i.in_hotel !== null && i.in_hotel < 0 ? ' bad' : '') }, i.in_hotel === null ? '—' : i.in_hotel), h('td', { class: 'r' + (i.short_open ? ' bad' : '') }, i.short_open || '')])))
      ])),
      d.items.every(i => !i.par) ? h('p', { class: 'hint', style: 'margin-top:.5rem' }, 'ยังไม่ได้กรอกสต็อกมาตรฐาน (par) — ไปที่ "ตั้งค่า / สต็อก" เพื่อกรอกยอดผ้าทั้งหมดของโรงแรม ระบบจะคำนวณคงเหลือให้') : null]);

    const feed = h('div', { class: 'card' }, [h('h2', null, 'ความเคลื่อนไหวล่าสุด (การแจ้ง Admin)'),
      d.feed.length ? h('ol', { class: 'timeline' }, d.feed.map(f => h('li', { class: ['vendor_dispute', 'receive_short', 'admin_edit', 'void'].indexOf(f.action) >= 0 ? 'warn' : '' }, h('div', null, [
        f.doc_no ? h('a', { href: '#/slip/' + f.doc_no }, h('b', null, f.label + ' · ' + f.doc_no)) : h('b', null, f.label), h('div', { class: 'when' }, dateTimeTH(f.at) + ' · ' + f.actor), f.detail ? h('div', { class: 'detail' }, f.detail.split('\n').slice(0, 3).join('\n')) : null
      ]))) ) : h('p', { class: 'muted' }, 'ยังไม่มีความเคลื่อนไหว')]);

    const issues = d.issues.length ? h('div', { class: 'card alert' }, [h('h2', null, 'ต้องติดตาม (' + d.issues.length + ')'), h('div', { class: 'list' }, d.issues.map(s => Views.slipRow(s, '#/slip/' + s.doc_no, hint())))]) : null;

    show(root, 'home', [
      h('div', { class: 'pagehead' }, [h('h1', null, 'ภาพรวมผ้าซัก'), h('p', { class: 'muted' }, 'ข้อมูลณ วันที่ ' + dateTH(d.today))]),
      h('div', { class: 'stack' }, [
        h('div', { class: 'stats' }, [
          h('div', { class: 'stat' + (d.pending.days > d.overdue_days ? ' hot' : '') }, [h('div', { class: 'v' }, fmt(d.pending.total)), h('div', { class: 'l' }, 'ชิ้นผ้าสะสมรอส่งซัก' + (d.pending.count ? ' (' + d.pending.count + ' ใบ)' : ''))]),
          h('div', { class: 'stat mid' }, [h('div', { class: 'v' }, fmt(d.at_laundry_total)), h('div', { class: 'l' }, 'ชิ้นอยู่ที่ร้านซักตอนนี้')]),
          h('div', { class: 'stat' }, [h('div', { class: 'v' }, (c.sent || 0) + (c.confirmed || 0)), h('div', { class: 'l' }, 'ใบรอรับผ้าคืน')]),
          h('div', { class: 'stat' + ((c.dispute || 0) + (c.short || 0) ? ' hot' : '') }, [h('div', { class: 'v' }, (c.dispute || 0) + (c.short || 0)), h('div', { class: 'l' }, 'ใบที่ยอดไม่ตรง / ผ้าขาด')]),
          h('div', { class: 'stat' + (overdueN ? ' hot' : '') }, [h('div', { class: 'v' }, overdueN), h('div', { class: 'l' }, 'ใบค้างเกิน ' + d.overdue_days + ' วัน')])
        ]),
        issues,
        d.pending.count ? h('div', { class: 'card' }, [
          h('div', { class: 'row-sb' }, [h('h2', null, 'ผ้าสะสมรอส่งซัก · เก็บมาตั้งแต่ ' + dateTH(d.pending.oldest) + (d.pending.days ? ' (' + d.pending.days + ' วัน)' : '')), h('a', { class: 'btn small', href: '#/collections' }, 'ดูใบเก็บผ้า')]),
          h('p', { class: 'muted small', style: 'margin:.3rem 0' }, App.boot.zones.map((z, k) => z + ' ' + (d.pending.by_zone[k] || 0)).join(' · ')),
          h('div', { class: 'list' }, d.pending.cols.slice(-5).reverse().map(c => Views.colRow(Object.assign({ status: 'pending', doc_no: '' }, c), '#/col/' + c.col_no)))]) : null,
        h('div', { class: 'dash' }, [h('div', { class: 'stack' }, [h('h2', null, 'ผ้าที่อยู่ที่ร้านซัก แยกตามร้าน'), vendors, items]), feed])
      ])
    ]);
  }

  // ---------------------------------------------------------------- เอกสารทั้งหมด
  async function slips(root) {
    const { slips: all } = await Api.call('listSlips', { limit: 500 });
    let st = '', q = '';
    const box = h('div', { class: 'list' });
    const search = h('input', { type: 'search', placeholder: 'ค้นหาเลขที่เอกสาร / ชื่อร้าน', 'aria-label': 'ค้นหา' });
    const sel = h('select', { 'aria-label': 'กรองสถานะ' }, [h('option', { value: '' }, 'ทุกสถานะ'), Object.keys(App.boot.statuses).map(k => h('option', { value: k }, App.boot.statuses[k]))]);
    const draw = () => {
      const list = all.filter(s => (!st || s.status === st) && (!q || (s.doc_no + ' ' + s.vendor_name).toLowerCase().indexOf(q) >= 0));
      box.replaceChildren(...(list.length ? list.map(s => Views.slipRow(s, '#/slip/' + s.doc_no, hint())) : [h('div', { class: 'empty' }, [h('b', null, 'ไม่พบเอกสาร'), 'ลองเปลี่ยนคำค้นหรือสถานะ'])]));
    };
    search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
    sel.addEventListener('change', () => { st = sel.value; draw(); });
    draw();
    show(root, 'slips', [h('div', { class: 'pagehead' }, h('h1', null, 'เอกสารทั้งหมด (' + all.length + ')')), h('div', { class: 'grid2', style: 'margin-bottom:1rem' }, [search, sel]), box]);
  }

  // ---------------------------------------------------------------- รายงานสรุป (รายวัน / รายเดือน / รายปี)
  const MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const RT = { day: 'รายวัน', month: 'รายเดือน', year: 'รายปี' };

  function periodTitle(type, key) {
    if (type === 'day') return dateTH(key);
    if (type === 'month') return MONTHS_FULL[Number(key.slice(5, 7)) - 1] + ' ' + (Number(key.slice(0, 4)) + 543);
    return 'ปี ' + (Number(key) + 543);
  }
  function shiftKey(type, key, n) {
    if (type === 'day') { const d = new Date(Date.parse(key + 'T00:00:00Z') + n * 86400000); return d.toISOString().slice(0, 10); }
    if (type === 'month') { const y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7)) - 1 + n; const d = new Date(Date.UTC(y, m, 1)); return d.toISOString().slice(0, 7); }
    return String(Number(key) + n);
  }
  function convertKey(from, to, key) {
    const today = Core.todayBKK();
    if (from === to) return key;
    if (to === 'day') return from === 'month' ? (key === today.slice(0, 7) ? today : key + '-01') : (key === today.slice(0, 4) ? today : key + '-01-01');
    if (to === 'month') return key.slice(0, 7);
    return key.slice(0, 4);
  }
  function downloadCSV(name, rows) {
    const esc = v => { v = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const blob = new Blob(['﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function idleToggle(label) {
    const cb = h('input', { type: 'checkbox', checked: true, style: 'width:20px;height:20px' });
    cb.addEventListener('change', () => { const tb = cb.closest('.card').querySelector('table.sticky'); if (tb) tb.classList.toggle('hide-idle', cb.checked); });
    return h('label', { class: 'row small grow', style: 'gap:.4rem;min-height:36px' }, [cb, label]);
  }
  const dash = v => (v ? fmt(v) : h('span', { class: 'muted' }, '–'));
  const docHref = no => (String(no).indexOf('CL-') === 0 ? '#/col/' : '#/slip/') + no;
  const SEVERE = { dispute: 1, short: 1, defect: 1, excess: 1, acc_diff: 1 };

  async function report(root, type, key) {
    type = RT[type] ? type : 'day';
    const r = await Api.call('report', { type, key: key || '' });
    key = r.key;
    const go = (t, k) => { location.hash = '#/report/' + t + '/' + k; };

    const seg = h('div', { class: 'seg', role: 'tablist', 'aria-label': 'ช่วงเวลารายงาน' }, Object.keys(RT).map(t =>
      h('a', { role: 'tab', 'aria-selected': String(t === type), href: '#/report/' + t + '/' + convertKey(type, t, key) }, RT[t])));
    const input = type === 'year'
      ? h('input', { type: 'number', min: 2000, max: 2100, value: key, 'aria-label': 'ปี (ค.ศ.)', style: 'width:110px;text-align:center' })
      : h('input', { type: type === 'day' ? 'date' : 'month', value: key, 'aria-label': 'เลือกช่วงเวลา' });
    input.addEventListener('change', () => { const v = input.value.trim(); if (v) go(type, v); });
    const today = Core.todayBKK();
    const nowKey = type === 'day' ? today : type === 'month' ? today.slice(0, 7) : today.slice(0, 4);
    const picker = h('div', { class: 'row picker' }, [
      h('button', { class: 'btn small', 'aria-label': 'ก่อนหน้า', onclick: () => go(type, shiftKey(type, key, -1)) }, '‹'), input,
      h('button', { class: 'btn small', 'aria-label': 'ถัดไป', onclick: () => go(type, shiftKey(type, key, 1)) }, '›'),
      key !== nowKey ? h('button', { class: 'btn small', onclick: () => go(type, nowKey) }, type === 'day' ? 'วันนี้' : type === 'month' ? 'เดือนนี้' : 'ปีนี้') : null]);

    const c = r.counts, t = r.totals;
    const tile = (v, label, sub, cls) => h('div', { class: 'stat' + (cls ? ' ' + cls : '') }, [h('div', { class: 'v' }, fmt(v)), h('div', { class: 'l' }, label), sub ? h('div', { class: 'hint' }, sub) : null]);
    const tiles = h('div', { class: 'stats' }, [
      tile(t.collected, 'ชิ้นที่เก็บผ้า', fmt(c.collections) + ' ใบเก็บผ้า'),
      tile(t.sent, 'ชิ้นที่ส่งซัก', 'ส่งซัก ' + fmt(c.sends) + ' ครั้ง'),
      tile(t.received, 'ชิ้นที่รับคืน', 'รับคืน ' + fmt(c.receipts) + ' ครั้ง' + (c.supplements ? ' (รับเพิ่ม ' + c.supplements + ')' : '')),
      tile(t.missing, 'ชิ้นที่ขาด', null, t.missing ? 'hot' : ''),
      tile(t.defect, 'ชิ้นชำรุด / คราบ', null, t.defect ? 'mid' : ''),
      tile(r.errors.total, 'ข้อผิดพลาด / การแก้ไข', r.errors.total ? 'ดูรายการด้านล่าง' : 'ไม่พบในช่วงนี้', r.errors.types.some(x => SEVERE[x.type] && x.count) ? 'hot' : '')
    ]);
    const ytdLine = r.ytd_counts ? h('div', { class: 'card' }, h('p', null, [h('b', null, 'สะสมตั้งแต่ต้นปี ' + (Number(key.slice(0, 4)) + 543) + ' ถึงสิ้นเดือนนี้: '),
      'เก็บผ้า ' + fmt(r.ytd_counts.collections) + ' ใบ · ส่งซัก ' + fmt(r.ytd_counts.sends) + ' ครั้ง (' + fmt(t.ytd_sent) + ' ชิ้น) · รับคืน ' + fmt(r.ytd_counts.receipts) + ' ครั้ง · ผ้าขาด/ชำรุด ' + fmt(t.ytd_problem) + ' ชิ้น · ข้อผิดพลาดและการแก้ไข ' + fmt(r.errors.ytd_total) + ' รายการ'])) : null;

    // ตารางแยกชนิดผ้า
    const hasYtd = type === 'month';
    const itemTable = h('div', { class: 'card flush' }, [
      h('div', { class: 'row-sb', style: 'padding:1rem 1rem .4rem' }, [h('h2', null, 'จำนวนผ้าแต่ละชนิด · ' + periodTitle(type, key)), idleToggle('เฉพาะรายการที่มีการเคลื่อนไหว'),
        h('button', { class: 'btn small', onclick: () => downloadCSV('รายงาน-ผ้า-' + type + '-' + key + '.csv', [
          ['รายการผ้า', 'เก็บผ้า', 'ส่งซัก', 'รับคืน', 'ผ้าขาด', 'ชำรุด/คราบ'].concat(hasYtd ? ['สะสมต้นปี ส่งซัก', 'สะสมต้นปี ขาด+ชำรุด'] : [])]
          .concat(r.items.map(i => [i.seq + '. ' + i.name, i.collected, i.sent, i.received, i.missing, i.defect].concat(hasYtd ? [i.ytd_sent, i.ytd_problem] : [])))
          .concat([['รวม', t.collected, t.sent, t.received, t.missing, t.defect].concat(hasYtd ? [t.ytd_sent, t.ytd_problem] : [])])) }, 'ดาวน์โหลด CSV')]),
      h('div', { class: 'tablewrap' }, h('table', { class: 'plain sticky hide-idle' }, [
        h('thead', null, h('tr', null, [h('th', null, 'รายการผ้า'), ['เก็บผ้า', 'ส่งซัก', 'รับคืน', 'ขาด', 'ชำรุด/คราบ'].map(x => h('th', { class: 'r' }, x)),
          hasYtd ? [h('th', { class: 'r ytd' }, 'สะสมปี ส่งซัก'), h('th', { class: 'r ytd' }, 'สะสมปี ขาด+ชำรุด')] : null])),
        h('tbody', null, r.items.map(i => h('tr', { class: (i.collected + i.sent + i.received + i.missing + i.defect + (i.ytd_sent || 0)) ? '' : 'idle' }, [
          h('td', null, [h('span', { class: 'muted' }, i.seq + '. '), i.name]), h('td', { class: 'r' }, dash(i.collected)), h('td', { class: 'r' }, dash(i.sent)), h('td', { class: 'r' }, dash(i.received)),
          h('td', { class: 'r' + (i.missing ? ' bad' : '') }, dash(i.missing)), h('td', { class: 'r' + (i.defect ? ' bad' : '') }, dash(i.defect)),
          hasYtd ? [h('td', { class: 'r ytd' }, dash(i.ytd_sent)), h('td', { class: 'r ytd' + (i.ytd_problem ? ' bad' : '') }, dash(i.ytd_problem))] : null]))),
        h('tfoot', null, h('tr', null, [h('td', null, 'รวม'), [t.collected, t.sent, t.received, t.missing, t.defect].map(v => h('td', { class: 'r' }, fmt(v))), hasYtd ? [h('td', { class: 'r ytd' }, fmt(t.ytd_sent)), h('td', { class: 'r ytd' }, fmt(t.ytd_problem))] : null]))]))]);

    // ข้อผิดพลาด
    const errTypes = h('div', { class: 'tablewrap' }, h('table', { class: 'plain' }, [
      h('thead', null, h('tr', null, [h('th', null, 'ประเภท'), h('th', { class: 'r' }, type === 'day' ? 'วันนี้' : type === 'month' ? 'เดือนนี้' : 'ปีนี้'), hasYtd ? h('th', { class: 'r ytd' }, 'สะสมต้นปี') : null])),
      h('tbody', null, r.errors.types.map(x => h('tr', { class: x.count || x.ytd ? '' : 'idle' }, [h('td', null, [h('span', { class: 'badge ' + (SEVERE[x.type] ? 'dispute' : 'confirmed') }, x.label)]), h('td', { class: 'r' }, dash(x.count)), hasYtd ? h('td', { class: 'r ytd' }, dash(x.ytd)) : null])))]));
    const list = r.errors.list.length ? h('ul', { class: 'errlist' }, r.errors.list.map(e => h('li', null, [
      h('div', { class: 'row' }, [h('span', { class: 'badge ' + (SEVERE[e.type] ? 'dispute' : 'confirmed') }, e.label), h('a', { href: docHref(e.doc_no) }, h('b', null, e.doc_no)), type !== 'day' ? h('span', { class: 'muted small' }, dateTH(e.date)) : null]),
      e.detail ? h('div', { class: 'small errd' }, e.detail) : null]))) : h('p', { class: 'good', style: 'padding:.4rem 0' }, '✓ ไม่พบข้อผิดพลาดหรือการแก้ไขเอกสารในช่วงนี้');
    const errBox = h('div', { class: 'card' + (r.errors.total ? '' : '') }, [h('h2', null, 'ข้อผิดพลาดและการแก้ไข (' + fmt(r.errors.total) + ')'),
      h('div', { class: 'dash', style: 'margin-top:.6rem;align-items:start' }, [errTypes, h('div', null, [list, r.errors.total > r.errors.list.length ? h('p', { class: 'hint' }, 'แสดง ' + r.errors.list.length + ' รายการล่าสุด จากทั้งหมด ' + r.errors.total) : null])])]);

    // แนวโน้ม (รายเดือน = รายวัน, รายปี = รายเดือน)
    let trendBox = null;
    if (r.trend) {
      const maxSent = Math.max(1, ...r.trend.map(x => x.sent));
      const lab = k => type === 'month' ? Number(k.slice(8, 10)) : MONTHS_SHORT[Number(k.slice(5, 7)) - 1];
      trendBox = h('div', { class: 'card flush' }, [h('div', { class: 'row-sb', style: 'padding:1rem 1rem .2rem' }, [h('h2', null, type === 'month' ? 'รายวันในเดือนนี้ (กดวันที่เพื่อดูรายวัน)' : 'รายเดือนในปีนี้ (กดเดือนเพื่อดูรายเดือน)'), type === 'month' ? idleToggle('เฉพาะวันที่มีการเคลื่อนไหว') : null]),
        h('div', { class: 'tablewrap' }, h('table', { class: 'plain sticky' + (type === 'month' ? ' hide-idle' : '') }, [
          h('thead', null, h('tr', null, [h('th', null, type === 'month' ? 'วันที่' : 'เดือน'), ['เก็บผ้า', 'ส่งซัก (ชิ้น)'].map(x => h('th', { class: 'r' }, x)), h('th', null, ''), ['รับคืน', 'ขาด', 'ชำรุด', 'ส่งซัก (ครั้ง)', 'รับคืน (ครั้ง)', 'ข้อผิดพลาด'].map(x => h('th', { class: 'r' }, x)),
            ['สะสมส่งซัก (ชิ้น)', 'สะสมส่ง (ครั้ง)', 'สะสมรับ (ครั้ง)', 'สะสมข้อผิดพลาด'].map(x => h('th', { class: 'r ytd' }, x))])),
          h('tbody', null, r.trend.map(x => h('tr', { class: (x.collected + x.sent + x.received + x.sends + x.receipts + x.errors) ? '' : 'idle' }, [
            h('td', null, h('a', { href: '#/report/' + (type === 'month' ? 'day' : 'month') + '/' + x.key }, String(lab(x.key)))),
            h('td', { class: 'r' }, dash(x.collected)), h('td', { class: 'r' }, dash(x.sent)), h('td', null, h('div', { class: 'bar' }, h('i', { style: 'width:' + Math.round(x.sent / maxSent * 100) + '%' }))),
            h('td', { class: 'r' }, dash(x.received)), h('td', { class: 'r' + (x.missing ? ' bad' : '') }, dash(x.missing)), h('td', { class: 'r' + (x.defect ? ' bad' : '') }, dash(x.defect)),
            h('td', { class: 'r' }, dash(x.sends)), h('td', { class: 'r' }, dash(x.receipts)), h('td', { class: 'r' + (x.errors ? ' bad' : '') }, dash(x.errors)),
            h('td', { class: 'r ytd' }, fmt(x.cum_sent)), h('td', { class: 'r ytd' }, fmt(x.cum_sends)), h('td', { class: 'r ytd' }, fmt(x.cum_receipts)), h('td', { class: 'r ytd' }, fmt(x.cum_errors))])))]))]);
    }

    show(root, 'report', [
      h('div', { class: 'pagehead' }, [h('h1', null, 'รายงานสรุป'), h('p', { class: 'muted' }, RT[type] + ' · ' + periodTitle(type, key))]),
      h('div', { class: 'row-sb', style: 'margin-bottom:1rem;gap:.8rem' }, [seg, picker]),
      h('div', { class: 'stack' }, [tiles, ytdLine, itemTable, errBox, trendBox])
    ]);
  }

  // ---------------------------------------------------------------- ใบเก็บผ้า
  async function collections(root) {
    const { collections: all } = await Api.call('listCollections', { limit: 500 });
    let st = '', q = '';
    const box = h('div', { class: 'list' });
    const search = h('input', { type: 'search', placeholder: 'ค้นหาเลขที่ / ห้อง', 'aria-label': 'ค้นหา' });
    const sel = h('select', { 'aria-label': 'กรองสถานะ' }, [h('option', { value: '' }, 'ทุกสถานะ'), Object.keys(App.boot.col_statuses).map(k => h('option', { value: k }, App.boot.col_statuses[k]))]);
    const draw = () => {
      const list = all.filter(c => (!st || c.status === st) && (!q || (c.col_no + ' ' + c.rooms).toLowerCase().indexOf(q) >= 0));
      box.replaceChildren(...(list.length ? list.map(c => Views.colRow(c, '#/col/' + c.col_no)) : [h('div', { class: 'empty' }, [h('b', null, 'ไม่พบใบเก็บผ้า'), 'ลองเปลี่ยนคำค้นหรือสถานะ'])]));
    };
    search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
    sel.addEventListener('change', () => { st = sel.value; draw(); });
    draw();
    show(root, 'col', [h('div', { class: 'pagehead' }, h('h1', null, 'ใบเก็บผ้ารายวัน (' + all.length + ')')), h('div', { class: 'grid2', style: 'margin-bottom:1rem' }, [search, sel]), box]);
  }

  async function collection(root, colNo) {
    const view = await Api.call('getCollection', { col_no: colNo });
    const c = view.col;
    const btns = [];
    if (c.status === 'pending') {
      btns.push(h('a', { class: 'btn', href: '#/editcol/' + colNo }, 'แก้ไขเอกสาร (ต้องใส่เหตุผล)'));
      btns.push(h('button', { class: 'btn danger', onclick: async () => {
        const r = await UI.askReason('ยกเลิกใบเก็บผ้า ' + colNo, 'ผ้าชุดนี้จะไม่ถูกนับเป็นผ้าสะสมรอส่งซัก เอกสารยังเก็บไว้เป็นหลักฐาน', 'ยกเลิกเอกสาร', true);
        if (!r) return; try { await Api.call('voidCollection', { col_no: colNo, reason: r }); UI.toast('ยกเลิกใบเก็บผ้าแล้ว'); collection(root, colNo); } catch (x) { UI.toast(UI.errMsg(x), true); }
      } }, 'ยกเลิกเอกสาร'));
    }
    const actions = btns.length ? h('div', { class: 'card' }, [h('h2', null, 'จัดการเอกสาร (Admin)'), h('div', { class: 'row' }, btns)])
      : (c.status === 'sent' ? h('div', { class: 'card notice small' }, 'ใบนี้ถูกรวมในใบส่งผ้า ' + c.doc_no + ' แล้ว ถ้าต้องแก้ไขให้แก้ที่ใบส่งผ้า') : null);
    show(root, 'col', [h('div', { class: 'pagehead' }, [h('p', { class: 'crumb' }, h('a', { href: '#/collections' }, '← ใบเก็บผ้า')), h('h1', null, 'ใบเก็บผ้า ' + colNo)]), Views.colDetail(view, actions)]);
  }

  async function editCollection(root, colNo) {
    const view = await Api.call('getCollection', { col_no: colNo });
    const c = view.col;
    if (c.status !== 'pending') { location.hash = '#/col/' + colNo; return; }
    const vals = {};
    view.lines.forEach(l => { vals[l.item_seq] = { z: [l.z1, l.z2, l.z3, l.z4, l.z5, l.z6, l.z7, l.z8], note: l.note }; });
    const date = h('input', { type: 'date', value: c.col_date }), rooms = h('input', { type: 'text', value: c.rooms, maxlength: 200 });
    const note = h('textarea', { maxlength: 300 }); note.value = c.note || '';
    const reason = h('textarea', { maxlength: 300, placeholder: 'เช่น นับผิด ตรวจกับเอกสารกระดาษแล้ว' });
    const err = h('p', { class: 'err hide', role: 'alert' });
    const grid = Forms.sendGrid(view.items, view.zones, vals, () => { }, null, 'รวมจำนวนผ้าที่เก็บ');
    const save = h('button', { class: 'btn primary', onclick: e => {
      if (reason.value.trim().length < 3) { err.textContent = 'ต้องบันทึกเหตุผลที่แก้ไขทุกครั้ง'; err.classList.remove('hide'); reason.focus(); return; }
      UI.busy(e.currentTarget, async () => {
        try { await Api.call('adminEditCollection', { col_no: colNo, reason: reason.value.trim(), header: { col_date: date.value, rooms: rooms.value, note: note.value }, lines: grid.getLines() });
          UI.toast('บันทึกการแก้ไขและประวัติเรียบร้อย'); location.hash = '#/col/' + colNo; } catch (x) { err.textContent = UI.errMsg(x); err.classList.remove('hide'); UI.toast(UI.errMsg(x), true); }
      });
    } }, 'บันทึกการแก้ไข');
    show(root, 'col', [h('div', { class: 'pagehead' }, [h('p', { class: 'crumb' }, h('a', { href: '#/col/' + colNo }, '← ใบเก็บผ้า ' + colNo)), h('h1', null, 'แก้ไขใบเก็บผ้า ' + colNo), h('p', { class: 'muted' }, 'ลายเซ็นเดิมยังอยู่ ทุกการแก้ไขบันทึกค่าก่อน/หลังและเหตุผลเป็นหลักฐาน และแจ้งอีเมล Admin')]),
      h('div', { class: 'stack' }, [h('div', { class: 'card' }, h('div', { class: 'grid2' }, [h('div', { class: 'field' }, [h('label', null, 'วันที่เก็บผ้า'), date]), h('div', { class: 'field' }, [h('label', null, 'ห้องที่เก็บ'), rooms])])), grid.el,
        h('div', { class: 'field' }, [h('label', null, 'หมายเหตุ'), note]), h('div', { class: 'card notice' }, [h('div', { class: 'field' }, [h('label', null, 'เหตุผลในการแก้ไข (จำเป็น)'), reason]), err])]),
      h('div', { class: 'actions-bar' }, h('div', { class: 'inner' }, [h('a', { class: 'btn', href: '#/col/' + colNo }, 'ยกเลิก'), save]))]);
  }

  // ---------------------------------------------------------------- รายละเอียด + แก้ไข/ยกเลิก/ปิดงาน
  async function detail(root, docNo) {
    const view = await Api.call('getSlip', { doc_no: docNo });
    const s = view.slip, d = view.derived;
    const reload = () => detail(root, docNo);
    const btns = [];
    if (s.status !== 'void') btns.push(h('a', { class: 'btn', href: '#/edit/' + docNo }, 'แก้ไขเอกสาร (ต้องใส่เหตุผล)'));
    if (s.status === 'short') btns.push(h('button', { class: 'btn', onclick: async () => {
      const r = await UI.askReason('ปิดงาน ' + docNo, d.missing_total ? 'ยังมีผ้าขาด ' + d.missing_total + ' ชิ้น — การปิดงานคือการตัดยอด (เช่น ร้านชดเชยเป็นเงิน) ระบุเหตุผลเพื่อเป็นหลักฐาน' : 'ปิดงานเอกสารนี้', 'ปิดงาน');
      if (!r) return; try { await Api.call('closeSlip', { doc_no: docNo, reason: r }); UI.toast('ปิดงานแล้ว'); reload(); } catch (x) { UI.toast(UI.errMsg(x), true); }
    } }, d.missing_total ? 'ปิดงาน (ตัดยอดผ้าขาด)' : 'ปิดงาน'));
    if (s.status !== 'void') btns.push(h('button', { class: 'btn danger', onclick: async () => {
      const r = await UI.askReason('ยกเลิกเอกสาร ' + docNo, 'เอกสารจะถูกทำเครื่องหมาย "ยกเลิก" และยังเก็บไว้เป็นหลักฐาน ไม่ถูกลบ', 'ยกเลิกเอกสาร', true);
      if (!r) return; try { await Api.call('voidSlip', { doc_no: docNo, reason: r }); UI.toast('ยกเลิกเอกสารแล้ว'); reload(); } catch (x) { UI.toast(UI.errMsg(x), true); }
    } }, 'ยกเลิกเอกสาร'));
    show(root, 'slips', [h('div', { class: 'pagehead' }, [h('p', { class: 'crumb' }, h('a', { href: '#/slips' }, '← เอกสารทั้งหมด')), h('h1', null, 'ใบส่งผ้า ' + docNo)]),
      Views.slipDetail(view, h('div', { class: 'card' }, [h('h2', null, 'จัดการเอกสาร (Admin)'), h('div', { class: 'row' }, btns)]), 'admin')]);
  }

  // ---------------------------------------------------------------- แก้ไขเอกสาร (บันทึกประวัติการแก้ไขทุกครั้ง)
  async function edit(root, docNo) {
    const view = await Api.call('getSlip', { doc_no: docNo });
    const s = view.slip;
    if (s.status === 'void') { location.hash = '#/slip/' + docNo; return; }
    const vals = {};
    view.lines.forEach(l => { vals[l.item_seq] = { z: [l.z1, l.z2, l.z3, l.z4, l.z5, l.z6, l.z7, l.z8], note: l.note }; });
    const vendors = App.boot.vendors;
    const vendor = h('select', null, [vendors.map(v => h('option', { value: v.id, selected: s.vendor_id === v.id }, v.name + (v.active ? '' : ' (ปิดใช้งาน)'))), vendors.some(v => v.id === s.vendor_id) ? null : h('option', { value: s.vendor_id, selected: true }, s.vendor_name)]);
    const dDoc = h('input', { type: 'date', value: s.doc_date }), dSend = h('input', { type: 'date', value: s.send_date }), dRecv = h('input', { type: 'date', value: s.receive_date });
    const prep = h('input', { type: 'text', value: s.prepared_by, maxlength: 80 });
    const note = h('textarea', { maxlength: 500 }); note.value = s.note || '';
    const reason = h('textarea', { maxlength: 300, placeholder: 'เช่น พิมพ์ตัวเลขผิด ตรวจกับเอกสารกระดาษแล้ว' });
    const err = h('p', { class: 'err hide', role: 'alert' });
    const grid = Forms.sendGrid(view.items, view.zones, vals, () => { });

    // ใบรับผ้า: แก้จำนวนรับ/ชำรุดได้
    const nm = {}; view.items.forEach(i => { nm[i.seq] = i.name; });
    const rcState = view.receipts.map(rc => {
      const st = {}; rc.lines.forEach(l => { st[l.item_seq] = { qty: l.qty, defect: l.defect, note: l.note }; });
      const seqs = view.lines.filter(l => l.agreed_qty > 0).map(l => l.item_seq);
      seqs.forEach(sq => { if (!st[sq]) st[sq] = { qty: 0, defect: 0, note: '' }; });
      return { rc, st, seqs };
    });
    const rcBlocks = rcState.map(r => h('div', { class: 'card' }, [h('h2', null, 'ใบรับผ้า ' + r.rc.rcpt_id + ' · ' + dateTH(r.rc.receive_date) + ' · โดย ' + r.rc.receiver_name),
      h('div', { class: 'gridwrap', style: 'margin-top:.5rem' }, h('table', { class: 'ledger', style: 'min-width:520px' }, [
        h('thead', null, h('tr', null, [h('th', { class: 'nm' }, 'รายการ'), h('th', null, 'รับ'), h('th', null, 'ชำรุด/คราบ'), h('th', null, 'หมายเหตุ')])),
        h('tbody', null, r.seqs.map(sq => h('tr', null, [h('td', { class: 'nm' }, [h('span', { class: 'no' }, sq), nm[sq]]),
          h('td', { class: 'q' }, Forms.numInput(r.st[sq].qty, v => { r.st[sq].qty = v; }, 'รับ ' + nm[sq])), h('td', { class: 'q' }, Forms.numInput(r.st[sq].defect, v => { r.st[sq].defect = v; }, 'ชำรุด ' + nm[sq])),
          h('td', { class: 'note' }, Forms.textInput(r.st[sq].note, v => { r.st[sq].note = v; }, 'หมายเหตุ'))])))
      ]))]));

    const save = h('button', { class: 'btn primary', onclick: e => {
      if (reason.value.trim().length < 3) { err.textContent = 'ต้องบันทึกเหตุผลที่แก้ไขทุกครั้ง'; err.classList.remove('hide'); reason.focus(); return; }
      err.classList.add('hide');
      UI.busy(e.currentTarget, async () => {
        try {
          await Api.call('adminEdit', {
            doc_no: docNo, reason: reason.value.trim(),
            header: { vendor_id: vendor.value, doc_date: dDoc.value, send_date: dSend.value, receive_date: dRecv.value, prepared_by: prep.value, note: note.value },
            lines: grid.getLines(),
            receipts: rcState.map(r => ({ rcpt_id: r.rc.rcpt_id, lines: r.seqs.map(sq => ({ item_seq: sq, qty: r.st[sq].qty, defect: r.st[sq].defect, note: r.st[sq].note })) }))
          });
          UI.toast('บันทึกการแก้ไขและประวัติเรียบร้อย'); location.hash = '#/slip/' + docNo;
        } catch (x) { err.textContent = UI.errMsg(x); err.classList.remove('hide'); UI.toast(UI.errMsg(x), true); }
      });
    } }, 'บันทึกการแก้ไข');

    show(root, 'slips', [
      h('div', { class: 'pagehead' }, [h('p', { class: 'crumb' }, h('a', { href: '#/slip/' + docNo }, '← ใบส่งผ้า ' + docNo)), h('h1', null, 'แก้ไขเอกสาร ' + docNo),
        h('p', { class: 'muted' }, 'ลายเซ็นเดิมยังอยู่ ทุกการแก้ไขจะบันทึกค่าก่อน/หลัง เหตุผล และชื่อผู้แก้ เป็นหลักฐาน และแจ้งอีเมล Admin')]),
      h('div', { class: 'stack' }, [
        h('div', { class: 'card' }, h('div', { class: 'grid2' }, [h('div', { class: 'field' }, [h('label', null, 'ร้านซัก'), vendor]), h('div', { class: 'field' }, [h('label', null, 'ผู้จัดเตรียม'), prep]),
          h('div', { class: 'field' }, [h('label', null, 'วันที่'), dDoc]), h('div', { class: 'field' }, [h('label', null, 'วันที่ส่งผ้า'), dSend]), h('div', { class: 'field' }, [h('label', null, 'วันที่รับผ้า'), dRecv])])),
        h('div', null, [h('h2', { style: 'margin-bottom:.4rem' }, 'จำนวนผ้าที่ส่ง'), grid.el]),
        rcBlocks.length ? rcBlocks : null,
        h('div', { class: 'field' }, [h('label', null, 'หมายเหตุเอกสาร'), note]),
        h('div', { class: 'card notice' }, [h('div', { class: 'field' }, [h('label', null, 'เหตุผลในการแก้ไข (จำเป็น)'), reason]), err])
      ]),
      h('div', { class: 'actions-bar' }, h('div', { class: 'inner' }, [h('a', { class: 'btn', href: '#/slip/' + docNo }, 'ยกเลิก'), save]))
    ]);
  }

  // ---------------------------------------------------------------- ตั้งค่า / par / ร้านซัก
  async function settings(root) {
    const boot = await Api.call('bootstrap');
    App.boot = boot;
    const pars = {};
    const parRows = boot.items.map(i => h('tr', null, [h('td', null, [h('span', { class: 'muted' }, i.seq + '. '), i.name]), h('td', { class: 'q', style: 'width:110px;padding:.2rem' }, (() => { const el = Forms.numInput(i.par, v => { pars[i.seq] = v; }, 'par ' + i.name); el.style.cssText = 'width:100px;min-height:42px;border:1.5px solid var(--line-2);border-radius:8px;text-align:center'; return el; })())]));
    const savePar = h('button', { class: 'btn primary', onclick: e => UI.busy(e.currentTarget, async () => {
      try { const r = await Api.call('savePar', { pars }); UI.toast(r.changed ? 'บันทึกสต็อกมาตรฐานแล้ว (' + r.changed + ' รายการ)' : 'ไม่มีการเปลี่ยนแปลง'); } catch (x) { UI.toast(UI.errMsg(x), true); }
    }) }, 'บันทึกสต็อกมาตรฐาน');

    const email = h('input', { type: 'email', value: boot.admin_email || '', placeholder: 'admin@example.com (ใส่ได้หลายอีเมลคั่นด้วย ,)' });
    const od = h('input', { type: 'text', inputmode: 'numeric', value: String(boot.overdue_days), style: 'width:100px' });
    const appUrl = h('input', { type: 'text', value: boot.app_url || '', placeholder: 'https://ชื่อคุณ.github.io/ชื่อโปรเจ็กต์/' });
    const saveCfg = h('button', { class: 'btn primary', onclick: e => UI.busy(e.currentTarget, async () => {
      try { await Api.call('saveConfig', { admin_email: email.value, overdue_days: od.value, app_url: appUrl.value }); UI.toast('บันทึกการตั้งค่าแล้ว'); } catch (x) { UI.toast(UI.errMsg(x), true); }
    }) }, 'บันทึกการตั้งค่า');

    const vlist = h('div', { class: 'stack-s' });
    const drawV = () => vlist.replaceChildren(...boot.vendors.map(v => h('div', { class: 'item-row', style: 'cursor:default' }, [
      h('div', { class: 't' }, [v.name, v.active ? '' : ' (ปิดใช้งาน)']), h('div', { class: 'meta' }, [v.contact, v.phone ? ' · ' + v.phone : '', v.email ? ' · ' + v.email : ''].join('')),
      h('div', { class: 'side' }, h('button', { class: 'btn small', onclick: () => vendorModal(v) }, 'แก้ไข'))])));
    async function vendorModal(v) {
      v = v || { name: '', contact: '', phone: '', email: '', active: 1 };
      const f = { name: h('input', { type: 'text', value: v.name, maxlength: 100 }), contact: h('input', { type: 'text', value: v.contact }), phone: h('input', { type: 'tel', value: v.phone }), email: h('input', { type: 'email', value: v.email, placeholder: 'ใส่ไว้ถ้าต้องการให้ระบบอีเมลลิงก์ถึงร้านอัตโนมัติ' }) };
      const act = h('input', { type: 'checkbox', checked: !!v.active });
      await UI.modal((m, close) => UI.append(m, [h('h2', null, v.id ? 'แก้ไขร้านซัก' : 'เพิ่มร้านซัก'),
        h('div', { class: 'field' }, [h('label', null, 'ชื่อร้าน'), f.name]), h('div', { class: 'field' }, [h('label', null, 'ผู้ติดต่อ'), f.contact]), h('div', { class: 'field' }, [h('label', null, 'โทรศัพท์'), f.phone]), h('div', { class: 'field' }, [h('label', null, 'อีเมล'), f.email]),
        h('label', { class: 'row' }, [act, 'เปิดใช้งาน (ปิดแล้วจะไม่แสดงตอนสร้างใบส่งผ้าใหม่)']),
        h('div', { class: 'btns' }, [h('button', { class: 'btn', onclick: () => close() }, 'ยกเลิก'), h('button', { class: 'btn primary', onclick: async () => {
          try { await Api.call('saveVendor', { id: v.id || '', name: f.name.value, contact: f.contact.value, phone: f.phone.value, email: f.email.value, active: act.checked ? 1 : 0 });
            close(); UI.toast('บันทึกร้านซักแล้ว'); const nb = await Api.call('bootstrap'); App.boot = nb; boot.vendors = nb.vendors; drawV(); } catch (x) { UI.toast(UI.errMsg(x), true); }
        } }, 'บันทึก')])]));
    }
    drawV();
    show(root, 'settings', [
      h('div', { class: 'pagehead' }, h('h1', null, 'ตั้งค่า / สต็อกมาตรฐาน')),
      h('div', { class: 'stack' }, [
        h('div', { class: 'card' }, [h('h2', null, 'การแจ้งเตือน Admin'), h('div', { class: 'stack-s' }, [
          h('div', { class: 'field' }, [h('label', null, 'อีเมล Admin (รับแจ้งทุกขั้นตอน + สรุปผ้าค้างทุกเช้า)'), email]),
          h('div', { class: 'field' }, [h('label', null, 'เตือนเมื่อผ้าอยู่ที่ร้านเกิน (วัน)'), od]),
          h('div', { class: 'field' }, [h('label', null, 'ที่อยู่เว็บแอป (ใช้ใส่ลิงก์ในอีเมล)'), appUrl]), saveCfg])]),
        h('div', { class: 'card' }, [h('div', { class: 'row-sb' }, [h('h2', null, 'ร้านซัก'), h('button', { class: 'btn small', onclick: () => vendorModal() }, '+ เพิ่มร้านซัก')]), vlist]),
        h('div', { class: 'card' }, [h('h2', null, 'สต็อกผ้าทั้งหมดของโรงแรม (par)'), h('p', { class: 'muted small', style: 'margin-bottom:.5rem' }, 'กรอกจำนวนผ้าที่โรงแรมมีทั้งหมดของแต่ละรายการ (รวมที่อยู่ในห้องและในคลัง) ระบบใช้คำนวณ "คงเหลือโรงแรม" = par − ผ้าที่ค้างที่ร้านซัก'),
          h('div', { class: 'tablewrap' }, h('table', { class: 'plain' }, [h('thead', null, h('tr', null, [h('th', null, 'รายการผ้า'), h('th', null, 'par')])), h('tbody', null, parRows)])), h('div', { style: 'margin-top:.8rem' }, savePar)]),
        Api.demo ? h('div', { class: 'card notice' }, [h('h2', null, 'โหมดทดลอง'), h('p', { class: 'small' }, 'ตอนนี้ข้อมูลเก็บในเบราว์เซอร์เครื่องนี้เท่านั้น (ยังไม่ได้เชื่อม Google Sheet)'), h('button', { class: 'btn danger small', style: 'margin-top:.6rem', onclick: async () => { if (await UI.confirmBox('ล้างข้อมูลทดลองทั้งหมด', 'ข้อมูลทดลองในเครื่องนี้จะหายทั้งหมด', 'ล้างข้อมูล', true)) LocalApi.reset(); } }, 'ล้างข้อมูลทดลอง')]) : null
      ])
    ]);
  }

  return { home, slips, detail, edit, settings, collections, collection, editCollection, report };
})();
