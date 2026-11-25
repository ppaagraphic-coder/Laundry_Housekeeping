// ทดสอบรายงานสรุป รายวัน/เดือน/ปี : node tests/report.test.js
const assert = require('node:assert/strict');
const Core = require('../js/core.js');
let pass = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { console.error('FAIL  ' + name + '\n      ' + (e.stack || e).split('\n').slice(0, 5).join('\n      ')); process.exitCode = 1; } }

const store = Core.createMemoryStore();
Core.seed(store);
const call = (action, params, session) => Core.handle(store, { action, params, session }, {});
const ok = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.data; };
const SIG = 'data:image/png;base64,' + 'iVBORw0KGgo'.repeat(40);
const hk = ok(call('login', { role: 'housekeeper', pin: '222222' })).session;
const adm = ok(call('login', { role: 'admin', pin: '111111' })).session;
const L = (seq, z) => ({ item_seq: seq, z, note: '' });
const today = Core.todayBKK();

// ---- ข้อมูลทดสอบ (วันที่ในอดีตคงที่ เพื่อให้ผลตายตัว) ----
const c1 = ok(call('saveCollection', { col_date: '2025-03-10', lines: [L(1, [3]), L(15, [5])], signature: SIG }, hk)).col.col_no;
const c2 = ok(call('saveCollection', { col_date: '2025-03-11', lines: [L(15, [0, 4])], signature: SIG }, hk)).col.col_no;
const c3 = ok(call('saveCollection', { col_date: '2025-04-05', lines: [L(1, [2])], signature: SIG }, hk)).col.col_no;
// ใบ A: รวมสะสม 2 ใบ (item15 สะสม 9 แต่ส่งจริง 8 → ยอดต่าง)
const A = ok(call('sendSlip', { header: { vendor_id: 'V1', send_date: '2025-03-11' }, collection_ids: [c1, c2], lines: [L(1, [3]), L(15, [8])], signature: SIG }, hk));
ok(call('vendorConfirm', { token: A.slip.token, name: 'ร้าน', counts: { 1: 3, 15: 8 }, signature: SIG }));
// รับคืนวันที่ 13 มี.ค.: item15 รับ 7 (ขาด 1) ชำรุด 1
ok(call('receive', { doc_no: A.slip.doc_no, receive_date: '2025-03-13', lines: [{ item_seq: 1, qty: 3 }, { item_seq: 15, qty: 7, defect: 1, note: 'ขอบขาด' }], signature: SIG }, hk));
// ใบ B: ร้านนับไม่ตรง → ตกลงยอด → รับครบ
const B = ok(call('sendSlip', { header: { vendor_id: 'V2', send_date: '2025-04-06' }, collection_ids: [c3], lines: [L(1, [2]), L(16, [5])], signature: SIG }, hk));
ok(call('vendorConfirm', { token: B.slip.token, name: 'ร้าน2', counts: { 1: 2, 16: 4 }, signature: SIG }));
ok(call('resolveDispute', { doc_no: B.slip.doc_no, agreed: { 16: 5 }, reason: 'นับซ้ำ' }, hk));
ok(call('receive', { doc_no: B.slip.doc_no, receive_date: '2025-04-08', lines: [{ item_seq: 1, qty: 2 }, { item_seq: 16, qty: 5 }], signature: SIG }, hk));
ok(call('adminEdit', { doc_no: B.slip.doc_no, reason: 'แก้หมายเหตุ', header: { note: 'ตรวจแล้ว' } }, adm));
const R = (type, key) => ok(call('report', { type, key }, adm));
const row = (r, seq) => r.items.find(i => i.seq === seq);

console.log('สิทธิ์ / ค่าที่ไม่ถูกต้อง');
t('แม่บ้านเปิดรายงานไม่ได้', () => assert.equal(call('report', { type: 'day' }, hk).error, 'FORBIDDEN'));
t('ประเภท/รูปแบบวันที่ผิดถูกปฏิเสธ', () => {
  assert.equal(call('report', { type: 'week' }, adm).error, 'BAD_INPUT');
  assert.equal(call('report', { type: 'day', key: '10/03/2025' }, adm).error, 'BAD_INPUT');
  assert.equal(call('report', { type: 'month', key: '2025-13' }, adm).error, 'BAD_INPUT');
  assert.equal(call('report', { type: 'year', key: '25' }, adm).error, 'BAD_INPUT');
});
t('ค่าเริ่มต้น: ไม่ใส่ key = วันนี้/เดือนนี้/ปีนี้', () => {
  assert.equal(R('day').key, today); assert.equal(R('month').key, today.slice(0, 7)); assert.equal(R('year').key, today.slice(0, 4));
});

