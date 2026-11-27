/* ============================================================
 * 餐饮含税计算器 (支持表达式加减乘除)
 * 对外接口：Tax.init()
 * ============================================================ */
const Tax = (() => {
  // 多了一个 basePriceEl
  let priceEl, taxEl, totalEl, taxAmtEl, cashRoundEl, basePriceEl;

  // 安全地计算数学表达式
  function evalMathExpr(expr) {
    if (!expr || typeof expr !== 'string') return 0;
    const cleanExpr = expr.replace(/[^0-9+\-*/().\s]/g, '');
    if (!cleanExpr.trim()) return 0;

    try {
      const result = new Function('return (' + cleanExpr + ')')();
      return isNaN(result) || !isFinite(result) ? 0 : result;
    } catch (e) {
      return 0;
    }
  }

  function calculate() {
    const basePrice = evalMathExpr(priceEl.value);
    const taxRate = parseFloat(taxEl.value) || 0;
    localStorage.setItem('saved_tax_rate', taxEl.value);

    // 转换为分进行计算
    const priceCents = Math.round(basePrice * 100);
    const taxCents = Math.round(priceCents * (taxRate / 100));
    const totalCents = priceCents + taxCents;

    // 更新界面
    basePriceEl.textContent = 'RM ' + (priceCents / 100).toFixed(2);  // 👈 新增：显示税前
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
    basePriceEl = document.getElementById('basePrice'); // 👈 获取新元素

    if (!priceEl || !taxEl) return;

    const savedTax = localStorage.getItem('saved_tax_rate');
    if (savedTax !== null) taxEl.value = savedTax;

    priceEl.addEventListener('input', calculate);
    taxEl.addEventListener('input', calculate);

    priceEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        priceEl.blur();
        calculate();
      }
    });

    document.querySelectorAll('[data-tax]').forEach(btn => {
      btn.addEventListener('click', () => setTax(btn.dataset.tax));
    });

    const clearBtn = document.querySelector('[data-action="clear-price"]');
    if (clearBtn) clearBtn.addEventListener('click', clearPrice);

    calculate();
  }

  return { init, setTax, clearPrice };
})();