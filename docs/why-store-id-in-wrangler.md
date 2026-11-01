# 为什么 WAFFO_STORE_ID 放在 wrangler.jsonc 而非 .dev.vars.production

## 📊 配置位置对比

| 配置项 | 位置 | 原因 |
|-------|------|------|
| `WAFFO_MERCHANT_ID` | `.dev.vars.production` | 🔒 **私密** - 商户身份标识 |
| `WAFFO_PRIVATE_KEY` | `.dev.vars.production` | 🔒 **绝密** - 用于签名 API 请求 |
| `WAFFO_STORE_ID` | `wrangler.jsonc` | ✅ **公开** - 仅用于客户端操作 |
| `WAFFO_PRODUCTS` | `wrangler.jsonc` | ✅ **公开** - 产品 ID 映射 |

---

## 🎯 核心原因

### 1. 安全性不同

#### WAFFO_STORE_ID（公开的）
```typescript
// src/server/payments/waffo.ts:102-103
const storeId = cleanSecret(env.WAFFO_STORE_ID)
if (!storeId) throw new ApiError(503, 'payment_not_configured', 'WAFFO_STORE_ID missing')
```

**用途**：
- ✅ 生成客户门户链接（传给前端）
- ✅ 用户查看订阅信息
- ✅ 用户管理付款方式
- ✅ **不涉及敏感操作**

**暴露后果**：
- ⚠️ 别人知道你的店铺 ID？**没问题！**
- ⚠️ 店铺 ID 本身不能做任何敏感操作
- ⚠️ 只是一个"地址"，类似于店铺的"门牌号"

#### WAFFO_MERCHANT_ID + PRIVATE_KEY（保密的）

```typescript
// src/server/payments/waffo.ts:35-36
const merchantId = cleanSecret(env.WAFFO_MERCHANT_ID)
const privateKey = cleanSecret(env.WAFFO_PRIVATE_KEY)

// 用于签名 API 请求
const signature = base64Encode(
  await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    await key,
    new TextEncoder().encode(`POST\n${path}\n${timestamp}\n${bodyHash}`),
  ),
)
```

**用途**：
- 🔒 创建支付会话（扣款）
- 🔒 处理退款
- 🔒 取消订阅
- 🔒 查询订单详情
- 🔒 **所有敏感的后端操作**

**暴露后果**：
- 🚨 **严重安全问题！**
- 🚨 攻击者可以：
  - 创建虚假订单
  - 发起退款
  - 取消用户订阅
  - 查看所有交易数据

---

## 🏗️ 架构设计原理

### Cloudflare Workers 的两种环境变量

#### 1. `vars`（wrangler.jsonc）- 公开配置

```jsonc
{
  "vars": {
    "SITE_URL": "https://tinydeskai.website",
    "WAFFO_STORE_ID": "STO_xxx",
    "WAFFO_PRODUCTS": "{...}"
  }
}
```

**特点**：
- ✅ 部署到 Worker 后**任何人都能读取**
- ✅ 通过 Worker 的环境变量暴露
- ✅ 可能被前端代码访问
- ✅ 适合**非敏感配置**

**存储位置**：
- Cloudflare 的 Worker 配置中
- 任何能访问 Worker 的代码都能读取

#### 2. `secrets`（.dev.vars.production）- 保密配置

```bash
WAFFO_MERCHANT_ID=MER_xxx
WAFFO_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
...
```

**特点**：
- 🔒 通过 `wrangler secret put` 加密存储
- 🔒 只能在 Worker **运行时**后端代码访问
- 🔒 前端代码**完全无法访问**
- 🔒 适合**敏感密钥**

**存储位置**：
- Cloudflare 的加密密钥存储
- 只有 Worker 运行时能解密

---

## 💡 实际场景分析

### 场景 1: 用户访问客户门户

```typescript
// 前端点击"管理付款"按钮
// → 后端生成门户链接

// src/server/payments/waffo.ts:100-112
async portalUrl(subscription) {
  const storeId = cleanSecret(env.WAFFO_STORE_ID)  // ✅ 公开的
  
  // 使用私钥签名生成 token
  const data = await signedPost(
    merchantId,        // 🔒 私密
    importSigningKey(privateKey),  // 🔒 私密
    TOKEN_PATH,
    { storeId, buyerIdentity: subscription.user.id, purpose: 'portal' },
  )
  
  // 返回给前端的 URL 包含 storeId
  return `${data.portalUrl}#token=${data.token}`
  // 例如：https://portal.waffo.ai/STO_xxx#token=xxx
}
```

**分析**：
- ✅ 用户浏览器会看到 `STO_xxx`（店铺 ID）
- ✅ 用户浏览器**看不到** `MER_xxx`（商户 ID）
- ✅ 用户浏览器**看不到**私钥
- ✅ 店铺 ID 暴露了也没关系，因为它只是"地址"

### 场景 2: 创建支付会话

```typescript
// 用户点击"购买积分"
// → 后端创建支付链接

