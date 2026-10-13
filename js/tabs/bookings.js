/**
 * 🏨 住宿交通：航班、飯店、車票、租車、票券的訂位資訊
 * 資料存在 bookings 工作表：type、title、code、start、end、address、note
 */

(function () {
  const TYPES = [
    ['航班', '✈️'], ['住宿', '🏨'], ['火車巴士', '🚆'], ['租車', '🚗'], ['票券活動', '🎫'], ['其他', '📌']
  ];
  const icon = t => (TYPES.find(x => x[0] === t) || TYPES[TYPES.length - 1])[1];

  /* 試算表存「2026-11-20 14:30」，輸入框要「2026-11-20T14:30」 */
  const toInput = s => String(s || '').replace(' ', 'T').slice(0, 16);
  const fromInput = s => String(s || '').replace('T', ' ');

  function when(s) {
    const d = UI.parseDate(s);
    if (!d) return '';
    const time = (String(s).match(/\d{2}:\d{2}/) || [''])[0];
    return UI.short(d) + (time ? ' ' + time : '');
  }

  function span(b) {
    const a = when(b.start), z = when(b.end);
    if (!a && !z) return '';
    if (!z) return a;
    // 同一天只寫一次日期
    if (a && b.start.slice(0, 10) === b.end.slice(0, 10)) return a + ' → ' + (z.split(' ')[1] || '');
    return (a || '?') + ' → ' + z;
  }

  App.registerTab({
    id: 'bookings',
    name: '住宿交通',
    icon: '🏨',

    render(root, ctx) {
      const list = ctx.data.bookings.slice().sort((a, b) =>
        String(a.start || '9').localeCompare(String(b.start || '9')));

      root.innerHTML =
        '<div class="section-head"><h2>住宿交通</h2>' +
          (ctx.canEdit ? '<button class="btn btn-primary btn-sm" data-act="add">＋ 新增</button>' : '') +
        '</div>' +
        (list.length === 0
          ? '<div class="card center empty"><p class="muted">還沒有任何訂位' +
            (ctx.canEdit ? '，按「＋ 新增」記下航班、飯店、車票' : '') + '</p></div>'
          : '<div class="stack">' + list.map(b =>
            '<article class="card booking">' +
              '<div class="tl-top">' +
                '<div class="booking-title"><span class="booking-icon">' + icon(b.type) + '</span>' +
                  '<div><h3>' + UI.esc(b.title) + '</h3>' +
                  '<p class="muted small">' + UI.esc(b.type || '其他') + (span(b) ? '・' + span(b) : '') + '</p></div>' +
                '</div>' +
                (ctx.canEdit ? '<div class="tl-actions">' +
                  '<button class="icon-btn" data-act="edit" data-id="' + UI.esc(b.id) + '" title="編輯">✏️</button>' +
                  '<button class="icon-btn" data-act="del" data-id="' + UI.esc(b.id) + '" title="刪除">🗑</button>' +
                '</div>' : '') +
              '</div>' +
              (b.code ? '<button class="code" data-copy="' + UI.esc(b.code) + '" title="點一下複製">' +
                '<small>訂位代號</small><b>' + UI.esc(b.code) + '</b><span>📋</span></button>' : '') +
              (b.address ? '<a class="tl-place" href="' + UI.mapUrl(b.address) + '" target="_blank" rel="noopener">📍 ' + UI.esc(b.address) + '</a>' : '') +
              (b.note ? '<p class="note">' + UI.esc(b.note) + '</p>' : '') +
              '<p class="tl-meta">' + ctx.meta(b) + '</p>' +
            '</article>').join('') + '</div>');

      root.querySelectorAll('[data-copy]').forEach(el => {
        el.onclick = async () => {
          try { await navigator.clipboard.writeText(el.dataset.copy); UI.toast('已複製 ' + el.dataset.copy); }
          catch (e) { UI.toast('無法複製，請長按文字自行複製', true); }
        };
      });

      root.querySelectorAll('[data-act]').forEach(btn => {
        btn.onclick = () => {
          const b = ctx.data.bookings.find(x => x.id === btn.dataset.id);
          if (btn.dataset.act === 'add') openForm(ctx, null);
          if (btn.dataset.act === 'edit') openForm(ctx, b);
          if (btn.dataset.act === 'del') {
            if (!confirm('刪除「' + b.title + '」？')) return;
            UI.action(btn, async () => {
              await ctx.remove('bookings', b.id);
              UI.toast('已刪除');
              ctx.rerender();
            });
          }
        };
      });
    }
  });

  function openForm(ctx, b) {
    const start = ctx.trip.startDate ? ctx.trip.startDate + 'T00:00' : '';
    UI.form({
      title: b ? '編輯訂位' : '新增訂位',
      values: b ? Object.assign({}, b, { start: toInput(b.start), end: toInput(b.end) }) : { type: '航班', start: start },
      fields: [
        { name: 'type', label: '類型', type: 'select', options: TYPES.map(t => ({ value: t[0], label: t[1] + ' ' + t[0] })) },
        { name: 'title', label: '名稱', required: true, placeholder: '例如：BR198 桃園→成田、新宿華盛頓飯店' },
        { name: 'code', label: '訂位代號／確認碼', placeholder: '例如：6XK2PQ' },
        { name: 'start', label: '開始（起飛、入住、取車）', type: 'datetime-local' },
        { name: 'end', label: '結束（抵達、退房、還車）', type: 'datetime-local' },
        { name: 'address', label: '地址或地點', hint: '會自動產生 Google 地圖連結' },
        { name: 'note', label: '備註', type: 'textarea', placeholder: '航廈、行李額度、早餐、付款方式…' }
      ],
      validate: v => (v.start && v.end && v.end < v.start ? '結束時間不能早於開始時間' : ''),
      onSubmit: async v => {
        v.start = fromInput(v.start);
        v.end = fromInput(v.end);
        if (b) await ctx.update('bookings', b.id, v);
        else await ctx.add('bookings', v);
        UI.toast(b ? '已儲存' : '已新增');
        ctx.rerender();
      }
    });
  }
})();
