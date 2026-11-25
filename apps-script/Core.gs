/*
 * core.js — ตรรกะหลักของระบบติดตามผ้าซัก (ใช้ร่วมกันทั้งในเบราว์เซอร์โหมดทดลอง และ Google Apps Script)
 * ไฟล์นี้ต้องเหมือนกันทั้ง 2 ที่: js/core.js  และ  apps-script/Core.gs (คัดลอกด้วย tools/sync-core.sh)
 * ไม่พึ่งพา DOM / Apps Script โดยตรง — ทุกอย่างผ่านอ็อบเจ็กต์ `store`
 */
const Core = (function () {
  'use strict';

  const VERSION = '1.3.0';
  const MAX_ZONES = 8;
  const ZCOLS = ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z8'];

  const DEFAULT_ITEMS = [
    'ผ้าปูที่นอนแบบติดซิป (ด้าน A) ขนาด 183 ซม.',
    'ผ้าปูที่นอนแบบติดซิป (ด้าน B) ขนาด 107 ซม.',
    'ผ้ารองกันเปื้อนกันน้ำ ขนาด 183 ซม.',
    'ผ้ารองกันเปื้อนกันน้ำ ขนาด 107 ซม.',
    'ผ้าปูที่นอนแบบรัดมุม ขนาด 183 ซม.',
    'ผ้าปูที่นอนแบบรัดมุม ขนาด 107 ซม.',
    'ปลอกผ้านวม ขนาด 80 นิ้ว',
    'ปลอกผ้านวม ขนาด 105 นิ้ว',
    'ไส้ผ้านวมไมโครไฟเบอร์ 3D ขนาด 80 นิ้ว',
    'ไส้ผ้านวมไมโครไฟเบอร์ 3D ขนาด 105 นิ้ว',
    'หมอนไมโครไฟเบอร์ ขนาด 19',
    'หมอนไมโครไฟเบอร์ ขนาด 19 แบบแข็ง',
    'ปลอกหมอนกันเปื้อนติดซิป ขนาด 19 นิ้ว',
    'ปลอกหมอน ขนาด 20 นิ้ว',
    'ผ้าขนหนูเช็ดตัว ขนาด 30',
    'ผ้าขนหนูเช็ดมือ ขนาด 15',
    'ผ้าขนหนูเช็ดหน้า ขนาด 12',
    'ผ้าขนหนูเช็ดเท้า ขนาด 18',
    'เสื้อคลุมอาบน้ำผ้าฝ้าย ขนาด 56'
  ];

  const DEFAULT_CONFIG = {
    hotel_name: 'inchantree hotel and resort co.,ltd',
    hotel_line1: 'tex id : 0715564000637 (สาขา 00001) 44/4 หมู่ที่ 4',
    hotel_line2: 'ต.ท่ามะขาม อ.เมืองกาญจนบุรี จ.กาญจนบุรี 71000',
    hotel_line3: 'email : inchantreemeedao.kan@gmail.com tel. 063-2044476',
    zones: 'ชั้น 1,ชั้น 2,ชั้น 3,ชั้น 4,ชั้น 5,วิลล่า',
    doc_prefix: 'LN',
    overdue_days: '5',
    admin_email: '',
    app_url: ''
  };

  // ชนิดคอลัมน์: s = ข้อความ, n = ตัวเลข
  const SCHEMA = {
    Users: [['name', 's'], ['role', 's'], ['pin', 's'], ['active', 'n']],
    Vendors: [['id', 's'], ['name', 's'], ['contact', 's'], ['phone', 's'], ['email', 's'], ['active', 'n']],
    Items: [['seq', 'n'], ['name', 's'], ['par', 'n'], ['active', 'n']],
    Config: [['key', 's'], ['value', 's']],
    Slips: [
      ['doc_no', 's'], ['status', 's'], ['vendor_id', 's'], ['vendor_name', 's'], ['prepared_by', 's'],
      ['doc_date', 's'], ['send_date', 's'], ['receive_date', 's'], ['token', 's'], ['note', 's'],
      ['created_at', 's'], ['created_by', 's'], ['sent_at', 's'], ['sender_name', 's'], ['sender_sig', 's'],
      ['vendor_signer', 's'], ['vendor_sig', 's'], ['vendor_signed_at', 's'], ['vendor_note', 's'],
      ['send_total', 'n'], ['agreed_total', 'n'], ['closed_at', 's'], ['close_reason', 's'],
      ['void_reason', 's'], ['rev_count', 'n'], ['updated_at', 's'], ['collections', 's']
    ],
    SlipLines: [['doc_no', 's'], ['item_seq', 'n']].concat(ZCOLS.map(z => [z, 'n']),
      [['qty', 'n'], ['note', 's'], ['vendor_qty', 'n'], ['agreed_qty', 'n'], ['acc_qty', 'n']]),
    Receipts: [
      ['rcpt_id', 's'], ['doc_no', 's'], ['rcpt_no', 'n'], ['received_at', 's'], ['receive_date', 's'],
      ['receiver_name', 's'], ['receiver_sig', 's'], ['deliverer_name', 's'], ['kind', 's'], ['note', 's']
    ],
    ReceiptLines: [['rcpt_id', 's'], ['doc_no', 's'], ['item_seq', 'n'], ['qty', 'n'], ['defect', 'n'], ['note', 's']],
    Shortages: [
      ['rpt_no', 's'], ['doc_no', 's'], ['rpt_seq', 'n'], ['created_at', 's'], ['created_by', 's'], ['status', 's'],
      ['ack_name', 's'], ['ack_sig', 's'], ['ack_at', 's'], ['ack_note', 's'], ['expect_date', 's']
    ],
    ShortageLines: [['rpt_no', 's'], ['doc_no', 's'], ['item_seq', 'n'], ['missing', 'n'], ['defect', 'n'], ['note', 's']],
    Collections: [
      ['col_no', 's'], ['col_date', 's'], ['status', 's'], ['prepared_by', 's'], ['rooms', 's'], ['note', 's'], ['total', 'n'],
      ['signer', 's'], ['sig_id', 's'], ['doc_no', 's'], ['void_reason', 's'], ['rev_count', 'n'], ['created_at', 's'], ['created_by', 's'], ['updated_at', 's']
    ],
    CollectionLines: [['col_no', 's'], ['item_seq', 'n']].concat(ZCOLS.map(z => [z, 'n']), [['qty', 'n'], ['note', 's']]),
    Signatures: [['sig_id', 's'], ['doc_no', 's'], ['role', 's'], ['name', 's'], ['at', 's'], ['png', 's']],
    Revisions: [['rev_id', 's'], ['doc_no', 's'], ['at', 's'], ['by', 's'], ['role', 's'], ['kind', 's'], ['reason', 's'], ['changes', 's']],
    Log: [['at', 's'], ['actor', 's'], ['role', 's'], ['action', 's'], ['doc_no', 's'], ['detail', 's'], ['notify', 'n']]
  };

  const STATUS = {
    draft: 'ร่าง',
    sent: 'ส่งซักแล้ว (รอร้านยืนยัน)',
    dispute: 'ยอดไม่ตรง (รอตกลงยอด)',
    confirmed: 'ร้านรับผ้าแล้ว',
    short: 'รับคืนแล้ว มีผ้าขาด/ชำรุด',
    closed: 'ปิดงานแล้ว',
    void: 'ยกเลิก'
  };
  const ACTIVE = ['sent', 'dispute', 'confirmed', 'short'];
  const COL_STATUS = { pending: 'รอส่งซัก (สะสม)', sent: 'ส่งซักแล้ว', void: 'ยกเลิก' };

  const ACTION_LABEL = {
    create_draft: 'สร้างร่าง', update_draft: 'แก้ไขร่าง', delete_draft: 'ลบร่าง', send: 'ส่งซัก',
    vendor_confirm: 'ร้านซักยืนยันรับผ้า', vendor_dispute: 'ร้านซักนับไม่ตรง', resolve_dispute: 'ตกลงยอดกับร้านซัก',
    receive_ok: 'รับผ้าคืนครบ', receive_short: 'รับผ้าคืน พบผ้าขาด/ชำรุด', receive_supp: 'รับผ้าที่ขาดเพิ่ม',
    vendor_ack: 'ร้านซักรับทราบใบแจ้ง', close: 'ปิดงาน', admin_edit: 'Admin แก้ไขเอกสาร', void: 'ยกเลิกเอกสาร',
    par_update: 'แก้ไขสต็อกมาตรฐาน', vendor_update: 'แก้ไขข้อมูลร้านซัก', config_update: 'แก้ไขการตั้งค่า',
    login_fail: 'ใส่ PIN ผิด', collect: 'เก็บผ้ารายวัน', edit_collection: 'Admin แก้ไขใบเก็บผ้า', void_collection: 'ยกเลิกใบเก็บผ้า'
  };

  // ---------- ตัวช่วยทั่วไป ----------
  function CoreError(code, message) {
    const e = new Error(message);
    e.isCoreError = true;
    e.code = code;
    return e;
  }
  const fail = (code, message) => { throw CoreError(code, message); };

  function bkkNow() { return new Date(Date.now() + 7 * 3600 * 1000); }
  const todayBKK = () => bkkNow().toISOString().slice(0, 10);
  const nowISO = () => bkkNow().toISOString().replace('Z', '+07:00');

  function int(v, max) {
    const n = Math.floor(Number(v));
    if (!isFinite(n) || n < 0) return 0;
    return Math.min(n, max || 99999);
  }
  function str(v, max) {
    return (v === undefined || v === null ? '' : String(v)).trim().slice(0, max || 200);
  }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }

  function uid(len) {
    len = len || 24;
    let s = '';
    if (typeof Utilities !== 'undefined' && Utilities.getUuid) {
      while (s.length < len) s += Utilities.getUuid().replace(/-/g, '');
    } else if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const a = new Uint8Array(len);
      crypto.getRandomValues(a);
      s = Array.from(a, b => (b % 36).toString(36)).join('');
    } else {
      while (s.length < len) s += Math.random().toString(36).slice(2);
    }
    return s.slice(0, len);
  }

  function row(table, obj) {
    const o = {};
    for (const [c, t] of SCHEMA[table]) {
      const v = obj ? obj[c] : undefined;
      if (t === 'n') o[c] = (v === undefined || v === null || v === '') ? 0 : Number(v);
      else o[c] = (v === undefined || v === null) ? '' : String(v);
    }
    return o;
  }
  function rowPatch(table, patch) {
    const types = {};
    SCHEMA[table].forEach(([c, t]) => { types[c] = t; });
    const o = {};
    for (const k in patch) {
      if (!types[k]) continue;
      const v = patch[k];
      o[k] = types[k] === 'n' ? Number(v || 0) : (v === undefined || v === null ? '' : String(v));
    }
    return o;
  }

  // ---------- ที่เก็บข้อมูลในหน่วยความจำ (ใช้ทดสอบ + โหมดทดลองในเบราว์เซอร์) ----------
  function matches(r, m) {
    for (const k in m) if (String(r[k]) !== String(m[k])) return false;
    return true;
  }
  function createMemoryStore(initial, onChange) {
    const data = initial || {};
    Object.keys(SCHEMA).forEach(t => { if (!data[t]) data[t] = []; });
    const kvm = {};
    const changed = () => { if (onChange) onChange(data); };
    return {
      data,
      all: t => data[t].map(r => Object.assign({}, r)),
      insert(t, o) { const r = row(t, o); data[t].push(r); changed(); return Object.assign({}, r); },
      insertMany(t, os) { os.forEach(o => data[t].push(row(t, o))); changed(); },
      update(t, m, patch) {
        let n = 0;
        const p = rowPatch(t, patch);
        data[t].forEach(r => { if (matches(r, m)) { Object.assign(r, p); n++; } });
        if (n) changed();
        return n;
      },
      deleteWhere(t, m) {
        const before = data[t].length;
        data[t] = data[t].filter(r => !matches(r, m));
        if (data[t].length !== before) changed();
        return before - data[t].length;
      },
      kv: {
        get(k) { const e = kvm[k]; if (!e) return null; if (e.exp && e.exp < Date.now()) { delete kvm[k]; return null; } return e.v; },
        put(k, v, ttl) { kvm[k] = { v: String(v), exp: ttl ? Date.now() + ttl * 1000 : 0 }; },
        remove(k) { delete kvm[k]; }
      }
    };
  }

  // ---------- การตั้งค่า / รายการหลัก ----------
  function cfg(store) {
    const c = Object.assign({}, DEFAULT_CONFIG);
    store.all('Config').forEach(r => { if (r.key) c[r.key] = r.value; });
    return c;
  }
  function zonesOf(c) {
    const z = String(c.zones || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, MAX_ZONES);
    return z.length ? z : DEFAULT_CONFIG.zones.split(',');
  }
  function itemsAll(store) {
    return store.all('Items').sort((a, b) => a.seq - b.seq);
  }
  function setConfig(store, key, value) {
    if (store.update('Config', { key }, { value }) === 0) store.insert('Config', { key, value });
  }

  function seed(store, opts) {
    opts = opts || {};
    const have = {};
    store.all('Config').forEach(r => { have[r.key] = true; });
    Object.keys(DEFAULT_CONFIG).forEach(k => { if (!have[k]) store.insert('Config', { key: k, value: DEFAULT_CONFIG[k] }); });
    if (!store.all('Items').length) {
      store.insertMany('Items', DEFAULT_ITEMS.map((name, i) => ({ seq: i + 1, name, par: 0, active: 1 })));
    }
    if (!store.all('Users').length) {
      store.insertMany('Users', [
        { name: 'Admin', role: 'admin', pin: opts.adminPin || '111111', active: 1 },
        { name: 'หัวหน้าแม่บ้าน', role: 'housekeeper', pin: opts.hkPin || '222222', active: 1 }
      ]);
    }
    if (!store.all('Vendors').length) {
      store.insertMany('Vendors', [
        { id: 'V1', name: 'ร้านสะอาดซักอบรีด', contact: 'คุณสมชาย', phone: '081-000-0001', email: '', active: 1 },
        { id: 'V2', name: 'กาญจน์ลอนดรี', contact: 'คุณมาลี', phone: '081-000-0002', email: '', active: 1 }
      ]);
    }
  }

  // ---------- เซสชัน / ล็อกอิน ----------
  function sessionGet(store, token) {
    if (!token) return null;
    const v = store.kv.get('s:' + token);
    return v ? JSON.parse(v) : null;
  }

  // ---------- การบันทึกประวัติ + แจ้ง Admin ----------
  function writeLog(store, env, actor, action, docNo, detail, notify) {
    store.insert('Log', {
      at: nowISO(), actor: actor.name, role: actor.role, action, doc_no: docNo || '',
      detail: detail || '', notify: notify ? 1 : 0
    });
    if (notify && env && env.notify) {
      try {
        const c = cfg(store);
        const link = c.app_url && docNo ? c.app_url.replace(/\/?$/, '/') + '#/slip/' + docNo : '';
        env.notify({
          action, doc_no: docNo, actor: actor.name,
          subject: '[ผ้าซัก] ' + (ACTION_LABEL[action] || action) + (docNo ? ' ' + docNo : ''),
          body: (ACTION_LABEL[action] || action) + (docNo ? '\nเอกสาร: ' + docNo : '') +
            '\nโดย: ' + actor.name + (detail ? '\n' + detail : '') + (link ? '\n\nเปิดดู: ' + link : ''),
          admin_email: c.admin_email
        });
      } catch (e) { /* การแจ้งเตือนล้มเหลวต้องไม่ทำให้งานหลักพัง */ }
    }
  }

  // ---------- โหลดเอกสาร ----------
  function findSlip(store, docNo) {
    const s = store.all('Slips').find(r => r.doc_no === docNo);
    if (!s) fail('NOT_FOUND', 'ไม่พบเอกสาร ' + docNo);
    return s;
  }
  function slipByToken(store, token) {
    if (!token || String(token).length < 16) fail('NOT_FOUND', 'ลิงก์ไม่ถูกต้องหรือหมดอายุ');
    const s = store.all('Slips').find(r => r.token && r.token === token);
    if (!s) fail('NOT_FOUND', 'ลิงก์ไม่ถูกต้องหรือหมดอายุ');
    return s;
  }
  function linesOf(store, docNo) {
    return store.all('SlipLines').filter(r => r.doc_no === docNo).sort((a, b) => a.item_seq - b.item_seq);
  }

  function derive(slip, lines, receipts) {
    const received = {};
    const defect = {};
    receipts.forEach(rc => rc.lines.forEach(l => {
      received[l.item_seq] = (received[l.item_seq] || 0) + l.qty;
      defect[l.item_seq] = (defect[l.item_seq] || 0) + l.defect;
    }));
    const missing = {};
    const excess = {};
    let missingTotal = 0, excessTotal = 0, receivedTotal = 0, agreedTotal = 0, sentTotal = 0, defectTotal = 0;
    lines.forEach(l => {
      const r = received[l.item_seq] || 0;
      sentTotal += l.qty;
      agreedTotal += l.agreed_qty;
      receivedTotal += r;
      if (r < l.agreed_qty) { missing[l.item_seq] = l.agreed_qty - r; missingTotal += l.agreed_qty - r; }
      if (r > l.agreed_qty) { excess[l.item_seq] = r - l.agreed_qty; excessTotal += r - l.agreed_qty; }
      defectTotal += defect[l.item_seq] || 0;
    });
    let daysOut = 0;
    if (ACTIVE.indexOf(slip.status) >= 0 && isDate(slip.send_date)) {
      daysOut = Math.max(0, Math.round((Date.parse(todayBKK()) - Date.parse(slip.send_date)) / 86400000));
    }
    return {
      received, defect, missing, excess, missing_total: missingTotal, excess_total: excessTotal,
      received_total: receivedTotal, agreed_total: agreedTotal, sent_total: sentTotal,
      defect_total: defectTotal, days_out: daysOut
    };
  }

  function slipView(store, docNo, who) {
    const slip = findSlip(store, docNo);
    const lines = linesOf(store, docNo);
    const rcLines = store.all('ReceiptLines').filter(r => r.doc_no === docNo);
    const receipts = store.all('Receipts').filter(r => r.doc_no === docNo).sort((a, b) => a.rcpt_no - b.rcpt_no)
      .map(rc => Object.assign(rc, { lines: rcLines.filter(l => l.rcpt_id === rc.rcpt_id).sort((a, b) => a.item_seq - b.item_seq) }));
    const shLines = store.all('ShortageLines').filter(r => r.doc_no === docNo);
    const shortages = store.all('Shortages').filter(r => r.doc_no === docNo).sort((a, b) => a.rpt_seq - b.rpt_seq)
      .map(sh => Object.assign(sh, { lines: shLines.filter(l => l.rpt_no === sh.rpt_no).sort((a, b) => a.item_seq - b.item_seq) }));

    const ids = {};
    [slip.sender_sig, slip.vendor_sig].forEach(i => { if (i) ids[i] = 1; });
    receipts.forEach(r => { if (r.receiver_sig) ids[r.receiver_sig] = 1; });
    shortages.forEach(r => { if (r.ack_sig) ids[r.ack_sig] = 1; });
    const sigs = sigPngs(store, ids);

    const used = {};
    lines.forEach(l => { used[l.item_seq] = 1; });
    receipts.forEach(r => r.lines.forEach(l => { used[l.item_seq] = 1; }));
    const items = itemsAll(store).filter(i => i.active || used[i.seq]).map(i => ({ seq: i.seq, name: i.name }));
    const c = cfg(store);

    const view = {
      slip, lines, items, zones: zonesOf(c), receipts, shortages, sigs,
      derived: derive(slip, lines, receipts),
      hotel: { name: c.hotel_name, line1: c.hotel_line1, line2: c.hotel_line2, line3: c.hotel_line3 },
      status_label: STATUS[slip.status] || slip.status
    };
    if (who !== 'vendor') {
      const cids = colIds(slip);
      view.collections = store.all('Collections').filter(cl => cids.indexOf(cl.col_no) >= 0)
        .map(cl => ({ col_no: cl.col_no, col_date: cl.col_date, rooms: cl.rooms, total: cl.total, status: cl.status }))
        .sort((a, b) => (a.col_date + a.col_no < b.col_date + b.col_no ? -1 : 1));
      view.revisions = store.all('Revisions').filter(r => r.doc_no === docNo).sort((a, b) => a.at < b.at ? -1 : 1)
        .map(r => Object.assign(r, { changes: safeJSON(r.changes, []) }));
    }
    view.events = store.all('Log').filter(r => r.doc_no === docNo && r.action !== 'login_fail')
      .sort((a, b) => a.at < b.at ? -1 : 1)
      .map(r => ({ at: r.at, actor: r.actor, role: r.role, action: r.action, label: ACTION_LABEL[r.action] || r.action, detail: who === 'vendor' ? '' : r.detail }));
    return view;
  }
  function safeJSON(s, d) { try { return JSON.parse(s); } catch (e) { return d; } }

  // ---------- ตรวจและเขียนข้อมูล ----------
  // อ่านภาพลายเซ็นเฉพาะรหัสที่ต้องใช้ (ไม่ดึงทั้งตาราง — ภาพ PNG หนักและโตตามการใช้งาน)
  function sigPngs(store, idMap) {
    const want = Object.keys(idMap);
    if (!want.length) return {};
    if (store.pickSigs) return store.pickSigs(want);
    const out = {};
    store.all('Signatures').forEach(s => { if (idMap[s.sig_id]) out[s.sig_id] = s.png; });
    return out;
  }
  function sigOk(png) {
    return typeof png === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png) && png.length > 300 && png.length < 48000;
  }
  function saveSignature(store, docNo, role, name, png) {
    if (!sigOk(png)) fail('SIGNATURE', 'กรุณาเซ็นชื่อก่อนยืนยัน');
    const id = 'SG' + uid(12);
    store.insert('Signatures', { sig_id: id, doc_no: docNo, role, name, at: nowISO(), png });
    return id;
  }
  function needStatus(slip, allowed, msg) {
    if (allowed.indexOf(slip.status) < 0) fail('STATE', msg || ('ทำรายการนี้ไม่ได้ในสถานะ "' + (STATUS[slip.status] || slip.status) + '"'));
  }

  function parseLines(input, validSeqs, nz) {
    const map = {};
    (Array.isArray(input) ? input : []).forEach(e => {
      const seq = int(e && e.item_seq, 9999);
      if (!validSeqs[seq]) fail('BAD_INPUT', 'รายการผ้าไม่ถูกต้อง (#' + seq + ')');
      const z = [];
      for (let i = 0; i < MAX_ZONES; i++) z.push(i < nz ? int(e.z && e.z[i], 9999) : 0);
      map[seq] = { item_seq: seq, z, note: str(e.note, 200) };
    });
    return Object.keys(map).map(k => map[k]).filter(l => l.z.some(v => v > 0) || l.note)
      .map(l => { l.qty = l.z.reduce((a, b) => a + b, 0); return l; }).sort((a, b) => a.item_seq - b.item_seq);
  }
  function lineRow(docNo, l) {
    const r = { doc_no: docNo, item_seq: l.item_seq, qty: l.qty, note: l.note, vendor_qty: -1, agreed_qty: l.qty, acc_qty: l.acc || 0 };
    ZCOLS.forEach((z, i) => { r[z] = l.z[i] || 0; });
    return r;
  }
  function validHeader(store, h, slip) {
    h = h || {};
    const out = {};
    if (h.vendor_id !== undefined) {
      const v = store.all('Vendors').find(x => x.id === h.vendor_id && x.active);
      if (!v && h.vendor_id) fail('BAD_INPUT', 'ไม่พบร้านซักที่เลือก');
      out.vendor_id = v ? v.id : '';
      out.vendor_name = v ? v.name : '';
    }
    ['doc_date', 'send_date', 'receive_date'].forEach(k => {
      if (h[k] !== undefined) {
        if (h[k] && !isDate(h[k])) fail('BAD_INPUT', 'รูปแบบวันที่ไม่ถูกต้อง');
        out[k] = h[k] || '';
      }
    });
    if (h.prepared_by !== undefined) out.prepared_by = str(h.prepared_by, 80);
    if (h.note !== undefined) out.note = str(h.note, 500);
    return out;
  }
  function newDocNo(store) {
    const c = cfg(store);
    const ymd = todayBKK().replace(/-/g, '');
    const base = (c.doc_prefix || 'LN') + '-' + ymd + '-';
    const used = {};
    store.all('Slips').forEach(s => { used[s.doc_no] = 1; });
    let n = 1;
    while (used[base + (n < 10 ? '0' + n : n)]) n++;
    return base + (n < 10 ? '0' + n : n);
  }
  function totals(store, docNo) {
    const ls = linesOf(store, docNo);
    return { send_total: ls.reduce((a, l) => a + l.qty, 0), agreed_total: ls.reduce((a, l) => a + l.agreed_qty, 0) };
  }

  // ตรวจรายการใบเก็บผ้า: ต้องมีอยู่จริง และยังรอส่ง (หรือถูกใช้กับใบนี้อยู่แล้ว)
  function pendingCols(store, ids, docNo) {
    const out = [], seen = {};
    const all = store.all('Collections');
    (Array.isArray(ids) ? ids : []).forEach(id => {
      id = str(id, 40);
      if (!id || seen[id]) return;
      seen[id] = 1;
      const col = all.find(r => r.col_no === id);
      if (!col) fail('BAD_INPUT', 'ไม่พบใบเก็บผ้า ' + id);
      if (col.status !== 'pending' && !(col.status === 'sent' && col.doc_no === docNo)) fail('STATE', 'ใบเก็บผ้า ' + id + ' ถูกใช้ในใบส่งผ้าอื่นแล้วหรือถูกยกเลิก');
      out.push(col);
    });
    return out;
  }
  function accOf(store, cols) {
    const set = {}, acc = {};
    cols.forEach(c => { set[c.col_no] = 1; });
    store.all('CollectionLines').forEach(l => { if (set[l.col_no]) acc[l.item_seq] = (acc[l.item_seq] || 0) + l.qty; });
    return acc;
  }
  function colIds(slip) { return String(slip.collections || '').split(',').map(x => x.trim()).filter(Boolean); }

  function applyDraft(store, docNo, p, ctx, isNew) {
    const c = cfg(store);
    const nz = zonesOf(c).length;
    const valid = {};
    itemsAll(store).filter(i => i.active).forEach(i => { valid[i.seq] = 1; });
    const lines = parseLines(p.lines, valid, nz);
    const head = validHeader(store, p.header, null);
    head.updated_at = nowISO();
    const ids = p.collection_ids !== undefined ? p.collection_ids : (isNew ? [] : colIds(findSlip(store, docNo)));
    const cols = pendingCols(store, ids, docNo);
    head.collections = cols.map(x => x.col_no).join(',');
    const acc = accOf(store, cols);
    if (isNew) {
      store.insert('Slips', Object.assign({
        doc_no: docNo, status: 'draft', prepared_by: ctx.name, doc_date: todayBKK(), send_date: todayBKK(),
        created_at: nowISO(), created_by: ctx.name
      }, head));
    } else {
      store.update('Slips', { doc_no: docNo }, head);
    }
    const have = {};
    const rows = lines.map(l => { have[l.item_seq] = 1; return lineRow(docNo, Object.assign({ acc: acc[l.item_seq] || 0 }, l)); });
    Object.keys(acc).forEach(k => {
      if (!have[k] && acc[k] > 0) rows.push(lineRow(docNo, { item_seq: Number(k), z: [], note: '', qty: 0, acc: acc[k] }));
    });
    store.deleteWhere('SlipLines', { doc_no: docNo });
    store.insertMany('SlipLines', rows);
    store.update('Slips', { doc_no: docNo }, totals(store, docNo));
  }

  // ส่งลิงก์ให้ร้านซักทางอีเมล (ถ้าร้านมีอีเมล และตั้งค่า app_url แล้ว) — ไม่บังคับ
  function mailVendor(store, env, docNo, subject, text) {
    if (!env || !env.mail) return;
    try {
      const c = cfg(store);
      const slip = findSlip(store, docNo);
      const v = store.all('Vendors').find(x => x.id === slip.vendor_id);
      if (!v || !v.email || !c.app_url || !slip.token) return;
      env.mail({
        to: v.email, subject,
        body: text + '\n\nเปิดดู/เซ็นรับ: ' + c.app_url.replace(/\/?$/, '/') + '?t=' + slip.token + '\n\n' + c.hotel_name
      });
    } catch (e) { /* ไม่ให้งานหลักพัง */ }
  }

  // ---------- ตัวจัดการแต่ละ action ----------
  const H = {};

  H.login = function (store, p, ctx, env) {
    const role = p.role === 'admin' ? 'admin' : p.role === 'housekeeper' ? 'housekeeper' : '';
    if (!role) fail('BAD_INPUT', 'เลือกบทบาทก่อนเข้าสู่ระบบ');
    const lockKey = 'lock:' + role;
    const fails = Number(store.kv.get(lockKey) || 0);
    if (fails >= 5) fail('LOCKED', 'ใส่ PIN ผิดหลายครั้ง กรุณารอ 10 นาทีแล้วลองใหม่');
    const pin = str(p.pin, 12);
    const u = store.all('Users').find(x => x.active && x.role === role && String(x.pin).trim() === pin && pin);
    if (!u) {
      store.kv.put(lockKey, String(fails + 1), 600);
      writeLog(store, env, { name: '-', role }, 'login_fail', '', 'ครั้งที่ ' + (fails + 1), false);
      fail('BAD_PIN', 'PIN ไม่ถูกต้อง');
    }
    store.kv.remove(lockKey);
    const token = uid(32);
    store.kv.put('s:' + token, JSON.stringify({ role: u.role, name: u.name }), 6 * 3600);
    return { session: token, role: u.role, name: u.name, boot: H.bootstrap(store, {}, { role: u.role, name: u.name }) };
  };

  H.logout = function (store, p) { if (p.session) store.kv.remove('s:' + p.session); return {}; };

  H.bootstrap = function (store, p, ctx) {
    const c = cfg(store);
    const items = itemsAll(store).filter(i => i.active).map(i => ({ seq: i.seq, name: i.name, par: ctx.role === 'admin' ? i.par : undefined }));
    const out = {
      me: ctx, zones: zonesOf(c), items, statuses: STATUS, col_statuses: COL_STATUS, actions: ACTION_LABEL,
      vendors: store.all('Vendors').filter(v => v.active || ctx.role === 'admin').map(v => ({ id: v.id, name: v.name, contact: v.contact, phone: v.phone, email: v.email, active: v.active })),
      hotel: { name: c.hotel_name, line1: c.hotel_line1, line2: c.hotel_line2, line3: c.hotel_line3 },
      overdue_days: Number(c.overdue_days) || 5
    };
    if (ctx.role === 'admin') { out.admin_email = c.admin_email; out.app_url = c.app_url; }
    return out;
  };

  function summaries(store) {
    const slips = store.all('Slips');
    const lines = {};
    store.all('SlipLines').forEach(l => { (lines[l.doc_no] = lines[l.doc_no] || []).push(l); });
    const rec = {};
    store.all('ReceiptLines').forEach(l => {
      const k = l.doc_no + '|' + l.item_seq;
      rec[k] = (rec[k] || 0) + l.qty;
    });
    return slips.map(s => {
      let missing = 0, received = 0;
      (lines[s.doc_no] || []).forEach(l => {
        const r = rec[s.doc_no + '|' + l.item_seq] || 0;
        received += r;
        if (r < l.agreed_qty) missing += l.agreed_qty - r;
      });
      const hasReceipt = received > 0 || s.status === 'short' || s.status === 'closed';
      let days = 0;
      if (ACTIVE.indexOf(s.status) >= 0 && isDate(s.send_date)) {
        days = Math.max(0, Math.round((Date.parse(todayBKK()) - Date.parse(s.send_date)) / 86400000));
      }
      return {
        doc_no: s.doc_no, status: s.status, vendor_id: s.vendor_id, vendor_name: s.vendor_name,
        prepared_by: s.prepared_by, doc_date: s.doc_date, send_date: s.send_date, receive_date: s.receive_date,
        send_total: s.send_total, agreed_total: s.agreed_total, received_total: received,
        outstanding: ACTIVE.indexOf(s.status) >= 0 ? missing : 0, missing_total: hasReceipt ? missing : 0,
        days_out: days, created_at: s.created_at, updated_at: s.updated_at, rev_count: s.rev_count
      };
    });
  }

  H.listSlips = function (store, p) {
    let list = summaries(store);
    if (p.status) list = list.filter(s => s.status === p.status);
    if (p.vendor_id) list = list.filter(s => s.vendor_id === p.vendor_id);
    if (p.q) { const q = String(p.q).toLowerCase(); list = list.filter(s => (s.doc_no + ' ' + s.vendor_name).toLowerCase().indexOf(q) >= 0); }
    list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return { slips: list.slice(0, int(p.limit, 500) || 200) };
  };

  H.getSlip = function (store, p) { return slipView(store, str(p.doc_no, 40)); };

  H.saveDraft = function (store, p, ctx, env) {
    let docNo = str(p.doc_no, 40);
    const isNew = !docNo;
    if (isNew) docNo = newDocNo(store);
    else needStatus(findSlip(store, docNo), ['draft'], 'เอกสารนี้ส่งซักแล้ว แก้ไขไม่ได้ (ให้ Admin แก้ไขพร้อมบันทึกเหตุผล)');
    applyDraft(store, docNo, p, ctx, isNew);
    writeLog(store, env, ctx, isNew ? 'create_draft' : 'update_draft', docNo, '', false);
    return slipView(store, docNo);
  };

  H.deleteDraft = function (store, p, ctx, env) {
    const docNo = str(p.doc_no, 40);
    needStatus(findSlip(store, docNo), ['draft'], 'ลบได้เฉพาะเอกสารที่ยังเป็นร่าง');
    store.deleteWhere('SlipLines', { doc_no: docNo });
    store.deleteWhere('Slips', { doc_no: docNo });
    writeLog(store, env, ctx, 'delete_draft', docNo, '', false);
    return {};
  };

  H.sendSlip = function (store, p, ctx, env) {
    let docNo = str(p.doc_no, 40);
    const isNew = !docNo;
    if (isNew) docNo = newDocNo(store);
    else needStatus(findSlip(store, docNo), ['draft'], 'เอกสารนี้ส่งซักไปแล้ว');
    if (p.header || p.lines || isNew) applyDraft(store, docNo, p, ctx, isNew);
    const slip = findSlip(store, docNo);
    const t = totals(store, docNo);
    if (!slip.vendor_id) fail('BAD_INPUT', 'เลือกร้านซักก่อนส่ง');
    if (!isDate(slip.send_date)) fail('BAD_INPUT', 'ใส่วันที่ส่งผ้าก่อนส่ง');
    if (t.send_total <= 0) fail('BAD_INPUT', 'ยังไม่มีจำนวนผ้า กรอกอย่างน้อย 1 รายการ');
    const cols = pendingCols(store, colIds(slip), docNo);
    const name = str(p.sender_name, 80) || ctx.name;
    const sig = saveSignature(store, docNo, 'sender', name, p.signature);
    store.update('Slips', { doc_no: docNo }, {
      status: 'sent', token: uid(32), sent_at: nowISO(), sender_name: name, sender_sig: sig, updated_at: nowISO()
    });
    cols.forEach(cl => store.update('Collections', { col_no: cl.col_no }, { status: 'sent', doc_no: docNo, updated_at: nowISO() }));
    const accTotal = linesOf(store, docNo).reduce((a, l) => a + l.acc_qty, 0);
    let more = '';
    if (cols.length) {
      more = '\nรวมจากใบเก็บผ้า ' + cols.length + ' ใบ: ' + cols.map(x => x.col_no).join(', ');
      if (accTotal !== t.send_total) more += '\n⚠ ยอดส่งจริงต่างจากยอดสะสม: สะสม ' + accTotal + ' / ส่งจริง ' + t.send_total + ' ชิ้น';
    }
    writeLog(store, env, ctx, 'send', docNo, 'ร้าน: ' + slip.vendor_name + ' · ' + t.send_total + ' ชิ้น' + more, true);
    mailVendor(store, env, docNo, 'ใบส่งผ้า ' + docNo, 'โรงแรมส่งผ้าซักเลขที่ ' + docNo + ' จำนวน ' + t.send_total + ' ชิ้น กรุณาตรวจนับและเซ็นรับผ่านลิงก์ด้านล่าง');
    return slipView(store, docNo);
  };

  H.vendorGet = function (store, p) {
    const slip = slipByToken(store, p.token);
    if (slip.status === 'draft') fail('NOT_FOUND', 'ลิงก์ไม่ถูกต้องหรือหมดอายุ');
    return slipView(store, slip.doc_no, 'vendor');
  };

  H.vendorConfirm = function (store, p, ctx, env) {
    const slip = slipByToken(store, p.token);
    needStatus(slip, ['sent', 'dispute'], 'เอกสารนี้ยืนยันรับผ้าไปแล้ว');
    const name = str(p.name, 80);
    if (!name) fail('BAD_INPUT', 'กรอกชื่อผู้รับผ้า');
    const lines = linesOf(store, slip.doc_no).filter(l => l.qty > 0);
    const counts = p.counts || {};
    const diffs = [];
    lines.forEach(l => {
      if (counts[l.item_seq] === undefined || counts[l.item_seq] === '' || counts[l.item_seq] === null) fail('BAD_INPUT', 'กรอกยอดที่นับได้ให้ครบทุกรายการ');
      l.vendor_qty = int(counts[l.item_seq], 99999);
      if (l.vendor_qty !== l.agreed_qty) diffs.push(l);
    });
    const sig = saveSignature(store, slip.doc_no, 'vendor', name, p.signature);
    lines.forEach(l => store.update('SlipLines', { doc_no: slip.doc_no, item_seq: l.item_seq }, { vendor_qty: l.vendor_qty }));
    const mismatch = diffs.length > 0;
    store.update('Slips', { doc_no: slip.doc_no }, {
      status: mismatch ? 'dispute' : 'confirmed', vendor_signer: name, vendor_sig: sig, vendor_signed_at: nowISO(),
      vendor_note: str(p.note, 300), updated_at: nowISO()
    });
    const who = { name: name + ' (' + slip.vendor_name + ')', role: 'vendor' };
    if (mismatch) {
      const items = itemsAll(store);
      const nm = {};
      items.forEach(i => { nm[i.seq] = i.name; });
      writeLog(store, env, who, 'vendor_dispute', slip.doc_no,
        diffs.map(l => '#' + l.item_seq + ' ' + nm[l.item_seq] + ': โรงแรมส่ง ' + l.agreed_qty + ' / ร้านนับ ' + l.vendor_qty).join('\n'), true);
    } else {
      writeLog(store, env, who, 'vendor_confirm', slip.doc_no, 'ยอดตรงกับที่โรงแรมส่ง ' + slip.send_total + ' ชิ้น', true);
    }
    return slipView(store, slip.doc_no, 'vendor');
  };

  H.resolveDispute = function (store, p, ctx, env) {
    const docNo = str(p.doc_no, 40);
    const slip = findSlip(store, docNo);
    needStatus(slip, ['dispute']);
    const reason = str(p.reason, 300);
    if (reason.length < 3) fail('BAD_INPUT', 'บันทึกเหตุผลที่ตกลงยอดกันก่อน');
    const items = itemsAll(store);
    const nm = {};
    items.forEach(i => { nm[i.seq] = '#' + i.seq + ' ' + i.name; });
    const changes = [];
    linesOf(store, docNo).forEach(l => {
      if (l.vendor_qty < 0 || l.vendor_qty === l.agreed_qty) return;
      const raw = (p.agreed || {})[l.item_seq];
      const v = raw === undefined ? l.agreed_qty : int(raw, 99999);
      if (v !== l.agreed_qty) {
        changes.push(nm[l.item_seq] + ': ยอดตกลง ' + l.agreed_qty + ' → ' + v);
        store.update('SlipLines', { doc_no: docNo, item_seq: l.item_seq }, { agreed_qty: v });
      } else {
        changes.push(nm[l.item_seq] + ': ยืนยันยอดโรงแรม ' + v + ' (ร้านนับ ' + l.vendor_qty + ')');
      }
    });
    store.update('Slips', { doc_no: docNo }, Object.assign({ status: 'confirmed', updated_at: nowISO(), rev_count: slip.rev_count + 1 }, { agreed_total: totals(store, docNo).agreed_total }));
    store.insert('Revisions', { rev_id: 'R' + uid(10), doc_no: docNo, at: nowISO(), by: ctx.name, role: ctx.role, kind: 'resolve', reason, changes: JSON.stringify(changes) });
    writeLog(store, env, ctx, 'resolve_dispute', docNo, reason + '\n' + changes.join('\n'), true);
    return slipView(store, docNo);
  };

  H.receive = function (store, p, ctx, env) {
    const docNo = str(p.doc_no, 40);
    const slip = findSlip(store, docNo);
    needStatus(slip, ['sent', 'confirmed', 'dispute', 'short'], 'เอกสารนี้รับผ้าคืนไม่ได้ในสถานะปัจจุบัน');
    const isSupp = slip.status === 'short';
    const sl = linesOf(store, docNo).filter(l => l.agreed_qty > 0);
    const input = {};
    (Array.isArray(p.lines) ? p.lines : []).forEach(e => { input[int(e.item_seq, 9999)] = e; });
    const rcLines = [];
    sl.forEach(l => {
      const e = input[l.item_seq];
      if (!isSupp && (!e || e.qty === undefined || e.qty === '' || e.qty === null)) fail('BAD_INPUT', 'กรอกจำนวนที่นับได้ให้ครบทุกรายการ (ไม่มีให้ใส่ 0)');
      const qty = e ? int(e.qty, 99999) : 0;
      const defect = e ? int(e.defect, 99999) : 0;
      if (defect > qty) fail('BAD_INPUT', 'จำนวนชำรุด/คราบ มากกว่าจำนวนที่รับ (รายการ #' + l.item_seq + ')');
      if (qty > 0 || defect > 0 || (e && str(e.note))) rcLines.push({ item_seq: l.item_seq, qty, defect, note: e ? str(e.note, 200) : '' });
    });
    if (isSupp && !rcLines.length) fail('BAD_INPUT', 'ยังไม่ได้กรอกจำนวนผ้าที่รับเพิ่ม');
    const receiver = str(p.receiver_name, 80) || ctx.name;
    const prior = store.all('Receipts').filter(r => r.doc_no === docNo);
    const rcptNo = prior.length + 1;
    const rcptId = docNo + '-R' + rcptNo;
    const sig = saveSignature(store, docNo, 'receiver', receiver, p.signature);
    const recvDate = isDate(p.receive_date) ? p.receive_date : todayBKK();
    store.insert('Receipts', {
      rcpt_id: rcptId, doc_no: docNo, rcpt_no: rcptNo, received_at: nowISO(), receive_date: recvDate,
      receiver_name: receiver, receiver_sig: sig, deliverer_name: str(p.deliverer_name, 80), kind: isSupp ? 'supplement' : 'main', note: str(p.note, 300)
    });
    store.insertMany('ReceiptLines', rcLines.map(l => Object.assign({ rcpt_id: rcptId, doc_no: docNo }, l)));
    store.update('Slips', { doc_no: docNo }, { receive_date: recvDate, updated_at: nowISO() });

    const view = slipView(store, docNo);
    const d = view.derived;
    const thisDefect = rcLines.reduce((a, l) => a + l.defect, 0);
    const nm = {};
    view.items.forEach(i => { nm[i.seq] = i.name; });
    const clean = d.missing_total === 0 && thisDefect === 0;
    if (clean) {
      store.update('Shortages', { doc_no: docNo, status: 'open' }, { status: 'resolved' });
      store.update('Shortages', { doc_no: docNo, status: 'acknowledged' }, { status: 'resolved' });
      store.update('Slips', { doc_no: docNo }, { status: 'closed', closed_at: nowISO() });
      writeLog(store, env, ctx, isSupp ? 'receive_supp' : 'receive_ok', docNo,
        'รับครบ ' + d.received_total + ' ชิ้น' + (d.excess_total ? ' (เกินจากที่ส่ง ' + d.excess_total + ' ชิ้น)' : '') + (isSupp ? ' — ปิดงานแล้ว' : ''), true);
    } else {
      const seqNo = store.all('Shortages').filter(r => r.doc_no === docNo).length + 1;
      const rptNo = docNo + '-S' + seqNo;
      store.update('Shortages', { doc_no: docNo, status: 'open' }, { status: 'superseded' });
      store.update('Shortages', { doc_no: docNo, status: 'acknowledged' }, { status: 'superseded' });
      store.insert('Shortages', { rpt_no: rptNo, doc_no: docNo, rpt_seq: seqNo, created_at: nowISO(), created_by: ctx.name, status: 'open' });
      const lineMap = {};
      Object.keys(d.missing).forEach(k => { lineMap[k] = { item_seq: Number(k), missing: d.missing[k], defect: 0, note: '' }; });
      rcLines.forEach(l => {
        if (l.defect > 0 || (lineMap[l.item_seq] && l.note)) {
          lineMap[l.item_seq] = lineMap[l.item_seq] || { item_seq: l.item_seq, missing: 0, defect: 0, note: '' };
          lineMap[l.item_seq].defect = l.defect;
          lineMap[l.item_seq].note = l.note;
        }
      });
      store.insertMany('ShortageLines', Object.keys(lineMap).map(k => Object.assign({ rpt_no: rptNo, doc_no: docNo }, lineMap[k])));
      store.update('Slips', { doc_no: docNo }, { status: 'short' });
      const parts = Object.keys(lineMap).map(k => '#' + k + ' ' + nm[k] + ': ' + (lineMap[k].missing ? 'ขาด ' + lineMap[k].missing : '') + (lineMap[k].defect ? ' ชำรุด/คราบ ' + lineMap[k].defect : ''));
      writeLog(store, env, ctx, isSupp ? 'receive_supp' : 'receive_short', docNo,
        'ขาดรวม ' + d.missing_total + ' ชิ้น · ชำรุด/คราบ ' + thisDefect + ' ชิ้น · ออกใบแจ้ง ' + rptNo + '\n' + parts.join('\n'), true);
      mailVendor(store, env, docNo, 'ใบแจ้งผ้าขาด/ชำรุด ' + rptNo, 'โรงแรมตรวจรับผ้าตามเอกสาร ' + docNo + ' พบผ้าขาด ' + d.missing_total + ' ชิ้น ชำรุด/คราบ ' + thisDefect + ' ชิ้น กรุณาตรวจสอบและรับทราบผ่านลิงก์ด้านล่าง');
    }
    return slipView(store, docNo);
  };

  H.vendorAck = function (store, p, ctx, env) {
    const slip = slipByToken(store, p.token);
    needStatus(slip, ['short'], 'ไม่มีใบแจ้งที่รอรับทราบ');
    const rpt = store.all('Shortages').filter(r => r.doc_no === slip.doc_no && r.status === 'open').sort((a, b) => b.rpt_seq - a.rpt_seq)[0];
    if (!rpt) fail('STATE', 'ไม่มีใบแจ้งที่รอรับทราบ');
    const name = str(p.name, 80);
    if (!name) fail('BAD_INPUT', 'กรอกชื่อผู้รับทราบ');
    if (p.expect_date && !isDate(p.expect_date)) fail('BAD_INPUT', 'รูปแบบวันที่ไม่ถูกต้อง');
    const sig = saveSignature(store, slip.doc_no, 'vendor_ack', name, p.signature);
    store.update('Shortages', { rpt_no: rpt.rpt_no }, { status: 'acknowledged', ack_name: name, ack_sig: sig, ack_at: nowISO(), ack_note: str(p.note, 300), expect_date: p.expect_date || '' });
    writeLog(store, env, { name: name + ' (' + slip.vendor_name + ')', role: 'vendor' }, 'vendor_ack', slip.doc_no,
      'รับทราบใบแจ้ง ' + rpt.rpt_no + (p.expect_date ? ' · นัดส่งผ้า ' + p.expect_date : '') + (p.note ? '\n' + str(p.note, 300) : ''), true);
    return slipView(store, slip.doc_no, 'vendor');
  };

  H.closeSlip = function (store, p, ctx, env) {
    const docNo = str(p.doc_no, 40);
    const slip = findSlip(store, docNo);
    needStatus(slip, ['short'], 'ปิดงานได้เฉพาะเอกสารที่มีรายการแจ้งค้างอยู่');
    const d = slipView(store, docNo).derived;
    const reason = str(p.reason, 300);
    if (d.missing_total > 0) {
      if (ctx.role !== 'admin') fail('FORBIDDEN', 'ยังมีผ้าขาดค้าง ' + d.missing_total + ' ชิ้น เฉพาะ Admin เท่านั้นที่ปิดงานได้ (ตัดยอด)');
      if (reason.length < 3) fail('BAD_INPUT', 'บันทึกเหตุผลที่ปิดงานทั้งที่ผ้าขาด');
    }
    store.update('Shortages', { doc_no: docNo, status: 'open' }, { status: 'resolved' });
    store.update('Shortages', { doc_no: docNo, status: 'acknowledged' }, { status: 'resolved' });
    store.update('Slips', { doc_no: docNo }, { status: 'closed', closed_at: nowISO(), close_reason: reason, updated_at: nowISO() });
    if (d.missing_total > 0) {
      store.update('Slips', { doc_no: docNo }, { rev_count: slip.rev_count + 1 });
      store.insert('Revisions', { rev_id: 'R' + uid(10), doc_no: docNo, at: nowISO(), by: ctx.name, role: ctx.role, kind: 'close', reason, changes: JSON.stringify(['ปิดงานโดยตัดยอดผ้าขาด ' + d.missing_total + ' ชิ้น']) });
    }
    writeLog(store, env, ctx, 'close', docNo, d.missing_total > 0 ? 'ตัดยอดผ้าขาด ' + d.missing_total + ' ชิ้น: ' + reason : 'ปิดงาน' + (reason ? ': ' + reason : ''), true);
    return slipView(store, docNo);
  };

  H.voidSlip = function (store, p, ctx, env) {
    const docNo = str(p.doc_no, 40);
    const slip = findSlip(store, docNo);
    if (slip.status === 'void') fail('STATE', 'เอกสารนี้ถูกยกเลิกแล้ว');
    const reason = str(p.reason, 300);
    if (reason.length < 3) fail('BAD_INPUT', 'บันทึกเหตุผลที่ยกเลิก');
    store.update('Shortages', { doc_no: docNo, status: 'open' }, { status: 'resolved' });
    const released = store.all('Collections').filter(cl => cl.doc_no === docNo && cl.status === 'sent');
    released.forEach(cl => store.update('Collections', { col_no: cl.col_no }, { status: 'pending', doc_no: '', updated_at: nowISO() }));
    store.update('Slips', { doc_no: docNo }, { status: 'void', void_reason: reason, updated_at: nowISO(), rev_count: slip.rev_count + 1 });
    store.insert('Revisions', { rev_id: 'R' + uid(10), doc_no: docNo, at: nowISO(), by: ctx.name, role: ctx.role, kind: 'void', reason, changes: JSON.stringify(['ยกเลิกเอกสาร (สถานะเดิม: ' + (STATUS[slip.status] || slip.status) + ')'].concat(released.map(cl => 'ใบเก็บผ้า ' + cl.col_no + ' กลับไปสถานะรอส่งซัก'))) });
    writeLog(store, env, ctx, 'void', docNo, reason, true);
    return slipView(store, docNo);
  };

  H.adminEdit = function (store, p, ctx, env) {
    const docNo = str(p.doc_no, 40);
    const slip = findSlip(store, docNo);
    needStatus(slip, ['draft', 'sent', 'dispute', 'confirmed', 'short', 'closed'], 'เอกสารที่ยกเลิกแล้วแก้ไขไม่ได้');
    const reason = str(p.reason, 300);
    if (reason.length < 3) fail('BAD_INPUT', 'ต้องบันทึกเหตุผลทุกครั้งที่แก้ไขเอกสาร');
    const c = cfg(store);
    const zones = zonesOf(c);
    const nz = zones.length;
    const items = itemsAll(store);
    const nm = {};
    items.forEach(i => { nm[i.seq] = '#' + i.seq + ' ' + i.name; });
    const changes = [];

    // หัวเอกสาร
    const head = validHeader(store, p.header, slip);
    const labels = { vendor_id: 'ร้านซัก', prepared_by: 'ผู้จัดเตรียม', doc_date: 'วันที่', send_date: 'วันที่ส่งผ้า', receive_date: 'วันที่รับผ้า', note: 'หมายเหตุเอกสาร' };
    Object.keys(head).forEach(k => {
      if (k === 'vendor_name') return;
      if (String(head[k]) !== String(slip[k])) {
        changes.push(labels[k] + ': ' + (k === 'vendor_id' ? slip.vendor_name : slip[k]) + ' → ' + (k === 'vendor_id' ? head.vendor_name : head[k]));
      } else delete head[k];
    });
    if (head.vendor_id === undefined) delete head.vendor_name;
    if (Object.keys(head).length) store.update('Slips', { doc_no: docNo }, head);

    // รายการผ้าที่ส่ง
    if (Array.isArray(p.lines)) {
      const valid = {};
      items.forEach(i => { valid[i.seq] = 1; });
      const nextLines = parseLines(p.lines, valid, nz);
      const prevMap = {};
      linesOf(store, docNo).forEach(l => { prevMap[l.item_seq] = l; });
      const nextMap = {};
      nextLines.forEach(l => { nextMap[l.item_seq] = l; });
      const seqs = {};
      Object.keys(prevMap).concat(Object.keys(nextMap)).forEach(k => { seqs[k] = 1; });
      Object.keys(seqs).map(Number).sort((a, b) => a - b).forEach(seq => {
        const a = prevMap[seq];
        const b = nextMap[seq] || { item_seq: seq, z: new Array(MAX_ZONES).fill(0), note: '', qty: 0 };
        for (let i = 0; i < nz; i++) {
          const before = a ? a[ZCOLS[i]] : 0;
          if (before !== b.z[i]) changes.push(nm[seq] + ' / ' + zones[i] + ': ' + before + ' → ' + b.z[i]);
        }
        if ((a ? a.note : '') !== b.note) changes.push(nm[seq] + ' / หมายเหตุ: "' + (a ? a.note : '') + '" → "' + b.note + '"');
        if (!a && (b.qty > 0 || b.note)) {
          store.insert('SlipLines', lineRow(docNo, b));
        } else if (a) {
          const patch = { qty: b.qty, note: b.note };
          ZCOLS.forEach((z, i) => { patch[z] = b.z[i] || 0; });
          if (b.qty !== a.qty) patch.agreed_qty = b.qty;
          store.update('SlipLines', { doc_no: docNo, item_seq: seq }, patch);
        }
      });
      store.deleteWhere('SlipLines', { doc_no: docNo, qty: 0, note: '', acc_qty: 0 });
      store.update('Slips', { doc_no: docNo }, totals(store, docNo));
    }

    // ยอดรับคืน
    if (Array.isArray(p.receipts)) {
      const myReceipts = store.all('Receipts').filter(r => r.doc_no === docNo);
      p.receipts.forEach(rp => {
        const rc = myReceipts.find(r => r.rcpt_id === rp.rcpt_id);
        if (!rc) fail('BAD_INPUT', 'ไม่พบใบรับผ้า ' + rp.rcpt_id);
        const prev = {};
        store.all('ReceiptLines').filter(l => l.rcpt_id === rc.rcpt_id).forEach(l => { prev[l.item_seq] = l; });
        const next = {};
        (rp.lines || []).forEach(l => {
          const seq = int(l.item_seq, 9999);
          const qty = int(l.qty, 99999), defect = int(l.defect, 99999);
          if (defect > qty) fail('BAD_INPUT', 'จำนวนชำรุด/คราบ มากกว่าจำนวนที่รับ (#' + seq + ')');
          next[seq] = { item_seq: seq, qty, defect, note: str(l.note, 200) };
        });
        const ss = {};
        Object.keys(prev).concat(Object.keys(next)).forEach(k => { ss[k] = 1; });
        let touched = false;
        Object.keys(ss).map(Number).sort((a, b) => a - b).forEach(seq => {
          const a = prev[seq] || { qty: 0, defect: 0, note: '' };
          const b = next[seq] || { qty: 0, defect: 0, note: '' };
          if (a.qty !== b.qty) { changes.push('ใบรับ ' + rc.rcpt_id + ' · ' + nm[seq] + ' / รับ: ' + a.qty + ' → ' + b.qty); touched = true; }
          if (a.defect !== b.defect) { changes.push('ใบรับ ' + rc.rcpt_id + ' · ' + nm[seq] + ' / ชำรุด: ' + a.defect + ' → ' + b.defect); touched = true; }
          if (a.note !== b.note) { changes.push('ใบรับ ' + rc.rcpt_id + ' · ' + nm[seq] + ' / หมายเหตุ: "' + a.note + '" → "' + b.note + '"'); touched = true; }
        });
        if (touched) {
          store.deleteWhere('ReceiptLines', { rcpt_id: rc.rcpt_id });
          store.insertMany('ReceiptLines', Object.keys(next).map(k => Object.assign({ rcpt_id: rc.rcpt_id, doc_no: docNo }, next[k])).filter(l => l.qty > 0 || l.defect > 0 || l.note));
        }
      });
    }

    if (!changes.length) fail('BAD_INPUT', 'ไม่พบข้อมูลที่เปลี่ยนแปลง');
    store.update('Slips', { doc_no: docNo }, { rev_count: slip.rev_count + 1, updated_at: nowISO() });
    store.insert('Revisions', { rev_id: 'R' + uid(10), doc_no: docNo, at: nowISO(), by: ctx.name, role: ctx.role, kind: 'edit', reason, changes: JSON.stringify(changes) });
    writeLog(store, env, ctx, 'admin_edit', docNo, 'เหตุผล: ' + reason + '\n' + changes.join('\n'), true);
    return slipView(store, docNo);
  };

  // ---------- เก็บผ้ารายวัน ----------
  function findCol(store, colNo) {
    const c = store.all('Collections').find(r => r.col_no === colNo);
    if (!c) fail('NOT_FOUND', 'ไม่พบใบเก็บผ้า ' + colNo);
    return c;
  }
  function colLines(store, colNo) {
    return store.all('CollectionLines').filter(r => r.col_no === colNo).sort((a, b) => a.item_seq - b.item_seq);
  }
  function colLineRow(colNo, l) {
    const r = { col_no: colNo, item_seq: l.item_seq, qty: l.qty, note: l.note };
    ZCOLS.forEach((z, i) => { r[z] = l.z[i] || 0; });
    return r;
  }
  function newColNo(store, date) {
    const base = 'CL-' + date.replace(/-/g, '') + '-';
    const used = {};
    store.all('Collections').forEach(c => { used[c.col_no] = 1; });
    let n = 1;
    while (used[base + (n < 10 ? '0' + n : n)]) n++;
    return base + (n < 10 ? '0' + n : n);
  }
  function colView(store, colNo) {
    const col = findCol(store, colNo);
    const lines = colLines(store, colNo);
    const used = {};
    lines.forEach(l => { used[l.item_seq] = 1; });
    const items = itemsAll(store).filter(i => i.active || used[i.seq]).map(i => ({ seq: i.seq, name: i.name }));
    const c = cfg(store);
    const sigs = col.sig_id ? sigPngs(store, { [col.sig_id]: 1 }) : {};
    return {
      col, lines, items, zones: zonesOf(c), sigs, status_label: COL_STATUS[col.status] || col.status,
      hotel: { name: c.hotel_name, line1: c.hotel_line1, line2: c.hotel_line2, line3: c.hotel_line3 },
      revisions: store.all('Revisions').filter(r => r.doc_no === colNo).sort((a, b) => a.at < b.at ? -1 : 1).map(r => Object.assign(r, { changes: safeJSON(r.changes, []) })),
      events: store.all('Log').filter(r => r.doc_no === colNo).sort((a, b) => a.at < b.at ? -1 : 1)
        .map(r => ({ at: r.at, actor: r.actor, role: r.role, action: r.action, label: ACTION_LABEL[r.action] || r.action, detail: r.detail }))
    };
  }
  function pendingInfo(store) {
    const cols = store.all('Collections').filter(c => c.status === 'pending')
      .sort((a, b) => (a.col_date + a.col_no < b.col_date + b.col_no ? -1 : 1));
    const set = {};
    cols.forEach(c => { set[c.col_no] = 1; });
    const nz = zonesOf(cfg(store)).length;
    const byItem = {}, byZone = new Array(MAX_ZONES).fill(0);
    store.all('CollectionLines').forEach(l => {
      if (!set[l.col_no]) return;
      byItem[l.item_seq] = (byItem[l.item_seq] || 0) + l.qty;
      ZCOLS.forEach((z, i) => { byZone[i] += l[z] || 0; });
    });
    const oldest = cols.length ? cols[0].col_date : '';
    const days = oldest && isDate(oldest) ? Math.max(0, Math.round((Date.parse(todayBKK()) - Date.parse(oldest)) / 86400000)) : 0;
    return {
      count: cols.length, total: cols.reduce((a, c) => a + c.total, 0), oldest, days, by_item: byItem, by_zone: byZone.slice(0, nz),
      cols: cols.map(c => ({ col_no: c.col_no, col_date: c.col_date, rooms: c.rooms, total: c.total, created_by: c.created_by }))
    };
  }

  H.saveCollection = function (store, p, ctx, env) {
    const nz = zonesOf(cfg(store)).length;
    const valid = {};
    itemsAll(store).filter(i => i.active).forEach(i => { valid[i.seq] = 1; });
    const lines = parseLines(p.lines, valid, nz);
    const total = lines.reduce((a, l) => a + l.qty, 0);
    if (total <= 0) fail('BAD_INPUT', 'ยังไม่ได้กรอกจำนวนผ้า กรอกอย่างน้อย 1 รายการ');
    const date = p.col_date ? str(p.col_date, 10) : todayBKK();
    if (!isDate(date)) fail('BAD_INPUT', 'รูปแบบวันที่ไม่ถูกต้อง');
    const colNo = newColNo(store, date);
    const name = str(p.signer_name, 80) || ctx.name;
    const sig = saveSignature(store, colNo, 'collector', name, p.signature);
    const rooms = str(p.rooms, 200);
    store.insert('Collections', {
      col_no: colNo, col_date: date, status: 'pending', prepared_by: name, rooms, note: str(p.note, 300), total,
      signer: name, sig_id: sig, created_at: nowISO(), created_by: ctx.name, updated_at: nowISO()
    });
    store.insertMany('CollectionLines', lines.map(l => colLineRow(colNo, l)));
    writeLog(store, env, ctx, 'collect', colNo, 'เก็บผ้า ' + total + ' ชิ้น · วันที่ ' + date + (rooms ? ' · ห้อง ' + rooms : ''), true);
    return colView(store, colNo);
  };

  H.listCollections = function (store, p) {
    let list = store.all('Collections');
    if (p.status) list = list.filter(c => c.status === p.status);
    list.sort((a, b) => (a.col_date + a.created_at < b.col_date + b.created_at ? 1 : -1));
    return { collections: list.slice(0, int(p.limit, 500) || 200).map(c => ({
      col_no: c.col_no, col_date: c.col_date, status: c.status, rooms: c.rooms, total: c.total, prepared_by: c.prepared_by, doc_no: c.doc_no, created_at: c.created_at
    })) };
  };

  H.getCollection = function (store, p) { return colView(store, str(p.col_no, 40)); };

  // ใบเก็บผ้าที่รอส่งซัก พร้อมรายการ — ใช้สร้างใบส่งผ้า
  H.pendingCollections = function (store) {
    const info = pendingInfo(store);
    const lines = {};
    store.all('CollectionLines').forEach(l => { (lines[l.col_no] = lines[l.col_no] || []).push(l); });
    info.cols.forEach(c => { c.lines = (lines[c.col_no] || []).sort((a, b) => a.item_seq - b.item_seq); });
    return info;
  };

  H.adminEditCollection = function (store, p, ctx, env) {
    const colNo = str(p.col_no, 40);
    const col = findCol(store, colNo);
    if (col.status === 'sent') fail('STATE', 'ใบเก็บผ้านี้ถูกรวมในใบส่งผ้า ' + col.doc_no + ' แล้ว — ให้แก้ที่ใบส่งผ้า');
    if (col.status === 'void') fail('STATE', 'ใบเก็บผ้านี้ถูกยกเลิกแล้ว');
    const reason = str(p.reason, 300);
    if (reason.length < 3) fail('BAD_INPUT', 'ต้องบันทึกเหตุผลทุกครั้งที่แก้ไขเอกสาร');
    const zones = zonesOf(cfg(store));
    const items = itemsAll(store);
    const nm = {};
    items.forEach(i => { nm[i.seq] = '#' + i.seq + ' ' + i.name; });
    const changes = [];
    const h = p.header || {};
    const patch = {};
    if (h.col_date !== undefined && h.col_date !== col.col_date) {
      if (!isDate(h.col_date)) fail('BAD_INPUT', 'รูปแบบวันที่ไม่ถูกต้อง');
      changes.push('วันที่เก็บ: ' + col.col_date + ' → ' + h.col_date); patch.col_date = h.col_date;
    }
    if (h.rooms !== undefined && str(h.rooms, 200) !== col.rooms) { changes.push('ห้อง: ' + col.rooms + ' → ' + str(h.rooms, 200)); patch.rooms = str(h.rooms, 200); }
    if (h.note !== undefined && str(h.note, 300) !== col.note) { changes.push('หมายเหตุ: ' + col.note + ' → ' + str(h.note, 300)); patch.note = str(h.note, 300); }
    if (Array.isArray(p.lines)) {
      const valid = {};
      items.forEach(i => { valid[i.seq] = 1; });
      const next = parseLines(p.lines, valid, zones.length);
      const prevMap = {}, nextMap = {};
      colLines(store, colNo).forEach(l => { prevMap[l.item_seq] = l; });
      next.forEach(l => { nextMap[l.item_seq] = l; });
      const seqs = {};
      Object.keys(prevMap).concat(Object.keys(nextMap)).forEach(k => { seqs[k] = 1; });
      Object.keys(seqs).map(Number).sort((a, b) => a - b).forEach(seq => {
        const a = prevMap[seq];
        const b = nextMap[seq] || { item_seq: seq, z: [], note: '', qty: 0 };
        for (let i = 0; i < zones.length; i++) {
          const before = a ? a[ZCOLS[i]] : 0, after = b.z[i] || 0;
          if (before !== after) changes.push(nm[seq] + ' / ' + zones[i] + ': ' + before + ' → ' + after);
        }
        if ((a ? a.note : '') !== b.note) changes.push(nm[seq] + ' / หมายเหตุ: "' + (a ? a.note : '') + '" → "' + b.note + '"');
      });
      if (changes.length) {
        const total = next.reduce((a, l) => a + l.qty, 0);
        if (total <= 0) fail('BAD_INPUT', 'ใบเก็บผ้าต้องมีผ้าอย่างน้อย 1 ชิ้น (ถ้าต้องการยกเลิกให้ใช้ "ยกเลิกเอกสาร")');
        store.deleteWhere('CollectionLines', { col_no: colNo });
        store.insertMany('CollectionLines', next.map(l => colLineRow(colNo, l)));
        patch.total = total;
      }
    }
    if (!changes.length) fail('BAD_INPUT', 'ไม่พบข้อมูลที่เปลี่ยนแปลง');
    patch.rev_count = col.rev_count + 1; patch.updated_at = nowISO();
    store.update('Collections', { col_no: colNo }, patch);
    store.insert('Revisions', { rev_id: 'R' + uid(10), doc_no: colNo, at: nowISO(), by: ctx.name, role: ctx.role, kind: 'edit', reason, changes: JSON.stringify(changes) });
    writeLog(store, env, ctx, 'edit_collection', colNo, 'เหตุผล: ' + reason + '\n' + changes.join('\n'), true);
    return colView(store, colNo);
  };

  H.voidCollection = function (store, p, ctx, env) {
    const colNo = str(p.col_no, 40);
    const col = findCol(store, colNo);
    if (col.status === 'sent') fail('STATE', 'ใบเก็บผ้านี้ถูกรวมในใบส่งผ้า ' + col.doc_no + ' แล้ว — ยกเลิกใบส่งผ้าก่อนจึงจะยกเลิกใบนี้ได้');
    if (col.status === 'void') fail('STATE', 'ใบเก็บผ้านี้ถูกยกเลิกแล้ว');
    const reason = str(p.reason, 300);
    if (reason.length < 3) fail('BAD_INPUT', 'บันทึกเหตุผลที่ยกเลิก');
    store.update('Collections', { col_no: colNo }, { status: 'void', void_reason: reason, rev_count: col.rev_count + 1, updated_at: nowISO() });
    store.insert('Revisions', { rev_id: 'R' + uid(10), doc_no: colNo, at: nowISO(), by: ctx.name, role: ctx.role, kind: 'void', reason, changes: JSON.stringify(['ยกเลิกใบเก็บผ้า (' + col.total + ' ชิ้น)']) });
    writeLog(store, env, ctx, 'void_collection', colNo, reason, true);
    return colView(store, colNo);
  };

  H.dashboard = function (store) {
    const c = cfg(store);
    const overdue = Number(c.overdue_days) || 5;
    const all = summaries(store);
    const pend = pendingInfo(store);
    const counts = {};
    Object.keys(STATUS).forEach(k => { counts[k] = 0; });
    all.forEach(s => { counts[s.status] = (counts[s.status] || 0) + 1; });

    const byItem = {};
    const shortItem = {};
    const rec = {};
    store.all('ReceiptLines').forEach(l => { const k = l.doc_no + '|' + l.item_seq; rec[k] = (rec[k] || 0) + l.qty; });
    const slipMap = {};
    all.forEach(s => { slipMap[s.doc_no] = s; });
    store.all('SlipLines').forEach(l => {
      const s = slipMap[l.doc_no];
      if (!s || ACTIVE.indexOf(s.status) < 0) return;
      const out = Math.max(0, l.agreed_qty - (rec[l.doc_no + '|' + l.item_seq] || 0));
      byItem[l.item_seq] = (byItem[l.item_seq] || 0) + out;
      if (s.status === 'short') shortItem[l.item_seq] = (shortItem[l.item_seq] || 0) + out;
    });

    const vendors = {};
    all.filter(s => ACTIVE.indexOf(s.status) >= 0).sort((a, b) => b.days_out - a.days_out).forEach(s => {
      const v = vendors[s.vendor_id] = vendors[s.vendor_id] || { vendor_id: s.vendor_id, name: s.vendor_name, total: 0, slips: [] };
      v.total += s.outstanding;
      v.slips.push({ doc_no: s.doc_no, status: s.status, send_date: s.send_date, days_out: s.days_out, outstanding: s.outstanding, overdue: s.days_out > overdue });
    });

    const items = itemsAll(store).filter(i => i.active).map(i => ({
      seq: i.seq, name: i.name, par: i.par, at_laundry: byItem[i.seq] || 0, short_open: shortItem[i.seq] || 0, pending: pend.by_item[i.seq] || 0,
      in_hotel: i.par > 0 ? i.par - (byItem[i.seq] || 0) : null
    }));

    const issues = all.filter(s => s.status === 'dispute' || s.status === 'short').sort((a, b) => b.days_out - a.days_out);
    const feed = store.all('Log').filter(l => l.notify).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 40)
      .map(l => ({ at: l.at, actor: l.actor, role: l.role, action: l.action, label: ACTION_LABEL[l.action] || l.action, doc_no: l.doc_no, detail: l.detail }));
    return {
      counts, pending: pend, vendors: Object.keys(vendors).map(k => vendors[k]), items, issues, feed, overdue_days: overdue,
      at_laundry_total: Object.keys(byItem).reduce((a, k) => a + byItem[k], 0), today: todayBKK()
    };
  };

  H.savePar = function (store, p, ctx, env) {
    const pars = p.pars || {};
    const changes = [];
    itemsAll(store).forEach(i => {
      if (pars[i.seq] === undefined) return;
      const v = int(pars[i.seq], 999999);
      if (v !== i.par) { changes.push('#' + i.seq + ' ' + i.name + ': ' + i.par + ' → ' + v); store.update('Items', { seq: i.seq }, { par: v }); }
    });
    if (changes.length) writeLog(store, env, ctx, 'par_update', '', changes.join('\n'), false);
    return { changed: changes.length };
  };

  H.saveVendor = function (store, p, ctx, env) {
    const name = str(p.name, 100);
    if (!name) fail('BAD_INPUT', 'กรอกชื่อร้านซัก');
    const patch = { name, contact: str(p.contact, 80), phone: str(p.phone, 40), email: str(p.email, 120), active: p.active === 0 || p.active === false ? 0 : 1 };
    let id = str(p.id, 20);
    if (id) {
      if (!store.update('Vendors', { id }, patch)) fail('NOT_FOUND', 'ไม่พบร้านซัก');
    } else {
      const nums = store.all('Vendors').map(v => Number(String(v.id).replace(/\D/g, '')) || 0);
      id = 'V' + (Math.max(0, ...nums) + 1);
      store.insert('Vendors', Object.assign({ id }, patch));
    }
    writeLog(store, env, ctx, 'vendor_update', '', id + ' ' + name + (patch.active ? '' : ' (ปิดใช้งาน)'), false);
    return { id };
  };

  H.saveConfig = function (store, p, ctx, env) {
    const out = [];
    if (p.admin_email !== undefined) {
      const e = str(p.admin_email, 200);
      if (e && !/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(e.split(',')[0].trim()) ) fail('BAD_INPUT', 'อีเมลไม่ถูกต้อง');
      setConfig(store, 'admin_email', e); out.push('admin_email');
    }
    if (p.overdue_days !== undefined) { setConfig(store, 'overdue_days', String(Math.max(1, int(p.overdue_days, 365)))); out.push('overdue_days'); }
    if (p.app_url !== undefined) { setConfig(store, 'app_url', str(p.app_url, 300)); out.push('app_url'); }
    if (out.length) writeLog(store, env, ctx, 'config_update', '', out.join(', '), false);
    return {};
  };

  // ---------- รายงานสรุป (รายวัน / รายเดือน / รายปี) ----------
  const ERR_TYPES = ['dispute', 'short', 'defect', 'excess', 'acc_diff', 'edit', 'void', 'writeoff'];
  const ERR_LABEL = {
    dispute: 'ร้านซักนับยอดไม่ตรง', short: 'ผ้าขาดตอนรับคืน', defect: 'ผ้าชำรุด / คราบ', excess: 'รับผ้าคืนเกินที่ส่ง',
    acc_diff: 'ยอดส่งต่างจากยอดสะสม', edit: 'Admin แก้ไขเอกสาร', void: 'ยกเลิกเอกสาร', writeoff: 'ปิดงานโดยตัดยอดผ้าขาด'
  };

  function reportData(store) {
    const group = (rows, key) => { const m = {}; rows.forEach(r => { (m[r[key]] = m[r[key]] || []).push(r); }); return m; };
    const slipsList = store.all('Slips');
    const slips = {};
    slipsList.forEach(x => { slips[x.doc_no] = x; });
    return {
      slips, slipsList, slipLines: group(store.all('SlipLines'), 'doc_no'),
      receipts: store.all('Receipts'), rcLines: group(store.all('ReceiptLines'), 'rcpt_id'),
      shortages: store.all('Shortages'), shLines: group(store.all('ShortageLines'), 'rpt_no'),
      cols: store.all('Collections').filter(c => c.status !== 'void'), colLines: group(store.all('CollectionLines'), 'col_no'),
      revs: store.all('Revisions'), disputes: store.all('Log').filter(l => l.action === 'vendor_dispute'),
      names: (function () { const m = {}; itemsAll(store).forEach(i => { m[i.seq] = i.name; }); return m; })()
    };
  }

  // รวมตัวเลขในช่วงวันที่ from..to (YYYY-MM-DD) ; bucketFn(date) -> key สำหรับแนวโน้ม (หรือ null)
  function aggregate(D, from, to, bucketFn) {
    const inR = d => !!d && d >= from && d <= to;
    const items = {}, buckets = {}, errors = [], errCount = {};
    ERR_TYPES.forEach(t => { errCount[t] = 0; });
    const counts = { collections: 0, sends: 0, receipts: 0, supplements: 0, closed: 0 };
    const it = seq => items[seq] || (items[seq] = { collected: 0, sent: 0, received: 0, missing: 0, defect: 0 });
    const bk = d => {
      if (!bucketFn) return null;
      const k = bucketFn(d);
      return buckets[k] || (buckets[k] = { collected: 0, sent: 0, received: 0, missing: 0, defect: 0, sends: 0, receipts: 0, errors: 0 });
    };
    const addB = (d, field, n) => { const b = bk(d); if (b) b[field] += n; };
    const nm = seq => '#' + seq + ' ' + (D.names[seq] || '');
    const addErr = (d, type, docNo, detail) => {
      errors.push({ date: d, type, label: ERR_LABEL[type], doc_no: docNo, detail });
      errCount[type]++; addB(d, 'errors', 1);
    };
    const live = x => x && x.status !== 'draft' && x.status !== 'void';

    D.cols.forEach(c => {
      if (!inR(c.col_date)) return;
      counts.collections++;
      (D.colLines[c.col_no] || []).forEach(l => { it(l.item_seq).collected += l.qty; addB(c.col_date, 'collected', l.qty); });
    });

    D.slipsList.forEach(sl => {
      if (!live(sl)) return;
      const d = sl.send_date || String(sl.sent_at || '').slice(0, 10);
      const ls = D.slipLines[sl.doc_no] || [];
      if (inR(d)) {
        counts.sends++; addB(d, 'sends', 1);
        ls.forEach(l => { if (l.agreed_qty > 0) { it(l.item_seq).sent += l.agreed_qty; addB(d, 'sent', l.agreed_qty); } });
        if (String(sl.collections || '') && ls.some(l => l.acc_qty !== l.qty)) {
          const acc = ls.reduce((a, l) => a + l.acc_qty, 0), snd = ls.reduce((a, l) => a + l.qty, 0);
          addErr(d, 'acc_diff', sl.doc_no, 'ยอดสะสม ' + acc + ' ชิ้น / ส่งจริง ' + snd + ' ชิ้น');
        }
      }
      const closedD = String(sl.closed_at || '').slice(0, 10);
      if (sl.status === 'closed' && inR(closedD)) counts.closed++;
    });

    D.receipts.forEach(rc => {
      if (!live(D.slips[rc.doc_no]) || !inR(rc.receive_date)) return;
      counts.receipts++; addB(rc.receive_date, 'receipts', 1);
      if (rc.kind === 'supplement') counts.supplements++;
      let defect = 0; const parts = [];
      (D.rcLines[rc.rcpt_id] || []).forEach(l => {
        it(l.item_seq).received += l.qty; addB(rc.receive_date, 'received', l.qty);
        if (l.defect > 0) { it(l.item_seq).defect += l.defect; addB(rc.receive_date, 'defect', l.defect); defect += l.defect; parts.push(nm(l.item_seq) + ' (' + l.defect + ')' + (l.note ? ' ' + l.note : '')); }
      });
      if (defect > 0) addErr(rc.receive_date, 'defect', rc.doc_no, 'ชำรุด/คราบ ' + defect + ' ชิ้น: ' + parts.join(', '));
    });

    // ผ้าขาด = ที่พบตอนรับคืนครั้งแรก (ใบแจ้งฉบับที่ 1) ไม่นับซ้ำเมื่อมีใบแจ้งฉบับใหม่
    D.shortages.forEach(r => {
      if (r.rpt_seq !== 1 || !live(D.slips[r.doc_no])) return;
      const d = String(r.created_at || '').slice(0, 10);
      if (!inR(d)) return;
      let tot = 0; const parts = [];
      (D.shLines[r.rpt_no] || []).forEach(l => { if (l.missing > 0) { it(l.item_seq).missing += l.missing; addB(d, 'missing', l.missing); tot += l.missing; parts.push(nm(l.item_seq) + ' (' + l.missing + ')'); } });
      if (tot > 0) addErr(d, 'short', r.doc_no, 'ขาด ' + tot + ' ชิ้น: ' + parts.join(', '));
    });

    // รับเกินจากที่ส่ง (รวมทุกใบรับของเอกสาร) ลงวันที่รับครั้งล่าสุด
    D.slipsList.forEach(sl => {
      if (!live(sl)) return;
      const rcs = D.receipts.filter(r => r.doc_no === sl.doc_no).sort((a, b) => a.rcpt_no - b.rcpt_no);
      if (!rcs.length) return;
      const got = {};
      rcs.forEach(rc => (D.rcLines[rc.rcpt_id] || []).forEach(l => { got[l.item_seq] = (got[l.item_seq] || 0) + l.qty; }));
      let ex = 0; const parts = [];
      (D.slipLines[sl.doc_no] || []).forEach(l => { const e = (got[l.item_seq] || 0) - l.agreed_qty; if (l.agreed_qty > 0 && e > 0) { ex += e; parts.push(nm(l.item_seq) + ' (+' + e + ')'); } });
      const d = rcs[rcs.length - 1].receive_date;
      if (ex > 0 && inR(d)) addErr(d, 'excess', sl.doc_no, 'รับเกิน ' + ex + ' ชิ้น: ' + parts.join(', '));
    });

    D.disputes.forEach(lg => {
      const d = String(lg.at || '').slice(0, 10);
      if (!inR(d) || (D.slips[lg.doc_no] && D.slips[lg.doc_no].status === 'void')) return;
      addErr(d, 'dispute', lg.doc_no, String(lg.detail || '').split('\n').slice(0, 3).join(' | '));
    });

    D.revs.forEach(rv => {
      const d = String(rv.at || '').slice(0, 10);
      if (!inR(d)) return;
      const type = rv.kind === 'edit' ? 'edit' : rv.kind === 'void' ? 'void' : rv.kind === 'close' ? 'writeoff' : '';
      if (!type) return;
      const ch = safeJSON(rv.changes, []);
      addErr(d, type, rv.doc_no, 'เหตุผล: ' + rv.reason + (ch.length ? ' · ' + ch.length + ' รายการ: ' + ch.slice(0, 2).join('; ') + (ch.length > 2 ? ' …' : '') : ''));
    });

    errors.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.type < b.type ? -1 : 1)));
    return { items, counts, errors, errCount, buckets };
  }

  H.report = function (store, p) {
    const type = str(p.type, 8);
    if (['day', 'month', 'year'].indexOf(type) < 0) fail('BAD_INPUT', 'ประเภทรายงานไม่ถูกต้อง');
    const today = todayBKK();
    let key = str(p.key, 10);
    let from, to, bucketFn = null, ytd = null;
    if (type === 'day') {
      key = key || today;
      if (!isDate(key)) fail('BAD_INPUT', 'รูปแบบวันที่ไม่ถูกต้อง');
      from = to = key;
    } else if (type === 'month') {
      key = key || today.slice(0, 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) fail('BAD_INPUT', 'รูปแบบเดือนไม่ถูกต้อง');
      const last = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate();
      from = key + '-01'; to = key + '-' + (last < 10 ? '0' + last : last);
      bucketFn = d => d;
    } else {
      key = key || today.slice(0, 4);
      if (!/^\d{4}$/.test(key)) fail('BAD_INPUT', 'รูปแบบปีไม่ถูกต้อง');
      from = key + '-01-01'; to = key + '-12-31';
      bucketFn = d => d.slice(0, 7);
    }
    const D = reportData(store);
    const agg = aggregate(D, from, to, bucketFn);
    if (type === 'month') ytd = aggregate(D, key.slice(0, 4) + '-01-01', to, null);

    const zero = { collected: 0, sent: 0, received: 0, missing: 0, defect: 0 };
    const rows = itemsAll(store).filter(i => i.active || agg.items[i.seq] || (ytd && ytd.items[i.seq])).map(i => {
      const a = agg.items[i.seq] || zero;
      const r = Object.assign({ seq: i.seq, name: i.name }, a);
      if (ytd) { const y = ytd.items[i.seq] || zero; r.ytd_sent = y.sent; r.ytd_problem = y.missing + y.defect; }
      return r;
    });
    const sum = f => rows.reduce((a, r) => a + r[f], 0);
    const totals = { collected: sum('collected'), sent: sum('sent'), received: sum('received'), missing: sum('missing'), defect: sum('defect') };
    if (ytd) { totals.ytd_sent = sum('ytd_sent'); totals.ytd_problem = sum('ytd_problem'); }

    let trend = null;
    if (bucketFn) {
      const keys = [];
      if (type === 'month') { const n = Number(to.slice(8, 10)); for (let d = 1; d <= n; d++) keys.push(key + '-' + (d < 10 ? '0' + d : d)); }
      else for (let m = 1; m <= 12; m++) keys.push(key + '-' + (m < 10 ? '0' + m : m));
      let cs = 0, ce = 0, cc = 0, cr = 0;
      trend = keys.map(k => {
        const b = agg.buckets[k] || { collected: 0, sent: 0, received: 0, missing: 0, defect: 0, sends: 0, receipts: 0, errors: 0 };
        cs += b.sent; ce += b.errors; cc += b.sends; cr += b.receipts;
        return Object.assign({ key: k, cum_sent: cs, cum_errors: ce, cum_sends: cc, cum_receipts: cr }, b);
      });
    }
    const errTypes = ERR_TYPES.map(t => ({ type: t, label: ERR_LABEL[t], count: agg.errCount[t], ytd: ytd ? ytd.errCount[t] : null }));
    return {
      type, key, from, to, items: rows, totals, counts: agg.counts, ytd_counts: ytd ? ytd.counts : null, trend,
      errors: { types: errTypes, total: agg.errors.length, ytd_total: ytd ? ytd.errors.length : null, list: agg.errors.slice(0, 300) }
    };
  };

  const ACTIONS = {
    login: { pub: 1 }, logout: { pub: 1 },
    vendorGet: { pub: 1 }, vendorConfirm: { pub: 1 }, vendorAck: { pub: 1 },
    bootstrap: { roles: ['admin', 'housekeeper'] }, listSlips: { roles: ['admin', 'housekeeper'] }, getSlip: { roles: ['admin', 'housekeeper'] },
    saveDraft: { roles: ['housekeeper'] }, deleteDraft: { roles: ['housekeeper'] }, sendSlip: { roles: ['housekeeper'] },
    resolveDispute: { roles: ['housekeeper'] }, receive: { roles: ['housekeeper'] },
    closeSlip: { roles: ['admin', 'housekeeper'] },
    adminEdit: { roles: ['admin'] }, voidSlip: { roles: ['admin'] }, dashboard: { roles: ['admin'] },
    saveCollection: { roles: ['housekeeper'] }, listCollections: { roles: ['admin', 'housekeeper'] }, getCollection: { roles: ['admin', 'housekeeper'] },
    pendingCollections: { roles: ['admin', 'housekeeper'] }, adminEditCollection: { roles: ['admin'] }, voidCollection: { roles: ['admin'] },
    report: { roles: ['admin'] },
    savePar: { roles: ['admin'] }, saveVendor: { roles: ['admin'] }, saveConfig: { roles: ['admin'] }
  };

  function handle(store, req, env) {
    try {
      const def = ACTIONS[req && req.action];
      if (!def) fail('NO_ACTION', 'ไม่รู้จักคำสั่ง');
      let ctx = null;
      if (!def.pub) {
        ctx = sessionGet(store, req.session);
        if (!ctx) fail('AUTH', 'หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่');
        if (def.roles.indexOf(ctx.role) < 0) fail('FORBIDDEN', 'บทบาทของคุณไม่มีสิทธิ์ทำรายการนี้');
      }
      const params = Object.assign({}, req.params || {});
      if (req.action === 'logout') params.session = req.session;
      return { ok: true, data: H[req.action](store, params, ctx, env || {}) };
    } catch (e) {
      if (e && e.isCoreError) return { ok: false, error: e.code, message: e.message };
      return { ok: false, error: 'SERVER', message: 'ระบบขัดข้อง: ' + (e && e.message ? e.message : e) };
    }
  }

  const api = {
    VERSION, MAX_ZONES, ZCOLS, SCHEMA, STATUS, COL_STATUS, ACTIVE, ACTION_LABEL, DEFAULT_ITEMS, DEFAULT_CONFIG,
    handle, seed, createMemoryStore, row, rowPatch, todayBKK, nowISO, cfg, zonesOf,
    dashboard: store => H.dashboard(store)
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
