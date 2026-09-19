import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createSandbox, runScript } from './helpers.mjs';

const CHECKOUT_URL = 'https://store.lemonsqueezy.com/checkout/buy/test-variant';
const NO_CHROME = { CHROME_PATH: path.join('/nonexistent', 'chrome') };

function build(sandbox, env = {}) {
  const result = runScript('build-site.mjs', [], { sandbox, env: { ...NO_CHROME, ...env } });
  assert.equal(result.status, 0, result.stderr);
  return {
    landing: readFileSync(path.join(sandbox.siteOut, 'index.html'), 'utf8'),
    register: readFileSync(path.join(sandbox.siteOut, 'register', 'index.html'), 'utf8'),
    sitemap: readFileSync(path.join(sandbox.siteOut, 'sitemap.xml'), 'utf8'),
  };
}

test('TC-LP-09 登记表单在独立的 /register/ 页面，含姓名/献词/匿名', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const { register } = build(sandbox, { LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL });
    assert.ok(register.includes('data-registration-form'), '登记页应渲染表单');
    assert.ok(register.includes('data-checkout-url="' + CHECKOUT_URL + '"'), '表单应携带结算链接');
    assert.ok(register.includes('name="display_name"'), '应有姓名输入框');
    assert.ok(register.includes('name="dedication"'), '应有献词输入框');
    assert.ok(register.includes('name="anonymous"'), '应有匿名选项');
    assert.ok(register.includes('/assets/js/checkout-url.mjs'), '应加载 checkout-url 纯函数模块');
    assert.ok(register.includes('去支付'), '登记页应有支付按钮');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-10 落地页不再内嵌表单，三个申请入口统一指向 /register/', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const { landing } = build(sandbox, { LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL });
    assert.ok(!landing.includes('data-registration-form'), '落地页不应再内嵌表单');
    // 构建会把根路径相对化：落地页（深度 0）上是 ./register/
    const ctaCount = (landing.match(/href="\.?\/?register\/"/g) || []).length;
    assert.equal(ctaCount, 3, '导航 / 主视觉 / 购买区三个入口都应指向 /register/，实际 ' + ctaCount);
    assert.ok(!landing.includes('href="' + CHECKOUT_URL + '"'), '落地页不应再直接跳到结算页');
    const labels = landing.match(/>登记一颗星</g) || [];
    assert.equal(labels.length, 3, '三个入口文案应统一为「登记一颗星」，实际 ' + labels.length);
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-11 未配置结算链接：登记页显示通道接入中且无表单，落地页也无表单', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const { landing, register } = build(sandbox);
    assert.ok(!register.includes('data-registration-form'), '未配置时登记页不应出现表单');
    assert.ok(register.includes('购买通道接入中'), '登记页应说明通道接入中');
    assert.ok(!landing.includes('data-registration-form'), '未配置时落地页也不应有表单');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-12 登记页收录进 sitemap', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const { sitemap } = build(sandbox, { LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL });
    assert.ok(sitemap.includes('/register/'), 'sitemap 应包含登记页（绝对地址）');
  } finally {
    sandbox.cleanup();
  }
});
