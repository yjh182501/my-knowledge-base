#!/bin/bash
# 博客快速更新脚本
# 用法：直接复制粘贴以下命令到服务器终端运行即可
#
# 一键更新命令（复制执行）：
# bash -c "$(curl -fsSL https://raw.githubusercontent.com/yjh182501/my-knowledge-base/main/scripts/update.sh)"

set -e

echo "=========================================="
echo "  博客快速更新脚本"
echo "  时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "=========================================="

# 1. 进入项目目录
cd /opt/personal-blog || {
    echo "错误：项目目录 /opt/personal-blog 不存在"
    echo "请先执行：mkdir -p /opt/personal-blog && cd /opt/personal-blog"
    exit 1
}

# 2. 拉取最新代码
echo ""
echo "[1/3] 拉取最新代码..."
git pull origin main

# 3. 安装依赖（如果有新依赖）
echo ""
echo "[2/3] 检查并安装依赖..."
npm install --production

# 4. 重启服务
echo ""
echo "[3/3] 重启服务..."
pm2 restart my-blog

# 5. 显示状态
echo ""
echo "=========================================="
echo "  更新完成！"
echo "=========================================="
echo ""
echo "服务状态："
pm2 status my-blog
echo ""
echo "最新日志："
pm2 logs my-blog --lines 10 --nostream
