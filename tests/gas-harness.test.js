// รัน apps-script/Core.gs + Code.gs จริงในกล่องจำลอง Google Apps Script (Sheet/Cache/Lock/Mail ปลอม)
// เพื่อตรวจว่าตัวเชื่อม Google Sheet ทำงานครบวงจร: node tests/gas-harness.test.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const coreGs = fs.readFileSync(path.join(root, 'apps-script/Core.gs'), 'utf8');
const codeGs = fs.readFileSync(path.join(root, 'apps-script/Code.gs'), 'utf8');
assert.equal(coreGs, fs.readFileSync(path.join(root, 'js/core.js'), 'utf8'), 'Core.gs ต้องเหมือน js/core.js — รัน tools/sync-core.sh');

// ---------- Google Apps Script ปลอม ----------
function makeSheet(name) {
  const cells = {}; // "r,c" -> value
  let maxRow = 0, frozen = 0, writes = 0, read = 0;
  const sh = {
    name, cells, get writes() { return writes; }, get cellsRead() { return read; },
    getLastRow() { sheetCalls++; let m = 0; for (const k in cells) { if (cells[k] !== '' && cells[k] !== undefined) m = Math.max(m, +k.split(',')[0]); } return m; },
    getMaxRows() { return 1000; },
    setFrozenRows(n) { frozen = n; },
    setColumnWidth() { },
    getRange(r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1; sheetCalls++;
      const rg = {
        setValues(v) { writes++; for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) cells[(r + i) + ',' + (c + j)] = v[i][j]; return rg; },
        getValues() { read += nr * nc; const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = cells[(r + i) + ',' + (c + j)]; row.push(v === undefined ? '' : v); } o.push(row); } return o; },
        setFontWeight() { return rg; }, setBackground() { return rg; }, setNumberFormat() { return rg; }
      };
      return rg;
    },
    deleteRows(start, count) {
      const out = {};
      for (const k in cells) {
        const [rr, cc] = k.split(',').map(Number);
        if (rr >= start && rr < start + count) continue;
        out[(rr > start ? rr - (rr >= start + count ? count : 0) : rr) + ',' + cc] = cells[k];
      }
      for (const k in cells) delete cells[k];
      Object.assign(cells, out);
    }
  };
  return sh;
}
const sheets = {};
let sheetCalls = 0;
const ss = {
  getSheetByName: n => sheets[n] || null,
  insertSheet: n => (sheets[n] = makeSheet(n)),
  getSheets: () => Object.values(sheets),
  deleteSheet: s => { delete sheets[s.name]; },
  setSpreadsheetTimeZone() { }
};
const cacheData = {};
const mails = [];
const triggers = [];
const fakes = {
  console, JSON, Date, Math, Object, Array, String, Number, Error, RegExp, isFinite, parseInt, Map, Set,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() { } },
  CacheService: { getScriptCache: () => ({
    get: k => (k in cacheData ? cacheData[k] : null),
    put: (k, v) => { if (String(v).length > 100000) throw new Error('value too large'); cacheData[k] = v; },
    remove: k => { delete cacheData[k]; },
    getAll: ks => { const o = {}; ks.forEach(k => { if (k in cacheData) o[k] = cacheData[k]; }); return o; },
    putAll: o => { Object.keys(o).forEach(k => { if (String(o[k]).length > 100000) throw new Error('value too large'); cacheData[k] = o[k]; }); }
  }) },
  LockService: { getScriptLock: () => ({ waitLock() { }, releaseLock() { } }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; }, getContent() { return s; } }) },
  MailApp: { sendEmail: m => mails.push(m) },
  Utilities: { getUuid: () => require('crypto').randomUUID(), formatDate: d => d.toISOString().slice(0, 10) },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: fn => { const t = { fn, timeBased() { return t; }, everyDays() { return t; }, atHour() { return t; }, inTimezone() { return t; }, create() { triggers.push(fn); } }; return t; } },
  Logger: { log() { } }
};
const ctx = vm.createContext(fakes);
vm.runInContext(coreGs, ctx);
vm.runInContext(codeGs, ctx);
const run = name => vm.runInContext(name, ctx);

