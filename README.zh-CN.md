# Star.org — 可公开验证的恒星认领服务（MVP）

[English](README.md) · **中文**

认领一颗真实存在的恒星，获得包含真实天文数据的 PDF 证书与永久链接。
所有认领记录同步到公开认领表，**任何人都可以自行核实一颗恒星是否已被认领过**。

本仓库是《Star.org MVP 技术需求说明书 v0.4》全 GitHub 托管方案的可运行实现：
没有自建服务器、没有独立数据库、没有 Vercel/Supabase，全部功能压缩进 GitHub 生态
（GitHub Pages + GitHub Actions），外部只依赖 Lemon Squeezy（收款）与邮件服务（有免费额度）。

站点本身是双语的：**默认英文**，页面上可切换到中文，切换不改变 URL（永久链接因此保持稳定）；
营销页同时内嵌两种语言，星页另有中文默认入口 `/zh/s/{slug}/`。

---

## 1. 交付了什么

| 模块 | 实现 | 对应文档 |
|---|---|---|
| 恒星候选库 | `data/stars_pool.json`，800 颗来自 HYG 星表的真实恒星（视星等 −1.44 ~ 4.4） | 技术 4.1 |
| 分配与查重 | `scripts/allocate.mjs`：均匀随机抽取 + mkdir 原子锁 + 拿锁后重读候选库 + 确定性 slug 幂等 | 技术 4.2 / TC-ALLOC-01~08 |
| 落地页 | `site/index.html`：价值主张 / 核心理念区块 / 信任背书 / 真实样例 / 购买入口 / FAQ | PRD 4.1 / TC-LP-01~05 |
| PDF 证书 | `templates/certificate.html` + 无头 Chrome 渲染 → `certificates/{slug}.pdf` | 技术 4.5 / TC-PDF-01~05 |
| 永久链接页 | 每条认领生成 `/s/{slug}/`，含 OG 卡片与分享按钮 | 技术 4.6 / TC-PAGE-01~05 |
| OG 分享图 | `scripts/lib/artifacts.mjs` 渲染 1200×630 PNG → `og/{slug}.png` | 技术 4.6 |
| 公开认领表 | `/registry/` + `data/registrations/*.json` + `data/registry-index.json` | 技术 4.7 / TC-REG-01~05 |
| 邮件通知 | `scripts/lib/email.mjs`（Resend / Postmark；未配置时写入 `outbox/`） | 技术 4.8 / TC-MAIL-01~04 |
| 双语文案 | `site/i18n/{en,zh}.json`——全部界面文案，两侧键集合强制一致（见 `DECISIONS.md` D9） | — |
| 内置中文字体 | `fonts/`——约 12.5MB 的裁剪子集，渲染不再依赖运行环境（见 `DECISIONS.md` D10） | — |
| 异常处理 | 售罄告警、失败告警、人工补单、订单对账 | PRD 6 / TC-ERR-01~04 |
| 合规控制 | `scripts/check-compliance.mjs` 扫描禁用措辞与收款渠道，CI 强制通过 | 技术 5 / TC-COMP-01~04 |
| 核心理念页 | `/philosophy/`：五条理念的完整网页版 + 白皮书（PDF）下载，白皮书入口同时在落地页 hero 与导航 | TC-PHIL-01~05 |
| 核心理念白皮书 | `docs/whitepaper/*.tex`（TeX 源码）→ `site/assets/whitepaper/*.pdf`（中 / 英两版，随仓库提交） | TC-PHIL-03 |

## 2. 架构

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
   ├─ 分配恒星（原子锁 + 重读候选库，防超卖）
   ├─ 渲染 PDF 证书 + OG 图
   ├─ 写入 data/registrations/{slug}.json（commit）
   └─ 发送邮件（证书链接 + 永久链接）
   │ commit
   ▼
