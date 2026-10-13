/**
 * 共用小工具：顯示文字、日期、提示訊息、表單視窗
 */

const UI = {
  /* 顯示任何資料前都要用，避免特殊符號破壞網頁 */
  esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  /* ── 日期 ── */
  WEEK: ['日', '一', '二', '三', '四', '五', '六'],
  parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  },
  dateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },
  today() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); },
  addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
  daysBetween(a, b) { return Math.round((b - a) / 86400000); },
  short(d) { return (d.getMonth() + 1) + '/' + d.getDate() + '（' + this.WEEK[d.getDay()] + '）'; },
  range(start, end) {
    const a = this.parseDate(start), b = this.parseDate(end);
    if (!a) return '日期未定';
    if (!b || +a === +b) return a.getFullYear() + '/' + this.short(a);
    return a.getFullYear() + '/' + this.short(a) + ' – ' + this.short(b);
  },
  /* 旅行共幾天（至少 1） */
  tripDays(trip) {
    const a = this.parseDate(trip.startDate), b = this.parseDate(trip.endDate);
    if (!a || !b || b < a) return 1;
    return this.daysBetween(a, b) + 1;
  },
  /* 「還有 12 天出發」「旅行中・第 2 天」「已結束」 */
  countdown(trip) {
    const a = this.parseDate(trip.startDate), b = this.parseDate(trip.endDate) || a;
    if (!a) return { text: '日期未定', cls: '' };
    const t = this.today();
    if (t < a) {
      const n = this.daysBetween(t, a);
      return { text: n === 1 ? '明天出發！' : '還有 ' + n + ' 天出發', cls: n <= 7 ? 'tag-warn' : 'tag-good' };
    }
    if (t <= b) return { text: '旅行中・第 ' + (this.daysBetween(a, t) + 1) + ' 天', cls: 'tag-hot' };
    return { text: '已結束', cls: '' };
  },
  timeAgo(s) {
    const d = new Date(String(s).replace(' ', 'T'));
    if (isNaN(d)) return '';
    const m = Math.round((Date.now() - d) / 60000);
    if (m < 1) return '剛剛';
    if (m < 60) return m + ' 分鐘前';
    if (m < 1440) return Math.round(m / 60) + ' 小時前';
    return Math.round(m / 1440) + ' 天前';
  },

  mapUrl(place) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(place);
  },

  /* ── 提示訊息 ── */
  toast(msg, isError) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast' + (isError ? ' toast-error' : '');
    el.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.hidden = true; }, isError ? 5000 : 2500);
  },

  /* 包住按鈕動作：執行中鎖住按鈕，失敗時跳出原因 */
  async action(btn, fn) {
    if (btn && btn.disabled) return;
    const label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '處理中…'; }
    try {
      return await fn();
    } catch (e) {
      if (e instanceof AuthError) { Api.logout(); App.route(); }
      UI.toast(e.message, true);
    } finally {
      if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
    }
  },

  /**
   * 表單視窗
   * UI.form({
   *   title: '新增行程',
   *   fields: [
   *     { name: 'title', label: '名稱', required: true },
   *     { name: 'day', label: '第幾天', type: 'select', options: [{ value: 1, label: 'Day 1' }] },
   *     { name: 'members', label: '成員', type: 'checkboxes', options: [...] },
   *     // type 可用：text、date、time、number、textarea、select、checkboxes
   *   ],
   *   values: { ...原本的值 },
   *   submitText: '儲存',
   *   onSubmit: async (values) => { ... }   // 丟出錯誤時視窗不會關閉
   * })
   */
  form(opt) {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    const v = opt.values || {};
    const fieldHtml = opt.fields.map(f => {
      const val = v[f.name] !== undefined ? v[f.name] : (f.default !== undefined ? f.default : '');
      const req = f.required ? ' required' : '';
      const ph = f.placeholder ? ' placeholder="' + UI.esc(f.placeholder) + '"' : '';
      let input;
      if (f.type === 'textarea') {
        input = '<textarea name="' + f.name + '" rows="3"' + req + ph + '>' + UI.esc(val) + '</textarea>';
      } else if (f.type === 'select') {
        input = '<select name="' + f.name + '"' + req + '>' + f.options.map(o =>
          '<option value="' + UI.esc(o.value) + '"' + (String(o.value) === String(val) ? ' selected' : '') + '>' + UI.esc(o.label) + '</option>'
        ).join('') + '</select>';
      } else if (f.type === 'checkboxes') {
        const chosen = Array.isArray(val) ? val.map(String) : String(val).split(',').map(s => s.trim());
        input = '<div class="checks">' + f.options.map(o =>
          '<label class="check"><input type="checkbox" name="' + f.name + '" value="' + UI.esc(o.value) + '"' +
          (chosen.indexOf(String(o.value)) !== -1 ? ' checked' : '') + (o.locked ? ' disabled' : '') + '> ' + UI.esc(o.label) + '</label>'
        ).join('') + '</div>';
      } else {
        const type = f.type || 'text';
        const extra = type === 'number' ? ' step="any" inputmode="decimal"' : '';
        input = '<input type="' + type + '" name="' + f.name + '" value="' + UI.esc(val) + '"' + req + ph + extra + '>';
      }
      return '<label class="field"><span>' + UI.esc(f.label) + (f.required ? ' <b class="req">*</b>' : '') + '</span>' + input +
        (f.hint ? '<small class="muted">' + UI.esc(f.hint) + '</small>' : '') + '</label>';
    }).join('');

    dlg.innerHTML =
      '<form method="dialog" class="dialog-body">' +
        '<h2>' + UI.esc(opt.title) + '</h2>' +
        fieldHtml +
        '<div class="dialog-actions">' +
          '<button type="button" class="btn btn-ghost" data-cancel>取消</button>' +
          '<button type="submit" class="btn btn-primary">' + UI.esc(opt.submitText || '儲存') + '</button>' +
        '</div>' +
      '</form>';
    document.body.appendChild(dlg);

    const form = dlg.querySelector('form');
    const close = () => { dlg.close(); dlg.remove(); };
    dlg.querySelector('[data-cancel]').onclick = close;
    dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });

    form.onsubmit = async e => {
      e.preventDefault();
      const out = {};
      opt.fields.forEach(f => {
        if (f.type === 'checkboxes') {
          const locked = f.options.filter(o => o.locked).map(o => String(o.value));
          const picked = [...form.querySelectorAll('input[name="' + f.name + '"]:checked')].map(i => i.value);
          out[f.name] = [...new Set(locked.concat(picked))].join(',');
        } else {
          const el = form.elements[f.name];
          let val = el.value.trim();
          if (f.type === 'number' || f.number) val = val === '' ? '' : Number(val);
          out[f.name] = val;
        }
      });
      if (opt.validate) {
        const msg = opt.validate(out);
        if (msg) { UI.toast(msg, true); return; }
      }
      const btn = form.querySelector('[type=submit]');
      let ok = false;
      await UI.action(btn, async () => { await opt.onSubmit(out); ok = true; });
      if (ok) close();
    };

    dlg.showModal();
    const first = form.querySelector('input:not([type=checkbox]), textarea, select');
    if (first && !('ontouchstart' in window)) first.focus();
  }
};
