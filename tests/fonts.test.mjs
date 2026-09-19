import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

/**
 * 内置中文字体的回归测试（DECISIONS D10）。
 *
 * 字体随仓库内置，好处是渲染确定、离线可复现、CI 不再需要 apt 装字体；
 * 代价是"字体字节本身就是交付物的一部分"——被换掉、被裁坏、漏掉某个字符，
 * 都会直接体现在已发给客户的证书上（中文变方框）。所以这里锁三件事：
 *   1. 文件字节与 manifest 记录一致（防止被静默替换）；
 *   2. 界面与常见姓名用字确实在覆盖范围内（防止裁过头）；
 *   3. 已知边界内的字符（CJK 扩展 A/B）确实**不在**覆盖范围，
 *      让"子集覆盖到哪儿"这件事有据可查，而不是靠猜。
 */
const FONT_DIR = path.join(ROOT, 'fonts');
const manifest = JSON.parse(readFileSync(path.join(FONT_DIR, 'manifest.json'), 'utf8'));

/** 用 manifest 里记录的码位区间判断字符是否会被渲染成方框 */
function covered(ranges, char) {
  const code = char.codePointAt(0);
  return ranges.some(([from, to]) => code >= from && code <= to);
}

test('内置字体与 manifest 记录一致（字节不可被静默替换）', () => {
  assert.ok(manifest.fonts.length >= 2, '至少要有 Sans 与 Serif 两种内置字体');
  for (const font of manifest.fonts) {
    const file = path.join(FONT_DIR, font.local);
    assert.ok(existsSync(file), `缺少内置字体 ${font.local}`);
    const actual = readFileSync(file);
    assert.equal(actual.length, font.bytes, `${font.local} 大小与清单不符`);
    // 用与拉取脚本一致的算法复核，避免依赖外部命令
    const hash = createHash('sha256').update(actual).digest('hex');
    assert.equal(hash, font.sha256, `${font.local} 内容与清单不符（字体被换过？）`);
  }
});

test('内置字体覆盖界面用字与常见姓名用字', () => {
  const sans = manifest.fonts.find((f) => f.local.includes('Sans')).coverageRanges;
  const serif = manifest.fonts.find((f) => f.local.includes('Serif')).coverageRanges;

  const samples = {
    '界面常用汉字': '天狼星大犬座光年视星等献词认领证书永久链接赤经赤纬距离光谱型认领表',
    '生僻姓名用字': '玥龑喆犇燚鑫淼曌頔璟翀昱堃',
    '中文标点': '（）【】《》、。！？　—…「」『』',
    '全角与符号': '：；，☆→↗°′″·×÷',
    'ASCII 与数字': 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  };
  for (const [label, text] of Object.entries(samples)) {
    const missing = [...text].filter((char) => !covered(sans, char));
    assert.deepEqual(missing, [], `${label} 有字符不在内置字体里，会渲染成方框`);
  }
  // 证书标题与献词用衬线字体，单独确认
  const serifMissing = [...'每一次认领都可以被公开验证愿你抬头看见的颗星']
    .filter((char) => !covered(serif, char));
  assert.deepEqual(serifMissing, [], '衬线字体缺少标题用字');
});

test('内置字体的已知覆盖边界（子集之外会出现方框）', () => {
  const sans = manifest.fonts.find((f) => f.local.includes('Sans')).coverageRanges;
  // 覆盖范围应覆盖 CJK 统一表意文字区的首尾实际字符
  // （注意 U+9FFF 本身是未分配码位，字体里本来就没有，不能拿它做断言）
  assert.ok(covered(sans, '一'), 'CJK 区起始字符应覆盖');
  assert.ok(covered(sans, '龘') && covered(sans, '龍'), 'CJK 区末段字符应覆盖');
  const count = sans.reduce((sum, [a, b]) => sum + (b - a + 1), 0);
  assert.ok(count > 20000, `内置字体仅覆盖 ${count} 个码位，CJK 覆盖不足`);
  // 但明确不含 CJK 扩展 A/B：极生僻的姓名用字会显示为方框，
  // 需要时在 scripts/fetch-fonts.mjs 的 RANGES 里加区间并重新生成
  assert.ok(!covered(sans, '\u3400'), 'CJK 扩展 A 目前不在子集内（已知边界）');
  assert.ok(covered(sans, '\u3001'), '中文顿号必须覆盖');
});

test('内置字体已随仓库提交（否则 CI 渲染会失败）', () => {
  // 体积上限：内置字体是永久留在 git 历史里的成本，超过预期说明裁错了
  const total = manifest.fonts.reduce((sum, font) => sum + font.bytes, 0);
  assert.ok(total > 1_000_000, '内置字体过小，可能是空文件或裁剪失败');
  assert.ok(total < 20 * 1024 * 1024, `内置字体合计 ${(total / 1048576).toFixed(1)}MB，超出 20MB 预期`);
  for (const font of manifest.fonts) {
    assert.ok(font.upstreamSha256 && font.upstream, '清单需记录上游来源，便于日后升级字体版本');
  }
  assert.ok(existsSync(path.join(FONT_DIR, 'OFL.txt')), 'Noto 字体为 SIL OFL 1.1，必须随字体附带许可证');
});