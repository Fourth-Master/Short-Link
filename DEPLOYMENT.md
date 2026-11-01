# 部署说明

项目使用 Cloudflare KV 保存短链与管理数据，使用 Cloudflare D1 原子记录访问量和每日访问趋势。真实密码和 Turnstile Secret 不保存在 `wrangler.toml` 中。

## 1. 安装依赖

需要 Node.js 22 或更高版本（Wrangler 4.112 的最低要求）。

```powershell
pnpm install
```

## 2. 创建并绑定 D1

首次部署时创建统计数据库：

```powershell
npx wrangler d1 create shortlink-stats
```

命令会返回真实的 `database_id`。请用它替换 `wrangler.toml` 中的零 UUID 占位值：

```toml
database_id = "00000000-0000-0000-0000-000000000000"
```

不要直接使用占位 ID 部署生产环境。

应用本地迁移：

```powershell
pnpm db:migrate:local
```

应用生产迁移：

```powershell
pnpm db:migrate:remote
```

D1 只记录升级后的精确增量；旧 KV 中已有的 `visits`、`dailyVisits` 和 `lastVisit` 会在后台查询时作为只读历史基线自动合并，因此无需手工搬迁旧统计，也不会在升级后归零。

## 3. 本地开发

```powershell
Copy-Item .dev.vars.example .dev.vars
# 编辑 .dev.vars，填入本地 ADMIN_PASS、TURNSTILE_SECRET 等值
pnpm db:migrate:local
pnpm dev
```

本地页面默认使用 `SITE_URL`、`STATS_TIME_ZONE` 和 `STATS_RETENTION_DAYS`。生产配置当前分别为：

- `SITE_URL=https://883588.xyz`
- `STATS_TIME_ZONE=Asia/Shanghai`
- `STATS_RETENTION_DAYS=90`

每日明细超过保留期后由定时任务清理，累计访问量继续保留。

## 4. 生产 Secret 与部署

```powershell
npx wrangler secret put ADMIN_PASS
npx wrangler secret put TURNSTILE_SECRET
pnpm db:migrate:remote
pnpm deploy:dry
pnpm deploy
```

本项目原地升级现有的 `shortlink` Worker。推荐顺序是：创建 D1、替换 ID、应用迁移、设置 Secret、执行 dry-run，最后部署 Worker。数据库迁移必须在新 Worker 接收流量前完成。

已经出现在旧源码、日志或提交历史中的密码及 Turnstile Secret 必须先在对应平台轮换，不能继续使用。
