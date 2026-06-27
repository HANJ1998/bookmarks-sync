#!/bin/bash
# release.sh — 手动创建 Release
# 用法: GITHUB_TOKEN=ghp_xxx bash release.sh
set -e

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ 请设置 GITHUB_TOKEN 环境变量"
  echo "   用法: GITHUB_TOKEN=ghp_xxx bash release.sh"
  exit 1
fi

TOKEN="$GITHUB_TOKEN"
REPO="HANJ1998/bookmarks-sync"

# 读取版本号
VERSION=$(grep '"version"' src/manifest.json | head -1 | grep -oP '"\d+\.\d+\.\d+"' | tr -d '"')
TAG="v$VERSION"
ZIP="bookmarks-sync-$TAG.zip"
echo "🔖 版本: $TAG"

# 检查 tag 是否已存在
EXISTS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token $TOKEN" \
  "https://api.github.com/repos/$REPO/releases/tags/$TAG")
if [ "$EXISTS" = "200" ]; then
  echo "⚠️  Release $TAG 已存在，跳过"
  exit 0
fi

# 打包
cd src
zip -r "../$ZIP" manifest.json background.js webdav.js popup.html popup.js options.html options.js icons/
cd ..
echo "📦 打包完成: $ZIP"

# 创建 Release
echo "🚀 创建 Release..."
RESP=$(curl -s -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/$REPO/releases" \
  -d "{\"tag_name\":\"$TAG\",\"name\":\"$TAG\",\"body\":\"一键书签同步 $TAG\\n\\n## 安装\\n1. 下载 zip 并解压\\n2. 打开 Chrome/Edge → 扩展管理 → 开发者模式\\n3. 加载解压缩的扩展 → 选择 src/ 目录\"}")

RELEASE_ID=$(echo "$RESP" | grep -oP '"id": \K\d+' | head -1)
if [ -z "$RELEASE_ID" ]; then
  echo "❌ 创建 Release 失败:"
  echo "$RESP"
  exit 1
fi
echo "✅ Release ID: $RELEASE_ID"

# 上传 zip
echo "📤 上传附件..."
curl -s -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Content-Type: application/zip" \
  "https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets?name=$ZIP" \
  --data-binary "@$ZIP" > /dev/null

echo "✅ 完成: https://github.com/$REPO/releases/tag/$TAG"
