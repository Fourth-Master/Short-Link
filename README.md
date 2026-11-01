# 35 Short Link

<div align="center">
  <img src="dist/logo.webp" alt="35 Short Link logo" width="96" height="96">
  <h1>35 短链接</h1>
  <p>轻量的短链生成、跳转与管理平台</p>

  <p>
    <a href="https://883588.xyz"><img src="https://img.shields.io/badge/在线演示-883588.xyz-2563eb?style=flat-square" alt="在线演示"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/许可证-AGPL--3.0-111827?style=flat-square" alt="AGPL-3.0 license"></a>
    <img src="https://img.shields.io/badge/语言-JavaScript-f7df1e?style=flat-square&logo=javascript&logoColor=111827" alt="JavaScript">
  </p>
</div>

<div align="center">

**把长链接变成易分享、可管理、可统计的短链接。**

[在线首页](https://883588.xyz) · [管理后台](https://883588.xyz/admin/login) · [接口文档](https://883588.xyz/doc)

</div>

## 项目亮点

| | 能力 | 说明 |
| --- | --- | --- |
| ⚡ | 极速跳转 | 精简跳转链路，短链接在不同地区、不同设备上都能快速打开 |
| 🔗 | 短链管理 | 自动生成或自定义 6–12 位字母数字短码，支持有效期与跳转延时 |
| 🛡️ | 安全防护 | HTTP(S) 目标校验、敏感词过滤、黑白名单、请求限流与登录锁定 |
| 📈 | 访问统计 | 原子计数、每日趋势、来源与设备信息，兼容旧统计基线 |
| 🖥️ | 管理后台 | 搜索、编辑、批量删除、黑白名单、友链、统计和操作日志 |
| 🧩 | 站点自定义 | 版权信息、页头代码、页脚代码可视化管理，注入公开页面 |
| 📱 | 自适应界面 | 原生 HTML/CSS/JS，支持深色模式、键盘操作和移动端布局 |

## 快速开始

### 环境要求

- Node.js `22+`
- pnpm `11+`

### 安装与本地运行

```bash
git clone https://github.com/Fourth-Master/Short-Link.git
cd Short-Link
pnpm install

# 创建本地变量文件（不要提交 .dev.vars）
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars，至少填写 ADMIN_PASS

pnpm db:migrate:local
pnpm dev
```

本地开发启动后，Wrangler 会输出预览地址。常用检查命令：

```bash
pnpm check       # 语法检查 + 全部测试
pnpm test        # 运行测试套件
pnpm deploy:dry  # 只打包，不发布
```

## 使用方式

### Web 页面

- `/`：创建短链接
- `/s/{code}`：访问并跳转短链接
- `/admin/login`：管理员登录
- `/admin`：短链与站点管理后台
- `/doc`：在线接口文档

### 创建短链接

```bash
curl -X POST https://883588.xyz/api/create \
  -H "Content-Type: application/json" \
  -d '{"longUrl":"https://example.com/article","customCode":"demo35","expireDays":30}'
```

参数说明：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `longUrl` | 是 | 仅允许 `http` / `https`，不允许嵌入账号或密码 |
| `customCode` | 否 | 6–12 位字母或数字；不传则自动生成 |
| `expireDays` | 否 | 有效期天数，默认 30 天，最大 365 天 |
| `delay` | 否 | 是否启用跳转提示页，默认启用 |

成功响应示例：

```json
{
  "status": 1,
  "code": "demo35",
  "expire": 1735689600000,
  "delay": true,
  "msg": "创建成功"
}
```

### 管理 API

登录后，使用返回的会话 Cookie 调用以下接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `POST` | `/admin/api/login` | 管理员登录 |
| `GET` / `POST` | `/admin/api/links` | 查询或创建短链 |
| `PUT` / `DELETE` | `/admin/api/links/{code}` | 修改或删除短链 |
| `GET` | `/admin/api/stats` | 获取访问统计 |
| `GET` / `POST` | `/admin/api/blacklist` | 查看或添加黑名单 |
| `GET` / `POST` | `/admin/api/whitelist` | 查看或添加白名单 |
| `GET` / `POST` | `/admin/api/friendlink` | 管理友情链接 |
| `GET` / `POST` | `/admin/api/setting/headercode` | 页头代码（注入公开页面 `<head>` 末尾） |
| `GET` / `POST` | `/admin/api/setting/footercode` | 页脚代码（注入公开页面 `</body>` 前） |
| `GET` | `/admin/api/logs` | 查看操作日志 |

完整参数和响应以线上 [接口文档](https://883588.xyz/doc) 为准。

### 页头 / 页脚代码

在管理后台「系统设置」中可配置页头代码和页脚代码：

- **页头代码**：注入到所有公开页面（首页、API 文档、跳转提示页、404 页）`</head>` 之前，适合放置验证 Meta、统计脚本等。
- **页脚代码**：注入到所有公开页面 `</body>` 结束之前，适合放置统计或悬浮组件脚本。
- 保存后立即生效；页面带有最长约 10 分钟的边缘缓存，完全刷新可能略有延迟。
- 代码内容为管理员可控 HTML，请自行确认其来源可信；单个设置上限 20000 字符。

## 技术架构

```text
浏览器
  │
  ▼
Worker（路由、页面、API、限流、鉴权）
  ├─ KV  ─ 短链、黑白名单、会话、站点设置与登录保护
  └─ D1  ─ 访问计数、每日趋势、统计查询
```

- **Worker**：`src/index.js` 统一入口，负责静态资源、页面和 API 路由。
- **KV**：`src/kv/kv.js` 封装短链及配置数据读写。
- **D1**：`src/db/stats.js` 记录精确访问量与每日明细。
- **前端**：`src/frontend/` 公共页面，`src/admin/` 管理页面，`dist/` 为 Worker 内嵌静态资源。
- **迁移**：`migrations/` 保存 D1 增量迁移。

## 目录结构

```text
src/
├─ index.js                 # Worker 入口与路由
├─ core/                    # 短链与登录验证核心逻辑
├─ db/                      # D1 统计读写
├─ kv/                      # KV 数据访问
├─ frontend/                # 首页、文档、跳转和 404 页面
└─ admin/                   # 登录页与管理后台
dist/                       # favicon、Logo、CSS、i18n、验证码图片
design-system/              # UI 设计系统文档
migrations/                 # D1 迁移 SQL
scripts/wrangler.mjs        # Windows 下 Wrangler 兼容启动器
test/                       # 单元测试与 UI 回归测试
wrangler.toml               # Worker、KV、D1 和域名配置
```

## 部署

项目当前部署为 `shortlink` Worker，使用 KV `LINKS` 和 D1 `shortlink-stats`。首次部署或迁移环境时：

```bash
pnpm install
pnpm db:migrate:remote

# Secret 只通过 Wrangler 写入，不要放进 wrangler.toml 或 Git
npx wrangler secret put ADMIN_PASS
npx wrangler secret put TURNSTILE_SECRET

pnpm deploy:dry
pnpm deploy
```

生产配置中的以下值可以公开提交，但请确认它们属于你的账号：

- `account_id`
- KV namespace ID
- D1 database ID
- 自定义域名与 Cron 表达式

真实密码、Turnstile Secret 和本地 `.dev.vars` 永远不要提交。若密钥曾经出现在日志或提交历史中，请先在对应平台轮换，再继续部署。

## 安全与运维

- 仅允许跳转到 `http` / `https`，拒绝包含账号密码的 URL。
- 创建、登录和管理 API 均有请求限流。
- 管理员连续登录失败会触发临时锁定和拼图验证。
- 每日明细由定时任务清理，累计访问量保留。
- 部署前先运行 `pnpm check` 和 `pnpm deploy:dry`。
- 生产 Secret 使用 `wrangler secret` 管理，不写入配置文件。

## 许可证

本项目采用 [GNU Affero General Public License v3.0](LICENSE)。

Copyright © Fourth Master
