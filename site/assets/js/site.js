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
