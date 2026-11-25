// หน้าจอของ "ร้านซัก" — เปิดผ่านลิงก์ ?t=... ไม่ต้องล็อกอิน
const Vendor = (function () {
  'use strict';
  const { h, dateTH, fmt } = UI;
  const token = () => new URLSearchParams(location.search).get('t');
  const page = (root, content) => UI.mount(root, Views.layout({}, content));

  function invalid(root, msg) {
    page(root, h('div', { class: 'empty', style: 'margin-top:2rem' }, [h('b', null, 'เปิดเอกสารไม่ได้'), msg || 'ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่จากโรงแรม']));
  }

  async function main(root) {
    let view;
    try { view = await Api.call('vendorGet', { token: token() }); } catch (e) { return invalid(root, e.code === 'NOT_FOUND' ? null : UI.errMsg(e)); }
    const s = view.slip;
    const reload = () => main(root);
    const hash = location.hash;
    if (hash.indexOf('#/print') === 0) { UI.mount(root, Views.printPage(view, location.pathname + location.search, hash.split('/')[2] || 'all', true)); return; }
    const head = h('div', { class: 'pagehead' }, [h('h1', null, 'ใบส่งผ้า ' + s.doc_no), h('p', { class: 'muted' }, ['จาก ', view.hotel.name, ' · ถึง ', h('b', null, s.vendor_name), ' · ส่งเมื่อ ', dateTH(s.send_date)])]);
    let action = null;

    if (s.status === 'sent' || s.status === 'dispute') action = confirmCard(view, reload);
    else if (s.status === 'short') action = ackCard(view, reload);
    else action = h('div', { class: 'card' }, [h('b', null, s.status === 'confirmed' ? 'คุณเซ็นรับผ้าแล้ว' : s.status === 'closed' ? 'งานนี้ปิดแล้ว' : 'เอกสารนี้ไม่ได้ใช้งานแล้ว'),
      s.status === 'confirmed' ? h('p', { class: 'muted small' }, 'เมื่อโรงแรมรับผ้าคืนแล้ว จะแจ้งผลตรวจที่หน้านี้') : null]);

    page(root, [head, h('div', { class: 'stack' }, [
      action,
      h('div', { class: 'card' }, [h('h2', null, 'สถานะ'), h('p', null, Views.badge(s.status, view.status_label))]),
      s.status === 'sent' || s.status === 'dispute' ? null : h('div', { class: 'card' }, [h('h2', null, 'รายการผ้า'), Views.linesTable(view)]),
      h('a', { class: 'btn', href: '#/print/all' }, 'เปิดเอกสาร / บันทึกเป็น PDF')
    ])]);
  }

  // ร้านนับผ้า + เซ็นรับ
  function confirmCard(view, reload) {
    const s = view.slip;
    const grid = Forms.vendorGrid(view.items, view.lines, view.zones);
    const nameIn = null;
    const sb = UI.sigBox({ title: 'ลายเซ็นผู้รับผ้า (ร้านซัก)', name: '', nameLabel: 'ชื่อผู้รับผ้า' });
    const note = h('textarea', { maxlength: 300, placeholder: 'หมายเหตุ เช่น ผ้ามีคราบหนัก 2 ผืน (ถ้ามี)' });
    const err = h('p', { class: 'err hide', role: 'alert' });
    const note0 = s.status === 'dispute' ? h('div', { class: 'card notice' }, 'ครั้งก่อนยอดที่นับไม่ตรงกับที่โรงแรมส่ง โรงแรมจะตรวจสอบและติดต่อกลับ คุณสามารถนับใหม่และยืนยันอีกครั้งได้') : null;
    const btn = h('button', { class: 'btn primary block', onclick: e => {
      const p = grid.validate();
      err.textContent = p; err.classList.toggle('hide', !p);
      if (p) { err.scrollIntoView({ block: 'center' }); return; }
      if (!sb.validate()) return;
      const diff = grid.diffCount();
      UI.busy(e.currentTarget, async () => {
        try {
          await Api.call('vendorConfirm', { token: token(), name: sb.getName(), counts: grid.counts(), note: note.value, signature: sb.getPng() });
          UI.toast(diff ? 'ส่งยอดนับแล้ว โรงแรมจะติดต่อกลับเรื่องยอดที่ไม่ตรง' : 'เซ็นรับผ้าเรียบร้อย');
          reload();
        } catch (x) { UI.toast(UI.errMsg(x), true); }
      });
    } }, 'ยืนยันและเซ็นรับผ้า');
    return h('div', { class: 'stack' }, [note0,
      h('div', { class: 'card' }, [h('h2', null, 'นับผ้าที่ได้รับ'), h('p', { class: 'muted small' }, ['ใส่จำนวนที่นับได้จริงในช่อง "ร้านนับได้" ถ้านับแล้วตรงกับที่โรงแรมส่งทั้งหมดกดปุ่มด้านล่างเพื่อกรอกให้ทั้งหมด · โรงแรมส่งรวม ', h('b', null, fmt(s.agreed_total || s.send_total)), ' ชิ้น']),
        h('div', { style: 'margin:.6rem 0' }, h('button', { class: 'btn small', onclick: () => grid.fillAllOk() }, 'นับแล้ว ตรงทุกรายการ')), grid.el, err]),
      h('div', { class: 'field' }, [h('label', null, 'หมายเหตุจากร้านซัก'), note]), sb.el, btn]);
  }

  // ร้านรับทราบใบแจ้งผ้าขาด/ชำรุด
  function ackCard(view, reload) {
    const open = view.shortages.filter(x => x.status === 'open').slice(-1)[0];
    if (!open) return h('div', { class: 'stack' }, [Views.shortageCard(view), h('div', { class: 'card' }, 'คุณรับทราบใบแจ้งนี้แล้ว โรงแรมจะแจ้งผลเมื่อได้รับผ้าที่เหลือ')]);
    const sb = UI.sigBox({ title: 'ลายเซ็นผู้รับทราบ (ร้านซัก)', name: '', nameLabel: 'ชื่อผู้รับทราบ' });
    const exp = h('input', { type: 'date' });
    const note = h('textarea', { maxlength: 300, placeholder: 'ชี้แจง เช่น ตรวจพบผ้าในล็อตถัดไป จะส่งคืนพรุ่งนี้' });
    return h('div', { class: 'stack' }, [Views.shortageCard(view),
      h('div', { class: 'card' }, [h('h2', null, 'รับทราบใบแจ้ง ' + open.rpt_no), h('div', { class: 'stack-s' }, [
        h('div', { class: 'field' }, [h('label', null, 'กำหนดส่งผ้าที่ขาด/ชดเชยคืน (ถ้ามี)'), exp]), h('div', { class: 'field' }, [h('label', null, 'ชี้แจง'), note]), sb.el,
        h('button', { class: 'btn primary block', onclick: e => { if (!sb.validate()) return; UI.busy(e.currentTarget, async () => {
          try { await Api.call('vendorAck', { token: token(), name: sb.getName(), note: note.value, expect_date: exp.value, signature: sb.getPng() }); UI.toast('รับทราบใบแจ้งแล้ว ขอบคุณครับ'); reload(); } catch (x) { UI.toast(UI.errMsg(x), true); }
        }); } }, 'รับทราบและเซ็นชื่อ')])])]);
  }

  return { main, token };
})();
