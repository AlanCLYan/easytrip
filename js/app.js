/**
 * 核心：登入、旅行列表、旅行頁面與分頁切換（一般不用改）
 *
 * 網址：
 *   #/                    我的旅行
 *   #/trip/<旅行id>        旅行頁面（第一個分頁）
 *   #/trip/<旅行id>/<分頁>  旅行頁面的某個分頁
 */

const CURRENCIES = [
  ['TWD', '新台幣'], ['JPY', '日圓'], ['KRW', '韓元'], ['USD', '美元'], ['EUR', '歐元'],
  ['THB', '泰銖'], ['HKD', '港幣'], ['CNY', '人民幣'], ['SGD', '新加坡幣'], ['VND', '越南盾'],
  ['GBP', '英鎊'], ['AUD', '澳幣']
];

const App = {
  tabs: [],
  _token: 0,

  /* 分頁模組用這個註冊自己 */
  registerTab(tab) { this.tabs.push(tab); },

  start() {
    window.addEventListener('hashchange', () => this.route());
    this.route();
  },

  root() { return document.getElementById('app'); },

  async route() {
    const token = ++this._token;
    this.renderUserbox();
    if (!Api.loggedIn) return this.renderLogin();
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    try {
      if (parts[0] === 'trip' && parts[1]) await this.renderTrip(decodeURIComponent(parts[1]), parts[2], token);
      else await this.renderTrips(token);
    } catch (e) {
      if (token !== this._token) return;
      if (e instanceof AuthError) { Api.logout(); UI.toast(e.message, true); return this.route(); }
      this.root().innerHTML =
        '<div class="card center"><p>😵 載入失敗</p><p class="muted small">' + UI.esc(e.message) + '</p>' +
        '<p><a class="btn" href="#/">回我的旅行</a> <button class="btn btn-primary" onclick="App.route()">重試</button></p></div>';
    }
    window.scrollTo(0, 0);
  },

  renderUserbox() {
    const box = document.getElementById('userbox');
    if (!Api.loggedIn) { box.innerHTML = ''; return; }
    const roleName = { admin: '管理員', editor: '可編輯', viewer: '只能看' }[Api.user.role] || '';
    box.innerHTML =
      '<span class="who">' + UI.esc(Api.user.name) + ' <small class="muted">' + roleName + '</small></span>' +
      '<button class="btn btn-ghost btn-sm" id="logoutBtn">登出</button>';
    document.getElementById('logoutBtn').onclick = () => {
      if (!confirm('確定要登出？這台裝置上的離線資料也會一併清除。')) return;
      Api.logout();
      location.hash = '#/';
      this.route();
    };
  },

  /* ───────── 登入 ───────── */

  renderLogin() {
    this.root().innerHTML =
      '<section class="card login">' +
        '<div class="login-icon">🧳</div>' +
        '<h1>easytrip</h1>' +
        '<p class="muted">請輸入你的個人密碼</p>' +
        '<form id="loginForm">' +
          '<input type="password" name="key" autocomplete="current-password" placeholder="密碼" required>' +
          '<button class="btn btn-primary btn-block" type="submit">登入</button>' +
        '</form>' +
        '<p class="muted small">還沒有帳號？請向管理員索取密碼</p>' +
      '</section>';
    const form = document.getElementById('loginForm');
    form.onsubmit = e => {
      e.preventDefault();
      UI.action(form.querySelector('button'), async () => {
        const u = await Api.login(form.key.value);
        UI.toast('歡迎，' + u.name);
        this.route();
      });
    };
  },

  offlineBanner() {
    return Api.offline ? '<div class="banner">📴 目前沒有網路，顯示的是上次載入的資料，暫時無法修改</div>' : '';
  },

  /* ───────── 我的旅行 ───────── */

  async renderTrips(token) {
    const root = this.root();
    if (!root.querySelector('.trip-grid')) root.innerHTML = '<p class="muted center">載入旅行中…</p>';
    const trips = await Api.trips();
    if (token !== this._token) return;

    const t = UI.dateStr(UI.today());
    const upcoming = trips.filter(x => (x.endDate || x.startDate || '9') >= t)
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
    const past = trips.filter(x => upcoming.indexOf(x) === -1)
      .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));

    const card = trip => {
      const cd = UI.countdown(trip);
      const names = String(trip.members || '').split(',').filter(Boolean).map(id => Api.userName(id)).join('、');
      return '<a class="card trip-card" href="#/trip/' + encodeURIComponent(trip.id) + '">' +
        '<div class="trip-card-top"><h3>' + UI.esc(trip.name) + '</h3><span class="tag ' + cd.cls + '">' + cd.text + '</span></div>' +
        '<p class="trip-dest">📍 ' + UI.esc(trip.destination || '目的地未定') + '</p>' +
        '<p class="muted small">🗓 ' + UI.range(trip.startDate, trip.endDate) + '・' + UI.tripDays(trip) + ' 天</p>' +
        (names ? '<p class="muted small">👥 ' + UI.esc(names) + '</p>' : '') +
      '</a>';
    };

    root.innerHTML =
      this.offlineBanner() +
      '<div class="page-head"><h1>我的旅行</h1>' +
        (Api.canEdit && !Api.offline ? '<button class="btn btn-primary" id="addTrip">＋ 新增旅行</button>' : '') +
      '</div>' +
      (trips.length === 0
        ? '<div class="card center empty"><p>還沒有任何旅行</p>' +
          (Api.canEdit ? '<p class="muted small">按右上角「＋ 新增旅行」開始規劃</p>' : '<p class="muted small">等旅伴把你加入旅行後，就會出現在這裡</p>') + '</div>'
        : '') +
      (upcoming.length ? '<div class="trip-grid">' + upcoming.map(card).join('') + '</div>' : '') +
      (past.length ? '<h2 class="section-title">已結束</h2><div class="trip-grid past">' + past.map(card).join('') + '</div>' : '');

    const add = document.getElementById('addTrip');
    if (add) add.onclick = () => this.tripForm(null);
  },

  /* 新增或編輯旅行的表單 */
  tripForm(trip) {
    const isNew = !trip;
    const canMembers = isNew || Api.isOwner(trip);
    const fields = [
      { name: 'name', label: '旅行名稱', required: true, placeholder: '例如：東京賞楓五日遊' },
      { name: 'destination', label: '目的地', placeholder: '例如：日本東京' },
      { name: 'startDate', label: '出發日', type: 'date', required: true },
      { name: 'endDate', label: '回程日', type: 'date', required: true },
      { name: 'currency', label: '當地貨幣', type: 'select', default: 'TWD',
        options: CURRENCIES.map(c => ({ value: c[0], label: c[0] + ' ' + c[1] })) }
    ];
    if (canMembers) {
      fields.push({
        name: 'members', label: '成員（只有成員看得到這趟旅行）', type: 'checkboxes',
        default: Api.user.id,
        options: Api.users.map(u => ({ value: u.id, label: u.name, locked: isNew && u.id === Api.user.id }))
      });
    }
    fields.push({ name: 'note', label: '備註', type: 'textarea' });

    UI.form({
      title: isNew ? '新增旅行' : '編輯旅行',
      fields: fields,
      values: trip || {},
      submitText: isNew ? '建立' : '儲存',
      validate: v => (v.endDate < v.startDate ? '回程日不能早於出發日' : ''),
      onSubmit: async v => {
        if (isNew) {
          const created = await Api.add('trips', v);
          UI.toast('已建立旅行');
          location.hash = '#/trip/' + encodeURIComponent(created.id);
        } else {
          await Api.update('trips', trip.id, v);
          UI.toast('已儲存');
          this._forceReload = true;
          this.route();
        }
      }
    });
  },

  /* ───────── 旅行頁面 ───────── */

  async renderTrip(tripId, tabId, token) {
    const root = this.root();
    const sameTrip = this.current && this.current.trip.id === tripId && root.querySelector('.trip-head');
    if (!sameTrip) root.innerHTML = '<p class="muted center">載入行程中…</p>';
    // 同一趟旅行切換分頁時不重新下載，比較快；按「重新整理」或修改旅行資訊才重新下載
    const data = (sameTrip && !this._forceReload) ? this.current : await Api.trip(tripId);
    this._forceReload = false;
    if (token !== this._token) return;
    this.current = data;
    TabCtx.prepare(data);

    const trip = data.trip;
    const tab = this.tabs.find(x => x.id === tabId) || this.tabs[0];
    const cd = UI.countdown(trip);
    const members = String(trip.members || '').split(',').filter(Boolean)
      .map(id => '<span class="chip">' + UI.esc(Api.userName(id)) + '</span>').join('');
    const editable = Api.canEdit && !Api.offline;

    root.innerHTML =
      this.offlineBanner() +
      '<a class="back" href="#/">← 我的旅行</a>' +
      '<section class="card trip-head">' +
        '<div class="trip-card-top"><h1>' + UI.esc(trip.name) + '</h1><span class="tag ' + cd.cls + '">' + cd.text + '</span></div>' +
        '<p class="trip-dest">📍 ' + UI.esc(trip.destination || '目的地未定') + '</p>' +
        '<p class="muted small">🗓 ' + UI.range(trip.startDate, trip.endDate) + '・' + UI.tripDays(trip) + ' 天</p>' +
        '<div class="chips">' + members + '</div>' +
        (trip.note ? '<p class="note">' + UI.esc(trip.note) + '</p>' : '') +
        '<div class="head-actions">' +
          '<button class="btn btn-sm" id="reloadTrip">🔄 重新整理</button>' +
        (editable ?
          '<button class="btn btn-sm" id="editTrip">✏️ 編輯</button>' +
          (Api.isOwner(trip) ? '<button class="btn btn-sm btn-danger-ghost" id="delTrip">🗑 刪除旅行</button>' : '')
        : '') +
        '</div>' +
      '</section>' +
      (this.tabs.length > 1 ? '<nav class="tabs">' + this.tabs.map(x =>
        '<a class="tab' + (x === tab ? ' active' : '') + '" href="#/trip/' + encodeURIComponent(trip.id) + '/' + x.id + '">' +
        x.icon + ' ' + UI.esc(x.name) + '</a>').join('') + '</nav>' : '') +
      '<section id="tabRoot" class="tab-root"></section>';

    document.getElementById('reloadTrip').onclick = () => { this._forceReload = true; this.route(); };
    const edit = document.getElementById('editTrip');
    if (edit) edit.onclick = () => this.tripForm(trip);
    const del = document.getElementById('delTrip');
    if (del) del.onclick = () => {
      if (!confirm('確定刪除「' + trip.name + '」？\n行程、住宿交通、清單、記帳都會一起刪除，無法復原。')) return;
      UI.action(del, async () => {
        await Api.remove('trips', trip.id);
        UI.toast('已刪除');
        location.hash = '#/';
      });
    };

    if (tab) TabCtx.render(tab, document.getElementById('tabRoot'));
  }
};

