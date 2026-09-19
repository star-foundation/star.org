/** 天文数据格式化与星图渲染（纯函数，无外部依赖） */

export const CONSTELLATION_ZH = {
  And: '仙女座', Ant: '唧筒座', Aps: '天燕座', Aqr: '宝瓶座', Aql: '天鹰座', Ara: '天坛座',
  Ari: '白羊座', Aur: '御夫座', Boo: '牧夫座', Cae: '雕具座', Cam: '鹿豹座', Cnc: '巨蟹座',
  CVn: '猎犬座', CMa: '大犬座', CMi: '小犬座', Cap: '摩羯座', Car: '船底座', Cas: '仙后座',
  Cen: '半人马座', Cep: '仙王座', Cet: '鲸鱼座', Cha: '蝘蜓座', Cir: '圆规座', Col: '天鸽座',
  Com: '后发座', CrA: '南冕座', CrB: '北冕座', Crv: '乌鸦座', Crt: '巨爵座', Cru: '南十字座',
  Cyg: '天鹅座', Del: '海豚座', Dor: '剑鱼座', Dra: '天龙座', Equ: '小马座', Eri: '波江座',
  For: '天炉座', Gem: '双子座', Gru: '天鹤座', Her: '武仙座', Hor: '时钟座', Hya: '长蛇座',
  Hyi: '水蛇座', Ind: '印第安座', Lac: '蝎虎座', Leo: '狮子座', LMi: '小狮座', Lep: '天兔座',
  Lib: '天秤座', Lup: '豺狼座', Lyn: '天猫座', Lyr: '天琴座', Men: '山案座', Mic: '显微镜座',
  Mon: '麒麟座', Mus: '苍蝇座', Nor: '矩尺座', Oct: '南极座', Oph: '蛇夫座', Ori: '猎户座',
  Pav: '孔雀座', Peg: '飞马座', Per: '英仙座', Phe: '凤凰座', Pic: '绘架座', Psc: '双鱼座',
  PsA: '南鱼座', Pup: '船尾座', Pyx: '罗盘座', Ret: '网罟座', Sge: '天箭座', Sgr: '人马座',
  Sco: '天蝎座', Scl: '玉夫座', Sct: '盾牌座', Ser: '巨蛇座', Sex: '六分仪座', Tau: '金牛座',
  Tel: '望远镜座', Tri: '三角座', TrA: '南三角座', Tuc: '杜鹃座', UMa: '大熊座', UMi: '小熊座',
  Vel: '船帆座', Vir: '室女座', Vol: '飞鱼座', Vul: '狐狸座',
};

/** 传统中文星名（按 IAU 英文星名精确匹配，仅收录可确证的条目） */
export const STAR_NAME_ZH = {
  Sirius: '天狼星', Canopus: '老人星', 'Rigil Kentaurus': '南门二', Arcturus: '大角星',
  Vega: '织女星', Capella: '五车二', Rigel: '参宿七', Procyon: '南河三', Achernar: '水委一',
  Betelgeuse: '参宿四', Hadar: '马腹一', Altair: '河鼓二', Acrux: '十字架二', Aldebaran: '毕宿五',
  Antares: '心宿二', Spica: '角宿一', Pollux: '北河三', Fomalhaut: '北落师门', Deneb: '天津四',
  Mimosa: '十字架三', Regulus: '轩辕十四', Adhara: '弧矢七', Castor: '北河二', Gacrux: '十字架一',
  Shaula: '尾宿八', Bellatrix: '参宿五', Elnath: '五车五', Miaplacidus: '南船五', Alnilam: '参宿二',
  Alnair: '鹤一', Alioth: '玉衡', Alnitak: '参宿一', Dubhe: '天枢', Mirfak: '天船三', Wezen: '弧矢一',
  Sargas: '尾宿五', 'Kaus Australis': '箕宿三', Avior: '海石一', Alkaid: '摇光', Menkalinan: '五车三',
  Atria: '三角形三', Alhena: '井宿三', Peacock: '孔雀十一', Mirzam: '军市一', Polaris: '勾陈一',
  Alphard: '星宿一', Hamal: '娄宿三', Algieba: '轩辕十二', Diphda: '土司空', Mizar: '开阳',
  Nunki: '斗宿四', Menkent: '库楼三', Mirach: '奎宿九', Alpheratz: '壁宿二', Rasalhague: '侯',
  Kochab: '北极二', Saiph: '参宿六', Denebola: '五帝座一', Algol: '大陵五', Aspidiske: '海石二',
  Alphecca: '贯索四', Mintaka: '参宿三', Sadr: '天津一', Eltanin: '天棓四', Schedar: '王良四',
  Almach: '天大将军一', Caph: '王良一', Merak: '天璇', Enif: '危宿三', Ankaa: '火鸟六',
  Phecda: '天玑', Sabik: '天市右垣十一', Scheat: '室宿二', Markab: '室宿一', Acamar: '天园六',
  Zubenelgenubi: '氐宿一', Unukalhai: '蜀', Sheratan: '娄宿一', Zosma: '西上相', Rastaban: '天棓三',
  Algenib: '壁宿一', Vindemiatrix: '东次将', Alcyone: '昴宿六', 'Deneb Algedi': '垒壁阵四',
  Sadalsuud: '虚宿一', Sadalmelik: '危宿一', Alderamin: '天钩五', Thuban: '右枢', Aludra: '弧矢二',
  Gienah: '轸宿一', Zubeneschamali: '氐宿四', Tarazed: '河鼓三', Alcor: '辅', Pherkad: '太子',
  Menkar: '天囷一', Mira: '蒭藁增二', Megrez: '天权', Izar: '梗河一', Mothallah: '天大将军增一',
};