let pass = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n      ' + (e.stack || e).split('\n').slice(0, 5).join('\n      ')); process.exitCode = 1; } }
const post = (action, params, session) => JSON.parse(run('doPost')({ postData: { contents: JSON.stringify({ action, params, session }) } }).getContent());
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.data; };
const SIG = 'data:image/png;base64,' + 'iVBORw0KGgo'.repeat(40);

console.log('ติดตั้ง (setup)');
run('setup')();
t('สร้างครบทุกแท็บ พร้อมหัวตาราง', () => {
  ['Users', 'Vendors', 'Items', 'Config', 'Slips', 'SlipLines', 'Receipts', 'ReceiptLines', 'Shortages', 'ShortageLines', 'Signatures', 'Revisions', 'Log', 'Collections', 'CollectionLines']
    .forEach(n => assert.ok(sheets[n], 'ไม่มีแท็บ ' + n));
  assert.equal(sheets.Slips.cells['1,1'], 'doc_no');
  assert.equal(sheets.Items.getLastRow(), 20); // หัว + 19 รายการ
});
t('มีผู้ใช้เริ่มต้นพร้อม PIN สุ่ม 6 หลัก และตั้งเวลาเตือนรายวัน', () => {
  const pins = [sheets.Users.cells['2,3'], sheets.Users.cells['3,3']];
  pins.forEach(p => assert.match(String(p), /^\d{6}$/));
  assert.deepEqual(triggers, ['checkOverdue']);
});
t('doGet ใช้เช็คว่าบริการทำงาน', () => assert.equal(JSON.parse(run('doGet')().getContent()).ok, true));

const hkPin = String(sheets.Users.cells['3,3']);
const admPin = String(sheets.Users.cells['2,3']);
// ตั้งอีเมล Admin และอีเมลร้านซัก + app_url ผ่านชีต (เหมือนที่ผู้ใช้แก้เอง)
const adm = ok(post('login', { role: 'admin', pin: admPin })).session;
const hk = ok(post('login', { role: 'housekeeper', pin: hkPin })).session;
ok(post('saveConfig', { admin_email: 'boss@example.com', app_url: 'https://example.github.io/linen/' }, adm));
ok(post('saveVendor', { id: 'V1', name: 'ร้านสะอาดซักอบรีด', email: 'laundry@example.com', active: 1 }, adm));

