// ทดสอบตรรกะหลักทั้งวงจร: node tests/flow.test.js
const assert = require('node:assert/strict');
const Core = require('../js/core.js');

let pass = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { console.error('FAIL  ' + name + '\n      ' + (e.stack || e).split('\n').slice(0, 4).join('\n      ')); process.exitCode = 1; }
}

const store = Core.createMemoryStore();
Core.seed(store);
const notes = [];
const env = { notify: n => notes.push(n) };
const call = (action, params, session) => Core.handle(store, { action, params, session }, env);
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r.data; };
const bad = (r, code) => { assert.equal(r.ok, false, 'ควรล้มเหลว'); if (code) assert.equal(r.error, code, r.message); return r; };
// ลายเซ็นจำลอง (PNG data URL ยาวพอผ่านการตรวจ)
const SIG = 'data:image/png;base64,' + 'iVBORw0KGgo'.repeat(40);

console.log('ล็อกอิน / สิทธิ์');
const hk = ok(call('login', { role: 'housekeeper', pin: '222222' })).session;
const adm = ok(call('login', { role: 'admin', pin: '111111' })).session;
t('PIN ผิดถูกปฏิเสธ', () => bad(call('login', { role: 'admin', pin: '000000' }), 'BAD_PIN'));
t('ไม่มี session ถูกปฏิเสธ', () => bad(call('listSlips', {}), 'AUTH'));
t('แม่บ้านเรียกแดชบอร์ดไม่ได้', () => bad(call('dashboard', {}, hk), 'FORBIDDEN'));
t('Admin สร้างใบส่งผ้าไม่ได้ (Admin ใช้มอนิเตอร์)', () => bad(call('saveDraft', {}, adm), 'FORBIDDEN'));
t('ใส่ PIN ผิด 5 ครั้งแล้วล็อก', () => {
  for (let i = 0; i < 4; i++) call('login', { role: 'admin', pin: '999999' });
  bad(call('login', { role: 'admin', pin: '111111' }), 'LOCKED');
  store.kv.remove('lock:admin');
  ok(call('login', { role: 'admin', pin: '111111' }));
});

console.log('สร้างร่าง + ส่งซัก');
const boot = ok(call('bootstrap', {}, hk));
t('bootstrap มี 19 รายการ และ 6 โซน (5 ชั้น + วิลล่า)', () => {
  assert.equal(boot.items.length, 19);
  assert.deepEqual(boot.zones, ['ชั้น 1', 'ชั้น 2', 'ชั้น 3', 'ชั้น 4', 'ชั้น 5', 'วิลล่า']);
  assert.equal(boot.items[0].par, undefined, 'แม่บ้านไม่เห็น par');
});
let slip;
t('บันทึกร่างได้ และรวมยอดถูกต้อง', () => {
  const v = ok(call('saveDraft', {
    header: { vendor_id: 'V1', send_date: Core.todayBKK() },
    lines: [
      { item_seq: 1, z: [3, 2, 0, 4, 1, 0], note: '' },
      { item_seq: 15, z: [10, 10, 10, 10, 10, 2], note: 'มีคราบ 2 ผืน' },
      { item_seq: 7, z: [0, 0, 0, 0, 0, 0], note: '' }
    ]
  }, hk));
  slip = v.slip;
  assert.match(slip.doc_no, /^LN-\d{8}-01$/);
  assert.equal(slip.status, 'draft');
  assert.equal(slip.send_total, 10 + 52);
  assert.equal(v.lines.length, 2, 'แถวที่ว่างไม่ถูกเก็บ');
});
t('ส่งซักไม่ได้ถ้าไม่เซ็น', () => bad(call('sendSlip', { doc_no: slip.doc_no }, hk), 'SIGNATURE'));
t('ส่งซักไม่ได้ถ้าไม่เลือกร้าน', () => {
  const d = ok(call('saveDraft', { header: { vendor_id: '' }, lines: [{ item_seq: 1, z: [1] }] }, hk)).slip;
  bad(call('sendSlip', { doc_no: d.doc_no, signature: SIG }, hk), 'BAD_INPUT');
  ok(call('deleteDraft', { doc_no: d.doc_no }, hk));
});
let token;
t('ส่งซักสำเร็จ → สถานะ sent, มีลิงก์ร้าน, แจ้ง Admin', () => {
  const n0 = notes.length;
  const v = ok(call('sendSlip', { doc_no: slip.doc_no, signature: SIG }, hk));
  assert.equal(v.slip.status, 'sent');
  assert.ok(v.slip.token.length >= 32);
  token = v.slip.token;
  assert.equal(notes.length, n0 + 1);
  assert.match(notes.at(-1).subject, /ส่งซัก/);
  assert.equal(v.lines.every(l => l.agreed_qty === l.qty), true);
});
t('ส่งซักแล้วแก้ไขโดยแม่บ้านไม่ได้', () => {
  bad(call('saveDraft', { doc_no: slip.doc_no, lines: [{ item_seq: 1, z: [9] }] }, hk), 'STATE');
  bad(call('sendSlip', { doc_no: slip.doc_no, signature: SIG }, hk), 'STATE');
  bad(call('deleteDraft', { doc_no: slip.doc_no }, hk), 'STATE');
});

