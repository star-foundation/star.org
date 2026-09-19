#!/usr/bin/env node
/**
 * 静态站点构建：把 site/ 模板 + data/ 数据编译为 _site/（GitHub Pages 直接托管）。
 *
 * 产物：
 *   /                    落地页
 *   /registry/           公开可验证认领表（无需登录）
 *   /s/{slug}/           每条认领的永久链接页面
 *   /certificates/*.pdf  证书下载
 *   /og/*.png            OG 分享图
 *   /data/*.json         公开认领数据（供任何访客自行核对）
 *   404.html / sitemap.xml / robots.txt / CNAME
 */
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS, loadConfig, registrationUrl, certificateUrl, ogImageUrl } from './lib/config.mjs';
import { ensureDir, writeFileAtomic, writeJsonAtomic, removeIfExists } from './lib/fsx.mjs';
import { readPool } from './lib/pool.mjs';
import { buildRegistryIndex, sortedRegistrations } from './lib/registry.mjs';
import { buildStarView } from './lib/view.mjs';
import { starTitle, starSubtitle, formatRa, formatDec, formatMagnitude, formatDistance } from './lib/astro.mjs';
import { formatDate } from './lib/i18n.mjs';

/** 匿名认领在公开页面上显示的占位名（与目录里的 star.anonymousOwner 同义） */
function anonymousLabel(locale) {
  return locale === 'en' ? 'Anonymous claimer' : '匿名认领人';
}
import { render } from './lib/template.mjs';
import {
  resolveDefaultLocale, otherLocale, htmlLang, loadCatalogs, interpolateCatalog,
  flattenCatalog, switchableKeys, missingKeysFor, buildAltCatalogScript,
  buildJsCatalogScript,
} from './lib/i18n.mjs';
import { renderOgHtml } from './lib/render.mjs';
import { renderPng } from './lib/chrome.mjs';

function tpl(name) {
  return readFileSync(path.join(PATHS.siteSrc, name), 'utf8');
}

/** og:locale 用的是「语言_地区」格式，与 HTML lang 不完全一样 */
function ogLocale(locale) {
  return locale === 'zh' ? 'zh_CN' : 'en_US';
}

/**
 * 渲染一个页面，并自动完成文案层的两件事：
 *
 *   1. 从**渲染产物**里抽出所有 data-i18n 键，校验它们在每种语言里都存在，
 *      缺任何一条就直接构建失败——避免"页面上有个标题永远切不动"这种隐性残缺。
 *   2. 把另一种语言的目录（只含本页用到的键）内嵌成 JSON，供客户端切换读取。
 *
 * 为什么要渲染两遍：真实键名有一部分是构建期动态拼进 data-i18n 的
 * （data-i18n="{{entryLabelKey}}"），只有渲染后才知道键名；而内嵌脚本又要写回页面里。
 */
function renderPage(name, scope) {
  const template = tpl(name);
  const probe = render(template, { ...scope, i18nAltScript: '' });
  const keys = [...switchableKeys(probe)];
  const missing = missingKeysFor(keys);
  if (missing.length > 0) {
    const detail = missing.map((m) => `${m.key}（缺 ${m.locales.join('、')}）`).join('；');
    throw new Error(`${name} 引用了不存在的文案键：${detail}`);
  }
  return render(template, {
    ...scope,
    i18nAltScript: buildAltCatalogScript(scope.altLocale, scope.tAltFlat ?? {}, keys),
  });
}

function copyDir(from, to) {
  if (!existsSync(from)) return 0;
  cpSync(from, to, { recursive: true });
  return readdirSync(to).length;
}

function copyAssets(outDir) {
  copyDir(path.join(PATHS.siteSrc, 'assets'), path.join(outDir, 'assets'));
}

/**
 * 把根绝对路径（/assets/…、/registry/…）改写为相对路径。
 *
 * GitHub Pages 的项目页托管在 /<repo>/ 子路径下（例如 /star.org/），此时根绝对路径
 * 会指向域名根并 404，导致样式与脚本全部加载失败；相对路径在「自定义域名根路径」与
 * 「项目子路径」两种部署下都能正确解析。
 * depth = 页面相对站点根的层级：落地页与 404 为 0，/registry/ 为 1，/s/{slug}/ 为 2。
 */
