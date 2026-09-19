import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderCertificateHtml, renderOgHtml, renderEmail } from '../scripts/lib/render.mjs';
import { buildStarView } from '../scripts/lib/view.mjs';
import { ROOT } from './helpers.mjs';

const pool = JSON.parse(readFileSync(path.join(ROOT, 'data', 'stars_pool.json'), 'utf8'));

function viewFor(recordOverrides = {}, starName = 'Vega') {
  const star = pool.stars.find((item) => item.proper_name === starName);
  const record = {
    slug: 'abcd123456',
    owner_display_name: 'For Anna',
    anonymous: false,
    dedication_message: '愿你在每个夜晚都能找到那颗星',
    registered_at: '2026-09-20T10:00:00.000Z',
    ...recordOverrides,
  };
  return buildStarView({
    star,
    record,
    slug: record.slug,
    baseUrl: 'https://star.org',
    registryUrl: 'https://star.org/registry/',
    certificateUrl: `https://star.org/certificates/${record.slug}.pdf`,
    ogImageUrl: `https://star.org/og/${record.slug}.png`,
  });
}

test('TC-PDF-01 证书字段完整性（姓名/献词/恒星数据/日期/永久链接/验证说明）', () => {
  const html = renderCertificateHtml(viewFor());
  for (const expected of [
    'For Anna',
    '愿你在每个夜晚都能找到那颗星',
    'HIP-91262',
    '18h 36m 56s',      // 赤经
    '+38° 47′ 01″',     // 赤纬
    '0.03 等',          // 视星等
    'A0V',              // 光谱型
    '25.0 光年',        // 距离
    '2026年9月20日',     // 认领日期
    'https://star.org/s/abcd123456/', // 永久链接
    '如何自行核实',       // 验证说明
    'IAU',              // 合规声明
  ]) {
    assert.ok(html.includes(expected), `证书缺少内容：${expected}`);
  }
  assert.ok(html.includes('<svg'), '证书需含星图');
  assert.ok(!html.includes('{{'), '证书模板不得残留占位符');
});

test('TC-PDF-03 无献词时排版正常，不出现占位符或空区块', () => {
  const html = renderCertificateHtml(viewFor({ dedication_message: null }));
  assert.ok(!html.includes('{{'));
  assert.ok(!html.includes('class="dedication"'), '无献词时不应渲染献词区块');
  assert.ok(html.includes('For Anna'));
});

test('TC-PDF-04 中文 / emoji / 特殊字符姓名正确渲染', () => {
  const html = renderCertificateHtml(viewFor({ owner_display_name: '献给 小满 & <家人> 🌟' }));
  assert.ok(html.includes('献给 小满 &amp; &lt;家人&gt; 🌟'), '特殊字符需被正确转义后渲染');
  assert.ok(!html.includes('<家人>'), '不得把用户输入当成 HTML');
});

test('TC-PAY-04 / TC-PAGE-05 匿名认领：页面视图不暴露姓名，证书按策略处理', () => {
  const view = viewFor({ anonymous: true, owner_display_name: null });
  assert.equal(view.displayName, null);
  assert.equal(view.anonymous, true);
  const html = renderCertificateHtml(view);
  assert.ok(html.includes('匿名认领人'));
  assert.ok(!html.includes('For Anna'));
});

test('TC-PAGE-02 OG 图包含恒星名、献词与编号', () => {
  const view = viewFor();
  const html = renderOgHtml(view);
  assert.ok(html.includes('织女星'));
  assert.ok(html.includes('愿你在每个夜晚都能找到那颗星'));
  assert.ok(html.includes('abcd123456'));
  assert.ok(html.includes('1200px'), 'OG 图尺寸需固定为 1200×630');
  assert.ok(!html.includes('{{'));
});

test('TC-MAIL-02 邮件内容完整、链接正确、无占位符', () => {
  const view = viewFor();
  const email = renderEmail(view);
  assert.ok(email.subject.includes('织女星'));
  for (const expected of [
    'https://star.org/s/abcd123456/',
    'https://star.org/certificates/abcd123456.pdf',
    'HIP-91262',
    '如何自行核实',
  ]) {
    assert.ok(email.html.includes(expected), `邮件缺少内容：${expected}`);
    assert.ok(email.text.includes(expected), `纯文本邮件缺少内容：${expected}`);
  }
  assert.ok(!email.html.includes('{{'));
  assert.ok(!email.text.includes('{{'));
});
