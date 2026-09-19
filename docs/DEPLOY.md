# 部署手册（全 GitHub 托管，零服务器）

按顺序执行，全程约 2 小时。对应《开发进度 CheckList》Day 3-5 与 Day 13-14。

---

## 0. 前置准备

- 一个公开的 GitHub 仓库（Pages 对公开仓库免费且不限量）
- Lemon Squeezy 账号（Merchant of Record，无需自建公司主体）
- Zapier / Make / Pipedream 任一账号（免费额度即可）
- Resend 或 Postmark 账号（发证书邮件，有免费额度）
- 域名 `star.org`（或你自己的域名）的 DNS 管理权限

## 1. 建立仓库并打开 Pages

```bash
git init && git add -A && git commit -m "Star.org MVP"
git remote add origin git@github.com:<你的账号>/star.org.git
git push -u origin main
```

仓库 **Settings → Pages → Build and deployment → Source 选择 "GitHub Actions"**。
推送后 `.github/workflows/deploy-pages.yml` 会自动构建并发布站点。

> **权限说明**：仓库默认的 Workflow permissions 保持 **Read** 即可，不需要改成
> "Read and write permissions"。`register.yml` 在自己的 `permissions:` 里声明了
> `contents: write`，只会给认领流水线放开写权限，其余流水线仍是只读——这样默认值
> 最安全，出问题时影响面也最小。

### 三个 workflow 的分工

| 文件 | 触发 | 职责 |
| --- | --- | --- |
| `deploy-pages.yml` | push（`site/`、`data/`、`templates/`、`scripts/`、站点配置有变更）+ 手动 | 构建 `_site` 并发布到 Pages |
| `register.yml` | `repository_dispatch(star_registration)` + 手动补单 | 分配恒星、生成证书与 OG 图、发邮件、提交认领记录 |
| `verify.yml` | push / PR / 每天 03:00 / 手动 | 全部测试用例 + 认领表、合规、密钥三项扫描 |

证书 PDF 与 OG 分享图靠无头 Chrome 渲染，三个 workflow 统一引用
`.github/actions/setup-render-env`（安装 Noto CJK 字体 + Google Chrome 并校验）。

> 这段安装逻辑原先被复制了三份，其中 `register.yml` 那份装的是 Ubuntu 24.04 上
> 不可用的 `chromium-browser` snap 占位包，会让第一笔真实订单卡在证书渲染这一步。
> 现在收敛成一份 composite action，以后只需改一处。

## 2. 配置密钥与变量（Settings → Secrets and variables → Actions）

**Secrets（密钥，不落代码库）**

| 名称 | 用途 |
|---|---|
| `STARORG_SLUG_SECRET` | 由订单号派生认领编号（HMAC），同时保证重复 Webhook 幂等。随机 32 位以上字符串 |
| `RESEND_API_KEY` | 发证书邮件（或改用 `POSTMARK_TOKEN`） |
| `OPERATOR_EMAIL` | 异常告警收件邮箱（售罄、流程失败） |
| `LEMON_SQUEEZY_API_KEY` | 可选，仅 `scripts/reconcile.mjs` 对账用 |

**Variables（普通变量）**

| 名称 | 示例 |
|---|---|
| `SITE_BASE_URL` | `https://star.org` |
| `LEMON_SQUEEZY_CHECKOUT_URL` | `https://xxx.lemonsqueezy.com/checkout/buy/xxxxxxxx` |

> `LEMON_SQUEEZY_CHECKOUT_URL` 为空时，落地页购买入口自动显示为"暂时关闭"，
> 候选库售罄时也会自动下线入口（对应 PRD 6 的售罄场景）。

## 3. Lemon Squeezy 配置

1. **Products → New product**：名称 `Star Registration`，价格 US$29（或 ¥199），
   类型选一次性付款（One-time）。
2. **结算页字段（Checkout → Custom fields）**：
   - `认领人姓名/称呼`（必填，说明文案：会展示在证书和永久页面上，可填"For Anna"这类称呼）
   - `献词/留言`（选填，说明文案：100 字以内，将印在证书上）
   - `匿名展示`（选填，复选框，说明文案：勾选后公开页面与认领表不显示你的称呼）
   - 邮箱由 Lemon Squeezy 自身收集
3. **Checkout 设置**：开启 Test Mode 先联调，上线前再切换到正式模式。
4. **结算完成页文案（Confirmation modal / Redirect）**：
   > 感谢认领。证书正在生成，将在几分钟内发送到你的邮箱；
   > 稍后也可以用这个邮箱找回记录。若 24 小时内未收到，请来信 support@star.org。
