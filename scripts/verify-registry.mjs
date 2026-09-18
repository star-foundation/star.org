#!/usr/bin/env node
/**
 * 登记表自检（同时是"可公开验证"的机器可读实现，对应 TC-REG-03 / TC-REG-04 / TC-ALLOC-05）。
 *
 * 检查项：
 *   1. 文件名与 slug 字段一致、slug 格式合法
 *   2. 不存在同一颗恒星被登记两次（防超卖红线）
 *   3. 公开记录中不含邮箱、订单号等隐私字段（隐私红线）
 *   4. 候选库与登记记录双向一致（assigned 状态 ↔ 登记记录）
 *   5. 证书 / OG 图产物存在且哈希与记录一致
 *   6. 登记表索引与磁盘记录一致
 *
 * 用法：node scripts/verify-registry.mjs [--json]
 * 退出码：0 通过 / 1 存在错误
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from './lib/config.mjs';
import { readPool } from './lib/pool.mjs';
import { listRegistrations, buildRegistryIndex } from './lib/registry.mjs';
import { isValidSlug } from './lib/slug.mjs';
import { sha256File } from './lib/fsx.mjs';
import { certificateFile, ogFile } from './lib/artifacts.mjs';

const PRIVATE_PATTERNS = [
  { name: '邮箱', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: '订单号字段', re: /"(order_id|orderId|order_ref|payment_id|transaction_id)"\s*:/i },
  { name: '邮箱字段', re: /"(email|owner_email|customer_email|user_email)"\s*:/i },
  { name: '姓名类隐私字段', re: /"(real_name|customer_name|phone|address|ip)"\s*:/i },
];

function walkStrings(value, visit, pathParts = []) {
  if (typeof value === 'string') visit(value, pathParts);
  else if (Array.isArray(value)) value.forEach((item, i) => walkStrings(item, visit, [...pathParts, String(i)]));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) walkStrings(item, visit, [...pathParts, key]);
  }
}

export function verifyRegistry({ poolFile = PATHS.pool, registrationsDir = PATHS.registrations } = {}) {
  const errors = [];
  const warnings = [];
  const entries = listRegistrations(registrationsDir);
  const pool = existsSync(poolFile) ? readPool(poolFile) : { stars: [] };
  const poolById = new Map(pool.stars.map((star) => [star.id, star]));
  const seenStars = new Map();
  const seenSlugs = new Set();

  for (const { file, record } of entries) {
    const expectedFile = `${record.slug}.json`;
    if (file !== expectedFile) {
      errors.push({ code: 'FILE_SLUG_MISMATCH', file, message: `文件名 ${file} 与记录内 slug ${record.slug} 不一致` });
    }
    if (!isValidSlug(record.slug)) {
      errors.push({ code: 'INVALID_SLUG', file, message: `slug 格式不合法：${record.slug}` });
    }
    if (seenSlugs.has(record.slug)) {
      errors.push({ code: 'DUPLICATE_SLUG', file, message: `slug 重复：${record.slug}` });
    }
    seenSlugs.add(record.slug);

    if (seenStars.has(record.star_id)) {
      errors.push({
        code: 'DUPLICATE_STAR',
        file,
        message: `恒星 ${record.star_id} 被重复登记：${seenStars.get(record.star_id)} 与 ${record.slug}`,
      });
    } else {
      seenStars.set(record.star_id, record.slug);
    }

    walkStrings(record, (text, pathParts) => {
      for (const pattern of PRIVATE_PATTERNS) {
        if (pattern.re.test(text)) {
          errors.push({
            code: 'PRIVATE_DATA',
            file,
            message: `发现${pattern.name}（字段路径 ${pathParts.join('.')}）：${text.slice(0, 60)}`,
          });
        }
      }
    });

    const star = poolById.get(record.star_id);
    if (!star) {
      warnings.push({ code: 'STAR_NOT_IN_POOL', file, message: `登记记录引用的恒星 ${record.star_id} 不在当前候选库中` });
    } else {
      if (star.status !== 'assigned') {
        errors.push({ code: 'POOL_STATUS', file, message: `恒星 ${record.star_id} 在候选库中状态为 ${star.status}，应为 assigned` });
      }
      if (star.assigned_slug && star.assigned_slug !== record.slug) {
        errors.push({ code: 'POOL_SLUG_MISMATCH', file, message: `恒星 ${record.star_id} 在候选库中记录的 slug 为 ${star.assigned_slug}，与记录 ${record.slug} 不符` });
      }
    }

    if (!existsSync(certificateFile(record.slug))) {
      warnings.push({ code: 'MISSING_CERTIFICATE', file, message: `缺少证书文件 certificates/${record.slug}.pdf` });
    } else {
      const hash = record.artifacts?.certificate_sha256;
      if (hash && hash !== sha256File(certificateFile(record.slug))) {
        errors.push({ code: 'CERTIFICATE_HASH', file, message: `证书哈希与记录不一致：${record.slug}` });
      }
    }
    if (!existsSync(ogFile(record.slug))) {
      warnings.push({ code: 'MISSING_OG', file, message: `缺少 OG 图 og/${record.slug}.png` });
    } else {
      const hash = record.artifacts?.og_sha256;
      if (hash && hash !== sha256File(ogFile(record.slug))) {
        errors.push({ code: 'OG_HASH', file, message: `OG 图哈希与记录不一致：${record.slug}` });
      }
    }
  }

  // 反向检查：候选库中标记为 assigned 的恒星必须有对应登记记录
  for (const star of pool.stars) {
    if (star.status === 'assigned' && star.assigned_slug && !seenSlugs.has(star.assigned_slug)) {
      errors.push({
        code: 'ORPHAN_ASSIGNMENT',
        file: 'data/stars_pool.json',
        message: `恒星 ${star.id} 标记为已分配（${star.assigned_slug}），但没有对应的登记记录`,
      });
    }
  }

  // 索引一致性
  const index = buildRegistryIndex({ dir: registrationsDir, outFile: null });
  if (index.count !== entries.length) {
    errors.push({ code: 'INDEX_COUNT', file: 'data/registry-index.json', message: '登记表索引数量与磁盘记录不一致' });
  }
  if (index.duplicates.length > 0) {
    errors.push({ code: 'INDEX_DUPLICATES', file: 'data/registry-index.json', message: `索引中发现 ${index.duplicates.length} 组重复恒星` });
  }
  if (existsSync(PATHS.registryIndex)) {
    const onDisk = JSON.parse(readFileSync(PATHS.registryIndex, 'utf8'));
    if (onDisk.count !== index.count) {
      errors.push({ code: 'INDEX_STALE', file: 'data/registry-index.json', message: '索引文件过期，请重新运行 npm run build:site' });
    }
  }

  return {
    status: errors.length === 0 ? 'pass' : 'fail',
    registrations: entries.length,
    uniqueStars: seenStars.size,
    poolTotal: pool.stars.length,
    poolAvailable: pool.stars.filter((s) => s.status === 'available').length,
    errors,
    warnings,
  };
}

function main() {
  const result = verifyRegistry();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    console.log(`登记表自检：${result.status === 'pass' ? '通过' : '未通过'}`);
    console.log(`  登记记录 ${result.registrations} 条 / 唯一恒星 ${result.uniqueStars} 颗`);
    console.log(`  候选库 ${result.poolTotal} 颗（可登记 ${result.poolAvailable}）`);
    for (const warning of result.warnings) console.log(`  ⚠ [${warning.code}] ${warning.message}`);
    for (const error of result.errors) console.log(`  ✗ [${error.code}] ${error.message}`);
  }
  process.exit(result.errors.length === 0 ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
