// เรียกเซิร์ฟเวอร์: Google Apps Script (ใช้งานจริง) หรือ LocalApi (โหมดทดลอง)
const Api = (function () {
  'use strict';
  const cfg = window.APP_CONFIG || {};
  const demo = !cfg.API_URL;
  const KEY = 'lt.session';
  let session = null;
  try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { session = null; }

  function setSession(s) {
    session = s;
    if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY);
  }

  async function call(action, params) {
    const body = { action, params: params || {}, session: session ? session.token : '' };
    let res;
    const t0 = performance.now();
    if (demo) {
      res = await LocalApi.call(body);
    } else {
      let r;
      try {
        // text/plain = "simple request" ไม่ต้องทำ preflight CORS กับ Apps Script
        r = await fetch(cfg.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
        res = await r.json();
      } catch (e) {
        throw Object.assign(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'), { code: 'NETWORK' });
      }
    }
    const total = Math.round(performance.now() - t0);
    // เปิด DevTools → Console ดูเวลา: total = ทั้งหมดที่ผู้ใช้รอ, server = เวลาที่ Apps Script ทำงานจริง (ส่วนต่าง = เครือข่าย/เริ่มเครื่อง)
    console.info('[api] ' + action + ' ' + total + 'ms' + (res._ms !== undefined ? ' (server ' + res._ms + 'ms)' : ''));
    if (!res.ok) {
      if (res.error === 'AUTH') { setSession(null); window.dispatchEvent(new Event('lt-auth')); }
      throw Object.assign(new Error(res.message || 'เกิดข้อผิดพลาด'), { code: res.error });
    }
    return res.data;
  }

  async function login(role, pin) {
    const d = await call('login', { role, pin });
    setSession({ token: d.session, role: d.role, name: d.name });
    return d;
  }
  async function logout() {
    try { await call('logout'); } catch (e) { /* ไม่เป็นไร */ }
    setSession(null);
  }

  return { demo, call, login, logout, get session() { return session; } };
})();
