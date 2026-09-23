# Star.org 已发布承诺 vs 实现状态

用途：把**用户实际看得到的每一句承诺**列出来，标注出处（文案键名或模板文件）与实现状态，避免出现「文案已经说出去了、功能却做不到」这类信用缺口。

维护规则：

1. 新增或修改任何**面向用户的文案**时，若其中含有承诺（交付物、时效、退款、隐私、永久性、理念性主张），必须在本表登记；
2. 「状态」一列必须给出**实现证据**（脚本、模板、测试编号或产物文件），不接受只写"已实现"；
3. 承诺被移除或改写时，在本表保留一行并标注日期与原因——不要直接删行，避免同类缺口重复出现；
4. 本表只记录**对外承诺**，不记录内部待办（内部待办见 `Star.org-IDEA文档.md`）。

核查时间：2026-09-21。核查方式：逐键提取 `site/i18n/{zh,en}.json` 的面向用户文案 + 阅读 `templates/`，再对照 `scripts/`、`tests/` 与产物目录。

---

## 一、已兑现

### 1.1 交付物

| 承诺 | 出处 | 状态与证据 |
|---|---|---|
| 含 PDF 证书 | `product.priceNote`、`landing.how.step2Body`、`star.downloadCert` | ✅ `templates/certificate.html` + 无头 Chrome 渲染；`certificates/` 现有 14 份 |
| 永久链接页面 | `landing.lede`、`landing.how.step2Body` | ✅ `site/permanent.html` → `/s/{slug}/` |
| 社交平台分享显示卡片 | `landing.how.step3Body`、`landing.faq.a3`（"已针对 X 的分享卡片优化"） | ✅ `og/` 现有 14 张 1200×630 PNG；`permanent.html` 含 `og:*` 与 `summary_large_image` |
| 证书载真实天文数据（赤经/赤纬/星等/光谱/距离） | `landing.lede`、`landing.metaDescription`、`cert.*` | ✅ 数据来自公开星表（HYG 候选库 + SIMBAD 外链） |

### 1.2 唯一性与可核实（核心信任承诺）

| 承诺 | 出处 | 状态与证据 |
|---|---|---|
| 一颗恒星只被分配一次 | `landing.trust.availableNote`、`landing.faq.a2` | ✅ `scripts/allocate.mjs` 原子锁 + 拿锁后重读候选库；含并发防超卖测试（3 轮） |
| 分配后即时写入公开认领表 | `landing.trust.claimedNote`、`landing.faq.a2` | ✅ `scripts/register.mjs` 写 `data/registrations/`；`build-site.mjs` 生成 `/registry/` |
| 无需登录、无需付费即可查阅 | `landing.trust.noLoginNote`、`registry.lede`、`email.verifyBody` | ✅ 由 `check-compliance.mjs` 的 REGISTRY_NO_LOGIN 规则强制 |
| 三步自行核实（SIMBAD → 认领表 → 原始文件） | `star.verify1-4`、`cert.verify1-4`、`registry.how1-3` | ✅ 三处入口均已实现（含 SIMBAD 外链与原始 JSON 直达） |
| 原始记录是纯文本文件、在公开仓库、可长期留存 | `registry.how3Body`、`registry.techBody` | ✅ `data/registrations/{slug}.json` + 公开索引 |
| 自动查重结果公示 | `registry.dupOk` / `registry.dupWarn` | ✅ `scripts/verify-registry.mjs` 检重并在页面公示 |

### 1.3 隐私

| 承诺 | 出处 | 状态与证据 |
|---|---|---|
| 公开表只有恒星编号/称呼/献词/日期 | `landing.faq.a6`、`register.privacyNote` | ✅ `verify-registry.mjs` 含隐私字段与正则扫描 |
| 匿名后连称呼也不出现在公开页面与认领表 | `landing.faq.a6`、`register.anonymousLabel` | ✅ `anonymous` 字段；证书仍印姓名（与 `register.anonymousLabel` 的说明一致，由 `policy.anonymousNameInCertificate` 控制） |

### 1.4 退款、免责与库存

| 承诺 | 出处 | 状态与证据 |
|---|---|---|
| 非质量问题不支持退款 | `landing.faq.a4` | ✅ 由 `check-compliance.mjs` 的退款政策规则强制 |
| 不构成 IAU 官方命名、不代表任何天体命名权 | `landing.faq.a1`、`landing.footerDisclaimer`、`star.disclaimer`、`cert.disclaimer` 等 | ✅ 按语言分别校验（IAU_DISCLAIMER_EN/ZH + RENDERED） |
| 候选库总数与剩余实时展示 | `landing.trust.availableLabel`、`registry.stat*`、`thanks.poolNote` | ✅ 800 颗候选库，构建期读取 |
| 售罄后入口自动恢复 | `state.soldOutNote` | ✅ 构建期按 `available` 判断入口状态 |
| 随机分配、机会相同、无法预知 | `landing.faq.a7`、`landing.how.step2Body` | ✅ 均匀随机（见 `DECISIONS.md` D8） |
| 仅 Lemon Squeezy 法币结算 | `landing.buy.lede` | ✅ 由 `check-compliance.mjs` 的收款渠道规则强制 |
| 可回复邮件修改姓名或献词 | `email.footer` / `email.footerPlain` | ✅ 有对应测试（改献词后更新记录、重渲染证书与 OG、重发邮件） |

---

## 二、未兑现（全部集中在理念层）

