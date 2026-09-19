#!/usr/bin/env node
/**
 * 拉取并裁剪内置中文字体（本地字体方案，见 DECISIONS D10）。
 *
 * 为什么要内置字体：证书 PDF 与 OG 图靠无头 Chrome 渲染，而 ubuntu-latest 镜像
 * **没有**中文字体。原先每次 CI 都 apt 安装 fonts-noto-cjk（多语言全量版，约 60MB），
 * 属于"渲染结果依赖运行环境"。改为随仓库自带一份裁剪后的字体，渲染完全确定、
 * 离线可复现，也不再需要那个容器依赖。
 *
 * 裁剪的必要性：SubsetOTF 的简体中文单字重为 Sans 7.9MB / Serif 11.1MB，
 * 两个字重直接入库是 19MB；按"全部 CJK 统一表意文字"裁剪后约 12.5MB。
 *
 * 为什么不用更小的 GB2312 子集（仅 3.7MB）：GB2312 只有 6763 个汉字，
 * 现代姓名常用字（如「玥」）不在其中，会渲染成方框——对已付款拿到的证书不可接受。
 *
 * 用法：
 *   node scripts/fetch-fonts.mjs            # 拉取 → 校验 → 裁剪 → 写 manifest
 *   node scripts/fetch-fonts.mjs --check    # 只校验仓库里的字体与 manifest 是否一致
 *
 * 依赖：python3 + fonttools（仅生成时需要；CI 不跑这个脚本，直接用仓库里的字体）
 *   pip install fonttools
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const FONT_DIR = path.join(ROOT, 'fonts');

/**
 * 上游固定到具体提交（不能用 main：main 一变，产出的字体就跟着变，
 * 没法复现，也没法判断 "字体重了没有"）。
 */
const UPSTREAM_PIN = 'f8d157532fbfaeda587e826d4cd5b21a49186f7c';

/**
 * 镜像按顺序尝试。
 * 换镜像不影响可信度：下载后一定要比对固定的 sha256，
 * 镜像只是"从哪儿取字节"，正确性由哈希保证（raw.githubusercontent 实测经常超时）。
 */
const MIRRORS = [
  (file) => `https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@${UPSTREAM_PIN}/${file}`,
  (file) => `https://raw.githubusercontent.com/notofonts/noto-cjk/${UPSTREAM_PIN}/${file}`,
];

/** 要裁剪进仓库的字体：上游路径 → 本地文件名（上游 sha256 用于确认下载到的字节正确） */
const FONTS = [
  {
    upstream: 'Sans/SubsetOTF/SC/NotoSansSC-Regular.otf',
    upstreamSha256: 'faa6c9df652116dde789d351359f3d7e5d2285a2b2a1f04a2d7244df706d5ea9',
    local: 'NotoSansSC-Regular.subset.otf',
  },
  {
    upstream: 'Serif/SubsetOTF/SC/NotoSerifSC-Regular.otf',
    upstreamSha256: 'e8f396decc1f0963a016a989c3d8852e863d1350996f573860a80767c83a1cd3',
    local: 'NotoSerifSC-Regular.subset.otf',
  },
];

/**
 * 保留的字符范围。
 * 除了 CJK 统一表意文字，还必须留下模板真正用到的标点与符号——
 * 少一个字符的表现是该处变成方框，而「」、（）—、→、↗、°、′、″ 都在界面里出现过。
 */
const RANGES = [
  [0x0020, 0x007e], // ASCII
  [0x00a0, 0x00ff], // Latin-1 补充：° × ÷ · 等
  [0x2000, 0x206f], // 常用标点：— – ‘ ’ “ ” …
  [0x2190, 0x21ff], // 箭头：→ ↗ ←
  [0x25a0, 0x26ff], // 几何图形与杂项符号：★ ☆
  [0x3000, 0x303f], // 中文标点：、。「」『』
  [0x4e00, 0x9fff], // CJK 统一表意文字（20992 字）
  [0xff00, 0xffef], // 全角形式：（）：；，
];

const MANIFEST = path.join(FONT_DIR, 'manifest.json');

export function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function charset() {
  const chars = new Set();
  for (const [from, to] of RANGES) {
    for (let code = from; code <= to; code += 1) chars.add(String.fromCodePoint(code));
  }
  return [...chars].sort().join('');
}