console.log('วงจรผ่าน doPost (อ่าน/เขียนผ่านชีตจริงทุกครั้ง)');
let doc, token;
t('ล็อกอินผิด PIN ถูกปฏิเสธ', () => assert.equal(post('login', { role: 'admin', pin: '000000' }).error, 'BAD_PIN'));
t('บันทึกร่างแล้วอ่านกลับจากชีตได้ถูกต้อง', () => {
  const v = ok(post('saveDraft', { header: { vendor_id: 'V1', send_date: '2026-11-20' }, lines: [{ item_seq: 15, z: [10, 10, 10, 10, 10, 2], note: 'มีคราบ' }, { item_seq: 1, z: [3, 2] }] }, hk));
  doc = v.slip.doc_no;
  assert.equal(v.slip.send_total, 57);
  assert.equal(typeof v.slip.send_total, 'number');
  assert.equal(ok(post('getSlip', { doc_no: doc }, hk)).lines.length, 2);
});
t('แก้ร่าง (ลบ/แทนที่แถวรายการผ้า) ผ่านชีต', () => {
  const v = ok(post('saveDraft', { doc_no: doc, lines: [{ item_seq: 15, z: [10, 10, 10, 10, 10, 2], note: 'มีคราบ' }, { item_seq: 1, z: [3, 2] }, { item_seq: 7, z: [0, 0, 0, 0, 0, 4] }] }, hk));
  assert.equal(v.lines.length, 3);
  assert.equal(v.slip.send_total, 61);
});
t('ส่งซัก → อีเมลถึง Admin และถึงร้านซัก (พร้อมลิงก์ ?t=)', () => {
  const n = mails.length;
  const v = ok(post('sendSlip', { doc_no: doc, signature: SIG }, hk));
  token = v.slip.token;
  assert.equal(v.slip.status, 'sent');
  const sent = mails.slice(n);
  assert.ok(sent.some(m => m.to === 'boss@example.com' && /ส่งซัก/.test(m.subject)), 'ไม่มีอีเมลถึง Admin');
  const vm_ = sent.find(m => m.to === 'laundry@example.com');
  assert.ok(vm_, 'ไม่มีอีเมลถึงร้านซัก');
  assert.ok(vm_.body.includes('https://example.github.io/linen/?t=' + token));
});
t('ลายเซ็นถูกเก็บในแท็บ Signatures', () => assert.equal(sheets.Signatures.getLastRow(), 2));
t('ร้านนับไม่ตรง → dispute → แม่บ้านตกลงยอด', () => {
  const v = ok(post('vendorConfirm', { token, name: 'สมชาย', counts: { 15: 40, 1: 5, 7: 4 }, signature: SIG }));
  assert.equal(v.slip.status, 'dispute');
  const r = ok(post('resolveDispute', { doc_no: doc, agreed: { 15: 52 }, reason: 'นับซ้ำแล้ว' }, hk));
  assert.equal(r.slip.status, 'confirmed');
  assert.equal(r.revisions.length, 1);
});
t('รับผ้าคืนขาด → short + ใบแจ้ง + อีเมลถึงร้าน', () => {
  const n = mails.length;
  const v = ok(post('receive', { doc_no: doc, lines: [{ item_seq: 15, qty: 48, defect: 1 }, { item_seq: 1, qty: 5 }, { item_seq: 7, qty: 4 }], signature: SIG }, hk));
  assert.equal(v.slip.status, 'short');
  assert.equal(v.derived.missing_total, 4);
  assert.ok(mails.slice(n).some(m => m.to === 'laundry@example.com' && /ใบแจ้ง/.test(m.subject)));
});
t('ร้านรับทราบ → รับเพิ่ม → ปิดงาน', () => {
  ok(post('vendorAck', { token, name: 'สมชาย', expect_date: '2026-12-01', signature: SIG }));
  const v = ok(post('receive', { doc_no: doc, lines: [{ item_seq: 15, qty: 4 }], signature: SIG }, hk));
  assert.equal(v.slip.status, 'closed');
  assert.equal(v.receipts.length, 2);
});
t('Admin แก้ไขพร้อมเหตุผล → เก็บ revision ในชีต', () => {
  const cur = ok(post('getSlip', { doc_no: doc }, adm));
  const lines = cur.lines.map(l => ({ item_seq: l.item_seq, z: [l.z1, l.z2, l.z3, l.z4, l.z5, l.z6], note: l.note }));
  lines.find(l => l.item_seq === 7).z[5] = 5;
  const v = ok(post('adminEdit', { doc_no: doc, reason: 'พิมพ์ผิด', lines }, adm));
  assert.equal(v.revisions.at(-1).kind, 'edit');
  assert.ok(sheets.Revisions.getLastRow() >= 3);
});
t('แดชบอร์ดและรายการเอกสาร', () => {
  const d = ok(post('dashboard', {}, adm));
  assert.equal(d.counts.closed, 1);
  assert.ok(d.feed.length >= 5);
  assert.equal(ok(post('listSlips', {}, hk)).slips.length, 1);
});
t('ลบร่างทำงานผ่านชีต (deleteRows)', () => {
  const d = ok(post('saveDraft', { lines: [{ item_seq: 2, z: [1] }, { item_seq: 3, z: [1] }] }, hk)).slip.doc_no;
  const before = sheets.SlipLines.getLastRow();
  ok(post('deleteDraft', { doc_no: d }, hk));
  assert.equal(sheets.SlipLines.getLastRow(), before - 2);
  assert.equal(ok(post('listSlips', {}, hk)).slips.length, 1);
});
t('checkOverdue ส่งอีเมลสรุปเมื่อผ้าค้างเกินกำหนด', () => {
  ok(post('sendSlip', { header: { vendor_id: 'V1', send_date: '2020-01-01' }, lines: [{ item_seq: 2, z: [3] }], signature: SIG }, hk));
  const n = mails.length;
  run('checkOverdue')();
  const m = mails.slice(n).find(x => /เกิน/.test(x.subject));
  assert.ok(m && m.body.includes('ค้าง 3 ชิ้น'), JSON.stringify(mails.slice(n)));
});
t('ข้อมูลที่ส่งมาเสียรูปถูกปฏิเสธอย่างปลอดภัย', () => {
  const r = JSON.parse(run('doPost')({ postData: { contents: '{bad' } }).getContent());
  assert.equal(r.ok, false);
});

