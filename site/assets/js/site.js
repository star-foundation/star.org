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
})();
