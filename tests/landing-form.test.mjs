import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createSandbox, runScript, readJson, copy, claimLabel } from './helpers.mjs';
import { buildStarView } from '../scripts/lib/view.mjs';
import { renderCertificateHtml } from '../scripts/lib/render.mjs';

const CHECKOUT_URL = 'https://store.lemonsqueezy.com/checkout/buy/test-variant';
const NO_CHROME = { CHROME_PATH: path.join('/nonexistent', 'chrome') };

function build(sandbox, env = {}) {
  const result = runScript('build-site.mjs', [], { sandbox, env: { ...NO_CHROME, ...env } });
  assert.equal(result.status, 0, result.stderr);
  return {
    landing: readFileSync(path.join(sandbox.siteOut, 'index.html'), 'utf8'),
    register: readFileSync(path.join(sandbox.siteOut, 'register', 'index.html'), 'utf8'),
    sitemap: readFileSync(path.join(sandbox.siteOut, 'sitemap.xml'), 'utf8'),
  };
}

test('TC-LP-09 认领表单在独立的 /register/ 页面，含姓名/献词/匿名', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const { register } = build(sandbox, { LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL });
    assert.ok(register.includes('data-registration-form'), '认领页应渲染表单');
    assert.ok(register.includes('data-checkout-url="' + CHECKOUT_URL + '"'), '表单应携带结算链接');
    assert.ok(register.includes('name="display_name"'), '应有姓名输入框');
    assert.ok(register.includes('name="dedication"'), '应有献词输入框');
    assert.ok(register.includes('name="anonymous"'), '应有匿名选项');
    assert.ok(register.includes('/assets/js/checkout-url.mjs'), '应加载 checkout-url 纯函数模块');
    assert.ok(register.includes('去支付'), '认领页应有支付按钮');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-10 落地页不再内嵌表单，三个申请入口统一指向 /register/', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const { landing } = build(sandbox, { LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL });
    assert.ok(!landing.includes('data-registration-form'), '落地页不应再内嵌表单');
    // 构建会把根路径相对化：落地页（深度 0）上是 ./register/
    const ctaCount = (landing.match(/href="\.?\/?register\/"/g) || []).length;
    assert.equal(ctaCount, 3, '导航 / 主视觉 / 购买区三个入口都应指向 /register/，实际 ' + ctaCount);
    assert.ok(!landing.includes('href="' + CHECKOUT_URL + '"'), '落地页不应再直接跳到结算页');
    const claim = claimLabel();
    const labels = landing.split('>' + claim + '<').length - 1;
    assert.equal(labels, 3, '三个入口文案应统一为「' + claim + '」，实际 ' + labels);
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-11 未配置结算链接：认领页显示通道接入中且无表单，落地页也无表单', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const { landing, register } = build(sandbox);
    assert.ok(!register.includes('data-registration-form'), '未配置时认领页不应出现表单');
    assert.ok(register.includes('购买通道接入中'), '认领页应说明通道接入中');
    assert.ok(!landing.includes('data-registration-form'), '未配置时落地页也不应有表单');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-12 认领页收录进 sitemap', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const { sitemap } = build(sandbox, { LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL });
    assert.ok(sitemap.includes('/register/'), 'sitemap 应包含认领页（绝对地址）');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-13 全站导航统一：每页都有「认领一颗星」→ 认领页，且不再内嵌结算链接', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const result = runScript('register.mjs', [], {
      sandbox,
      input: JSON.stringify({ order_id: 'NAV-1', display_name: '导航测试', status: 'paid' }),
    });
    assert.equal(result.status, 0, result.stderr);
    const { landing, register, sitemap } = build(sandbox, { LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL });
    assert.ok(sitemap.includes('/register/'), 'sitemap 应含认领页');

    const slug = result.json.slug;
    const pages = {
      'index.html': landing,
      'register/index.html': register,
      'registry/index.html': readFileSync(path.join(sandbox.siteOut, 'registry', 'index.html'), 'utf8'),
      404: readFileSync(path.join(sandbox.siteOut, '404.html'), 'utf8'),
      ['s/' + slug + '/index.html']: readFileSync(path.join(sandbox.siteOut, 's', slug, 'index.html'), 'utf8'),
    };
    for (const [name, html] of Object.entries(pages)) {
      assert.ok(html.includes('>' + claimLabel() + '<'), name + ' 导航应有统一的「' + claimLabel() + '」按钮');
      assert.ok(/href="(?:\.\.\/)*\.?\/?register\/"/.test(html), name + ' 按钮应指向认领页');
      if (name !== 'register/index.html') {
        assert.ok(!html.includes('lemonsqueezy.com/checkout'), name + ' 不应内嵌结算链接（统一经认领页）');
      }
      assert.ok(!html.includes('{{'), name + ' 不得残留模板占位符');
    }
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-14 付款完成等待页 /thanks/：可回站、带订单号提示、noindex、不进 sitemap', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 3 });
  try {
    const result = runScript('build-site.mjs', [], {
      sandbox,
      env: { ...NO_CHROME, LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL },
    });
    assert.equal(result.status, 0, result.stderr);
    const thanks = readFileSync(path.join(sandbox.siteOut, 'thanks', 'index.html'), 'utf8');
    assert.ok(thanks.includes('付款已收到'), '应确认付款已收到');
    assert.ok(thanks.includes('data-order-hint'), '应能展示 Lemon Squeezy 传来的订单号');
    assert.ok(thanks.includes('noindex'), '购买后过渡页应 noindex');
    assert.ok(thanks.includes('>' + claimLabel() + '<'), '导航应与其他页统一');
    assert.ok(thanks.includes('公开认领表'), '应提供回站入口');
    assert.ok(!thanks.includes('{{'), '不得残留占位符');
    const sitemap = readFileSync(path.join(sandbox.siteOut, 'sitemap.xml'), 'utf8');
    assert.ok(!sitemap.includes('/thanks/'), '过渡页不应进 sitemap');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-REG-06 公开认领表显示候选库进度：百分比与进度条随认领数变化', () => {
  // poolSize=4 且预置 1 颗已分配 → 认领表已有 1 条；再认领 1 条后应为 2/4 = 50%
  const sandbox = createSandbox({ availableStars: 3, poolSize: 4 });
  try {
    const reg = runScript('register.mjs', [], {
      sandbox,
      input: JSON.stringify({ order_id: 'PROG-1', display_name: '进度测试', status: 'paid' }),
    });
    assert.equal(reg.status, 0, reg.stderr);
    const built = runScript('build-site.mjs', [], { sandbox, env: NO_CHROME });
    assert.equal(built.status, 0, built.stderr);
    const html = readFileSync(path.join(sandbox.siteOut, 'registry', 'index.html'), 'utf8');
    assert.ok(html.includes('class="progress-track"'), '应有进度条');
    assert.ok(html.includes('role="progressbar"'), '进度条应带无障碍语义');
    assert.ok(html.includes('aria-valuenow="50"'), '2/4 应算出 50%，实际：' + (html.match(/aria-valuenow="[^"]*"/) || [])[0]);
    assert.ok(html.includes('>50%<'), '应显示 50% 文字');
    assert.ok(html.includes('2 / 4'), '应显示 已认领/总数');
    // 进度说明里的"最近 7 天新增"数量：用目录键取文案片段，不写死中文
    const recentLabel = copy('registry.progressFoot');
    assert.ok(html.includes('<strong>2</strong>'), '应统计最近 7 天新增');
    assert.ok(recentLabel.includes('7'), '进度文案应说明统计窗口为 7 天');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-REG-07 候选库无认领时进度条为空轨道（不显示"已开始"最小宽度）', () => {
  const sandbox = createSandbox({ availableStars: 4, poolSize: 4 });
  try {
    const built = runScript('build-site.mjs', [], { sandbox, env: NO_CHROME });
    assert.equal(built.status, 0, built.stderr);
    const html = readFileSync(path.join(sandbox.siteOut, 'registry', 'index.html'), 'utf8');
    assert.ok(html.includes('aria-valuenow="0"'), '0 条时应为 0%');
    assert.ok(!html.includes('is-started'), '0 条时不应出现最小可见宽度类');
    assert.ok(html.includes('<strong>0</strong>'), '近期新增应为 0');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-15 等待页 /thanks/ 显示两块进度：证书生成中（不确定）+ 候选库真实计数', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 4 });
  try {
    const reg = runScript('register.mjs', [], {
      sandbox,
      input: JSON.stringify({ order_id: 'THANKS-1', display_name: '等待页', status: 'paid' }),
    });
    assert.equal(reg.status, 0, reg.stderr);
    const built = runScript('build-site.mjs', [], {
      sandbox,
      env: { ...NO_CHROME, LEMON_SQUEEZY_CHECKOUT_URL: CHECKOUT_URL },
    });
    assert.equal(built.status, 0, built.stderr);
    const html = readFileSync(path.join(sandbox.siteOut, 'thanks', 'index.html'), 'utf8');
    // 证书生成中：不确定进度条 + 阶段文案 + 端点提示
    assert.ok(html.includes('is-indeterminate'), '应有不确定进度条表示证书生成中');
    assert.ok(html.includes('data-thanks-stage'), '应有阶段文案（正在分配恒星…）');
    assert.ok(html.includes('正在分配恒星'), '初始阶段文案应为"正在分配恒星"');
    // 候选库真实计数：poolSize=4 且预置 1 条 + 新认领 1 条 = 2
    assert.ok(html.includes('data-pool-count'), '应有候选库计数元素');
    assert.ok(html.includes('data-pool-label>2 / 4'), '候选库计数应为 2 / 4，实际：' + (html.match(/data-pool-label>[^<]*/) || [])[0]);
    assert.ok(html.includes('data-pool-percent>50%'), '百分比应为 50%');
    assert.ok(html.includes('aria-valuenow="50"'), '进度条 aria 值应为 50');
    assert.ok(html.includes('data-pool-done'), '应有"数字 +1 即完成"的提示元素');
    assert.ok(!html.includes('{{'), '不得残留占位符');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-STAR-01 永久链接页与证书都给出 SIMBAD 外链（可核实恒星真实存在）', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 4 });
  try {
    const reg = runScript('register.mjs', [], {
      sandbox,
      input: JSON.stringify({ order_id: 'SIMBAD-1', display_name: '证星人', status: 'paid' }),
    });
    assert.equal(reg.status, 0, reg.stderr);
    const slug = reg.json.slug;
    const starId = reg.json.star_id;                     // 形如 HIP-32349
    const hip = String(starId).replace(/^HIP-/, '');

    // 永久链接页
    const built = runScript('build-site.mjs', [], { sandbox, env: NO_CHROME });
    assert.equal(built.status, 0, built.stderr);
    const page = readFileSync(path.join(sandbox.siteOut, 's', slug, 'index.html'), 'utf8');
    const expected = 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=HIP+' + hip;
    assert.ok(page.includes(expected), '永久页应含 SIMBAD 链接：' + expected);
    assert.ok(page.includes('SIMBAD'), '永久页应出现 SIMBAD 字样');
    assert.ok(page.includes('rel="noopener noreferrer"'), '外链应带安全的 rel 属性');
    assert.ok(page.includes('target="_blank"'), '外链应新开标签');
    assert.ok(page.includes('HIP ' + hip), '应显示 SIMBAD 用的标识 HIP ' + hip);

    // 证书：证书是打印件，也要带上 SIMBAD 核实路径。
    // 断言渲染后的证书而非模板源码——文案自阶段 1 起集中在 site/i18n/*.json（DECISIONS D9），
    // 模板里只剩 {{t.*}} 键，只有渲染产物才能证明"证书上真的有这条核实路径"。
    const record = readJson(path.join(sandbox.registrations, slug + '.json'));
    const certView = buildStarView({
      star: record.star,
      record,
      slug,
      baseUrl: 'https://star.test',
      registryUrl: 'https://star.test/registry/',
      certificateUrl: 'https://star.test/certificates/' + slug + '.pdf',
      ogImageUrl: 'https://star.test/og/' + slug + '.png',
      locale: 'zh',
    });
    const certHtml = renderCertificateHtml(certView);
    assert.ok(certHtml.includes('https://simbad.cds.unistra.fr/simbad/sim-id?Ident=HIP+' + hip),
      '证书应给出 SIMBAD 查询链接');
    assert.ok(certHtml.includes('HIP ' + hip), '证书应显示 SIMBAD 用的标识 HIP ' + hip);
    assert.ok(certHtml.includes('SIMBAD'), '证书应写明 SIMBAD 核实步骤');

    // 证书 PDF 应已生成（渲染链路没被新字段破坏）
    const certPdf = path.join(sandbox.dataDir, '..', 'certificates', slug + '.pdf');
    assert.ok(readFileSync(certPdf).length > 1000, '证书 PDF 应已生成且非空');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-STAR-02 SIMBAD 链接在缺少 HIP 编号时依次回退到 HD、坐标', async () => {
  const { simbadUrl } = await import('../scripts/lib/view.mjs');
  assert.equal(simbadUrl({ hip: 32349 }), 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=HIP+32349');
  assert.equal(simbadUrl({ hd: 48915 }), 'https://simbad.cds.unistra.fr/simbad/sim-id?Ident=HD+48915');
  assert.equal(
    simbadUrl({ ra: 101.287214, dec: -16.716116 }),
    'https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=101.287214+-16.716116',
  );
  // HIP 优先于 HD
  assert.ok(simbadUrl({ hip: 1, hd: 2 }).includes('HIP+1'));
});

test('TC-LP-16 落地页「最近一次认领」展示真实星体、认领人与献词', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 5 });
  try {
    const reg = runScript('register.mjs', [], {
      sandbox,
      input: JSON.stringify({
        order_id: 'LATEST-1', display_name: '张三', dedication: '愿你抬头就能看见', status: 'paid',
      }),
    });
    assert.equal(reg.status, 0, reg.stderr);
    const built = runScript('build-site.mjs', [], { sandbox, env: NO_CHROME });
    assert.equal(built.status, 0, built.stderr);
    const html = readFileSync(path.join(sandbox.siteOut, 'index.html'), 'utf8');
    assert.ok(html.includes('最近一次认领'), '应显示「最近一次认领」标题');
    assert.ok(!html.includes('（示例数据）'), '有真实认领时不应再称示例数据');
    assert.ok(html.includes('最新记录 ' + reg.json.slug), '应标注最新认领编号');
    assert.ok(html.includes('张三'), '应展示认领人');
    assert.ok(html.includes('愿你抬头就能看见'), '应展示献词');
    const starId = String(reg.json.star_id).replace('HIP-', '');
    assert.ok(html.includes('HIP-' + starId), '应展示真实恒星标识');
    assert.ok(html.includes('/s/' + reg.json.slug + '/'), '应链接到该认领的永久页面');
    assert.ok(html.includes('https://simbad.cds.unistra.fr/simbad/sim-id?Ident=HIP+' + starId), '应带 SIMBAD 核实链接');
    assert.ok(!html.includes('织女星'), '不应再出现虚构的织女星');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-17 最新认领为匿名时，落地页只显示「匿名认领人」', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 5 });
  try {
    const reg = runScript('register.mjs', [], {
      sandbox,
      input: JSON.stringify({
        order_id: 'LATEST-ANON', display_name: '李四', dedication: '致自己', anonymous: true, status: 'paid',
      }),
    });
    assert.equal(reg.status, 0, reg.stderr);
    const built = runScript('build-site.mjs', [], { sandbox, env: NO_CHROME });
    assert.equal(built.status, 0, built.stderr);
    const html = readFileSync(path.join(sandbox.siteOut, 'index.html'), 'utf8');
    assert.ok(html.includes(copy('star.anonymousOwner')), '匿名认领应显示「' + copy('star.anonymousOwner') + '」');
    assert.ok(!html.includes('李四'), '匿名认领不得泄漏姓名到落地页');
    assert.ok(html.includes('致自己'), '献词是公开内容，匿名时仍应展示');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-LP-18 没有任何认领时回退到内置示例并明确标注「示例数据」', () => {
  const sandbox = createSandbox({ availableStars: 5, poolSize: 5 });
  try {
    const built = runScript('build-site.mjs', [], { sandbox, env: NO_CHROME });
    assert.equal(built.status, 0, built.stderr);
    const html = readFileSync(path.join(sandbox.siteOut, 'index.html'), 'utf8');
    assert.ok(html.includes('你会拿到什么'), '无认领时应回退到示例标题');
    assert.ok(html.includes('（示例数据）'), '回退时必须标明是示例数据');
    assert.ok(html.includes('织女星'), '回退示例仍用织女星');
    assert.ok(!html.includes('最近一次认领'), '无认领时不应谎称有最新认领');
  } finally {
    sandbox.cleanup();
  }
});
