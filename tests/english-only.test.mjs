import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './helpers.mjs';
import { flatCatalogs, LOCALES, resolveDefaultLocale } from '../scripts/lib/i18n.mjs';

/**
 * 「英文版里不能出现中文」是产品约束，不只是文案问题：
 * 站点默认语言是英文（site.config.json → site.defaultLocale = "en"），中文版是隐藏入口，
 * 所以英文访客看到的每一处都必须是英文——包括标点。
 *
 * 这类缺陷很隐蔽：范围写死的全角括号「（）」、键值分隔符「：」、样例献词的直角引号「」、
 * 用作宽空格的 U+3000，都会在英文页面上留下中文标点；而文案目录里的中文字符串
 * 会直接渲染到英文页面。它们都不会让构建失败，所以必须用测试盯住。
 */

/** CJK 统一表意文字 + 中日韩标点 + 全角字符 */
const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/;

/** 去掉 <script>（内嵌的另一种语言目录）与 HTML 注释，只留默认语言真正渲染出来的文本 */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

test('TC-PHIL-06 英文文案目录里不出现中文', () => {
  const flat = flatCatalogs({ reload: true }).en;
  const offenders = Object.entries(flat)
    .filter(([, value]) => typeof value === 'string' && CJK.test(value))
    .map(([key, value]) => `${key} = ${value}`);
  assert.deepEqual(offenders, [], `site/i18n/en.json 含中文字符：\n${offenders.join('\n')}`);
});

test('TC-PHIL-07 站点模板不硬编码中文标点与文案', () => {
  const offenders = [];
  for (const name of readdirSync(path.join(ROOT, 'site'))) {
    if (!name.endsWith('.html')) continue;
    const file = path.join(ROOT, 'site', name);
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      for (const match of line.matchAll(new RegExp(CJK.source, 'g'))) {
        offenders.push(`site/${name}:${index + 1} 命中「${match[0]}」`);
      }
    });
  }
  assert.deepEqual(offenders, [], `模板里不得写死中文（标点也不行）：\n${offenders.join('\n')}`);
});

test('TC-PHIL-08 英文交付模板（邮件 / 证书）不出现中文标点', () => {
  // 邮件与证书模板里原先写死了全角括号与全角冒号，英文买家收到的是「Sirius（HIP-…）」。
  // 这类模板只保留 {{t.*}} 键与 ASCII 标点，语言相关标点一律走目录。
  const offenders = [];
  for (const name of readdirSync(path.join(ROOT, 'templates'))) {
    const file = path.join(ROOT, 'templates', name);
    if (!/\.(html|txt)$/.test(name)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      for (const match of line.matchAll(new RegExp(CJK.source, 'g'))) {
        offenders.push(`templates/${name}:${index + 1} 命中「${match[0]}」`);
      }
    });
  }
  assert.deepEqual(offenders, [], `交付模板里不得写死中文标点：\n${offenders.join('\n')}`);
});

test('TC-PHIL-09 英文版白皮书 TeX 源码不含中文', () => {
  const file = path.join(ROOT, 'docs', 'whitepaper', 'star-org-whitepaper-en.tex');
  assert.ok(existsSync(file), '缺少英文版白皮书 TeX 源码');
  const offenders = readFileSync(file, 'utf8').split('\n')
    .map((line, index) => ({ line, index: index + 1 }))
    .filter(({ line }) => CJK.test(line))
    .map(({ line, index }) => `star-org-whitepaper-en.tex:${index}: ${line.trim()}`);
  assert.deepEqual(offenders, [], `英文版白皮书的封面/正文都不得出现中文：\n${offenders.join('\n')}`);
});

test('TC-PHIL-10 构建产物：默认语言（英文）页面的可见文本无中文', async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'starorg-en-cjk-'));
  try {
    mkdirSync(path.join(out, 'og'), { recursive: true });
    writeFileSync(path.join(out, 'og', 'default.png'), 'stub');
    const { buildSite } = await import('../scripts/build-site.mjs');
    await buildSite({ outDir: out, clean: false });

    assert.equal(resolveDefaultLocale(), 'en', '该用例假定默认语言是英文');

    // 覆盖每个默认语言页面：落地页、理念页、认领表、认领页、等待页、404
    const pages = [
      'index.html', '404.html',
      'philosophy/index.html', 'registry/index.html',
      'register/index.html', 'thanks/index.html',
    ];
    const offenders = [];
    for (const rel of pages) {
      const file = path.join(out, rel);
      if (!existsSync(file)) continue;
      const text = visibleText(readFileSync(file, 'utf8'));
      for (const line of text.split('\n')) {
        const match = line.match(CJK);
        if (match) offenders.push(`${rel}: 命中「${match[0]}」 → ${line.trim().slice(0, 90)}`);
      }
    }
    // 认领永久页（含光谱型的全角括号曾是漏网之鱼）
    const starDir = path.join(out, 's');
    if (existsSync(starDir)) {
      for (const slug of readdirSync(starDir)) {
        const text = visibleText(readFileSync(path.join(starDir, slug, 'index.html'), 'utf8'));
        const match = text.match(CJK);
        if (match) offenders.push(`s/${slug}/: 命中「${match[0]}」`);
      }
    }
    assert.deepEqual(offenders, [], `英文产物里出现中文：\n${offenders.join('\n')}`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('TC-PHIL-11 中文版仍然保留中文标点（避免"去中文"伤到中文侧）', () => {
  const flat = flatCatalogs({ reload: true });
  assert.equal(flat.zh['email.kvSep'], '：', '中文邮件仍应用全角冒号分隔');
  assert.equal(flat.zh['email.parenOpen'], '（', '中文仍应用全角左括号');
  assert.equal(flat.zh['email.parenClose'], '）', '中文仍应用全角右括号');
  assert.equal(flat.zh['landing.quoteOpen'], '「', '中文样例献词仍应用直角引号');
  assert.equal(flat.zh['landing.quoteClose'], '」');
  // 英文侧用半角
  assert.equal(flat.en['email.kvSep'], ': ');
  assert.equal(flat.en['email.parenOpen'], ' (');
  assert.equal(flat.en['landing.quoteOpen'], '“');
  // 两种语言的标点键必须齐备，否则构建期 renderPage 会因缺键直接失败
  for (const locale of LOCALES) {
    for (const key of ['email.kvSep', 'email.parenOpen', 'email.parenClose',
      'landing.quoteOpen', 'landing.quoteClose']) {
      assert.equal(typeof flat[locale][key], 'string', `[${locale}] 缺少 ${key}`);
    }
  }
});
