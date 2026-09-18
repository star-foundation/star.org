import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createSandbox, runScript, readJson, chromeAvailable } from './helpers.mjs';

const hasChrome = chromeAvailable();
const skipRender = hasChrome ? false : '未检测到 Chrome/Chromium，跳过需要重新渲染证书的用例';

/**
 * 对应《测试用例说明书》第 5 章异常场景：
 *   TC-ERR-01 支付成功但分配失败 → 人工补单
 *   TC-ERR-02 Webhook 转发丢失 → 对账 + 补单
 *   TC-ERR-03 用户要求修改姓名/献词 → 改记录后重发证书
 *   TC-ERR-04 重复提交同一订单 → 不得分配第二颗星
 */
test('TC-ERR-02 人工补单：按订单号补出登记，且 slug 可由订单号复现', () => {
  const sandbox = createSandbox({ availableStars: 2, poolSize: 3 });
  try {
    const result = runScript('manual-order.mjs', [
      '--order-id', 'LS-ORPHAN-1', '--name', 'For 小满', '--email', 'a@example.com', '--no-email',
    ], { sandbox });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.status, 'allocated');
    const record = readJson(path.join(sandbox.registrations, `${result.json.slug}.json`));
    assert.equal(record.owner_display_name, 'For 小满');
    assert.ok(!JSON.stringify(record).includes('a@example.com'));
  } finally {
    sandbox.cleanup();
  }
});

test('TC-ERR-04 补单幂等：同一订单号重复补单只占一颗星、不重复发信', () => {
  const sandbox = createSandbox({ availableStars: 2, poolSize: 3 });
  try {
    const args = ['--order-id', 'LS-ORPHAN-2', '--name', 'For Anna', '--email', 'a@example.com'];
    const first = runScript('manual-order.mjs', args, { sandbox });
    const second = runScript('manual-order.mjs', args, { sandbox });
    assert.equal(first.json.status, 'allocated');
    assert.equal(second.json.status, 'replay');
    assert.equal(second.json.slug, first.json.slug);
    assert.equal(second.json.mail.status, 'skipped', '重复触发不应再次发信');
    const pool = readJson(sandbox.poolFile);
    assert.equal(pool.stars.filter((s) => s.assigned_slug === first.json.slug).length, 1);
    assert.equal(readdirSync(sandbox.registrations).filter((f) => f.startsWith(first.json.slug)).length, 1);
  } finally {
    sandbox.cleanup();
  }
});

test('TC-ERR-03 改献词后重发：记录被更新、证书与 OG 图重新渲染、邮件重发', { skip: skipRender }, () => {
  const sandbox = createSandbox({ availableStars: 2, poolSize: 3 });
  try {
    const created = runScript('manual-order.mjs', [
      '--order-id', 'LS-EDIT-1', '--name', 'For 小满', '--email', 'a@example.com',
    ], { sandbox });
    const slug = created.json.slug;
    const before = readJson(path.join(sandbox.registrations, `${slug}.json`));
    const certBefore = readJson(path.join(sandbox.registrations, `${slug}.json`)).artifacts.certificate_sha256;

    const edited = runScript('manual-order.mjs', [
      '--slug', slug, '--name', 'For 小满', '--email', 'a@example.com',
      '--dedication', '改过之后的献词', '--force',
    ], { sandbox });
    assert.equal(edited.status, 0, edited.stderr);
    assert.equal(edited.json.status, 'replay');
    assert.equal(edited.json.slug, slug, '必须复用同一条登记，而不是新建一条');
    const steps = Object.fromEntries(edited.json.steps.map((step) => [step.step, step.status]));
    assert.equal(steps.record_update, 'updated');
    assert.equal(steps.certificate, 'rendered');
    assert.equal(steps.email, 'outbox', '应重新发送证书邮件');

    const after = readJson(path.join(sandbox.registrations, `${slug}.json`));
    assert.equal(after.dedication_message, '改过之后的献词');
    assert.equal(after.registered_at, before.registered_at, '重发不得改变登记时间');
    assert.notEqual(after.artifacts.certificate_sha256, certBefore, '证书应重新生成');
    assert.equal(readdirSync(sandbox.registrations).filter((f) => f.endsWith('.json')).length, 2, '沙盒内仍只有 1 条预置 + 1 条登记');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-ERR-02 对账脚本在未配置 API Key 时给出人工对账清单', () => {
  const sandbox = createSandbox({ availableStars: 1, poolSize: 2 });
  try {
    const result = runScript('reconcile.mjs', [], { sandbox, env: { LEMON_SQUEEZY_API_KEY: '' } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Lemon Squeezy 后台/);
    assert.match(result.stdout, /manual-order\.mjs/);
  } finally {
    sandbox.cleanup();
  }
});

test('TC-ALLOC-04 售罄时补单失败但留下可追溯记录，不产生孤立登记', () => {
  const sandbox = createSandbox({ availableStars: 0, poolSize: 2 });
  try {
    const result = runScript('manual-order.mjs', [
      '--order-id', 'LS-SOLDOUT-1', '--name', 'Anna', '--email', 'a@example.com', '--no-email',
    ], { sandbox });
    assert.equal(result.status, 3, '售罄应返回退出码 3');
    assert.equal(result.json.status, 'sold_out');
    assert.equal(readdirSync(sandbox.registrations).filter((f) => f.endsWith('.json')).length, 2, '不得新增登记记录');
  } finally {
    sandbox.cleanup();
  }
});
