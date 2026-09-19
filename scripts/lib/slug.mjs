import crypto from 'node:crypto';

// Crockford Base32：去掉容易混淆的 i / l / o / u
const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

function base32(bytes, length) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < length) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length >= length) break;
  }
  return out;
}

/** 随机 slug（人工补单等无订单号场景使用） */
export function randomSlug(length = 10) {
  return base32(crypto.randomBytes(16), length);
}

/**
 * 由订单号派生确定性摘要（HMAC-SHA256）。
 * slug 生成与随机分配共用这一套派生逻辑：同一个订单号永远得到同一个摘要，
 * 因此不落盘订单号也能让重复触发落到同一结果。缺少订单号或密钥时返回 null，
 * 由调用方退化为真随机。
 */
export function deterministicDigest(orderId, secret) {
  if (!orderId || !secret) return null;
  return crypto.createHmac('sha256', String(secret)).update(String(orderId)).digest();
}

/**
 * 由订单号派生确定性 slug。
 * 好处：同一笔订单重复触发（Webhook 重投/用户重复提交）会落到同一个 slug，
 * 从而天然幂等，不会给同一位用户分配第二颗星；同时不落盘订单号，不泄露隐私。
 */
export function deterministicSlug(orderId, secret, length = 10) {
  const digest = deterministicDigest(orderId, secret);
  return digest ? base32(digest, length) : randomSlug(length);
}

export const SLUG_PATTERN = /^[0-9abcdefghjkmnpqrstvwxyz]{6,24}$/;

export function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_PATTERN.test(slug);
}
