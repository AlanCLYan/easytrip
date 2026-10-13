/**
 * 新分頁範本（這個檔案不會被載入）
 *
 * 使用方式：
 *   1. 複製這個檔案，改名，例如 js/tabs/memo.js
 *   2. 修改標 ★ 的地方
 *   3. 在 index.html 的分頁區加一行 <script src="js/tabs/memo.js"></script>
 *   4. 如果要存新的資料：Apps Script 的 SCHEMA、TRIP_CHILDREN 加上工作表，
 *      執行 setup，再部署新版本（詳見 README）
 *
 * 這個範本用 items 工作表示範，顯示這趟旅行全部的行程名稱。
 */

(function () {
  App.registerTab({
    id: 'example',          // ★ 網址代號 → #/trip/<旅行id>/example
    name: '範例分頁',        // ★ 分頁名稱
    icon: '🧩',             // ★ 分頁圖示

    render(root, ctx) {
      const rows = ctx.data.items;   // ★ 要顯示的資料

      root.innerHTML =
        '<div class="section-head"><h2>範例分頁</h2>' +
          (ctx.canEdit ? '<button class="btn btn-primary btn-sm" id="exAdd">＋ 新增</button>' : '') +
        '</div>' +
        '<ul class="card check-list">' +
          rows.map(r => '<li class="check-row">' + UI.esc(r.title) +
            ' <small class="muted">' + ctx.meta(r) + '</small></li>').join('') +
        '</ul>';

      const add = root.querySelector('#exAdd');
      if (add) add.onclick = () => UI.form({
        title: '新增',
        fields: [{ name: 'title', label: '名稱', required: true }],
        onSubmit: async v => {
          await ctx.add('items', Object.assign({ day: 1 }, v));   // tripId 會自動帶入
          UI.toast('已新增');
          ctx.rerender();
        }
      });
    }
  });
})();
