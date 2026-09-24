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

test('TC-PHIL-02 首页即核心理念页：白皮书在 hero（banner）内，且排在理念条目之前', () => {
  // 阶段调整（DECISIONS D12）：核心理念不再是独立页面，而是站点首页。
  // 模板只剩 site/index.html 一份，/philosophy/ 由构建器渲染成它的别名。
  const home = readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8');

  // 首页 hero 就是理念主视觉
  assert.ok(home.includes('data-i18n="philosophy.eyebrow"'), '首页 hero 应是核心理念');
  assert.ok(home.includes('data-i18n="philosophy.title"'), '首页 hero 需渲染理念标题');
  assert.ok(home.includes('data-i18n="philosophy.lede"'), '首页 hero 需渲染理念导语');

  // 白皮书必须在 hero 横幅**内部**——也就是页面上第一个 </section> 之前。
  // 这是"放到 banner 中"的可断言形式：不再是自己一个 section。
  const wpIndex = home.indexOf('id="whitepaper"');
  const firstSectionEnd = home.indexOf('</section>');
  const ideasIndex = home.indexOf('id="ideas"');
  assert.ok(wpIndex > -1, '首页需有白皮书块');
  assert.ok(firstSectionEnd > -1 && ideasIndex > -1, '首页结构异常');
  assert.ok(wpIndex < firstSectionEnd, '白皮书必须在 hero（banner）内部，而不是独立 section');
  assert.ok(wpIndex < ideasIndex, '白皮书必须排在五条理念之前');

  // 两个 PDF 都要给到，且用 locale 感知的主/次按钮
  assert.ok(home.includes('{{wpPrimary.url}}'), '主按钮需为 locale 感知');
  assert.ok(home.includes('{{wpSecondary.url}}'), '次按钮需为 locale 感知');

  // 公开购买关闭期间首页不露出入口；但要保留"能重新开启"的开关（模板里不能写死）
  assert.ok(home.includes('{{#if purchaseOpen}}'), '认领入口必须由 purchaseOpen 开关控制');
  assert.ok(!home.includes('price-note'), '首页不得展示价格');
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
    // 首页 2 个（中/英主次按钮）+ /philosophy/ 别名页 2 个，共 4 处
    assert.equal(found, 4, `白皮书入口数量异常（实际 ${found}）`);
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

test('TC-PHIL-04 构建产物：首页即理念页，白皮书被复制进 _site，且路径为相对路径', async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'starorg-phil-'));
  try {
    // 预置 OG 图，避免为了渲染默认分享图去启动浏览器
    mkdirSync(path.join(out, 'og'), { recursive: true });
    writeFileSync(path.join(out, 'og', 'default.png'), 'stub');
    const { buildSite } = await import('../scripts/build-site.mjs');
    await buildSite({ outDir: out, clean: false });

    // 首页（深度 0）：根绝对路径改写成 ./
    const home = readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.ok(!/(href|src)="\/(?!\/)/.test(home), '首页不应残留根绝对路径');
    assert.ok(home.includes('href="./assets/whitepaper/'), '首页的白皮书链接需为相对路径');
    assert.ok(home.includes(copy('philosophy.title')), '首页应渲染核心理念标题');
    assert.ok(home.includes(copy('landing.faq.title')), '首页需保留 FAQ（IAU 澄清与退款政策的承载处）');

    // /philosophy/ 保留为首页别名：canonical 指回首页，深度 1 上跳一级
    const philosophy = readFileSync(path.join(out, 'philosophy', 'index.html'), 'utf8');
    assert.ok(philosophy.includes('rel="canonical" href="https://star.org/"'), '别名页的 canonical 需指回首页');
    assert.ok(!/(href|src)="\/(?!\/)/.test(philosophy), '别名页不应残留根绝对路径');
    assert.ok(philosophy.includes('href="../assets/whitepaper/'), '别名页的白皮书链接需上跳一级');

    // 两种语言的 PDF 都要落进产物
    for (const file of WHITEPAPER_FILES) {
      assert.ok(existsSync(path.join(out, 'assets', 'whitepaper', file)), `产物缺少 ${file}`);
    }

    // sitemap 收录首页与认领表；/philosophy/ 是别名，不重复收录
    const sitemap = readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
    assert.ok(sitemap.includes('<loc>https://star.org/</loc>'), 'sitemap 需收录首页');
    assert.ok(!sitemap.includes('/philosophy/'), '首页别名不应重复收录进 sitemap');

    // 隐藏语言入口：中文首页与中文别名页都存在且 noindex
    for (const rel of [['zh', 'index.html'], ['zh', 'philosophy', 'index.html']]) {
      const zh = readFileSync(path.join(out, ...rel), 'utf8');
      assert.ok(zh.includes('noindex'), '隐藏的中文页面需标记 noindex');
      assert.ok(!/(href|src)="\/(?!\/)/.test(zh), '中文页面不应残留根绝对路径');
    }
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

test('TC-PHIL-14 落地页 FAQ 含理念问答，且等级问题给出可复算的判据', () => {
  const catalogs = flatCatalogs({ reload: true });
  const keys = [];
  for (let n = 8; n <= 11; n += 1) keys.push(`landing.faq.q${n}`, `landing.faq.a${n}`);

  for (const locale of LOCALES) {
    for (const key of keys) {
      assert.equal(typeof catalogs[locale][key], 'string', `[${locale}] 缺少 ${key}`);
      assert.ok(catalogs[locale][key].length > 0, `[${locale}] ${key} 为空`);
    }
  }

  // 等级那一问必须给出判据与可复算的数字，而不是一句「因为我们是初创」：
  // 信息触达（可观测宇宙约 460 亿光年）与实体触达（旅行者一号约 172 AU）的对比。
  const zh = catalogs.zh['landing.faq.a8'];
  const en = catalogs.en['landing.faq.a8'];
  // 中文写「460 亿光年」，英文写「46 billion light-years」，数值写法不同，逐语言断言
  for (const [locale, text, levelWord, universePattern] of [
    ['zh', zh, '一级', /460\s*亿光年/],
    ['en', en, 'Level One', /46\s*billion light-years/],
  ]) {
    assert.ok(text.includes(levelWord), `[${locale}] 等级问答需给出等级结论`);
    assert.match(text, universePattern, `[${locale}] 需给出可观测宇宙尺度`);
    assert.match(text, /172\s*AU/, `[${locale}] 需给出旅行者一号距离`);
    assert.match(text, /0\.06%/, `[${locale}] 需给出两者比值`);
  }
});

test('TC-PHIL-15 核心理念就是首页主视觉：hero 由理念标题与导语承担', () => {
  const catalogs = flatCatalogs({ reload: true });
  for (const locale of LOCALES) {
    for (const key of ['philosophy.eyebrow', 'philosophy.title', 'philosophy.lede', 'philosophy.whitepaperTitle']) {
      assert.equal(typeof catalogs[locale][key], 'string', `[${locale}] 缺少 ${key}`);
      assert.ok(catalogs[locale][key].length > 0, `[${locale}] ${key} 为空`);
    }
  }
  // 集体目标（信息文明等级）改由理念第一条与 FAQ 承担，不再单列一句使命句
  assert.match(catalogs.zh['philosophy.s1Note'], /信息文明一级/, '中文理念需含等级门槛');
  assert.match(catalogs.en['philosophy.s1Note'], /Level One/i, '英文理念需含等级门槛');

  // 理念三件套必须在 hero（banner）内，而不是散落在页面别处
  const home = readFileSync(path.join(ROOT, 'site', 'index.html'), 'utf8');
  const firstSectionEnd = home.indexOf('</section>');
  for (const key of ['philosophy.eyebrow', 'philosophy.title', 'philosophy.lede']) {
    const idx = home.indexOf(`data-i18n="${key}"`);
    assert.ok(idx > -1, `首页需渲染 ${key}`);
    assert.ok(idx < firstSectionEnd, `${key} 需位于 hero（banner）内`);
  }
});
