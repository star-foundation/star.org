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

test('TC-PAY-04 匿名登记：公开记录中不写入展示名', () => {
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
  assert.throws(() => normalizeOrder({ display_name: '   ' }), /缺少登记人姓名/);
  const order = normalizeOrder({ display_name: '<b>Anna</b>\n\n' + 'x'.repeat(80) });
  assert.ok(!order.displayName.includes('<'));
  assert.ok(order.displayName.length <= MAX_DISPLAY_NAME);
});

test('邮箱格式非法时拒绝下单', () => {
  assert.throws(() => normalizeOrder({ display_name: 'Anna', email: 'not-an-email' }), /邮箱格式不正确/);
});
