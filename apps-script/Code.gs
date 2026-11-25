/**
 * Code.gs — ตัวเชื่อม Google Sheet สำหรับระบบติดตามผ้าซัก
 *
 * วางสคริปต์นี้ในไฟล์ Google Sheet ที่ต้องการใช้เป็นฐานข้อมูล (Extensions → Apps Script)
 * ต้องมีไฟล์ Core.gs (คัดลอกจาก js/core.js) อยู่ในโปรเจ็กต์เดียวกัน
 *
 * ขั้นตอน: รันฟังก์ชัน setup() หนึ่งครั้ง → Deploy เป็น Web app (Execute as: Me, Who has access: Anyone)
 * รายละเอียดอยู่ใน README.md
 */

var TIMEZONE = 'Asia/Bangkok';
// คำสั่งที่ "อ่านอย่างเดียว" ไม่ต้องล็อกคิว (คำสั่งอื่นจะเข้าคิวทีละคำสั่งเพื่อกันข้อมูลชนกัน)
var READ_ONLY = { bootstrap: 1, listSlips: 1, getSlip: 1, vendorGet: 1, dashboard: 1, login: 1, logout: 1, report: 1, listCollections: 1, getCollection: 1, pendingCollections: 1 };

// แคชตาราง (CacheService): อ่านเร็วกว่าอ่านชีตมาก ล้างทันทีที่แอปเขียนตารางนั้น
// หมายเหตุ: ถ้าแก้ข้อมูลในชีตด้วยมือโดยตรง เว็บจะเห็นการเปลี่ยนแปลงภายใน CACHE_TTL วินาที (Users ไม่แคช จึงเปลี่ยน PIN ได้ทันที)
var CACHE_TTL = 300;
var CHUNK = 30000;       // ตัวอักษรต่อชิ้น (ไทย 3 ไบต์/ตัว → ไม่เกินเพดาน 100KB ต่อค่า)
var MAX_CHUNKS = 40;     // ตารางใหญ่เกินนี้ไม่แคช (อ่านจากชีตตรงๆ)
var NO_CACHE = { Users: 1, Signatures: 1 };

