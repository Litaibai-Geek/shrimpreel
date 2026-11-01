# 密码注册登录实现指南

## 概述

本指南介绍如何启用简化的邮箱密码注册登录系统，不发送验证码邮件，通过 Turnstile 人机验证和 IP 限制防止滥用。

## 功能特点

### ✅ 优势
- **无需邮件服务** - 节省运维成本，无需配置 Resend 或 Cloudflare Email Service
- **用户体验简单** - 类似传统网站的注册登录流程
- **IP 限制防刷** - 一个 IP 地址只能注册一个账号
- **Turnstile 防机器人** - 免费且有效的人机验证
- **密码加密安全** - PBKDF2 + SHA-256，10万次迭代

### ⚠️ 限制
- **IP 限制可能误伤** - 学校、公司等共享 IP 环境下可能影响正常注册
- **无密码找回功能** - 用户忘记密码需要联系客服或使用 Google 登录
- **依赖 Turnstile** - 需要 Cloudflare Turnstile 服务

### 💡 建议
- 保留 Google 登录作为备选方式
- 在登录页面提示用户可使用 Google 登录
- IP 限制错误提示中告知用户可联系客服或使用 Google 登录

---

## 部署步骤

### 1. 应用数据库迁移

```bash
# 本地测试
npm run db:migrate:local

# 生产环境
npm run db:migrate:remote
```

**迁移内容**：
- 添加 `users.password_hash` 列
- 创建 `ip_registrations` 表

### 2. 配置 Turnstile

#### 在 Cloudflare Dashboard 创建 Turnstile Site

1. 访问 https://dash.cloudflare.com/
2. 选择账号 → Turnstile
3. 点击 "Add site"
4. 填写：
   - **Site name**: Tiny Desk AI
   - **Domain**: tinydeskai.website
   - **Widget mode**: Managed (推荐)
5. 复制 **Site Key** 和 **Secret Key**

#### 更新配置文件

**wrangler.jsonc**:
```json
{
  "vars": {
    "EMAIL_LOGIN_ENABLED": "false",  // 关闭邮件验证码
    "TURNSTILE_SITE_KEY": "你的站点密钥"
  }
}
```

**同步 Secret**:
```bash
# 添加到 .dev.vars.production
echo "TURNSTILE_SECRET_KEY=你的服务端密钥" >> .dev.vars.production

# 同步到 Worker
node scripts/sync-secrets.mjs --apply
```

### 3. 更新 site.setup.json

```json
{
  "email": {
    "from": "",  // 留空表示不发邮件
    "loginEnabled": false  // 使用密码模式
  },
  "platforms": {
    "cloudflare": {
      "turnstile": true,  // 启用 Turnstile
      "analytics": false
    }
  }
}
```

### 4. 运行初始化（可选）

如果使用自动化脚本：

```bash
npm run setup -- --plan  # 先查看计划
npm run setup -- --apply  # 执行初始化
```

### 5. 本地测试

```bash
# 启动开发服务器
npm run dev -- --host 127.0.0.1

# 访问 http://127.0.0.1:3000/sign-in
# 测试注册和登录流程
```

### 6. 部署到生产环境

```bash
# 类型检查
npm run typecheck

# 运行测试
npm test

# 部署前体检
npm run doctor

# 部署
npm run deploy
```

---

## 工作流程

### 注册流程

```
1. 用户访问 /sign-in
2. 点击"注册"标签
3. 输入姓名（可选）、邮箱、密码、确认密码
4. 完成 Turnstile 人机验证
5. 提交注册表单
   ↓
6. 后端校验：
   - 密码长度 ≥ 8 字符
   - 邮箱格式正确
   - 邮箱未被注册
   - IP 未注册过其他账号
   - Turnstile token 有效
   ↓
7. 创建账号：
   - 密码哈希（PBKDF2, 10万次迭代）
   - 记录 IP 哈希
   - 发放注册赠送积分（如果有）
   ↓
8. 自动登录
9. 跳转到个人中心
```

