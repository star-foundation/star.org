#!/usr/bin/env node
/**
 * 静态站点构建：把 site/ 模板 + data/ 数据编译为 _site/（GitHub Pages 直接托管）。
 *
 * 产物：
 *   /                    落地页
 *   /registry/           公开可验证登记表（无需登录）
 *   /s/{slug}/           每条登记的永久链接页面
 *   /certificates/*.pdf  证书下载
 *   /og/*.png            OG 分享图
 *   /data/*.json         公开登记数据（供任何访客自行核对）
 *   404.html / sitemap.xml / robots.txt / CNAME
 */
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS, loadConfig, registrationUrl, certificateUrl, ogImageUrl } from './lib/config.mjs';
import { ensureDir, writeFileAtomic, writeJsonAtomic, removeIfExists } from './lib/fsx.mjs';
import { readPool } from './lib/pool.mjs';
import { buildRegistryIndex, sortedRegistrations } from './lib/registry.mjs';
import { buildStarView } from './lib/view.mjs';
import { render } from './lib/template.mjs';
import { renderOgHtml } from './lib/render.mjs';
import { renderPng } from './lib/chrome.mjs';

function tpl(name) {
  return readFileSync(path.join(PATHS.siteSrc, name), 'utf8');
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

function sampleView(cfg) {
  return {
    starId: 'HIP-91262',
    starTitle: '织女星',
    starSubtitle: '天琴座 α · Vega · HD 172167 · HIP-91262',
    raText: '18h 36m 56s',
    decText: '+38° 47′ 01″',
    magnitudeText: '0.03 等',
    distanceText: '25.0 光年',
    spectralText: 'A0V',
    displayName: 'For Anna',
    dedication: '愿你在每一个抬头看天的夜晚，都能找到属于自己的那一颗。',
    registeredDateZh: '2026年9月20日',
    permalink: `${cfg.site.baseUrl}/s/sample`,
  };
}

async function buildDefaultOg(cfg, outDir) {
  const file = path.join(outDir, 'og', 'default.png');
  if (existsSync(file)) return { status: 'exists', file };
  try {
    renderPng(
      renderOgHtml({
        ...sampleView(cfg),
        slug: 'star-org',
        starFieldSvg: '',
        tagline: cfg.site.tagline,
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
  const entryLabel = soldOut ? '候选库已售罄' : '购买通道接入中';
  const entryMessage = soldOut ? cfg.policy.soldOutMessage : cfg.policy.checkoutPendingMessage;
  const latest = records[0] ?? null;

  const common = {
    siteName: cfg.site.name,
    tagline: cfg.site.tagline,
    domain: cfg.site.domain,
    baseUrl: cfg.site.baseUrl,
    year: new Date().getFullYear(),
    supportEmail: cfg.site.supportEmail,
    registryRepoUrl: cfg.site.registryRepoUrl,
    registryDirUrl: cfg.site.registryDirUrl,
    registryUrl: `${cfg.site.baseUrl}/registry/`,
    priceDisplay: cfg.product.priceDisplay,
    priceNote: cfg.product.priceNote,
    checkoutUrl: cfg.site.checkoutUrl,
    checkoutReady,
    checkoutConfigured,
    checkoutPending,
    soldOut,
    entryLabel,
    entryMessage,
    soldOutMessage: cfg.policy.soldOutMessage,
    registryCount: index.count,
    availableCount: available,
    poolTotal: pool.stars.length,
    latestSlug: latest?.slug ?? null,
    latestUrl: latest ? registrationUrl(latest.slug) : null,
    defaultOgImage: `${cfg.site.baseUrl}/og/default.png`,
    // GitHub Pages 项目页的部署子路径（如 /star.org/）：404 页会在任意路径下被展示，
    // 需要用它在运行时定位站点根。
    projectBase: `/${cfg.site.registryRepoUrl.split('/').filter(Boolean).pop() || 'star.org'}/`,
  };

  // 落地页
  const landing = render(tpl('index.html'), {
    ...common,
    sample: sampleView(cfg),
    registryPreview: index.entries.slice(0, 5),
  });
  writeFileAtomic(path.join(outDir, 'index.html'), relativize(landing, 0));

  // 登记页（三个申请入口统一指向这里；表单在这里填写姓名/献词/匿名）
  const registerHtml = render(tpl('register.html'), common);
  ensureDir(path.join(outDir, 'register'));
  writeFileAtomic(path.join(outDir, 'register', 'index.html'), relativize(registerHtml, 1));

  // 公开登记表
  const registryHtml = render(tpl('registry.html'), {
    ...common,
    entries: index.entries,
    duplicates: index.duplicates,
    hasDuplicates: index.duplicates.length > 0,
    indexJsonUrl: `${cfg.site.baseUrl}/data/registry-index.json`,
    generatedAt: index.generated_at,
  });
  ensureDir(path.join(outDir, 'registry'));
  writeFileAtomic(path.join(outDir, 'registry', 'index.html'), relativize(registryHtml, 1));

  // 每条登记的永久链接页面
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
    });
    const page = render(tpl('permanent.html'), {
      ...common,
      ...view,
      shareText: encodeURIComponent(`我为 ${view.starTitle} 完成了一次可公开验证的恒星登记`),
      shareUrl: encodeURIComponent(view.permalink),
    });
    ensureDir(path.join(outDir, 's', slug));
    writeFileAtomic(path.join(outDir, 's', slug, 'index.html'), relativize(page, 2));
    pages += 1;
  }

  // 404
  writeFileAtomic(path.join(outDir, '404.html'), relativize(render(tpl('404.html'), common), 0));

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

  const ogDefault = await buildDefaultOg(cfg, outDir);

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
  console.log(`  页面数：${result.pages}（含登记永久页 ${result.registryCount} 个）`);
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