GitHub Pages 自动重建 → /s/{slug}/ 上线
```

## 3. 目录结构

```
data/stars_pool.json          恒星候选库（含 status: available / assigned）
data/registrations/*.json     公开认领记录（不含任何隐私字段）
data/registry-index.json      公开认领表索引（供页面与外部程序读取）
certificates/{slug}.pdf       证书
og/{slug}.png                 OG 分享图
site/                         站点源文件（落地页 / 核心理念页 / 认领表 / 永久页 / 404 / 资源）
site/i18n/{en,zh}.json        全部界面文案（唯一来源）
site/assets/whitepaper/       核心理念白皮书 PDF（中 / 英，构建产物，随仓库提交）
docs/whitepaper/              白皮书 TeX 源码 + build.sh（编译产物写到 site/assets/whitepaper/）
fonts/                        内置中文字体子集 + 清单 + OFL 许可证
templates/                    证书、OG 图、邮件模板
scripts/                      构建与业务脚本（见下）
tests/                        自动化测试（对齐《测试用例说明书》编号）
.github/workflows/            三条流水线：认领、发布、自检
.github/actions/              共用的复合 action
docs/                         产品 / 技术 / 测试文档 + 部署与运维手册
```

## 4. 常用命令

```bash
npm run build:pool       # 从 HYG 星表重建候选库（--input <csv> --limit 800 --max-mag 6.5）
npm run build:whitepaper # 用 xelatex 编译核心理念白皮书（中 / 英）→ site/assets/whitepaper/
npm run allocate         # 只做分配（stdin 传订单 JSON）
npm run register         # 全链路：分配 → 证书 → OG 图 → 记录 → 邮件
npm run build:site       # 生成 _site/ 静态站点
npm run serve            # 本地预览 _site/
npm run demo             # 一键本地演示（见第 5 节）
npm run verify           # 认领表自检（查重 / 隐私字段 / 产物哈希）
npm run check            # CI 强制的全部检查：自检 + 合规 + 密钥 + 上线就绪
npm test                 # 全部测试用例（95 个，含防超卖并发测试 3 轮）
npm run test:concurrency # 只跑并发防超卖测试
node scripts/fetch-fonts.mjs --check   # 校验内置字体与清单一致
node scripts/rerender-artifacts.mjs --dry-run   # 按站点当前默认语言重渲染既有证书与 OG 图
node scripts/manual-order.mjs --order-id 123456 --name "For Anna" --email a@b.com   # 人工补单
node scripts/reconcile.mjs                                                          # 对账孤立订单
```

本地不配置任何密钥也能跑通全链路：邮件会写入 `outbox/`，站点可用 `npm run serve` 预览。

## 5. 本地启动

### 5.1 一键演示（推荐先跑这个）

```bash
npm run demo
```

它会做三件事：在临时沙盒里跑一笔**真实的完整认领**（分配恒星 → 渲染证书 PDF 与 OG 图 →
写入认领记录 → 邮件落盘），用这份数据构建静态站点，然后启动本地预览。

浏览器打开 http://127.0.0.1:4321/ 就能看到落地页、公开认领表，以及这一笔认领的永久链接页、
证书 PDF 和分享图。邮件不会真发（`EMAIL_PROVIDER=outbox`），写入沙盒的 `outbox/` 目录。

演示数据全部写在系统临时目录（形如 `/tmp/starorg-demo`），**不会写入仓库的
`data/registrations/`、`certificates/`、`og/`**，可以反复随便跑。

可选参数（注意 `--` 后面的参数会原样传给脚本）：

```bash
npm run demo -- --name "For 小满" --dedication "生日快乐"   # 换称呼与献词
npm run demo -- --anonymous                                # 匿名认领
npm run demo -- --keep                                     # 保留上次演示数据，再追加一笔
npm run demo -- --port 5000                                # 换端口
npm run demo -- --no-serve                                 # 只生成，不启动预览
```

### 5.2 只看站点（不生成认领数据）

```bash
npm run build:site      # 生成 _site/
npm run serve           # http://127.0.0.1:4321/
```

此时认领表是空的、购买入口显示为"准备中"（`site.config.json` 里还没填结算链接），
适合改文案 / 样式时快速预览。改完 `site/` 下的文件重新执行 `npm run build:site` 再刷新即可。

### 5.3 写进仓库（模拟真实订单落库）

```bash
STARORG_SLUG_SECRET=dev-secret EMAIL_PROVIDER=outbox \
  node scripts/manual-order.mjs --order-id LOCAL-1 --name "For Anna" --email a@b.com
npm run build:site && npm run serve
```

这条会真的把记录写进 `data/registrations/`、证书写进 `certificates/`，用来验证"仓库即数据库"
的完整形态。验证完用 `git status` 找出这些演示文件删掉，别提交上去。

### 5.4 跑测试与自检

```bash
npm test                # 95 个用例，约 1-2 分钟（含防超卖并发测试 3 轮）
npm run check           # 认领表自检 + 合规扫描 + 密钥扫描 + 上线就绪检查
```

### 5.5 环境要求

- **Node ≥ 20**（runner 镜像自带 Node 22），仓库**零 npm 依赖**，不需要 `npm install`；
- 本机需安装 **Google Chrome**（渲染证书 PDF 与 OG 图用）。装在非默认位置时用
  `CHROME_PATH=/path/to/chrome` 指定，缺失时演示脚本会直接提示。
  中文字体已随仓库内置（`fonts/`），渲染中文不需要额外安装任何字体；
- 可选：复制 `.env.example` 为 `.env` 填写结算链接与邮件密钥。脚本读取的是进程环境变量，
  可用 `export $(grep -v '^#' .env | xargs)` 载入。

## 6. 部署

见 `docs/DEPLOY.md`（Lemon Squeezy → Zapier → GitHub Secrets → 域名，逐步操作）。
日常运维、补单、售罄处理、隐私执行见 `docs/OPERATIONS.md`。

进度追踪：用浏览器打开 `docs/star-org-checklist.html`。默认勾选状态即代码仓库的真实实现进度，
每条都标注了对应文件或测试编号；页面顶部的"下一步"面板会自动汇总仍需人工完成的环节
（外部账号、真实收款、真实域名相关）。

### 5.6 核心理念与白皮书

站点的思想源头写在两份同源文档里，并已落到网站与 PDF：

- `docs/Star.org-核心理念.md`（中文）/ `docs/Star.org-Core-Philosophy.md`（英文）——五条核心理念的完整论述；
- `docs/whitepaper/*.tex` → `site/assets/whitepaper/*.pdf`——同一份内容的 A4 排版白皮书，中 / 英两版。

网站上共三处入口（白皮书刻意放在"最关键的位置"）：

1. **落地页 hero 动作区**：核心理念入口按钮；
2. **导航栏**：`核心理念` / `Philosophy`；
3. **`/philosophy/` 理念页**：白皮书下载卡片排在五条理念**之前**（正文第一屏）。

白皮书用 `xelatex` 编译，字体是仓库内置的 Noto Sans/Serif SC 子集（`fonts/`），
因此本机不需要安装任何中文字体（与证书渲染同一套做法，见 `DECISIONS.md` D10）。
CI 不保证装 TeX，所以 **PDF 作为交付物随仓库提交**，`npm run build:site` 只是把它复制进 `_site/`：

```bash
npm run build:whitepaper   # 需要本机有 xelatex；改完 .tex 后重新生成 PDF
```

白皮书 PDF 里刻意使用了"不做金融化"这类表述——它属于 `docs/` 与排版产物，
而合规禁用词扫描的对象是站点公开文案（`site/**` 里的 html/txt/json/css/js/xml/svg）；
`docs/` 与 `.tex` 本就不在扫描范围内（这些文件必须能讨论那些词本身）。

## 7. 几个容易误读的设计决定

关键取舍都记在 `docs/DECISIONS.md`，其中最相关的三条：

- **D8——分配是均匀随机**，不再按亮度优先。每位认领人机会相同，也无法预测自己会拿到哪一颗。
  候选库文件仍按亮度排序，但那只用于浏览，不再决定分配结果。
- **D9——双语站点采用客户端切换。** 界面文案只存在于 `site/i18n/{en,zh}.json`，
  模板里只剩 `{{t.key}}`；两份目录的键集合不一致会直接让构建失败，
  测试也改为按目录键取值而不是写死字符串，因此以后改默认语言不必再动测试。
- **D10——中文字体随仓库内置**，不再由 CI 安装，证书在任何环境渲染结果一致。
  字体字节属于交付物的一部分，CI 会校验其 SHA-256。

## 8. 合规红线（自动化保障）

- 禁用措辞（投资 / 升值 / 资产 / 交易 / 所有权凭证 / 数字货币等）由 `check-compliance.mjs` 扫描，
  命中即 CI 失败；
- 落地页必须包含"非 IAU 官方命名"澄清与退款政策，由同一脚本校验——且**按语言分别校验**，
  因为两种语言同处一个 HTML 文件，只扫一遍会让一种语言的文案满足另一种语言的规则；
- 收款渠道只允许 Lemon Squeezy（法币），扫描到任何数字货币渠道域名即失败；
- 公开认领记录中不得出现邮箱、订单号等隐私字段，由 `verify-registry.mjs` 校验（含正则扫描）。