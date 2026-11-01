# 密码认证设置清单

本文档提供密码认证功能的完整设置步骤和检查清单。

---

## 📋 设置清单

### ✅ 步骤 1：创建 Turnstile 站点

1. 访问 Cloudflare Dashboard: https://dash.cloudflare.com/
2. 选择你的账号 → 左侧菜单找到 **Turnstile**
3. 点击右上角 **"手动添加小组件"** 或 **"使用 Spin 设置"**
4. 填写表单：

| 字段 | 填写内容 |
|-----|---------|
| **小组件名称** | `TinyDesk AI` 或你的站点名 |
| **域名** | `tinydeskai.website`（生产域名）<br>`localhost`（本地测试）<br>`127.0.0.1`（本地测试） |
| **小组件模式** | **托管** (Managed) - 推荐 |
| **预先检查** | 关闭（默认） |

5. 点击 **"创建"** 或 **"添加"**
6. 复制显示的两个密钥：
   ```
   站点密钥 (Site Key): 0x4AAAAAACMrBdso08GCztaH
   服务端密钥 (Secret Key): 0x4AAAAAACMrBa...[点击显示]
   ```

**⚠️ 重要**: 保存好这两个密钥，特别是服务端密钥只显示一次！

---

### ✅ 步骤 2：配置项目文件

#### 2.1 更新 `wrangler.jsonc`

找到第 38-40 行，修改：

```jsonc
// 修改前：
"EMAIL_LOGIN_ENABLED": "false",
"TURNSTILE_SITE_KEY": "",

// 修改后：
"EMAIL_LOGIN_ENABLED": "false",
"TURNSTILE_SITE_KEY": "0x4AAAAAACMrBdso08GCztaH",  // 👈 粘贴你的站点密钥
```

#### 2.2 更新 `.dev.vars.production`

找到第 24 行，修改：

```bash
# 修改前：
TURNSTILE_SECRET_KEY=

# 修改后：
TURNSTILE_SECRET_KEY=0x4AAAAAACMrBa...完整的服务端密钥  # 👈 粘贴你的服务端密钥
```

#### 2.3 创建本地配置 `.dev.vars`（如果还没有）

```bash
cp .dev.vars.production .dev.vars
```

然后在 `.dev.vars` 中也填入同样的 `TURNSTILE_SECRET_KEY`。

---

### ✅ 步骤 3：应用数据库迁移

#### 3.1 本地数据库

```bash
npm run db:migrate:local
```

**预期输出**：
```
✔ Applying migration 0017_password_auth.sql
  - ALTER TABLE users ADD COLUMN password_hash TEXT
  - CREATE TABLE ip_registrations...
✔ Migration complete
```

#### 3.2 生产数据库

```bash
npm run db:migrate:remote
```

**⚠️ 注意**: 这会修改生产数据库，确保你有备份或在测试环境先试过。

---

### ✅ 步骤 4：同步密钥到 Cloudflare Worker

```bash
node scripts/sync-secrets.mjs --plan
```

**检查输出**，应该会显示需要同步 `TURNSTILE_SECRET_KEY`。

确认无误后执行：

```bash
node scripts/sync-secrets.mjs --apply
```

---

### ✅ 步骤 5：更新 `site.setup.json`（可选）

如果你用自动化脚本初始化，需要更新这个文件：

```json
{
  "email": {
    "from": "",  // 留空 = 不发邮件
    "loginEnabled": false  // 使用密码模式，不使用验证码
  },
  "platforms": {
    "cloudflare": {
      "turnstile": true,  // 启用 Turnstile
      "analytics": false
    },
    "google": {
      "oauth": true  // 保留 Google 登录作为备选
    }
  }
}
```

---

### ✅ 步骤 6：本地测试

#### 6.1 启动开发服务器

```bash
npm run dev
```

#### 6.2 访问登录页面

打开浏览器访问：
```
http://localhost:3000/sign-in
```

或中文版：
```
http://localhost:3000/zh/sign-in
```

#### 6.3 测试注册流程

1. 点击 **"注册"** 标签
2. 填写表单：
   - 姓名（可选）：测试用户
   - 邮箱：test@example.com
   - 密码：Test1234
   - 确认密码：Test1234
3. 等待 Turnstile 验证框出现并自动验证
4. 点击 **"注册"** 按钮
5. 应该自动跳转到个人中心

#### 6.4 测试登录流程

1. 退出登录
2. 回到 `/sign-in` 页面
3. 输入刚才注册的邮箱和密码
4. 点击 **"登录"** 按钮
5. 应该成功登录

#### 6.5 测试 IP 限制

1. 退出登录
2. 尝试用另一个邮箱注册（如 test2@example.com）
3. 应该看到错误提示：
   ```
   此 IP 地址已注册过账号。请使用 Google 登录或联系客服。
   ```

---

### ✅ 步骤 7：运行测试套件

```bash
# 类型检查
npm run typecheck

# 单元测试
npm test

# E2E 测试（需要先 seed 数据）
npm run seed:local
npm run test:e2e
```

**预期结果**: 所有测试通过 ✅

