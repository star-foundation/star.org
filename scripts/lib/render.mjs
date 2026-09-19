import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS, loadConfig } from './config.mjs';
import { render } from './template.mjs';
import { t, resolveDefaultLocale, loadCatalogs, interpolateCatalog } from './i18n.mjs';

export function loadTemplate(name) {
  return readFileSync(path.join(PATHS.templates, name), 'utf8');
}

const cache = new Map();
function template(name) {
  if (!cache.has(name)) cache.set(name, loadTemplate(name));
  return cache.get(name);
}

/**
 * 交付物（证书/OG/邮件）是**一次性生成、之后不重渲染**的，
 * 所以语言必须在生成时就确定：用认领记录里的 locale，缺失时回退站点默认语言。
 */
function artifactLocale(view) {
  return view.locale || resolveDefaultLocale();
}

/** 按语言解析交付物模板要用的目录（占位符在同一遍里替换掉） */
function artifactCatalog(locale, vars) {
  const cfg = loadConfig();
  return interpolateCatalog(loadCatalogs()[locale], { siteName: cfg.site.name, ...vars });
}

export function renderCertificateHtml(view) {
  const cfg = loadConfig();
  const locale = artifactLocale(view);
  const anonymousName = t(locale, 'star.anonymousOwner');
  const tpl = artifactCatalog(locale, {
    date: view.registeredDate,
    ident: view.simbadIdent,
    simbadUrl: view.simbadUrl,
    permalink: view.permalink,
    registryUrl: view.registryUrl,
    starId: view.starId,
    starTitle: view.starTitle,
    starSubtitle: view.starSubtitle,
    distance: view.distanceText,
    ra: view.raText,
    dec: view.decText,
    text: view.spectralText,
    label: view.spectralLabel,
  });
  const certificateView = {
    ...view,
    // 匿名认领且策略允许时，证书仍保留姓名（证书由本人持有），但公开页不会引用它
    ownerName: view.anonymous && !cfg.policy.anonymousNameInCertificate
      ? anonymousName
      : view.displayName || anonymousName,
    brandName: cfg.site.name,
    issuedLine: tpl.cert.issuedLine,
    disclaimer: tpl.cert.disclaimer,
    t: tpl,
  };
  return render(template('certificate.html'), certificateView);
}

export function renderOgHtml(view) {
  const cfg = loadConfig();
  const locale = artifactLocale(view);
  return render(template('og-image.html'), {
    ...view,
    brandName: cfg.site.name,
    tagline: t(locale, 'brand.tagline'),
    t: artifactCatalog(locale, {
      slug: view.slug,
      date: view.registeredDate,
      starId: view.starId,
      distance: view.distanceText,
    }),
  });
}

export function renderEmail(view) {
  const cfg = loadConfig();
  const locale = artifactLocale(view);
  // 邮件主题与正文都按买家下单时的语言渲染
  const subject = t(locale, 'email.subject', { starName: view.starTitle });
  const data = {
    ...view,
    brandName: cfg.site.name,
    supportEmail: cfg.site.supportEmail,
    registryDirUrl: cfg.site.registryDirUrl,
    subject,
    t: artifactCatalog(locale, {
      starId: view.starId,
      registryUrl: view.registryUrl,
      ra: view.raText,
      dec: view.decText,
      // greetingWithName 的 {{name}} 与 footer 的 {{supportEmail}} 都要在这里落地，
      // 否则邮件正文会残留 {{...}}
      name: view.displayName || '',
      supportEmail: cfg.site.supportEmail,
    }),
  };
  return {
    subject: data.subject,
    html: render(template('email.html'), data),
    text: render(template('email.txt'), data),
  };
}
