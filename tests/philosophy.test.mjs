import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, copy } from './helpers.mjs';
import { flatCatalogs, LOCALES } from '../scripts/lib/i18n.mjs';

const WHITEPAPER_DIR = path.join(ROOT, 'site', 'assets', 'whitepaper');
const WHITEPAPER_FILES = ['star-org-whitepaper-zh.pdf', 'star-org-whitepaper-en.pdf'];

/**
 * 核心理念是站点的思想源头：落地页 hero、导航与 /philosophy/ 三处都有入口，
 * 白皮书 PDF 作为交付物随仓库提交（CI 不保证装 TeX，见 docs/whitepaper/build.sh）。
 * 这些用例锁住"入口还在、产物还在、键集没漂"。
 */

test('TC-PHIL-01 两种语言的核心理念文案键齐备且一一对应', () => {
  const catalogs = flatCatalogs({ reload: true });
  const required = [
    'philosophy.eyebrow', 'philosophy.title', 'philosophy.lede',
    'philosophy.whitepaperTitle', 'philosophy.whitepaperLede', 'philosophy.whitepaperNote',
    'philosophy.whitepaperZh', 'philosophy.whitepaperEn',
    'philosophy.chainTitle', 'philosophy.ctaTitle',
    'landing.ctaPhilosophy', 'landing.ctaWhitepaper',
    'common.nav.philosophy',
  ];
  // 五条理念：每条都有标题 + 正文 + 补充说明
  for (let n = 1; n <= 5; n += 1) {
    required.push(`philosophy.s${n}Title`, `philosophy.s${n}Body`, `philosophy.s${n}Note`);
    required.push(`landing.philosophy.i${n}Title`, `landing.philosophy.i${n}Body`);
  }

  for (const locale of LOCALES) {
    for (const key of required) {
      assert.equal(
        typeof catalogs[locale][key], 'string',
        `[${locale}] 缺少核心理念文案键 ${key}`,
      );
      assert.ok(catalogs[locale][key].length > 0, `[${locale}] ${key} 为空`);
    }
  }

  // 五条理念在两种语言里必须都存在，缺一条就是"半个页面没翻译"
  const zhKeys = Object.keys(catalogs.zh).filter((k) => k.startsWith('philosophy.')).sort();
  const enKeys = Object.keys(catalogs.en).filter((k) => k.startsWith('philosophy.')).sort();
  assert.deepEqual(zhKeys, enKeys, '中英 philosophy.* 键集合必须一致');
});

test('TC-PHIL-02 白皮书位于核心理念页的 hero（banner）内，且排在理念条目之前', () => {
  const landing = readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8');
  const philosophy = readFileSync(path.join(ROOT, 'site', 'philosophy.html'), 'utf8');

  // 落地页：hero 动作区有理念入口，正文有哲学区块与白皮书入口
  assert.ok(landing.includes('href="/philosophy/"'), '落地页需有核心理念入口');
  assert.ok(landing.includes('id="philosophy"'), '落地页需有核心理念区块');
  assert.ok(landing.includes('href="{{whitepaperUrl}}"'), '落地页需给出白皮书入口（locale 感知）');

  // 理念页：白皮书必须在 hero 横幅**内部**——也就是页面上第一个 </section> 之前。
  // 这是"放到 banner 中"的可断言形式：不再是自己一个 section。
  const wpIndex = philosophy.indexOf('id="whitepaper"');
  const firstSectionEnd = philosophy.indexOf('</section>');
  const ideasIndex = philosophy.indexOf('id="ideas"');
  assert.ok(wpIndex > -1, '理念页需有白皮书块');
  assert.ok(firstSectionEnd > -1 && ideasIndex > -1, '理念页结构异常');
  assert.ok(wpIndex < firstSectionEnd, '白皮书必须在 hero（banner）内部，而不是独立 section');
  assert.ok(wpIndex < ideasIndex, '白皮书必须排在五条理念之前');

  // 两个 PDF 都要给到，且用 locale 感知的主/次按钮
  assert.ok(philosophy.includes('{{wpPrimary.url}}'), '主按钮需为 locale 感知');
  assert.ok(philosophy.includes('{{wpSecondary.url}}'), '次按钮需为 locale 感知');
});

