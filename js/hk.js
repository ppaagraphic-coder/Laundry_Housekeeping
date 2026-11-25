// หน้าจอของ "หัวหน้าแม่บ้าน": รายการงาน, สร้างใบส่งผ้า, รับผ้าคืน
const HK = (function () {
  'use strict';
  const { h, dateTH, fmt } = UI;
  const tabs = cur => [{ href: '#/', icon: 'tasks', label: 'งานของฉัน', current: cur === 'home' }, { href: '#/collections', icon: 'inbox', label: 'เก็บผ้า', current: cur === 'col' }, { href: '#/new', icon: 'truck', label: 'ส่งซัก', current: cur === 'new' }];
  const show = (root, cur, content) => UI.mount(root, Views.layout({ tabs: tabs(cur) }, content));
  const hint = () => ({ statuses: App.boot.statuses, overdue: App.boot.overdue_days });

  // ---------------------------------------------------------------- หน้าแรก
  async function home(root) {
    const [{ slips }, pend] = await Promise.all([Api.call('listSlips', { limit: 300 }), Api.call('pendingCollections')]);
    let filter = 'todo';
    const box = h('div', { class: 'list' });
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'กรองเอกสาร' });
    const groups = {
      todo: s => ['dispute', 'short', 'sent', 'confirmed'].indexOf(s.status) >= 0,
      draft: s => s.status === 'draft',
      done: s => s.status === 'closed' || s.status === 'void',
      all: () => true
    };
    const labels = { todo: 'งานที่ค้างอยู่', draft: 'ร่าง', done: 'ปิดงานแล้ว', all: 'ทั้งหมด' };
    function draw() {
      chips.replaceChildren(...Object.keys(labels).map(k => h('button', { class: 'chip', 'aria-pressed': String(k === filter), onclick: () => { filter = k; draw(); } },
        labels[k] + ' (' + slips.filter(groups[k]).length + ')')));
      const list = slips.filter(groups[filter]);
      const rank = { dispute: 0, short: 1, sent: 2, confirmed: 2 };
      if (filter === 'todo') list.sort((a, b) => (rank[a.status] - rank[b.status]) || (b.days_out - a.days_out));
      box.replaceChildren(...(list.length ? list.map(s => Views.slipRow(s, s.status === 'draft' ? '#/edit/' + s.doc_no : '#/slip/' + s.doc_no, hint()))
        : [h('div', { class: 'empty' }, [h('b', null, filter === 'todo' ? 'ไม่มีงานค้าง' : 'ไม่มีเอกสาร'), filter === 'todo' ? 'เมื่อส่งผ้าซักแล้ว ใบส่งผ้าจะมาอยู่ที่นี่จนกว่าจะรับผ้าคืนครบ' : ''])]));
    }
    draw();
    const waiting = slips.filter(s => s.status === 'sent' || s.status === 'confirmed').length;
    const issues = slips.filter(s => s.status === 'dispute' || s.status === 'short').length;
    show(root, 'home', [
      h('div', { class: 'pagehead row-sb' }, [h('div', null, [h('h1', null, 'งานของฉัน'), h('p', { class: 'muted' }, waiting + ' ใบรอรับผ้าคืน' + (issues ? ' · ' + issues + ' ใบต้องติดตาม' : ''))]),
        h('a', { class: 'btn primary', href: '#/new' }, '+ ส่งซัก')]),
      Views.pendingCard(pend, [h('a', { class: 'btn', href: '#/collect' }, '+ เก็บผ้า'), pend.count ? h('a', { class: 'btn primary', href: '#/new' }, 'ส่งซัก (รวมผ้าสะสม)') : null]),
      chips, box
    ]);
  }

  // ---------------------------------------------------------------- เก็บผ้ารายวัน
  async function collect(root) {
    const boot = App.boot;
    const date = h('input', { type: 'date', value: Core.todayBKK() });
    const rooms = h('input', { type: 'text', maxlength: 200, placeholder: 'เช่น 101, 102, 105 (ไม่บังคับ)' });
    const note = h('textarea', { maxlength: 300, placeholder: 'หมายเหตุ (ถ้ามี)' });
    const totalEl = h('span', { class: 'num' }, '0 ชิ้น');
    const grid = Forms.sendGrid(boot.items, boot.zones, {}, t => { totalEl.textContent = fmt(t) + ' ชิ้น'; }, null, 'รวมจำนวนผ้าที่เก็บ');
    const err = h('p', { class: 'err hide', role: 'alert' });
    const save = h('button', { class: 'btn primary', onclick: async () => {
      const p = !date.value ? 'ใส่วันที่เก็บผ้า' : (grid.total() <= 0 ? 'ยังไม่ได้กรอกจำนวนผ้า กรอกอย่างน้อย 1 รายการ' : '');
      err.textContent = p; err.classList.toggle('hide', !p);
      if (p) { err.scrollIntoView({ block: 'center' }); return; }
      const sb = UI.sigBox({ title: 'ลายเซ็นผู้เก็บผ้า', name: Api.session.name, nameLabel: 'ชื่อผู้เก็บผ้า' });
      await UI.modal((m, close) => {
        const go = h('button', { class: 'btn primary', onclick: e => { if (!sb.validate()) return; UI.busy(e.currentTarget, async () => {
          try {
            const v = await Api.call('saveCollection', { col_date: date.value, rooms: rooms.value, note: note.value, lines: grid.getLines(), signer_name: sb.getName(), signature: sb.getPng() });
            close(true); UI.toast('บันทึก ' + v.col.col_no + ' แล้ว · แจ้ง Admin เรียบร้อย'); location.hash = '#/col/' + v.col.col_no;
          } catch (x) { UI.toast(UI.errMsg(x), true); }
        }); } }, 'เซ็นและบันทึก');
        UI.append(m, [h('h2', null, 'ยืนยันบันทึกการเก็บผ้า'), h('p', null, ['เก็บผ้า ', h('b', null, fmt(grid.total()) + ' ชิ้น'), ' วันที่ ', dateTH(date.value), ' · เซ็นชื่อเพื่อออกรายงานเก็บผ้า ยอดจะไปสะสมรอส่งซัก']), sb.el,
          h('div', { class: 'btns' }, [h('button', { class: 'btn', onclick: () => close(false) }, 'กลับไปแก้ไข'), go])]);
      });
    } }, 'เซ็นและบันทึก…');
    show(root, 'col', [
      h('div', { class: 'pagehead' }, [h('p', { class: 'crumb' }, h('a', { href: '#/collections' }, '← เก็บผ้ารายวัน')), h('h1', null, 'เก็บผ้า'), h('p', { class: 'muted' }, 'กรอกจำนวนผ้าที่เก็บจากห้อง แยกตามชั้น (กรอกเฉพาะรายการที่มี) ใช้ได้ทั้งเก็บหลังแขกเช็คเอาท์ หรือสรุปประจำวัน')]),
      h('div', { class: 'stack' }, [
        h('div', { class: 'card' }, h('div', { class: 'grid2' }, [h('div', { class: 'field' }, [h('label', null, 'วันที่เก็บผ้า'), date]), h('div', { class: 'field' }, [h('label', null, 'ห้องที่เก็บ'), rooms])])),
        h('div', null, [h('div', { class: 'row-sb', style: 'margin-bottom:.4rem' }, [h('h2', null, 'จำนวนผ้าที่เก็บ แยกตามชั้น'), h('span', { class: 'hint' }, 'ปัดตารางไปทางขวาเพื่อดูทุกชั้น')]), grid.el]),
        h('div', { class: 'field' }, [h('label', null, 'หมายเหตุ'), note]), err
      ]),
      h('div', { class: 'actions-bar' }, h('div', { class: 'inner' }, [h('div', { class: 'total' }, ['รวม ', totalEl]), save]))
    ]);
  }

  async function collections(root) {
    const [{ collections: all }, pend] = await Promise.all([Api.call('listCollections', { limit: 300 }), Api.call('pendingCollections')]);
    let filter = 'pending';
    const box = h('div', { class: 'list' }), chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'กรองใบเก็บผ้า' });
    const labels = { pending: 'รอส่งซัก', sent: 'ส่งซักแล้ว', all: 'ทั้งหมด' };
    const pick = { pending: c => c.status === 'pending', sent: c => c.status === 'sent', all: () => true };
    const draw = () => {
      chips.replaceChildren(...Object.keys(labels).map(k => h('button', { class: 'chip', 'aria-pressed': String(k === filter), onclick: () => { filter = k; draw(); } }, labels[k] + ' (' + all.filter(pick[k]).length + ')')));
      const list = all.filter(pick[filter]);
      box.replaceChildren(...(list.length ? list.map(c => Views.colRow(c, '#/col/' + c.col_no)) : [h('div', { class: 'empty' }, [h('b', null, 'ไม่มีใบเก็บผ้า'), filter === 'pending' ? 'กด "+ เก็บผ้า" เพื่อบันทึกผ้าที่เก็บวันนี้' : ''])]));
    };
    draw();
    show(root, 'col', [h('div', { class: 'pagehead row-sb' }, [h('h1', null, 'เก็บผ้ารายวัน'), h('a', { class: 'btn primary', href: '#/collect' }, '+ เก็บผ้า')]),
      h('div', { class: 'stack' }, [Views.pendingCard(pend, pend.count ? [h('a', { class: 'btn primary', href: '#/new' }, 'ส่งซัก (รวมผ้าสะสม)')] : null), chips, box])]);
  }

  async function collection(root, colNo) {
    const view = await Api.call('getCollection', { col_no: colNo });
    show(root, 'col', [h('div', { class: 'pagehead' }, [h('p', { class: 'crumb' }, h('a', { href: '#/collections' }, '← เก็บผ้ารายวัน')), h('h1', null, 'ใบเก็บผ้า ' + colNo)]),
      Views.colDetail(view, view.col.status === 'pending' ? h('div', { class: 'card' }, [h('b', null, 'ผ้าชุดนี้รอส่งซัก'), h('p', { class: 'muted small' }, 'ไปที่ "ส่งซัก" เพื่อรวมยอดผ้าสะสมทั้งหมดเป็นใบส่งผ้า · ถ้าบันทึกผิด ให้แจ้ง Admin แก้ไข'), h('a', { class: 'btn primary', href: '#/new', style: 'margin-top:.5rem' }, 'ส่งซัก (รวมผ้าสะสม)')]) : null)]);
  }

  // ---------------------------------------------------------------- สร้าง/แก้ไขใบส่งผ้า (ดึงยอดจากผ้าสะสม)
  async function form(root, docNo) {
    let view = null;
    if (docNo) {
      view = await Api.call('getSlip', { doc_no: docNo });
      if (view.slip.status !== 'draft') { location.hash = '#/slip/' + docNo; return; }
    }
    const boot = App.boot;
    const pend = await Api.call('pendingCollections');
    const s = view ? view.slip : {};
    const selected = {};
    const pre = view ? String(s.collections || '').split(',').filter(Boolean) : pend.cols.map(c => c.col_no);
    pend.cols.forEach(c => { selected[c.col_no] = pre.indexOf(c.col_no) >= 0; });
    const hasCols = pend.cols.length > 0;
    let acc = null;
    function aggregate() {
      acc = {}; const vals = {};
      pend.cols.filter(c => selected[c.col_no]).forEach(c => c.lines.forEach(l => {
        acc[l.item_seq] = (acc[l.item_seq] || 0) + l.qty;
        const v = vals[l.item_seq] = vals[l.item_seq] || { z: [0, 0, 0, 0, 0, 0, 0, 0], note: '' };
        for (let k = 0; k < 8; k++) v.z[k] += l['z' + (k + 1)] || 0;
      }));
      return vals;
    }
    let vals = {};
    if (view) { view.lines.forEach(l => { vals[l.item_seq] = { z: [l.z1, l.z2, l.z3, l.z4, l.z5, l.z6, l.z7, l.z8], note: l.note }; }); aggregate(); }
    else vals = aggregate();

    const today = Core.todayBKK();
    const vendor = h('select', { 'aria-label': 'ร้านซัก' }, [h('option', { value: '' }, '— เลือกร้านซัก —'), boot.vendors.filter(v => v.active).map(v => h('option', { value: v.id, selected: s.vendor_id === v.id }, v.name))]);
    const dDoc = h('input', { type: 'date', value: s.doc_date || today });
    const dSend = h('input', { type: 'date', value: s.send_date || today });
    const prep = h('input', { type: 'text', value: s.prepared_by || Api.session.name, maxlength: 80 });
    const note = h('textarea', { placeholder: 'หมายเหตุทั่วไปของใบนี้ (ถ้ามี)', maxlength: 500 });
    note.value = s.note || '';
    const totalEl = h('span', { class: 'num' }, '0');
    const gridBox = h('div');
    let grid = null;
    function build(values) {
      grid = Forms.sendGrid(boot.items, boot.zones, values, t => { totalEl.textContent = fmt(t) + ' ชิ้น'; }, hasCols ? acc : null, 'รวมจำนวนผ้าที่ส่ง');
      gridBox.replaceChildren(grid.el);
    }
    build(vals);
    const picker = hasCols ? h('div', { class: 'card' }, [
      h('h2', null, 'ผ้าสะสมที่จะรวมในใบนี้'),
      h('p', { class: 'muted small', style: 'margin:.2rem 0 .6rem' }, 'ยอดในตารางดึงจากใบเก็บผ้าที่เลือก แก้ตัวเลขได้ถ้านับจริงตอนส่งไม่ตรง (แถวสีแดงคือยอดที่ต่างจากยอดสะสม) · ถ้าเปลี่ยนการเลือก ระบบจะคำนวณยอดใหม่'),
      h('div', { class: 'stack-s' }, pend.cols.map(c => {
        const cb = h('input', { type: 'checkbox', checked: selected[c.col_no], style: 'width:22px;height:22px;flex:none' });
        cb.addEventListener('change', () => { selected[c.col_no] = cb.checked; build(aggregate()); UI.toast('คำนวณยอดใหม่จากใบเก็บผ้าที่เลือก'); });
        return h('label', { class: 'row', style: 'padding:.45rem .2rem;border-bottom:1px solid var(--line);flex-wrap:nowrap' }, [cb, h('span', { class: 'grow' }, [h('b', null, c.col_no), ' · ', dateTH(c.col_date), c.rooms ? h('span', { class: 'muted small' }, ' · ห้อง ' + c.rooms) : null]), h('b', { class: 'num' }, fmt(c.total) + ' ชิ้น')]);
      }))]) : h('div', { class: 'card notice' }, 'ยังไม่มีผ้าสะสมจากใบเก็บผ้ารายวัน — กรอกจำนวนเองได้ หรือไปที่แท็บ "เก็บผ้ารายวัน" เพื่อบันทึกผ้าที่เก็บก่อน');

    const err = h('p', { class: 'err hide', role: 'alert' });
    const ids = () => Object.keys(selected).filter(k => selected[k]);
    const payload = () => ({ doc_no: docNo || '', collection_ids: ids(), header: { vendor_id: vendor.value, doc_date: dDoc.value, send_date: dSend.value, prepared_by: prep.value, note: note.value }, lines: grid.getLines() });
    const problem = () => !vendor.value ? 'เลือกร้านซักก่อน' : (!dSend.value ? 'ใส่วันที่ส่งผ้า' : (grid.total() <= 0 ? 'ยังไม่ได้กรอกจำนวนผ้า' : ''));

    const saveBtn = h('button', { class: 'btn', onclick: e => UI.busy(e.currentTarget, async () => {
      try { const v = await Api.call('saveDraft', payload()); UI.toast('บันทึกร่างแล้ว ' + v.slip.doc_no); location.hash = '#/'; } catch (x) { UI.toast(UI.errMsg(x), true); }
    }) }, 'บันทึกร่าง');
    const sendBtn = h('button', { class: 'btn primary', onclick: async () => {
      const p = problem();
      err.textContent = p; err.classList.toggle('hide', !p);
      if (p) { err.scrollIntoView({ block: 'center' }); return; }
      const t = grid.total();
      const lineMap = {}; grid.getLines().forEach(l => { lineMap[l.item_seq] = l.z.reduce((a, b) => a + b, 0); });
      const diffN = hasCols && ids().length ? boot.items.filter(i => (acc[i.seq] || 0) !== (lineMap[i.seq] || 0)).length : 0;
      const sb = UI.sigBox({ title: 'ลายเซ็นผู้ส่ง (หัวหน้าแม่บ้าน)', name: Api.session.name, nameLabel: 'ชื่อผู้ส่ง' });
      await UI.modal((m, close) => {
        const go = h('button', { class: 'btn primary', onclick: e => { if (!sb.validate()) return; UI.busy(e.currentTarget, async () => {
          try {
            const v = await Api.call('sendSlip', Object.assign(payload(), { sender_name: sb.getName(), signature: sb.getPng() }));
            close(true); UI.toast('ส่งซักแล้ว · แจ้ง Admin เรียบร้อย'); location.hash = '#/slip/' + v.slip.doc_no;
          } catch (x) { UI.toast(UI.errMsg(x), true); }
        }); } }, 'ยืนยันส่งซัก');
        UI.append(m, [h('h2', null, 'ยืนยันส่งซัก'), h('p', null, ['ส่งให้ ', h('b', null, vendor.selectedOptions[0].textContent), ' จำนวน ', h('b', null, fmt(t) + ' ชิ้น'), ids().length ? ' (รวมจากใบเก็บผ้า ' + ids().length + ' ใบ)' : '', ' · เซ็นชื่อเพื่อออกใบส่งผ้าและลิงก์ให้ร้านตรวจนับ']),
          diffN ? h('div', { class: 'card notice small' }, 'มี ' + diffN + ' รายการที่ยอดส่งจริงต่างจากยอดสะสม — ระบบจะบันทึกส่วนต่างและแจ้ง Admin') : null, sb.el,
          h('div', { class: 'btns' }, [h('button', { class: 'btn', onclick: () => close(false) }, 'กลับไปแก้ไข'), go])]);
      });
    } }, 'ส่งซัก…');

    show(root, 'new', [
      h('div', { class: 'pagehead' }, [h('p', { class: 'crumb' }, h('a', { href: '#/' }, '← งานของฉัน')), h('h1', null, docNo ? 'แก้ไขร่าง ' + docNo : 'ส่งซัก — ใบส่งผ้า')]),
      h('div', { class: 'stack' }, [
        picker,
        h('div', { class: 'card' }, h('div', { class: 'grid2' }, [
          h('div', { class: 'field' }, [h('label', null, 'ร้านซัก (บริษัทรับซัก)'), vendor]), h('div', { class: 'field' }, [h('label', null, 'ผู้จัดเตรียม'), prep]),
          h('div', { class: 'field' }, [h('label', null, 'วันที่'), dDoc]), h('div', { class: 'field' }, [h('label', null, 'วันที่ส่งผ้า'), dSend])
        ])),
        h('div', null, [h('div', { class: 'row-sb', style: 'margin-bottom:.4rem' }, [h('h2', null, 'จำนวนผ้าที่ส่ง แยกตามชั้น'), h('span', { class: 'hint' }, 'ปัดตารางไปทางขวาเพื่อดูทุกชั้น')]), gridBox]),
        h('div', { class: 'field' }, [h('label', null, 'หมายเหตุเอกสาร'), note]), err
      ]),
      h('div', { class: 'actions-bar' }, h('div', { class: 'inner' }, [h('div', { class: 'total' }, ['รวม ', totalEl]), saveBtn, sendBtn]))
    ]);
  }

  // ---------------------------------------------------------------- รายละเอียด + ปุ่มตามสถานะ
  async function detail(root, docNo) {
    const view = await Api.call('getSlip', { doc_no: docNo });
    const s = view.slip, d = view.derived;
    if (s.status === 'draft') { location.hash = '#/edit/' + docNo; return; }
    const reload = () => detail(root, docNo);
    const btns = [];
    if (s.status === 'dispute') btns.push(h('button', { class: 'btn primary', onclick: () => resolveModal(view, reload) }, 'ตกลงยอดกับร้านซัก'));
    if (['sent', 'confirmed', 'dispute'].indexOf(s.status) >= 0) btns.push(h('a', { class: 'btn' + (s.status === 'confirmed' || s.status === 'sent' ? ' primary' : ''), href: '#/receive/' + docNo }, 'รับผ้าคืน'));
    if (s.status === 'short') {
      if (d.missing_total > 0) btns.push(h('a', { class: 'btn primary', href: '#/receive/' + docNo }, 'รับผ้าที่ขาดเพิ่ม'));
      else btns.push(h('button', { class: 'btn primary', onclick: async () => {
        if (!(await UI.confirmBox('ปิดงาน ' + docNo, 'ผ้าครบแล้ว เหลือเพียงรายการชำรุด/คราบที่ร้านรับทราบ ปิดงานใช่ไหม', 'ปิดงาน'))) return;
        try { await Api.call('closeSlip', { doc_no: docNo }); UI.toast('ปิดงานแล้ว'); reload(); } catch (x) { UI.toast(UI.errMsg(x), true); }
      } }, 'ปิดงาน'));
    }
    const actions = btns.length ? h('div', { class: 'card' }, [h('h2', null, 'ทำต่อ'), h('div', { class: 'row' }, btns),
      s.status === 'short' && d.missing_total > 0 ? h('p', { class: 'hint', style: 'margin-top:.5rem' }, 'ผ้ายังขาด ' + d.missing_total + ' ชิ้น — เมื่อร้านส่งผ้าที่ขาดมาให้กด "รับผ้าที่ขาดเพิ่ม" ระบบจะปิดงานเองเมื่อครบ (ถ้าต้องตัดยอดให้แจ้ง Admin)') : null]) : null;
    show(root, 'home', [h('div', { class: 'pagehead' }, [h('p', { class: 'crumb' }, h('a', { href: '#/' }, '← งานของฉัน')), h('h1', null, 'ใบส่งผ้า ' + docNo)]), Views.slipDetail(view, actions, 'hk')]);
  }

  function resolveModal(view, reload) {
    const nm = {}; view.items.forEach(i => { nm[i.seq] = i.name; });
    const diffs = view.lines.filter(l => l.vendor_qty >= 0 && l.vendor_qty !== l.agreed_qty);
    const ins = {};
    const reason = h('textarea', { maxlength: 300, placeholder: 'เช่น นับซ้ำร่วมกันแล้ว ได้ 52 ผืน' });
    const er = h('p', { class: 'err hide' });
    return UI.modal((m, close) => {
      UI.append(m, [h('h2', null, 'ตกลงยอดกับร้านซัก'), h('p', { class: 'muted small' }, 'ร้านนับได้ไม่ตรงกับที่โรงแรมส่ง ใส่ "ยอดที่ตกลงกัน" ของแต่ละรายการ (ถ้ายืนยันยอดโรงแรมให้คงเดิม) ระบบจะบันทึกเหตุผลเป็นหลักฐาน'),
        diffs.map(l => { ins[l.item_seq] = Forms.numInput(l.agreed_qty, () => { }, 'ยอดที่ตกลง ' + nm[l.item_seq]); ins[l.item_seq].style.cssText = 'min-height:46px;border:1.5px solid var(--line-2);border-radius:8px;width:90px';
          return h('div', { class: 'field' }, [h('label', null, nm[l.item_seq] + ' — โรงแรมส่ง ' + l.agreed_qty + ' / ร้านนับ ' + l.vendor_qty), ins[l.item_seq]]); }),
        h('div', { class: 'field' }, [h('label', null, 'เหตุผล (บันทึกเป็นหลักฐาน)'), reason, er]),
        h('div', { class: 'btns' }, [h('button', { class: 'btn', onclick: () => close() }, 'ยกเลิก'), h('button', { class: 'btn primary', onclick: async e => {
          if (reason.value.trim().length < 3) { er.textContent = 'ต้องบันทึกเหตุผล'; er.classList.remove('hide'); return; }
          const agreed = {}; diffs.forEach(l => { agreed[l.item_seq] = Number(ins[l.item_seq].value || 0); });
          UI.busy(e.currentTarget, async () => { try { await Api.call('resolveDispute', { doc_no: view.slip.doc_no, agreed, reason: reason.value.trim() }); close(); UI.toast('บันทึกการตกลงยอดแล้ว'); reload(); } catch (x) { UI.toast(UI.errMsg(x), true); } });
        } }, 'บันทึกการตกลงยอด')])]);
    });
  }

  // ---------------------------------------------------------------- รับผ้าคืน
  async function receive(root, docNo) {
    const view = await Api.call('getSlip', { doc_no: docNo });
    const s = view.slip;
    if (['sent', 'confirmed', 'dispute', 'short'].indexOf(s.status) < 0) { location.hash = '#/slip/' + docNo; return; }
    const supp = s.status === 'short';
    const grid = Forms.receiveGrid(view.items, view.lines, view.derived.received, supp);
    const deliverer = h('input', { type: 'text', maxlength: 80, placeholder: 'ชื่อคนส่งผ้าจากร้านซัก (ถ้ามี)' });
    const rdate = h('input', { type: 'date', value: Core.todayBKK() });
    const note = h('textarea', { maxlength: 300, placeholder: 'หมายเหตุการรับผ้า (ถ้ามี)' });
    const err = h('p', { class: 'err hide', role: 'alert' });
    const sum = h('div', { class: 'row', 'aria-live': 'polite' });
    const sb = UI.sigBox({ title: 'ลายเซ็นผู้ตรวจรับ (โรงแรม)', name: Api.session.name, nameLabel: 'ชื่อผู้ตรวจรับ' });
    const redraw = () => { const t = grid.summary(); sum.replaceChildren(h('span', { class: t.miss ? 'bad' : 'good' }, t.miss ? 'ขาด ' + t.miss + ' ชิ้น' : 'ยังไม่พบผ้าขาด'), t.defect ? h('span', { class: 'bad' }, ' · ชำรุด/คราบ ' + t.defect + ' ชิ้น') : null); };
    grid.el.addEventListener('input', redraw); redraw();
    const submit = h('button', { class: 'btn primary', onclick: e => {
      const p = grid.validate();
      err.textContent = p; err.classList.toggle('hide', !p);
      if (p) { err.scrollIntoView({ block: 'center' }); return; }
      if (!sb.validate()) return;
      UI.busy(e.currentTarget, async () => {
        try {
          const v = await Api.call('receive', { doc_no: docNo, lines: grid.getLines(), receiver_name: sb.getName(), signature: sb.getPng(), deliverer_name: deliverer.value, receive_date: rdate.value, note: note.value });
          UI.toast(v.slip.status === 'closed' ? 'รับผ้าครบ ปิดงานแล้ว' : 'บันทึกแล้ว · ออกใบแจ้งผ้าขาด/ชำรุดและแจ้ง Admin แล้ว');
          location.hash = '#/slip/' + docNo;
        } catch (x) { UI.toast(UI.errMsg(x), true); }
      });
    } }, supp ? 'ยืนยันรับผ้าเพิ่ม' : 'ยืนยันรับผ้าคืน');
    show(root, 'home', [
      h('div', { class: 'pagehead' }, [h('p', { class: 'crumb' }, h('a', { href: '#/slip/' + docNo }, '← ใบส่งผ้า ' + docNo)), h('h1', null, supp ? 'รับผ้าที่ขาดเพิ่ม' : 'ตรวจรับผ้าคืน'),
        h('p', { class: 'muted' }, 'ส่งให้ ' + s.vendor_name + ' เมื่อ ' + dateTH(s.send_date) + ' · นับผ้าทีละรายการเทียบกับยอดที่ส่ง')]),
      s.status === 'dispute' ? h('div', { class: 'card notice' }, 'ยอดที่ร้านนับยังไม่ตรงกับที่ส่ง — เทียบกับ "ยอดโรงแรมส่ง" ที่แสดงในตาราง และควรตกลงยอดกับร้านก่อนในหน้าใบส่งผ้า') : null,
      h('div', { class: 'stack' }, [
        h('div', { class: 'row-sb' }, [h('h2', null, 'จำนวนที่นับได้'), supp ? null : h('button', { class: 'btn small', onclick: () => { grid.fillAllOk(); redraw(); } }, 'ครบทุกรายการ (ตรงกับที่ส่ง)')]),
        grid.el, err, sum,
        h('div', { class: 'card' }, h('div', { class: 'grid2' }, [h('div', { class: 'field' }, [h('label', null, 'ผู้ส่งผ้ามาให้'), deliverer]), h('div', { class: 'field' }, [h('label', null, 'วันที่รับผ้า'), rdate])])),
        h('div', { class: 'field' }, [h('label', null, 'หมายเหตุ'), note]),
        sb.el
      ]),
      h('div', { class: 'actions-bar' }, h('div', { class: 'inner' }, [h('a', { class: 'btn', href: '#/slip/' + docNo }, 'ยกเลิก'), submit]))
    ]);
  }

  return { home, form, detail, receive, collect, collections, collection };
})();
