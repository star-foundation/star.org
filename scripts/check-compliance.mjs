#!/usr/bin/env node
/**
 * 合规文案扫描（对应 TC-COMP-01 / TC-COMP-02 / TC-COMP-03 / TC-COMP-04）。
 * 扫描对象：生成后的站点（_site）、证书/OG/邮件模板、站点源文件。
 * 不扫描 docs/ 与本脚本自身——那里必须能讨论这些词本身。
 *
 * 用法：node scripts/check-compliance.mjs
 * 退出码：0 通过 / 1 存在违规
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { PATHS } from './lib/config.mjs';

/** 禁用措辞（产品需求文档 5 章 / 技术说明书第 5 章合规要求） */
export const BANNED_TERMS = [
  '投资', '升值', '资产', '交易', '所有权凭证', '所有权', '证券',
  '数字货币', '虚拟货币', '加密货币', '比特币', '以太坊', '链上', '钱包地址',
];

export const BANNED_ENGLISH = [
  /investment/i, /\bappreciation\b/i, /\basset\b/i, /\btrading\b/i,
  /\bownership certificate\b/i, /\bcrypto\b/i, /\bbitcoin\b/i, /\bethereum\b/i, /\bnft\b/i,
];

/** 明确禁止出现的收款渠道（技术说明书 9.2 节：仅法币结算） */
export const BANNED_PAYMENT_HOSTS = [
  'coinbase.com', 'commerce.coinbase.com', 'btcpayserver', 'nowpayments.io',
  'binance.com', 'okx.com', 'coinpayments.net', 'coingate.com', 'opennode.com',
];

const SCAN_EXTENSIONS = new Set(['.html', '.txt', '.json', '.css', '.js', '.xml', '.svg']);

function collectFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      collectFiles(full, out);
    } else if (SCAN_EXTENSIONS.has(path.extname(name))) {
      out.push(full);
    }
  }
  return out;
}

export function scanFiles(dirs) {
  const violations = [];
  const files = dirs.flatMap((dir) => collectFiles(dir));
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      for (const term of BANNED_TERMS) {
        if (line.includes(term)) {
          violations.push({ file, line: idx + 1, term, text: line.trim().slice(0, 120), type: 'banned-term' });
        }
      }
      for (const re of BANNED_ENGLISH) {
        const match = re.exec(line);
        if (match) {
          violations.push({ file, line: idx + 1, term: match[0], text: line.trim().slice(0, 120), type: 'banned-term' });
        }
      }
      for (const host of BANNED_PAYMENT_HOSTS) {
        if (line.toLowerCase().includes(host)) {
          violations.push({ file, line: idx + 1, term: host, text: line.trim().slice(0, 120), type: 'banned-payment-channel' });
        }
      }
    });
  }
  return { fileCount: files.length, violations };
}

/**
 * 必备声明的校验对象。
 *
 * 站点源文件（site/）是提交进仓库的事实来源，必须始终校验；
 * 构建产物（_site/）存在时一并校验，防止"源码合规但产物跑偏"。
 * 这样在没有执行构建的环境（例如只跑测试的流水线）里也不会误报。
 */
export function disclosureTargets() {
  const landing = [
    path.join(PATHS.siteSrc, 'index.html'),
    path.join(PATHS.out, 'index.html'),
  ].filter((file) => existsSync(file));
  const registry = [
    path.join(PATHS.siteSrc, 'registry.html'),
    path.join(PATHS.out, 'registry', 'index.html'),
  ].filter((file) => existsSync(file));
  return { landing, registry };
}

/** 去掉标签与多余空白，便于按整句判断声明是否存在 */
function plainText(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function checkRequiredDisclosures() {
  const { landing, registry } = disclosureTargets();
  const landingRaw = landing.map((file) => readFileSync(file, 'utf8'));
  const landingTexts = landingRaw.map(plainText);
  const registryTexts = registry.map((file) => plainText(readFileSync(file, 'utf8')));
  // 每个校验对象都必须满足，缺文件即视为不通过
  const every = (texts, predicate) => texts.length > 0 && texts.every(predicate);

  const checks = [];
  checks.push({
    id: 'IAU_DISCLAIMER',
    // 必须是完整的一句澄清，而不只是出现了 "IAU" 三个字母
    ok: every(landingTexts, (text) => /(不构成|不是|并非|非)[^。]{0,40}IAU[^。]{0,20}(官方|命名)/.test(text)),
    message: '落地页需明确澄清不是 IAU 官方命名（TC-COMP-02）',
  });
  checks.push({
    id: 'REFUND_POLICY',
    // 既要提到退款，也要给出具体规则（不退的情形或退款承诺）
    ok: every(landingTexts, (text) => text.includes('退款') && /(不支持退款|无条件退款)/.test(text)),
    message: '落地页 FAQ 需展示退款政策（TC-COMP-04）',
  });
  checks.push({
    id: 'VERIFY_ENTRY',
    // 必须是真实可点的链接（href），而不是正文里提一句
    ok: every(landingRaw, (html) => /href=["'][^"']*\/registry\/["']/.test(html)),
    message: '落地页需提供公开登记表入口（信任背书区块）',
  });
  checks.push({
    id: 'REGISTRY_NO_LOGIN',
    ok: every(registryTexts, (text) => !/登录后|请先登录|sign in to view/i.test(text)),
    message: '公开登记表不得设置访问门槛（TC-REG-01）',
  });
  return checks;
}

function main() {
  const dirs = [PATHS.siteSrc, PATHS.templates, path.join(PATHS.dataDir, 'registrations')];
  if (existsSync(PATHS.out)) dirs.push(PATHS.out);
  const { fileCount, violations } = scanFiles(dirs);
  const disclosures = checkRequiredDisclosures();
  const failed = disclosures.filter((check) => !check.ok);

  const targets = disclosureTargets();
  const label = (file) => path.relative(PATHS.root, file);

  console.log(`合规扫描：检查 ${fileCount} 个文件`);
  console.log(`  声明校验对象：${[...targets.landing, ...targets.registry].map(label).join('、') || '（未找到落地页/登记表文件）'}`);
  if (violations.length === 0) console.log('  ✓ 未发现禁用措辞或违规收款渠道');
  for (const violation of violations) {
    console.log(`  ✗ [${violation.type}] ${path.relative(PATHS.root, violation.file)}:${violation.line} 命中「${violation.term}」→ ${violation.text}`);
  }
  for (const check of disclosures) {
    console.log(`  ${check.ok ? '✓' : '✗'} ${check.id}：${check.message}`);
  }
  process.exit(violations.length === 0 && failed.length === 0 ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
