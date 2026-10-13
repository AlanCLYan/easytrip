/**
 * easytrip 旅遊行程資料庫 — Apps Script
 *
 * 用戶由你手動在「users」工作表新增：
 *   id    英文代號（例如 alan），登入後不會改變，旅行成員用這個
 *   name  顯示名稱（例如 群倫）
 *   key   這個人的登入密碼（建議 8 碼以上，每人不同）
 *   role  admin（管理員）｜ editor（可編輯）｜ viewer（只能看）
 *         填其他文字或留空 = 停用
 *
 * 所有新增、修改、刪除都會寫入「log」工作表，並在資料列記錄是誰做的。
 */

const AUDIT = ['createdBy', 'createdAt', 'updatedBy', 'updatedAt'];

const SCHEMA = {
  users:     ['id', 'name', 'key', 'role', 'note'],
  trips:     ['id', 'name', 'destination', 'startDate', 'endDate', 'currency', 'members', 'note', ...AUDIT],
  items:     ['id', 'tripId', 'day', 'time', 'title', 'category', 'place', 'note', ...AUDIT],
  bookings:  ['id', 'tripId', 'type', 'title', 'code', 'start', 'end', 'address', 'note', ...AUDIT],
  checklist: ['id', 'tripId', 'text', 'group', 'done', ...AUDIT],
  expenses:  ['id', 'tripId', 'date', 'category', 'title', 'amount', 'currency', 'paidBy', 'splitWith', 'note', ...AUDIT],
  log:       ['time', 'userId', 'userName', 'action', 'sheet', 'rowId', 'detail']
};

const NUMBER_FIELDS = ['day', 'amount'];
const BOOL_FIELDS = ['done'];
const TRIP_CHILDREN = ['items', 'bookings', 'checklist', 'expenses'];
const WRITABLE = ['trips'].concat(TRIP_CHILDREN);
const ROLES = ['admin', 'editor', 'viewer'];
const MAX_FAILS = 20;   // 10 分鐘內密碼錯誤超過這個次數就暫停登入

/* ───────────── 建立工作表（第一次、或 SCHEMA 有新增欄位時執行） ───────────── */

function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(SCHEMA).forEach(name => {
    const cols = SCHEMA[name];
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    const lastCol = sh.getLastColumn();
    const header = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    const missing = cols.filter(c => header.indexOf(c) === -1);
    if (missing.length) sh.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
    const width = header.length + missing.length;
    sh.getRange(1, 1, 1, width).setFontWeight('bold');
    sh.setFrozenRows(1);
    // 全部設為純文字，避免日期、時間、密碼被試算表自動轉換
    if (sh.getMaxRows() > 1) sh.getRange(2, 1, sh.getMaxRows() - 1, width).setNumberFormat('@');
  });
  const def = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0) ss.deleteSheet(def);
  Logger.log('完成：已建立 ' + Object.keys(SCHEMA).join('、'));
}

/* 檢查 users 工作表有沒有填錯（手動新增用戶後執行一次） */
function checkUsers() {
  const rows = readSheet('users');
  const seen = {};
  const problems = [];
  rows.forEach((u, i) => {
    const line = '第 ' + (i + 2) + ' 列（' + (u.name || u.id || '未命名') + '）';
    if (!/^[A-Za-z0-9_-]+$/.test(u.id)) problems.push(line + '：id 只能用英文、數字、- 或 _');
    if (seen[u.id]) problems.push(line + '：id 和其他人重複');
    seen[u.id] = true;
    if (!u.name) problems.push(line + '：缺少 name');
    if (String(u.key).length < 8) problems.push(line + '：key 太短，建議 8 碼以上');
    if (rows.some(o => o !== u && o.key === u.key)) problems.push(line + '：key 和其他人相同');
    if (ROLES.indexOf(normRole(u.role)) === -1) problems.push(line + '：role 不是 admin / editor / viewer，此帳號目前停用');
  });
  Logger.log(problems.length ? '需要注意：\n' + problems.join('\n') : '全部正確，共 ' + rows.length + ' 位用戶');
}

/* ───────────── 網址入口 ───────────── */

function doGet() {
  return ContentService.createTextOutput('easytrip API 運作中');
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    const user = auth(req.key);
    out = { ok: true, data: handle(req, user) };
  } catch (err) {
    out = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function handle(req, user) {
  switch (req.action) {
    case 'login':  return { user: user, users: publicUsers() };
    case 'trips':  return readSheet('trips').filter(t => canSee(user, t));
    case 'trip':   return loadTrip(user, req.tripId);
    case 'add':    return withLock(() => addRow(user, req.sheet, req.data || {}));
    case 'update': return withLock(() => updateRow(user, req.sheet, req.id, req.data || {}));
    case 'remove': return withLock(() => removeRow(user, req.sheet, req.id));
    default: throw new Error('未知的動作：' + req.action);
  }
}

/* ───────────── 登入與權限 ───────────── */

function auth(key) {
  if (!key) throw new Error('請先登入');
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('fails') || 0);
  if (fails >= MAX_FAILS) throw new Error('密碼錯誤次數過多，請 10 分鐘後再試');
  const u = readSheet('users').find(r => r.key && r.key === String(key).trim());
  if (!u || ROLES.indexOf(normRole(u.role)) === -1) {
    cache.put('fails', String(fails + 1), 600);
    throw new Error('密碼不正確或帳號已停用');
  }
  return { id: u.id, name: u.name, role: normRole(u.role) };
}

function normRole(r) { return String(r || '').trim().toLowerCase(); }

function publicUsers() {
  return readSheet('users')
    .filter(u => ROLES.indexOf(normRole(u.role)) !== -1)
    .map(u => ({ id: u.id, name: u.name, role: normRole(u.role) }));
}

