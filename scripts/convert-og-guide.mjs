#!/usr/bin/env node
/**
 * OG 图片转换指南
 * 将 public/og.svg 转换为 public/og.png (1200x630)
 */

console.log(`
📋 Logo 和 Icon 已生成！

✅ 已完成的文件：
1. public/favicon.svg - 网站图标（橙红渐变 + 播放符号）
2. public/og.svg - 社交分享图源文件

🔄 需要转换的文件：
需要将 og.svg 转换为 og.png (1200x630)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

方案 1: 在线转换工具（推荐，最简单）

1️⃣ 打开以下任一在线工具：
   • https://cloudconvert.com/svg-to-png
   • https://svgtopng.com/
   • https://convertio.co/svg-png/

2️⃣ 上传文件：public/og.svg

3️⃣ 设置尺寸：
   - 宽度: 1200px
   - 高度: 630px
   - 质量: 最高/100%

4️⃣ 下载并替换：
   将下载的 PNG 文件重命名为 og.png
   覆盖 public/og.png

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

方案 2: 使用 Chrome 浏览器

1️⃣ 在 Chrome 中打开 file:///${process.cwd()}/public/og.svg

2️⃣ 右键点击 → "检查"，在控制台输入：
   const canvas = document.createElement('canvas');
   canvas.width = 1200;
   canvas.height = 630;
   const ctx = canvas.getContext('2d');
   const img = new Image();
   img.onload = function() {
     ctx.drawImage(img, 0, 0, 1200, 630);
     canvas.toBlob(blob => {
       const url = URL.createObjectURL(blob);
       const a = document.createElement('a');
       a.href = url;
       a.download = 'og.png';
       a.click();
     }, 'image/png');
   };
   img.src = 'data:image/svg+xml;base64,' + btoa(document.documentElement.outerHTML);

3️⃣ 按回车，浏览器会自动下载 og.png

4️⃣ 将下载的文件移动到 public/ 目录

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

方案 3: 使用 ImageMagick（如已安装）

在项目根目录运行：

magick public/og.svg -resize 1200x630 public/og.png

或者（旧版本）：

convert public/og.svg -resize 1200x630 public/og.png

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

方案 4: 使用 Node.js + Sharp（如需批量处理）

npm install sharp

然后运行：

const sharp = require('sharp');
sharp('public/og.svg')
  .resize(1200, 630)
  .png()
  .toFile('public/og.png');

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎨 设计说明：

Favicon (favicon.svg)
├─ 橙红渐变背景 (#e34a32 → #f05a3c)
├─ 白色播放三角形
├─ 14px 圆角
└─ 简洁现代

OG Image (og.svg → og.png)
├─ 浅灰渐变背景 (#ecedee → #f4f5f5)
├─ 左上角 Logo（橙红渐变 + 播放符号）
├─ 品牌名 "Tiny Desk AI"
├─ 主标题 "Transform Your Photos into Viral Videos"
│  └─ "Viral Videos" 使用橙红色强调
├─ 副标题 "AI-powered video generation in seconds"
└─ 右侧装饰卡片（视频预览界面设计）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 转换完成后：

1. 检查 og.png 文件：
   - 尺寸应为 1200×630 像素
   - 文件大小应在 50-200KB 之间
   - 颜色和文字应清晰可见

2. 刷新浏览器查看新 favicon

3. 测试社交分享：
   使用 https://www.opengraph.xyz/ 或
   https://developers.facebook.com/tools/debug/
   验证 OG 图片显示效果

4. 清理临时文件（可选）：
   rm public/og.svg

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 提示：favicon.svg 已经可以直接使用了！
只需要转换 og.svg → og.png 即可完成所有更新。
`)