/** 星座英文名（IAU 标准，键与 CONSTELLATION_ZH 完全一致） */
export const CONSTELLATION_EN = {
  And: 'Andromeda', Ant: 'Antlia', Aps: 'Apus', Aqr: 'Aquarius', Aql: 'Aquila', Ara: 'Ara',
  Ari: 'Aries', Aur: 'Auriga', Boo: 'Boötes', Cae: 'Caelum', Cam: 'Camelopardalis', Cnc: 'Cancer',
  CVn: 'Canes Venatici', CMa: 'Canis Major', CMi: 'Canis Minor', Cap: 'Capricornus', Car: 'Carina',
  Cas: 'Cassiopeia', Cen: 'Centaurus', Cep: 'Cepheus', Cet: 'Cetus', Cha: 'Chamaeleon',
  Cir: 'Circinus', Col: 'Columba', Com: 'Coma Berenices', CrA: 'Corona Australis',
  CrB: 'Corona Borealis', Crv: 'Corvus', Crt: 'Crater', Cru: 'Crux', Cyg: 'Cygnus', Del: 'Delphinus',
  Dor: 'Dorado', Dra: 'Draco', Equ: 'Equuleus', Eri: 'Eridanus', For: 'Fornax', Gem: 'Gemini',
  Gru: 'Grus', Her: 'Hercules', Hor: 'Horologium', Hya: 'Hydra', Hyi: 'Hydrus', Ind: 'Indus',
  Lac: 'Lacerta', Leo: 'Leo', LMi: 'Leo Minor', Lep: 'Lepus', Lib: 'Libra', Lup: 'Lupus',
  Lyn: 'Lynx', Lyr: 'Lyra', Men: 'Mensa', Mic: 'Microscopium', Mon: 'Monoceros', Mus: 'Musca',
  Nor: 'Norma', Oct: 'Octans', Oph: 'Ophiuchus', Ori: 'Orion', Pav: 'Pavo', Peg: 'Pegasus',
  Per: 'Perseus', Phe: 'Phoenix', Pic: 'Pictor', Psc: 'Pisces', PsA: 'Piscis Austrinus',
  Pup: 'Puppis', Pyx: 'Pyxis', Ret: 'Reticulum', Sge: 'Sagitta', Sgr: 'Sagittarius',
  Sco: 'Scorpius', Scl: 'Sculptor', Sct: 'Scutum', Ser: 'Serpens', Sex: 'Sextans', Tau: 'Taurus',
  Tel: 'Telescopium', Tri: 'Triangulum', TrA: 'Triangulum Australe', Tuc: 'Tucana',
  UMa: 'Ursa Major', UMi: 'Ursa Minor', Vel: 'Vela', Vir: 'Virgo', Vol: 'Volans', Vul: 'Vulpecula',
};

const GREEK = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ', Eta: 'η', The: 'θ', Iot: 'ι',
  Kap: 'κ', Lam: 'λ', Mu: 'μ', Nu: 'ν', Xi: 'ξ', Omi: 'ο', Pi: 'π', Rho: 'ρ', Sig: 'σ',
  Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω',
};

/**
 * 星座名。locale 默认 'zh' 以保持既有行为与测试；
 * 站点渲染一律显式传入当前语言（见 DECISIONS D9）。
 */