console.log('ร้านซักตรวจนับ');
t('ลิงก์ผิดเข้าไม่ได้', () => { bad(call('vendorGet', { token: 'x' }), 'NOT_FOUND'); bad(call('vendorGet', { token: 'a'.repeat(32) }), 'NOT_FOUND'); });
t('ร้านเห็นเอกสารตามลิงก์ (ไม่มีประวัติแก้ไข/ไม่มีรายละเอียด log)', () => {
  const v = ok(call('vendorGet', { token }));
  assert.equal(v.slip.doc_no, slip.doc_no);
  assert.equal(v.revisions, undefined);
  assert.ok(v.events.every(e => e.detail === ''));
});
t('ร้านกรอกไม่ครบถูกปฏิเสธ', () => bad(call('vendorConfirm', { token, name: 'สมชาย', counts: { 1: 10 }, signature: SIG }), 'BAD_INPUT'));
t('ร้านนับไม่ตรง → dispute + แจ้ง Admin', () => {
  const n0 = notes.length;
  const v = ok(call('vendorConfirm', { token, name: 'สมชาย', counts: { 1: 10, 15: 50 }, signature: SIG }));
  assert.equal(v.slip.status, 'dispute');
  assert.equal(notes.length, n0 + 1);
  assert.match(notes.at(-1).subject, /นับไม่ตรง/);
  assert.match(notes.at(-1).body, /โรงแรมส่ง 52/);
});
t('ยังไม่ตกลงยอดต้องใส่เหตุผล', () => bad(call('resolveDispute', { doc_no: slip.doc_no, agreed: {} }, hk), 'BAD_INPUT'));
t('ตกลงยอด: ยืนยันยอดโรงแรม → confirmed และยอดตกลง = ยอดส่ง', () => {
  const v = ok(call('resolveDispute', { doc_no: slip.doc_no, agreed: { 15: 52 }, reason: 'นับซ้ำร่วมกัน ได้ 52' }, hk));
  assert.equal(v.slip.status, 'confirmed');
  assert.equal(v.slip.agreed_total, 62);
  assert.equal(v.revisions.length, 1);
});