test('TC-PHIL-12 白皮书在浏览器里直接打开，而不是强制下载', async () => {
  // 带 download 属性的链接会触发文件下载，而不是用浏览器自带的 PDF 阅读器打开。
  // 断言落在**构建产物**上：模板里的 href 是 {{...}} 占位符，只有产物才有真实 URL。
  const out = mkdtempSync(path.join(os.tmpdir(), 'starorg-wp-open-'));
  try {
    mkdirSync(path.join(out, 'og'), { recursive: true });
    writeFileSync(path.join(out, 'og', 'default.png'), 'stub');
    const { buildSite } = await import('../scripts/build-site.mjs');
    await buildSite({ outDir: out, clean: false });

    const pages = ['philosophy/index.html', 'index.html'];
    let found = 0;
    for (const rel of pages) {
      const html = readFileSync(path.join(out, rel), 'utf8');
      for (const match of html.matchAll(/<a\b[^>]*href="[^"]*\/assets\/whitepaper\/[^"]*"[^>]*>/g)) {
        found += 1;
        assert.ok(!/\sdownload(\s|>|=)/.test(match[0]),
          `${rel} 的白皮书链接不得带 download 属性：${match[0]}`);
        assert.ok(/target="_blank"/.test(match[0]),
          `${rel} 的白皮书链接需 target="_blank"（在浏览器里打开）：${match[0]}`);
        assert.ok(/rel="noopener"/.test(match[0]),
          `${rel} 的白皮书链接需 rel="noopener"：${match[0]}`);
      }
    }
    // 理念页 2 个（中/英主次按钮）+ 落地页 1 个，共 3 处
    assert.equal(found, 3, `白皮书入口数量异常（实际 ${found}）`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('TC-PHIL-03 白皮书 PDF 已提交且体量合理（不是空文件或错误页）', () => {
  for (const file of WHITEPAPER_FILES) {
    const full = path.join(WHITEPAPER_DIR, file);
    assert.ok(existsSync(full), `缺少白皮书 ${file}，请运行 npm run build:whitepaper`);
    const size = statSync(full).size;
    // 几页图文并茂的 A4 白皮书至少几十 KB；过小说明编译失败后留下了残缺文件
    assert.ok(size > 20_000, `${file} 体量异常（${size} 字节）`);
    // %PDF- 魔数：确认真的是 PDF，而不是被当成 PDF 提交的文本
    const head = readFileSync(full).subarray(0, 5).toString('latin1');
    assert.equal(head, '%PDF-', `${file} 不是合法 PDF`);
  }
});

test('TC-PHIL-04 构建产物含理念页，白皮书被复制进 _site，且路径为相对路径', async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'starorg-phil-'));
  try {
    // 预置 OG 图，避免为了渲染默认分享图去启动浏览器
    mkdirSync(path.join(out, 'og'), { recursive: true });
    writeFileSync(path.join(out, 'og', 'default.png'), 'stub');
    const { buildSite } = await import('../scripts/build-site.mjs');
    await buildSite({ outDir: out, clean: false });

    const philosophy = readFileSync(path.join(out, 'philosophy', 'index.html'), 'utf8');
    // 深度 1 的页面：根绝对路径必须被改写成上跳一级
    assert.ok(!/(href|src)="\/(?!\/)/.test(philosophy), '理念页不应残留根绝对路径');
    assert.ok(philosophy.includes('href="../assets/whitepaper/'), '理念页的白皮书链接需上跳一级');

    // 两种语言的 PDF 都要落进产物
    for (const file of WHITEPAPER_FILES) {
      assert.ok(existsSync(path.join(out, 'assets', 'whitepaper', file)), `产物缺少 ${file}`);
    }

    // sitemap 要收录理念页
    const sitemap = readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
    assert.ok(sitemap.includes('/philosophy/'), 'sitemap 需收录 /philosophy/');

    // 隐藏语言入口：中文理念页存在且 noindex
    const zh = readFileSync(path.join(out, 'zh', 'philosophy', 'index.html'), 'utf8');
    assert.ok(zh.includes('noindex'), '隐藏的中文理念页需标记 noindex');
    assert.ok(!/(href|src)="\/(?!\/)/.test(zh), '中文理念页不应残留根绝对路径');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('TC-PHIL-05 白皮书 PDF 链接的文案随语言切换（中文页主推中文版）', () => {
  const zh = copy('philosophy.whitepaperZh', 'zh');
  const en = copy('philosophy.whitepaperEn', 'en');
  assert.ok(/中文/.test(zh), '中文目录里的中文版按钮应提到"中文"');
  assert.match(en, /English/i, '英文目录里的英文版按钮应提到 English');
});
