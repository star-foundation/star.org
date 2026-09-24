import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createSandbox, runScript, claimLabel, copy } from './helpers.mjs';

/**
 * 公开购买入口的开关（site.config.json → product.purchaseEnabled，DECISIONS D12）。
 *
 * 当前阶段站点只讲核心理念：首页就是理念页，全站不出现任何认领/结算链接与价格文案。
 * 但"关闭"只关对外的**露出**——认领页、结算链路与订单流程原样保留，
 * 重新开启只需把 product.purchaseEnabled 改回 true 并配好结算链接。
 *
 * 这里锁住两件事：
 *   1. 默认（关闭）时，首页连结算链接已配置也不露出任何入口；
 *   2. 显式开启后入口能回来（模板里的 {{#if purchaseOpen}} 没有被写死）。
 */
const CHECKOUT_URL = 'https://store.lemonsqueezy.com/checkout/buy/test-variant';
// 这些用例只关心文案与链接，渲染 OG 图会白白拉起浏览器
const NO_CHROME = { CHROME_PATH: path.join('/nonexistent', 'chrome') };

function buildLanding(sandbox, env = {}) {
  const result = runScript('build-site.mjs', [], { sandbox, env: { ...NO_CHROME, ...env } });
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(path.join(sandbox.siteOut, 'index.html'), 'utf8');
}

test('TC-LP-19 默认关闭：即使结算链接已配置，首页也不出现任何认领/结算入口', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const html = buildLanding(sandbox, { LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL });
    assert.ok(!html.includes('>' + claimLabel() + '<'), '关闭时不应出现「' + claimLabel() + '」按钮');
    assert.ok(!/href="(?:\.\.\/)*\.?\/?register\/"/.test(html), '关闭时不应链接到认领页');
    assert.ok(!html.includes(CHECKOUT_URL), '关闭时不应放出结算链接');
    assert.ok(!html.includes(copy('product.price')), '关闭时不应展示价格');
    assert.ok(!html.includes(copy('state.checkoutPending')), '关闭时不应出现「' + copy('state.checkoutPending') + '」');
    assert.ok(!html.includes(copy('state.soldOut')), '关闭时不应出现售罄文案');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-20 默认关闭且未配置结算链接：也不显示「购买通道接入中」', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const html = buildLanding(sandbox);
    assert.ok(!html.includes(copy('state.checkoutPending')), '关闭状态下不应出现接入中文案');
    assert.ok(!html.includes(copy('state.checkoutPendingMessage')), '关闭状态下不应出现接入中说明');
    assert.ok(!html.includes(copy('state.soldOutMessage')), '关闭状态下不应出现售罄说明');
    assert.ok(!/href="(?:\.\.\/)*\.?\/?register\/"/.test(html), '关闭状态下不应链接到认领页');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-21 显式开启（开关 + 结算链接）后入口恢复：指向认领页', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const html = buildLanding(sandbox, {
      STARORG_PURCHASE_ENABLED: 'true',
      LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL,
    });
    assert.ok(html.includes('>' + claimLabel() + '<'), '开启后应出现「' + claimLabel() + '」入口');
    assert.ok(/href="(?:\.\.\/)*\.?\/?register\/"/.test(html), '开启后入口应指向认领页 /register/');
    assert.ok(!html.includes(copy('state.checkoutPending')), '已开启时不应出现接入中文案');
    assert.ok(!html.includes(copy('state.soldOut')), '有库存时不应出现售罄文案');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-22 开关打开但没有结算链接：认领页退回「购买通道接入中」，不谎称候选库正在补充', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const result = runScript('build-site.mjs', [], {
      sandbox,
      env: { ...NO_CHROME, STARORG_PURCHASE_ENABLED: 'true' },
    });
    assert.equal(result.status, 0, result.stderr);
    // 首页不再有购买区块，通道状态由认领页承载
    const register = readFileSync(path.join(sandbox.siteOut, 'register', 'index.html'), 'utf8');
    assert.ok(register.includes(copy('state.checkoutPending')), '认领页应显示通道接入中');
    assert.ok(register.includes(copy('state.checkoutPendingMessage')), '认领页应说明支付通道正在接入');
    assert.ok(!register.includes(copy('state.soldOutMessage')), '库存充足时不得显示售罄文案');
    assert.ok(!register.includes(CHECKOUT_URL), '未配置时不应出现任何结算链接');
  } finally {
    sandbox.cleanup();
  }
});