console.log('รายวัน');
t('10 มี.ค.: เก็บผ้า 8 ชิ้น 1 ใบ ยังไม่ส่ง/รับ', () => {
  const r = R('day', '2025-03-10');
  assert.equal(r.totals.collected, 8); assert.equal(row(r, 15).collected, 5); assert.equal(row(r, 1).collected, 3);
  assert.equal(r.counts.collections, 1); assert.equal(r.counts.sends, 0); assert.equal(r.counts.receipts, 0);
  assert.equal(r.errors.total, 0); assert.equal(r.trend, null);
});
t('11 มี.ค.: เก็บ 4 + ส่งซัก 11 ชิ้น 1 ครั้ง + ข้อผิดพลาด "ยอดส่งต่างจากยอดสะสม"', () => {
  const r = R('day', '2025-03-11');
  assert.equal(r.totals.collected, 4); assert.equal(r.totals.sent, 11); assert.equal(r.counts.sends, 1);
  assert.equal(row(r, 15).sent, 8);
  const e = r.errors.list.filter(x => x.type === 'acc_diff');
  assert.equal(e.length, 1); assert.equal(e[0].doc_no, A.slip.doc_no); assert.match(e[0].detail, /สะสม 12 ชิ้น \/ ส่งจริง 11/);
});
t('13 มี.ค.: รับคืน 10 ชิ้น 1 ครั้ง ชำรุด 1 + ข้อผิดพลาดชำรุด', () => {
  const r = R('day', '2025-03-13');
  assert.equal(r.totals.received, 10); assert.equal(r.counts.receipts, 1); assert.equal(r.totals.defect, 1);
  assert.equal(r.errors.types.find(x => x.type === 'defect').count, 1);
  assert.match(r.errors.list[0].detail, /ผ้าขนหนูเช็ดตัว/);
});
t('วันนี้: ผ้าขาด 1 ชิ้น (ตอนพบ), ร้านนับไม่ตรง, Admin แก้ไข — แยกประเภทถูก', () => {
  const r = R('day', today);
  const c = {}; r.errors.types.forEach(x => { c[x.type] = x.count; });
  assert.equal(c.short, 1); assert.equal(c.dispute, 1); assert.equal(c.edit, 1);
  assert.equal(row(r, 15).missing, 1); assert.equal(r.totals.missing, 1);
  assert.equal(r.errors.total, 3);
  assert.ok(r.errors.list.every(x => x.label && x.doc_no));
});

