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

test('TC-LP-13 全站导航统一：每页都有「登记一颗星」→ 登记页，且不再内嵌结算链接', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const result = runScript('register.mjs', [], {
      sandbox,
      input: JSON.stringify({ order_id: 'NAV-1', display_name: '导航测试', status: 'paid' }),
    });
    assert.equal(result.status, 0, result.stderr);
    const { landing, register, sitemap } = build(sandbox, { LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL });
    assert.ok(sitemap.includes('/register/'), 'sitemap 应含登记页');

    const slug = result.json.slug;
    const pages = {
      'index.html': landing,
      'register/index.html': register,
      'registry/index.html': readFileSync(path.join(sandbox.siteOut, 'registry', 'index.html'), 'utf8'),
      404: readFileSync(path.join(sandbox.siteOut, '404.html'), 'utf8'),
      ['s/' + slug + '/index.html']: readFileSync(path.join(sandbox.siteOut, 's', slug, 'index.html'), 'utf8'),
    };
    for (const [name, html] of Object.entries(pages)) {
      assert.ok(html.includes('>登记一颗星<'), name + ' 导航应有统一的「登记一颗星」按钮');
      assert.ok(/href="(?:\.\.\/)*\.?\/?register\/"/.test(html), name + ' 按钮应指向登记页');
      if (name !== 'register/index.html') {
        assert.ok(!html.includes('lemonsqueezy.com/checkout'), name + ' 不应内嵌结算链接（统一经登记页）');
      }
      assert.ok(!html.includes('{{'), name + ' 不得残留模板占位符');
    }
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-14 付款完成等待页 /thanks/：可回站、带订单号提示、noindex、不进 sitemap', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const result = runScript('build-site.mjs', [], {
      sandbox,
      env: { ...NO_CHROME, LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL },
    });
    assert.equal(result.status, 0, result.stderr);
    const thanks = readFileSync(path.join(sandbox.siteOut, 'thanks', 'index.html'), 'utf8');
    assert.ok(thanks.includes('付款已收到'), '应确认付款已收到');
    assert.ok(thanks.includes('data-order-hint'), '应能展示 Lemon Squeezy 传来的订单号');
    assert.ok(thanks.includes('noindex'), '购买后过渡页应 noindex');
    assert.ok(thanks.includes('>登记一颗星<'), '导航应与其他页统一');
    assert.ok(thanks.includes('公开登记表'), '应提供回站入口');
    assert.ok(!thanks.includes('{{'), '不得残留占位符');
    const sitemap = readFileSync(path.join(sandbox.siteOut, 'sitemap.xml'), 'utf8');
    assert.ok(!sitemap.includes('/thanks/'), '过渡页不应进 sitemap');
  } finally {
    sandbox.cleanup();
  }
});
