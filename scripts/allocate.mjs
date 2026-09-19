#!/usr/bin/env node
/**
 * 分配引擎：为一次已支付订单分配一颗未被认领的恒星。
 *
 * 用法：
 *   echo '{"display_name":"For Anna","email":"a@b.com","dedication":"..."}' | node scripts/allocate.mjs
 *   node scripts/allocate.mjs --order order.json
 *   STARORG_ORDER_JSON='{...}' node scripts/allocate.mjs
 *
 * 输出（stdout，单行 JSON）：
 *   {"status":"allocated"|"replay"|"sold_out","slug":...,"star_id":...,"registration":...}
 * 退出码：0 成功 / 3 候选库售罄 / 4 订单信息非法 / 5 锁超时 / 1 其他错误
 *
 * 并发安全（对应 TC-ALLOC-03 防超卖）：
 *   1) GitHub Actions 的 concurrency 分组保证同一时刻只有一个认领流程在跑；
 *   2) 本脚本再用 mkdir 原子锁做第二道闸门，本地/自测同样不会超卖；
 *   3) 拿到锁之后重新读取候选库，永远基于最新状态挑选，避免读到陈旧快照。
 */
import { readFileSync, existsSync } from 'node:fs';
import crypto from 'node:crypto';
import { PATHS, assertConfig } from './lib/config.mjs';
import { normalizeOrder, buildRegistrationRecord } from './lib/order.mjs';
import { readPool, writePool, sortByPriority, withAllocationLock } from './lib/pool.mjs';
import { deterministicSlug, randomSlug, isValidSlug } from './lib/slug.mjs';
import { ensureDir, writeJsonAtomic, sha256File } from './lib/fsx.mjs';
import { registrationPath, findRegistration } from './lib/registry.mjs';

export function readOrderInput(argv = process.argv.slice(2)) {
  const orderFlag = argv.indexOf('--order');
  if (orderFlag !== -1 && argv[orderFlag + 1]) {
    return JSON.parse(readFileSync(argv[orderFlag + 1], 'utf8'));
  }
  if (process.env.STARORG_ORDER_JSON) return JSON.parse(process.env.STARORG_ORDER_JSON);
  const inline = argv.find((arg) => arg.trim().startsWith('{'));
  if (inline) return JSON.parse(inline);
  const stdin = readStdin();
  if (stdin) return JSON.parse(stdin);
  throw Object.assign(new Error('未提供订单信息（--order 文件 / STARORG_ORDER_JSON / stdin）'), { code: 'INVALID_ORDER' });
}

function readStdin() {
  if (process.stdin.isTTY) return '';
  try {
    return readFileSync(0, 'utf8').trim();
  } catch {
    return '';
  }
}

/**
 * 纯分配逻辑（调用方需自行持有锁）。
 * @returns {{status:'allocated'|'replay'|'sold_out', slug?:string, star?:object, record?:object, replay?:boolean}}
 */
export function allocateWithinLock(order, { poolFile = PATHS.pool, registrationsDir = PATHS.registrations } = {}) {
  const pool = readPool(poolFile);
  const secret = process.env.STARORG_SLUG_SECRET || '';
  let slug = order.slug && isValidSlug(order.slug)
    ? order.slug
    : order.orderId
      ? deterministicSlug(order.orderId, secret)
      : randomSlug();
  if (!isValidSlug(slug)) slug = randomSlug();

  // 幂等：同一笔订单重复触发时，返回既有认领而不是再分配一颗星（TC-ERR-04）
  const existing = findRegistration(slug, registrationsDir);
  if (existing) {
    return { status: 'replay', slug, star: existing.star, record: existing, replay: true };
  }

  const available = sortByPriority(pool.stars.filter((s) => s.status === 'available'));
  if (available.length === 0) {
    return { status: 'sold_out' };
  }

  const star = available[0];
  const registeredAt = new Date().toISOString();
  const record = buildRegistrationRecord({ slug, star, order, registeredAt });

  // 先写认领记录，再写回候选库：任一步失败都不会出现"星星被占用但没有记录"
  ensureDir(registrationsDir);
  writeJsonAtomic(registrationPath(slug, registrationsDir), record);

  star.status = 'assigned';
  star.assigned_slug = slug;
  star.assigned_at = registeredAt;
  writePool(pool, poolFile);

  return { status: 'allocated', slug, star, record, replay: false };
}

export async function allocate(order, options = {}) {
  return withAllocationLock(() => allocateWithinLock(order, options), { label: options.label });
}

export function attachArtifacts(slug, record, { certificateSha256, ogSha256 }, registrationsDir = PATHS.registrations) {
  const updated = {
    ...record,
    artifacts: {
      ...record.artifacts,
      certificate_sha256: certificateSha256 ?? record.artifacts?.certificate_sha256 ?? null,
      og_sha256: ogSha256 ?? record.artifacts?.og_sha256 ?? null,
    },
  };
  writeJsonAtomic(registrationPath(slug, registrationsDir), updated);
  return updated;
}

async function main() {
  assertConfig();
  const order = normalizeOrder(readOrderInput());
  const result = await allocate(order);
  const payload = {
    status: result.status,
    slug: result.slug ?? null,
    star_id: result.star?.id ?? null,
    registration: result.slug ? `data/registrations/${result.slug}.json` : null,
    replay: Boolean(result.replay),
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  if (result.status === 'sold_out') process.exit(3);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(error.code === 'INVALID_ORDER' ? 4 : error.code === 'LOCK_TIMEOUT' ? 5 : 1);
  });
}
