# 实现决策记录（与文档的差异及理由）

本文件记录实现过程中对《技术需求说明书 v0.2》《产品需求文档 v1.0》的取舍，
便于后续版本回溯。

## D1. 静态生成器：Jekyll → 自研零依赖构建脚本

- 文档：4.6 提到"Jekyll 根据 /data/registrations/ 生成独立静态页面"。
- 实现：`scripts/build-site.mjs` 读取 `site/` 模板与 `data/` 数据，输出 `_site/`，
  由 GitHub Actions 部署到 Pages。
- 理由：部署方式与产物等价（仍然是 GitHub Pages 上的纯静态站点），
  但去掉了 Ruby/Bundler 依赖链——在本机与 CI 上都不会因为 gem 版本问题卡住上线，
  符合"两周内上线、零运维"的目标。若未来需要 Jekyll 生态的插件，可平滑替换构建步骤。

## D2. 防超卖：concurrency 之外再加一层锁

- 文档：4.2 用 Actions `concurrency` 分组串行化认领流程。
- 实现：保留 `concurrency: star-registration`，并在 `scripts/allocate.mjs` 内增加
  mkdir 原子锁 + 拿锁后重读候选库。
- 理由：`concurrency` 只约束 GitHub 侧触发的运行；本地联调、脚本调用、补单等路径不受其保护。
  加锁后所有路径都不会超卖，也让 TC-ALLOC-03 可以在本地用真实并发进程验证（3 轮）。

## D3. 认领编号（slug）由订单号 HMAC 派生

- 文档：slug 未规定生成方式。
- 实现：`slug = base32(HMAC-SHA256(STARORG_SLUG_SECRET, order_id))[0..10]`；无订单号时用随机值。
- 理由：同一笔订单重复触发（Webhook 重投、用户重复点击支付）会落到同一个 slug，
  认领流程因此天然幂等（TC-ERR-04），既不会给同一用户分配第二颗星，也无需在公开仓库里
  保存订单号或任何隐私信息（满足 TC-REG-03）。

## D4. 匿名认领与证书的关系

- 文档：PRD 4.3 要求证书包含认领人姓名；PRD 5.4 要求匿名展示且真实姓名不进公开仓库；
  技术 4.5 要求证书 commit 进公开仓库。
- 冲突点：证书放在公开仓库里，姓名就必然公开。
- 实现：匿名认领的公开记录、永久页面、OG 图、认领表全部不出现姓名；
  证书仍然印上用户填写的称呼（那是用户自己的凭证），但**公开页面不引用证书链接**，
  仅通过邮件把证书发给本人。链接不可猜测（10 位 base32 ≈ 50 bit）。
- 可配置：`site.config.json → policy.anonymousNameInCertificate = false` 时，
  匿名认领的证书本身也不印姓名（显示"匿名认领人"），适合对匿名要求更严格时使用。

## D5. 隐私字段的机器化校验

- 文档：TC-REG-03 要求"认领记录中不包含邮箱、订单号等隐私信息"。
- 实现：`scripts/verify-registry.mjs` 递归扫描每条公开记录，
  用正则匹配邮箱格式与 `order_id/email/customer_name/phone/address/ip` 等字段名，命中即报错；
  CI 每次推送与每天定时巡检都会执行。
- 理由：把合规红线变成可自动执行的检查，而不是靠人记得。

## D6. 邮件与渲染的可离线运行

- 未配置 `RESEND_API_KEY`/`POSTMARK_TOKEN` 时，邮件写入 `outbox/` 目录（含 .eml/.html/.txt），
  本地即可完整核对邮件内容（TC-MAIL-02 的"无占位符残留"检查就建立在这上面）。
- 无头浏览器统一走 `--host-resolver-rules="MAP * ~NOTFOUND"` 完全离线渲染，
  并在产物落盘后主动结束进程——部分受限环境下 Chrome 完成渲染后不会自行退出，
  否则每次渲染会从秒级退化到分钟级。

## D7. 结算链接与售罄状态

- `LEMON_SQUEEZY_CHECKOUT_URL` 未配置，或候选库 available = 0 时，
  落地页与导航栏的购买入口自动下线并显示"补货中"提示（PRD 6 的售罄要求），
  避免用户付款后才发现无星可分。
