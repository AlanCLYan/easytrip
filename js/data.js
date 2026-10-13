/**
 * 資料層：所有和 Apps Script 溝通的動作都在這裡。
 * 每次成功讀取都會存一份在手機裡，沒有網路時自動改用這份（離線查看）。
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbzzebBUVWsnvJDvZ79Ge2u-5-mgwVnmQvIf2OnAzSCRsWldjDAZpIj2NXYfdl0OIPiM/exec';

const Store = {
  get(k, fallback) {
    try { const v = localStorage.getItem('easytrip.' + k); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  },
  set(k, v) {
    try { localStorage.setItem('easytrip.' + k, JSON.stringify(v)); } catch (e) { /* 空間不足或私密模式 */ }
  },
  clear() {
    try {
      Object.keys(localStorage).filter(k => k.startsWith('easytrip.')).forEach(k => localStorage.removeItem(k));
    } catch (e) { /* 忽略 */ }
  }
};

class AuthError extends Error {}
class OfflineError extends Error {}

const Api = {
  key: Store.get('key', ''),
  user: Store.get('user', null),     // { id, name, role }
  users: Store.get('users', []),     // 所有啟用中的用戶 [{ id, name, role }]
  offline: false,                    // 最近一次讀取是否用的是離線資料

  get loggedIn() { return !!(this.key && this.user); },
  get canEdit() { return !!this.user && (this.user.role === 'admin' || this.user.role === 'editor'); },
  isOwner(trip) { return !!this.user && (this.user.role === 'admin' || trip.createdBy === this.user.id); },
  userName(id) { const u = this.users.find(x => x.id === id); return u ? u.name : (id || ''); },

  async call(action, params, key) {
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(Object.assign({ action: action, key: key || this.key }, params || {}))
      });
    } catch (e) {
      throw new OfflineError('連不上伺服器，請確認網路');
    }
    let json;
    try { json = await res.json(); } catch (e) { throw new Error('伺服器回應格式錯誤（Apps Script 部署設定可能有誤）'); }
    if (!json.ok) {
      if (/密碼不正確|請先登入|帳號已停用/.test(json.error)) throw new AuthError(json.error);
      throw new Error(json.error);
    }
    return json.data;
  },

  async login(key) {
    key = String(key || '').trim();
    const data = await this.call('login', {}, key);
    this.key = key; this.user = data.user; this.users = data.users;
    Store.set('key', key); Store.set('user', data.user); Store.set('users', data.users);
    return data.user;
  },

  logout() {
    Store.clear();
    this.key = ''; this.user = null; this.users = [];
  },

  /* 讀取：成功就存一份；沒網路就拿上次存的 */
  async cached(cacheKey, action, params) {
    try {
      const data = await this.call(action, params);
      Store.set(cacheKey, data);
      this.offline = false;
      return data;
    } catch (e) {
      if (!(e instanceof OfflineError)) throw e;
      const saved = Store.get(cacheKey, null);
      if (saved === null) throw e;
      this.offline = true;
      return saved;
    }
  },

  async trips() {
    return this.cached('trips', 'trips');
  },

  async trip(id) {
    const data = await this.cached('trip.' + id, 'trip', { tripId: id });
    if (data.users) { this.users = data.users; Store.set('users', data.users); }
    return data;
  },

  /* 寫入：一定要有網路 */
  add(sheet, data)        { return this.call('add', { sheet: sheet, data: data }); },
  update(sheet, id, data) { return this.call('update', { sheet: sheet, id: id, data: data }); },
  remove(sheet, id)       { return this.call('remove', { sheet: sheet, id: id }); },

  /* 寫入成功後，同步更新離線那份，下次沒網路時也是最新的 */
  saveTripCache(tripData) { Store.set('trip.' + tripData.trip.id, tripData); }
};
