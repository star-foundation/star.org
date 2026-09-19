import {
  starTitle, starSubtitle, formatRa, formatDec, formatMagnitude, formatDistance,
  spectralLabel, spectralColor, skyChartSvg, constellationName, bayerLabel, starFieldSvg,
} from './astro.mjs';
import { formatDate } from './i18n.mjs';

export function formatDateZh(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

export function formatDateIso(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/**
 * 把恒星数据 + 认领记录整理成页面/证书/邮件/OG 图共用的展示模型。
 * 匿名认领：公开视图里不出现任何姓名。
 */
export function buildStarView({
  star, record, slug, baseUrl, registryUrl, certificateUrl, ogImageUrl,
  certificatePublic = true, locale = 'zh',
}) {
  const anonymous = Boolean(record?.anonymous);
  const displayName = anonymous ? null : record?.owner_display_name ?? null;
  const registeredAt = record?.registered_at ?? new Date().toISOString();
  return {
    slug,
    locale,
    starId: star.id,
    starTitle: starTitle(star, locale),
    starSubtitle: starSubtitle(star, locale),
    properName: star.proper_name ?? null,
    constellationName: constellationName(star.constellation, locale),
    bayer: bayerLabel(star.bayer),
    raText: formatRa(star.ra),
    decText: formatDec(star.dec),
    magnitudeText: formatMagnitude(star.magnitude, locale),
    distanceText: formatDistance(star.distance_ly, locale),
    spectralText: star.spectral_type || '—',
    spectralLabel: spectralLabel(star.spectral_type, locale),
    spectralColor: spectralColor(star.spectral_type),
    skyChartSvg: skyChartSvg(star, { locale }),
    starFieldSvg: starFieldSvg(slug),
    registeredAt,
    // 按语言格式化的日期（en → September 19, 2026；zh → 2026年9月19日）
    registeredDate: formatDate(registeredAt, locale),
    // 旧字段名保留为别名，证书/邮件模板在阶段 3 迁移完成后即删除
    registeredDateZh: formatDate(registeredAt, 'zh'),
    registeredDateIso: formatDateIso(registeredAt),
    displayName,
    anonymous,
    dedication: record?.dedication_message ?? null,
    permalink: `${baseUrl}/s/${slug}/`,
    certificateUrl,
    ogImageUrl,
    registryUrl,
    certificatePublic: Boolean(certificatePublic),
    // SIMBAD 外链：斯特拉斯堡天文数据中心的天体数据库，用来让认领人自己核实
    // "这颗星真实存在、而且这些天文数据不是我们编的"。HIP 编号在场内 800 颗星上全都有，
    // 所以统一用 Ident=HIP+<hip> 查询；万一将来出现没有 HIP 的星，退化为按坐标查询。
    simbadIdent: hipIdent(star),
    simbadUrl: simbadUrl(star),
  };
}

/** SIMBAD 用的标识（优先 HIP，其次 HD，最后按坐标）。 */
function hipIdent(star) {
  if (star.hip) return `HIP ${star.hip}`;
  if (star.hd) return `HD ${star.hd}`;
  return `${star.ra} ${star.dec}`;
}

/**
 * 构造 SIMBAD 查询链接。
 * 官方查询入口：/simbad/sim-id?Ident=<标识>，也可用 /simbad/sim-coo?Coord=<赤经>+<赤纬>。
 * 用 query 参数形式（+ 表示空格）在浏览器里可读性更好。
 */
export function simbadUrl(star) {
  const base = 'https://simbad.cds.unistra.fr/simbad/sim-id';
  if (star.hip) return `${base}?Ident=HIP+${star.hip}`;
  if (star.hd) return `${base}?Ident=HD+${star.hd}`;
  return `https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${star.ra}+${star.dec}`;
}