export function relativize(html, depth) {
  const prefix = depth === 0 ? './' : '../'.repeat(depth);
  return html.replace(
    /(\s(?:href|src)=")\/(?!\/)([^"]*)"/g,
    (_, head, target) => `${head}${prefix}${target}"`,
  );
}

/**
 * 落地页「你会拿到什么」展示的内容。
 *
 * 优先展示**最近一条真实认领**（含认领人与献词）——既是社会证明，也让访客在购买前
 * 看到真实交付物，而不是一个虚构样例。没有认领记录时回退到内置示例并明确标注「示例数据」。
 */
function sampleView(cfg, records = [], locale = 'zh') {
  const latest = records[0] ?? null;
  if (latest) {
    const view = buildStarView({
      star: latest.star,
      record: latest,
      slug: latest.slug,
      baseUrl: cfg.site.baseUrl,
      registryUrl: `${cfg.site.baseUrl}/registry/`,
      certificateUrl: certificateUrl(latest.slug),
      ogImageUrl: ogImageUrl(latest.slug),
      certificatePublic: latest.artifacts?.certificate_public !== false,
      locale,
    });
    return {
      isReal: true,
      starId: view.starId,
      starTitle: view.starTitle,
      starSubtitle: view.starSubtitle,
      raText: view.raText,
      decText: view.decText,
      magnitudeText: view.magnitudeText,
      distanceText: view.distanceText,
      spectralText: view.spectralText,
      // 匿名认领不展示姓名（与认领表、永久页一致）
      displayName: view.anonymous ? anonymousLabel(locale) : view.displayName,
      anonymous: view.anonymous,
      dedication: view.dedication,
      registeredDate: view.registeredDate,
      slug: view.slug,
      permalink: view.permalink,
      simbadUrl: view.simbadUrl,
      simbadIdent: view.simbadIdent,
    };
  }
  // 没有真实认领时的内置示例：同样按当前语言渲染，否则英文站会露出中文示例
  const demoStar = {
    id: 'HIP-91262', proper_name: 'Vega', constellation: 'Lyr', bayer: 'Alp', hd: 172167,
    magnitude: 0.03, distance_ly: 25.0, spectral_type: 'A0V', ra: 279.2347, dec: 38.7837,
  };
  return {
    isReal: false,
    starId: 'HIP-91262',
    starTitle: starTitle(demoStar, locale),
    starSubtitle: starSubtitle(demoStar, locale),
    raText: formatRa(demoStar.ra),
    decText: formatDec(demoStar.dec),
    magnitudeText: formatMagnitude(demoStar.magnitude, locale),
    distanceText: formatDistance(demoStar.distance_ly, locale),
    spectralText: 'A0V',
    displayName: 'For Anna',
    anonymous: false,
    dedication: locale === 'en'
      ? 'For the star you look up at every night.'
      : '愿你在每一个抬头看天的夜晚，都能找到属于自己的那一颗。',
    registeredDate: formatDate('2026-09-20T00:00:00Z', locale),
    slug: 'sample',
    permalink: `${cfg.site.baseUrl}/s/sample`,
    simbadUrl: `https://simbad.cds.unistra.fr/simbad/sim-id?Ident=HIP+91262`,
    simbadIdent: 'HIP 91262',
  };
}

async function buildDefaultOg(cfg, outDir, locale = 'zh') {
  const file = path.join(outDir, 'og', 'default.png');
  if (existsSync(file)) return { status: 'exists', file };
  try {
    renderPng(
      renderOgHtml({
        // 默认 OG 图保持固定的示例内容：社交平台会缓存 OG 图，跟着最新认领变动
        // 会让卡片反复失效。真实的最新认领展示在落地页正文里。
        ...sampleView(cfg, [], locale),
        slug: 'star-org',
        starFieldSvg: '',
        brandName: cfg.site.name,
      }),
      file,
      { width: 1200, height: 630 },
    );
    return { status: 'rendered', file };
  } catch (error) {
    return { status: 'skipped', reason: error.message };
  }
}