### 登录流程

```
1. 用户访问 /sign-in
2. 输入邮箱和密码
3. 提交登录表单
   ↓
4. 后端校验：
   - 查询用户
   - 验证密码哈希
   - 检查账号状态
   ↓
5. 创建会话
6. 跳转到个人中心
```

---

## 安全机制详解

### 1. 密码加密

```typescript
// 使用 PBKDF2 + SHA-256
- 随机盐（每个密码独立的 16 字节盐）
- 10万次迭代（防止暴力破解）
- 256 位输出
- 存储格式：salt:hash（十六进制）
```

**示例**：
```
原始密码: MySecurePassword123
存储格式: a1b2c3d4e5f6...1234:9876543210fedcba...
          ^^^^^^^^^^^^^^      ^^^^^^^^^^^^^^^^^^
             盐（32 字符）        哈希（64 字符）
```

### 2. IP 限制

```typescript
// IP 地址加盐哈希
- 盐：SESSION_SECRET
- 算法：SHA-256
- 一个 IP 只能注册一个账号
```

**优点**：
- 防止批量注册
- IP 地址不以明文存储

**限制**：
- 学校、公司等共享 IP 环境受影响
- 动态 IP 用户可能绕过

### 3. Turnstile 验证

```typescript
// 每次注册都需要通过人机验证
- 注册时必需
- 登录时可选（当前未启用）
- 防止自动化脚本注册
```

### 4. 速率限制

```typescript
// 使用 Cloudflare Rate Limiting
- 注册：按 IP 限流（AUTH_LIMITER）
- 登录：按 IP 限流
- 防止暴力破解
```

---

## API 接口

### 注册接口

**POST** `/api/auth/password/register`

**请求体**：
```json
{
  "name": "张三",  // 可选
  "email": "zhangsan@example.com",
  "password": "MySecurePassword123",
  "locale": "zh",
  "turnstileToken": "xxx"  // Turnstile 验证 token
}
```

**成功响应** (200):
```json
{
  "user": {
    "id": "usr_xxx",
    "email": "zhangsan@example.com",
    "name": "张三",
    "credits": 10,  // 注册赠送积分
    "role": "user"
  }
}
```

**错误响应**：
- `400 invalid_email` - 邮箱格式错误
- `400 password_too_short` - 密码少于 8 个字符
- `403 admin_cannot_register` - 管理员邮箱不能通过密码注册
- `409 email_already_exists` - 邮箱已被注册
- `429 ip_already_registered` - IP 已注册过账号
- `429 rate_limited` - 请求过于频繁

### 登录接口

**POST** `/api/auth/password/signin`

**请求体**：
```json
{
  "email": "zhangsan@example.com",
  "password": "MySecurePassword123",
  "locale": "zh"  // 可选
}
```

**成功响应** (200):
```json
{
  "user": {
    "id": "usr_xxx",
    "email": "zhangsan@example.com",
    "name": "张三",
    "credits": 15,
    "role": "user"
  }
}
```

**错误响应**：
- `400 invalid_email` - 邮箱格式错误
- `400 invalid_password` - 密码无效
- `401 invalid_credentials` - 邮箱或密码错误
- `403 account_disabled` - 账号已被停用
- `429 rate_limited` - 请求过于频繁

---

## 用户界面

### 登录页面

**路径**: `/sign-in` 或 `/zh/sign-in`

**功能**：
1. **Google 登录**（如果配置）
   - "使用 Google 继续" 按钮
2. **分隔线**
   - "或使用以下方式继续"
3. **邮箱密码表单**
   - 默认显示登录表单
   - 可切换到注册表单
4. **开发登录**（仅本地）

### 注册表单字段

