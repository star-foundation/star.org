import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { PATHS, loadConfig } from './config.mjs';
import { ensureDir, sha256File } from './fsx.mjs';
import { renderCertificateHtml, renderOgHtml } from './render.mjs';
import { renderPdf, renderPng } from './chrome.mjs';

export const OG_SIZE = { width: 1200, height: 630 };

export function certificateFile(slug) {
  return path.join(PATHS.certificates, `${slug}.pdf`);
}

export function ogFile(slug) {
  return path.join(PATHS.og, `${slug}.png`);
}

/** 渲染 PDF 证书（对应技术说明书 4.5） */
export function renderCertificate(view) {
  const out = certificateFile(view.slug);
  ensureDir(path.dirname(out));
  renderPdf(renderCertificateHtml(view), out);
  return { file: out, sha256: sha256File(out), bytes: statSync(out).size };
}

/** 渲染 OG 分享图（对应技术说明书 4.6，静态渲染 PNG，不依赖实时渲染服务） */
export function renderOg(view) {
  const out = ogFile(view.slug);
  ensureDir(path.dirname(out));
  renderPng(renderOgHtml({ ...view, starFieldSvg: view.starFieldSvg }), out, OG_SIZE);
  return { file: out, sha256: sha256File(out), bytes: statSync(out).size };
}

export function artifactsExist(slug) {
  return existsSync(certificateFile(slug)) && existsSync(ogFile(slug));
}
