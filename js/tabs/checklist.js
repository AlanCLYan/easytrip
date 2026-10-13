/**
 * ✅ 行前清單：打包清單和出發前待辦，旅伴共用，會顯示是誰勾的
 * 資料存在 checklist 工作表：text、group、done
 */

(function () {
  const GROUPS = [
    ['行前待辦', '📝'], ['證件文件', '🪪'], ['衣物', '👕'], ['電子用品', '🔌'],
    ['盥洗用品', '🧴'], ['藥品', '💊'], ['其他', '📦']
  ];
  const icon = g => (GROUPS.find(x => x[0] === g) || GROUPS[GROUPS.length - 1])[1];
  let lastGroup = '行前待辦';

  App.registerTab({
    id: 'checklist',
    name: '行前清單',
    icon: '✅',

    render(root, ctx) {
      const all = ctx.data.checklist;
      const done = all.filter(x => x.done).length;
      const pct = all.length ? Math.round(done / all.length * 100) : 0;

      // 依分類分組；自訂的分類排在最後
      const names = GROUPS.map(g => g[0]);
      all.forEach(x => { const g = x.group || '其他'; if (names.indexOf(g) === -1) names.push(g); });
      const sections = names.map(g => ({
        name: g,
        items: all.filter(x => (x.group || '其他') === g)
          .sort((a, b) => (a.done - b.done) || String(a.createdAt).localeCompare(String(b.createdAt)))
      })).filter(s => s.items.length);

      root.innerHTML =
        '<div class="section-head"><h2>行前清單</h2>' +
          (all.length ? '<span class="muted small">已完成 ' + done + ' / ' + all.length + '</span>' : '') +
        '</div>' +
        (all.length ? '<div class="progress"><div style="width:' + pct + '%"></div></div>' : '') +
        (ctx.canEdit
          ? '<form class="quick-add card" id="quickAdd">' +
              '<input name="text" placeholder="新增項目，例如：護照、網卡、換日圓" required autocomplete="off">' +
              '<select name="group">' + GROUPS.map(g =>
                '<option value="' + g[0] + '"' + (g[0] === lastGroup ? ' selected' : '') + '>' + g[1] + ' ' + g[0] + '</option>').join('') +
              '</select>' +
              '<button class="btn btn-primary" type="submit">新增</button>' +
            '</form>'
          : '') +
        (all.length === 0
          ? '<div class="card center empty"><p class="muted">清單是空的' + (ctx.canEdit ? '，從上面開始新增' : '') + '</p></div>'
          : sections.map(s =>
            '<section class="check-group">' +
              '<h3>' + icon(s.name) + ' ' + UI.esc(s.name) +
                ' <small class="muted">' + s.items.filter(x => x.done).length + '/' + s.items.length + '</small></h3>' +
              '<ul class="card check-list">' + s.items.map(x =>
                '<li class="check-row' + (x.done ? ' is-done' : '') + '">' +
                  '<label>' +
                    '<input type="checkbox" data-toggle="' + UI.esc(x.id) + '"' + (x.done ? ' checked' : '') + (ctx.canEdit ? '' : ' disabled') + '>' +
                    '<span class="check-text">' + UI.esc(x.text) + '</span>' +
                  '</label>' +
                  (x.done && x.updatedBy ? '<small class="muted who-done">✔ ' + UI.esc(Api.userName(x.updatedBy)) + '</small>' : '') +
                  (ctx.canEdit ? '<span class="row-actions">' +
                    '<button class="icon-btn" data-act="edit" data-id="' + UI.esc(x.id) + '" title="編輯">✏️</button>' +
                    '<button class="icon-btn" data-act="del" data-id="' + UI.esc(x.id) + '" title="刪除">🗑</button>' +
                  '</span>' : '') +
                '</li>').join('') + '</ul>' +
            '</section>').join(''));

      const form = root.querySelector('#quickAdd');
      if (form) {
        form.onsubmit = e => {
          e.preventDefault();
          const text = form.text.value.trim();
          if (!text) return;
          lastGroup = form.group.value;
          UI.action(form.querySelector('button'), async () => {
            await ctx.add('checklist', { text: text, group: lastGroup, done: false });
            ctx.rerender();
            const input = root.querySelector('#quickAdd input');
            if (input && !('ontouchstart' in window)) input.focus();
          });
        };
      }

      // 勾選：畫面先變，失敗再還原
      root.querySelectorAll('[data-toggle]').forEach(cb => {
        cb.onchange = async () => {
          const item = all.find(x => x.id === cb.dataset.toggle);
          cb.closest('.check-row').classList.toggle('is-done', cb.checked);
          cb.disabled = true;
          try {
            await ctx.update('checklist', item.id, { done: cb.checked });
          } catch (e) {
            UI.toast(e.message, true);
          }
          ctx.rerender();
        };
      });

      root.querySelectorAll('[data-act]').forEach(btn => {
        btn.onclick = () => {
          const item = all.find(x => x.id === btn.dataset.id);
          if (btn.dataset.act === 'edit') {
            UI.form({
              title: '編輯項目',
              values: item,
              fields: [
                { name: 'text', label: '項目', required: true },
                { name: 'group', label: '分類', type: 'select', options: GROUPS.map(g => ({ value: g[0], label: g[1] + ' ' + g[0] })) }
              ],
              onSubmit: async v => {
                await ctx.update('checklist', item.id, v);
                UI.toast('已儲存');
                ctx.rerender();
              }
            });
          }
          if (btn.dataset.act === 'del') {
            if (!confirm('刪除「' + item.text + '」？')) return;
            UI.action(btn, async () => {
              await ctx.remove('checklist', item.id);
              ctx.rerender();
            });
          }
        };
      });
    }
  });
})();
