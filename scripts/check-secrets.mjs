#!/usr/bin/env node
/**
 * 公开仓库前的密钥与隐私扫描（推送到 GitHub 之前必须通过）。
 *
 * 这个仓库是全公开的：任何被提交的密钥都会立刻泄露，且会永久留在 git 历史里。
 * 因此这里检查两类问题：
 *   1. 被追踪的文件里是否出现真实密钥形态的字符串；
 *   2. 不该进公开仓库的本地文件（.env / private/ / outbox/ / _site/）是否被误提交。
 *
 * 用法：node scripts/check-secrets.mjs
 * 退出码：0 通过 / 1 发现问题
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

// 高置信度的密钥形态（避免误报：都要求足够长的随机串）
const SECRET_PATTERNS = [
  { name: 'Lemon Squeezy / Stripe 密钥', re: /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/ },
  { name: 'GitHub Token', re: /\b(ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{20,}/ },
  { name: 'Resend 密钥', re: /\bre_[A-Za-z0-9]{20,}/ },
  { name: 'AWS Access Key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Slack Token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: '私钥文件内容', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: '带值的 Bearer Token', re: /Bearer\s+[A-Za-z0-9._-]{24,}/ },
  {
    name: '被赋值的密钥环境变量',
    re: /(RESEND_API_KEY|POSTMARK_TOKEN|LEMON_SQUEEZY_API_KEY|STARORG_SLUG_SECRET)\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}/,
  },
];

// 绝不能进入公开仓库的路径（精确匹配）
const FORBIDDEN_FILES = [
  { path: '.env', reason: '本地密钥文件' },
  { path: '.env.local', reason: '本地密钥文件' },
];
// 绝不能进入公开仓库的路径前缀（.env.example 是模板，允许提交）
const FORBIDDEN_PATHS = [
  { prefix: 'private/', reason: '订单台账（含邮箱与订单号）' },
  { prefix: 'outbox/', reason: '本地邮件产物' },
  { prefix: '_site/', reason: '构建产物（由 CI 生成）' },
];

// 占位符不算泄露：模板文件里本来就该写这些
const PLACEHOLDER = /replace|your[-_]|xxxx|placeholder|changeme|change-me|example|dummy|demo-|local-demo|dev-secret/i;

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

const problems = [];
const files = trackedFiles();

for (const file of files) {
  for (const rule of FORBIDDEN_FILES) {
    if (file === rule.path) problems.push({ type: 'path', file, message: `不应提交：${rule.reason}` });
  }
  for (const rule of FORBIDDEN_PATHS) {
    if (file.startsWith(rule.prefix)) {
      problems.push({ type: 'path', file, message: `不应提交：${rule.reason}` });
    }
  }
}

// 二进制文件（证书、图片）跳过内容扫描
const TEXT_EXT = new Set(['.mjs', '.js', '.json', '.md', '.html', '.css', '.txt', '.yml', '.yaml', '.svg', '.example', '']);
for (const file of files) {
  if (!TEXT_EXT.has(path.extname(file))) continue;
  let content;
  try {
    content = readFileSync(path.join(ROOT, file), 'utf8');
  } catch {
    continue;
  }
  for (const pattern of SECRET_PATTERNS) {
    const match = content.match(pattern.re);
    if (match && !PLACEHOLDER.test(match[0])) {
      problems.push({ type: 'secret', file, message: `疑似${pattern.name}：${match[0].slice(0, 12)}…` });
    }
  }
}

// 公开登记记录里不得出现邮箱 / 订单号
for (const file of files.filter((f) => f.startsWith('data/registrations/') && f.endsWith('.json'))) {
  const content = readFileSync(path.join(ROOT, file), 'utf8');
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(content)) {
    problems.push({ type: 'privacy', file, message: '公开登记记录中出现邮箱' });
  }
  if (/"(order_id|email|customer_email|ls_order_id)"/.test(content)) {
    problems.push({ type: 'privacy', file, message: '公开登记记录中出现订单/邮箱字段' });
  }
}

if (problems.length === 0) {
  console.log(`密钥与隐私扫描：通过（检查 ${files.length} 个追踪文件）`);
  process.exit(0);
}

console.error(`密钥与隐私扫描：发现 ${problems.length} 个问题，不要推送到公开仓库`);
for (const p of problems) console.error(`  ✗ [${p.type}] ${p.file}：${p.message}`);
process.exit(1);
