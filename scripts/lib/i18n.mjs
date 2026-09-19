/**
 * 多语言文案层。
 *
 * 设计要点（对应 DECISIONS D9）：
 *   - 站点是**客户端切换**：URL 不变，页面默认渲染英文，中文目录随页面下发，
 *     由 site/assets/js/site.js 在运行时替换文案。因此英文必须无 JS 也完整可读。
 *   - 文案只有一处来源：site/i18n/<locale>.json。模板里只写 {{t.key}}，
 *     不把任何界面文案写死在 HTML 里，否则中英必然漂移。
 *   - 目录键集合必须完全一致：缺键或多余的键都会让构建失败，避免"半个页面被翻译"。
 *   - 合规规则按语言分别校验目录值（check-compliance.mjs），
 *     因为两种语言的文案同处一个 HTML 文件，只扫 HTML 会让规则静默失效。
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, loadConfig } from './config.mjs';

/**
 * 目标默认语言（阶段 4 生效）。当前站点默认语言由 resolveDefaultLocale() 决定，
 * 阶段 1-3 期间返回 'zh'，以保持与改造前完全一致的线上表现。
 */
export const DEFAULT_LOCALE = 'en';
export const LOCALES = ['en', 'zh'];

/** 语言元信息：HTML lang 与各语言自称 */
export const LOCALE_META = {
  en: { htmlLang: 'en', name: 'English' },
  zh: { htmlLang: 'zh-CN', name: '中文' },
};

const I18N_DIR = path.join(ROOT, 'site', 'i18n');

let cache = null;

export function catalogPath(locale) {
  return path.join(I18N_DIR, `${locale}.json`);
}

/**
 * 读取全部语言目录。
 * 返回**嵌套**结构（供模板 {{t.a.b}} 逐层查找）；校验与内嵌请用 flatCatalogs()。
 */
export function loadCatalogs({ reload = false } = {}) {
  if (cache && !reload) return cache;
  const catalogs = {};
  for (const locale of LOCALES) {
    catalogs[locale] = readCatalog(locale);
  }
  cache = catalogs;
  return catalogs;
}

function readCatalog(locale) {
  const file = catalogPath(locale);
  if (!existsSync(file)) throw new Error(`缺少文案目录：${file}`);
  return stripComments(JSON.parse(readFileSync(file, 'utf8')));
}

function stripComments(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('_')) continue;
    out[key] = value && typeof value === 'object' && !isPluralForm(value)
      ? stripComments(value)
      : value;
  }
  return out;
}

let flatCache = null;

/** 扁平目录："landing.trust.title" → 字符串（或复数对象）。校验、内嵌与合规扫描用这一份。 */
export function flatCatalogs({ reload = false } = {}) {
  if (flatCache && !reload) return flatCache;
  const nested = loadCatalogs({ reload });
  const flat = {};
  for (const locale of LOCALES) flat[locale] = flatten(nested[locale]);
  flatCache = flat;
  return flat;
}

/** 复数文案在目录里写成 {"one": "...", "other": "..."}，压平时按整体保留 */
function isPluralForm(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((k) => k === 'one' || k === 'other')
    && ('one' in value || 'other' in value);
}

/** 把嵌套目录压平成 "a.b.c" → 字符串，便于模板点号查找与键集合比对 */
function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('_')) continue; // _comment 等说明性字段
    const full = prefix ? `${prefix}.${key}` : key;
    if (isPluralForm(value)) {
      out[full] = value;
    } else if (value && typeof value === 'object') {
      flatten(value, full, out);
    } else {
      out[full] = String(value);
    }
  }
  return out;
}

/**
 * 从模板文本里抽取用到的目录键。
 * 覆盖 {{t.x}}、{{t.x!}}（不转义）、{{#if t.x}}、{{#unless t.x}}。
 */