export async function buildSite({ outDir = PATHS.out, clean = true } = {}) {
  const cfg = loadConfig();
  const warnings = [];
  if (clean) removeIfExists(outDir);
  ensureDir(outDir);

  const pool = readPool();
  const index = buildRegistryIndex();
  const records = sortedRegistrations();
  const available = pool.stars.filter((s) => s.status === 'available').length;
  const soldOut = available === 0;
  const checkoutConfigured = Boolean(cfg.site.checkoutUrl);
  const checkoutReady = checkoutConfigured && !soldOut;
  // 购买入口有三种状态，文案必须分开：售罄（补货后自动恢复）与「通道尚未接入」
  // 是两件完全不同的事，混用会让访客以为候选库空了，而实际库存是充足的。
  const checkoutPending = !checkoutConfigured;

  // ---- 文案层（阶段 1 起：文案唯一来源是 site/i18n/*.json）----
  const locale = resolveDefaultLocale();
  const altLocale = otherLocale(locale);
  const baseVars = {
    siteName: cfg.site.name,
    supportEmail: cfg.site.supportEmail,
    year: new Date().getFullYear(),
  };
  // 目录里可能带 {{siteName}} / {{supportEmail}} / {{price}} 之类的占位符，先解析再喂模板
  const nested = loadCatalogs()[locale];
  const pricing = { price: nested.product.price, priceNote: nested.product.priceNote };
  // maxChars 供 "最多 N 字" 这类文案复用，避免同一个上限写死在多处
  const vars = { ...baseVars, ...pricing, maxChars: cfg.product.maxDedicationChars };
  const t = interpolateCatalog(loadCatalogs()[locale], vars);
  const tAlt = interpolateCatalog(loadCatalogs()[altLocale], vars);
  // 逐页目录：某些文案带页面级占位符（如 {{registryCount}}、{{poolTotal}}），
  // 基础变量解析不了，用这个补上再喂模板。
  const pageCatalog = (extra = {}) => interpolateCatalog(loadCatalogs()[locale], { ...vars, ...extra });
  const pageCatalogFor = (loc, extra = {}) => interpolateCatalog(loadCatalogs()[loc], { ...vars, ...extra });
  const pageCatalogAlt = (extra = {}) => interpolateCatalog(loadCatalogs()[altLocale], { ...vars, ...extra });
  // 购买入口的状态文案也来自目录，配置里不再保留第二份
  const entryLabelKey = soldOut ? 'state.soldOut' : 'state.checkoutPending';
  const entryMessageKey = soldOut ? 'state.soldOutMessage' : 'state.checkoutPendingMessage';
  const entryLabel = t.state[soldOut ? 'soldOut' : 'checkoutPending'];
  const entryMessage = t.state[soldOut ? 'soldOutMessage' : 'checkoutPendingMessage'];

  const latest = records[0] ?? null;
  // 认领进度（公开认领表与付款等待页共用）：已认领 / 候选库总数
  const poolTotal = pool.stars.length || 1;
  const poolPercent = Math.round((index.count / poolTotal) * 1000) / 10;
  const poolStarted = index.count > 0;

  const common = {
    siteName: cfg.site.name,
    domain: cfg.site.domain,
    baseUrl: cfg.site.baseUrl,
    year: baseVars.year,
    supportEmail: cfg.site.supportEmail,
    registryRepoUrl: cfg.site.registryRepoUrl,
    registryDirUrl: cfg.site.registryDirUrl,
    registryUrl: `${cfg.site.baseUrl}/registry/`,
    priceDisplay: t.product.price,
    priceNote: t.product.priceNote,
    maxDedicationChars: cfg.product.maxDedicationChars,
    checkoutUrl: cfg.site.checkoutUrl,
    checkoutReady,
    checkoutConfigured,
    checkoutPending,
    soldOut,
    entryLabel,
    entryLabelKey,
    entryMessage,
    entryMessageKey,
    t,
    locale,
    altLocale,
    htmlLang: htmlLang(locale),
    ogLocale: ogLocale(locale),
    altLangName: tAlt.common.lang.name,
    selfLangName: t.common.lang.name,
    altTitle: `${cfg.site.name} · ${tAlt.brand.tagline}`,
    // 给前端脚本用的双语目录（付款等待页的动态文案靠它）
    i18nJsScript: buildJsCatalogScript(locale, altLocale),
    registryCount: index.count,
    availableCount: available,
    poolTotal,
    poolPercent,
    poolStarted,
    latestSlug: latest?.slug ?? null,
    latestUrl: latest ? registrationUrl(latest.slug) : null,
    defaultOgImage: `${cfg.site.baseUrl}/og/default.png`,
    // GitHub Pages 项目页的部署子路径（如 /star.org/）：404 页会在任意路径下被展示，
    // 需要用它在运行时定位站点根。
    projectBase: `/${cfg.site.registryRepoUrl.split('/').filter(Boolean).pop() || 'star.org'}/`,
  };

  // 落地页
  // 示例区的文案里带 {{count}} / {{slug}} / {{ident}}，这些值只有拿到 sample 之后才知道，
  // 所以落地页用自己那一份目录（在基础变量上补这三个值），不从 common.t 复用。
  const sample = sampleView(cfg, records, locale);
  const sampleVars = {
    ...vars,
    count: index.count,
    slug: sample.slug,
    ident: sample.simbadIdent,
  };
  const sampleKey = sample.isReal ? 'Real' : 'Sample';
  const landingT = interpolateCatalog(loadCatalogs()[locale], sampleVars);
  const landingTAlt = interpolateCatalog(loadCatalogs()[altLocale], sampleVars);
  const sampleAlt = sampleView(cfg, records, altLocale);
  const landing = renderPage('index.html', {
    ...common,
    t: landingT,
    tAltFlat: flattenCatalog(landingTAlt),
    sample,
    sampleAlt,
    registryPreview: index.entries.slice(0, 5),
    sampleLedeKey: `landing.sample.lede${sampleKey}`,
    sampleLede: landingT.landing.sample[`lede${sampleKey}`],
    sampleKickerKey: `landing.sample.kicker${sampleKey}`,
    sampleKicker: landingT.landing.sample[`kicker${sampleKey}`],
    sampleSimbadKey: 'landing.sample.verifySimbad',
    sampleSimbadText: landingT.landing.sample.verifySimbad,
  });
  writeFileAtomic(path.join(outDir, 'index.html'), relativize(landing, 0));

  // 认领页（三个申请入口统一指向这里；表单在这里填写姓名/献词/匿名）
  const registerHtml = renderPage('register.html', {
    ...common,
    t: pageCatalog(),
    tAltFlat: flattenCatalog(pageCatalogAlt()),
  });
  ensureDir(path.join(outDir, 'register'));
  writeFileAtomic(path.join(outDir, 'register', 'index.html'), relativize(registerHtml, 1));

  // 付款完成后的等待页（Lemon Squeezy 确认弹窗的按钮链接指向这里）。
  // 不放进 sitemap：它是购买后的过渡页，页面本身已标 noindex。
  const thanksVars = { registryCount: index.count, poolTotal };
  const thanksHtml = renderPage('thanks.html', {
    ...common,
    t: pageCatalog(thanksVars),
    tAltFlat: flattenCatalog(pageCatalogAlt(thanksVars)),
  });
  ensureDir(path.join(outDir, 'thanks'));
  writeFileAtomic(path.join(outDir, 'thanks', 'index.html'), relativize(thanksHtml, 1));

  // 公开认领表
  // 最近 7 天新增（工作流里算，不进前端脚本）
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentCount7d = index.entries.filter((entry) => {
    const t = Date.parse(entry.registered_at || '');
    return Number.isFinite(t) && t >= sevenDaysAgo;
  }).length;
  const registryVars = {
    registryCount: index.count,
    availableCount: available,
    poolTotal,
    dupCount: index.duplicates.length,
    indexJsonUrl: `${cfg.site.baseUrl}/data/registry-index.json`,
    generatedAt: index.generated_at,
    recentCount7d,
    registryDirUrl: cfg.site.registryDirUrl,
  };
  const registryHtml = renderPage('registry.html', {
    ...common,
    entries: index.entries,
    duplicates: index.duplicates,
    hasDuplicates: index.duplicates.length > 0,
    indexJsonUrl: registryVars.indexJsonUrl,
    generatedAt: index.generated_at,
    progressPercent: poolPercent,
    progressLabel: `${index.count} / ${poolTotal}`,
    progressStarted: poolStarted,
    recentCount7d,
    t: pageCatalog(registryVars),
    tAltFlat: flattenCatalog(pageCatalogAlt(registryVars)),
  });
  ensureDir(path.join(outDir, 'registry'));
  writeFileAtomic(path.join(outDir, 'registry', 'index.html'), relativize(registryHtml, 1));

  // 每条认领的永久链接页面
  let pages = 0;
  for (const record of records) {
    const slug = record.slug;
    const view = buildStarView({
      star: record.star,
      record,
      slug,
      baseUrl: cfg.site.baseUrl,
      registryUrl: `${cfg.site.baseUrl}/registry/`,
      certificateUrl: certificateUrl(slug),
      ogImageUrl: ogImageUrl(slug),
      certificatePublic: record.artifacts?.certificate_public !== false,
      locale,
    });
    // 永久页的文案里嵌了这颗星的具体数据（星级、编号、SIMBAD 标识），
    // 所以目录要按这颗星再解析一遍占位符
    const starVars = {
      slug,
      starId: view.starId,
      starTitle: view.starTitle,
      starSubtitle: view.starSubtitle,
      magnitudeText: view.magnitudeText,
      distanceText: view.distanceText,
      simbadUrl: view.simbadUrl,
      ident: view.simbadIdent,
    };
    const starT = pageCatalog(starVars);
    const starTAlt = pageCatalogAlt(starVars);
    // 同一颗星的另一种语言写法（星名、星座、星等、距离、日期），供客户端切换数据值
    const buildViewFor = (loc) => buildStarView({
      star: record.star,
      record,
      slug,
      baseUrl: cfg.site.baseUrl,
      registryUrl: `${cfg.site.baseUrl}/registry/`,
      certificateUrl: certificateUrl(slug),
      ogImageUrl: ogImageUrl(slug),
      certificatePublic: record.artifacts?.certificate_public !== false,
      locale: loc,
    });
    const enView = buildViewFor('en');
    const zhView = buildViewFor('zh');
    // 永久链接 URL 策略（DECISIONS D9）：/s/<slug>/ 为英文 canonical，
    // 另产出 /zh/s/<slug>/ 作为中文默认入口，两者用 hreflang 互链、canonical 都指向前者。
    const canonicalUrl = registrationUrl(slug);
    const zhUrl = `${cfg.site.baseUrl}/zh/s/${slug}/`;
    const hreflangLinks = [
      `<link rel="alternate" hreflang="en" href="${canonicalUrl}">`,
      `<link rel="alternate" hreflang="zh-CN" href="${zhUrl}">`,
      `<link rel="alternate" hreflang="x-default" href="${canonicalUrl}">`,
    ].join('\n');

    // pageView = 这一页默认语言的数据值（星名/星等/日期都要对应语言）；
    // altData = 另一种语言的数据值，放在 data-i18n-alt 里供客户端切换。
    const renderStarPage = (pageLocale, pageAltLocale, pageView, altData) => {
      const tFor = (loc) => pageCatalogFor(loc, starVars);
      return renderPage('permanent.html', {
        ...common,
        ...pageView,
        alt: altData,
        locale: pageLocale,
        altLocale: pageAltLocale,
        htmlLang: htmlLang(pageLocale),
        ogLocale: ogLocale(pageLocale),
        selfLangName: loadCatalogs()[pageLocale].common.lang.name,
        altLangName: loadCatalogs()[pageAltLocale].common.lang.name,
        altTitle: `${cfg.site.name} · ${loadCatalogs()[pageAltLocale].brand.tagline}`,
        t: tFor(pageLocale),
        tAltFlat: flattenCatalog(tFor(pageAltLocale)),
        canonicalUrl,
        hreflangLinks,
        shareText: encodeURIComponent(tFor(pageLocale).star.shareText),
        shareUrl: encodeURIComponent(canonicalUrl),
      });
    };

    ensureDir(path.join(outDir, 's', slug));
    writeFileAtomic(path.join(outDir, 's', slug, 'index.html'),
      relativize(renderStarPage('en', 'zh', enView, zhView), 2));
    // 中文默认入口：数据值与文案都取中文
    ensureDir(path.join(outDir, 'zh', 's', slug));
    writeFileAtomic(path.join(outDir, 'zh', 's', slug, 'index.html'),
      relativize(renderStarPage('zh', 'en', zhView, enView), 3));
    pages += 2;
  }

  // 404
  writeFileAtomic(path.join(outDir, '404.html'), relativize(renderPage('404.html', {
    ...common,
    t: pageCatalog(),
    tAltFlat: flattenCatalog(pageCatalogAlt()),
  }), 0));

  // 静态资源
  copyAssets(outDir);

  // 证书 / OG 图 / 公开数据
  copyDir(PATHS.certificates, path.join(outDir, 'certificates'));
  copyDir(PATHS.og, path.join(outDir, 'og'));
  ensureDir(path.join(outDir, 'data', 'registrations'));
  for (const record of records) {
    writeJsonAtomic(path.join(outDir, 'data', 'registrations', `${record.slug}.json`), record);
  }
  writeJsonAtomic(path.join(outDir, 'data', 'registry-index.json'), index);
  writeJsonAtomic(path.join(outDir, 'data', 'stars_pool_public.json'), {
    generated_at: pool.generated_at,
    updated_at: pool.updated_at,
    source: pool.source,
    license: pool.license,
    total: pool.stars.length,
    available,
    assigned: pool.stars.length - available,
    stars: pool.stars.map((star) => ({
      id: star.id,
      ra: star.ra,
      dec: star.dec,
      magnitude: star.magnitude,
      spectral_type: star.spectral_type,
      distance_ly: star.distance_ly,
      status: star.status,
      assigned_slug: star.assigned_slug ?? null,
    })),
  });

  // 站点级文件
  writeFileAtomic(
    path.join(outDir, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${cfg.site.baseUrl}/sitemap.xml\n`,
  );
  const urls = [
    `${cfg.site.baseUrl}/`,
    `${cfg.site.baseUrl}/register/`,
    `${cfg.site.baseUrl}/registry/`,
    ...records.map((record) => registrationUrl(record.slug)),
    // 中文默认入口也要能被搜索引擎收录（与英文页用 hreflang 互链）
    ...records.map((record) => `${cfg.site.baseUrl}/zh/s/${record.slug}/`),
  ];
  writeFileAtomic(
    path.join(outDir, 'sitemap.xml'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls.map((url) => `  <url><loc>${url}</loc></url>`),
      '</urlset>',
      '',
    ].join('\n'),
  );
  if (cfg.site.domain && !/\.github\.io$/.test(cfg.site.domain)) {
    writeFileAtomic(path.join(outDir, 'CNAME'), `${cfg.site.domain}\n`);
  } else {
    warnings.push('未配置自定义域名，跳过 CNAME（GitHub Pages 默认域名下无法使用 star.org 永久链接）');
  }
  if (checkoutPending) {
    warnings.push(
      '未配置结算链接，落地页购买入口显示为「购买通道接入中」；'
      + '设置 LEMON_SQUEEZY_CHECKOUT_URL（或 site.config.json 的 product.checkoutUrl）后自动开启，'
      + '执行 npm run check:launch 可查看上线前还缺哪些配置',
    );
  }
  if (soldOut) warnings.push('候选库已售罄，落地页购买入口自动下线（补货后自动恢复）');

  const ogDefault = await buildDefaultOg(cfg, outDir, locale);

  return {
    outDir,
    pages: pages + 2,
    registryCount: index.count,
    available,
    soldOut,
    checkoutReady,
    checkoutPending,
    entryLabel,
    ogDefault: ogDefault.status,
    warnings,
  };
}

async function main() {
  const result = await buildSite();
  console.log(`站点已生成：${result.outDir}`);
  console.log(`  页面数：${result.pages}（含认领永久页 ${result.registryCount} 个）`);
  console.log(`  候选库剩余：${result.available} 颗`);
  const entryState = result.checkoutReady
    ? '已开启'
    : result.soldOut
      ? '已下线（候选库售罄，补货后自动恢复）'
      : '接入中（未配置结算链接，见 npm run check:launch）';
  console.log(`  购买入口：${entryState}`);
  for (const warning of result.warnings) console.log(`  ⚠ ${warning}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
