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

仓库 **Settings → Actions → General → Workflow permissions 选择 "Read and write permissions"**，
登记流水线需要 commit 回仓库。

## 2. 配置密钥与变量（Settings → Secrets and variables → Actions）

**Secrets（密钥，不落代码库）**

| 名称 | 用途 |
|---|---|
| `STARORG_SLUG_SECRET` | 由订单号派生登记编号（HMAC），同时保证重复 Webhook 幂等。随机 32 位以上字符串 |
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
   - `登记人姓名/称呼`（必填，说明文案：会展示在证书和永久页面上，可填"For Anna"这类称呼）
   - `献词/留言`（选填，说明文案：100 字以内，将印在证书上）
   - `匿名展示`（选填，复选框，说明文案：勾选后公开页面与登记表不显示你的称呼）
   - 邮箱由 Lemon Squeezy 自身收集
3. **Checkout 设置**：开启 Test Mode 先联调，上线前再切换到正式模式。
4. **结算完成页文案（Confirmation modal / Redirect）**：
   > 感谢登记。证书正在生成，将在几分钟内发送到你的邮箱；
   > 稍后也可以用这个邮箱找回记录。若 24 小时内未收到，请来信 support@star.org。
5. **Settings → Webhooks → Add webhook**：
   - URL：Zapier/Make 生成的 Catch Hook 地址
   - Events：`order_created`
   - Signing secret：保存好，Zapier 侧可用于校验（可选但推荐）

## 4. Zapier / Make 配置（唯一的"胶水"环节）

以 Zapier 为例：

1. **Trigger**：`Webhooks by Zapier → Catch Hook`，复制生成的 URL 填到 Lemon Squeezy Webhook。
2. 用 Lemon Squeezy Test Mode 下一笔测试单，抓取一次真实载荷，确认字段名
   （常见为 `data.attributes.user_email`、`data.id`，自定义字段在 `data.attributes.first_order_item` 或
   `meta.custom_data` 中，按实际载荷取）。
3. **Filter**：仅当事件为 `order_created` 且状态为 paid 时继续。
4. **Action**：`Webhooks by Zapier → POST`，配置：
   - URL：`https://api.github.com/repos/<账号>/star.org/dispatches`
   - Payload type：`json`
   - Headers：
     - `Authorization: Bearer <GitHub PAT>`（Fine-grained token，仅勾选该仓库的 Contents: Read and write）
     - `Accept: application/vnd.github+json`
   - Data：
     ```json
     {
       "event_type": "star_registration",
       "client_payload": {
         "order_id": "<Lemon Squeezy 订单 ID>",
         "display_name": "<登记人姓名/称呼>",
         "email": "<用户邮箱>",
         "dedication": "<献词，可为空>",
         "anonymous": false,
         "source": "lemon-squeezy"
       }
     }
     ```
5. GitHub PAT 只保存在 Zapier 的密钥管理中，不进入前端、不进入仓库。

## 5. 邮件服务（Resend 为例）

1. 注册 Resend → **Domains → Add domain**，按提示添加 SPF / DKIM / DMARC 记录（降低进垃圾箱概率，TC-MAIL-04）。
2. 验证通过后创建 API Key，填入 GitHub Secret `RESEND_API_KEY`。
3. `site.config.json` 里的 `email.fromAddress` 改成你已验证的发信地址（如 `certificate@star.org`）。

## 6. 域名绑定

1. 仓库 **Settings → Pages → Custom domain** 填 `star.org`，保存。
2. DNS 添加记录（GitHub 官方推荐值）：
   - `A @ 185.199.108.153` / `.109.153` / `.110.153` / `.111.153`
   - `CNAME www <账号>.github.io`
3. 等待证书签发，勾选 **Enforce HTTPS**。
4. 构建时会自动写入 `CNAME` 文件（`site.config.json` 的 `site.domain`）。

## 7. 上线前最后检查（全部 P0，一票否决）

```bash
npm test                 # 全部测试用例，含防超卖并发测试 3 轮
npm run verify           # 登记表无重复、无隐私字段
npm run check:compliance # 无禁用措辞、无违规收款渠道、必备声明齐全
```

- [ ] 用 Lemon Squeezy 测试卡完成一笔完整下单，5 分钟内收到邮件（TC-PAY-01 / TC-MAIL-01）
- [ ] 仓库里出现本次登记的 commit，且记录中没有邮箱（TC-REG-02 / TC-REG-03）
- [ ] 永久链接页面的 OG 卡片在 X 上正常显示（TC-PAGE-02）
- [ ] 落地页在手机上正常展示、购买按钮可点（TC-LP-05）
- [ ] Lemon Squeezy 切换到正式模式，完成一笔真实小额自测订单
- [ ] 清理测试阶段产生的登记记录与产物（`data/registrations`、`certificates`、`og`、候选库 status 复位）

> 清理测试数据：删除对应 `data/registrations/*.json`、`certificates/*.pdf`、`og/*.png`，
> 并把 `data/stars_pool.json` 中对应恒星的 `status` 改回 `available`、
> `assigned_slug`/`assigned_at` 置空，然后重新运行 `npm run build:site`。