```
┌─────────────────────────────────┐
│ 姓名                            │
│ [输入您的姓名（可选）]          │
├─────────────────────────────────┤
│ 邮箱 *                          │
│ [输入您的邮箱]                  │
├─────────────────────────────────┤
│ 密码 *                          │
│ [至少 8 个字符]                 │
├─────────────────────────────────┤
│ 确认密码 *                      │
│ [再次输入密码]                  │
├─────────────────────────────────┤
│ [Turnstile 人机验证]            │
├─────────────────────────────────┤
│        [ 注 册 ]                │
└─────────────────────────────────┘
已有账号？ 登录
```

### 登录表单字段

```
┌─────────────────────────────────┐
│ 邮箱 *                          │
│ [输入您的邮箱]                  │
├─────────────────────────────────┤
│ 密码 *                          │
│ [输入您的密码]                  │
├─────────────────────────────────┤
│        [ 登 录 ]                │
└─────────────────────────────────┘
还没有账号？ 注册
```

---

## 测试清单

### 手动测试

#### ✅ 注册流程
- [ ] 使用新邮箱成功注册
- [ ] 密码少于 8 字符被拒绝
- [ ] 重复邮箱注册被拒绝
- [ ] 未完成 Turnstile 无法提交
- [ ] 同一 IP 第二次注册被拒绝
- [ ] 注册成功后自动登录
- [ ] 注册赠送积分正确发放

#### ✅ 登录流程
- [ ] 正确的邮箱和密码可以登录
- [ ] 错误的密码被拒绝
- [ ] 不存在的邮箱被拒绝
- [ ] 登录成功后跳转到个人中心

#### ✅ 安全测试
- [ ] 密码在数据库中是哈希存储
- [ ] IP 地址不以明文存储
- [ ] 管理员邮箱无法通过密码注册
- [ ] 封禁账号无法登录

#### ✅ 界面测试
- [ ] 注册/登录表单切换正常
- [ ] 错误提示显示正确
- [ ] Google 登录按钮显示（如果配置）
- [ ] 中英文文案正确

### E2E 测试用例

```typescript
// tests/e2e/password-auth.spec.ts
test('完整注册流程', async ({ page }) => {
  // 访问登录页
  await page.goto('/sign-in')
  
  // 切换到注册
  await page.click('text=注册')
  
  // 填写表单
  await page.fill('[placeholder="输入您的姓名（可选）"]', '测试用户')
  await page.fill('[placeholder="输入您的邮箱"]', 'test@example.com')
  await page.fill('[placeholder="至少 8 个字符"]', 'TestPass123')
  await page.fill('[placeholder="再次输入密码"]', 'TestPass123')
  
  // 等待 Turnstile 加载并自动验证（测试环境）
  
  // 提交
  await page.click('button:has-text("注册")')
  
  // 验证跳转到个人中心
  await expect(page).toHaveURL(/\/dashboard/)
})
```

---

## 常见问题

### Q1: 用户忘记密码怎么办？

**A**: 当前系统没有密码找回功能，建议：
1. 引导用户使用 Google 登录
2. 或联系客服手动重置

**未来可实现**：
- 通过邮件发送重置链接（需要邮件服务）
- 通过安全问题验证

### Q2: IP 限制会误伤正常用户吗？

**A**: 可能会，特别是：
- 学校、公司等共享 IP 环境
- 公共 WiFi

**解决方案**：
1. 错误提示中说明可使用 Google 登录
2. 提供客服联系方式手动处理
3. 未来可考虑：
   - IP + User Agent 组合判断
   - 设置时间窗口（如 24 小时内限制）
   - 管理员可手动解除限制

### Q3: 密码强度要求是什么？

**A**: 当前要求：
- 最少 8 个字符
- 最多 128 个字符
- 无其他特殊字符要求

**建议未来增强**：
- 要求至少包含数字
- 要求至少包含大小写字母
- 显示密码强度指示器

### Q4: 如何迁移现有 Google 用户？

