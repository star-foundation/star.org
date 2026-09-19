# 运维手册（人工处理流程）

MVP 阶段不做自助后台，所有异常都由人工按本手册处理。每个流程都对应《测试用例说明书》里的异常用例。

---

## 1. 日常巡检（每天 2 分钟）

1. GitHub Actions 页面看 `自检` 流水线是否绿色（每天 03:00 自动跑一次）。
2. 看邮箱里的告警邮件（`OPERATOR_EMAIL`）：标题以 `[Star.org]` 开头。
3. 看候选库剩余量：
   ```bash
   node -e "const p=require('./data/stars_pool.json');console.log(p.stars.filter(s=>s.status==='available').length)"
   ```
   少于 50 颗就按第 2 节扩充。

## 2. 候选库扩充（PRD 5.2 库存预警）

```bash
# 重新下载 HYG 星表（公开数据）
curl -L -o /tmp/hyg.csv https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv
# 用更大的 limit 重建（已分配的恒星状态会被重置，务必先备份）
cp data/stars_pool.json /tmp/stars_pool.backup.json
node scripts/build-pool.mjs --input /tmp/hyg.csv --limit 2000 --max-mag 6.5
# 把备份里已分配的状态合并回来（保留历史分配，避免重复分配）
node -e "
const fs=require('fs');
const backup=JSON.parse(fs.readFileSync('/tmp/stars_pool.backup.json','utf8'));
const pool=JSON.parse(fs.readFileSync('data/stars_pool.json','utf8'));
const byId=new Map(backup.stars.map(s=>[s.id,s]));
for(const star of pool.stars){const old=byId.get(star.id); if(old&&old.status==='assigned'){star.status='assigned';star.assigned_slug=old.assigned_slug;star.assigned_at=old.assigned_at;}}
fs.writeFileSync('data/stars_pool.json',JSON.stringify(pool,null,2));
"
npm run verify && npm run build:site
```

扩充后候选库仍按亮度排序（仅用于浏览展示），但分配是均匀随机，与亮度无关，新用户不会因此优先拿到较亮的星（见 `DECISIONS.md` D8）。

## 3. 候选库售罄（TC-ALLOC-04 / TC-ERR-01）

- 系统行为：分配时判定 `sold_out`，**不生成认领记录**，给 `OPERATOR_EMAIL` 发告警，流程以退出码 3 结束。
- 站点行为：落地页购买入口自动下线，显示"恒星候选库正在补充中"。
- 人工动作：
  1. 按第 2 节扩充候选库并推送；
  2. 在 Lemon Squeezy 后台找到该笔已支付订单；
  3. 执行补单：
     ```bash
     node scripts/manual-order.mjs --order-id <订单号> --name "<称呼>" --email <邮箱> [--dedication "…"]
     ```
  4. 若 24 小时内无法补上，按 PRD 6 主动发邮件说明进度并退款。

## 4. 支付成功但后端没触发（TC-ERR-02 孤立订单）

**发现方式**（三种任选，推荐第一种）：

```bash
# ① 自动对账：按订单号派生 slug，检查仓库里有没有对应记录
LEMON_SQUEEZY_API_KEY=xxx STARORG_SLUG_SECRET=xxx node scripts/reconcile.mjs
```

② 人工比对：Lemon Squeezy 后台 Orders（按时间）↔ 仓库 `data/registrations/` 的 commit 时间。
③ 用户来信说没收到证书。

**处理**：拿到订单号后执行第 3 节第 3 步的补单命令；补单是幂等的，重复执行不会分配第二颗星。

## 5. 用户要求修改姓名 / 献词（TC-ERR-03）

MVP 不做自助修改，人工处理：

```bash
# 1. 找到认领编号（用订单号派生，或从用户提供的永久链接里取 slug）
# 2. 直接改公开记录
$EDITOR data/registrations/<slug>.json      # 修改 owner_display_name / dedication_message
# 3. 重新生成证书与 OG 图并重发邮件
node scripts/manual-order.mjs --slug <slug> --name "<新称呼>" --email <用户邮箱> --force
# 4. 提交
git add -A && git commit -m "修改认领 <slug>" && git push
```

注意：匿名认领不要擅自把姓名写回公开记录。

## 6. 流程失败排查（PRD 6 异常场景）

1. GitHub Actions → 失败的那次运行 → 展开 `分配恒星 · 生成证书与 OG 图 · 发送邮件` 步骤看报错；
2. 常见原因与处理：

| 报错 | 原因 | 处理 |
|---|---|---|
| `候选库已无 available 恒星` | 售罄 | 第 3 节 |
| `等待分配锁超时` | 上一次运行异常中断留下死锁 | 删除 `data/.allocation-lock` 目录后重跑 |
| `Chrome 渲染失败或超时` | CI 缺字体/浏览器 | 确认 workflow 的字体安装步骤成功 |
| `Resend 发送失败` | API Key 失效或域名未验证 | 检查 Secret 与发信域名 SPF/DKIM |
| 提交步骤无变化 | 该订单已处理过（幂等） | 无需处理 |

3. 修好后重跑：Actions 页面 **Re-run failed jobs**，或用 `workflow_dispatch` 手动补单。

## 7. 隐私执行（PRD 5.4）

- 公开文件（`data/`、`certificates/`、`og/`）中**不得**出现邮箱、订单号、支付信息；
  `npm run verify` 会做正则扫描，CI 每次推送都跑。
- 匿名认领：公开记录里 `owner_display_name` 为 `null`，页面显示"匿名认领人"。
  证书本身仍会印上用户填写的称呼（那是用户自己留存的凭证），但公开页面不会引用它。
- 用户要求删除：删除 `data/registrations/<slug>.json` 与对应证书/OG 图，
  并把候选库该恒星复位为 `available`，然后 `npm run verify && npm run build:site` 并提交。
  注意：Git 历史里仍可查到旧文件，若用户要求彻底清除需改写历史（`git filter-repo`）并强制推送。

## 8. 备份与迁移

公开仓库本身就是备份（PRD 技术说明书 5 章）。建议额外：
```bash
git clone --mirror git@github.com:<账号>/star.org.git /path/to/backup/star.org.git
```
并把 `data/` 目录定期导出到自己的私有存储。仓库迁走后，把 `site/` 与 `data/` 放到任何静态托管上都能继续对外提供查阅。
