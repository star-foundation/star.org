import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCheckoutUrl } from '../site/assets/js/checkout-url.mjs';

const BASE = 'https://star-org.lemonsqueezy.com/checkout/buy/7deb7838-aa5a-43ca-852f-00aa4a2d8613';

test('TC-FORM-01 登记信息拼进 checkout[custom][...]', () => {
  const url = new URL(buildCheckoutUrl(BASE, { displayName: '李四', dedication: '愿你抬头见星光', anonymous: false }));
  assert.equal(url.searchParams.get('checkout[custom][display_name]'), '李四');
  assert.equal(url.searchParams.get('checkout[custom][dedication]'), '愿你抬头见星光');
  assert.equal(url.searchParams.get('checkout[custom][anonymous]'), 'false');
});

test('TC-FORM-02 匿名勾选后 anonymous=true', () => {
  const url = new URL(buildCheckoutUrl(BASE, { displayName: '王五', dedication: '', anonymous: true }));
  assert.equal(url.searchParams.get('checkout[custom][anonymous]'), 'true');
});

test('TC-FORM-03 姓名超过 40 字、献词超过 100 字被截断', () => {
  const url = new URL(buildCheckoutUrl(BASE, { displayName: '星'.repeat(60), dedication: '颂'.repeat(150) }));
  assert.equal([...url.searchParams.get('checkout[custom][display_name]')].length, 40);
  assert.equal([...url.searchParams.get('checkout[custom][dedication]')].length, 100);
});

test('TC-FORM-04 姓名/献词为空时不带对应参数，但 anonymous 总有', () => {
  const url = new URL(buildCheckoutUrl(BASE, { displayName: '   ', dedication: '' }));
  assert.equal(url.searchParams.get('checkout[custom][display_name]'), null);
  assert.equal(url.searchParams.get('checkout[custom][dedication]'), null);
  assert.equal(url.searchParams.get('checkout[custom][anonymous]'), 'false');
});

test('TC-FORM-05 已有其它 query 参数时保留', () => {
  const url = new URL(buildCheckoutUrl(BASE + '?discount=abc', { displayName: '赵六' }));
  assert.equal(url.searchParams.get('discount'), 'abc');
  assert.equal(url.searchParams.get('checkout[custom][display_name]'), '赵六');
});
