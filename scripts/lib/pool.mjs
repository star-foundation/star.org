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

/** 按视星等从亮到暗排序，作为分配优先级（更亮的星先分配给早期用户） */
export function sortByPriority(stars) {
  return [...stars].sort((a, b) => {
    if (a.magnitude !== b.magnitude) return a.magnitude - b.magnitude;
    return String(a.id).localeCompare(String(b.id));
  });
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
