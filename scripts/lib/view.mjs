import {
  starTitle, starSubtitle, formatRa, formatDec, formatMagnitude, formatDistance,
  spectralLabel, spectralColor, skyChartSvg, constellationZh, bayerLabel, starFieldSvg,
} from './astro.mjs';

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
export function buildStarView({ star, record, slug, baseUrl, registryUrl, certificateUrl, ogImageUrl, certificatePublic = true }) {
  const anonymous = Boolean(record?.anonymous);
  const displayName = anonymous ? null : record?.owner_display_name ?? null;
  return {
    slug,
    starId: star.id,
    starTitle: starTitle(star),
    starSubtitle: starSubtitle(star),
    properName: star.proper_name ?? null,
    constellationZh: constellationZh(star.constellation),
    bayer: bayerLabel(star.bayer),
    raText: formatRa(star.ra),
    decText: formatDec(star.dec),
    magnitudeText: formatMagnitude(star.magnitude),
    distanceText: formatDistance(star.distance_ly),
    spectralText: star.spectral_type || '—',
    spectralLabel: spectralLabel(star.spectral_type),
    spectralColor: spectralColor(star.spectral_type),
    skyChartSvg: skyChartSvg(star),
    starFieldSvg: starFieldSvg(slug),
    registeredAt: record?.registered_at ?? null,
    registeredDateZh: formatDateZh(record?.registered_at ?? new Date().toISOString()),
    registeredDateIso: formatDateIso(record?.registered_at ?? new Date().toISOString()),
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
