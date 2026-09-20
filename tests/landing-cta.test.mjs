import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createSandbox, runScript, claimLabel, copy } from './helpers.mjs';

/**
 * 购买入口三态（对应《测试用例说明书》TC-LP-02 / TC-ALLOC-04）：
 *   未配置结算链接 → 「购买通道接入中」
 *   配置结算链接   → 按钮直接指向结算页
 *   候选库售罄     → 入口下线，并说明补货后自动恢复
 *
 * 这三种状态曾经共用同一句文案，导致候选库有 800 颗库存时，落地页却告诉访客
 * 「候选库正在补充中」。用例把这三种文案分开锁死。
 */
const CHECKOUT_URL = 'https://store.lemonsqueezy.com/checkout/buy/test-variant';
// 这些用例只关心文案与链接，渲染 OG 图会白白拉起浏览器
const NO_CHROME = { CHROME_PATH: path.join('/nonexistent', 'chrome') };

function buildLanding(sandbox, env = {}) {
  const result = runScript('build-site.mjs', [], { sandbox, env: { ...NO_CHROME, ...env } });
  assert.equal(result.status, 0, result.stderr);
  return readFileSync(path.join(sandbox.siteOut, 'index.html'), 'utf8');
}

test('TC-LP-08 未配置结算链接：显示「购买通道接入中」，不得谎称候选库正在补充', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const html = buildLanding(sandbox);
    assert.ok(html.includes(copy('state.checkoutPending')), '未配置结算链接时应显示通道接入中');
    assert.ok(html.includes(copy('state.checkoutPendingMessage')), '应说明支付通道正在接入');
    assert.ok(!html.includes(copy('state.soldOutMessage')), '库存充足时不得显示售罄文案');
    assert.ok(!html.includes(CHECKOUT_URL), '未配置时不应出现任何结算链接');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-02 配置结算链接后：购买按钮指向认领页（不再直接跳结算），且不再出现接入中文案', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const html = buildLanding(sandbox, { LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL });
    assert.ok(html.includes('register/'), '购买入口应指向认领页 /register/');
    assert.ok(html.includes(claimLabel()), '按钮文案应统一为「' + claimLabel() + '」');
    assert.ok(html.includes('US$29'), '页面应展示价格');
    assert.ok(!html.includes(copy('state.checkoutPending')), '已开启时不应出现接入中文案');
    assert.ok(!html.includes(copy('state.soldOut')), '有库存时不应出现售罄文案');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-ALLOC-04 候选库售罄：入口下线、给出补货说明，且不放出结算链接', () => {
  const sandbox = createSandbox({ availableStars: 0, poolSize: 2 });
  try {
    const html = buildLanding(sandbox, { LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL });
    assert.ok(html.includes(copy('state.soldOut')), '售罄时应显示售罄标签');
    assert.ok(html.includes(copy('state.soldOutMessage')), '售罄时应显示补货说明');
    assert.ok(html.includes(copy('state.soldOutNote')), '应说明入口会自动恢复');
    assert.ok(!html.includes(`href="${CHECKOUT_URL}"`), '售罄时不得放出结算链接');
  } finally {
    sandbox.cleanup();
  }
});
