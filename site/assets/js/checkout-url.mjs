// 纯函数：把登记信息拼进 Lemon Squeezy 结算 URL 的 checkout[custom][...] 参数，
// 这样 LS webhook 的 meta.custom_data 里就有 display_name / dedication / anonymous，
// 证书上就能显示客户自己填的名字与献词。零依赖，可在 Node 里直接测试。
export function buildCheckoutUrl(base, { displayName, dedication, anonymous } = {}) {
  const url = new URL(base);
  const p = url.searchParams;
  if (displayName) {
    const t = String(displayName).replace(/[\r\n\t]/g, ' ').trim();
    if (t) p.set('checkout[custom][display_name]', [...t].slice(0, 40).join(''));
  }
  if (dedication) {
    const t = String(dedication).replace(/[\r\n\t]/g, ' ').trim();
    if (t) p.set('checkout[custom][dedication]', [...t].slice(0, 100).join(''));
  }
  p.set('checkout[custom][anonymous]', anonymous ? 'true' : 'false');
  return url.toString();
}

// 暴露给经典脚本 site.js（后者用 window.location 跳转）；Node 里导入时也顺带设置。
globalThis.buildCheckoutUrl = buildCheckoutUrl;
