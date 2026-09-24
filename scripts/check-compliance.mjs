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
import { LOCALES, flatCatalogs, resolveDefaultLocale, otherLocale } from './lib/i18n.mjs';

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
/**
 * 披露声明的校验对象与规则。
 *
 * 站点是**客户端双语**（见 DECISIONS D9）：同一个 HTML 里既有默认语言的文案，
 * 又内嵌了另一种语言的整个目录。因此绝不能"扫一遍 HTML"了事——那样中文声明会
 * 顺带满足英文规则，规则形同虚设。正确做法是按语言分开校验：
 *
 *   1. 渲染产物（_site/）代表**默认语言**最终上线看到的内容；校验前必须先剥掉
 *      内嵌目录的 <script>，否则另一种语言的文案会把默认语言的规则"喂饱"。
 *   2. 另一种语言的文案以 site/i18n/<locale>.json 为准，直接校验目录值——
 *      目录就是内嵌到页面里的那份数据，不存在"目录合规但产物跑偏"的缝隙。
 */
const DISCLOSURE_RULES = {
  en: {
    // 必须同时做到两件事：点明 IAU，并明确否定"官方命名"。
    // 只要求出现 IAU 三个字母太弱；只做否定匹配又会漏掉没提 IAU 的页面。
    iau: (text) =>
      /IAU|International Astronomical Union/i.test(text)
      && /(?:cannot|can not|do not|does not|not|no|never)[^.]{0,60}official[^.]{0,30}(?:naming|designation)/i.test(text),
    refund: (text) =>
      /refund/i.test(text)
      && /(?:do not offer refunds|no refunds|not refundable|refund unconditionally|refunds? unconditionally|unconditional refund)/i.test(text),
    loginGate: /sign in to view|log in to view/i,
  },
  zh: {
    // 中文文案里 IAU 常写成全称「国际天文学联合会」，且澄清句可能跨句，
    // 所以逐句边界不能限死（[^。] 会误杀合法的跨句写法）。
    iau: (text) =>
      /IAU|国际天文学联合会/.test(text)
      && /(?:不构成|不是|并非|非|不会|无法|不代表)[^。]{0,40}(?:官方命名|官方名称|命名权)/.test(text),
    refund: (text) =>
      /退款/.test(text)
      && /(?:不支持退款|无条件退款|退款或重新处理)/.test(text),
    loginGate: /登录后|请先登录/,
  },
};

/** 去掉标签与多余空白，便于按整句判断声明是否存在 */
function plainText(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** 去掉标签、内嵌目录与样式，只留下该语言真正渲染出来的文本 */
function renderedText(html) {
  return plainText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' '),
  );
}

