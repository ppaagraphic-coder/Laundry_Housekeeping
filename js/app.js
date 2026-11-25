// ตัวควบคุมหลัก: เส้นทาง (route), เข้าสู่ระบบ, โหมดร้านซัก
const App = (function () {
  'use strict';
  const { h } = UI;
  const root = document.getElementById('app');
  const state = { boot: null };

  function loginPage() {
    let role = '';
    const pin = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'current-password', maxlength: 12, class: 'pin', 'aria-label': 'PIN', placeholder: '••••••' });
    const err = h('p', { class: 'err hide', role: 'alert' });
    const roles = h('div', { class: 'roles', role: 'group', 'aria-label': 'เลือกบทบาท' });
    const go = h('button', { class: 'btn primary block', type: 'submit' }, 'เข้าสู่ระบบ');
    const draw = () => roles.replaceChildren(...[['housekeeper', 'หัวหน้าแม่บ้าน'], ['admin', 'Admin']].map(r => h('button', { type: 'button', class: 'role', 'aria-pressed': String(role === r[0]), onclick: () => { role = r[0]; draw(); pin.focus(); } }, r[1])));
    draw();
    const form = h('form', { class: 'box', onsubmit: async e => {
      e.preventDefault();
      if (!role) { err.textContent = 'เลือกบทบาทก่อน'; err.classList.remove('hide'); return; }
      UI.busy(go, async () => {
        try { await Api.login(role, pin.value); err.classList.add('hide'); location.hash = '#/'; start(); }
        catch (x) { err.textContent = UI.errMsg(x); err.classList.remove('hide'); pin.value = ''; pin.focus(); }
      });
    } }, [
      h('img', { class: 'login-logo', src: 'assets/logo.png', alt: 'inchantree meedao' }), h('div', { class: 'band' }),
      h('div', null, [h('h1', null, 'ระบบติดตามผ้าซัก'), h('p', { class: 'muted' }, 'บันทึกการส่ง-รับผ้ากับร้านซัก พร้อมลายเซ็น')]),
      Api.demo ? h('div', { class: 'demo-note' }, ['โหมดทดลอง (ข้อมูลอยู่ในเครื่องนี้) · PIN: หัวหน้าแม่บ้าน ', h('b', null, '222222'), ' · Admin ', h('b', null, '111111')]) : null,
      roles, h('div', { class: 'field' }, [h('label', null, 'PIN'), pin]), err, go
    ]);
    UI.mount(root, h('div', { class: 'login' }, form));
  }

  function parse() {
    const parts = (location.hash.replace(/^#\/?/, '') || '').split('/');
    return { name: parts[0] || '', arg: decodeURIComponent(parts[1] || ''), arg2: decodeURIComponent(parts[2] || '') };
  }

  async function render() {
    if (Vendor.token()) return Vendor.main(root);
    const me = Api.session;
    if (!me) return loginPage();
    if (!state.boot) { state.boot = await Api.call('bootstrap'); App.boot = state.boot; }
    const { name, arg, arg2 } = parse();
    const isAdmin = me.role === 'admin';
    try {
      if (name === 'print' && arg) {
        const view = await Api.call('getSlip', { doc_no: arg });
        UI.mount(root, Views.printPage(view, '#/slip/' + arg, 'all')); window.scrollTo(0, 0); return;
      }
      if (name === 'printcol' && arg) {
        const cv = await Api.call('getCollection', { col_no: arg });
        UI.mount(root, Views.printColPage(cv, '#/col/' + arg)); window.scrollTo(0, 0); return;
      }
      if (isAdmin) {
        if (name === 'report') return await Admin.report(root, arg || 'day', arg2);
        if (name === 'collections') return await Admin.collections(root);
        if (name === 'col' && arg) return await Admin.collection(root, arg);
        if (name === 'editcol' && arg) return await Admin.editCollection(root, arg);
        if (name === 'slips') return await Admin.slips(root);
        if (name === 'slip' && arg) return await Admin.detail(root, arg);
        if (name === 'edit' && arg) return await Admin.edit(root, arg);
        if (name === 'settings') return await Admin.settings(root);
        return await Admin.home(root);
      }
      if (name === 'collect') return await HK.collect(root);
      if (name === 'collections') return await HK.collections(root);
      if (name === 'col' && arg) return await HK.collection(root, arg);
      if (name === 'new') return await HK.form(root, '');
      if (name === 'edit' && arg) return await HK.form(root, arg);
      if (name === 'slip' && arg) return await HK.detail(root, arg);
      if (name === 'receive' && arg) return await HK.receive(root, arg);
      return await HK.home(root);
    } catch (e) {
      if (e.code === 'AUTH') return loginPage();
      UI.mount(root, Views.layout({}, h('div', { class: 'empty', style: 'margin-top:2rem' }, [h('b', null, 'เปิดหน้านี้ไม่ได้'), UI.errMsg(e), h('div', { style: 'margin-top:1rem' }, h('a', { class: 'btn', href: '#/' }, 'กลับหน้าแรก'))])));
    }
    window.scrollTo(0, 0);
  }

  function start() { state.boot = null; render(); }
  window.addEventListener('hashchange', () => { render(); });
  window.addEventListener('lt-auth', () => { state.boot = null; loginPage(); });
  start();

  return { get boot() { return state.boot; }, set boot(v) { state.boot = v; } };
})();
