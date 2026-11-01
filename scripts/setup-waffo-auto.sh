#!/bin/bash
# Waffo 一键配置脚本（自动同步）
# 用法: bash scripts/setup-waffo-auto.sh STO_xxx

set -e

STORE_ID=$1

if [ -z "$STORE_ID" ]; then
  echo "❌ 缺少店铺 ID"
  echo "用法: bash scripts/setup-waffo-auto.sh STO_xxx"
  exit 1
fi

if [[ ! $STORE_ID =~ ^STO_ ]]; then
  echo "❌ 店铺 ID 格式错误，必须以 STO_ 开头"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Waffo 一键配置（自动同步）"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "店铺 ID: $STORE_ID"
echo ""

# 步骤 1: 检查配置
echo "📋 步骤 1/4: 检查配置..."

if [ ! -f ".dev.vars.production" ]; then
  echo "❌ 缺少 .dev.vars.production"
  exit 1
fi

if ! grep -q "WAFFO_MERCHANT_ID=" .dev.vars.production; then
  echo "❌ 缺少 WAFFO_MERCHANT_ID"
  exit 1
fi

if ! grep -q "WAFFO_PRIVATE_KEY=" .dev.vars.production; then
  echo "❌ 缺少 WAFFO_PRIVATE_KEY"
  exit 1
fi

# 确保 .dev.vars 存在
if [ ! -f ".dev.vars" ]; then
  cp .dev.vars.production .dev.vars
  echo "✅ 已创建 .dev.vars"
fi

echo "✅ 配置文件完整"
echo ""

# 步骤 2: 创建产品
echo "📋 步骤 2/4: 创建 Waffo 产品..."
echo ""

node scripts/waffo-setup.mjs --store $STORE_ID --apply --write-dev-vars

echo ""
echo "✅ 产品创建完成"
echo ""

# 步骤 3: 自动同步到 wrangler.jsonc
echo "📋 步骤 3/4: 同步配置到 wrangler.jsonc..."
echo ""

node scripts/sync-wrangler-vars.mjs --apply

echo ""

# 步骤 4: 验证
echo "📋 步骤 4/4: 验证配置..."
echo ""

# 检查 wrangler.jsonc 是否已更新
if ! grep -q "\"WAFFO_STORE_ID\": \"$STORE_ID\"" wrangler.jsonc; then
  echo "⚠️  WAFFO_STORE_ID 可能未正确更新"
  echo "   请手动检查 wrangler.jsonc"
fi

WAFFO_PRODUCTS=$(grep "WAFFO_PRODUCTS=" .dev.vars | cut -d= -f2- | tr -d "'\"" || echo "")

if [ -z "$WAFFO_PRODUCTS" ] || [ "$WAFFO_PRODUCTS" = "{}" ]; then
  echo "⚠️  WAFFO_PRODUCTS 为空"
else
  echo "✅ WAFFO_PRODUCTS: $WAFFO_PRODUCTS"
fi

echo "✅ WAFFO_STORE_ID: $STORE_ID"
echo ""

# 完成
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 配置完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ 已完成:"
echo "  1. 在 Waffo 创建产品"
echo "  2. 更新 .dev.vars"
echo "  3. 自动同步到 wrangler.jsonc"
echo ""
echo "📝 下一步:"
echo "  1. 本地测试: npm run dev"
echo "  2. 部署: npm run deploy"
echo ""