function splitIds(s) {
  return String(s || '').split(',').map(x => x.trim()).filter(Boolean);
}

function canSee(user, trip) {
  return user.role === 'admin' || splitIds(trip.members).indexOf(user.id) !== -1;
}

function checkEditor(user, sheetName) {
  if (WRITABLE.indexOf(sheetName) === -1) throw new Error('不能修改這個工作表：' + sheetName);
  if (user.role !== 'admin' && user.role !== 'editor') throw new Error('你的帳號只能檢視，不能修改');
}

function requireTrip(user, tripId) {
  const trip = readSheet('trips').find(t => t.id === String(tripId));
  if (!trip) throw new Error('找不到所屬的旅行');
  if (!canSee(user, trip)) throw new Error('你不是這趟旅行的成員');
  return trip;
}

function isOwner(user, trip) {
  return user.role === 'admin' || trip.createdBy === user.id;
}

/* ───────────── 讀取 ───────────── */

function loadTrip(user, tripId) {
  const trip = requireTrip(user, tripId);
  const res = { trip: trip, users: publicUsers() };
  TRIP_CHILDREN.forEach(n => { res[n] = readSheet(n).filter(r => r.tripId === trip.id); });
  return res;
}

/* ───────────── 寫入 ───────────── */

function addRow(user, name, data) {
  checkEditor(user, name);
  if (name === 'trips') {
    const m = splitIds(data.members);
    if (m.indexOf(user.id) === -1) m.unshift(user.id);   // 建立者自動成為成員
    data.members = m.join(',');
  } else {
    requireTrip(user, data.tripId);
  }
  const now = nowStr();
  const row = Object.assign({}, data, {
    id: newId(), createdBy: user.id, createdAt: now, updatedBy: user.id, updatedAt: now
  });
  const sh = getSheet(name);
  sh.appendRow(getHeader(sh).map(h => toCell(row[h])));
  writeLog(user, '新增', name, row.id, data);
  return row;
}

function updateRow(user, name, id, data) {
  checkEditor(user, name);
  const found = locate(name, id);
  const current = found.current;
  if (name === 'trips') {
    if (!canSee(user, current)) throw new Error('你不是這趟旅行的成員');
    if ('members' in data && !isOwner(user, current)) throw new Error('只有旅行建立者或管理員可以修改成員');
  } else {
    requireTrip(user, current.tripId);
  }
  ['id', 'tripId', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt'].forEach(k => delete data[k]);
  const next = Object.assign({}, current, data, { updatedBy: user.id, updatedAt: nowStr() });
  found.sh.getRange(found.rowIndex, 1, 1, found.header.length)
    .setValues([found.header.map(h => toCell(next[h]))]);
  writeLog(user, '修改', name, id, data);
  return next;
}

function removeRow(user, name, id) {
  checkEditor(user, name);
  const found = locate(name, id);
  const current = found.current;
  if (name === 'trips') {
    if (!isOwner(user, current)) throw new Error('只有旅行建立者或管理員可以刪除旅行');
    TRIP_CHILDREN.forEach(n => deleteWhere(n, r => r.tripId === current.id));   // 一併刪除行程內容
  } else {
    requireTrip(user, current.tripId);
  }
  found.sh.deleteRow(found.rowIndex);
  writeLog(user, '刪除', name, id, current);
  return { id: id };
}

/* ───────────── 工具 ───────────── */

function getSheet(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('找不到工作表「' + name + '」，請先執行 setup');
  return sh;
}

function getHeader(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
}

function readSheet(name) {
  const values = getSheet(name).getDataRange().getValues();
  const header = values.shift().map(String);
  const idCol = header.indexOf('id');
  return values
    .filter(r => idCol === -1 ? r.join('') !== '' : String(r[idCol]).trim() !== '')
    .map(r => toObj(header, r));
}

function toObj(header, row) {
  const o = {};
  header.forEach((h, i) => { if (h) o[h] = clean(h, row[i]); });
  return o;
}

function clean(field, v) {
  if (v instanceof Date) {
    const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
    if (v.getFullYear() < 1900) v = Utilities.formatDate(v, tz, 'HH:mm');
    else if (v.getHours() || v.getMinutes()) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm');
    else v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  if (NUMBER_FIELDS.indexOf(field) !== -1) return v === '' || v === null ? '' : Number(v);
  if (BOOL_FIELDS.indexOf(field) !== -1) return v === true || String(v).toUpperCase() === 'TRUE';
  return v === null || v === undefined ? '' : String(v).trim();
}

function toCell(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;   // 避免被當成公式
  return v;
}

function locate(name, id) {
  const sh = getSheet(name);
  const values = sh.getDataRange().getValues();
  const header = values[0].map(String);
  const idCol = header.indexOf('id');
  const idx = values.findIndex((r, i) => i > 0 && String(r[idCol]) === String(id));
  if (idx < 1) throw new Error('找不到這筆資料，可能已被其他人刪除');
  return { sh: sh, header: header, rowIndex: idx + 1, current: toObj(header, values[idx]) };
}

function deleteWhere(name, test) {
  const sh = getSheet(name);
  const values = sh.getDataRange().getValues();
  const header = values[0].map(String);
  for (let i = values.length - 1; i >= 1; i--) {
    if (test(toObj(header, values[i]))) sh.deleteRow(i + 1);
  }
}

function writeLog(user, action, name, id, data) {
  const detail = JSON.stringify(data).slice(0, 500);
  getSheet('log').appendRow([nowStr(), user.id, user.name, action, name, id, toCell(detail)]);
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function nowStr() {
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
}
