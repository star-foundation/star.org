import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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
  // 窄屏导航曾把购买按钮压到折行（390px 两行、320px 四行并撑出 header），
  // 这两个规则是当时的修复，锁住避免回退
  assert.match(css, /@media \(max-width: \d+px\)/, '需有窄屏断点');
  assert.match(css, /\.btn \{[^}]*white-space: nowrap/, '按钮文字不得折行');
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

test('TC-LP-06 构建产物使用相对路径：项目子路径 /star.org/ 下样式不会丢失', async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'starorg-site-'));
  try {
    // 预置 OG 图，避免用例为了渲染默认分享图去启动浏览器
    mkdirSync(path.join(out, 'og'), { recursive: true });
    writeFileSync(path.join(out, 'og', 'default.png'), 'stub');
    const { buildSite, relativize } = await import('../scripts/build-site.mjs');
    await buildSite({ outDir: out, clean: false });

    const landing = readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.ok(landing.includes('href="./assets/css/site.css"'), '落地页样式需为相对路径');
    assert.ok(landing.includes('href="./registry/"'), '落地页的登记表链接需为相对路径');
    assert.ok(!/(href|src)="\/(?!\/)/.test(landing), '落地页不应残留根绝对路径');

    const registry = readFileSync(path.join(out, 'registry', 'index.html'), 'utf8');
    assert.ok(registry.includes('href="../assets/css/site.css"'), '登记表样式需上跳一级');
    assert.ok(!/(href|src)="\/(?!\/)/.test(registry), '登记表不应残留根绝对路径');

    const notFound = readFileSync(path.join(out, '404.html'), 'utf8');
    assert.ok(notFound.includes('href="./assets/css/site.css"'), '404 页样式需为相对路径');
    assert.ok(notFound.includes("var project = '/star.org/'"), '404 页需自带站点根定位脚本');

    // 层级前缀与外部链接：深度 2 上跳两级；协议相对与完整 URL 不受影响
    assert.equal(relativize('<a href="/s/x/">x</a>', 2), '<a href="../../s/x/">x</a>');
    assert.equal(relativize('<img src="/a/b.png">', 1), '<img src="../a/b.png">');
    assert.equal(relativize('<a href="//cdn.example.com/x">c</a>', 1), '<a href="//cdn.example.com/x">c</a>');
    assert.equal(relativize('<a href="https://star.org/registry/">r</a>', 0), '<a href="https://star.org/registry/">r</a>');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('永久页面向 X 分享所需的 OG / Twitter 卡片标签齐全', () => {
  const html = readFileSync(path.join(ROOT, 'site', 'permanent.html'), 'utf8');
  for (const tag of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card', 'twitter:image']) {
    assert.ok(html.includes(tag), `缺少 ${tag}`);
  }
  assert.ok(html.includes('summary_large_image'));
});
