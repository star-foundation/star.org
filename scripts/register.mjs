#!/usr/bin/env node
/**
 * 登记编排：分配 → PDF 证书 → OG 分享图 → 登记记录落盘 → 登记表索引 → 邮件通知。
 * 这是 GitHub Actions 中真正执行的"一条龙"脚本，也可本地运行做全链路联调。
 *
 * 用法：
 *   STARORG_ORDER_JSON='{"display_name":"For Anna","email":"a@b.com"}' node scripts/register.mjs
 *   node scripts/register.mjs --order order.json --no-email
 *
 * 退出码：0 成功 / 3 候选库售罄 / 4 订单信息非法 / 1 其他失败
 */
import { existsSync } from 'node:fs';
import { loadConfig, assertConfig, registrationUrl, certificateUrl, ogImageUrl, PATHS } from './lib/config.mjs';
import { normalizeOrder } from './lib/order.mjs';
import { readOrderInput, allocate, attachArtifacts } from './allocate.mjs';
import { findRegistration, buildRegistryIndex } from './lib/registry.mjs';
import { buildStarView } from './lib/view.mjs';
import { renderCertificate, renderOg, artifactsExist } from './lib/artifacts.mjs';
import { renderEmail } from './lib/render.mjs';
import { sendEmail, sendOperatorAlert } from './lib/email.mjs';

function parseArgs(argv) {
  const args = { noEmail: false, force: false, skipArtifacts: false, quiet: false };
  for (const arg of argv) {
    if (arg === '--no-email') args.noEmail = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--skip-artifacts') args.skipArtifacts = true;
    else if (arg === '--quiet') args.quiet = true;
  }
  return args;
}

export async function runRegistration(order, args = {}) {
  const cfg = loadConfig();
  const steps = [];
  const allocation = await allocate(order);
  steps.push({ step: 'allocate', status: allocation.status, slug: allocation.slug ?? null });

  if (allocation.status === 'sold_out') {
    await sendOperatorAlert({
      subject: '[Star.org] 候选库售罄：有订单未完成分配',
      text: `候选库已无 available 恒星。\n来源：${order.source}\n时间：${new Date().toISOString()}\n请扩充 data/stars_pool.json 后，用 scripts/manual-order.mjs 为该订单补单。`,
    });
    return { status: 'sold_out', steps };
  }

  const slug = allocation.slug;
  const record = findRegistration(slug);
  const star = record.star;
  const view = buildStarView({
    star,
    record,
    slug,
    baseUrl: cfg.site.baseUrl,
    registryUrl: `${cfg.site.baseUrl}/registry/`,
    certificateUrl: certificateUrl(slug),
    ogImageUrl: ogImageUrl(slug),
    certificatePublic: record.artifacts?.certificate_public !== false,
  });

  let certificate = null;
  let og = null;
  const needArtifacts =
    !args.skipArtifacts && (args.force || !artifactsExist(slug) || allocation.status === 'allocated');

  if (needArtifacts) {
    certificate = renderCertificate(view);
    steps.push({ step: 'certificate', status: 'rendered', file: `certificates/${slug}.pdf`, bytes: certificate.bytes });
    og = renderOg(view);
    steps.push({ step: 'og_image', status: 'rendered', file: `og/${slug}.png`, bytes: og.bytes });
    attachArtifacts(slug, record, {
      certificateSha256: certificate.sha256,
      ogSha256: og.sha256,
    });
  } else {
    steps.push({ step: 'artifacts', status: 'reused' });
  }

  const index = buildRegistryIndex();
  steps.push({ step: 'registry_index', status: 'written', count: index.count, duplicates: index.duplicates.length });

  let mail = { status: 'skipped', reason: 'disabled' };
  const shouldMail = !args.noEmail && (allocation.status === 'allocated' || args.force);
  if (shouldMail) {
    const email = renderEmail(view);
    mail = await sendEmail({
      to: order.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      tag: `certificate-${slug}`,
    });
    steps.push({ step: 'email', ...mail });
  } else {
    steps.push({ step: 'email', status: 'skipped', reason: args.noEmail ? 'flag' : 'replay' });
  }

  return {
    status: allocation.status,
    slug,
    star_id: star.id,
    permalink: registrationUrl(slug),
    certificate: `certificates/${slug}.pdf`,
    og_image: `og/${slug}.png`,
    registry_count: index.count,
    mail,
    steps,
  };
}

async function main() {
  assertConfig();
  const args = parseArgs(process.argv.slice(2));
  const order = normalizeOrder(readOrderInput(process.argv.slice(2)));
  try {
    const result = await runRegistration(order, args);
    if (!args.quiet) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'sold_out') process.exit(3);
  } catch (error) {
    await sendOperatorAlert({
      subject: '[Star.org] 登记流程失败，需人工补单',
      text: `错误：${error.message}\n来源：${order.source}\n时间：${new Date().toISOString()}\n堆栈：\n${error.stack}\n\n请用 Lemon Squeezy 后台订单号执行：node scripts/manual-order.mjs --order-id <订单号> --name "<称呼>" --email <邮箱>`,
    }).catch(() => {});
    process.stderr.write(`登记失败：${error.message}\n`);
    process.exit(error.code === 'INVALID_ORDER' ? 4 : 1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