console.log('เก็บผ้ารายวัน ผ่านชีตจริง');
let cols = [];
t('เก็บผ้า 2 ใบ → เขียนลงแท็บ Collections / CollectionLines / Signatures', () => {
  const sigBefore = sheets.Signatures.getLastRow();
  const a = ok(post('saveCollection', { col_date: '2026-11-24', rooms: '101,102', lines: [{ item_seq: 15, z: [6, 0, 0, 0, 0, 0] }, { item_seq: 1, z: [2] }], signature: SIG }, hk));
  const b = ok(post('saveCollection', { col_date: '2026-11-25', rooms: '201', lines: [{ item_seq: 15, z: [0, 4] }], signature: SIG }, hk));
  cols = [a.col.col_no, b.col.col_no];
  assert.deepEqual(cols, ['CL-20261124-01', 'CL-20261125-01']);
  assert.equal(sheets.Collections.getLastRow(), 3);
  assert.equal(sheets.CollectionLines.getLastRow(), 4);
  assert.equal(sheets.Signatures.getLastRow(), sigBefore + 2);
  assert.equal(typeof ok(post('listCollections', {}, hk)).collections[0].total, 'number');
});
t('pendingCollections อ่านกลับจากชีตและรวมยอดถูก', () => {
  const p = ok(post('pendingCollections', {}, hk));
  assert.equal(p.count, 2); assert.equal(p.total, 12); assert.equal(p.by_item[15], 10);
});
t('ส่งซักรวมยอดสะสม → ใบเก็บผ้าเปลี่ยนเป็น sent ในชีต (แก้แถวเดิม ไม่เพิ่มแถว)', () => {
  const rowsBefore = sheets.Collections.getLastRow();
  const v = ok(post('sendSlip', { header: { vendor_id: 'V1', send_date: '2026-11-25' }, collection_ids: cols,
    lines: [{ item_seq: 15, z: [6, 4] }, { item_seq: 1, z: [2] }], signature: SIG }, hk));
  assert.equal(v.collections.length, 2);
  assert.equal(sheets.Collections.getLastRow(), rowsBefore);
  assert.equal(ok(post('pendingCollections', {}, hk)).count, 0);
  assert.equal(ok(post('listCollections', { status: 'sent' }, hk)).collections.length, 2);
  assert.ok(v.slip.collections.includes(cols[0]));
});
t('Admin ยกเลิกใบเก็บผ้า (ลบ/แก้แถวในชีต) ทำงานได้', () => {
  const c = ok(post('saveCollection', { lines: [{ item_seq: 2, z: [3] }], signature: SIG }, hk)).col.col_no;
  const v = ok(post('voidCollection', { col_no: c, reason: 'บันทึกซ้ำ' }, adm));
  assert.equal(v.col.status, 'void');
  assert.equal(ok(post('dashboard', {}, adm)).pending.count, 0);
});


