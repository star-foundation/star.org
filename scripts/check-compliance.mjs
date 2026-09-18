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

export function checkRequiredDisclosures(siteDir = PATHS.out) {
  const checks = [];
  const landing = path.join(siteDir, 'index.html');
  const landingText = existsSync(landing) ? readFileSync(landing, 'utf8') : '';
  checks.push({
    id: 'IAU_DISCLAIMER',
    ok: landingText.includes('IAU') && /不是|非/.test(landingText),
    message: '落地页需明确澄清不是 IAU 官方命名（TC-COMP-02）',
  });
  checks.push({
    id: 'REFUND_POLICY',
    ok: landingText.includes('退款'),
    message: '落地页 FAQ 需展示退款政策（TC-COMP-04）',
  });
  checks.push({
    id: 'VERIFY_ENTRY',
    ok: landingText.includes('/registry/'),
    message: '落地页需提供公开登记表入口（信任背书区块）',
  });
  const registry = path.join(siteDir, 'registry', 'index.html');
  checks.push({
    id: 'REGISTRY_NO_LOGIN',
    ok: existsSync(registry) && !/登录后|请先登录|sign in to view/i.test(readFileSync(registry, 'utf8')),
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

  console.log(`合规扫描：检查 ${fileCount} 个文件`);
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