console.log('รายเดือน');
t('มี.ค. 2025: รวมทั้งเดือน + แนวโน้มรายวัน 31 วัน + สะสมรายวัน', () => {
  const r = R('month', '2025-03');
  assert.equal(r.totals.collected, 12); assert.equal(r.totals.sent, 11); assert.equal(r.totals.received, 10); assert.equal(r.totals.defect, 1);
  assert.equal(r.counts.collections, 2); assert.equal(r.counts.sends, 1); assert.equal(r.counts.receipts, 1);
  assert.equal(r.trend.length, 31);
  const d11 = r.trend.find(x => x.key === '2025-03-11'), d13 = r.trend.find(x => x.key === '2025-03-13'), d31 = r.trend[30];
  assert.equal(d11.sent, 11); assert.equal(d11.errors, 1); assert.equal(d13.received, 10);
  assert.equal(d31.cum_sent, 11); assert.equal(d31.cum_receipts, 1); assert.equal(d31.cum_errors, 2);
});
t('เม.ย. 2025: เดือนนี้ + สะสมตั้งแต่ต้นปี (ytd)', () => {
  const r = R('month', '2025-04');
  assert.equal(r.counts.sends, 1); assert.equal(r.counts.receipts, 1); assert.equal(r.totals.sent, 7); assert.equal(r.totals.received, 7);
  assert.equal(r.trend.length, 30);
  assert.equal(r.ytd_counts.sends, 2); assert.equal(r.ytd_counts.receipts, 2); assert.equal(r.ytd_counts.collections, 3);
  assert.equal(row(r, 15).ytd_sent, 8); assert.equal(row(r, 1).ytd_sent, 5); assert.equal(row(r, 16).ytd_sent, 5);
  assert.equal(row(r, 15).sent, 0, 'ยอดเดือนนี้ไม่รวมของเดือนก่อน');
  assert.equal(r.totals.ytd_sent, 18);
  assert.equal(row(r, 15).ytd_problem, 1 /* ชำรุด 1 */, 'ytd_problem = ขาด + ชำรุด สะสมต้นปี (ขาดเกิดวันนี้ จึงยังไม่นับ)');
  assert.equal(r.errors.ytd_total >= 2, true); // acc_diff + defect ของ มี.ค. อยู่ใน ytd
  assert.equal(r.errors.types.find(x => x.type === 'defect').count, 0);
  assert.equal(r.errors.types.find(x => x.type === 'defect').ytd, 1);
});
t('เดือนอายุ 28/29/30 วัน คำนวณวันท้ายเดือนถูก', () => {
  assert.equal(R('month', '2025-02').trend.length, 28); assert.equal(R('month', '2024-02').trend.length, 29); assert.equal(R('month', '2025-06').trend.length, 30);
});

console.log('รายปี');
t('2025: รวมทั้งปี + แนวโน้มรายเดือน 12 เดือน + สะสม', () => {
  const r = R('year', '2025');
  assert.equal(r.totals.collected, 14); assert.equal(r.totals.sent, 18); assert.equal(r.totals.received, 17);
  assert.equal(r.counts.sends, 2); assert.equal(r.counts.receipts, 2); assert.equal(r.counts.collections, 3);
  assert.equal(r.trend.length, 12);
  assert.equal(r.trend[2].sent, 11); assert.equal(r.trend[3].sent, 7); assert.equal(r.trend[3].cum_sent, 18); assert.equal(r.trend[11].cum_sends, 2);
  assert.equal(r.trend[1].sent, 0);
  assert.equal(r.ytd_counts, null);
  // ใบ A (สะสม 12 / ส่ง 11) และใบ B (ส่งรายการ 16 ที่ไม่เคยเก็บผ้าไว้) = 2 ครั้ง
  assert.equal(r.errors.types.find(x => x.type === 'acc_diff').count, 2);
});
t('ปีที่ไม่มีข้อมูล: ศูนย์ทั้งหมด ไม่ error', () => {
  const r = R('year', '2019');
  assert.equal(r.totals.sent, 0); assert.equal(r.errors.total, 0); assert.equal(r.trend.length, 12); assert.equal(r.items.length, 19);
});
t('ใบที่ยกเลิกไม่ถูกนับ และผ้าสะสมที่ยกเลิกไม่ถูกนับ', () => {
  const x = ok(call('sendSlip', { header: { vendor_id: 'V1', send_date: '2024-01-05' }, lines: [L(2, [9])], signature: SIG }, hk));
  assert.equal(R('year', '2024').totals.sent, 9);
  ok(call('voidSlip', { doc_no: x.slip.doc_no, reason: 'ส่งผิด' }, adm));
  assert.equal(R('year', '2024').totals.sent, 0);
  const cc = ok(call('saveCollection', { col_date: '2024-01-06', lines: [L(3, [4])], signature: SIG }, hk)).col.col_no;
  assert.equal(R('day', '2024-01-06').totals.collected, 4);
  ok(call('voidCollection', { col_no: cc, reason: 'ซ้ำ' }, adm));
  assert.equal(R('day', '2024-01-06').totals.collected, 0);
  assert.equal(R('day', today).errors.types.find(e => e.type === 'void').count, 2, 'การยกเลิกเอกสารนับเป็นข้อผิดพลาดของวันนั้น');
});
console.log('\n' + (process.exitCode ? 'มีข้อที่ไม่ผ่าน' : 'ผ่านทั้งหมด ' + pass + ' ข้อ'));
