import crypto from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from './config.mjs';
import { readJson, writeJsonAtomic } from './fsx.mjs';

export const POOL_VERSION = 1;

export function readPool(file = PATHS.pool) {
  const pool = readJson(file);
  if (!Array.isArray(pool.stars)) throw new Error(`${file} 结构不正确：缺少 stars 数组`);
  return pool;
}

export function writePool(pool, file = PATHS.pool) {
  pool.count = pool.stars.length;
  pool.available = pool.stars.filter((s) => s.status === 'available').length;
  pool.assigned = pool.stars.filter((s) => s.status === 'assigned').length;
  pool.updated_at = new Date().toISOString();
  return writeJsonAtomic(file, pool);
}

export function availableStars(pool) {
  return pool.stars.filter((s) => s.status === 'available');
}

/**
 * 从未被认领的恒星中均匀随机抽取一颗。
 *
 * 随机分配取代了早先的「按视星等从亮到暗优先」：候选库文件仍然按亮度排序，
 * 但那只用于浏览与展示，不再决定谁拿到哪颗星（见 docs/DECISIONS.md D8）。
 *
 * 随机性来源分两种：
 *   - 传入 digest（由订单号 HMAC 派生）时按该摘要确定性取模，
 *     同一订单重跑得到同一颗星，便于复现、测试与人工补单核对；
 *   - 无订单号（人工补单）或缺少密钥时退化为真随机。
 *
 * 取 48 bit 再取模，模数 ≤ 800 时的偏差量级约 1e-12，可忽略。
 */
export function pickRandomAvailable(stars, { digest = null } = {}) {
  if (!Array.isArray(stars) || stars.length === 0) return null;
  const index = digest
    ? digest.readUIntBE(0, 6) % stars.length
    : crypto.randomInt(stars.length);
  return stars[index];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 分配互斥锁（跨进程安全）。
 * 依赖 mkdir 的原子性：同一时刻只有一个进程能创建锁目录。
 * GitHub Actions 侧另有 concurrency 分组作为第一道闸门，这里是第二道（本地/自测亦生效）。
 */
export async function withAllocationLock(fn, options = {}) {
  const lockDir = options.lockDir || PATHS.lockDir;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const staleMs = options.staleMs ?? 180_000;
  const startedAt = Date.now();
  let acquired = false;

  while (!acquired) {
    try {
      mkdirSync(lockDir, { recursive: false });
      acquired = true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let age = 0;
      try {
        age = Date.now() - statSync(lockDir).mtimeMs;
      } catch {
        continue; // 锁刚被释放，立刻重试
      }
      if (age > staleMs) {
        // 上次运行异常中断留下的死锁，清理后重试
        rmSync(lockDir, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - startedAt > timeoutMs) {
        const err = new Error('等待分配锁超时：另一个认领流程仍在执行中');
        err.code = 'LOCK_TIMEOUT';
        throw err;
      }
      await sleep(120 + Math.floor(Math.random() * 180));
    }
  }

  try {
    writeFileSync(
      path.join(lockDir, 'owner.json'),
      JSON.stringify({ pid: process.pid, at: new Date().toISOString(), label: options.label || null }),
    );
  } catch {
    /* 锁信息仅用于排障，写不进去不影响互斥 */
  }

  try {
    return await fn();
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

export function poolStats(file = PATHS.pool) {
  if (!existsSync(file)) return { exists: false, total: 0, available: 0, assigned: 0 };
  const pool = readPool(file);
  const available = availableStars(pool).length;
  return {
    exists: true,
    total: pool.stars.length,
    available,
    assigned: pool.stars.filter((s) => s.status === 'assigned').length,
    source: pool.source,
    updatedAt: pool.updated_at,
  };
}

export function registrationFiles(dir = PATHS.registrations) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
}
