/* ============================================================
 * 餐饮含税计算器 (支持表达式加减乘除)
 * 对外接口：Tax.init()
 * ============================================================ */
const Tax = (() => {
  let priceEl, taxEl, totalEl, taxAmtEl, cashRoundEl;

  // 安全地计算数学表达式 (支持 + - * / 和小括号)
  function evalMathExpr(expr) {
    if (!expr || typeof expr !== 'string') return 0;
    // 只保留数字、小数点、加减乘除和括号，防止注入
    const cleanExpr = expr.replace(/[^0-9+\-*/().\s]/g, '');
    if (!cleanExpr.trim()) return 0;

    try {
      // 使用 Function 在沙箱里执行纯数学表达式计算
      const result = new Function('return (' + cleanExpr + ')')();
      return isNaN(result) || !isFinite(result) ? 0 : result;
    } catch (e) {
      return 0; // 如果表达式没写完（比如 "12+"），返回0
    }
  }

  function calculate() {
    // 解析输入框里的算式，得出基础总价
    const basePrice = evalMathExpr(priceEl.value);
    const taxRate = parseFloat(taxEl.value) || 0;
    localStorage.setItem('saved_tax_rate', taxEl.value);

    // 转换为分进行计算，避免浮点数精度问题 (如 0.1+0.2=0.30000000004)
    const priceCents = Math.round(basePrice * 100);
    const taxCents = Math.round(priceCents * (taxRate / 100));
    const totalCents = priceCents + taxCents;

    totalEl.textContent = 'RM ' + (totalCents / 100).toFixed(2);
    taxAmtEl.textContent = 'RM ' + (taxCents / 100).toFixed(2);
    cashRoundEl.textContent = 'RM ' + (Math.round((totalCents / 100) * 20) / 20).toFixed(2);
  }

  function setTax(val) {
    taxEl.value = val;
    calculate();
    priceEl.focus();
  }

  function clearPrice() {
    priceEl.value = '';
    calculate();
    priceEl.focus();
  }

  function init() {
    priceEl = document.getElementById('price');
    taxEl = document.getElementById('tax');
    totalEl = document.getElementById('total');
    taxAmtEl = document.getElementById('taxAmt');
    cashRoundEl = document.getElementById('cashRound');

    if (!priceEl || !taxEl) return;

    // 恢复上次的税率
    const savedTax = localStorage.getItem('saved_tax_rate');
    if (savedTax !== null) taxEl.value = savedTax;

    // 绑定实时输入计算
    priceEl.addEventListener('input', calculate);
    taxEl.addEventListener('input', calculate);

    // 允许按回车键快速计算（方便输完算式敲回车）
    priceEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        priceEl.blur(); // 收起键盘
        calculate();
      }
    });

    // 预设税率按钮
    document.querySelectorAll('[data-tax]').forEach(btn => {
      btn.addEventListener('click', () => setTax(btn.dataset.tax));
    });

    // 清空按钮
    const clearBtn = document.querySelector('[data-action="clear-price"]');
    if (clearBtn) clearBtn.addEventListener('click', clearPrice);

    calculate();
  }

  return { init, setTax, clearPrice };
})();