5. **Settings → Webhooks → Add webhook**：
   - URL：Zapier/Make 生成的 Catch Hook 地址
   - Events：`order_created`
   - Signing secret：保存好，Zapier 侧可用于校验（可选但推荐）

### 落地页购买入口的三种状态

落地页 CTA 不是简单的"开/关"，构建时按下面三种情况分别出文案，避免把
"还没接支付"说成"候选库空了"：

| 状态 | 触发条件 | 落地页表现 |
| --- | --- | --- |
| 已开启 | 结算链接已配置且候选库有货 | 按钮「认领一颗星 · US$29」直接跳结算页 |
| 购买通道接入中 | 候选库有货，但结算链接为空 | 按钮置灰「购买通道接入中」+ 说明文案 |
| 候选库已售罄 | 候选库可用数为 0 | 按钮置灰「候选库已售罄」+ 补货说明（补货后自动恢复） |

对应的文案在 `site.config.json` 的 `policy.soldOutMessage` 与
`policy.checkoutPendingMessage`；结算链接来自仓库变量
`LEMON_SQUEEZY_CHECKOUT_URL`（优先）或 `product.checkoutUrl`。

配置完成后执行：

```bash
npm run check:launch        # 一次看清还缺哪些配置
npm run build:site          # 本地确认购买入口已变为「已开启」
```

### 付款完成后怎么让客户回到 Star.org

付款成功后客户会依次接触 Lemon Squeezy 的几个界面。**这三处都必须配**，否则客户
在等待证书的几分钟里没有任何路径回到站点，也无法自查进度（这是本项目的功能需求 4.9）。

统一的目标地址（`/thanks/` 等待页，本仓库 `site/thanks.html`）：

```
https://www.star.org/thanks/?order=[order_identifier]
```

| # | 客户在哪看到 | 配置位置（Lemon Squeezy 后台） | 要填什么 |
| --- | --- | --- | --- |
| 1 | 付款完成、还在结算页时的**确认弹窗** | **Products → 你的商品 → Settings → Confirmation modal** | Button text `回到 Star.org 查看进度`；Button link 填上面的地址 |
| 2 | **收据邮件**里的按钮 | **Products → 你的商品 → Settings → Receipt** | Button content `回到 Star.org 查看进度`；Destination link 填上面的地址 |
| 3 | 客户登录后看到的**订单页**（app.lemonsqueezy.com/my-orders） | **Products → 你的商品 → Links** | 新增一个链接，名称 `查看证书与永久链接`，URL 填上面的地址 |

**第 3 项最容易被漏掉**：My Orders 是 Lemon Squeezy 的全局客户账户页，界面本身不可
自定义；但官方文档说明「如果商品配置了 links，它们会出现在订单页上」——所以要在商品的
**Links** 里加一条，客户从收据邮件点进订单页后才看得到回站入口。每个商品最多 3 条链接。

三处都支持**订单变量**：`[order_identifier]`（订单 UUID，推荐）、`[order_id]`、`[email]`、
`[name]`、`[total]`、`[license_key]`。`/thanks/` 会把订单号显示出来，方便客户找客服时提供
（只在页面上展示，不存储、不外发）。

> 不建议用「购买后自动跳转」替代确认弹窗——客户往往需要留一份收据。
> `/thanks/` 已设 `noindex` 且不进 sitemap（购买后过渡页不应出现在搜索结果里）。
>
> 兜底：即使这三处都没配，客户仍会在 1-3 分钟内收到**我们发的证书邮件**，里面有永久链接；
> 证书生成失败时运维也会收到告警（见第 7 节）。但**不要依赖兜底**，三处都要配。

## 4. Zapier / Make 配置（唯一的"胶水"环节）

### 4.1 Lemon Squeezy 侧

**Settings → Webhooks → Add webhook**：URL 填 Zapier/Make 生成的 Catch Hook 地址，
Events 只勾 `order_created`，Signing secret 保存好（Zapier 侧可用于校验，可选但推荐）。

`order_created` 的官方载荷结构（关键字段）：

```json
{
  "meta": { "event_name": "order_created", "custom_data": { "...": "结算时传入的自定义数据" } },
  "data": {
    "type": "orders",
    "id": "1",
    "attributes": {
      "order_number": 1,
      "user_name": "John Doe",
      "user_email": "johndoe@example.com",
      "status": "paid",
      "test_mode": false,
      "first_order_item": { "product_name": "Star Registration" },
      "urls": { "receipt": "https://app.lemonsqueezy.com/my-orders/...?signature=..." }
    }
  }
}
```

### 4.2 字段映射