export function constellationName(abbr, locale = 'zh') {
  if (!abbr) return '';
  const map = locale === 'en' ? CONSTELLATION_EN : CONSTELLATION_ZH;
  return map[abbr] || abbr;
}

/** 保留旧名，等价于 constellationName(abbr, 'zh') */
export function constellationZh(abbr) {
  return constellationName(abbr, 'zh');
}

/** 星名：英文直接用 IAU 专名；中文查传统译名，查不到时回退专名本身 */
export function starName(properName, locale = 'zh') {
  if (!properName) return '';
  if (locale === 'en') return properName;
  return STAR_NAME_ZH[properName] || properName;
}

/** HYG 的 bayer 字段形如 "Alp" / "Alp1"，转成 "α" / "α¹" */
export function bayerLabel(bayer) {
  if (!bayer) return '';
  const m = /^([A-Za-z]{3})(\d?)$/.exec(bayer.trim());
  if (!m) return bayer;
  const letter = GREEK[m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()] || m[1];
  const sup = m[2] ? '¹²³⁴⁵⁶⁷⁸⁹'[Number(m[2]) - 1] || m[2] : '';
  return `${letter}${sup}`;
}

export function formatRa(raDeg) {
  if (!Number.isFinite(raDeg)) return '—';
  const total = ((raDeg % 360) + 360) % 360 / 15;
  const h = Math.floor(total);
  const mFloat = (total - h) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60);
  const fix = s === 60 ? [h, m + 1, 0] : [h, m, s];
  return `${String(fix[0]).padStart(2, '0')}h ${String(fix[1]).padStart(2, '0')}m ${String(fix[2]).padStart(2, '0')}s`;
}

export function formatDec(decDeg) {
  if (!Number.isFinite(decDeg)) return '—';
  const sign = decDeg < 0 ? '−' : '+';
  const abs = Math.abs(decDeg);
  const d = Math.floor(abs);
  const mFloat = (abs - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60);
  const fix = s === 60 ? [d, m + 1, 0] : [d, m, s];
  return `${sign}${String(fix[0]).padStart(2, '0')}° ${String(fix[1]).padStart(2, '0')}′ ${String(fix[2]).padStart(2, '0')}″`;
}

export function formatMagnitude(mag, locale = 'zh') {
  if (!Number.isFinite(mag)) return '—';
  return locale === 'en' ? `mag ${mag.toFixed(2)}` : `${mag.toFixed(2)} 等`;
}

export function formatDistance(ly, locale = 'zh') {
  if (!Number.isFinite(ly) || ly <= 0) return '—';
  const unit = locale === 'en' ? 'ly' : '光年';
  if (ly < 100) return `${ly.toFixed(1)} ${unit}`;
  if (ly < 1000) return `${Math.round(ly)} ${unit}`;
  return `${Math.round(ly).toLocaleString('en-US')} ${unit}`;
}

/** 光谱型 → 恒星颜色（用于证书与页面上的小色点） */
export function spectralColor(spectralType) {
  const cls = (spectralType || '').trim().charAt(0).toUpperCase();
  switch (cls) {
    case 'O': return '#9bb0ff';
    case 'B': return '#aabfff';
    case 'A': return '#cad7ff';
    case 'F': return '#f8f7ff';
    case 'G': return '#fff4ea';
    case 'K': return '#ffd2a1';
    case 'M': return '#ffb56c';
    default: return '#e8e4dc';
  }
}

export function spectralLabel(spectralType, locale = 'zh') {
  const cls = (spectralType || '').trim().charAt(0).toUpperCase();
  const zh = { O: '蓝巨星', B: '蓝白星', A: '白色星', F: '黄白星', G: '黄色星（类太阳）', K: '橙色星', M: '红色星' };
  const en = { O: 'blue giant', B: 'blue-white star', A: 'white star', F: 'yellow-white star', G: 'yellow star (Sun-like)', K: 'orange star', M: 'red star' };
  const map = locale === 'en' ? en : zh;
  return map[cls] || (locale === 'en' ? 'unknown spectral type' : '未知光谱型');
}

export function starTitle(star, locale = 'zh') {
  if (star.proper_name) return starName(star.proper_name, locale);
  return star.id;
}

export function starSubtitle(star, locale = 'zh') {
  const parts = [];
  if (star.constellation) {
    const name = constellationName(star.constellation, locale);
    const bayer = bayerLabel(star.bayer);
    parts.push(bayer ? `${name} ${bayer}` : name);
  }
  if (star.proper_name) {
    if (locale === 'en') {
      parts.push(star.proper_name);
    } else {
      const zh = STAR_NAME_ZH[star.proper_name];
      parts.push(zh ? `${zh}（${star.proper_name}）` : star.proper_name);
    }
  }
  if (star.hd) parts.push(`HD ${star.hd}`);
  parts.push(star.id);
  return parts.filter(Boolean).join(' · ');
}

