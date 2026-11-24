/* ============================================================
 * 餐饮含税计算器
 * 对外接口：Tax.init()
 * 依赖：无
 * ============================================================ */
const Tax = (() => {
  let priceEl, taxEl, totalEl, taxAmtEl, cashRoundEl;

  function calculate() {
    const price = parseFloat(priceEl.value) || 0;
    const taxRate = parseFloat(taxEl.value) || 0;
    localStorage.setItem('saved_tax_rate', taxEl.value);

    const priceCents = Math.round(price * 100);
    const taxCents = Math.round(priceCents * (taxRate / 100));
    const total = (priceCents + taxCents) / 100;

    totalEl.textContent = 'RM ' + total.toFixed(2);
    taxAmtEl.textContent = 'RM ' + (taxCents / 100).toFixed(2);
    cashRoundEl.textContent = 'RM ' + (Math.round(total * 20) / 20).toFixed(2);
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

    if (!priceEl || !taxEl) return; // 页面不存在，直接跳过

    const savedTax = localStorage.getItem('saved_tax_rate');
    if (savedTax !== null) taxEl.value = savedTax;

    priceEl.addEventListener('input', calculate);
    taxEl.addEventListener('input', calculate);

    // 预设税率按钮
    document.querySelectorAll('[data-tax]').forEach(btn => {
      btn.addEventListener('click', () => setTax(btn.dataset.tax));
    });

    const clearBtn = document.querySelector('[data-action="clear-price"]');
    if (clearBtn) clearBtn.addEventListener('click', clearPrice);

    calculate();
  }

  return { init, setTax, clearPrice };
})();