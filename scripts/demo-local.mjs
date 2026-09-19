#!/usr/bin/env node
/**
 * 本地一键启动（开发自用，不参与线上架构）。
 *
 * 做三件事：
 *   1. 在临时沙盒目录里跑一笔真实的完整认领（分配 → 证书 PDF → OG 图 → 认领记录 → 邮件写入 outbox）
 *   2. 用这份沙盒数据构建静态站点
 *   3. 启动本地预览服务器（默认 http://127.0.0.1:4321/）
 *
 * 全程不触碰仓库里的正式数据：data/registrations、certificates/、og/ 都不会被写入。
 *
 * 用法：
 *   node scripts/demo-local.mjs
 *   node scripts/demo-local.mjs --port 5000 --name "For 小满" --dedication "生日快乐"
 *   node scripts/demo-local.mjs --anonymous --keep      # 保留上次演示数据，再追加一笔
 *   node scripts/demo-local.mjs --no-serve              # 只生成，不启动预览
 *
 * 退出后沙盒目录仍在，可用 --dir 指定位置；重复运行默认会先清空沙盒。
 */
import { cpSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

function parseArgs(argv) {
  const args = { port: 4321, serve: true, keep: false, anonymous: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--no-serve') args.serve = false;
    else if (key === '--keep') args.keep = true;
    else if (key === '--anonymous') args.anonymous = true;
    else if (key === '--port') args.port = Number(argv[++i]);
    else if (key === '--name') args.name = argv[++i];
    else if (key === '--dedication') args.dedication = argv[++i];
    else if (key === '--dir') args.dir = argv[++i];
    else if (key === '--order-id') args.orderId = argv[++i];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const sandbox = path.resolve(args.dir || path.join(os.tmpdir(), 'starorg-demo'));
const baseUrl = `http://127.0.0.1:${args.port}`;

// —— 关键：先设置环境变量，再动态导入脚本（配置在首次读取时会缓存） ——
if (!args.keep) rmSync(sandbox, { recursive: true, force: true });
mkdirSync(path.join(sandbox, 'data', 'registrations'), { recursive: true });
mkdirSync(path.join(sandbox, 'certificates'), { recursive: true });
mkdirSync(path.join(sandbox, 'og'), { recursive: true });

const poolSource = path.join(ROOT, 'data', 'stars_pool.json');
const poolTarget = path.join(sandbox, 'data', 'stars_pool.json');
if (!existsSync(poolTarget)) {
  if (!existsSync(poolSource)) {
    console.error('缺少 data/stars_pool.json，请先运行：npm run build:pool');
    process.exit(1);
  }
  cpSync(poolSource, poolTarget);
}

process.env.STARORG_DATA_DIR = path.join(sandbox, 'data');
process.env.STARORG_REGISTRATIONS_DIR = path.join(sandbox, 'data', 'registrations');
process.env.STARORG_REGISTRY_INDEX = path.join(sandbox, 'data', 'registry-index.json');
process.env.STARORG_CERTIFICATES_DIR = path.join(sandbox, 'certificates');
process.env.STARORG_OG_DIR = path.join(sandbox, 'og');
process.env.STARORG_SITE_OUT = path.join(sandbox, '_site');
process.env.STARORG_OUTBOX_DIR = path.join(sandbox, 'outbox');
process.env.STARORG_LOCK_DIR = path.join(sandbox, '.allocation-lock');
process.env.STARORG_SLUG_SECRET = process.env.STARORG_SLUG_SECRET || 'local-demo-secret';
process.env.EMAIL_PROVIDER = 'outbox';
process.env.SITE_BASE_URL = baseUrl;

const { chromeAvailable } = await import('./lib/chrome.mjs');
const { normalizeOrder } = await import('./lib/order.mjs');
const { runRegistration } = await import('./register.mjs');
const { buildSite } = await import('./build-site.mjs');

if (!chromeAvailable()) {
  console.error('未检测到 Chrome/Chromium，无法渲染证书与分享图。');
  console.error('请安装 Google Chrome，或用 CHROME_PATH=/path/to/chrome 指定可执行文件。');
  process.exit(1);
}

const displayName = args.name || 'For Anna';
const dedication = args.dedication === undefined ? '愿你在每一个抬头看天的夜晚，都能找到属于自己的那一颗。' : args.dedication;
const orderId = args.orderId || `DEMO-${Date.now()}`;

console.log('Star.org 本地演示');
console.log(`  沙盒目录：${sandbox}`);
console.log(`  订单号：  ${orderId}（仅用于派生认领编号，不会写入公开数据）`);
console.log('  正在分配恒星并渲染证书与分享图…');

const order = normalizeOrder({
  order_id: orderId,
  display_name: displayName,
  email: 'demo@example.com',
  dedication,
  anonymous: args.anonymous,
  source: 'local-demo',
});

const result = await runRegistration(order);
if (result.status === 'sold_out') {
  console.error('候选库已售罄，无法演示。请运行 npm run build:pool 扩充候选库。');
  process.exit(3);
}

const site = await buildSite();
const recordFiles = readdirSync(path.join(sandbox, 'data', 'registrations')).filter((f) => f.endsWith('.json'));

console.log('');
console.log(`✅ 认领完成：${result.slug}`);
console.log(`   恒星：      ${result.star_id}`);
console.log(`   证书：      certificates/${result.slug}.pdf`);
console.log(`   分享图：    og/${result.slug}.png`);
console.log(`   邮件：      outbox/（EMAIL_PROVIDER=outbox，本地只落盘不真发）`);
console.log(`   累计认领：  ${recordFiles.length} 条`);
console.log('');
console.log(`✅ 站点已构建：${site.outDir}（页面 ${site.pages} 个，候选库剩余 ${site.available} 颗）`);
console.log('');
console.log('预览地址：');
console.log(`  落地页        ${baseUrl}/`);
console.log(`  公开认领表    ${baseUrl}/registry/`);
console.log(`  永久链接页    ${baseUrl}/s/${result.slug}/`);
console.log(`  证书 PDF      ${baseUrl}/certificates/${result.slug}.pdf`);
console.log(`  分享图        ${baseUrl}/og/${result.slug}.png`);

if (!args.serve) {
  console.log('');
  console.log('启动预览：');
  console.log(`  STARORG_SITE_OUT=${path.join(sandbox, '_site')} node scripts/serve.mjs ${args.port}`);
  process.exit(0);
}

console.log('');
console.log('启动本地预览服务器（Ctrl+C 退出，沙盒数据保留）…');
const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs'), String(args.port)], {
  stdio: 'inherit',
  env: process.env,
});
const stop = () => { child.kill('SIGTERM'); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