/** 读构建产物里的某个页面；不存在时返回 null */
function builtPage(...segments) {
  const file = path.join(PATHS.out, ...segments);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

/**
 * 承载必备声明的**具体文案键**。
 *
 * 不能拿"整页文案的并集"去匹配规则：只要页面上任何一处凑巧命中，规则就通过，
 * 哪怕真正该放澄清句的那一段被改成了相反的意思（负向测试验证过这一点）。
 * 所以逐键校验，缺哪个键、哪个键不合规都直接报出来。
 */
const DISCLOSURE_KEYS = {
  iau: ['landing.faq.a1', 'landing.footerDisclaimer'],
  refund: ['landing.faq.a4'],
};

function catalogValue(locale, key) {
  const flat = flatCatalogs({ reload: true })[locale] || {};
  const value = flat[key];
  return typeof value === 'string' ? value : '';
}

export function checkRequiredDisclosures() {
  const checks = [];
  const defaultLocale = resolveDefaultLocale();
  const altLocale = otherLocale(defaultLocale);

  // ---- 必备声明的文案：两种语言都要有，且各自满足本语言的规则 ----
  for (const locale of LOCALES) {
    const rule = DISCLOSURE_RULES[locale];

    // IAU 澄清：每个承载键都必须自己写出完整的澄清句
    const iauMissing = DISCLOSURE_KEYS.iau.filter((key) => !rule.iau(catalogValue(locale, key)));
    checks.push({
      id: `IAU_DISCLAIMER_${locale.toUpperCase()}`,
      ok: iauMissing.length === 0,
      message: `[${locale}] 需在 ${DISCLOSURE_KEYS.iau.join('、')} 各写出完整的 IAU 澄清句（TC-COMP-02）`
        + (iauMissing.length ? `；不通过：${iauMissing.join('、')}` : ''),
    });

    // 退款政策：既要有"退款"，也要给出具体规则（不退的情形或退款承诺）
    const refundText = DISCLOSURE_KEYS.refund.map((key) => catalogValue(locale, key)).join(' ');
    checks.push({
      id: `REFUND_POLICY_${locale.toUpperCase()}`,
      ok: rule.refund(refundText),
      message: `[${locale}] 需在 ${DISCLOSURE_KEYS.refund.join('、')} 给出具体退款政策（TC-COMP-04）`,
    });
  }

  // ---- 目录确实落到了产物里：防止"目录合规但页面根本没渲染这两句" ----
  const landingHtml = builtPage('index.html');
  if (landingHtml) {
    const text = renderedText(landingHtml);
    const rule = DISCLOSURE_RULES[defaultLocale];
    checks.push({
      id: 'IAU_DISCLAIMER_RENDERED',
      ok: rule.iau(text),
      message: '构建产物的首页需渲染出 IAU 澄清句（不只是目录里有）',
    });
    checks.push({
      id: 'REFUND_POLICY_RENDERED',
      ok: rule.refund(text),
      message: '构建产物的首页需渲染出退款政策',
    });
  }

  // ---- 结构类声明与语言无关，仍然校验产物 ----
  // 首页自 D12 起不再露出公开认领表入口（首页只讲理念）。
  // "可自行核实"这条承诺落在永久页上：改校验永久页的核实步骤（star.verify2）
  // 确实指向 /registry/，且两种语言都有——两处都不设这个入口，才真的失去核实路径。
  const registryHtml = builtPage('registry', 'index.html') ?? readFileSync(path.join(PATHS.siteSrc, 'registry.html'), 'utf8');
  const verifyEntryMissing = LOCALES.filter((locale) => !/href="\/registry\/"/.test(catalogValue(locale, 'star.verify2')));
  checks.push({
    id: 'VERIFY_ENTRY',
    ok: verifyEntryMissing.length === 0,
    message: '永久页的核实步骤需指向公开认领表 /registry/（首页不再露出该入口）'
      + (verifyEntryMissing.length ? `；不通过：${verifyEntryMissing.join('、')}` : ''),
  });
  checks.push({
    id: 'REGISTRY_NO_LOGIN_RENDERED',
    ok: !DISCLOSURE_RULES[defaultLocale].loginGate.test(renderedText(registryHtml)),
    message: '构建产物的公开认领表不得设置访问门槛（TC-REG-01）',
  });

  return checks;
}

function main() {
  const dirs = [PATHS.siteSrc, PATHS.templates, path.join(PATHS.dataDir, 'registrations')];
  if (existsSync(PATHS.out)) dirs.push(PATHS.out);
  const { fileCount, violations } = scanFiles(dirs);
  const disclosures = checkRequiredDisclosures();
  const failed = disclosures.filter((check) => !check.ok);

  const defaultLocale = resolveDefaultLocale();
  const altLocale = otherLocale(defaultLocale);

  console.log(`合规扫描：检查 ${fileCount} 个文件`);
  console.log(`  默认语言：${defaultLocale}（另一种语言 ${altLocale} 按 site/i18n/${altLocale}.json 校验）`);
  console.log(`  声明校验对象：site/i18n/*.json 的落地页文案 + 构建产物 _site/index.html（${existsSync(PATHS.out) ? '存在' : '不存在，跳过产物校验'}）`);
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
