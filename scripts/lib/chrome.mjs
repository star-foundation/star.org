import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureDir } from './fsx.mjs';

/**
 * 内置中文字体（DECISIONS D10）。
 *
 * ubuntu-latest 镜像没有中文字体，而证书 PDF 与 OG 图必须有中文。
 * 与其每次 CI 装一遍（约 60MB、且渲染结果依赖运行环境），不如随仓库带一份
 * 裁剪后的子集（fonts/，约 12.5MB），渲染完全确定、离线可复现。
 *
 * 通过 @font-face 以 file:// 引入：这条路子在 headless Chrome 上实测可用
 * （对照实验：不加载字体时渲染结果不同），而且不依赖系统的 fontconfig 状态。
 */
const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fonts');
const BUNDLED_FONTS = [
  { family: 'StarOrg Sans', file: 'NotoSansSC-Regular.subset.otf' },
  { family: 'StarOrg Serif', file: 'NotoSerifSC-Regular.subset.otf' },
];

/** 字体缺失时必须显式失败：否则中文会静默渲染成方框，而证书已经发给客户了 */
function bundledFontCss() {
  const rules = [];
  for (const font of BUNDLED_FONTS) {
    const file = path.join(FONT_DIR, font.file);
    if (!existsSync(file)) {
      throw new Error(`缺少内置中文字体 ${font.file}，请运行 node scripts/fetch-fonts.mjs 生成（见 DECISIONS D10）`);
    }
    // 同一份文件声明 400/500/600 三个字重：仓库只带 Regular，
    // 不声明的话 500/600 会被 Chrome 合成加粗，CJK 合成加粗会发虚。
    for (const weight of [400, 500, 600]) {
      rules.push(`@font-face{font-family:'${font.family}';font-weight:${weight};src:url('${pathToFileURL(file).href}');}`);
    }
  }
  return rules.join('\n');
}

/** 把内置字体的 @font-face 与"优先使用内置字体"的栈注入页面 */
function withBundledFonts(html) {
  const css = `<style id="starorg-bundled-fonts">
${bundledFontCss()}
</style>`;
  return html.includes('</head>') ? html.replace('</head>', `${css}\n</head>`) : css + html;
}

const MAC_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
];

const PATH_CANDIDATES = [
  'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'headless_shell',
];

/**
 * 无头浏览器通用参数。
 * 关键点：--host-resolver-rules 让所有外部域名立刻解析失败，
 * 避免渲染进程卡在后台网络请求（CI 与本机沙盒环境都可能拦截外网）。
 */
const BASE_FLAGS = [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-sync',
  '--disable-extensions',
  '--disable-default-apps',
  '--metrics-recording-only',
  '--disable-breakpad',
  '--no-service-autorun',
  '--password-store=basic',
  '--use-mock-keychain',
  '--disable-client-side-phishing-detection',
  '--disable-domain-reliability',
  '--safebrowsing-disable-auto-update',
  '--disable-features=Translate,OptimizationHints,MediaRouter,InterestFeedContentSuggestions,NetworkTimeServiceQuerying',
  '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost',
  '--font-render-hinting=none',
];

let cachedBinary;

export function findChrome() {
  if (cachedBinary) return cachedBinary;
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    cachedBinary = process.env.CHROME_PATH;
    return cachedBinary;
  }
  for (const candidate of MAC_CANDIDATES) {
    if (existsSync(candidate)) {
      cachedBinary = candidate;
      return cachedBinary;
    }
  }
  for (const bin of PATH_CANDIDATES) {
    const which = spawnSync('which', [bin], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) {
      cachedBinary = which.stdout.trim();
      return cachedBinary;
    }
  }
  throw new Error(
    '未找到 Chrome/Chromium。请安装 Google Chrome，或设置 CHROME_PATH 环境变量指向可执行文件。',
  );
}

export function chromeAvailable() {
  try {
    findChrome();
    return true;
  } catch {
    return false;
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeTempHtml(html) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'starorg-html-'));
  const file = path.join(dir, 'page.html');
  // 页面本身不引用任何外部资源（字体也是本地 file://），配合 --host-resolver-rules 可完全离线渲染
  writeFileSync(file, withBundledFonts(html), 'utf8');
  return file;
}

/**
 * 渲染并等待产物落盘。
 * Chrome 在部分受限环境下完成渲染后不会自行退出（卡在关闭阶段），
 * 因此这里改为"轮询产物文件 + 稳定后杀掉进程"，渲染速度从分钟级降到秒级。
 */
function capture(args, outFile, { timeoutMs = 90_000 } = {}) {
  const binary = findChrome();
  const profile = mkdtempSync(path.join(os.tmpdir(), 'starorg-chrome-'));
  ensureDir(path.dirname(outFile));
  rmSync(outFile, { force: true });

  const child = spawn(binary, [...BASE_FLAGS, `--user-data-dir=${profile}`, ...args], {
    stdio: 'ignore',
    detached: true,
  });

  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  let stableRounds = 0;
  let produced = false;

  try {
    while (Date.now() < deadline) {
      if (existsSync(outFile)) {
        const size = statSync(outFile).size;
        if (size > 0 && size === lastSize) {
          stableRounds += 1;
          if (stableRounds >= 2) {
            produced = true;
            break;
          }
        } else {
          stableRounds = 0;
        }
        lastSize = size;
      }
      if (child.exitCode !== null && !existsSync(outFile)) break;
      sleepSync(150);
    }
  } finally {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* 进程可能已退出 */
    }
    try {
      child.kill('SIGKILL');
    } catch {
      /* 同上 */
    }
    rmSync(profile, { recursive: true, force: true });
  }

  if (!produced || !existsSync(outFile)) {
    throw new Error(`Chrome 渲染失败或超时（${timeoutMs}ms）：${outFile}`);
  }
  return outFile;
}

/** HTML → PDF（纸张与方向由模板内 @page 决定） */
export function renderPdf(html, outFile, options = {}) {
  const htmlFile = writeTempHtml(html);
  return capture(['--virtual-time-budget=3000', `--print-to-pdf=${outFile}`, '--no-pdf-header-footer', pathToFileURL(htmlFile).href], outFile, options);
}

/** HTML → PNG（固定像素尺寸，用于 OG 分享图） */
export function renderPng(html, outFile, { width = 1200, height = 630, timeoutMs } = {}) {
  const htmlFile = writeTempHtml(html);
  return capture(
    ['--force-device-scale-factor=1', '--virtual-time-budget=3000', `--window-size=${width},${height}`, `--screenshot=${outFile}`, pathToFileURL(htmlFile).href],
    outFile,
    { timeoutMs },
  );
}

export function chromeVersion() {
  const binary = findChrome();
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8' });
  return (result.stdout || '').trim();
}