| `client_payload` 字段 | 取自 | 说明 |
| --- | --- | --- |
| `order_id` | `data.id` | **幂等键**：同一订单号永远映射到同一认领编号，重复触发不会占第二颗星 |
| `display_name` | **`meta.custom_data.display_name`（下单前表单）** | 优先取客户自填的认领名；超过 40 字截断 |
| `fallback_display_name` | `data.attributes.user_name` | **建议同时映射**：访客绕过落地页、直接打开结算链接时 `custom_data` 为空，此时回退到持卡人姓名，正常付款不会被拒 |
| `email` | `data.attributes.user_email` | 只用于发证书邮件，绝不写入公开仓库 |
| `dedication` | **`meta.custom_data.dedication`（下单前表单）** | 选填；超过 100 字截断 |
| `anonymous` | **`meta.custom_data.anonymous`（下单前表单，勾选为 true）** | 勾选后公开记录与页面不显示称呼 |

> **下单前表单（推荐）**：Lemon Squeezy 结算页不收集"认领人姓名/献词/匿名"这类自定义字段
> （需求一直挂在 LS 的反馈板上未实现）。所以落地页内置了一个认领表单（`site/index.html` 的
> `data-registration-form`），提交后把这三个值通过 `?checkout[custom][display_name]=...` 等参数
> 拼进结算 URL —— 它们就会出现在 webhook 的 `meta.custom_data` 里。URL 构建逻辑在
> `site/assets/js/checkout-url.mjs`（纯函数，已单测）。没用表单时 `display_name` 回退到
> `data.attributes.user_name`（持卡人姓名）。
| `status` | `data.attributes.status` | **务必映射**：只有 `paid` 才认领。`order_created` 在订单创建时就触发，pending / failed / refunded 都会来，流水线以退出码 5 拒绝（不提交、不告警）。状态判断放在代码里而不是 Zapier 的 Filter 步骤，是为了让免费版的两步 Zap 也够用 |

> 结算页自定义字段落在载荷的哪个位置，取决于 Lemon Squeezy 后台的字段配置方式；
> 官方文档明确的是「通过结算链接传入的自定义数据」出现在 `meta.custom_data`。
> **最可靠的做法**是先按 4.3 抓一次真实载荷，看清字段实际路径再填映射，不要照抄猜测的路径。

### 4.3 先抓一次真实载荷（务必做）

1. Trigger 选 `Webhooks by Zapier → Catch Hook`，复制 URL 填到 Lemon Squeezy Webhook。
2. Lemon Squeezy 开 Test Mode，用测试卡下一单。
3. 回 Zapier 点 **Find new records**，看真实载荷，按 4.2 的表把字段映射好。
4. 用 **Test action** 发一次，去 GitHub Actions 页面确认 `认领（支付成功后自动执行）` 跑起来了。

### 4.4 Action：调用 GitHub repository_dispatch

- URL：`https://api.github.com/repos/star-foundation/star.org/dispatches`
- Method `POST`，Payload type `json`
- Headers：
  - `Authorization: Bearer <GitHub PAT>`
  - `Accept: application/vnd.github+json`
- Data：**Zapier 的嵌套键用双下划线，不是方括号**。官方文档明确写着
  「adding the parent object and a double underscore before the object」，
  即 `client_payload__order_id` 会变成 `{"client_payload":{"order_id":...}}`。
  写成 `client_payload[order_id]` 的话 GitHub 收到的是一个扁平对象，直接 422。

  | 左（键，照抄） | 右（值） |
  | --- | --- |
  | `event_type` | 手填 `star_registration` |
  | `client_payload__order_id` | 下拉选 `Data` → `Id` |
  | `client_payload__display_name` | 下拉选 `Meta` → `Custom Data` → `Display Name`；没配下单前表单时退回 `Data` → `Attributes` → `User Name` |
  | `client_payload__email` | 下拉选 `Data` → `Attributes` → `User Email` |
  | `client_payload__dedication` | 下拉选 `Meta` → `Custom Data` → `Dedication` |
  | `client_payload__anonymous` | 下拉选 `Meta` → `Custom Data` → `Anonymous` |
  | `client_payload__status` | 下拉选 `Data` → `Attributes` → `Status` |
  | `client_payload__source` | 手填 `lemon-squeezy` |

  以上会序列化成 GitHub 期望的形状：

  ```json
  {
    "event_type": "star_registration",
    "client_payload": {
      "order_id": "9000002",
      "display_name": "Anna Lee",
      "email": "anna@example.com",
      "dedication": "愿你抬头就能看见",
      "anonymous": false,
      "status": "paid",
      "source": "lemon-squeezy"
    }
  }
  ```

- 需要发送嵌套数组、PATCH/DELETE 或完全自定义的 JSON 时，才改用
  `Custom Request` 动作（它不解析、原样发送）。

