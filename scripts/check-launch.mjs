#!/usr/bin/env node
/**
 * 上线就绪自检：一次列清「还缺哪些配置」，尤其是购买入口为什么是关着的。
 *
 * 购买入口有三种状态，容易混淆：
 *   已开启      结算链接已配置且候选库有货
 *   接入中      候选库有货，但还没配置 Lemon Squeezy 结算链接
 *   已下线      候选库售罄（补货后自动恢复）
 *
 * 用法：
 *   npm run check:launch            只报告，始终以 0 退出
 *   npm run check:launch -- --strict  存在阻塞项时以 1 退出（可用于上线前卡口）
 */
import { loadConfig, PATHS } from './lib/config.mjs';
import { readPool } from './lib/pool.mjs';

const strict = process.argv.includes('--strict');
const cfg = loadConfig();
const pool = readPool();
const available = pool.stars.filter((s) => s.status === 'available').length;
const checkoutConfigured = Boolean(cfg.site.checkoutUrl);
const soldOut = available === 0;

const blockers = [];
const pending = [];
const ok = [];

/** 探测站点域名是否真的能打开；网络不可达时返回 null，避免误判 */
async function probe(url) {
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    return response.ok;
  } catch {
    return null;
  }
}

function line(icon, title, detail) {
  console.log(`  ${icon} ${title}`);
  if (detail) console.log(`      ${detail}`);
}

// 本地运行时看不到仓库里配置的 Secrets，密钥类检查会一律报缺失。
// 与其让人误以为没配，不如把这件事说清楚。
const inActions = Boolean(process.env.GITHUB_ACTIONS);
const secretHint = inActions
  ? null
  : '（本地运行时读不到仓库 Secrets，这条只在 CI 里有效；本地可用环境变量模拟）';

console.log('Star.org 上线就绪自检');
console.log('');

// ---- 购买入口 ----
// 公开购买有总开关（site.config.json → product.purchaseEnabled）。关闭时
// 「没配结算链接」不是阻塞项——站点本来就不该露出购买入口。
const purchaseEnabled = cfg.product?.purchaseEnabled === true;
console.log('购买入口');
if (!purchaseEnabled) {
  ok.push('公开购买入口已按配置关闭');
  line('·', '已关闭：product.purchaseEnabled = false',
    '站点不露出任何认领/结算链接与价格文案；/register/ 与结算链路仍保留可用，只是不被链接。');
  console.log('      要重新开启：site.config.json → product.purchaseEnabled = true（并配好结算链接）');
} else if (soldOut) {
  blockers.push('候选库已售罄，购买入口自动下线');
  line('⛔', '已下线：候选库没有可认领的恒星', '补货：npm run build:pool 重新生成 data/stars_pool.json');
} else if (!checkoutConfigured) {
  blockers.push('未配置 Lemon Squeezy 结算链接');
  line('⛔', `接入中：候选库有 ${available} 颗可用，但结算链接未配置`,
    '在 Lemon Squeezy 后台 Products → 选择商品 → Share → Copy checkout link，');
  console.log('      然后二选一：');
  console.log('        · 仓库 Settings → Secrets and variables → Actions → Variables 增加');
  console.log('          LEMON_SQUEEZY_CHECKOUT_URL（推荐，改完重新发布站点即生效）');
  console.log('        · 或写入 site.config.json 的 product.checkoutUrl');
} else {
  ok.push('结算链接已配置');
  line('✓', `已开启：候选库 ${available} 颗可用`, `结算链接 ${cfg.site.checkoutUrl}`);
}

// ---- 数据与幂等 ----
console.log('');
console.log('数据与幂等');
if (process.env.STARORG_SLUG_SECRET) {
  ok.push('STARORG_SLUG_SECRET 已配置');
  line('✓', 'STARORG_SLUG_SECRET 已配置', '同一订单号可复现同一认领编号，补单幂等成立');
} else if (!inActions) {
  line('·', 'STARORG_SLUG_SECRET 未在本地环境中设置', secretHint);
} else {
  blockers.push('未配置 STARORG_SLUG_SECRET');
  line('⛔', '未配置 STARORG_SLUG_SECRET',
    '缺失时 slug 退化为随机值：重复触发同一订单会占用第二颗星。设置后不可再更换。');
}

