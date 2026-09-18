import test from 'node:test';
import assert from 'node:assert/strict';
import { runScript } from './helpers.mjs';
import { BANNED_TERMS, BANNED_ENGLISH, BANNED_PAYMENT_HOSTS } from '../scripts/check-compliance.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

test('TC-COMP-01 站点源文件与模板不含禁用措辞', () => {
  const files = [
    'site/index.html', 'site/registry.html', 'site/permanent.html', 'site/404.html',
    'templates/certificate.html', 'templates/og-image.html', 'templates/email.html', 'templates/email.txt',
  ];
  const hits = [];
  for (const file of files) {
    const content = readFileSync(path.join(ROOT, file), 'utf8');
    for (const term of BANNED_TERMS) if (content.includes(term)) hits.push(`${file} → ${term}`);
    for (const re of BANNED_ENGLISH) {
      const match = re.exec(content);
      if (match) hits.push(`${file} → ${match[0]}`);
    }
    for (const host of BANNED_PAYMENT_HOSTS) if (content.toLowerCase().includes(host)) hits.push(`${file} → ${host}`);
  }
  assert.deepEqual(hits, [], `发现禁用措辞：\n${hits.join('\n')}`);
});

test('TC-COMP-02 / TC-COMP-04 落地页包含 IAU 澄清与退款政策', () => {
  const landing = readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8');
  assert.ok(landing.includes('IAU'));
  assert.ok(landing.includes('不是'), '需明确回答"不是官方命名"');
  assert.ok(landing.includes('退款'));
  assert.ok(landing.includes('纪念性质'));
});

test('TC-COMP-03 结算入口仅指向 Lemon Squeezy（法币渠道）', () => {
  const config = JSON.parse(readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
  const checkout = config.product.checkoutUrl;
  if (checkout) assert.match(checkout, /lemonsqueezy\.com/);
  const landing = readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8');
  assert.ok(!/checkoutUrl}}.*(coinbase|nowpayments|btcpay)/i.test(landing));
});

test('合规扫描脚本在真实仓库上通过', () => {
  const result = runScript('check-compliance.mjs', []);
  assert.equal(result.status, 0, `合规扫描未通过：\n${result.stdout}`);
});