console.log('รายงานสรุป ผ่านชีตจริง');
t('report รายวัน/เดือน/ปี อ่านข้อมูลจากชีตและรวมยอดถูกต้อง', () => {
  const m = ok(post('report', { type: 'month', key: '2026-11' }, adm));
  assert.equal(m.counts.collections >= 2, true);
  assert.equal(m.items.length, 19);
  const y = ok(post('report', { type: 'year', key: '2026' }, adm));
  assert.equal(y.trend.length, 12);
  assert.equal(y.totals.collected >= m.totals.collected, true);
  const d = ok(post('report', { type: 'day', key: '2026-11-25' }, adm));
  assert.equal(typeof d.errors.total, 'number');
  assert.equal(post('report', { type: 'day' }, hk).error, 'FORBIDDEN');
});

console.log('ความเร็ว: ไม่อ่านข้อมูลหนักเกินจำเป็น');
t('เปิดใบส่งผ้าไม่ดึงภาพลายเซ็นทั้งตาราง แต่ยังได้ลายเซ็นของใบนั้นครบ', () => {
  const rows = sheets.Signatures.getLastRow() - 1;
  assert.ok(rows >= 8, 'ต้องมีลายเซ็นหลายใบจึงจะวัดได้');
  const before = sheets.Signatures.cellsRead;
  const v = ok(post('getSlip', { doc_no: doc }, hk));
  const used = sheets.Signatures.cellsRead - before;
  assert.ok(Object.keys(v.signatures || v.sigs || {}).length >= 3, 'ลายเซ็นของใบนี้ต้องยังอยู่ครบ');
  assert.ok(used < rows * 6, 'อ่าน ' + used + ' เซลล์ ต้องน้อยกว่าอ่านทั้งตาราง ' + rows * 6);
});
t('insert ลง Log/Signatures ไม่ต้องอ่านทั้งตารางก่อนเขียน (และแถวใหม่ยังอยู่ครบ)', () => {
  const Store = run('SheetStore_');
  const st = new Store(ss);
  const logB = sheets.Log.cellsRead, sigB = sheets.Signatures.cellsRead, logRows = sheets.Log.getLastRow();
  const r = st.insert('Log', { at: '2026-11-26T09:00:00+07:00', actor: 'ทดสอบ', role: 'admin', action: 'edit', doc_no: 'X', detail: 'd', notify: 0 });
  st.insert('Signatures', { sig_id: 'SGTEST', doc_no: 'X', role: 'admin', name: 'ทดสอบ', at: '2026-11-26T09:00:00+07:00', png: SIG });
  assert.equal(sheets.Log.cellsRead - logB, 0, 'Log ไม่ควรถูกอ่านตอน insert');
  assert.equal(sheets.Signatures.cellsRead - sigB, 0, 'Signatures ไม่ควรถูกอ่านตอน insert');
  assert.equal(sheets.Log.getLastRow(), logRows + 1);
  assert.equal(r.actor, 'ทดสอบ');
  // โหลดทีหลังต้องเห็นแถวที่เพิ่งเพิ่ม (แคชไม่เพี้ยน)
  assert.ok(st.all('Log').some(x => x.actor === 'ทดสอบ'));
  assert.equal(st.pickSigs(['SGTEST']).SGTEST, SIG);
});
t('login คืนข้อมูลเริ่มต้นมาในครั้งเดียว (ไม่ต้องเรียก bootstrap ซ้ำ)', () => {
  const d = ok(post('login', { role: 'housekeeper', pin: hkPin }));
  assert.equal(d.boot.me.role, 'housekeeper');
  assert.ok(d.boot.items.length > 0 && d.boot.vendors.length > 0);
});

