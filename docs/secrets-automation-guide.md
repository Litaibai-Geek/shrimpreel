# .dev.vars.production 密钥配置指南

本文档说明哪些密钥可以自动生成，哪些需要手动配置。

---

## 🤖 可自动生成的密钥

### 1. ✅ SESSION_SECRET（会话密钥）
**当前状态**: `change-me-to-a-long-random-string` ⚠️ 弱密钥
**可以自动生成**: 是
**生成方法**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**说明**: 用于签名会话 cookie 和 token，必须是强随机值。

---

### 2. ✅ TURNSTILE_SECRET_KEY
**当前状态**: 空
**可以自动生成**: 是（通过 Cloudflare API）
**生成方法**:
```bash
npm run setup -- --apply
```

**说明**: 
- 脚本调用 Cloudflare API 创建 Turnstile 站点
- 自动获取并写入服务端密钥
- 无需手动配置

---

### 3. ✅ RESEND_API_KEY（发信密钥）
**当前状态**: 空
**可以自动生成**: 是（通过 Resend API）
**生成方法**:
```json
// site.setup.json
{
  "platforms": {
    "resend": {
      "enabled": true,
      "createSendingKey": true
    }
  }
}
```
```bash
npm run setup -- --apply
```

**说明**: 
- 需要在 `site.setup.json` 启用 `createSendingKey`
- 脚本调用 Resend API 创建域名专用发信密钥
- 自动写入 `.dev.vars.production`

---

## 🔐 需要手动配置的密钥

### 支付商密钥（必须从服务商获取）

#### 4. ❌ WAFFO_MERCHANT_ID
**获取方式**: Waffo 商户后台
**说明**: 商户唯一标识，格式 `MER_xxx`

#### 5. ❌ WAFFO_PRIVATE_KEY
**获取方式**: Waffo 商户后台 → API 密钥管理
**说明**: 用于签名支付请求

#### 6. ❌ DODO_API_KEY
**获取方式**: Dodo Payments 后台
**说明**: 可选，只在使用 Dodo 支付时需要

#### 7. ❌ DODO_WEBHOOK_SECRET
**获取方式**: Dodo Payments 后台
**说明**: 验证 webhook 签名

#### 8. ❌ STRIPE_SECRET_KEY
**获取方式**: Stripe Dashboard → API Keys
**说明**: 可选，只在使用 Stripe 时需要

#### 9. ❌ STRIPE_WEBHOOK_SECRET
**获取方式**: Stripe Dashboard → Webhooks → Signing secret
**说明**: 验证 webhook 签名

---

### 第三方服务密钥（必须从服务商获取）

#### 10. ❌ GOOGLE_CLIENT_SECRET
**获取方式**: Google Cloud Console → APIs & Services → Credentials
**说明**: Google OAuth 客户端密钥

#### 11. ❌ FAL_KEY
**获取方式**: fal.ai 后台
**说明**: 视频生成服务密钥

#### 12. ❌ YIR_API_KEY
**获取方式**: yir.ai 后台
**说明**: 可选，只在 `VIDEO_PROVIDER=yir` 时需要

#### 13. ❌ NANOAPI_API_KEY
**获取方式**: NanoAPI 后台
**说明**: 可选，只在 `VIDEO_PROVIDER=nanoapi` 时需要

#### 14. ❌ KIE_API_KEY
**获取方式**: Kie.ai 后台
**说明**: 可选，只在 `VIDEO_PROVIDER=kie` 时需要

#### 15. ❌ OPENAI_API_KEY
**获取方式**: OpenAI Platform → API Keys
**说明**: 可选，只在 `MODERATION_PROVIDER=openai` 时需要

---

### 可选密钥

#### 16. 🔔 PAYMENT_NOTIFY_WEBHOOK_URL
**获取方式**: 
- Telegram: 创建 Bot → 获取 webhook URL
- 飞书: 群机器人设置
- Discord: Server Settings → Integrations → Webhooks
- Slack: Create Webhook

**说明**: 用于支付到账即时通知，完全可选

---

## 📋 自动化程度总结

| 密钥 | 自动生成 | 生成方法 |
|-----|---------|---------|
| SESSION_SECRET | ✅ | `crypto.randomBytes(32)` |
| TURNSTILE_SECRET_KEY | ✅ | Cloudflare API |
| RESEND_API_KEY | ✅ | Resend API（需启用） |
| 支付商密钥 (8个) | ❌ | 手动从服务商后台获取 |
| 第三方服务密钥 (6个) | ❌ | 手动从服务商后台获取 |
| 通知 Webhook | 🔔 | 手动配置（可选） |

---

## 🚀 推荐工作流

### 第 1 步：自动生成可自动化的密钥

```bash
# 生成 SESSION_SECRET（如果还是默认值）
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# 复制输出，替换 .dev.vars.production 中的 SESSION_SECRET
```

### 第 2 步：配置自动化平台密钥

编辑 `site.setup.json`:
```json
{
  "platforms": {
    "cloudflare": {
      "turnstile": true  // 自动创建 Turnstile
    },
    "resend": {
      "enabled": false,  // 如果需要 Resend 发信，设为 true
      "createSendingKey": false  // 自动创建发信密钥
    }
  }
}
```

运行自动化脚本:
```bash
npm run setup -- --apply
```

### 第 3 步：手动配置第三方服务密钥

根据你的实际使用情况，到对应服务商后台获取密钥：

**必需**（根据你的 `site.setup.json` 配置）:
- Google OAuth: `GOOGLE_CLIENT_SECRET`
- 支付商: `WAFFO_MERCHANT_ID` + `WAFFO_PRIVATE_KEY`
- 视频生成: 根据 `VIDEO_PROVIDER` 配置对应的 API Key
- 内容审核: 根据 `MODERATION_PROVIDER` 配置 `OPENAI_API_KEY`

**可选**:
- `PAYMENT_NOTIFY_WEBHOOK_URL` - 支付到账通知

---

## 🎯 进一步自动化的可能性

### 可以实现自动化的密钥

1. **SESSION_SECRET** ✅
   - 完全可以在 `npm run setup` 时自动生成
   - 检测到默认值时自动替换

2. **TURNSTILE_SECRET_KEY** ✅
   - 已实现自动化
   - 通过 Cloudflare API 创建并获取

3. **RESEND_API_KEY** ✅
   - 已实现自动化（需启用）
   - 通过 Resend API 创建域名专用密钥

### 无法自动化的密钥

**支付商和第三方服务密钥**必须手动获取，因为：
- 需要在服务商后台注册账号
- 涉及商业合同和费用
- 需要配置 Webhook URL、回调域名等
- 每个商家的配置不同

---

## 💡 建议

1. **使用密钥管理器**: 避免明文存储在多个地方
2. **定期轮换**: 特别是 `SESSION_SECRET`
3. **环境隔离**: 测试和生产使用不同的密钥
4. **最小权限**: API 密钥只授予必需的权限
5. **监控使用**: 定期检查密钥使用情况和异常访问

---

**最后更新**: 2026-10-31
