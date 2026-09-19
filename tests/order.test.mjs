import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrder, buildRegistrationRecord, MAX_DISPLAY_NAME } from '../scripts/lib/order.mjs';

test('TC-PAY-02 订单信息完整传递（姓名 / 邮箱 / 献词 / 匿名）', () => {
  const order = normalizeOrder({
    order_id: 'LS-1001',
    display_name: 'For Anna',
    email: 'anna@example.com',
    dedication: '愿你抬头就能看见',
    anonymous: false,
  });
  assert.equal(order.displayName, 'For Anna');
  assert.equal(order.email, 'anna@example.com');
  assert.equal(order.dedication, '愿你抬头就能看见');
  assert.equal(order.anonymous, false);
});

test('TC-PAY-03 献词超过 100 字按规则截断，不破坏排版', () => {
  const long = '星'.repeat(180);
  const order = normalizeOrder({ display_name: 'Anna', dedication: long });
  assert.equal([...order.dedication].length, 100);
  assert.equal(order.dedicationTruncated, true);
});

test('TC-PAY-04 匿名认领：公开记录中不写入展示名', () => {
  const order = normalizeOrder({ display_name: 'For Anna', anonymous: true, dedication: '致你' });
  const record = buildRegistrationRecord({
    slug: 'abcdefghij',
    star: { id: 'HIP-1', ra: 1, dec: 2, magnitude: 3, distance_ly: 4 },
    order,
    registeredAt: new Date().toISOString(),
  });
  assert.equal(record.owner_display_name, null);
  assert.equal(record.anonymous, true);
  assert.equal(record.dedication_message, '致你');
});

test('姓名必填且被清洗（去标签、限长）', () => {
  assert.throws(() => normalizeOrder({ display_name: '   ' }), /缺少认领人姓名/);
  const order = normalizeOrder({ display_name: '<b>Anna</b>\n\n' + 'x'.repeat(80) });
  assert.ok(!order.displayName.includes('<'));
  assert.ok(order.displayName.length <= MAX_DISPLAY_NAME);
});

test('邮箱格式非法时拒绝下单', () => {
  assert.throws(() => normalizeOrder({ display_name: 'Anna', email: 'not-an-email' }), /邮箱格式不正确/);
});

test('TC-PAY-05 未支付成功的订单不占用恒星（pending / failed / refunded）', () => {
  for (const status of ['pending', 'failed', 'refunded', 'void', 'cancelled']) {
    assert.throws(
      () => normalizeOrder({ display_name: 'Anna', status }),
      (err) => err.code === 'UNPAID_ORDER',
      `status=${status} 应被拒绝`,
    );
  }
});

test('TC-PAY-06 已付款放行；缺省状态视为可信来源（人工派发补单）', () => {
  assert.equal(normalizeOrder({ display_name: 'Anna', status: 'paid' }).displayName, 'Anna');
  assert.equal(normalizeOrder({ display_name: 'Anna', status: 'PAID' }).displayName, 'Anna');
  assert.equal(normalizeOrder({ display_name: 'Anna' }).displayName, 'Anna');
});

test('TC-PAY-07 表单自填名优先；为空时回退到持卡人姓名（绕过落地页直接下单不拒单）', () => {
  // 客户自填名存在 → 用它，忽略持卡人名
  const own = normalizeOrder({ display_name: '星野', fallback_display_name: 'Zhang San' });
  assert.equal(own.displayName, '星野');
  // 自填名为空 → 回退到持卡人名，不再以「缺少姓名」拒单
  const fallback = normalizeOrder({ display_name: '', fallback_display_name: 'Zhang San' });
  assert.equal(fallback.displayName, 'Zhang San');
  // user_name 也接受（Zap 里可直接映射 LS 的 User Name）
  assert.equal(normalizeOrder({ user_name: 'Li Si' }).displayName, 'Li Si');
  // 两者都空 → 仍然拒单
  assert.throws(
    () => normalizeOrder({ display_name: '  ', fallback_display_name: '' }),
    (err) => err.code === 'INVALID_ORDER',
  );
});

test('TC-PAY-08 匿名标志按字符串语义解析：Zapier/LS 传来 "false" 不得当成匿名', () => {
  // Lemon Squeezy 的 custom data 值都是字符串，Boolean("false") 会得到 true
  for (const [raw, expected] of [
    ['false', false], ['FALSE', false], ['False', false],
    ['true', true], ['TRUE', true],
    ['0', false], ['1', true], ['', false],
    [false, false], [true, true], [undefined, false],
  ]) {
    assert.equal(
      normalizeOrder({ display_name: 'A', anonymous: raw }).anonymous,
      expected,
      'anonymous=' + JSON.stringify(raw) + ' 应解析为 ' + expected,
    );
  }
  // 缺省与未勾选都要展示名字
  assert.equal(normalizeOrder({ display_name: 'A' }).anonymous, false);
});
