import { loadConfig } from './config.mjs';

export const MAX_DISPLAY_NAME = 40;

/** 归一化订单信息。邮箱与订单号只在此处短暂存在，绝不写入公开文件。 */
export function normalizeOrder(input = {}) {
  const cfg = loadConfig();
  const maxDedication = cfg.product.maxDedicationChars || 100;

  const displayName = clean(input.display_name ?? input.displayName ?? '', MAX_DISPLAY_NAME);
  if (!displayName) {
    const err = new Error('缺少登记人姓名/称呼（display_name）');
    err.code = 'INVALID_ORDER';
    throw err;
  }

  const email = String(input.email ?? '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    const err = new Error('邮箱格式不正确');
    err.code = 'INVALID_ORDER';
    throw err;
  }

  const rawDedication = clean(input.dedication ?? input.dedication_message ?? '', maxDedication + 1, true);
  const truncated = [...rawDedication].length > maxDedication;
  const dedication = truncated ? [...rawDedication].slice(0, maxDedication).join('') : rawDedication;

  return {
    orderId: input.order_id ?? input.orderId ?? null,
    displayName,
    email: email || null,
    dedication: dedication || null,
    dedicationTruncated: truncated,
    anonymous: Boolean(input.anonymous),
    source: input.source || 'lemon-squeezy',
    receivedAt: new Date().toISOString(),
  };
}

function clean(value, maxLength, keepNewlines = false) {
  let text = String(value ?? '');
  if (!keepNewlines) text = text.replace(/[\r\n\t]+/g, ' ');
  text = text
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim();
  return [...text].slice(0, maxLength).join('');
}

/**
 * 构造公开登记记录。
 * 隐私红线：不含邮箱、订单号、IP 等任何可识别信息（TC-REG-03）。
 * 匿名登记（anonymous=true）时连展示名也不写入公开仓库（PRD 5.4）。
 */
export function buildRegistrationRecord({ slug, star, order, registeredAt, certificateSha256, ogSha256 }) {
  const anonymous = Boolean(order.anonymous);
  return {
    slug,
    star_id: star.id,
    owner_display_name: anonymous ? null : order.displayName,
    anonymous,
    dedication_message: order.dedication || null,
    registered_at: registeredAt,
    star: {
      id: star.id,
      hip: star.hip ?? null,
      hd: star.hd ?? null,
      proper_name: star.proper_name ?? null,
      bayer: star.bayer ?? null,
      flam: star.flam ?? null,
      constellation: star.constellation ?? null,
      ra: star.ra,
      dec: star.dec,
      magnitude: star.magnitude,
      spectral_type: star.spectral_type ?? null,
      distance_ly: star.distance_ly ?? null,
    },
    artifacts: {
      certificate: `certificates/${slug}.pdf`,
      certificate_sha256: certificateSha256 ?? null,
      og_image: `og/${slug}.png`,
      og_sha256: ogSha256 ?? null,
      certificate_public: !anonymous || loadConfig().policy.anonymousNameInCertificate,
    },
  };
}

export const PRIVATE_FIELD_NAMES = [
  'email', 'owner_email', 'customer_email', 'order_id', 'orderid', 'orderId',
  'customer_name', 'real_name', 'ip', 'address', 'phone', 'card', 'payment_id',
];
