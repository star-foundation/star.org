import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createSandbox, runScript, readJson, chromeAvailable, copy } from './helpers.mjs';
// 模板会把目录值做 HTML 转义后再渲染（{{t.x}} → escapeHtml），
// 所以断言「页面里含某段文案」时要比较转义后的形式，
// 否则任何带撇号 / 引号 / & 的文案都会被误判成没渲染出来。
import { escapeHtml } from '../scripts/lib/template.mjs';

const hasChrome = chromeAvailable();
const skip = hasChrome ? false : '未检测到 Chrome/Chromium，跳过需要渲染的端到端用例';

function pngSize(file) {
  const buffer = readFileSync(file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), signature: buffer.subarray(0, 8).toString('hex') };
}

test('TC-ALLOC-01 / TC-PDF-01 / TC-PDF-02 / TC-MAIL-01 全链路：下单 → 分配 → 证书 → OG → 邮件', { skip }, () => {
  const sandbox = createSandbox({ availableStars: 2, poolSize: 4 });
  try {
    const order = {
      order_id: 'LS-E2E-1',
      display_name: '致 小满',
      email: 'xiaoman@example.com',
      dedication: '愿你每次抬头，都能看见属于自己的那颗星 ✨',
    };
    const result = runScript('register.mjs', [], { sandbox, input: JSON.stringify(order) });
    assert.equal(result.status, 0, result.stderr);
    const payload = result.json;
    assert.equal(payload.status, 'allocated');
    assert.equal(payload.mail.status, 'outbox', '未配置邮件服务时应写入 outbox 供人工核对');

    // 证书
    const certificate = path.join(sandbox.certificates, `${payload.slug}.pdf`);
    assert.ok(existsSync(certificate), '应生成 PDF 证书');
    const pdfBytes = readFileSync(certificate);
    assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-', '必须是合法 PDF 文件（TC-PDF-05）');
    assert.ok(statSync(certificate).size > 20_000, 'PDF 体积过小，可能渲染成空白页');

    // OG 图
    const og = path.join(sandbox.og, `${payload.slug}.png`);
    assert.ok(existsSync(og), '应生成 OG 分享图');
    const size = pngSize(og);
    assert.equal(size.width, 1200);
    assert.equal(size.height, 630);
    assert.equal(size.signature, '89504e470d0a1a0a', '必须是合法 PNG');
    assert.ok(statSync(og).size > 15_000, 'OG 图体积过小，可能渲染成空白图');

    // 认领记录：公开字段齐全、无隐私字段（TC-REG-03）
    const record = readJson(path.join(sandbox.registrations, `${payload.slug}.json`));
    assert.equal(record.star_id, payload.star_id);
    assert.equal(record.owner_display_name, '致 小满');
    assert.equal(record.dedication_message, order.dedication);
    assert.equal(record.star.spectral_type !== undefined, true);
    const serialized = JSON.stringify(record);
    assert.ok(!serialized.includes('xiaoman@example.com'), '认领记录不得包含邮箱');
    assert.ok(!serialized.includes('LS-E2E-1'), '认领记录不得包含订单号');
    assert.ok(record.artifacts.certificate_sha256, '应记录证书哈希，便于外部校验');

    // 邮件（TC-MAIL-02：链接正确、无占位符残留）
    const mailFiles = readdirSync(sandbox.outbox);
    const htmlFile = mailFiles.find((name) => name.endsWith('.html'));
    assert.ok(htmlFile, '应生成邮件内容');
    const html = readFileSync(path.join(sandbox.outbox, htmlFile), 'utf8');
    assert.ok(html.includes(`https://star.test/s/${payload.slug}/`), '邮件应包含永久链接');
    assert.ok(html.includes(`https://star.test/certificates/${payload.slug}.pdf`), '邮件应包含证书下载链接');
    assert.ok(!html.includes('{{'), '邮件模板不得残留未替换的占位符');

    // 候选库状态
    const pool = readJson(sandbox.poolFile);
    const star = pool.stars.find((item) => item.id === payload.star_id);
    assert.equal(star.status, 'assigned');
    assert.equal(star.assigned_slug, payload.slug);
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-01~04 / TC-PAGE-01~05 / TC-REG-01~05 站点构建与公开认领表', { skip }, () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 4 });
  try {
    const publicOrder = {
      order_id: 'LS-E2E-2',
      display_name: 'For Anna',
      email: 'anna@example.com',
      dedication: '致我们共同看过的每一片夜空',
    };
    const anonOrder = {
      order_id: 'LS-E2E-3',
      display_name: '不应出现在公开页面的名字',
      email: 'anon@example.com',
      anonymous: true,
    };
    const first = runScript('register.mjs', [], { sandbox, input: JSON.stringify(publicOrder) });
    const second = runScript('register.mjs', [], { sandbox, input: JSON.stringify(anonOrder) });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);

    const build = runScript('build-site.mjs', [], {
      sandbox,
      env: { LEMON_SQUEEZY_CHECKOUT_URL: 'https://star-org.lemonsqueezy.com/checkout/buy/test' },
    });
    assert.equal(build.status, 0, build.stderr);

    const out = sandbox.siteOut;
    // 首页 = 核心理念页（TC-LP-01 / DECISIONS D12）
    const landing = readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.ok(landing.includes(escapeHtml(copy('brand.tagline'))), '首页需含一句话价值主张');
    assert.ok(landing.includes(escapeHtml(copy('philosophy.title'))), '首页需渲染核心理念标题');
    // 公开购买关闭期间不露出任何入口；认领页与结算链路仍然完整保留（关入口、不拆业务）
    assert.ok(!/href="(?:\.\.\/)*\.?\/?register\/"/.test(landing), '首页不应链接到认领页');
    assert.ok(!landing.includes('lemonsqueezy'), '首页不应出现结算链接');
    const register = readFileSync(path.join(out, 'register', 'index.html'), 'utf8');
    assert.ok(register.includes('https://star-org.lemonsqueezy.com/checkout/buy/test'), '认领页表单需携带结算链接');
    assert.ok(register.includes('name="display_name"') && register.includes('name="dedication"'), '认领页需含姓名与献词表单');
    // 首页不露出公开认领表入口（理念页）；核实路径落在永久页上，见下方 TC-PAGE 断言
    assert.ok(!landing.includes('/registry/'), '首页不应露出公开认领表入口');
    assert.ok(landing.includes('IAU'), 'FAQ 需澄清 IAU 关系');
    assert.ok(landing.includes(copy('landing.faq.q4')), 'FAQ 需含退款政策');
    assert.ok(!landing.includes('{{'), '落地页不得残留占位符');

    // 公开认领表（TC-REG-01 / TC-REG-04）
    const registry = readFileSync(path.join(out, 'registry', 'index.html'), 'utf8');
    assert.ok(registry.includes(copy('common.nav.registry')));
    assert.ok(!/登录后可见|请先登录/.test(registry), '认领表不得设置访问门槛');
    assert.ok(registry.includes(first.json.star_id), '认领表应列出已认领恒星');
    assert.ok(registry.includes(second.json.star_id));
    // 目录值带构建期占位符（{{generatedAt}}），取占位符之前的部分断言
    assert.ok(registry.includes(copy('registry.dupOk').split('{{')[0].replace(/[\s(（]+$/, '')), '需给出查重结论');

    const index = readJson(path.join(out, 'data', 'registry-index.json'));
    assert.equal(index.duplicates.length, 0, '不得出现重复分配');
    assert.equal(index.count, 3, '索引应包含沙盒中全部认领记录（1 条预置 + 2 条新认领）');

    // 永久链接页面（TC-PAGE-01 / TC-PAGE-02 / TC-PAGE-03）
    const page = readFileSync(path.join(out, 's', first.json.slug, 'index.html'), 'utf8');
    assert.ok(page.includes(first.json.star_id));
    assert.ok(page.includes('For Anna'));
    assert.ok(page.includes(publicOrder.dedication));
    assert.ok(page.includes(`https://star.test/og/${first.json.slug}.png`), '需正确设置 og:image');
    assert.ok(page.includes('twitter:card'), '需设置 X 分享卡片');
    assert.ok(page.includes('https://twitter.com/intent/tweet'), '需提供分享按钮');
    assert.ok(page.includes('/certificates/' + first.json.slug + '.pdf'), '需提供证书下载');
    assert.ok(page.includes('/registry/'), '需提供验证入口');
    assert.ok(!page.includes('{{'), '永久页面不得残留占位符');

    // 匿名展示（TC-PAY-04 / TC-PAGE-05）
    const anonPage = readFileSync(path.join(out, 's', second.json.slug, 'index.html'), 'utf8');
    assert.ok(!anonPage.includes('不应出现在公开页面的名字'), '匿名认领不得公开姓名');
    assert.ok(anonPage.includes(copy('star.anonymousOwner')));
    const anonRecord = readJson(path.join(out, 'data', 'registrations', `${second.json.slug}.json`));
    assert.equal(anonRecord.owner_display_name, null, '匿名认领的公开记录不得写入姓名');

    // 404（TC-PAGE-04）与站点级文件
    assert.ok(existsSync(path.join(out, '404.html')));
    assert.ok(existsSync(path.join(out, 'sitemap.xml')));
    assert.ok(existsSync(path.join(out, 'robots.txt')));
    assert.ok(existsSync(path.join(out, 'CNAME')));
    assert.ok(existsSync(path.join(out, 'og', `${first.json.slug}.png`)), 'OG 图需随站点发布');
    assert.ok(existsSync(path.join(out, 'certificates', `${first.json.slug}.pdf`)), '证书需随站点发布');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-REG-02 / TC-REG-03 自检脚本能发现重复分配与隐私泄漏', { skip }, () => {
  const sandbox = createSandbox({ availableStars: 2, poolSize: 3 });
  try {
    const first = runScript('register.mjs', [], { sandbox, input: JSON.stringify({ display_name: 'A', email: 'a@example.com' }) });
    assert.equal(first.status, 0, first.stderr);
    const clean = runScript('verify-registry.mjs', [], { sandbox });
    assert.equal(clean.status, 0, `干净状态下自检应通过：${clean.stdout}`);

    // 人为制造一次重复分配，自检必须报错
    const recordPath = path.join(sandbox.registrations, `${first.json.slug}.json`);
    const record = readJson(recordPath);
    const forged = { ...record, slug: 'forgedslug1', artifacts: {} };
    writeFileSync(path.join(sandbox.registrations, 'forgedslug1.json'), JSON.stringify(forged));
    const dirty = runScript('verify-registry.mjs', [], { sandbox });
    assert.equal(dirty.status, 1, '重复分配必须被自检发现');
    assert.match(dirty.stdout, /DUPLICATE_STAR|FILE_SLUG_MISMATCH/);

    // 人为制造隐私泄漏
    writeFileSync(
      path.join(sandbox.registrations, 'leak.json'),
      JSON.stringify({ slug: 'leak', star_id: 'HIP-999999', owner_display_name: 'x', email: 'leak@example.com', registered_at: '2026-01-01T00:00:00Z' }),
    );
    const leaked = runScript('verify-registry.mjs', [], { sandbox });
    assert.match(leaked.stdout, /PRIVATE_DATA|DUPLICATE/);
    assert.equal(leaked.status, 1);
  } finally {
    sandbox.cleanup();
  }
});