console.log('รับผ้าคืน + ผ้าขาด');
t('รับผ้าโดยไม่กรอกครบถูกปฏิเสธ', () => bad(call('receive', { doc_no: slip.doc_no, lines: [{ item_seq: 1, qty: 10 }], signature: SIG }, hk), 'BAD_INPUT'));
t('ชำรุดมากกว่าที่รับถูกปฏิเสธ', () => bad(call('receive', { doc_no: slip.doc_no, lines: [{ item_seq: 1, qty: 10 }, { item_seq: 15, qty: 5, defect: 6 }], signature: SIG }, hk), 'BAD_INPUT'));
t('รับขาด 4 ผืน (ผ้าเช็ดตัว) + ชำรุด 1 → short + ใบแจ้ง S1', () => {
  const n0 = notes.length;
  const v = ok(call('receive', {
    doc_no: slip.doc_no, receiver_name: 'สมหญิง',
    lines: [{ item_seq: 1, qty: 10 }, { item_seq: 15, qty: 48, defect: 1, note: 'ขอบขาด' }],
    signature: SIG
  }, hk));
  assert.equal(v.slip.status, 'short');
  assert.equal(v.derived.missing_total, 4);
  assert.equal(v.derived.missing[15], 4);
  assert.equal(v.shortages.length, 1);
  assert.equal(v.shortages[0].status, 'open');
  assert.equal(v.shortages[0].lines[0].missing, 4);
  assert.equal(v.shortages[0].lines[0].defect, 1);
  assert.equal(notes.length, n0 + 1);
  assert.match(notes.at(-1).subject, /ขาด/);
});
t('แดชบอร์ด: ผ้าค้างที่ร้าน 4 ชิ้น', () => {
  ok(call('savePar', { pars: { 15: 200, 1: 50 } }, adm));
  const d = ok(call('dashboard', {}, adm));
  assert.equal(d.at_laundry_total, 4);
  const it = d.items.find(i => i.seq === 15);
  assert.equal(it.at_laundry, 4);
  assert.equal(it.short_open, 4);
  assert.equal(it.in_hotel, 196);
  assert.equal(d.counts.short, 1);
  assert.equal(d.issues.length, 1);
  assert.equal(d.feed.length, 4); // ส่งซัก, นับไม่ตรง, ตกลงยอด, ผ้าขาด
});
t('ร้านรับทราบใบแจ้ง (ack) พร้อมวันนัดส่ง', () => {
  const v = ok(call('vendorAck', { token, name: 'สมชาย', note: 'จะตามหา', expect_date: '2099-01-01', signature: SIG }));
  assert.equal(v.shortages[0].status, 'acknowledged');
  bad(call('vendorAck', { token, name: 'สมชาย', signature: SIG }), 'STATE'); // ack ซ้ำไม่ได้
});
t('แม่บ้านปิดงานทั้งที่ผ้าขาดไม่ได้ แต่ Admin ตัดยอดได้ (ต้องใส่เหตุผล)', () => {
  bad(call('closeSlip', { doc_no: slip.doc_no }, hk), 'FORBIDDEN');
  bad(call('closeSlip', { doc_no: slip.doc_no }, adm), 'BAD_INPUT');
});
t('รับผ้าที่ขาดเพิ่ม 3 ผืน → ยังขาด 1 → ใบแจ้งฉบับใหม่ S2 (S1 ถูกแทนที่)', () => {
  const v = ok(call('receive', { doc_no: slip.doc_no, lines: [{ item_seq: 15, qty: 3 }], signature: SIG }, hk));
  assert.equal(v.slip.status, 'short');
  assert.equal(v.derived.missing_total, 1);
  assert.equal(v.shortages.length, 2);
  assert.equal(v.shortages[0].status, 'superseded');
  assert.equal(v.shortages[1].status, 'open');
  assert.equal(v.receipts.length, 2);
  assert.equal(v.receipts[1].kind, 'supplement');
});
t('รับที่เหลืออีก 1 ผืน → ปิดงานอัตโนมัติ', () => {
  const v = ok(call('receive', { doc_no: slip.doc_no, lines: [{ item_seq: 15, qty: 1 }], signature: SIG }, hk));
  assert.equal(v.slip.status, 'closed');
  assert.equal(v.derived.missing_total, 0);
  assert.ok(v.slip.closed_at);
  assert.equal(ok(call('dashboard', {}, adm)).at_laundry_total, 0);
});

console.log('แก้ไขโดย Admin (ต้องมีเหตุผล + เก็บประวัติ)');
t('แก้ไขโดยไม่ใส่เหตุผลไม่ได้', () => bad(call('adminEdit', { doc_no: slip.doc_no, header: { note: 'x' } }, adm), 'BAD_INPUT'));
t('แม่บ้านแก้ไขหลังปิดไม่ได้', () => bad(call('adminEdit', { doc_no: slip.doc_no, reason: 'ทดสอบ', header: { note: 'x' } }, hk), 'FORBIDDEN'));
t('Admin แก้ยอดส่ง + ยอดรับ → บันทึก revision พร้อม diff', () => {
  const before = ok(call('getSlip', { doc_no: slip.doc_no }, adm));
  const lines = before.lines.map(l => ({ item_seq: l.item_seq, z: ZC(l), note: l.note }));
  lines.find(l => l.item_seq === 1).z[1] = 3; // ชั้น 2: 2 → 3
  const rc1 = before.receipts[0];
  const v = ok(call('adminEdit', {
    doc_no: slip.doc_no, reason: 'พิมพ์ผิด ตรวจกับเอกสารกระดาษแล้ว', header: { note: 'แก้ไขโดย admin' }, lines,
    receipts: [{ rcpt_id: rc1.rcpt_id, lines: rc1.lines.map(l => (l.item_seq === 1 ? { item_seq: 1, qty: 11, defect: 0, note: '' } : l)) }]
  }, adm));
  const rev = v.revisions.at(-1);
  assert.equal(rev.kind, 'edit');
  assert.equal(rev.by, 'Admin');
  assert.ok(rev.changes.some(c => c.includes('ชั้น 2: 2 → 3')), JSON.stringify(rev.changes));
  assert.ok(rev.changes.some(c => c.includes('รับ: 10 → 11')), JSON.stringify(rev.changes));
  assert.ok(rev.changes.some(c => c.includes('หมายเหตุเอกสาร')));
  assert.equal(v.slip.send_total, 63);
  assert.equal(v.slip.rev_count, 2); // ตกลงยอด 1 + แก้ไข 1
  assert.match(notes.at(-1).subject, /แก้ไข/);
});
t('แก้โดยไม่มีอะไรเปลี่ยนไม่ได้', () => bad(call('adminEdit', { doc_no: slip.doc_no, reason: 'ทดสอบ', header: { note: 'แก้ไขโดย admin' } }, adm), 'BAD_INPUT'));
function ZC(l) { return [l.z1, l.z2, l.z3, l.z4, l.z5, l.z6]; }

