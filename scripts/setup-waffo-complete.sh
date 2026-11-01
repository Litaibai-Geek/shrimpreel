#!/bin/bash
# Waffo 完整设置脚本
# 用法: bash scripts/setup-waffo-complete.sh STO_xxx

set -e  # 遇到错误立即退出

STORE_ID=$1

if [ -z "$STORE_ID" ]; then
  echo "❌ 缺少店铺 ID"
  echo "用法: bash scripts/setup-waffo-complete.sh STO_xxx"
  exit 1
fi

if [[ ! $STORE_ID =~ ^STO_ ]]; then
  echo "❌ 店铺 ID 格式错误，必须以 STO_ 开头"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Waffo 自动化设置"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "店铺 ID: $STORE_ID"
echo "环境: 测试环境 (test)"
echo ""

# 步骤 1: 检查配置
echo "📋 步骤 1/5: 检查配置文件..."

if [ ! -f ".dev.vars.production" ]; then
  echo "❌ 缺少 .dev.vars.production 文件"
  exit 1
fi

if ! grep -q "WAFFO_MERCHANT_ID=" .dev.vars.production; then
  echo "❌ .dev.vars.production 中缺少 WAFFO_MERCHANT_ID"
  exit 1
fi

if ! grep -q "WAFFO_PRIVATE_KEY=" .dev.vars.production; then
  echo "❌ .dev.vars.production 中缺少 WAFFO_PRIVATE_KEY"
  exit 1
fi

echo "✅ 配置文件完整"
echo ""

# 步骤 2: 复制到 .dev.vars（如果不存在）
echo "📋 步骤 2/5: 准备本地配置..."

if [ ! -f ".dev.vars" ]; then
  echo "创建 .dev.vars..."
  cp .dev.vars.production .dev.vars
  echo "✅ 已创建 .dev.vars"
else
  echo "✅ .dev.vars 已存在"
fi
echo ""

# 步骤 3: 查看创建计划
echo "📋 步骤 3/5: 查看产品创建计划..."
echo ""

node scripts/waffo-setup.mjs --store $STORE_ID

echo ""
read -p "👆 确认以上产品列表正确？继续创建? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ 用户取消"
  exit 0
fi

# 步骤 4: 创建产品
echo ""
echo "📋 步骤 4/5: 创建产品..."
echo ""

node scripts/waffo-setup.mjs --store $STORE_ID --apply --write-dev-vars

echo ""
echo "✅ 产品创建完成"
echo ""

# 步骤 5: 更新 wrangler.jsonc
echo "📋 步骤 5/5: 更新 wrangler.jsonc..."
echo ""

# 读取 .dev.vars 中的 WAFFO_PRODUCTS
WAFFO_PRODUCTS=$(grep "WAFFO_PRODUCTS=" .dev.vars | cut -d= -f2- | tr -d "'\"")
WAFFO_STORE_ID=$(grep "WAFFO_STORE_ID=" .dev.vars | cut -d= -f2- | tr -d "'\"")

if [ -z "$WAFFO_PRODUCTS" ]; then
  echo "❌ 无法读取 WAFFO_PRODUCTS"
  exit 1
fi

echo "WAFFO_PRODUCTS: $WAFFO_PRODUCTS"
echo "WAFFO_STORE_ID: $WAFFO_STORE_ID"
echo ""

echo "⚠️  请手动更新 wrangler.jsonc:"
echo ""
echo "  \"WAFFO_PRODUCTS\": \"$WAFFO_PRODUCTS\","
if [ -n "$WAFFO_STORE_ID" ]; then
  echo "  \"WAFFO_STORE_ID\": \"$WAFFO_STORE_ID\","
fi
echo ""

# 完成
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Waffo 设置完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ 已完成:"
echo "  1. 创建产品"
echo "  2. 更新 .dev.vars"
echo ""
echo "⚠️  下一步:"
echo "  1. 更新 wrangler.jsonc（见上方输出）"
echo "  2. 本地测试: npm run dev"
echo "  3. 部署: npm run deploy"
echo ""
echo "📚 文档: docs/waffo-multi-site-strategy.md"
echo ""
