# Waffo 多站点部署策略

## 背景

你有多个热词站，每个站点需要独立的品牌展示，但 Waffo 每个商户都需要审核。

---

## 🎯 推荐策略：分阶段部署

### 第一阶段：主力站点（1-2 个）

**目标**：快速上线，验证商业模式

1. **选择主力站点**
   - `tinydeskai.website`（主站）
   - 可选：一个备用站点

2. **完成 Waffo 审核**
   - 商户名: Tiny Desk AI
   - 提交业务信息
   - 等待审核通过（通常 1-3 个工作日）

3. **配置**
   ```bash
   # tinydeskai.website/.dev.vars.production
   WAFFO_MERCHANT_ID=MER_tinydesk_xxx
   WAFFO_PRIVATE_KEY=xxx
   ```

4. **上线运营**
   - 观察转化率
   - 收集用户反馈
   - 验证支付流程

---

### 第二阶段：扩展站点（3-5 个）

**时机**：主站运营 2-4 周后，确认商业模式可行

1. **批量准备资料**
   
   为每个新站点准备：
   - 站点名称和域名
   - Logo 和品牌素材
   - 产品描述

2. **同时提交审核**
   
   在 Waffo 后台一次性创建 3-5 个商户：
   ```
   站点 B: BandReel（乐队视频生成）
   站点 C: SoloClip（个人视频生成）
   站点 D: DuoVid（双人视频生成）
   ...
   ```

   **技巧**：
   - 使用同一主体信息（省时间）
   - 在备注中说明是系列产品
   - 提供主站的运营数据（增加信任）

3. **并行审核**
   
   审核期间（1-3 天）：
   - 同步准备代码和配置
   - 测试支付流程
   - 准备营销素材

4. **批量上线**
   
   审核通过后，一次性部署所有站点。

---

### 第三阶段：长尾站点

**按需创建**：根据市场反馈，逐步增加新站点

---

## 📋 审核准备清单

### 主体信息（所有商户共用）

- [ ] 营业执照扫描件（或个人身份证）
- [ ] 银行账户信息
- [ ] 联系人姓名、手机、邮箱
- [ ] 经营地址

### 每个站点独立准备

- [ ] 商户名称（与站点品牌一致）
- [ ] 站点域名
- [ ] Logo（建议 512x512px）
- [ ] 业务描述（100-200 字）
- [ ] 产品类别（数字内容/SaaS）
- [ ] 客服联系方式

---

## ⏱️ 时间规划

### 保守估计

```
Week 1: 主站审核 + 上线
Week 2-3: 主站运营，收集数据
Week 4: 批量提交 3-5 个站点审核
Week 5: 批量上线新站点
```

### 激进方案

```
Day 1: 同时提交 5-7 个商户审核
Day 3-5: 审核通过
Day 6: 批量上线
```

**风险**：
- 如果某个商户审核失败，需要重新提交
- 管理多个后台比较复杂

---

## 💰 成本对比

### 方案 A：共用商户

```
审核次数: 1
审核时间: 3 天
管理成本: 低
用户体验: ⭐⭐⭐ (商户名不匹配)
```

### 方案 B：独立商户

```
审核次数: N（站点数量）
审核时间: 3 天（可并行）
管理成本: 中
用户体验: ⭐⭐⭐⭐⭐ (完美)
```

### 方案 C：分阶段部署

```
第一批审核: 1-2 个
第二批审核: 3-5 个（并行）
审核时间: 总共 1-2 周
管理成本: 中
用户体验: ⭐⭐⭐⭐⭐
风险控制: ⭐⭐⭐⭐⭐ (先验证再扩展)
```

---

## 🔧 技术实现

### 配置管理脚本

创建批量配置工具：

```bash
# scripts/setup-waffo-site.mjs
# 用法: node scripts/setup-waffo-site.mjs --site tinydeskai --merchant MER_xxx

#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'

const site = process.argv[3]
const merchantId = process.argv[5]

// 自动更新 .dev.vars.production
let vars = readFileSync('.dev.vars.production', 'utf8')
vars = vars.replace(/WAFFO_MERCHANT_ID=.*/, `WAFFO_MERCHANT_ID=${merchantId}`)
writeFileSync('.dev.vars.production', vars)

console.log(`✅ ${site} 已配置 Waffo 商户: ${merchantId}`)
```

### 批量部署脚本

```bash
# scripts/batch-deploy-sites.sh

SITES=(
  "tinydeskai:MER_td_xxx"
  "bandreel:MER_br_xxx"
  "soloclip:MER_sc_xxx"
)

for entry in "${SITES[@]}"; do
  IFS=':' read -r site merchant <<< "$entry"
  cd ~/projects/${site}.website
  node scripts/setup-waffo-site.mjs --site $site --merchant $merchant
  npm run deploy
done
```

---

## 📊 监控和管理

### 统一看板

创建内部管理工具，汇总所有站点数据：

```typescript
// admin-dashboard/sites.ts
const SITES = [
  { 
    name: 'TinyDesk',
    domain: 'tinydeskai.website',
    waffoMerchantId: 'MER_td_xxx',
    waffoDashboard: 'https://waffo.ai/dashboard/mer_td_xxx'
  },
  { 
    name: 'BandReel',
    domain: 'bandreel.com',
    waffoMerchantId: 'MER_br_xxx',
    waffoDashboard: 'https://waffo.ai/dashboard/mer_br_xxx'
  },
]

// 汇总所有站点的收入数据
async function aggregateRevenue() {
  const results = await Promise.all(
    SITES.map(site => fetch(`https://${site.domain}/api/admin/stats`))
  )
  return results.map(r => r.json())
}
```

---

## ✅ 决策建议

### 如果你的情况是...

#### 1. 只有 2-3 个站点
**推荐**：独立商户，一次性提交审核
- 审核成本可控
- 用户体验最好
- 管理复杂度低

#### 2. 有 5-10 个站点
**推荐**：分阶段部署
- 第一批：1-2 个主力站点
- 第二批：3-5 个扩展站点
- 按需添加长尾站点

#### 3. 超过 10 个站点
**推荐**：
- 考虑使用 Stripe（一个账户支持所有站点）
- 或使用方案 A（共用商户 + 中性商户名）
- 或混合方案（主力站点独立商户，长尾站点共用）

---

## 🎯 立即行动方案

### 今天/本周

1. **主站上线**
   ```bash
   # 1. 完成 Waffo 审核（tinydeskai.website）
   # 2. 配置密钥
   # 3. 部署上线
   npm run deploy
   ```

2. **准备扩展站点资料**
   - 列出所有计划站点
   - 准备品牌素材（Logo、描述）
   - 规划商户命名

### 下周

3. **批量提交审核**
   - 一次性提交 3-5 个商户申请
   - 使用相同主体信息
   - 在备注中说明是系列产品

4. **并行开发**
   - 审核期间完善代码
   - 准备配置文件模板
   - 测试部署流程

### 下下周

5. **批量上线**
   - 审核通过后批量部署
   - 监控支付流程
   - 收集用户反馈

---

**最后更新**: 2026-10-31