console.log('รับผ้าครบทันที + ยกเลิก + หลายร้าน');
t('รับครบ ไม่มีชำรุด → ปิดงานทันที ไม่มีใบแจ้ง', () => {
  const s = ok(call('sendSlip', { header: { vendor_id: 'V2', send_date: Core.todayBKK() }, lines: [{ item_seq: 2, z: [5, 5] }], signature: SIG }, hk));
  assert.match(s.slip.doc_no, /-02$/);
  const tk = s.slip.token;
  const c = ok(call('vendorConfirm', { token: tk, name: 'มาลี', counts: { 2: 10 }, signature: SIG }));
  assert.equal(c.slip.status, 'confirmed');
  const r = ok(call('receive', { doc_no: s.slip.doc_no, lines: [{ item_seq: 2, qty: 10 }], signature: SIG }, hk));
  assert.equal(r.slip.status, 'closed');
  assert.equal(r.shortages.length, 0);
});
t('รับเกินจากที่ส่งถูกบันทึกเป็น excess (ไม่ใช่ขาด)', () => {
  const s = ok(call('sendSlip', { header: { vendor_id: 'V1', send_date: Core.todayBKK() }, lines: [{ item_seq: 3, z: [2] }], signature: SIG }, hk));
  const r = ok(call('receive', { doc_no: s.slip.doc_no, lines: [{ item_seq: 3, qty: 3 }], signature: SIG }, hk));
  assert.equal(r.derived.excess_total, 1);
  assert.equal(r.slip.status, 'closed');
});
t('ชำรุดอย่างเดียว (ไม่ขาด) → ออกใบแจ้ง และแม่บ้านปิดงานเองได้', () => {
  const s = ok(call('sendSlip', { header: { vendor_id: 'V1', send_date: Core.todayBKK() }, lines: [{ item_seq: 4, z: [4] }], signature: SIG }, hk));
  const r = ok(call('receive', { doc_no: s.slip.doc_no, lines: [{ item_seq: 4, qty: 4, defect: 2, note: 'คราบเหลือง' }], signature: SIG }, hk));
  assert.equal(r.slip.status, 'short');
  assert.equal(r.derived.missing_total, 0);
  assert.equal(r.shortages[0].lines[0].defect, 2);
  assert.equal(ok(call('closeSlip', { doc_no: s.slip.doc_no }, hk)).slip.status, 'closed');
});
t('Admin ตัดยอดผ้าขาด (write-off) พร้อมเหตุผล', () => {
  const s = ok(call('sendSlip', { header: { vendor_id: 'V1', send_date: Core.todayBKK() }, lines: [{ item_seq: 5, z: [6] }], signature: SIG }, hk));
  ok(call('receive', { doc_no: s.slip.doc_no, lines: [{ item_seq: 5, qty: 5 }], signature: SIG }, hk));
  const v = ok(call('closeSlip', { doc_no: s.slip.doc_no, reason: 'ร้านชดเชยเป็นเงินแล้ว' }, adm));
  assert.equal(v.slip.status, 'closed');
  assert.equal(v.revisions.at(-1).kind, 'close');
});
t('ยกเลิกเอกสารต้องมีเหตุผล และเก็บ revision', () => {
  const s = ok(call('sendSlip', { header: { vendor_id: 'V1', send_date: Core.todayBKK() }, lines: [{ item_seq: 6, z: [1] }], signature: SIG }, hk));
  bad(call('voidSlip', { doc_no: s.slip.doc_no, reason: '' }, adm), 'BAD_INPUT');
  const v = ok(call('voidSlip', { doc_no: s.slip.doc_no, reason: 'ส่งผิดร้าน' }, adm));
  assert.equal(v.slip.status, 'void');
  bad(call('receive', { doc_no: s.slip.doc_no, lines: [], signature: SIG }, hk), 'STATE');
  assert.equal(ok(call('dashboard', {}, adm)).counts.void, 1);
});
t('listSlips กรองตามสถานะ/ค้นหาได้', () => {
  const all = ok(call('listSlips', {}, hk)).slips;
  assert.ok(all.length >= 6);
  assert.equal(ok(call('listSlips', { status: 'void' }, hk)).slips.length, 1);
  assert.equal(ok(call('listSlips', { q: 'กาญจน์' }, hk)).slips.every(s => s.vendor_name.includes('กาญจน์')), true);
});
t('ตั้งค่า: เพิ่มร้านซัก / อีเมล Admin / อีเมลผิดรูปแบบถูกปฏิเสธ', () => {
  const id = ok(call('saveVendor', { name: 'ร้านใหม่', email: 'a@b.co' }, adm)).id;
  assert.equal(id, 'V3');
  assert.equal(ok(call('bootstrap', {}, hk)).vendors.length, 3);
  ok(call('saveVendor', { id, name: 'ร้านใหม่', active: 0 }, adm));
  assert.equal(ok(call('bootstrap', {}, hk)).vendors.length, 2);
  bad(call('saveConfig', { admin_email: 'ไม่ใช่อีเมล' }, adm), 'BAD_INPUT');
  ok(call('saveConfig', { admin_email: 'boss@example.com', overdue_days: 7 }, adm));
  assert.equal(Core.cfg(store).admin_email, 'boss@example.com');
});
t('Log เป็น append-only และทุกเหตุการณ์สำคัญมี notify', () => {
  const log = store.all('Log');
  assert.ok(log.length > 20);
  ['send', 'vendor_dispute', 'resolve_dispute', 'receive_short', 'vendor_ack', 'receive_supp', 'admin_edit', 'void', 'close'].forEach(a =>
    assert.ok(log.some(l => l.action === a && l.notify === 1), 'ไม่มี notify: ' + a));
});


