import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PATHS, loadConfig } from './config.mjs';
import { render } from './template.mjs';
import { t, resolveDefaultLocale } from './i18n.mjs';

export function loadTemplate(name) {
  return readFileSync(path.join(PATHS.templates, name), 'utf8');
}

const cache = new Map();
function template(name) {
  if (!cache.has(name)) cache.set(name, loadTemplate(name));
  return cache.get(name);
}

export function renderCertificateHtml(view) {
  const cfg = loadConfig();
  const certificateView = {
    ...view,
    // 匿名认领且策略允许时，证书仍保留姓名（证书由本人持有），但公开页不会引用它
    ownerName: view.anonymous && !cfg.policy.anonymousNameInCertificate ? '匿名认领人' : view.displayName || '匿名认领人',
    brandName: cfg.site.name,
    issuedLine: `本证书由 ${cfg.site.name} 于 ${view.registeredDateZh} 签发`,
    disclaimer:
      '本认领为纪念性质的公开可验证认领服务，不构成国际天文学联合会（IAU）官方命名，' +
      '亦不代表任何天体命名权。证书所载天文数据来自公开星表，供纪念与收藏之用。',
  };
  return render(template('certificate.html'), certificateView);
}

export function renderOgHtml(view) {
  const cfg = loadConfig();
  const locale = view.locale || resolveDefaultLocale();
  return render(template('og-image.html'), {
    ...view,
    brandName: cfg.site.name,
    tagline: t(locale, 'brand.tagline'),
  });
}

export function renderEmail(view) {
  const cfg = loadConfig();
  const locale = view.locale || resolveDefaultLocale();
  // 邮件主题来自文案目录（阶段 3 起会按买家下单时的语言取值）
  const subject = t(locale, 'email.subject', { starName: view.starTitle });
  const data = {
    ...view,
    brandName: cfg.site.name,
    supportEmail: cfg.site.supportEmail,
    registryDirUrl: cfg.site.registryDirUrl,
    subject,
  };
  return {
    subject: data.subject,
    html: render(template('email.html'), data),
    text: render(template('email.txt'), data),
  };
}