---

### ✅ 步骤 8：部署到生产环境

#### 8.1 体检

```bash
npm run doctor
```

**检查输出**，确保：
- ✅ 所有必需的环境变量已配置
- ✅ 数据库迁移已应用
- ✅ 没有 TODO(site) 遗留

#### 8.2 部署

```bash
npm run deploy
```

#### 8.3 验证生产环境

访问你的生产域名：
```
https://tinydeskai.website/sign-in
```

测试注册和登录流程。

---

## 🔍 验证清单

部署完成后，检查以下项目：

### 功能验证

- [ ] 访问 `/sign-in` 页面正常显示
- [ ] **注册表单**显示：姓名、邮箱、密码、确认密码字段
- [ ] **登录表单**显示：邮箱、密码字段
- [ ] Turnstile 验证框正常加载
- [ ] 密码少于 8 字符提示错误
- [ ] 密码不匹配提示错误
- [ ] 新邮箱可以成功注册
- [ ] 重复邮箱注册被拒绝
- [ ] 同一 IP 第二次注册被拒绝
- [ ] 注册成功后自动登录
- [ ] 注册赠送积分正确发放
- [ ] 正确的密码可以登录
- [ ] 错误的密码被拒绝
- [ ] Google 登录仍然可用

### 安全验证

- [ ] 密码在数据库中以哈希存储（不是明文）
- [ ] IP 地址不以明文存储在 `ip_registrations` 表
- [ ] 管理员邮箱无法通过密码注册
- [ ] 封禁账号无法登录
- [ ] API 有速率限制保护

### 界面验证

- [ ] 中文界面文案正确
- [ ] 英文界面文案正确
- [ ] 注册/登录表单切换流畅
- [ ] 错误提示清晰易懂
- [ ] 移动端显示正常

---

## 🐛 常见问题排查

### 问题 1: Turnstile 验证框不显示

**可能原因**：
- `TURNSTILE_SITE_KEY` 未配置或配置错误
- 域名不在 Turnstile 白名单中

**解决方案**：
1. 检查 `wrangler.jsonc` 中的 `TURNSTILE_SITE_KEY`
2. 检查 Cloudflare Dashboard 中 Turnstile 的域名设置
3. 确保 `localhost` 和 `127.0.0.1` 都在白名单中

### 问题 2: 注册时提示 "Turnstile 验证失败"

**可能原因**：
- `TURNSTILE_SECRET_KEY` 未配置或配置错误
- 站点密钥和服务端密钥不匹配

**解决方案**：
1. 检查 `.dev.vars` 中的 `TURNSTILE_SECRET_KEY`
2. 确保站点密钥和服务端密钥来自同一个 Turnstile 站点
3. 重新运行 `node scripts/sync-secrets.mjs --apply`

### 问题 3: 数据库错误 "no such column: password_hash"

**可能原因**：
- 数据库迁移未应用

**解决方案**：
```bash
npm run db:migrate:local   # 本地
npm run db:migrate:remote  # 生产
```

### 问题 4: IP 限制误伤正常用户

**现象**：
- 学校、公司等共享 IP 环境下，第二个用户无法注册

**临时解决方案**：
1. 引导用户使用 Google 登录
2. 或联系客服手动处理

**长期优化**：
- 参考 `docs/password-auth-guide.md` 的未来改进部分
- 考虑 IP + User Agent 组合判断
- 或设置时间窗口限制

### 问题 5: 开发登录入口消失了

**预期行为**：
- 生产环境（`APP_ENV=production`）不应该显示开发登录
- 本地开发（`npm run dev`）才显示

**解决方案**：
- 这是正常的安全机制，不需要修复

---

## 📊 监控指标

部署后建议监控以下指标：

### 注册指标
- 注册成功数
- 注册失败数（按原因分类）
  - IP 限制拒绝
  - 邮箱重复
  - 密码强度不足
  - Turnstile 验证失败

### 登录指标
- 登录成功数
- 登录失败数
  - 密码错误
  - 账号不存在
  - 账号被封禁

### 安全指标
- 异常 IP 注册尝试（短时间内多次失败）
- 暴力破解尝试（同一账号多次密码错误）

---

## 📚 相关文档

- [密码认证完整指南](./password-auth-guide.md) - 功能详解、API 文档、安全机制
- [环境变量文档](./env.md) - 所有环境变量说明
- [部署文档](./bootstrap-v2.md) - 自动化部署流程

---

## 🎯 下一步

设置完成后，你可以：

1. **添加测试**：
   - 单元测试：`tests/unit/password-auth.test.ts`
   - E2E 测试：`tests/e2e/password-auth.spec.ts`

2. **优化体验**：
   - 添加密码强度指示器
   - 添加"记住我"功能
   - 添加密码找回流程

3. **增强安全**：
   - 实现两步验证（2FA）
   - 登录历史记录
   - 可疑登录提醒

4. **收集反馈**：
   - 观察用户注册/登录行为
   - 收集 IP 限制误伤案例
   - 根据反馈调整策略

---

**最后更新**: 2026-10-31