console.log('เก็บผ้ารายวัน → รวมยอดสะสม → ใบส่งผ้า');
const colNos = [];
const L = (seq, z) => ({ item_seq: seq, z, note: '' });
t('Admin เก็บผ้าไม่ได้ / ไม่เซ็นไม่ได้ / ไม่มีผ้าไม่ได้', () => {
  bad(call('saveCollection', { lines: [L(1, [1])], signature: SIG }, adm), 'FORBIDDEN');
  bad(call('saveCollection', { lines: [L(1, [1])] }, hk), 'SIGNATURE');
  bad(call('saveCollection', { lines: [L(1, [0])], signature: SIG }, hk), 'BAD_INPUT');
  bad(call('saveCollection', { col_date: '25/11/2026', lines: [L(1, [1])], signature: SIG }, hk), 'BAD_INPUT');
});
t('เก็บผ้า 3 รอบ (คนละวัน) → เลขที่เอกสารถูกต้อง + แจ้ง Admin ทุกครั้ง', () => {
  const n0 = notes.length;
  const a = ok(call('saveCollection', { col_date: '2026-11-20', rooms: '101, 102, 105', lines: [L(1, [2, 0, 0, 0, 0, 0]), L(15, [6, 0, 0, 0, 0, 0])], signature: SIG }, hk));
  const b = ok(call('saveCollection', { col_date: '2026-11-20', rooms: '203', lines: [L(15, [0, 3, 0, 0, 0, 0])], signature: SIG }, hk));
  const c = ok(call('saveCollection', { col_date: '2026-11-21', rooms: 'วิลล่า', lines: [L(1, [0, 0, 0, 0, 0, 2]), L(16, [0, 0, 0, 0, 0, 4])], signature: SIG }, hk));
  [a, b, c].forEach(v => colNos.push(v.col.col_no));
  assert.deepEqual(colNos, ['CL-20261120-01', 'CL-20261120-02', 'CL-20261121-01']);
  assert.equal(a.col.total, 8); assert.equal(a.col.status, 'pending');
  assert.equal(notes.length, n0 + 3);
  assert.match(notes.at(-1).subject, /เก็บผ้ารายวัน/);
});
t('pendingCollections รวมยอดสะสมถูกต้อง', () => {
  const p = ok(call('pendingCollections', {}, hk));
  assert.equal(p.count, 3); assert.equal(p.total, 8 + 3 + 6);
  assert.equal(p.by_item[1], 4); assert.equal(p.by_item[15], 9); assert.equal(p.by_item[16], 4);
  assert.deepEqual(p.by_zone, [8, 3, 0, 0, 0, 6]);
  assert.equal(p.oldest, '2026-11-20');
  assert.equal(p.cols[0].lines.length, 2);
});
t('แดชบอร์ด Admin เห็นผ้าสะสมรอส่ง', () => {
  const d = ok(call('dashboard', {}, adm));
  assert.equal(d.pending.total, 17); assert.equal(d.pending.count, 3);
  assert.equal(d.items.find(i => i.seq === 15).pending, 9);
});
let slip2;
t('ใบเก็บผ้าที่ไม่มีอยู่/ยกเลิกแล้ว เลือกใช้ไม่ได้', () => {
  bad(call('saveDraft', { header: { vendor_id: 'V1' }, lines: [L(1, [1])], collection_ids: ['CL-NOPE'] }, hk), 'BAD_INPUT');
});
t('ส่งซักโดยรวมยอดสะสม (นับจริงน้อยกว่าสะสม 1 ชิ้น) → ปิดใบเก็บผ้า + log เตือนยอดต่าง', () => {
  const v = ok(call('sendSlip', {
    header: { vendor_id: 'V1', send_date: '2026-11-22' }, collection_ids: colNos,
    lines: [L(1, [2, 0, 0, 0, 0, 2]), L(15, [6, 2, 0, 0, 0, 0]), L(16, [0, 0, 0, 0, 0, 4])], signature: SIG
  }, hk));
  slip2 = v.slip.doc_no;
  assert.equal(v.slip.status, 'sent'); assert.equal(v.slip.send_total, 16);
  assert.equal(v.collections.length, 3);
  const acc = {}; v.lines.forEach(l => { acc[l.item_seq] = l.acc_qty; });
  assert.deepEqual(acc, { 1: 4, 15: 9, 16: 4 });
  assert.match(notes.at(-1).body, /ยอดส่งจริงต่างจากยอดสะสม: สะสม 17 \/ ส่งจริง 16/);
  const cols = ok(call('listCollections', {}, hk)).collections.filter(c => colNos.indexOf(c.col_no) >= 0);
  assert.ok(cols.every(c => c.status === 'sent' && c.doc_no === slip2));
  assert.equal(ok(call('pendingCollections', {}, hk)).count, 0);
});
t('ผ้าสะสมที่ถูกส่งแล้วนำไปใช้ซ้ำไม่ได้', () => {
  bad(call('sendSlip', { header: { vendor_id: 'V1', send_date: '2026-11-22' }, collection_ids: [colNos[0]], lines: [L(1, [2])], signature: SIG }, hk), 'STATE');
});
t('ยอดสะสมที่ไม่ได้ส่ง (นับจริงเป็น 0) ยังเก็บไว้เทียบในใบส่งผ้า', () => {
  const c = ok(call('saveCollection', { rooms: '305', lines: [L(3, [0, 0, 5, 0, 0, 0])], signature: SIG }, hk));
  const d = ok(call('saveDraft', { header: { vendor_id: 'V2' }, collection_ids: [c.col.col_no], lines: [] }, hk));
  assert.equal(d.slip.send_total, 0);
  assert.equal(d.lines.length, 1); assert.equal(d.lines[0].acc_qty, 5); assert.equal(d.lines[0].qty, 0);
  bad(call('sendSlip', { doc_no: d.slip.doc_no, signature: SIG }, hk), 'BAD_INPUT'); // ส่ง 0 ชิ้นไม่ได้
  ok(call('deleteDraft', { doc_no: d.slip.doc_no }, hk));
  assert.equal(ok(call('pendingCollections', {}, hk)).count, 1, 'ลบร่างแล้วใบเก็บผ้ากลับมารอส่ง');
});
t('ร่างสองใบใช้ใบเก็บผ้าเดียวกัน — ใบแรกส่งได้ ใบที่สองถูกปฏิเสธ', () => {
  const pend = ok(call('pendingCollections', {}, hk)).cols[0].col_no;
  const d1 = ok(call('saveDraft', { header: { vendor_id: 'V1' }, collection_ids: [pend], lines: [L(3, [0, 0, 5])] }, hk)).slip.doc_no;
  const d2 = ok(call('saveDraft', { header: { vendor_id: 'V2' }, collection_ids: [pend], lines: [L(3, [0, 0, 5])] }, hk)).slip.doc_no;
  ok(call('sendSlip', { doc_no: d1, signature: SIG }, hk));
  bad(call('sendSlip', { doc_no: d2, signature: SIG }, hk), 'STATE');
  ok(call('voidSlip', { doc_no: d1, reason: 'ทดสอบคืนยอดสะสม' }, adm));
  assert.equal(ok(call('pendingCollections', {}, hk)).count, 1, 'ยกเลิกใบส่งผ้า → ใบเก็บผ้ากลับมารอส่ง');
  const rev = ok(call('getSlip', { doc_no: d1 }, adm)).revisions.at(-1);
  assert.ok(rev.changes.some(x => x.includes('กลับไปสถานะรอส่งซัก')));
  ok(call('deleteDraft', { doc_no: d2 }, hk));
});
t('Admin แก้ใบเก็บผ้าที่ยังรอส่ง (ต้องมีเหตุผล + เก็บ revision) แต่ใบที่ส่งแล้วแก้ไม่ได้', () => {
  const col = ok(call('pendingCollections', {}, hk)).cols[0].col_no;
  bad(call('adminEditCollection', { col_no: col, lines: [L(3, [0, 0, 6])] }, adm), 'BAD_INPUT');
  bad(call('adminEditCollection', { col_no: col, reason: 'ทดสอบ', lines: [L(3, [0, 0, 5])] }, adm), 'BAD_INPUT'); // ไม่เปลี่ยน
  bad(call('adminEditCollection', { col_no: col, reason: 'ทดสอบ', lines: [L(3, [0, 0, 6])] }, hk), 'FORBIDDEN');
  const v = ok(call('adminEditCollection', { col_no: col, reason: 'นับผิด ตรวจกับกระดาษแล้ว', header: { rooms: '305, 306' }, lines: [L(3, [0, 0, 6])] }, adm));
  assert.equal(v.col.total, 6); assert.equal(v.revisions.length, 1);
  assert.ok(v.revisions[0].changes.some(x => x.includes('ชั้น 3: 5 → 6')));
  assert.match(notes.at(-1).subject, /แก้ไขใบเก็บผ้า/);
  bad(call('adminEditCollection', { col_no: colNos[0], reason: 'ทดสอบ', lines: [L(1, [9])] }, adm), 'STATE');
  bad(call('voidCollection', { col_no: colNos[0], reason: 'ทดสอบ' }, adm), 'STATE');
});
t('Admin ยกเลิกใบเก็บผ้า → ไม่ถูกนับในยอดสะสม', () => {
  const col = ok(call('pendingCollections', {}, hk)).cols[0].col_no;
  bad(call('voidCollection', { col_no: col, reason: '' }, adm), 'BAD_INPUT');
  const v = ok(call('voidCollection', { col_no: col, reason: 'บันทึกซ้ำ' }, adm));
  assert.equal(v.col.status, 'void');
  assert.equal(ok(call('pendingCollections', {}, hk)).count, 0);
  assert.equal(ok(call('dashboard', {}, adm)).pending.total, 0);
});
t('ผ้าสะสมไม่กระทบยอด "อยู่ที่ร้านซัก" จนกว่าจะส่ง', () => {
  const d = ok(call('dashboard', {}, adm));
  assert.equal(d.at_laundry_total, 16, 'มีเฉพาะใบ ' + slip2 + ' (16 ชิ้น) ที่ส่งแล้ว');
});

console.log('\n' + (process.exitCode ? 'มีข้อที่ไม่ผ่าน' : 'ผ่านทั้งหมด ' + pass + ' ข้อ'));