function assertFonttools() {
  try {
    execFileSync('python3', ['-c', 'import fontTools'], { stdio: 'ignore' });
  } catch {
    throw new Error('需要 python3 + fonttools 才能生成字体子集：pip install fonttools');
  }
}

function subset(input, output, text) {
  const program = `
from fontTools import subset
import sys
subset.main([
    sys.argv[1], '--text=' + sys.stdin.read(), '--output-file=' + sys.argv[2],
    '--layout-features=*', '--no-hinting', '--desubroutinize', '--drop-tables+=DSIG',
])
`;
  execFileSync('python3', ['-c', program, input, output], { input: text, stdio: ['pipe', 'inherit', 'inherit'] });
}

/** 只校验：仓库里的字体是否与 manifest 记录一致（CI 与本地都可跑，不需要 fonttools） */
export function checkFonts() {
  const problems = [];
  if (!existsSync(MANIFEST)) return [`缺少字体清单 ${path.relative(ROOT, MANIFEST)}`];
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  for (const entry of manifest.fonts) {
    const file = path.join(FONT_DIR, entry.local);
    if (!existsSync(file)) {
      problems.push(`缺少字体文件 ${entry.local}`);
      continue;
    }
    const actual = sha256(file);
    if (actual !== entry.sha256) {
      problems.push(`${entry.local} 与清单不一致（实际 ${actual.slice(0, 16)}…，清单 ${entry.sha256.slice(0, 16)}…）`);
    }
  }
  return problems;
}

async function fetchFonts() {
  assertFonttools();
  mkdirSync(FONT_DIR, { recursive: true });
  const text = charset();
  const work = mkdtempSync(path.join(os.tmpdir(), 'starorg-fonts-'));
  const manifest = {
    _comment: '由 scripts/fetch-fonts.mjs 生成。字体随仓库内置，渲染不再依赖运行环境是否装了中文字体（DECISIONS D10）。',
    upstream: { repo: 'notofonts/noto-cjk', commit: UPSTREAM_PIN, license: 'SIL Open Font License 1.1' },
    charset: { ranges: RANGES.map(([a, b]) => [a, b]), count: [...text].length },
    fonts: [],
  };

  try {
    for (const font of FONTS) {
      const raw = path.join(work, path.basename(font.upstream));
      process.stdout.write(`拉取 ${font.upstream} … `);
      const errors = [];
      let downloaded = false;
      for (const mirror of MIRRORS) {
        const url = mirror(font.upstream);
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
          if (!response.ok) {
            errors.push(`${new URL(url).host} → HTTP ${response.status}`);
            continue;
          }
          writeFileSync(raw, Buffer.from(await response.arrayBuffer()));
          downloaded = true;
          break;
        } catch (error) {
          errors.push(`${new URL(url).host} → ${error.message}`);
        }
      }
      if (!downloaded) throw new Error(`所有镜像都失败：${font.upstream}\n  ${errors.join('\n  ')}`);

      const rawHash = sha256(raw);
      if (rawHash !== font.upstreamSha256) {
        throw new Error(
          `上游文件校验失败：${font.upstream}\n  期望 ${font.upstreamSha256}\n  实际 ${rawHash}`,
        );
      }
      console.log('校验通过');

      const out = path.join(FONT_DIR, font.local);
      process.stdout.write(`裁剪 ${font.local} … `);
      subset(raw, out, text);
      console.log(`${(statSync(raw).size / 1048576).toFixed(1)}MB → ${(statSync(out).size / 1048576).toFixed(1)}MB`);

      manifest.fonts.push({
        local: font.local,
        upstream: font.upstream,
        upstreamSha256: font.upstreamSha256,
        sha256: sha256(out),
        bytes: statSync(out).size,
      });
    }

    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    const total = manifest.fonts.reduce((sum, f) => sum + f.bytes, 0);
    console.log(`\n完成：${manifest.fonts.length} 个字体，合计 ${(total / 1048576).toFixed(1)}MB`);
    console.log(`清单已写入 ${path.relative(ROOT, MANIFEST)}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--check')) {
    const problems = checkFonts();
    if (problems.length > 0) {
      console.error('内置字体校验失败：');
      for (const problem of problems) console.error(`  · ${problem}`);
      process.exit(1);
    }
    console.log('内置字体校验通过（与 manifest 一致）');
  } else {
    await fetchFonts();
  }
}