// ---------------------------------------------------------------- Web app
function doGet() {
  return json_({ ok: true, name: 'linen-tracker', version: Core.VERSION });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'BAD_REQUEST', message: 'ข้อมูลที่ส่งมาไม่ถูกต้อง' });
  }
  var lock = null;
  var store = null;
  var t0 = Date.now();
  try {
    if (!READ_ONLY[req.action]) {
      lock = LockService.getScriptLock();
      lock.waitLock(25000);
    }
    store = new SheetStore_(SpreadsheetApp.getActiveSpreadsheet());
    var res = Core.handle(store, req, { notify: notifyAdmin_, mail: sendMail_ });
    store.flush();
    res._ms = Date.now() - t0;
    return json_(res);
  } catch (err) {
    return json_({ ok: false, error: 'SERVER', message: 'ระบบขัดข้อง: ' + (err && err.message ? err.message : err) });
  } finally {
    if (store) { try { store.invalidate(); } catch (e2) { /* แคชเป็นส่วนเสริม */ } }
    if (lock) lock.releaseLock();
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- แจ้งเตือนทางอีเมล
function notifyAdmin_(n) {
  if (!n.admin_email) return;
  MailApp.sendEmail({ to: n.admin_email, subject: n.subject, body: n.body, name: 'ระบบติดตามผ้าซัก' });
}
function sendMail_(m) {
  MailApp.sendEmail({ to: m.to, subject: m.subject, body: m.body, name: 'ระบบติดตามผ้าซัก' });
}

// ---------------------------------------------------------------- ที่เก็บข้อมูลใน Google Sheet
function SheetStore_(ss) {
  this.ss = ss;
  this.cache = {};   // table -> { rows: [obj], idx: [sheetRow] }
  this.dirty = {};   // table -> { sheetRow: true }
  this.touched = {}; // ตารางที่คำสั่งนี้เขียน (ใช้ล้างแคชตอนจบ)
  this.sigMemo = {}; // ภาพลายเซ็นที่รู้แล้วในคำสั่งนี้ (ไม่ต้องอ่านซ้ำ)
  this.lastRow = {}; // เลขแถวสุดท้ายที่เขียนเอง (ไม่ต้องถาม getLastRow ซ้ำ)
  var self = this;
  this.kv = {
    get: function (k) { return CacheService.getScriptCache().get(k); },
    put: function (k, v, ttl) { CacheService.getScriptCache().put(k, String(v), Math.min(ttl || 21600, 21600)); },
    remove: function (k) { CacheService.getScriptCache().remove(k); }
  };
  this.sheet_ = function (t) {
    var sh = self.ss.getSheetByName(t);
    if (!sh) throw new Error('ไม่พบแท็บ "' + t + '" — ให้รัน setup() ก่อน');
    return sh;
  };
}

SheetStore_.prototype.cols_ = function (t) { return Core.SCHEMA[t].map(function (c) { return c[0]; }); };

function cacheSvc_() { return CacheService.getScriptCache(); }

// เลขเวอร์ชันของแต่ละตาราง (เปลี่ยนทุกครั้งที่เขียน → แคชเก่าใช้ไม่ได้ทันที)
SheetStore_.prototype.versions_ = function () {
  if (this.ver) return this.ver;
  var tables = Object.keys(Core.SCHEMA).filter(function (t) { return !NO_CACHE[t]; });
  var got = cacheSvc_().getAll(tables.map(function (t) { return 'v:' + t; })) || {};
  var ver = {}, put = {}, any = false;
  tables.forEach(function (t) {
    var v = got['v:' + t];
    if (!v) { v = Utilities.getUuid().slice(0, 8); put['v:' + t] = v; any = true; }
    ver[t] = v;
  });
  if (any) cacheSvc_().putAll(put, 21600);
  this.ver = ver;
  return ver;
};

SheetStore_.prototype.cacheGet_ = function (t) {
  if (NO_CACHE[t]) return null;
  try {
    var base = 'd:' + t + ':' + this.versions_()[t] + ':';
    var svc = cacheSvc_();
    var first = svc.get(base + '0');
    if (!first) return null;
    var bar = first.indexOf('|');
    var n = Number(first.slice(0, bar));
    var parts = [first.slice(bar + 1)];
    if (n > 1) {
      var keys = [];
      for (var i = 1; i < n; i++) keys.push(base + i);
      var got = svc.getAll(keys) || {};
      for (var j = 1; j < n; j++) {
        if (got[base + j] === undefined || got[base + j] === null) return null;
        parts.push(got[base + j]);
      }
    }
    var o = JSON.parse(parts.join(''));
    return { rows: o.r, idx: o.i };
  } catch (e) { return null; }
};

SheetStore_.prototype.cachePut_ = function (t, c, ver) {
  if (NO_CACHE[t]) return;
  try {
    var s = JSON.stringify({ r: c.rows, i: c.idx });
    var n = Math.max(1, Math.ceil(s.length / CHUNK));
    if (n > MAX_CHUNKS) return;
    var base = 'd:' + t + ':' + ver + ':';
    var put = {};
    for (var i = 0; i < n; i++) {
      var part = s.slice(i * CHUNK, (i + 1) * CHUNK);
      put[base + i] = i === 0 ? n + '|' + part : part;
    }
    cacheSvc_().putAll(put, CACHE_TTL);
  } catch (e) { /* แคชเต็ม/ผิดพลาด: ข้ามไป ระบบยังทำงานปกติจากชีต */ }
};

// ทำเครื่องหมายตารางที่ถูกเขียน แล้วเปลี่ยนเวอร์ชันตอนท้ายคำสั่ง (เรียกเสมอ แม้คำสั่งล้มเหลวกลางทาง)
SheetStore_.prototype.touch_ = function (t) { this.touched[t] = 1; };
SheetStore_.prototype.invalidate = function () {
  if (this.touched.Signatures) {
    var sp = {}, self = this;
    Object.keys(this.sigMemo).forEach(function (id) { if (self.sigMemo[id]) sp['sig:' + id] = self.sigMemo[id]; });
    try { if (Object.keys(sp).length) cacheSvc_().putAll(sp, 3600); } catch (e) { /* ข้าม */ }
  }
  var put = {}, any = false;
  for (var t in this.touched) {
    if (NO_CACHE[t]) continue;
    put['v:' + t] = Utilities.getUuid().slice(0, 8);
    any = true;
  }
  this.touched = {};
  if (any) cacheSvc_().putAll(put, 21600);
};

SheetStore_.prototype.load_ = function (t) {
  if (this.cache[t]) return this.cache[t];
  // ตารางที่คำสั่งนี้เพิ่งเขียน ต้องอ่านจากชีตเสมอ (เวอร์ชันแคชเพิ่งเปลี่ยนตอนท้ายคำสั่ง จึงยังชี้ข้อมูลเก่า)
  var written = !!(this.touched && this.touched[t]);
  var hit = written ? null : this.cacheGet_(t);
  if (hit) { this.cache[t] = hit; return hit; }
  var verAtRead = (NO_CACHE[t] || written) ? null : this.versions_()[t];   // อ่านเวอร์ชันก่อนอ่านชีตเสมอ (กันแคชเก่าค้าง)
  var sh = this.sheet_(t);
  var schema = Core.SCHEMA[t];
  var last = sh.getLastRow();
  var rows = [], idx = [];
  if (last >= 2) {
    var vals = sh.getRange(2, 1, last - 1, schema.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var o = {}, empty = true;
      for (var c = 0; c < schema.length; c++) {
        var v = vals[i][c];
        if (v !== '' && v !== null) empty = false;
        if (v instanceof Date) v = Utilities.formatDate(v, TIMEZONE, 'yyyy-MM-dd');
        o[schema[c][0]] = schema[c][1] === 'n' ? (Number(v) || 0) : (v === null || v === undefined ? '' : String(v));
      }
      if (!empty) { rows.push(o); idx.push(i + 2); }
    }
  }
  this.cache[t] = { rows: rows, idx: idx };
  if (verAtRead) this.cachePut_(t, this.cache[t], verAtRead);
  return this.cache[t];
};

SheetStore_.prototype.all = function (t) {
  return this.load_(t).rows.map(function (r) { return Object.assign({}, r); });
};

SheetStore_.prototype.insertMany = function (t, objs) {
  if (!objs.length) return;
  this.flushTable_(t);
  // ไม่ต้องอ่านทั้งตารางก่อนเขียน: ถ้าตารางนี้ยังไม่เคยถูกโหลดในคำสั่งนี้ ก็แค่ต่อท้ายแถวในชีต
  var c = this.cache[t] || null;
  if (!c && !this.touched[t]) { var hit = this.cacheGet_(t); if (hit) { this.cache[t] = hit; c = hit; } }
  this.touch_(t);
  var sh = this.sheet_(t);
  var cols = this.cols_(t);
  var start = (this.lastRow[t] || sh.getLastRow()) + 1;
  var rows = objs.map(function (o) { return Core.row(t, o); });
  sh.getRange(start, 1, rows.length, cols.length).setValues(rows.map(function (r) {
    return cols.map(function (k) { return r[k]; });
  }));
  this.lastRow[t] = start + rows.length - 1;
  if (t === 'Signatures') rows.forEach(function (r) { this.sigMemo[r.sig_id] = r.png; }, this);
  if (c) for (var i = 0; i < rows.length; i++) { c.rows.push(rows[i]); c.idx.push(start + i); }
  return rows;
};

SheetStore_.prototype.insert = function (t, o) {
  var rows = this.insertMany(t, [o]);
  return Object.assign({}, rows[0]);
};

// อ่านภาพลายเซ็นเฉพาะรหัสที่ขอ: อ่านคอลัมน์ sig_id คอลัมน์เดียว แล้วดึงเฉพาะแถวที่ตรง (ไม่อ่าน PNG ทั้งตาราง)
SheetStore_.prototype.pickSigs = function (ids) {
  var out = {}, miss = [], self = this;
  ids.forEach(function (id) { if (self.sigMemo[id] !== undefined) out[id] = self.sigMemo[id]; else miss.push(id); });
  if (!miss.length) return out;
  // 1) แคชรายใบ (ลายเซ็นบันทึกแล้วไม่เปลี่ยน จึงไม่ต้องล้าง)
  try {
    var got = cacheSvc_().getAll(miss.map(function (id) { return 'sig:' + id; })) || {};
    var still = [];
    miss.forEach(function (id) { var v = got['sig:' + id]; if (v) { out[id] = self.sigMemo[id] = v; } else still.push(id); });
    miss = still;
  } catch (e) { /* ข้ามไปอ่านจากชีต */ }
  if (!miss.length) return out;
  // 2) อ่านจากชีต: คอลัมน์ sig_id คอลัมน์เดียว แล้วดึงเฉพาะแถวที่ตรง
  var sh = this.sheet_('Signatures');
  var last = sh.getLastRow();
  if (last < 2) return out;
  var want = {};
  miss.forEach(function (i) { want[i] = 1; });
  var col = sh.getRange(2, 1, last - 1, 1).getValues();
  var found = {};
  for (var i = 0; i < col.length; i++) {
    var id = String(col[i][0]);
    if (want[id]) {
      var png = String(sh.getRange(i + 2, 6, 1, 1).getValues()[0][0] || '');
      out[id] = self.sigMemo[id] = png;
      if (png) found['sig:' + id] = png;
    }
  }
  try { if (Object.keys(found).length) cacheSvc_().putAll(found, 3600); } catch (e) { /* แคชเต็ม: ข้าม */ }
  return out;
};

function matches_(r, m) {
  for (var k in m) if (String(r[k]) !== String(m[k])) return false;
  return true;
}

SheetStore_.prototype.update = function (t, m, patch) {
  var c = this.load_(t);
  var p = Core.rowPatch(t, patch);
  var n = 0;
  this.touch_(t);
  this.dirty[t] = this.dirty[t] || {};
  for (var i = 0; i < c.rows.length; i++) {
    if (matches_(c.rows[i], m)) {
      Object.assign(c.rows[i], p);
      this.dirty[t][c.idx[i]] = true;
      n++;
    }
  }
  return n;
};

// เขียนแถวที่แก้ไขกลับลงชีตทีเดียวเป็นช่วง (เร็วกว่าเขียนทีละแถว)
SheetStore_.prototype.flushTable_ = function (t) {
  var d = this.dirty[t];
  if (!d) return;
  var rowsNums = Object.keys(d).map(Number).sort(function (a, b) { return a - b; });
  if (!rowsNums.length) { delete this.dirty[t]; return; }
  var c = this.load_(t);
  var cols = this.cols_(t);
  var byRow = {};
  for (var i = 0; i < c.idx.length; i++) byRow[c.idx[i]] = c.rows[i];
  var first = rowsNums[0], lastRow = rowsNums[rowsNums.length - 1];
  var sh = this.sheet_(t);
  var block = sh.getRange(first, 1, lastRow - first + 1, cols.length).getValues();
  rowsNums.forEach(function (rn) {
    var r = byRow[rn];
    block[rn - first] = cols.map(function (k) { return r[k]; });
  });
  sh.getRange(first, 1, block.length, cols.length).setValues(block);
  delete this.dirty[t];
};

SheetStore_.prototype.deleteWhere = function (t, m) {
  this.flushTable_(t);
  var c = this.load_(t);
  this.touch_(t);
  delete this.lastRow[t];
  var sh = this.sheet_(t);
  var del = [];
  for (var i = 0; i < c.rows.length; i++) if (matches_(c.rows[i], m)) del.push(c.idx[i]);
  del.sort(function (a, b) { return b - a; });
  // ลบจากล่างขึ้นบน โดยรวมแถวที่ติดกันเป็นช่วงเดียว
  var j = 0;
  while (j < del.length) {
    var end = del[j], len = 1;
    while (j + len < del.length && del[j + len] === end - len) len++;
    sh.deleteRows(end - len + 1, len);
    j += len;
  }
  delete this.cache[t];
  return del.length;
};

SheetStore_.prototype.flush = function () {
  var self = this;
  Object.keys(this.dirty).forEach(function (t) { self.flushTable_(t); });
  SpreadsheetApp.flush();
};

// ---------------------------------------------------------------- ติดตั้งครั้งแรก
/** รันครั้งเดียวจากเมนู Run → setup เพื่อสร้างแท็บ หัวตาราง ข้อมูลเริ่มต้น และตัวตั้งเวลาเตือนผ้าค้าง */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TIMEZONE);
  Object.keys(Core.SCHEMA).forEach(function (name) { ensureSheet_(ss, name); });
  var store = new SheetStore_(ss);
  var adminPin = randomPin_(), hkPin = randomPin_();
  Core.seed(store, { adminPin: adminPin, hkPin: hkPin });
  store.flush();
  store.invalidate();
  var blank = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  ensureDailyTrigger_();
  var users = Core.cfg(store);
  Logger.log('ติดตั้งเสร็จแล้ว ✔  ดู/แก้ PIN ได้ที่แท็บ Users  (PIN เริ่มต้นถูกสุ่มไว้ให้ ถ้ารัน setup ครั้งแรก)');
  Logger.log('ขั้นถัดไป: ใส่อีเมล Admin ที่แท็บ Config (admin_email) แล้ว Deploy เป็น Web app');
  return users;
}

