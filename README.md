# Star.org — 可公开验证的星星登记服务（MVP）

登记一颗真实存在的恒星，获得包含真实天文数据的 PDF 证书与永久链接。
所有登记记录同步到公开登记表，**任何人都可以自行核实一颗恒星是否已被登记过**。

本仓库是《Star.org MVP 技术需求说明书 v0.2》全 GitHub 托管方案的可运行实现：
没有自建服务器、没有独立数据库、没有 Vercel/Supabase，全部功能压缩进 GitHub 生态
（GitHub Pages + GitHub Actions），外部只依赖 Lemon Squeezy（收款）与邮件服务（有免费额度）。

---

## 1. 交付了什么

| 模块 | 实现 | 对应文档 |
|---|---|---|
| 恒星候选库 | `data/stars_pool.json`，800 颗视星等 ≤ 6.5 的真实恒星（HYG/Hipparcos 公开数据） | 技术 4.1 |
| 分配与查重 | `scripts/allocate.mjs`：mkdir 原子锁 + 重读候选库 + 确定性 slug 幂等 | 技术 4.2 / TC-ALLOC-01~05 |
| 落地页 | `site/index.html`：价值主张 / 信任背书 / 样例 / 购买入口 / FAQ | PRD 4.1 / TC-LP-01~05 |
| PDF 证书 | `templates/certificate.html` + 无头浏览器渲染 → `certificates/{slug}.pdf` | 技术 4.5 / TC-PDF-01~05 |
| 永久链接页 | 每条登记生成 `/s/{slug}/`，含 OG 卡片与分享按钮 | 技术 4.6 / TC-PAGE-01~05 |
| OG 分享图 | `scripts/lib/artifacts.mjs` 静态渲染 1200×630 PNG → `og/{slug}.png` | 技术 4.6 |
| 公开登记表 | `/registry/` + `data/registrations/*.json` + `data/registry-index.json` | 技术 4.7 / TC-REG-01~05 |
| 邮件通知 | `scripts/lib/email.mjs`（Resend / Postmark；未配置时写 `outbox/`） | 技术 4.8 / TC-MAIL-01~04 |
| 异常处理 | 售罄告警、失败告警、人工补单、订单对账 | PRD 6 / TC-ERR-01~04 |
| 合规控制 | `scripts/check-compliance.mjs` 禁用词与收款渠道扫描，CI 强制通过 | 技术 5 / TC-COMP-01~04 |

## 2. 架构（与文档第 3 章一致）

```
落地页 (GitHub Pages)
   │ 点击购买
   ▼
Lemon Squeezy 托管结算（Merchant of Record，仅法币）
   │ Webhook（支付成功）
   ▼
Zapier / Make（把 Webhook 转成 GitHub API 调用）
   │ repository_dispatch
   ▼
GitHub Actions（concurrency 分组串行执行）
   ├─ 分配恒星（锁 + 重读候选库，防超卖）
   ├─ 渲染 PDF 证书 + OG 图
   ├─ 写入 data/registrations/{slug}.json（commit）
   └─ 发送邮件（证书链接 + 永久链接）
   │ commit
   ▼
GitHub Pages 自动重建 → /s/{slug}/ 上线
```

## 3. 目录结构

```
data/stars_pool.json          恒星候选库（含 status: available/assigned）
data/registrations/*.json     公开登记记录（不含任何隐私字段）
data/registry-index.json      公开登记表索引（供页面与外部程序读取）
certificates/{slug}.pdf       证书
og/{slug}.png                 OG 分享图
site/                         站点源文件（落地页 / 登记表 / 永久页 / 404 / 样式）
templates/                    证书、OG 图、邮件模板
scripts/                      构建与业务脚本（见下）
tests/                        自动化测试（对齐《测试用例说明书》编号）
.github/workflows/            登记、发布、自检三条流水线
docs/                         产品/技术/测试文档 + 部署与运维手册
```

## 4. 常用命令

```bash
npm run build:pool      # 从 HYG 星表重建候选库（--input <csv> --limit 800 --max-mag 6.5）
npm run allocate        # 只做分配（stdin 传订单 JSON）
npm run register        # 全链路：分配 → 证书 → OG 图 → 记录 → 邮件
npm run build:site      # 生成 _site/ 静态站点
npm run serve           # 本地预览 _site/
npm run verify          # 登记表自检（查重 / 隐私字段 / 产物哈希）
npm run check:compliance# 合规文案扫描（禁用词 / 收款渠道 / 必备声明）
npm test                # 全部测试用例（含 TC-ALLOC-03 防超卖并发测试 3 轮）
npm run test:concurrency# 只跑并发防超卖测试
node scripts/manual-order.mjs --order-id 123456 --name "For Anna" --email a@b.com   # 人工补单
node scripts/reconcile.mjs                                                          # 对账孤立订单
```

本地不配置任何密钥也能跑通全链路：邮件会写入 `outbox/`，站点可用 `npm run serve` 预览。

## 5. 部署

见 `docs/DEPLOY.md`（Lemon Squeezy → Zapier → GitHub Secrets → 域名，逐步操作）。
日常运维、补单、售罄处理、隐私执行见 `docs/OPERATIONS.md`。

## 6. 与文档的两处实现说明

1. **静态生成器**：技术说明书提到 Jekyll。本实现用 `scripts/build-site.mjs`（零依赖 Node 脚本）
   读取 `data/` 生成同一套静态产物，部署方式仍是 GitHub Pages（Actions 构建 + 部署），
   原因是避免 Ruby 依赖在 CI 与本机带来的额外不确定性，产物与 Jekyll 方案完全等价。
2. **防超卖**：文档用 Actions `concurrency` 分组。本实现保留 concurrency，并额外加了一层
   文件锁与"拿到锁后重读候选库"，使本地、脚本调用、并发进程等所有路径都不会超卖
   （测试用例说明书要求"至少 3 轮独立测试"，已在 `tests/alloc-concurrency.test.mjs` 实现）。

## 7. 合规红线（自动化保障）

- 禁用措辞（投资 / 升值 / 资产 / 交易 / 所有权凭证 / 数字货币等）由 `check-compliance.mjs` 扫描，
  命中即 CI 失败；
- 落地页必须包含"非 IAU 官方命名"澄清与退款政策，由同一脚本校验；
- 收款渠道只允许 Lemon Squeezy（法币），扫描到任何数字货币渠道域名即失败；
- 公开登记记录中不得出现邮箱、订单号等隐私字段，由 `verify-registry.mjs` 校验（含正则扫描）。