console.log('แคชตาราง');
const dropTableCache = () => Object.keys(cacheData).filter(k => /^[vd]:/.test(k)).forEach(k => delete cacheData[k]);
t('เปิดใบเดิมซ้ำ: เรียกชีตน้อยลงมาก และผลเหมือนกันทุกอย่าง', () => {
  dropTableCache();
  let c = sheetCalls; const a = ok(post('getSlip', { doc_no: doc }, hk)); const cold = sheetCalls - c;
  c = sheetCalls; const b = ok(post('getSlip', { doc_no: doc }, hk)); const warm = sheetCalls - c;
  assert.deepEqual(b, a, 'ผลจากแคชต้องเหมือนอ่านจากชีต');
  assert.ok(warm * 4 <= cold, 'อ่านซ้ำเรียกชีต ' + warm + ' ครั้ง เทียบครั้งแรก ' + cold);
  console.log('      (ครั้งแรก ' + cold + ' ครั้ง → ครั้งต่อไป ' + warm + ' ครั้ง)');
});
t('แก้ข้อมูลแล้วอ่านใหม่ต้องเห็นของใหม่ทันที (ไม่ค้างแคชเก่า)', () => {
  ok(post('getSlip', { doc_no: doc }, adm));                  // อุ่นแคช
  const cur = ok(post('getSlip', { doc_no: doc }, adm));
  const lines = cur.lines.map(l => ({ item_seq: l.item_seq, z: [l.z1, l.z2, l.z3, l.z4, l.z5, l.z6], note: l.note }));
  lines.find(l => l.item_seq === 7).z[5] = 9;
  ok(post('adminEdit', { doc_no: doc, reason: 'ทดสอบแคช', lines }, adm));
  const after = ok(post('getSlip', { doc_no: doc }, adm));
  assert.equal(after.lines.find(l => l.item_seq === 7).z6, 9);
  assert.ok(after.revisions.some(r => r.reason === 'ทดสอบแคช'));
  assert.ok(ok(post('listSlips', {}, hk)).slips.length >= 1);
});
t('ตารางใหญ่แบ่งเป็นหลายชิ้นแล้วประกอบกลับได้ถูกต้อง', () => {
  vm.runInContext('CHUNK = 300', ctx);
  try {
    dropTableCache();
    const a = ok(post('getSlip', { doc_no: doc }, hk));
    assert.ok(Object.keys(cacheData).filter(k => /^d:/.test(k)).some(k => /:[1-9]\d*$/.test(k)), 'ควรมีหลายชิ้น');
    const b = ok(post('getSlip', { doc_no: doc }, hk));
    assert.deepEqual(b, a);
  } finally { vm.runInContext('CHUNK = 30000', ctx); dropTableCache(); }
});
t('แคชหาย/หมดอายุกลางทางก็ยังทำงานถูก (กลับไปอ่านชีต)', () => {
  const a = ok(post('dashboard', {}, adm));
  dropTableCache();
  assert.deepEqual(ok(post('dashboard', {}, adm)).counts, a.counts);
});
t('Users ไม่แคช: เปลี่ยน PIN ในชีตแล้วมีผลทันที', () => {
  const old = sheets.Users.cells['3,3'];
  ok(post('login', { role: 'housekeeper', pin: String(old) }));
  sheets.Users.cells['3,3'] = '654321';
  assert.equal(post('login', { role: 'housekeeper', pin: String(old) }).ok, false);
  ok(post('login', { role: 'housekeeper', pin: '654321' }));
  sheets.Users.cells['3,3'] = old;
});
t('ตอบกลับมีเวลาที่เซิร์ฟเวอร์ใช้ (_ms) ไว้ดูว่าช้าที่ไหน', () => {
  const r = post('bootstrap', {}, hk);
  assert.equal(typeof r._ms, 'number');
});

console.log('\n' + (process.exitCode ? 'มีข้อที่ไม่ผ่าน' : 'ผ่านทั้งหมด ' + pass + ' ข้อ'));
