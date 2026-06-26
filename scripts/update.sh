#!/bin/bash
# 博客快速更新脚本（安全版）
# 用法：直接复制粘贴以下命令到服务器终端运行即可
#
# 一键更新命令（复制执行）：
# bash -c "$(curl -fsSL https://raw.githubusercontent.com/yjh182501/my-knowledge-base/main/scripts/update.sh)"

set -e

echo "=========================================="
echo "  博客快速更新脚本（安全版）"
echo "  时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# 1. 进入项目目录
cd /opt/personal-blog || {
    echo "错误：项目目录 /opt/personal-blog 不存在"
    echo "请先执行：mkdir -p /opt/personal-blog && cd /opt/personal-blog"
    exit 1
}

# 2. 数据安全检查（防止误删 data 和 uploads）
echo ""
echo "[0/4] 安全检查：检查数据目录是否存在..."
if [ ! -d "data" ]; then
    echo "⚠️  警告：data 目录不存在，如果这是新部署请忽略"
else
    echo "✓ data 目录存在"
fi

if [ ! -d "uploads" ]; then
    echo "⚠️  警告：uploads 目录不存在，如果这是新部署请忽略"
else
    echo "✓ uploads 目录存在"
fi

# 3. 拉取最新代码（不会删除 data 和 uploads）
echo ""
echo "[1/4] 拉取最新代码..."
git pull origin main

# 4. 安装依赖（如果有新依赖）
echo ""
echo "[2/4] 检查并安装依赖..."
npm install --production

# 5. 数据库迁移（如果需要）
echo ""
echo "[3/4] 检查数据库迁移..."
npm run migrate || echo "跳过数据库迁移（无变更）"

# 6. 重启服务
echo ""
echo "[4/4] 重启服务..."
pm2 restart my-blog

# 7. 显示状态
echo ""
echo "=========================================="
echo "  更新完成！"
echo "=========================================="
echo ""
echo "数据目录保护说明："
echo "  ✓ data/      → 本地笔记、数据库"
echo "  ✓ uploads/   → 上传的图片和文件"
echo ""
echo "以下操作不会影响数据目录："
echo "  ✓ git pull        → 只更新代码"
echo "  ✓ npm install     → 只更新依赖"
echo "  ✓ pm2 restart     → 只重启服务"
echo ""
echo "服务状态："
pm2 status my-blog
echo ""
echo "最新日志："
pm2 logs my-blog --lines 10 --nostream