- PAT：Fine-grained token，只授权本仓库的 **Contents: Read and write**；
  只存在 Zapier 的密钥管理里，不进前端、不进仓库。

### 4.5 不装 Zapier 也能自测接收端

接收端（`register.yml`）与"谁派发"无关，可以直接用 GitHub CLI 模拟派发，
用来验证链路是否通、以及异常载荷会不会污染数据：

```bash
gh api --method POST repos/star-foundation/star.org/dispatches \
  -f event_type=star_registration \
  -f client_payload[order_id]=TEST-0001 \
  -f client_payload[display_name]=链路自测 \
  -f client_payload[email]=you@example.com
```

派发后到 Actions 页面看 `认领（支付成功后自动执行）`：

| 载荷 | 预期结果 |
| --- | --- |
| 正常 | 产生一次 `认领 <slug>` 提交（证书 PDF + OG 图 + 记录），候选库少一颗 |
| 同一订单号再派发一次 | 仍然是同一个认领编号，**不会占第二颗星** |
| 缺 `display_name` | 以退出码 4 失败，**不产生任何提交** |
| `status` 不是 paid | 退出码 5，标为 warning 并跳过提交（不告警：放弃支付是正常噪音） |
| 候选库售罄 | 退出码 3，标为 warning 并跳过提交（同时发运维告警） |

> 自测产生的记录记得清理：删除 `data/registrations/<slug>.json`、`certificates/<slug>.pdf`、
> `og/<slug>.png`，把 `data/stars_pool.json` 里那颗星改回 `available`，
> 然后重新运行 `npm run build:site`。

## 5. 邮件服务（Resend 为例）

1. 注册 Resend → **Domains → Add domain**，按提示添加 SPF / DKIM / DMARC 记录（降低进垃圾箱概率，TC-MAIL-04）。
2. 验证通过后创建 API Key，填入 GitHub Secret `RESEND_API_KEY`。
3. `site.config.json` 里的 `email.fromAddress` 改成你已验证的发信地址（如 `certificate@star.org`）。

## 6. 域名绑定

1. 仓库 **Settings → Pages → Custom domain** 填 `www.star.org`，保存。
   > ⚠️ **仓库里的 `CNAME` 文件在 Actions 发布模式下不生效**，域名必须绑在这个设置里。
   > 只往仓库加 `CNAME` 文件，线上会一直 404（本项目踩过这个坑）。
2. DNS 记录（GitHub 官方推荐值）：
   - `CNAME www star-foundation.github.io`
   - `A @ 185.199.108.153` / `.109.153` / `.110.153` / `.111.153`（apex 会 301 跳到 www）
3. 等待证书签发（GitHub 自动签发 Let's Encrypt，证书 CN 即你的域名），勾选 **Enforce HTTPS**。
4. 把仓库变量 `SITE_BASE_URL` 改成正式域名（如 `https://www.star.org`）并重新发布：
   证书 PDF、邮件与 sitemap 里印出的永久链接都以它为准，改完记得跑一次
   `npm run check:launch` 确认域名可达。

## 7. 上线前最后检查（全部 P0，一票否决）

```bash
npm test                 # 全部测试用例，含防超卖并发测试 3 轮
npm run verify           # 认领表无重复、无隐私字段
npm run check:compliance # 无禁用措辞、无违规收款渠道、必备声明齐全
npm run check:secrets    # 没有密钥或隐私数据被提交进公开仓库
npm run check:launch     # 上线就绪：结算链接 / SLUG 密钥 / 邮件通道 / 域名可达性
```

`npm run check:launch -- --strict` 在存在阻塞项时以退出码 1 结束，可挂到发布流水线做卡口。

- [ ] 用 Lemon Squeezy 测试卡完成一笔完整下单，5 分钟内收到邮件（TC-PAY-01 / TC-MAIL-01）
- [ ] 仓库里出现本次认领的 commit，且记录中没有邮箱（TC-REG-02 / TC-REG-03）
- [ ] 永久链接页面的 OG 卡片在 X 上正常显示（TC-PAGE-02）
- [ ] 落地页在手机上正常展示、购买按钮可点（TC-LP-05）
- [ ] Lemon Squeezy 切换到正式模式，完成一笔真实小额自测订单
- [ ] 清理测试阶段产生的认领记录与产物（`data/registrations`、`certificates`、`og`、候选库 status 复位）

> 清理测试数据：删除对应 `data/registrations/*.json`、`certificates/*.pdf`、`og/*.png`，
> 并把 `data/stars_pool.json` 中对应恒星的 `status` 改回 `available`、
> `assigned_slug`/`assigned_at` 置空，然后重新运行 `npm run build:site`。