export function usedKeys(templateText) {
  const keys = new Set();
  const re = /\{\{\s*[#/]?(?:if|unless|each)?\s*(t\.[\w.]+?)(?:!)?\s*\}\}/g;
  let match;
  while ((match = re.exec(templateText))) keys.add(match[1].slice(2));
  return keys;
}

/**
 * 校验目录完整性。
 * @param {string[]} templateTexts 所有模板文件内容
 * @returns {{missing: Array<{key:string,locales:string[]}>, unused: string[]}}
 */
export function validateCatalogs(templateTexts) {
  const catalogs = flatCatalogs({ reload: true });
  const used = new Set();
  for (const text of templateTexts) {
    for (const key of usedKeys(text)) used.add(key);
  }

  const missing = [];
  for (const key of [...used].sort()) {
    const absent = LOCALES.filter((locale) => catalogs[locale][key] === undefined);
    if (absent.length > 0) missing.push({ key, locales: absent });
  }

  const unused = [];
  for (const key of Object.keys(catalogs[DEFAULT_LOCALE]).sort()) {
    if (!used.has(key)) unused.push(key);
  }

  return { missing, unused };
}

/** 目录里带占位符的文案：{{count}} 之类由调用方先替换 */
export function interpolate(text, vars = {}) {
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, name) =>
    vars[name] === undefined ? `{{${name}}}` : String(vars[name]),
  );
}

/** 取一条文案；复数形式在目录里写成 {"one": "...", "other": "..."} */
export function t(locale, key, vars = {}) {
  const catalogs = flatCatalogs();
  const value = catalogs[locale]?.[key];
  if (value === undefined) throw new Error(`文案缺失：${locale} → ${key}`);
  if (Array.isArray(value)) {
    throw new Error(`文案 ${key} 是复数对象，请用 tPlural()`);
  }
  return interpolate(value, vars);
}

const PLURAL_FORM = { en: 'one', zh: 'other' };

/** 复数文案：中文不分单复数，统一取 other */
export function tPlural(locale, key, count, vars = {}) {
  const catalogs = flatCatalogs();
  const value = catalogs[locale]?.[key];
  if (value === undefined) throw new Error(`文案缺失：${locale} → ${key}`);
  if (typeof value === 'object') {
    const form = count === 1 ? PLURAL_FORM[locale] ?? 'other' : 'other';
    return interpolate(value[form] ?? value.other, { ...vars, count });
  }
  return interpolate(value, { ...vars, count });
}

const DATE_STYLE = {
  en: { order: 'mdy', joiner: ' ' },
  zh: { order: 'ymd', joiner: '' },
};

/** 按语言格式化日期：en → "September 19, 2026"，zh → "2026年9月19日" */
export function formatDate(iso, locale = DEFAULT_LOCALE) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (DATE_STYLE[locale]?.order === 'ymd') return `${year}年${month}月${day}日`;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[month - 1]} ${day}, ${year}`;
}

/**
 * 从**渲染后的页面**里抽取可切换的目录键（data-i18n="key"）。
 *
 * 为什么在渲染产物上抽而不是在模板上抽：部分键是构建期动态拼进属性的
 * （例如 data-i18n="{{entryLabelKey}}" → data-i18n="state.soldOut"），
 * 模板上看不到真实键名。产物是唯一准确来源。
 */
export function switchableKeys(html) {
  const keys = new Set();
  // 三种可切换的载体：节点文本、placeholder 属性、aria-label 属性。
  // 少收集一种，"这个字段切换后仍是中文"这类残缺就查不出来。
  const re = /data-i18n(?:-placeholder|-aria)?="([\w.]+)"/g;
  let match;
  while ((match = re.exec(html))) keys.add(match[1]);
  return keys;
}

/** 检查这些键在每种语言里都存在；返回缺失清单 */
export function missingKeysFor(keys) {
  const catalogs = flatCatalogs();
  const missing = [];
  for (const key of keys) {
    const absent = LOCALES.filter((locale) => catalogs[locale][key] === undefined);
    if (absent.length > 0) missing.push({ key, locales: absent });
  }
  return missing;
}

/**
 * 生成内嵌给客户端切换用的 JSON 脚本块。
 * 只内嵌本页真正用到的键，避免整份目录随每个页面下发。
 * `<` 转义为 \u003c，防止文案里出现 `</script>` 破坏脚本块。
 */
export function buildAltCatalogScript(locale, flatValues, keys) {
  const subset = {};
  for (const key of keys) {
    if (flatValues[key] !== undefined) subset[key] = flatValues[key];
  }
  const json = JSON.stringify(subset).replace(/</g, '\\u003c');
  return `<script type="application/json" id="i18n-alt" data-locale="${locale}">${json}</script>`;
}

/** 把嵌套目录压平成键值对（构建器内嵌时用） */
export function flattenCatalog(nested) {
  return flatten(nested);
}

/**
 * 生成给**前端脚本**用的双语目录块（id="i18n-js"）。
 *
 * 为什么需要它：有些文案不是静态节点，而是由 site.js 运行时写入的——付款等待页会
 * 轮播阶段提示、拼接订单号提示。这类文本没有 data-i18n 节点可替换，所以把 js.* 键的
 * 两种语言都内嵌进去，由脚本按当前语言取值。
 *
 * js.* 的值可能带运行时占位符（如 js.orderHint 的 {{order}}），构建期不做替换：
 * interpolate 只解析已知变量，未知的 {{order}} 原样保留，正好留给运行时填。
 */
export function buildJsCatalogScript(defaultLocale, altLocale) {
  const catalogs = flatCatalogs();
  const pick = (locale) => {
    const subset = {};
    for (const [key, value] of Object.entries(catalogs[locale])) {
      if (key.startsWith('js.')) subset[key] = value;
    }
    return subset;
  };
  // 目录里写 {{order}} 保持统一写法；内嵌给运行时前，把构建期没能解析的占位符
  // 换成 {order}，这样产物里不会残留 {{...}}——"无残留占位符"仍是可断言的不变量，
  // 同时明确区分"构建期已解析"与"运行时待填"两类占位符。
  const toRuntime = (value) => String(value).replace(/\{\{(\w+)\}\}/g, '{$1}');
  const runtimePick = (locale) => Object.fromEntries(
    Object.entries(pick(locale)).map(([key, value]) => [key, toRuntime(value)]),
  );
  const json = JSON.stringify({ default: runtimePick(defaultLocale), alt: runtimePick(altLocale) })
    .replace(/</g, '\\u003c');
  return `<script type="application/json" id="i18n-js" data-default-locale="${defaultLocale}" data-alt-locale="${altLocale}">${json}</script>`;
}

/**
 * 站点默认语言。
 *
 * 优先级：环境变量 STARORG_LOCALE（本地预览英文用，不影响线上）
 * → site.config.json 的 site.defaultLocale → 'zh'。
 *
 * 阶段 1-3 期间返回 'zh'，保持与改造前完全一致的线上表现；等全部页面与模板
 * 完成目录化后，阶段 4 才把 defaultLocale 改成 'en'。提前翻转会让英文访客
 * 看到"英文外壳 + 中文正文"的混合页，比现状更糟。
 */
export function resolveDefaultLocale() {
  const override = process.env.STARORG_LOCALE;
  if (override && LOCALES.includes(override)) return override;
  const configLocale = loadConfig().site?.defaultLocale;
  if (configLocale && LOCALES.includes(configLocale)) return configLocale;
  return 'zh';
}

/** 另一种语言。当前只支持两种；将来加语言时这里要改成"其余语言的列表"。 */
export function otherLocale(locale) {
  return locale === 'en' ? 'zh' : 'en';
}

export function htmlLang(locale) {
  return LOCALE_META[locale]?.htmlLang ?? locale;
}

/**
 * 构建期把目录里的 {{var}} 占位符替换成实际值（如 {{siteName}}、{{supportEmail}}、{{price}}）。
 *
 * 必须在渲染模板之前做：模板引擎拿到 {{t.x!}} 只会原样输出目录值，
 * 不会再去解析值里嵌套的 {{...}}。
 */
export function interpolateCatalog(nested, vars) {
  const out = {};
  for (const [key, value] of Object.entries(nested)) {
    if (isPluralForm(value)) {
      out[key] = Object.fromEntries(
        Object.entries(value).map(([form, text]) => [form, interpolate(text, vars)]),
      );
    } else if (value && typeof value === 'object') {
      out[key] = interpolateCatalog(value, vars);
    } else {
      out[key] = interpolate(value, vars);
    }
  }
  return out;
}