/** 由 slug 派生确定性星空背景（同一颗星每次渲染结果一致，便于复现） */
export function starFieldSvg(seedText, { width = 1200, height = 630, count = 130 } = {}) {
  let seed = 2166136261;
  for (const ch of String(seedText || 'star')) {
    seed ^= ch.charCodeAt(0);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const dots = [];
  for (let i = 0; i < count; i += 1) {
    const x = (rand() * width).toFixed(1);
    const y = (rand() * height).toFixed(1);
    const r = (0.6 + rand() * 1.7).toFixed(2);
    const o = (0.18 + rand() * 0.6).toFixed(2);
    dots.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="#eef2fb" opacity="${o}"/>`);
  }
  return dots.join('');
}

/** 赤道坐标等距圆柱投影星图：标出该恒星在天球上的位置 */
export function skyChartSvg(star, opts = {}) {
  const w = opts.width || 720;
  const h = opts.height || 360;
  const pad = { l: 46, r: 18, t: 18, b: 34 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const x = (ra) => pad.l + ((((ra % 360) + 360) % 360) / 360) * innerW;
  const y = (dec) => pad.t + ((90 - dec) / 180) * innerH;

  const grid = [];
  for (let ra = 0; ra < 360; ra += 30) {
    const gx = x(ra).toFixed(1);
    grid.push(`<line x1="${gx}" y1="${pad.t}" x2="${gx}" y2="${pad.t + innerH}" stroke="#dcd6cc" stroke-width="1"/>`);
    grid.push(`<text x="${gx}" y="${h - 12}" fill="#9a938a" font-size="11" text-anchor="middle">${ra / 15}h</text>`);
  }
  for (let dec = -90; dec <= 90; dec += 30) {
    const gy = y(dec).toFixed(1);
    const strong = dec === 0;
    grid.push(`<line x1="${pad.l}" y1="${gy}" x2="${pad.l + innerW}" y2="${gy}" stroke="${strong ? '#c9c2b6' : '#e6e1d8'}" stroke-width="${strong ? 1.4 : 1}" ${strong ? 'stroke-dasharray="6 4"' : ''}/>`);
    grid.push(`<text x="${pad.l - 10}" y="${Number(gy) + 4}" fill="#9a938a" font-size="11" text-anchor="end">${dec > 0 ? '+' : ''}${dec}°</text>`);
  }

  const sx = x(star.ra).toFixed(1);
  const sy = y(star.dec).toFixed(1);
  const locale = opts.locale || 'zh';
  const label = starTitle(star, locale);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${label}${locale === "en" ? " on the celestial sphere" : " 在天球上的位置"}">
  <rect x="0" y="0" width="${w}" height="${h}" fill="#fbf9f5"/>
  <rect x="${pad.l}" y="${pad.t}" width="${innerW}" height="${innerH}" fill="none" stroke="#e6e1d8"/>
  ${grid.join('\n  ')}
  <line x1="${sx}" y1="${pad.t}" x2="${sx}" y2="${pad.t + innerH}" stroke="#2b3a55" stroke-width="1" stroke-dasharray="3 4" opacity="0.45"/>
  <line x1="${pad.l}" y1="${sy}" x2="${pad.l + innerW}" y2="${sy}" stroke="#2b3a55" stroke-width="1" stroke-dasharray="3 4" opacity="0.45"/>
  <circle cx="${sx}" cy="${sy}" r="10" fill="#2b3a55" opacity="0.12"/>
  <circle cx="${sx}" cy="${sy}" r="4.6" fill="#2b3a55"/>
  <text x="${sx}" y="${Number(sy) - 16}" fill="#2b3a55" font-size="13" font-weight="600" text-anchor="middle">${label}</text>
  <text x="${pad.l}" y="${pad.t - 5}" fill="#9a938a" font-size="11">${locale === "en" ? "RA →" : "赤经 →"}</text>
  <text x="${pad.l + 4}" y="${pad.t + 14}" fill="#9a938a" font-size="11">${locale === "en" ? "N celestial pole" : "北天极"}</text>
  <text x="${pad.l + 4}" y="${pad.t + innerH - 6}" fill="#9a938a" font-size="11">${locale === "en" ? "S celestial pole" : "南天极"}</text>
</svg>`;
}
