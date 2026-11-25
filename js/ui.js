// ตัวช่วยสร้างหน้าจอ: DOM builder, toast, modal, ลายเซ็น, จัดรูปแบบวันที่
const UI = (function () {
  'use strict';

  // h('div', {class:'x', onclick:fn}, child, 'text', [children])  — ใช้ textContent เสมอ ไม่ใช้ innerHTML (กัน XSS)
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'readOnly') el[k] = !!v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(x => append(el, x));
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  function mount(root, ...kids) { root.replaceChildren(); kids.forEach(k => append(root, k)); }

  const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  function dateTH(s) {
    if (!s) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return s;
    return Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + (Number(m[1]) + 543);
  }
  function dateTimeTH(s) {
    if (!s) return '';
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(s);
    return m ? dateTH(m[1]) + ' ' + m[2] + ' น.' : dateTH(s);
  }
  const fmt = n => (Number(n) || 0).toLocaleString('th-TH');

  // ---------- Toast ----------
  function toast(msg, isErr) {
    const box = document.getElementById('toasts');
    const t = h('div', { class: 'toast' + (isErr ? ' err' : '') }, msg);
    box.appendChild(t);
    setTimeout(() => t.remove(), isErr ? 6000 : 3200);
  }

  // ---------- ปุ่มที่กันกดซ้ำระหว่างรอเซิร์ฟเวอร์ ----------
  async function busy(btn, fn) {
    if (btn.disabled) return;
    const old = btn.cloneNode(true).childNodes;
    btn.disabled = true;
    btn.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' กำลังบันทึก…');
    try { return await fn(); }
    finally { btn.disabled = false; btn.replaceChildren(...Array.from(old)); }
  }
  function errMsg(e) { return (e && e.message) || 'เกิดข้อผิดพลาด'; }

  // ---------- Modal ----------
  function modal(build) {
    const prev = document.activeElement;
    const ov = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' });
    const close = (val) => { ov.remove(); document.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus(); if (done) done(val); };
    let done = null;
    const box = h('div', { class: 'modal' });
    const onKey = e => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(null); });
    ov.appendChild(box);
    build(box, close);
    document.body.appendChild(ov);
    const f = box.querySelector('input,textarea,select,button');
    if (f) f.focus();
    return new Promise(r => { done = r; });
  }
  function confirmBox(title, text, okLabel, danger) {
    return modal((box, close) => {
      append(box, [h('h2', null, title), text ? h('p', { class: 'muted' }, text) : null,
        h('div', { class: 'btns' }, [
          h('button', { class: 'btn', onclick: () => close(false) }, 'ยกเลิก'),
          h('button', { class: 'btn ' + (danger ? 'danger fill' : 'primary'), onclick: () => close(true) }, okLabel || 'ตกลง')
        ])]);
    });
  }
  // ขอเหตุผลก่อนทำรายการสำคัญ (แก้ไข/ยกเลิก/ปิดงาน) — คืนค่าข้อความ หรือ null ถ้ากดยกเลิก
  function askReason(title, text, okLabel, danger) {
    return modal((box, close) => {
      const ta = h('textarea', { placeholder: 'เช่น พิมพ์ผิด ตรวจกับเอกสารกระดาษแล้ว', maxlength: 300, 'aria-label': 'เหตุผล' });
      const er = h('p', { class: 'err hide' });
      const go = () => {
        if (ta.value.trim().length < 3) { er.textContent = 'ต้องบันทึกเหตุผลอย่างน้อย 3 ตัวอักษร'; er.classList.remove('hide'); ta.focus(); return; }
        close(ta.value.trim());
      };
      append(box, [h('h2', null, title), text ? h('p', { class: 'muted' }, text) : null,
        h('div', { class: 'field' }, [h('label', null, 'เหตุผล (จะถูกบันทึกเป็นหลักฐาน)'), ta, er]),
        h('div', { class: 'btns' }, [
          h('button', { class: 'btn', onclick: () => close(null) }, 'ยกเลิก'),
          h('button', { class: 'btn ' + (danger ? 'danger fill' : 'primary'), onclick: go }, okLabel || 'บันทึก')
        ])]);
    });
  }

  // ---------- ลายเซ็น ----------
  function sigPad() {
    const cv = h('canvas', { 'aria-label': 'พื้นที่เซ็นชื่อ' });
    const ph = h('div', { class: 'ph' }, 'เซ็นชื่อตรงนี้ด้วยนิ้วหรือปากกา');
    const wrap = h('div', { class: 'sigpad' }, [cv, h('div', { class: 'baseline' }), ph]);
    let drawing = false, last = null, has = false, ctx = null, pts = [];
    function size() {
      const r = wrap.getBoundingClientRect();
      if (!r.width) return;
      const keep = has ? cv.toDataURL() : null;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
      ctx = cv.getContext('2d');
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14233c';
      if (keep) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, r.width, r.height); im.src = keep; }
    }
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', e => {
      if (!ctx) size();
      e.preventDefault(); cv.setPointerCapture(e.pointerId); drawing = true; last = pos(e);
      ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, 6.3); ctx.fillStyle = '#14233c'; ctx.fill();
      has = true; ph.classList.add('hide');
    });
    cv.addEventListener('pointermove', e => {
      if (!drawing) return; e.preventDefault();
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p;
    });
    const end = () => { drawing = false; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); cv.addEventListener('pointerleave', end);
    window.addEventListener('resize', () => { if (wrap.isConnected) size(); });
    setTimeout(size, 0);
    new ResizeObserver(() => { if (!has && wrap.isConnected) size(); }).observe(wrap);
    return {
      el: wrap,
      isEmpty: () => !has,
      clear() { has = false; if (ctx) ctx.clearRect(0, 0, cv.width, cv.height); ph.classList.remove('hide'); },
      png() {
        if (!has) return '';
        // ย่อให้เล็ก (กว้างไม่เกิน 480px) เพื่อให้ไฟล์ลายเซ็นเบา
        const w = Math.min(480, cv.width), hh = Math.round(cv.height * (w / cv.width));
        const o = document.createElement('canvas'); o.width = w; o.height = hh;
        o.getContext('2d').drawImage(cv, 0, 0, w, hh);
        return o.toDataURL('image/png');
      }
    };
  }
  // กล่องลายเซ็นพร้อมช่องชื่อ: คืน {el, getName, getPng, validate}
  function sigBox(opts) {
    const pad = sigPad();
    const name = h('input', { type: 'text', value: opts.name || '', placeholder: 'พิมพ์ชื่อ-นามสกุล', maxlength: 80, autocomplete: 'name', 'aria-label': opts.nameLabel || 'ชื่อผู้เซ็น' });
    const er = h('p', { class: 'err hide', role: 'alert' });
    const el = h('div', { class: 'sigbox' }, [
      h('div', { class: 'row-sb' }, [h('b', null, opts.title || 'ลายเซ็น'), h('button', { class: 'btn small ghost', type: 'button', onclick: () => pad.clear() }, 'ล้างลายเซ็น')]),
      h('div', { class: 'field' }, [h('label', null, opts.nameLabel || 'ชื่อผู้เซ็น'), name]),
      pad.el, er
    ]);
    return {
      el,
      getName: () => name.value.trim(),
      getPng: () => pad.png(),
      validate() {
        let m = '';
        if (!name.value.trim()) m = 'กรอกชื่อผู้เซ็นก่อน';
        else if (pad.isEmpty()) m = 'กรุณาเซ็นชื่อในกรอบก่อนยืนยัน';
        er.textContent = m; er.classList.toggle('hide', !m);
        return !m;
      }
    };
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise((res, rej) => {
      const t = h('textarea', { style: 'position:fixed;opacity:0' }); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); } t.remove();
    });
  }
  async function shareLink(title, text, url) {
    if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    try { await copyText(url); toast('คัดลอกลิงก์แล้ว นำไปวางส่งให้ร้านซักได้เลย'); } catch (e) { prompt('คัดลอกลิงก์นี้', url); }
  }

  return { h, append, mount, dateTH, dateTimeTH, fmt, toast, busy, errMsg, modal, confirmBox, askReason, sigPad, sigBox, copyText, shareLink };
})();
