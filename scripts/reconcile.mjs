#!/usr/bin/env node
/**
 * 对账：找出"已支付但仓库里没有认领记录"的孤立订单（对应 TC-ERR-02）。
 *
 * 用法：
 *   LEMON_SQUEEZY_API_KEY=xxx STARORG_SLUG_SECRET=xxx node scripts/reconcile.mjs
 *
 * 原理：slug 由订单号经 HMAC 派生，因此对账时可以对每笔已支付订单算出它应有的 slug，
 * 再检查 data/registrations/ 里是否存在该记录；不需要在仓库里保存订单号。
 * 未配置 API Key 时，脚本给出人工对账清单（Lemon Squeezy 后台订单 vs 仓库 commit）。
 */
import { existsSync } from 'node:fs';
import { PATHS } from './lib/config.mjs';
import { deterministicSlug } from './lib/slug.mjs';
import { registrationPath } from './lib/registry.mjs';

async function fetchOrders(apiKey) {
  const orders = [];
  let url = 'https://api.lemonsqueezy.com/v1/orders?page[size]=100';
  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/vnd.api+json' },
    });
    if (!response.ok) throw new Error(`Lemon Squeezy API 返回 ${response.status}`);
    const body = await response.json();
    orders.push(...(body.data || []));
    url = body.links?.next || null;
  }
  return orders;
}

async function main() {
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  const secret = process.env.STARORG_SLUG_SECRET;
  if (!apiKey) {
    console.log('未配置 LEMON_SQUEEZY_API_KEY，改为输出人工对账清单：');
    console.log('  1. 打开 Lemon Squeezy 后台 → Orders，按时间列出已支付订单；');
    console.log('  2. 打开仓库 data/registrations/ 目录，按 commit 时间列出认领记录；');
    console.log('  3. 两边数量/时间对不上时，用 scripts/manual-order.mjs 为缺失订单补单。');
    return;
  }
  if (!secret) throw new Error('对账需要 STARORG_SLUG_SECRET（与认领流程使用同一个密钥）');

  const orders = await fetchOrders(apiKey);
  const paid = orders.filter((order) => (order.attributes?.status || '').match(/paid|completed/i));
  const orphans = [];
  for (const order of paid) {
    const slug = deterministicSlug(order.id, secret);
    if (!existsSync(registrationPath(slug))) {
      orphans.push({
        order_id: order.id,
        created_at: order.attributes?.created_at,
        expected_slug: slug,
        email: order.attributes?.user_email,
      });
    }
  }
  console.log(`已支付订单：${paid.length}，认领记录：${paid.length - orphans.length}，孤立订单：${orphans.length}`);
  for (const orphan of orphans) {
    console.log(`  孤立订单 ${orphan.order_id}（${orphan.created_at}）→ 补单命令：`);
    console.log(`    node scripts/manual-order.mjs --order-id ${orphan.order_id} --name "<称呼>" --email ${orphan.email || '<邮箱>'}`);
  }
  if (orphans.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
