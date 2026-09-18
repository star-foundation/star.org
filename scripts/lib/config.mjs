import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

// 路径均可通过环境变量重定向，便于测试在沙盒目录里跑完整链路而不污染正式数据
const DATA_DIR = process.env.STARORG_DATA_DIR || path.join(ROOT, 'data');

export const PATHS = {
  root: ROOT,
  dataDir: DATA_DIR,
  pool: process.env.STARORG_POOL_FILE || path.join(DATA_DIR, 'stars_pool.json'),
  registrations: process.env.STARORG_REGISTRATIONS_DIR || path.join(DATA_DIR, 'registrations'),
  registryIndex: process.env.STARORG_REGISTRY_INDEX || path.join(DATA_DIR, 'registry-index.json'),
  certificates: process.env.STARORG_CERTIFICATES_DIR || path.join(ROOT, 'certificates'),
  og: process.env.STARORG_OG_DIR || path.join(ROOT, 'og'),
  siteSrc: path.join(ROOT, 'site'),
  templates: path.join(ROOT, 'templates'),
  out: process.env.STARORG_SITE_OUT || path.join(ROOT, '_site'),
  // 隐私目录：订单台账、测试运行产物；默认不进公开仓库
  privateDir: process.env.STARORG_PRIVATE_DIR || path.join(ROOT, 'private'),
  outbox: process.env.STARORG_OUTBOX_DIR || path.join(ROOT, 'outbox'),
  lockDir: process.env.STARORG_LOCK_DIR || path.join(ROOT, 'data', '.allocation-lock'),
};

let cached = null;

export function loadConfig() {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
  const baseUrl = (process.env.SITE_BASE_URL || raw.site.baseUrl || '').replace(/\/+$/, '');
  const checkoutUrl = process.env.LEMON_SQUEEZY_CHECKOUT_URL || raw.product.checkoutUrl || '';
  const registryRepoUrl = process.env.REGISTRY_REPO_URL || raw.site.registryRepoUrl || '';
  cached = {
    ...raw,
    site: {
      ...raw.site,
      baseUrl,
      checkoutUrl,
      registryRepoUrl,
      // GitHub 仓库里的公开登记表目录（供任何访客自行核对）
      registryDirUrl: registryRepoUrl
        ? `${registryRepoUrl.replace(/\/+$/, '')}/tree/main/data/registrations`
        : '',
    },
    // 站点是否已具备收款条件（未配置结算链接 = 试运行/补货中）
    checkoutReady: Boolean(checkoutUrl) && !process.env.STARORG_FORCE_SOLD_OUT,
  };
  return cached;
}

export function siteBaseUrl() {
  return loadConfig().site.baseUrl;
}

export function registrationUrl(slug) {
  return `${siteBaseUrl()}/s/${slug}/`;
}

export function certificateUrl(slug) {
  return `${siteBaseUrl()}/certificates/${slug}.pdf`;
}

export function ogImageUrl(slug) {
  return `${siteBaseUrl()}/og/${slug}.png`;
}

export function assertConfig() {
  const cfg = loadConfig();
  if (!existsSync(path.join(ROOT, 'data', 'stars_pool.json'))) {
    throw new Error('缺少 data/stars_pool.json，请先运行 npm run build:pool');
  }
  return cfg;
}
