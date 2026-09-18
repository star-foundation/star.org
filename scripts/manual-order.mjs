#!/usr/bin/env node
/**
 * 人工补单 / 修改后重发（对应 TC-ERR-01、TC-ERR-02、TC-ERR-03）。
 *
 * 用法：
 *   node scripts/manual-order.mjs --order-id 123456 --name "For Anna" --email a@b.com [--dedication "..."] [--anonymous] [--force]
 *   node scripts/manual-order.mjs --slug a1b2c3d4e5 --name "For Anna" --email a@b.com   # 重发既有登记的证书邮件
 *
 * 说明：订单号只用于派生 slug（HMAC）与幂等判断，不会写入公开仓库。
 */
import { normalizeOrder } from './lib/order.mjs';
import { runRegistration } from './register.mjs';
import { findRegistration } from './lib/registry.mjs';
import { assertConfig } from './lib/config.mjs';
import { isValidSlug } from './lib/slug.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--anonymous') args.anonymous = true;
    else if (key === '--force') args.force = true;
    else if (key === '--no-email') args.noEmail = true;
    else if (key.startsWith('--')) args[key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  return args;
}

async function main() {
  assertConfig();
  const args = parseArgs(process.argv.slice(2));
  if (!args.name) throw new Error('必须提供 --name "<登记人称呼>"');
  if (args.slug && !isValidSlug(args.slug)) throw new Error(`slug 格式不正确：${args.slug}`);

  const order = normalizeOrder({
    order_id: args.orderId || null,
    slug: args.slug || null,
    display_name: args.name,
    email: args.email,
    dedication: args.dedication,
    anonymous: args.anonymous,
    source: 'manual',
  });

  if (args.slug) {
    const existing = findRegistration(args.slug);
    if (!existing) throw new Error(`找不到登记记录：${args.slug}`);
  } else if (!args.orderId) {
    throw new Error('必须提供 --order-id（按订单补单）或 --slug（重发既有登记）');
  }

  const result = await runRegistration(order, {
    noEmail: Boolean(args.noEmail),
    force: Boolean(args.force),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === 'sold_out') process.exit(3);
}

main().catch((error) => {
  process.stderr.write(`补单失败：${error.message}\n`);
  process.exit(1);
});
