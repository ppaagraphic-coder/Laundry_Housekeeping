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
  try {
    if (!READ_ONLY[req.action]) {
      lock = LockService.getScriptLock();
      lock.waitLock(25000);
    }
    store = new SheetStore_(SpreadsheetApp.getActiveSpreadsheet());
    var res = Core.handle(store, req, { notify: notifyAdmin_, mail: sendMail_ });
    store.flush();
    return json_(res);
  } catch (err) {
    return json_({ ok: false, error: 'SERVER', message: 'ระบบขัดข้อง: ' + (err && err.message ? err.message : err) });
  } finally {
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

SheetStore_.prototype.load_ = function (t) {
  if (this.cache[t]) return this.cache[t];
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
  var sh = this.sheet_(t);
  var cols = this.cols_(t);
  var start = sh.getLastRow() + 1;
  var rows = objs.map(function (o) { return Core.row(t, o); });
  sh.getRange(start, 1, rows.length, cols.length).setValues(rows.map(function (r) {
    return cols.map(function (k) { return r[k]; });
  }));
  if (c) for (var i = 0; i < rows.length; i++) { c.rows.push(rows[i]); c.idx.push(start + i); }
  return rows;
};

SheetStore_.prototype.insert = function (t, o) {
  var rows = this.insertMany(t, [o]);
  return Object.assign({}, rows[0]);
};

// อ่านภาพลายเซ็นเฉพาะรหัสที่ขอ: อ่านคอลัมน์ sig_id คอลัมน์เดียว แล้วดึงเฉพาะแถวที่ตรง (ไม่อ่าน PNG ทั้งตาราง)
SheetStore_.prototype.pickSigs = function (ids) {
  var sh = this.sheet_('Signatures');
  var last = sh.getLastRow();
  var out = {};
  if (last < 2) return out;
  var want = {};
  ids.forEach(function (i) { want[i] = 1; });
  var col = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    var id = String(col[i][0]);
    if (want[id]) out[id] = String(sh.getRange(i + 2, 6, 1, 1).getValues()[0][0] || '');
  }
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