**A**: 不需要迁移。两种登录方式可以共存：
- Google 用户继续用 Google 登录
- 新用户可以选择邮箱密码注册
- 同一邮箱不能既有 Google 登录又有密码登录

### Q5: 可以同时启用验证码和密码模式吗？

**A**: 不建议。两种模式是互斥的：
- `EMAIL_LOGIN_ENABLED=false` → 密码模式
- `EMAIL_LOGIN_ENABLED=true` → 验证码模式

### Q6: 如何关闭密码模式改回验证码模式？

**A**: 
1. 配置邮件服务（Resend 或 Email Service）
2. 更新 `wrangler.jsonc`: `EMAIL_LOGIN_ENABLED="true"`
3. 运行 `npm run setup -- --apply --email-login-tested`
4. 重新部署

**已有密码用户**：
- 仍可使用密码登录
- 或使用 Google 登录

---

## 维护与监控

### 数据库清理

**ip_registrations 表**：
- 随着用户增长会持续增长
- 建议定期清理已注销用户的记录
- 或设置保留期（如 90 天）

```sql
-- 清理已注销用户的 IP 记录
DELETE FROM ip_registrations 
WHERE user_id IN (SELECT id FROM users WHERE status = 'deleted');
```

### 监控指标

建议监控：
1. **注册失败率**
   - IP 限制拒绝数
   - 密码强度不符合数
2. **登录失败率**
   - 密码错误次数
   - 账号不存在次数
3. **Turnstile 通过率**
   - 验证失败数

### 日志记录

当前系统已记录：
- 注册成功/失败（包含原因）
- 登录成功/失败
- IP 限制拒绝
- 管理员操作

---

## 文件清单

本次实现创建/修改的文件：

### 新增文件
1. `migrations/0017_password_auth.sql` - 数据库迁移
2. `src/server/password-auth.ts` - 密码认证逻辑
3. `src/components/PasswordAuthForm.tsx` - 注册登录表单组件
4. `docs/password-auth-guide.md` - 本文档

### 修改文件
1. `src/server/app.ts` - 添加 API 路由
2. `src/routes/{-$locale}/sign-in.tsx` - 更新登录页面
3. `src/content/en.ts` - 英文文案
4. `src/content/zh.ts` - 中文文案
5. `src/server/types.ts` - 类型定义

---

## 技术细节

### 密码哈希实现

```typescript
// src/server/password-auth.ts
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const encoder = new TextEncoder()
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  
  const hash = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,  // 10万次迭代
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  )
  
  // 返回格式：salt:hash
  return `${toHex(salt)}:${toHex(hash)}`
}
```

### IP 哈希实现

```typescript
export async function hashIp(env: Env, ip: string): Promise<string> {
  const secret = env.SESSION_SECRET ?? 'default-salt'
  return sha256Hex(`ip-registration:${secret}:${ip}`)
}
```

---

## 未来改进

### 短期（P1）
- [ ] 添加密码找回功能（需要邮件服务）
- [ ] 密码强度要求增强
- [ ] 密码强度指示器
- [ ] IP 限制优化（时间窗口、User Agent 组合）

### 中期（P2）
- [ ] 两步验证（2FA）
- [ ] 记住登录设备
- [ ] 登录历史记录
- [ ] 可疑登录提醒

### 长期（P3）
- [ ] 社交登录（GitHub、Twitter 等）
- [ ] 生物识别登录（WebAuthn）
- [ ] 单点登录（SSO）

---

## 参考资料

- [PBKDF2 规范](https://tools.ietf.org/html/rfc2898)
- [OWASP 密码存储指南](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Cloudflare Turnstile 文档](https://developers.cloudflare.com/turnstile/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

---

## 联系支持

如有问题或需要帮助，请联系：
- 邮箱：support@tinydeskai.website
- GitHub Issues: https://github.com/qianshuixia/shrimpreel/issues

---

**最后更新**: 2026-10-31
