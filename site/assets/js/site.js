// 站点交互：登记表检索、复制链接、X 分享。无第三方依赖。
(function () {
  const search = document.querySelector('[data-registry-search]');
  if (search) {
    const rows = Array.from(document.querySelectorAll('[data-registry-row]'));
    const empty = document.querySelector('[data-registry-empty]');
    const apply = () => {
      const q = search.value.trim().toLowerCase();
      let visible = 0;
      rows.forEach((row) => {
        const haystack = (row.getAttribute('data-search') || '').toLowerCase();
        const hit = !q || haystack.includes(q);
        row.hidden = !hit;
        if (hit) visible += 1;
      });
      if (empty) empty.hidden = visible !== 0;
      const counter = document.querySelector('[data-registry-count]');
      if (counter) counter.textContent = String(visible);
    };
    search.addEventListener('input', apply);
    apply();
  }

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const text = button.getAttribute('data-copy');
      const original = button.textContent;
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = '已复制';
      } catch {
        button.textContent = '请手动复制';
      }
      setTimeout(() => { button.textContent = original; }, 1600);
    });
  });

  // 付款完成页：Lemon Squeezy 确认弹窗的按钮链接会带上订单号（[order_identifier]），
  // 这里读出来展示给客户，方便找客服时提供。只用 textContent，且不做任何存储或外发。
  const orderHint = document.querySelector('[data-order-hint]');
  if (orderHint) {
    const order = new URLSearchParams(window.location.search).get('order');
    if (order) {
      const safe = String(order).replace(/[^\w-]/g, '').slice(0, 64);
      if (safe) {
        orderHint.textContent = '订单号：' + safe + '（如需人工协助，请把这串提供给客服）';
        orderHint.hidden = false;
      }
    }
  }

  // 下单前登记表单：把姓名/献词/匿名拼进 Lemon Squeezy 结算 URL 后跳转。
  // URL 构建逻辑在 checkout-url.mjs（纯函数，先在页面里加载，暴露为 globalThis.buildCheckoutUrl）。
  const form = document.querySelector('[data-registration-form]');
  if (form && typeof globalThis.buildCheckoutUrl === 'function') {
    const ded = form.querySelector('[name="dedication"]');
    const counter = form.querySelector('[data-dedication-count]');
    if (ded && counter) {
      const upd = () => { counter.textContent = String([...ded.value].length); };
      ded.addEventListener('input', upd);
      upd();
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const displayName = (form.querySelector('[name="display_name"]')?.value || '').trim();
      const dedication = (ded?.value || '').trim();
      const anonymous = Boolean(form.querySelector('[name="anonymous"]')?.checked);
      const base = form.getAttribute('data-checkout-url');
      if (!displayName) return;            // 必填，浏览器 required 已拦，兜底
      if (!base) return;
      const url = globalThis.buildCheckoutUrl(base, { displayName, dedication, anonymous });
      window.location.href = url;
    });
  }
})();