// ---- 邮件通道 ----
console.log('');
console.log('邮件通道');
const provider = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
const hasMailKey = Boolean(process.env.RESEND_API_KEY || process.env.POSTMARK_API_KEY);
if (provider === 'outbox') {
  blockers.push('邮件通道为 outbox，不会真实发信');
  line('⛔', 'EMAIL_PROVIDER=outbox：只把邮件写到本地目录，不会真的发给客户',
    '上线前改为 resend 或 postmark，并配置对应 API Key');
} else if (!hasMailKey) {
  blockers.push('未配置邮件服务 API Key');
  line('⛔', `EMAIL_PROVIDER=${provider}，但缺少 API Key`, '配置 RESEND_API_KEY 或 POSTMARK_API_KEY');
} else {
  ok.push('邮件通道已配置');
  line('✓', `邮件通道 ${provider} 已配置`);
}
if (process.env.OPERATOR_EMAIL) {
  ok.push('OPERATOR_EMAIL 已配置');
  line('✓', 'OPERATOR_EMAIL 已配置', '售罄、补单失败等异常会通知到这个地址');
} else {
  pending.push('未配置 OPERATOR_EMAIL');
  line('⚠', '未配置 OPERATOR_EMAIL', '异常告警（售罄 / 分配失败）没有收件人');
}

// ---- 站点地址 ----
console.log('');
console.log('站点地址');
const baseUrl = cfg.site.baseUrl;
line('·', `永久链接前缀：${baseUrl}/s/{slug}/`);
if (/\.github\.io(\/|$)/.test(baseUrl)) {
  line('⚠', 'baseUrl 指向 GitHub Pages 地址',
    '证书、邮件、sitemap 里印出的永久链接都会用这个前缀；换自定义域名后需要重新发布站点');
  pending.push('baseUrl 与实际部署域名尚未统一');
} else {
  line('·', '证书、邮件与 sitemap 中印出的永久链接都以此为准');
  const reachable = await probe(baseUrl);
  if (reachable === null) {
    line('⚠', `无法确认 ${baseUrl} 是否可访问`, '网络受限，跳过探测');
  } else if (reachable) {
    ok.push('站点域名可访问');
    line('✓', `${baseUrl} 可访问`);
  } else {
    blockers.push(`${baseUrl} 当前打不开`);
    line('⛔', `${baseUrl} 当前打不开`,
      '证书与邮件里印出的永久链接会点不开：先确认域名解析与 Pages 自定义域名设置');
  }
}

// ---- 人工确认项（脚本无法自动判断）----
console.log('');
console.log('需要人工确认（脚本无法自动检测）');
if (!purchaseEnabled) {
  console.log('  · 公开购买当前是关闭的，下面这几项只在重新开启后才需要处理');
}
for (const item of [
  'Lemon Squeezy 结算页字段：姓名 / 邮箱 / 献词（限 100 字）/ 匿名展示开关',
  'Lemon Squeezy Webhook → Zapier/Make → repository_dispatch(star_registration) 全链路联调',
  '发信域名 SPF / DKIM 记录（否则证书邮件容易进垃圾箱）',
  '用真实卡片完成一笔小额支付，确认 5 分钟内收到证书邮件',
]) {
  line('☐', item);
}

// ---- 汇总 ----
console.log('');
if (blockers.length === 0) {
  console.log(`结论：无阻塞项${pending.length ? `，${pending.length} 项待完善` : ''}。`);
} else {
  console.log(`结论：${blockers.length} 个阻塞项，购买入口或发信链路尚未就绪：`);
  for (const item of blockers) console.log(`  · ${item}`);
}
if (pending.length) {
  console.log('待完善：');
  for (const item of pending) console.log(`  · ${item}`);
}

process.exit(strict && blockers.length > 0 ? 1 : 0);
