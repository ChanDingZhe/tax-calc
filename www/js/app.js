/* ============================================================
 * 入口：按顺序初始化各模块
 * 加载顺序（HTML 中 <script> 的顺序）：
 *   saf.js → common.js → tax.js → scanner.js → pdf.js → app.js
 * ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  try {
    Saf.init();
    Common.init();
    Tax.init();
    Scanner.init();
    PdfModule.init();
  } catch (err) {
    console.error('模块初始化失败:', err);
    alert('应用初始化失败：' + err.message);
  }
});