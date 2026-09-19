import { loadConfig } from './config.mjs';

export const MAX_DISPLAY_NAME = 40;

/** 视为"已付款"的订单状态（Lemon Squeezy 正常为 paid）。 */
export const PAID_STATUSES = new Set(['paid', 'succeeded', 'completed']);

/**
 * 解析布尔字段。Zapier / Lemon Squeezy 的 custom data 值都是字符串，
 * 直接 Boolean("false") 会得到 true —— 客户没勾匿名也会被当成匿名。
 */
export function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return false;
  const t = String(value).trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'on', '是'].includes(t);
}

/** 归一化订单信息。邮箱与订单号只在此处短暂存在，绝不写入公开文件。 */
export function normalizeOrder(input = {}) {
  const cfg = loadConfig();
  const maxDedication = cfg.product.maxDedicationChars || 100;

  // 认领名优先用客户在下单前表单自填的（LS 会放进 meta.custom_data → client_payload.display_name）；
  // 若为空（例如访客绕过落地页、直接打开结算链接下单），回退到 LS 订单里的持卡人姓名
  // （data.attributes.user_name → client_payload.fallback_display_name），避免正常付款却拒单。
  const ownName = clean(input.display_name ?? input.displayName ?? '', MAX_DISPLAY_NAME);
  const fallbackName = clean(
    input.fallback_display_name ?? input.fallbackDisplayName ?? input.user_name ?? '',
    MAX_DISPLAY_NAME,
  );
  const displayName = ownName || fallbackName;
  if (!displayName) {
    const err = new Error('缺少认领人姓名/称呼（display_name）');
    err.code = 'INVALID_ORDER';
    throw err;
  }

  // Lemon Squeezy 的 order_created 在订单创建时就触发，状态可能是 pending / failed /
  // refunded……只有真正付过款的才该占一颗星。这里做代码层校验，Zapier/Make 侧就不必
  // 再挂一个 Filter 步骤（免费版只允许两步 Zap，能少一步就少一步依赖）。
  // 字段缺省（人工派发补单、本地测试）时视为可信来源，不拦。
  const status = String(input.status ?? input.order_status ?? '').trim().toLowerCase();
  if (status && !PAID_STATUSES.has(status)) {
    const err = new Error(`订单未支付成功（status=${status}），拒绝认领`);
    err.code = 'UNPAID_ORDER';
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

  const slug = String(input.slug ?? '').trim();

  return {
    orderId: input.order_id ?? input.orderId ?? null,
    // 人工指定认领编号（改文案重发场景）；为空时由订单号派生
    slug: slug || null,
    displayName,
    email: email || null,
    dedication: dedication || null,
    dedicationTruncated: truncated,
    anonymous: parseBool(input.anonymous),
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
 * 构造公开认领记录。
 * 隐私红线：不含邮箱、订单号、IP 等任何可识别信息（TC-REG-03）。
 * 匿名认领（anonymous=true）时连展示名也不写入公开仓库（PRD 5.4）。
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
