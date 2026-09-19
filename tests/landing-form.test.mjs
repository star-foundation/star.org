import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createSandbox, runScript } from './helpers.mjs';

const CHECKOUT_URL = 'https://store.lemonsqueezy.com/checkout/buy/test-variant';
const NO_CHROME = { CHROME_PATH: path.join('/nonexistent', 'chrome') };

function buildLanding(sandbox, env = {}) {
  const result = runScript('build-site.mjs', [], { sandbox, env: { ...NO_CHROME, ...env } });
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(path.join(sandbox.siteOut, 'index.html'), 'utf8');
}

test('TC-LP-09 下单前登记表单：配置结算链接后出现（姓名/献词/匿名），未配置则不出现', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const html = buildLanding(sandbox, { LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL });
    assert.ok(html.includes('data-registration-form'), '应渲染登记表单');
    assert.ok(html.includes('data-checkout-url="' + CHECKOUT_URL + '"'), '表单应携带结算链接');
    assert.ok(html.includes('name="display_name"'), '应有姓名输入框');
    assert.ok(html.includes('name="dedication"'), '应有献词输入框');
    assert.ok(html.includes('name="anonymous"'), '应有匿名选项');
    assert.ok(html.includes('/assets/js/checkout-url.mjs'), '应加载 checkout-url 纯函数模块');
    assert.ok(html.includes('去支付'), '表单内应有支付按钮');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-10 未配置结算链接：不出现登记表单', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const html = buildLanding(sandbox);
    assert.ok(!html.includes('data-registration-form'), '未配置时不应渲染登记表单');
    assert.ok(!html.includes('name="display_name"'), '未配置时不应有姓名框');
  } finally {
    sandbox.cleanup();
  }
});
