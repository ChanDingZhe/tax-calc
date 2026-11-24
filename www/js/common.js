/* ============================================================
 * 通用：底部 tab 切换
 * 用法：<button class="tab-item" data-tab="tax">...
 * ============================================================ */
const Common = (() => {
  function switchTab(tabName, el) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    const page = document.getElementById('page-' + tabName);
    if (page) page.classList.add('active');
    if (el) el.classList.add('active');
  }

  function bindTabs() {
    document.querySelectorAll('.tab-item').forEach(btn => {
      btn.addEventListener('click', function () {
        switchTab(this.dataset.tab, this);
      });
    });
  }

  function init() {
    bindTabs();
    // 默认激活第一个 tab（HTML 已写死 active，这里做兜底同步）
    const firstActive = document.querySelector('.tab-item.active');
    if (firstActive) switchTab(firstActive.dataset.tab, firstActive);
  }

  return { init, switchTab };
})();