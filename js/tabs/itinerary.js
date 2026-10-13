/**
 * 📅 每日行程
 * 資料存在試算表的 items 工作表：day（第幾天）、time、title、category、place、note
 */

(function () {
  const CATEGORIES = [
    ['景點', '🏞️'], ['餐廳', '🍜'], ['交通', '🚃'], ['購物', '🛍️'], ['住宿', '🏨'], ['其他', '📌']
  ];
  const icon = c => (CATEGORIES.find(x => x[0] === c) || CATEGORIES[CATEGORIES.length - 1])[1];
  const selected = {};   // 每趟旅行目前選的是第幾天

  function dayLabel(trip, n) {
    const start = UI.parseDate(trip.startDate);
    return start ? 'Day ' + n + '・' + UI.short(UI.addDays(start, n - 1)) : 'Day ' + n;
  }

  function defaultDay(trip, days) {
    const start = UI.parseDate(trip.startDate);
    if (!start) return 1;
    const n = UI.daysBetween(start, UI.today()) + 1;
    return n >= 1 && n <= days ? n : 1;   // 旅行中就直接打開今天
  }

  function byTime(a, b) {
    const ta = a.time || '99:99', tb = b.time || '99:99';
    return ta === tb ? String(a.createdAt).localeCompare(String(b.createdAt)) : ta.localeCompare(tb);
  }

  App.registerTab({
    id: 'plan',
    name: '每日行程',
    icon: '📅',

    render(root, ctx) {
      const trip = ctx.trip;
      const days = UI.tripDays(trip);
      const items = ctx.data.items;
      const unplanned = items.filter(i => !(i.day >= 1 && i.day <= days));
      if (!selected[trip.id]) selected[trip.id] = defaultDay(trip, days);
      let cur = selected[trip.id];
      if (cur !== 'x' && cur > days) cur = selected[trip.id] = 1;

      const dayButtons = [];
      for (let n = 1; n <= days; n++) {
        const count = items.filter(i => i.day === n).length;
        dayButtons.push('<button class="day-btn' + (cur === n ? ' active' : '') + '" data-day="' + n + '">' +
          '<b>Day ' + n + '</b><small>' + (UI.parseDate(trip.startDate) ? UI.short(UI.addDays(UI.parseDate(trip.startDate), n - 1)) : '') +
          '</small><span class="count">' + (count || '') + '</span></button>');
      }
      if (unplanned.length) {
        dayButtons.push('<button class="day-btn' + (cur === 'x' ? ' active' : '') + '" data-day="x"><b>未排定</b><small>超出日期</small>' +
          '<span class="count">' + unplanned.length + '</span></button>');
      }

      const list = (cur === 'x' ? unplanned : items.filter(i => i.day === cur)).slice().sort(byTime);

      root.innerHTML =
        '<div class="daybar">' + dayButtons.join('') + '</div>' +
        '<div class="section-head">' +
          '<h2>' + (cur === 'x' ? '未排定（日期在旅行範圍外）' : dayLabel(trip, cur)) + '</h2>' +
          (ctx.canEdit ? '<button class="btn btn-primary btn-sm" data-act="add">＋ 新增</button>' : '') +
        '</div>' +
        (list.length === 0
          ? '<div class="card center empty"><p class="muted">這天還沒有安排' + (ctx.canEdit ? '，按「＋ 新增」開始' : '') + '</p></div>'
          : '<ol class="timeline">' + list.map(i =>
            '<li class="tl-item">' +
              '<div class="tl-time">' + (i.time ? UI.esc(i.time) : '—') + '</div>' +
              '<div class="tl-dot">' + icon(i.category) + '</div>' +
              '<div class="tl-body card">' +
                '<div class="tl-top">' +
                  '<h3>' + UI.esc(i.title) + '</h3>' +
                  (ctx.canEdit ? '<div class="tl-actions">' +
                    '<button class="icon-btn" data-act="edit" data-id="' + UI.esc(i.id) + '" title="編輯">✏️</button>' +
                    '<button class="icon-btn" data-act="del" data-id="' + UI.esc(i.id) + '" title="刪除">🗑</button>' +
                  '</div>' : '') +
                '</div>' +
                (i.place ? '<a class="tl-place" href="' + UI.mapUrl(i.place) + '" target="_blank" rel="noopener">📍 ' + UI.esc(i.place) + '</a>' : '') +
                (i.note ? '<p class="note">' + UI.esc(i.note) + '</p>' : '') +
                '<p class="tl-meta">' + ctx.meta(i) + '</p>' +
              '</div>' +
            '</li>').join('') + '</ol>');

      root.querySelectorAll('[data-day]').forEach(b => {
        b.onclick = () => {
          selected[trip.id] = b.dataset.day === 'x' ? 'x' : Number(b.dataset.day);
          ctx.rerender();
        };
      });
      const active = root.querySelector('.day-btn.active');
      if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });

      root.querySelectorAll('[data-act]').forEach(b => {
        b.onclick = () => {
          const item = items.find(x => x.id === b.dataset.id);
          if (b.dataset.act === 'add') openForm(ctx, null, cur === 'x' ? 1 : cur);
          if (b.dataset.act === 'edit') openForm(ctx, item);
          if (b.dataset.act === 'del') {
            if (!confirm('刪除「' + item.title + '」？')) return;
            UI.action(b, async () => {
              await ctx.remove('items', item.id);
              UI.toast('已刪除');
              ctx.rerender();
            });
          }
        };
      });
    }
  });

  function openForm(ctx, item, day) {
    const days = UI.tripDays(ctx.trip);
    const dayOptions = [];
    for (let n = 1; n <= days; n++) dayOptions.push({ value: n, label: dayLabel(ctx.trip, n) });
    if (item && !(item.day >= 1 && item.day <= days)) dayOptions.push({ value: item.day || '', label: '（原本的日期）' });

    UI.form({
      title: item ? '編輯行程' : '新增行程',
      values: item || { day: day, category: '景點' },
      fields: [
        { name: 'day', label: '日期', type: 'select', number: true, options: dayOptions },
        { name: 'time', label: '時間', type: 'time', hint: '可留空' },
        { name: 'category', label: '類型', type: 'select', options: CATEGORIES.map(c => ({ value: c[0], label: c[1] + ' ' + c[0] })) },
        { name: 'title', label: '名稱', required: true, placeholder: '例如：淺草寺' },
        { name: 'place', label: '地點', placeholder: '地名或地址', hint: '會自動產生 Google 地圖連結' },
        { name: 'note', label: '備註', type: 'textarea', placeholder: '門票、營業時間、必吃…' }
      ],
      onSubmit: async v => {
        if (item) await ctx.update('items', item.id, v);
        else await ctx.add('items', v);
        selected[ctx.trip.id] = v.day;
        UI.toast(item ? '已儲存' : '已新增');
        ctx.rerender();
      }
    });
  }
})();
