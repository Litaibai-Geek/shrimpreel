# 新站 Cloudflare 初始化 V1

> 默认只生成计划，**不连接平台、不写配置、不部署**。只有显式 --apply 才创建资源。
> 用 Node 24 + npm，Windows PowerShell 和 macOS/Linux 均可。

## 第一次使用

1. 在新站项目中先运行现有脚手架，例如：
   node scripts/new-site.mjs --keyword "Moon Hop" --domain moonhop.ai --slug moonhop --name moonhop --write
   此步骤只处理站点身份；热点英文/中文文案和素材仍须独立重写。
2. 将 site.setup.example.json 复制为 site.setup.json，将 site.name/domain 改为与 wrangler.jsonc 和 src/config/site.ts 一致，填写 Google OAuth **公开** Client ID、管理员邮箱、Waffo 的店铺 ID。site.setup.json 已被 .gitignore 忽略。
3. 将 .dev.vars.example 复制为 .dev.vars.production，填写现有支付、Kie、OpenAI、Google Client Secret 等真正密钥。此文件已经被 git 忽略，不要上传或截图分享。
4. 本地安装并登录：npm ci；npx wrangler login。注意使用有权限创建 D1、R2、KV 和 Queues 的 Cloudflare 账号。

## 常用命令（PowerShell）

    npm run setup -- --plan
    npm run setup -- --apply
    npm run setup -- --verify

--plan 默认离线，不连接任何平台，显示资源命名和待执行内容。
--apply 查询远端资源；缺少时创建并重查，验证无误才写回 wrangler.jsonc 的 D1/KV ID。
--verify 只读验证远端资源以及本地 D1/KV ID，不做修改。
命令失败后可以再次运行 --apply；脚本按准确名字复用已有 Cloudflare 资源，不会使用旧的/不同 ID 覆盖当前生产绑定。

如需明确对远端 D1 应用 migration：

    npm run setup -- --apply --with-migrations

只有在确认备份后才使用此选项。默认永不迁移、永不部署、永不上传或覆盖 R2 视频，也不会修改已有生产密钥。

## Waffo

site.setup.json 中填写：

    "payment": { "provider": "waffo", "environment": "test", "storeId": "STO_...", "createProducts": true }

此时 --apply 复用现有 scripts/waffo-setup.mjs 创建缺失的积分包，并在成功后写回 WAFFO_PRODUCTS，之后重复运行会跳过已有映射。
开启正式 prod 商品需要额外增加 --allow-live-payments。

首次创建 Waffo Webhook 仍要去后台确认端点（https://你的域名/api/webhooks/waffo）和事件，因为旧脚本的 add-webhook 尚不具备跨中断的幂等识别，不能在每次重试时盲目新建重复 Webhook。
**如果 Waffo 商品创建中途失败，应先在 Waffo 后台检查已创建的商品并补全 WAFFO_PRODUCTS，再运行 --apply**，否则可能重复创建收费商品。

## Secrets 与首个 Worker

配置 "secrets": {"file": ".dev.vars.production", "sync": true} 后，--apply 调用现有 scripts/sync-secrets.mjs 安全同步，默认不覆盖线上同名 Secret。
若该 Worker 尚未发布，远端 Secret 列表可能不可读，脚本会**安全停止**，而不是使用 --overwrite 盲目覆盖。
请先核实这是全新的 Worker，按现有 docs/env.md 的初次创建指引初始化 Secret，之后重跑 --apply。任何更新 Secret 的步骤都可能在 Cloudflare 生成 Worker 新版本；此脚本不直接执行 deploy。

## 仍需人工验收

- Google OAuth 客户端首次创建、授权域名和回调 URI
- Worker 自定义域名和 DNS、Email Service 发信域名、Turnstile 建站
- R2 templates/*.mp4 参考视频上传、授权核对、生命周期与备份
- 生产 Waffo Webhook / 收款、实际 Google 登录、Solo/Band 真实 Kie 出片和退款
- npm run typecheck / npm test / npm run build / npm run doctor / 线上 SEO 和 Smoke Test

本脚本只协调资源的初始化，**不会自动发布正式网站**。