function ensureSheet_(ss, name) {
  var schema = Core.SCHEMA[name];
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var head = schema.map(function (c) { return c[0]; });
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#dfe3d3');
  sh.setFrozenRows(1);
  // คอลัมน์ข้อความตั้งเป็น Plain text กัน Google Sheets แปลงวันที่/ตัวเลขเอง
  for (var c = 0; c < schema.length; c++) {
    if (schema[c][1] === 's') sh.getRange(2, c + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  }
  if (name === 'Signatures') sh.setColumnWidth(6, 120);
}

function randomPin_() {
  var s = '';
  for (var i = 0; i < 6; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function ensureDailyTrigger_() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'checkOverdue'; });
  if (!exists) ScriptApp.newTrigger('checkOverdue').timeBased().everyDays(1).atHour(8).inTimezone(TIMEZONE).create();
}

// ---------------------------------------------------------------- เตือนผ้าค้างที่ร้านซักเกินกำหนด (ทำงานทุกเช้า 08:00)
function checkOverdue() {
  var store = new SheetStore_(SpreadsheetApp.getActiveSpreadsheet());
  var c = Core.cfg(store);
  if (!c.admin_email) return;
  var d = Core.dashboard(store);
  var lines = [];
  d.vendors.forEach(function (v) {
    v.slips.forEach(function (s) {
      if (s.overdue) lines.push(v.name + ' · ' + s.doc_no + ' · ส่งซักเมื่อ ' + s.send_date + ' (' + s.days_out + ' วัน) · ค้าง ' + s.outstanding + ' ชิ้น');
    });
  });
  if (!lines.length) return;
  var link = c.app_url ? '\n\nเปิดระบบ: ' + c.app_url : '';
  MailApp.sendEmail({
    to: c.admin_email,
    subject: '[ผ้าซัก] ผ้าค้างที่ร้านซักเกิน ' + d.overdue_days + ' วัน (' + lines.length + ' เอกสาร)',
    body: lines.join('\n') + link,
    name: 'ระบบติดตามผ้าซัก'
  });
}
