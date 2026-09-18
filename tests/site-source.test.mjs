import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const templates = ['index.html', 'registry.html', 'permanent.html', '404.html'];

test('TC-LP-05 移动端：所有页面声明 viewport 且样式含响应式规则', () => {
  for (const name of templates) {
    const html = readFileSync(path.join(ROOT, 'site', name), 'utf8');
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1"/, `${name} 缺少 viewport`);
    assert.ok(html.includes('/assets/css/site.css'), `${name} 未引用站点样式`);
  }
  const css = readFileSync(path.join(ROOT, 'site', 'assets', 'css', 'site.css'), 'utf8');
  assert.ok(css.includes('@media (prefers-color-scheme: dark)'), '需支持深色模式');
  assert.ok(css.includes('clamp('), '标题需使用流体字号以适配小屏');
  assert.ok(css.includes('grid-template-columns: repeat(auto-fit'), '栅格需自适应换行');
});

test('站点基础文件齐全（favicon / 交互脚本 / 站点配置）', () => {
  assert.ok(readFileSync(path.join(ROOT, 'site', 'assets', 'img', 'favicon.svg'), 'utf8').startsWith('<svg'));
  const js = readFileSync(path.join(ROOT, 'site', 'assets', 'js', 'site.js'), 'utf8');
  assert.ok(js.includes('data-registry-search'), '登记表需支持检索');
  assert.ok(js.includes('data-copy'), '永久页需支持复制链接');
  const config = JSON.parse(readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
  assert.equal(config.product.maxDedicationChars, 100);
  assert.ok(config.policy.soldOutMessage);
});

test('永久页面向 X 分享所需的 OG / Twitter 卡片标签齐全', () => {
  const html = readFileSync(path.join(ROOT, 'site', 'permanent.html'), 'utf8');
  for (const tag of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card', 'twitter:image']) {
    assert.ok(html.includes(tag), `缺少 ${tag}`);
  }
  assert.ok(html.includes('summary_large_image'));
});