| 承诺 | 出处 | 状态 | 缺口说明 |
|---|---|---|---|
| **「认领并观测你认领的星星」** | `landing.mission` | ❌ **未兑现** | `scripts/lib/astro.mjs` 只有格式化与 SVG 绘图函数，**没有可见性/升落计算**；永久页只给坐标与天球位置图。对应 `IDEA-016`（「今晚头顶」提醒，未实现） |
| **「长久地关注它」「持续关注」** | `landing.lede`、`landing.philosophy.i4Body`、`landing.faq.a10` | ❌ **未兑现** | 没有任何关注/提醒机制。`IDEA-002`（提醒层）与 `IDEA-016` 均未实现 |
| **「谁关注…拥有某种信息产权」，且「让这份记录公开、透明、可自行核实」** | `landing.philosophy.i4Body`、`philosophy.s4Body`、`philosophy.s4Note` | 🟡 **部分** | "公开可核实"已兑现；但"信息产权"**没有任何可操作形态**（无凭证、无编号体系）。`IDEA-027`（星表编号 `STAR-ORG-{slug}`）未实现 |
| **白皮书与站点口径一致** | 隐含承诺（`landing.ctaWhitepaper`、`philosophy.whitepaper*` 提供白皮书下载） | ✅ **本轮已修复** | 修复前：白皮书 v1.2+ 称「尚未达到一级、团队估计约 0.7」，而站点 7 处仍称「地球当前处于信息文明一级」，**同一站点内自相矛盾** |

---

## 三、本轮（2026-09-21）修复的两处

### 3.1 「永久链接不会被删除」的过度承诺

原文案把「永久」当成绝对承诺，但 `landing.trust.lede` 自己写着「（同类服务）……**也不知道这些记录还能存在多久**。我们把整份认领表公开出来**解决第一个问题**」——一处坦承只解决两个问题中的一个，另一处却承诺不会被删除。技术上也没有任何保障（域名到期、仓库删除、平台政策变化都会破坏它）。

**改为有边界的说法**：「只要本服务在运营，链接就长期有效，也不依赖你保留邮件；记录以纯文本存放在公开仓库，你也可以自己留存一份。」

涉及两处（核查时**只有两处**含此绝对表述，`thanks.step3Body` 只承诺"不依赖你保留邮件"，不含删除承诺）：

- `star.footerNote`
- `landing.faq.a3`

**残留风险（本轮按决定保留术语）**：「**永久链接**」这个**术语本身**仍隐含永久性。若要彻底，可改称「长期链接」或「稳定链接」，并在页面上说明"只要服务在运营即长期有效"。本轮只去掉绝对承诺，不改术语。

### 3.2 等级口径与白皮书统一

站点改为白皮书 v1.2+ 的定义（一级＝观测侧的参与完成，是**门槛目标**；地球尚未达到，团队估计约 0.7）。共 7 处：

| 键 | 改后要点 |
|---|---|
| `landing.heroEyebrow` | 「信息文明 0.7 级 · 目标是一级」/ "Information civilization, 0.7 — level one is the goal" |
| `landing.lede` | 「地球尚未达到信息文明一级（团队估计约 0.7 级）」 |
| `landing.metaDescription` | 同上口径 |
| `landing.philosophy.i1Body` | 同上口径 |
| `landing.faq.a8` | 「尚未达到一级，团队估计约 0.7」 |
| `philosophy.metaDescription` | 「（地球尚未达到一级，团队估计约 0.7）」 |
| `philosophy.s1Note` | 「尚未达到『信息文明一级』（团队估计约 0.7 级）」 |

### 3.3 一处核查修正

本表初稿把删除承诺记为**三处**（误含 `thanks.step3Body`）。逐字核对后确认只有**两处**。已在 3.1 更正并保留此处记录，避免以后重复误判。

---

## 四、依赖人工、没有自动化保障的承诺（🟡）

| 承诺 | 出处 | 风险 |
|---|---|---|
| 证书 **1–3 分钟**内生成、最长不超过 5 分钟 | `thanks.lede`、`thanks.footNote`、`landing.faq.a5`、`register.next2Body` | 链路为 Lemon Squeezy → Zapier/Make → GitHub Actions；**端到端耗时无监控**，只有失败告警 |
| 超过 5 分钟 / 24 小时未收到 → 人工补发 | `thanks.supportNote`、`landing.faq.a5`、`notfound.note` | 能力存在（`manual-order.mjs` 补单、`reconcile.mjs` 对账），但**依赖运营者在线响应**，无自动检测 |
| **「我们会主动联系你」** | `landing.faq.a4` | 这是最强的一句（主动承诺），但「付款成功却没收到证书」「证书内容错误」**除了 CI 失败告警外没有自动发现机制**——承诺的"主动"实际依赖巧合。建议补一个定时对账 + 告警 |
| 我方失误 → 无条件退款或重新处理 | `landing.faq.a2`、`landing.faq.a4` | 同上：能力存在（`register.mjs --force` 重发、Lemon Squeezy 退款），但**触发为人工作业** |

---

## 五、优先处理建议

| 优先 | 事项 | 成本 |
|---|---|---|
| 1 | 兑现 `landing.mission` 的「观测」（`IDEA-016`）：引入 `astronomy-engine` 之类的纯 JS 升落计算，在永久页显示"今晚能否看到、何时升落、在哪个方向" | $0，3–7 天 |
| 2 | 给「我们会主动联系你」补一个自动检测：定时跑 `reconcile.mjs` + 失败告警 | 1–2 天 |
| 3 | 把「持续关注」落到可兑现的形态（提醒/回访），否则应软化措辞 | 视方案 |
| 4 | 给「信息产权」一个可操作形态（`IDEA-027` 星表编号），或明确它目前只是理念表述 | 纯展示层，小 |