/**
 * 分頁模組拿到的 ctx（工具箱）
 *   ctx.trip                     這趟旅行
 *   ctx.data.items / bookings…   這趟旅行的資料（陣列）
 *   ctx.canEdit                  目前用戶能不能修改
 *   await ctx.add('items', {...})          新增（tripId 自動帶入）
 *   await ctx.update('items', id, {...})   修改
 *   await ctx.remove('items', id)          刪除
 *   ctx.rerender()                         重畫目前分頁
 *   ctx.meta(row)                          「群倫 新增・3 小時前」
 */
const TabCtx = {
  prepare(data) {
    ['items', 'bookings', 'checklist', 'expenses'].forEach(k => { if (!data[k]) data[k] = []; });
    this.data = data;
  },

  render(tab, el) {
    const data = this.data;
    const ctx = {
      trip: data.trip,
      data: data,
      user: Api.user,
      canEdit: Api.canEdit && !Api.offline,
      async add(sheet, row) {
        const r = await Api.add(sheet, Object.assign({}, row, { tripId: data.trip.id }));
        data[sheet].push(r);
        Api.saveTripCache(data);
        return r;
      },
      async update(sheet, id, patch) {
        const r = await Api.update(sheet, id, patch);
        data[sheet] = data[sheet].map(x => (x.id === id ? r : x));
        Api.saveTripCache(data);
        return r;
      },
      async remove(sheet, id) {
        await Api.remove(sheet, id);
        data[sheet] = data[sheet].filter(x => x.id !== id);
        Api.saveTripCache(data);
      },
      rerender() { tab.render(el, ctx); },
      meta(row) {
        const edited = row.updatedAt && row.updatedAt !== row.createdAt;
        const who = Api.userName(edited ? row.updatedBy : row.createdBy);
        return who ? UI.esc(who) + (edited ? ' 修改' : ' 新增') + '・' + UI.timeAgo(edited ? row.updatedAt : row.createdAt) : '';
      }
    };
    tab.render(el, ctx);
  }
};
