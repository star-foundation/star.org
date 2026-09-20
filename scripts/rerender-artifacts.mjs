#!/usr/bin/env node
/**
 * 按站点当前默认语言重新渲染既有认领的交付物（证书 PDF 与 OG 图）。
 *
 * 用途：交付物语言或字体发生变更后，把**已经生成过**的产物对齐到当前状态。
 * 例如站点从中文默认切到英文默认后，早期认领的证书仍是中文的。
 *
 * 明确不做的事：
 *   - 不发邮件（客户不会因为重渲染收到任何通知）
 *   - 不动候选库（不重新分配、不改 assigned 状态）
 *   - 不动任何隐私字段（邮箱/订单号本来就不在记录里）
 * 会做的事：
 *   - 重渲染 certificates/{slug}.pdf 与 og/{slug}.png
 *   - 更新记录里的 artifacts.*_sha256（verify-registry 会校验这个哈希，
 *     不同步更新的话自检直接失败）
 *   - 写入 locale 字段，让"这份证书是什么语言"有据可查，后续重渲染也稳定
 *
 * 用法：
 *   node scripts/rerender-artifacts.mjs --dry-run          # 只报告将要做什么
 *   node scripts/rerender-artifacts.mjs                    # 按记录/站点默认语言重渲染全部
 *   node scripts/rerender-artifacts.mjs --slug abcd123456  # 只处理一条
 *   node scripts/rerender-artifacts.mjs --locale en        # 强制指定语言（覆盖记录里的值）
 *   node scripts/rerender-artifacts.mjs --skip-og          # 只重渲染证书，不动 OG 图
 */
import { existsSync } from 'node:fs';
import { PATHS, loadConfig, certificateUrl, ogImageUrl } from './lib/config.mjs';
import { listRegistrations, registrationPath } from './lib/registry.mjs';
import { writeJsonAtomic } from './lib/fsx.mjs';
import { buildStarView } from './lib/view.mjs';
import { renderCertificate, renderOg } from './lib/artifacts.mjs';
import { resolveDefaultLocale, LOCALES } from './lib/i18n.mjs';

function parseArgs(argv) {
  const args = { dryRun: false, slug: null, locale: null, skipOg: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--skip-og') args.skipOg = true;
    else if (arg === '--slug') args.slug = argv[++i];
    else if (arg === '--locale') args.locale = argv[++i];
  }
  if (args.locale && !LOCALES.includes(args.locale)) {
    throw new Error(`--locale 只支持 ${LOCALES.join(' / ')}，收到：${args.locale}`);
  }
  return args;
}

export function rerenderArtifacts(args = {}) {
  const cfg = loadConfig();
  const siteDefault = resolveDefaultLocale();
  const entries = listRegistrations()
    .map((entry) => entry.record)
    .filter((record) => !args.slug || record.slug === args.slug)
    .sort((a, b) => String(a.registered_at).localeCompare(String(b.registered_at)));

  if (entries.length === 0) {
    return { siteDefault, results: [], changed: 0 };
  }

  const results = [];
  for (const record of entries) {
    // 记录里的 locale → 命令行覆盖 → 站点默认语言
    const locale = args.locale || record.locale || siteDefault;
    const view = buildStarView({
      star: record.star,
      record,
      slug: record.slug,
      baseUrl: cfg.site.baseUrl,
      registryUrl: `${cfg.site.baseUrl}/registry/`,
      certificateUrl: certificateUrl(record.slug),
      ogImageUrl: ogImageUrl(record.slug),
      certificatePublic: record.artifacts?.certificate_public !== false,
      locale,
    });

    const before = {
      locale: record.locale ?? null,
      certificate_sha256: record.artifacts?.certificate_sha256 ?? null,
      og_sha256: record.artifacts?.og_sha256 ?? null,
    };

    if (args.dryRun) {
      results.push({
        slug: record.slug,
        locale,
        previousLocale: before.locale,
        title: view.starTitle,
        dryRun: true,
      });
      continue;
    }

    // renderCertificate / renderOg 返回 { file, sha256, bytes }
    const certificate = renderCertificate(view);
    const artifacts = {
      ...record.artifacts,
      certificate_sha256: certificate.sha256,
    };
    let ogBytes = null;
    if (!args.skipOg) {
      const og = renderOg(view);
      artifacts.og_sha256 = og.sha256;
      ogBytes = og.bytes;
    }

    const updated = { ...record, locale, artifacts };
    writeJsonAtomic(registrationPath(record.slug), updated);

    results.push({
      slug: record.slug,
      locale,
      previousLocale: before.locale,
      title: view.starTitle,
      certificateChanged: before.certificate_sha256 !== artifacts.certificate_sha256,
      ogChanged: !args.skipOg && before.og_sha256 !== artifacts.og_sha256,
      ogBytes,
    });
  }

  return { siteDefault, results, changed: results.filter((r) => r.certificateChanged || r.ogChanged).length };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { siteDefault, results, changed } = rerenderArtifacts(args);

  console.log(`站点默认语言：${siteDefault}`);
  if (results.length === 0) {
    console.log('没有匹配的认领记录。');
    return;
  }
  console.log(`${args.dryRun ? '【预览，不写入】' : ''}共 ${results.length} 条：\n`);
  for (const r of results) {
    const tag = r.dryRun ? '将重渲染' : r.certificateChanged || r.ogChanged ? '已更新' : '无变化';
    console.log(`  ${r.slug}  locale ${r.previousLocale ?? '(未记录)'} → ${r.locale}  ${r.title}  ${tag}`);
  }
  if (!args.dryRun) {
    console.log(`\n完成：${changed} 条产物发生变化，记录里的 sha256 与 locale 已同步更新。`);
    console.log('下一步：npm run verify 校验哈希一致，npm run build:site 重建站点。');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}