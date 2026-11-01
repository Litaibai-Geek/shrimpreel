# SEO 上线检查清单

## 🔴 紧急（影响收录）

### 1. Google Search Console 验证
1. 访问 https://search.google.com/search-console
2. 添加属性 `https://tinydeskai.website`
3. 选择"HTML 标记"验证方式，复制 `content` 值
4. 更新 `src/config/site.ts` 的 `seo.googleVerification`
5. 部署后在 Search Console 点击"验证"

### 2. Bing Webmaster Tools 验证
1. 访问 https://www.bing.com/webmasters
2. 添加站点 `https://tinydeskai.website`
3. 选择"HTML 标记"验证，复制 `content` 值
4. 更新 `src/config/site.ts` 的 `seo.bingVerification`
5. 部署后验证

### 3. 提交 Sitemap
- Google Search Console: 提交 `https://tinydeskai.website/sitemap.xml`
- Bing Webmaster: 提交 `https://tinydeskai.website/sitemap.xml`

### 4. IndexNow 快速索引（可选但推荐）
```bash
# 1. 生成 IndexNow key（32位随机字符串）
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# 2. 更新 src/config/site.ts
seo.indexNowKey = '<生成的key>'

# 3. 部署后提交URL
npm run seo:indexnow
```

---

## 🟡 重要（提升 SEO）

### 5. 社交媒体链接
更新 `src/config/site.ts` 的 `seo.sameAs`:
```typescript
sameAs: [
  'https://twitter.com/your_brand',
  'https://www.facebook.com/your_brand',
  // 添加实际的社交媒体主页
]
```

### 6. 检查网站是否可被抓取
```bash
# 检查 robots.txt
curl https://tinydeskai.website/robots.txt

# 检查 sitemap.xml
curl https://tinydeskai.website/sitemap.xml

# 检查首页
curl -I https://tinydeskai.website/
```

### 7. 统计分析配置
当前未配置任何统计工具 ([src/config/site.ts:216-219](src/config/site.ts#L216-L219)):
```typescript
analytics: {
  ga4Id: '',           // Google Analytics 4
  cfBeaconToken: '',   // Cloudflare Web Analytics（推荐）
  umamiWebsiteId: '',  // Umami（可选）
}
```

**推荐配置 Cloudflare Web Analytics**（无需 Cookie 横幅）:
1. 访问 Cloudflare Dashboard → Analytics & Logs → Web Analytics
2. 添加站点 `tinydeskai.website`
3. 复制 Beacon Token
4. 更新 `cfBeaconToken` 并部署

---

## 🟢 优化建议

### 8. 检查页面性能
- Lighthouse 测试: https://pagespeed.web.dev/
- 测试 URL: `https://tinydeskai.website/`

### 9. 验证结构化数据
- Google Rich Results Test: https://search.google.com/test/rich-results
- Schema Markup Validator: https://validator.schema.org/

### 10. 检查移动端适配
- Google Mobile-Friendly Test: https://search.google.com/test/mobile-friendly

### 11. SSL/HTTPS 检查
```bash
# 确认 SSL 证书有效
curl -vI https://tinydeskai.website/ 2>&1 | grep -i "SSL\|certificate"
```

---

## 📊 当前配置状态

根据代码分析：

| 项目 | 状态 | 说明 |
|------|------|------|
| APP_ENV | ✅ production | 允许搜索引擎抓取 |
| 域名 | ✅ tinydeskai.website | 已配置 |
| Sitemap | ✅ 已实现 | 动态生成 |
| Robots.txt | ✅ 已实现 | 正确配置 |
| WWW重定向 | ✅ 已配置 | 301跳转 |
| 多语言 | ✅ en, zh | 支持 |
| Google验证 | ❌ 未配置 | 需要添加 |
| Bing验证 | ❌ 未配置 | 需要添加 |
| IndexNow | ❌ 未配置 | 可选 |
| 统计工具 | ❌ 未配置 | 推荐 CF Analytics |
| 社交链接 | ❌ 未配置 | 可选 |

---

## 🚨 关键缺失（需修复）

根据 `npm run doctor` 输出：

```
✗ GOOGLE_CLIENT_SECRET  缺少密钥
✗ SESSION_SECRET  缺少密钥
✗ KIE_API_KEY  缺少密钥（视频生成）
✗ TURNSTILE_SECRET_KEY  缺少密钥
```

**这些密钥缺失会导致网站功能不可用！**

修复方法：
```bash
# 设置密钥
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put SESSION_SECRET
wrangler secret put KIE_API_KEY
wrangler secret put TURNSTILE_SECRET_KEY

# 或使用批量同步脚本
node scripts/sync-secrets.mjs
```

---

## 📝 快速检查命令

```bash
# 1. 运行健康检查
npm run doctor

# 2. 检查 SEO 关键词覆盖
npm run seo:check

# 3. 访问关键页面
curl -I https://tinydeskai.website/
curl https://tinydeskai.website/robots.txt
curl https://tinydeskai.website/sitemap.xml

# 4. 部署后提交索引（配置 indexNowKey 后）
npm run seo:indexnow
```
