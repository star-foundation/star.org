import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

/** 建立测试沙盒：独立的候选库、登记目录、证书目录、站点输出，互不干扰 */
export function createSandbox({ availableStars = 5, poolSize = 8 } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'starorg-test-'));
  const dataDir = path.join(dir, 'data');
  const registrations = path.join(dataDir, 'registrations');
  mkdirSync(registrations, { recursive: true });

  const pool = JSON.parse(readFileSync(path.join(ROOT, 'data', 'stars_pool.json'), 'utf8'));
  const stars = pool.stars.slice(0, poolSize).map((star, index) => ({
    ...star,
    status: index < availableStars ? 'available' : 'assigned',
    assigned_slug: index < availableStars ? null : `preset0000${index}`,
    assigned_at: index < availableStars ? null : new Date().toISOString(),
  }));
  const sandboxPool = { ...pool, stars, count: stars.length, available: availableStars };
  writeFileSync(path.join(dataDir, 'stars_pool.json'), JSON.stringify(sandboxPool, null, 2));

  // 预置的 assigned 恒星需要有对应登记记录，否则自检会报孤立分配
  for (let index = availableStars; index < poolSize; index += 1) {
    const star = stars[index];
    writeFileSync(
      path.join(registrations, `${star.assigned_slug}.json`),
      JSON.stringify(
        {
          slug: star.assigned_slug,
          star_id: star.id,
          owner_display_name: 'Preassigned',
          anonymous: false,
          dedication_message: null,
          registered_at: new Date().toISOString(),
          star,
          artifacts: {},
        },
        null,
        2,
      ),
    );
  }

  return {
    dir,
    dataDir,
    registrations,
    poolFile: path.join(dataDir, 'stars_pool.json'),
    certificates: path.join(dir, 'certificates'),
    og: path.join(dir, 'og'),
    siteOut: path.join(dir, '_site'),
    outbox: path.join(dir, 'outbox'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export function sandboxEnv(sandbox, extra = {}) {
  return {
    ...process.env,
    STARORG_DATA_DIR: sandbox.dataDir,
    STARORG_REGISTRATIONS_DIR: sandbox.registrations,
    STARORG_POOL_FILE: sandbox.poolFile,
    STARORG_CERTIFICATES_DIR: sandbox.certificates,
    STARORG_OG_DIR: sandbox.og,
    STARORG_SITE_OUT: sandbox.siteOut,
    STARORG_OUTBOX_DIR: sandbox.outbox,
    STARORG_LOCK_DIR: path.join(sandbox.dir, '.lock'),
    STARORG_SLUG_SECRET: 'test-secret',
    EMAIL_PROVIDER: 'outbox',
    SITE_BASE_URL: 'https://star.test',
    ...extra,
  };
}

/** 以子进程方式运行脚本（真实进程隔离，才能测出跨进程并发行为） */
export function runScript(script, args = [], { sandbox, env = {}, input, timeoutMs = 180_000 } = {}) {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT,
    env: sandbox ? sandboxEnv(sandbox, env) : { ...process.env, ...env },
    input,
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    json: safeJson(result.stdout),
  };
}

export function safeJson(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  if (start === -1) return null;
  try {
    return JSON.parse(text.slice(start));
  } catch {
    return null;
  }
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function chromeAvailable() {
  try {
    const candidates = [
      process.env.CHROME_PATH,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ].filter(Boolean);
    return candidates.some((candidate) => existsSync(candidate)) || spawnSync('which', ['google-chrome']).status === 0;
  } catch {
    return false;
  }
}
