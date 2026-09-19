// 站点交互：认领表检索、复制链接、X 分享、中英切换。无第三方依赖。
(function () {
  // ---- 语言切换（DECISIONS D9）----
  //
  // 页面用站点默认语言渲染，另一种语言的文案以 JSON 内嵌在 <script id="i18n-alt"> 里，
  // 切换时只替换文本、**不改变 URL**，因此永久链接保持稳定。
  // 没有 JS 时页面停留在默认语言，依然完整可读——这是选"客户端切换"的前提。
  (function languageToggle() {
    const toggle = document.querySelector('[data-lang-toggle]');
    const altScript = document.getElementById('i18n-alt');
    if (!toggle || !altScript) return;

    const root = document.documentElement;
    const defaultLocale = root.getAttribute('data-lang') || 'en';
    const altLocale = altScript.getAttribute('data-locale') || '';
    if (!altLocale) return;

    let catalog = {};
    try {
      catalog = JSON.parse(altScript.textContent || '{}');
    } catch {
      return; // 内嵌目录损坏时保持默认语言，不影响页面其余功能
    }

    const nodes = Array.from(document.querySelectorAll('[data-i18n]'));
    // 记下默认语言的原文，切回来时直接还原，不必再内嵌一份默认目录
    const originals = new Map(nodes.map((node) => [node, node.innerHTML]));
    const defaultTitle = document.title;
    const altTitle = root.getAttribute('data-alt-title') || defaultTitle;
    const selfName = toggle.getAttribute('data-self-name') || defaultLocale;
    const altName = toggle.getAttribute('data-alt-name') || altLocale;
    const defaultHtmlLang = root.getAttribute('lang') || defaultLocale;

    function render(locale) {
      const toAlt = locale === altLocale;
      nodes.forEach((node) => {
        const value = toAlt ? catalog[node.getAttribute('data-i18n')] : undefined;
        if (toAlt && value === undefined) return; // 该键没有译文，保留默认语言
        if (toAlt && value.includes('<')) {
          // 少量文案自带 <strong>/<a>；目录是构建期受信任的文件，不含用户输入
          node.innerHTML = value;
        } else if (toAlt) {
          node.textContent = value;
        } else {
          node.innerHTML = originals.get(node);
        }
      });
      root.setAttribute('data-lang', locale);
      root.setAttribute('lang', toAlt ? altLocale : defaultHtmlLang);
      document.title = toAlt ? altTitle : defaultTitle;
      toggle.textContent = toAlt ? selfName : altName;
      try {
        localStorage.setItem('starorg-lang', locale);
      } catch {
        /* 隐私模式下 localStorage 不可用，忽略 */
      }
    }

    let saved = null;
    try {
      saved = localStorage.getItem('starorg-lang');
    } catch {
      /* 忽略 */
    }
    if (saved === altLocale) render(altLocale);
    toggle.addEventListener('click', () => {
      render(root.getAttribute('data-lang') === altLocale ? defaultLocale : altLocale);
    });
  })();

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

  // 付款等待页的认领进度：轮询公开的 /data/registry-index.json（同源、无隐私字段），
  // 让客户看到"候选库已认领数"是否 +1 —— 数字变了基本就说明自己那一颗已经写入。
  // 不做任何猜测式假进度：拿不到数据就维持构建时的静态值。
  const poolCount = document.querySelector('[data-pool-count]');
  const poolFill = document.querySelector('[data-pool-fill]');
  const poolTrack = document.querySelector('[data-pool-track]');
  const poolLabel = document.querySelector('[data-pool-label]');
  const poolPercentEl = document.querySelector('[data-pool-percent]');
  const poolDone = document.querySelector('[data-pool-done]');
  if (poolCount && poolTrack) {
    const initial = Number(poolCount.textContent.trim()) || 0;
    const total = Number((poolLabel?.textContent || '').split('/')[1]) || 0;
    const render = (count) => {
      poolCount.textContent = String(count);
      if (poolLabel && total) poolLabel.textContent = count + ' / ' + total;
      if (total) {
        const pct = Math.round((count / total) * 1000) / 10;
        if (poolPercentEl) poolPercentEl.textContent = pct + '%';
        poolTrack.setAttribute('aria-valuenow', String(pct));
        if (poolFill) {
          poolFill.style.width = pct + '%';
          poolFill.classList.toggle('is-started', count > 0);
        }
      }
      if (poolDone) poolDone.hidden = count <= initial;
    };
    const poll = async () => {
      try {
        const res = await fetch('/data/registry-index.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.count === 'number') render(data.count);
      } catch {
        /* 网络失败就用静态值，不打扰客户 */
      }
    };
    render(initial);
    poll();
    window.setInterval(poll, 10000);
  }

  // 等待页的阶段文案：按经过时间推进（付款后 0-20s / 20-70s / 70s+），
  // 只做"看起来在动"的提示，不声称真实服务端状态。
  const stage = document.querySelector('[data-thanks-stage]');
  if (stage) {
    const stages = ['正在分配恒星…', '正在生成证书与永久链接…', '正在发送邮件…'];
    const startedAt = Date.now();
    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      stage.textContent = stages[elapsed < 20 ? 0 : elapsed < 70 ? 1 : 2];
    };
    tick();
    window.setInterval(tick, 5000);
  }

  // 下单前认领表单：把姓名/献词/匿名拼进 Lemon Squeezy 结算 URL 后跳转。
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
