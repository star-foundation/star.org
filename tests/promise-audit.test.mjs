import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { flatCatalogs, LOCALES } from '../scripts/lib/i18n.mjs';

/**
 * 「已发布承诺 vs 实现状态」的回归守卫（见 docs/Star.org-承诺审计.md）。
 *
 * 这里只锁两类**已经出过问题**的文案：绝对化的永久承诺，以及站点与白皮书的等级口径分歧。
 * 它们都不会让构建失败，所以必须用测试盯住——文案类缺陷一旦上线就直接是信用问题。
 */

test('TC-PROMISE-01 站点文案不得作出「链接不会被删除」这类绝对承诺', () => {
  const flat = flatCatalogs({ reload: true });
  // 注意：只禁「绝对承诺」的表述，不禁「永久链接」这个术语本身（术语的去留是另一个决定）
  const banned = [/不会被删除/, /不会删除/, /never deleted/i, /will not be deleted/i, /永久有效/];
  const hits = [];
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(flat[locale])) {
      if (typeof value !== 'string') continue;
      for (const re of banned) {
        if (re.test(value)) hits.push(`[${locale}] ${key}: ${re}`);
      }
    }
  }
  assert.deepEqual(hits, [], `文案里出现了无法兑现的绝对承诺：\n${hits.join('\n')}`);

  // 并且必须给出有边界的说法
  assert.match(flat.zh['star.footerNote'], /只要本服务在运营/, '中文永久性说明需给出边界');
  assert.match(flat.en['star.footerNote'], /as long as this service is running/i, '英文永久性说明需给出边界');
  assert.match(flat.zh['landing.faq.a3'], /只要本服务在运营/, 'FAQ 的永久性说明需与页脚一致');
  assert.match(flat.en['landing.faq.a3'], /as long as this service is running/i, 'FAQ 的英文说明需给出边界');
});

test('TC-PROMISE-02 站点等级口径必须与白皮书一致（不得再写「当前处于信息文明一级」）', () => {
  const flat = flatCatalogs({ reload: true });
  const stale = [
    /当前处于信息文明一级/,
    /处于「信息文明一级」/,
    /Earth is at Information Civilization, Level One/,
    /currently at .{0,24}Level One/i,
  ];
  const hits = [];
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(flat[locale])) {
      if (typeof value !== 'string') continue;
      for (const re of stale) {
        if (re.test(value)) hits.push(`[${locale}] ${key}: ${re}`);
      }
    }
  }
  assert.deepEqual(hits, [], `站点仍在用已被白皮书取代的等级口径：\n${hits.join('\n')}`);

  // 新口径必须出现，且带上"估计值"的性质
  for (const locale of LOCALES) {
    assert.match(flat[locale]['landing.heroEyebrow'], /0\.7/, `[${locale}] eyebrow 需给出当前估计值`);
  }
  assert.match(flat.zh['landing.faq.a8'], /尚未达到一级/, '中文 FAQ 需说明尚未达到一级');
  assert.match(flat.en['landing.faq.a8'], /Not yet at Level One/i, '英文 FAQ 需说明尚未达到一级');
  assert.match(flat.zh['philosophy.s1Note'], /尚未达到/, '理念页需与新口径一致');
  assert.match(flat.en['philosophy.s1Note'], /has not yet reached/i, '理念页英文需与新口径一致');
});

test('TC-PROMISE-03 白皮书正文与站点采用同一等级口径（一级是门槛，不是现状）', () => {
  const zh = readFileSync(path.join(ROOT, 'docs', 'whitepaper', 'star-org-whitepaper-zh.tex'), 'utf8');
  const en = readFileSync(path.join(ROOT, 'docs', 'whitepaper', 'star-org-whitepaper-en.tex'), 'utf8');
  // 白皮书必须写明"尚未达到/not yet reached"与估计值 0.7，站点才有一致的对照基准
  assert.match(zh, /尚未达到/, '中文白皮书需写明"尚未达到一级"');
  assert.match(zh, /0\.7/, '中文白皮书需给出估计值');
  assert.match(en, /has not yet reached|not yet reached/i, '英文白皮书需写明 not yet reached');
  assert.match(en, /0\.7/, '英文白皮书需给出估计值');
});
