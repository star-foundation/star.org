#!/usr/bin/env node
/**
 * 从 HYG 星表（Hipparcos/Yale/Gliese 汇编，公开数据）生成恒星候选库 data/stars_pool.json。
 *
 * 用法：
 *   node scripts/build-pool.mjs --input /path/hygdata_v41.csv [--limit 800] [--max-mag 6.5]
 *
 * 筛选规则（对应技术说明书 4.1）：
 *   - 视星等 ≤ 6.5（肉眼可见范围）
 *   - 具备 Hipparcos 编号与有效距离（HYG 用 100000 pc 表示距离未知）
 *   - 按视星等从亮到暗排序，早期订单优先分配到更亮的星
 */
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { PATHS } from './lib/config.mjs';
import { writeJsonAtomic } from './lib/fsx.mjs';

const PARSEC_TO_LY = 3.261563;
const UNKNOWN_DISTANCE_PC = 100_000;

function parseArgs(argv) {
  const args = { limit: 800, maxMag: 6.5, input: process.env.HYG_CSV || '' };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--input') args.input = argv[++i];
    else if (key === '--limit') args.limit = Number(argv[++i]);
    else if (key === '--max-mag') args.maxMag = Number(argv[++i]);
    else if (key === '--out') args.out = argv[++i];
  }
  return args;
}

/** 支持引号包裹的极简 CSV 行解析 */
export function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * 光谱型规范化：HYG 中部分亮星是双星合成光谱（形如 "M1: comp"），
 * 直接展示会误导（例如五车二的合成光谱并非 M 型），这类一律置空，证书上显示"—"。
 */
export function normalizeSpectralType(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (/comp|:/.test(value)) return null;
  const match = /^([OBAFGKM]\d(?:\.\d)?(?:I{1,3}|IV|V|VI)?)/.exec(value);
  return match ? match[1] : value.slice(0, 12);
}

function num(value) {
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export async function buildPool({ input, limit = 800, maxMag = 6.5 }) {
  if (!input || !existsSync(input)) {
    throw new Error(`找不到星表文件：${input || '(未提供)'}；请用 --input 指定 HYG CSV 路径`);
  }
  const rl = createInterface({ input: createReadStream(input), crlfDelay: Infinity });
  let header = null;
  const candidates = [];
  const seenHip = new Set();

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    if (!header) {
      header = cells.map((c) => c.replace(/^"|"$/g, '').trim());
      continue;
    }
    const row = {};
    header.forEach((key, idx) => {
      row[key] = cells[idx];
    });

    const hip = num(row.hip);
    const mag = num(row.mag);
    const distPc = num(row.dist);
    // HYG 的 ra 列单位是「小时」；优先用 rarad/decrad（弧度）换算成度，精度更高
    const raRad = num(row.rarad);
    const decRad = num(row.decrad);
    const raHours = num(row.ra);
    const ra = raRad != null ? (raRad * 180) / Math.PI : raHours != null ? raHours * 15 : null;
    const dec = decRad != null ? (decRad * 180) / Math.PI : num(row.dec);
    if (hip == null || mag == null || ra == null || dec == null) continue;
    if (mag > maxMag) continue;
    if (distPc == null || distPc <= 0 || distPc >= UNKNOWN_DISTANCE_PC) continue;
    if (seenHip.has(hip)) continue;
    seenHip.add(hip);

    candidates.push({
      id: `HIP-${hip}`,
      hip,
      hd: num(row.hd),
      proper_name: (row.proper || '').trim() || null,
      bayer: (row.bayer || '').trim() || null,
      flam: (row.flam || '').trim() || null,
      constellation: (row.con || '').trim() || null,
      ra: Number(ra.toFixed(6)),
      dec: Number(dec.toFixed(6)),
      magnitude: Number(mag.toFixed(2)),
      spectral_type: normalizeSpectralType(row.spect),
      distance_ly: Number((distPc * PARSEC_TO_LY).toFixed(1)),
      status: 'available',
      assigned_slug: null,
      assigned_at: null,
    });
  }

  candidates.sort((a, b) => (a.magnitude - b.magnitude) || a.hip - b.hip);
  const stars = candidates.slice(0, limit);

  return {
    version: 1,
    source: 'HYG Database v4.1 (astronexus/HYG-Database)，汇编自 Hipparcos / Yale Bright Star / Gliese 星表',
    source_url: 'https://github.com/astronexus/HYG-Database',
    license: 'CC BY-SA 4.0（公开天文数据）',
    generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    filter: { max_magnitude: maxMag, requires_hip: true, requires_distance: true },
    count: stars.length,
    available: stars.length,
    assigned: 0,
    stars,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = await buildPool(args);
  const out = args.out || PATHS.pool;
  writeJsonAtomic(out, pool);
  const brightest = pool.stars[0];
  const faintest = pool.stars[pool.stars.length - 1];
  console.log(`候选库已生成：${out}`);
  console.log(`  恒星数量：${pool.count}`);
  console.log(`  星等范围：${brightest.magnitude} ~ ${faintest.magnitude}`);
  console.log(`  最亮三颗：${pool.stars.slice(0, 3).map((s) => `${s.id}(${s.magnitude})`).join(', ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