async createCheckout(input: CheckoutInput) {
  // 使用商户 ID 和私钥签名
  const data = await signedPost(
    merchantId,         // 🔒 后端使用，不传给前端
    importSigningKey(privateKey),  // 🔒 后端使用，不传给前端
    SESSION_PATH,
    {
      storeId: products.storeId,  // ✅ 可以包含在请求中
      products: [{ productId: productId, quantity: 1 }],
      // ...
    },
  )
  
  // 返回支付链接给前端
  return data.sessionUrl
  // 例如：https://checkout.waffo.ai/ses_xxx
}
```

**分析**：
- 🔒 商户 ID 和私钥只在后端使用
- ✅ 店铺 ID 包含在 API 请求中（Waffo 知道是哪个店铺）
- ✅ 支付链接传给前端（包含会话 ID）
- ✅ 用户只能看到支付链接，看不到敏感密钥

---

## 🔐 安全模型

### Waffo 的三层安全

```
1. 店铺 ID (STORE_ID)
   └─ 公开的"门牌号"
   └─ 单独知道它 = 只能访问公开信息
   └─ 放在 wrangler.jsonc ✅

2. 商户 ID (MERCHANT_ID)
   └─ 商户身份标识
   └─ 配合私钥才能操作
   └─ 放在 .dev.vars.production 🔒

3. 私钥 (PRIVATE_KEY)
   └─ 签名所有 API 请求
   └─ 泄露 = 攻击者可以完全控制
   └─ 放在 .dev.vars.production 🔒🔒🔒
```

### 类比：实体店铺

```
店铺 ID     = 店铺地址（123 Main St）
           → 任何人都知道，不是秘密
           → 顾客需要知道才能找到店

商户 ID     = 营业执照号码
           → 相对敏感，但单独知道也做不了什么

私钥        = 店铺保险箱钥匙
           → 绝对保密，泄露 = 失去一切控制
```

---

## 📋 配置最佳实践

### ✅ 正确的配置方式

```bash
# .dev.vars.production（保密，不入库）
WAFFO_MERCHANT_ID=MER_xxx        # 🔒 商户身份
WAFFO_PRIVATE_KEY=-----BEGIN...  # 🔒🔒🔒 绝密
SESSION_SECRET=xxx               # 🔒 会话密钥
GOOGLE_CLIENT_SECRET=xxx         # 🔒 OAuth 密钥
```

```jsonc
// wrangler.jsonc（公开，可入库）
{
  "vars": {
    "SITE_URL": "https://tinydeskai.website",     // ✅ 公开
    "WAFFO_STORE_ID": "STO_xxx",                  // ✅ 公开
    "WAFFO_PRODUCTS": "{\"starter\":\"PROD_1\"}", // ✅ 公开
    "GOOGLE_CLIENT_ID": "xxx.apps.googleusercontent.com"  // ✅ 公开
  }
}
```

### ❌ 错误的配置方式

```jsonc
// ❌ 千万不要这样做！
{
  "vars": {
    "WAFFO_MERCHANT_ID": "MER_xxx",      // ❌ 敏感信息不应该放这里
    "WAFFO_PRIVATE_KEY": "-----BEGIN"    // ❌❌❌ 绝对不行！
  }
}
```

**后果**：
- 部署后任何人都能看到你的密钥
- 可能被利用创建虚假订单、退款等

---

## 🎯 总结

### 为什么 WAFFO_STORE_ID 不放在 .dev.vars.production？

1. **安全原因**
   - 店铺 ID 是公开的，不需要保密
   - 泄露了也不会造成安全问题

2. **功能需求**
   - 客户门户需要在前端使用店铺 ID
   - 支付链接中可能包含店铺 ID
   - 用户需要能看到店铺 ID

3. **架构设计**
   - `wrangler.jsonc` 的 `vars` 用于公开配置
   - `.dev.vars.production` 的 secrets 用于敏感密钥
   - 清晰的职责分离

4. **运维便利**
   - 公开配置可以版本控制
   - 方便团队共享和审查
   - 密钥独立管理，更安全

### 记忆口诀

```
公开的 → wrangler.jsonc
  - 店铺 ID (STORE_ID)
  - 产品映射 (PRODUCTS)
  - 网站 URL
  - 环境配置

保密的 → .dev.vars.production
  - 商户 ID (MERCHANT_ID)
  - 私钥 (PRIVATE_KEY)
  - 会话密钥 (SESSION_SECRET)
  - OAuth 密钥 (CLIENT_SECRET)
```

---

## 🔍 验证方法

### 如何确认配置正确？

```bash
# 1. 检查公开配置
cat wrangler.jsonc | grep WAFFO
# 应该看到 STORE_ID 和 PRODUCTS

# 2. 检查私密配置
cat .dev.vars.production | grep WAFFO
# 应该看到 MERCHANT_ID 和 PRIVATE_KEY

# 3. 确认分离正确
# ✅ STORE_ID 只在 wrangler.jsonc
# ✅ MERCHANT_ID 和 PRIVATE_KEY 只在 .dev.vars.production
```

---

**最后更新**: 2026-10-31
