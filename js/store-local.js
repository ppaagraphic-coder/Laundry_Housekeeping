// โหมดทดลอง: รันตรรกะเดียวกับ Google Apps Script แต่เก็บข้อมูลใน localStorage ของเบราว์เซอร์
const LocalApi = (function () {
  'use strict';
  const KEY = 'lt.demo.v1';
  let initial = null;
  try { initial = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { initial = null; }
  const store = Core.createMemoryStore(initial, d => {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* พื้นที่เต็ม */ }
  });
  // เซสชันเก็บใน localStorage ด้วย เพื่อให้รีเฟรชหน้าแล้วไม่หลุด
  store.kv = {
    get(k) {
      try {
        const e = JSON.parse(localStorage.getItem('lt.kv.' + k) || 'null');
        if (!e) return null;
        if (e.exp && e.exp < Date.now()) { localStorage.removeItem('lt.kv.' + k); return null; }
        return e.v;
      } catch (err) { return null; }
    },
    put(k, v, ttl) { localStorage.setItem('lt.kv.' + k, JSON.stringify({ v: String(v), exp: ttl ? Date.now() + ttl * 1000 : 0 })); },
    remove(k) { localStorage.removeItem('lt.kv.' + k); }
  };
  Core.seed(store);

  const env = { notify: n => console.info('[แจ้ง Admin]', n.subject), mail: () => { } };

  return {
    call(req) {
      return new Promise(resolve => setTimeout(() => resolve(Core.handle(store, req, env)), 50));
    },
    reset() {
      Object.keys(localStorage).filter(k => k.indexOf('lt.') === 0).forEach(k => localStorage.removeItem(k));
      location.href = location.pathname;
    }
  };
})();
