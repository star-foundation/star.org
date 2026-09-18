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
 * 把恒星数据 + 登记记录整理成页面/证书/邮件/OG 图共用的展示模型。
 * 匿名登记：公开视图里不出现任何姓名。
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
  };
}
