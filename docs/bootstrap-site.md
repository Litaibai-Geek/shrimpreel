# 新站 Cloudflare 初始化 V1

> 默认只生成计划，**不连接平台、不写配置、不部署**。只有显式 --apply 才创建资源。
> 用 Node 24 + npm，Windows PowerShell 和 macOS/Linux 均可。

## 第一次使用

1. 在新站项目中先运行脚手架，例如：
   node scripts/new-site.mjs --keyword "Moon Hop" --domain moonhop.ai --slug moonhop --name moonhop --write
   脚本会在文件不存在时创建 site.setup.json 和 .dev.vars.production，并为新密钥文件生成随机 SESSION_SECRET；已有文件不会覆盖。站点身份变化时清空旧支付商品映射、Google Client ID 和 Turnstile Key，支付环境重置为 test。热点英文/中文文案和素材仍须独立重写。
2. 在 site.setup.json 填写管理员邮箱、Google OAuth **公开** Client ID 和需要的支付店铺 ID。站点名与域名默认从 wrangler.jsonc 和 src/config/site.ts 读取；旧版显式字段仍会核对。Cloudflare ID 和 Turnstile Site Key 可省略并按 V2 自动发现或生成。site.setup.json 已被 .gitignore 忽略。
3. 在 .dev.vars.production 填写所选支付、视频、图片审核和 Google Client Secret 等密钥。此文件已经被 git 忽略，不要上传或截图分享。已有文件和已上线 Worker 的 SESSION_SECRET 不会自动更换。
4. 本地安装并登录：npm ci；npx wrangler login。注意使用有权限创建 D1、R2、KV 和 Queues 的 Cloudflare 账号。

## 各配置文件的职责

| 文件 | 配置内容 |
| --- | --- |
| `site.setup.json` | 公开的站点初始化选择：`site.adminEmail`、`google.clientId`、`payment`、`video.provider`、`moderation.provider`、`email.from`、`email.loginEnabled` 和平台功能开关；不放密钥 |
| `.dev.vars.platform` | Cloudflare、Resend 平台管理凭据，仅用于本地初始化，不同步到 Worker |
| `.dev.vars.production` | Worker 运行密钥，如 Google Client Secret、支付商私钥、视频服务商 Key 和审核 Key |
| `src/config/site.ts` | 站点域名、品牌、素材、模型参数、时长和价格；站点域名从这里读取 |
| `wrangler.jsonc` | Worker 部署参数和资源绑定；初始化将站点公开配置及自动生成的 ID 写入这里 |

公开配置以 `site.setup.json` 为准：先运行 `npm run setup -- --plan` 查看差异，再用 `--apply` 同步。商品自动创建时会先补齐 `WAFFO_PRODUCTS` 字段，并在成功后写入映射；已有映射保留。部署前只检查公开配置是否同步，不再用 `.dev.vars.production` 覆盖店铺或商品配置；该文件用于运行密钥。旧的 `sync:wrangler` 只显示计划，不能用 `.dev.vars` 写入生产配置。初始化仍受正式商品创建、邮箱验证和远端资源检查的保护。

`video.provider` 可选 `kie`、`fal`、`yir`、`nanoapi`；`moderation.provider` 可选 `openai`、`none`。`email.from` 可填发件邮箱，空字符串表示不发信，`null` 或不填表示沿用 Wrangler 当前值。更换服务商时还要填写其运行密钥并检查 `site.ts` 中的模型参数。只有显式设置的字段才会覆盖 Wrangler；旧配置没有这些字段时保持原值。发件域名仍需在实际邮件服务中验证。

`email.loginEnabled` 是邮箱注册和登录的目标开关，示例默认为 `false`，未填写时沿用 Wrangler 当前值。设为 `true` 后，先分别配置 Turnstile、验证发信域名并测试向真实邮箱投递，备份并应用远端 D1 迁移，再同步 Worker Secret。完成这些步骤后使用 `npm run setup -- --apply --email-login-tested`：该参数表示真实邮件投递已经测试，脚本会在写入开关前检查发件地址、Turnstile Site Key、远端迁移状态和远端所需密钥名称。若开启正式 Waffo 商品创建，还需要原有的 `--allow-live-payments`。执行完成仍须重新构建和部署；脚本无法代替真实投递测试。

`--verify` 会检查上述公开配置是否已写入 Wrangler，存在差异时列出字段名并停止；不检查正在运行的 Worker 是否已部署。生产密钥文件中未使用的已登记密钥可留空，未登记的键及重复键仍会报错；上线检查继续检查所选服务商的必需密钥。

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
- Worker 自定义域名和 DNS、Email Service 发信域名；Turnstile 可按 V2 配置自动创建，仍需验收
- R2 templates/*.mp4 参考视频上传、授权核对、生命周期与备份
- 生产 Waffo Webhook / 收款、实际 Google 登录、Solo/Band 真实 Kie 出片和退款
- npm run typecheck / npm test / npm run build / npm run doctor / 线上 SEO 和 Smoke Test

本脚本只协调资源的初始化，**不会自动发布正式网站**。

启用 V2 时，现有 Cloudflare Zone 的 accountId 和 zoneId 可留空自动发现；权限、冲突处理和自定义文件的说明见 [bootstrap-v2.md](bootstrap-v2.md)。

## V2 login switch

完成 Resend/Turnstile 和真实投递验证、应用 0016_email_login.sql 后，在 site.setup.json 中设置 email.loginEnabled 并按上面的步骤同步。已有 Google 用户保留账号，并需在设置中主动启用邮箱登录。
