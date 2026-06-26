# 一键迁移旧数据到 Docker 的脚本
# 用法：在服务器上的 /opt/my-blog 目录执行
# bash scripts/migrate-data.sh

set -e

echo "======= 数据迁移脚本 ======="
echo "此脚本会将本地 data/ 和 uploads/ 目录迁移到 Docker 容器中"
echo ""

# 检查目录是否存在
if [ ! -d "data" ] || [ ! -d "uploads" ]; then
  echo "❌ 错误：data/ 或 uploads/ 目录不存在"
  echo "请先确保你原来的项目目录结构包含这些文件夹"
  exit 1
fi

echo "✓ 找到 data/ 和 uploads/ 目录"

# 检查 docker-compose 是否运行
if ! docker-compose ps > /dev/null 2>&1; then
  echo "⚠ 警告：Docker 容器未运行，正在启动..."
  docker-compose up -d
  sleep 3
fi

echo "✓ Docker 容器运行正常"

# 进入容器并复制数据
echo "开始迁移数据到容器..."

docker-compose exec blog sh -c "mkdir -p /app/data /app/uploads && cp -r /tmp/data/* /app/data/ && cp -r /tmp/uploads/* /app/uploads/"

echo "✓ 数据迁移完成！"
echo ""
echo "现在可以访问 http://你的服务器IP:9090 查看博客"
echo "如果提示数据不存在，请重启容器：docker-compose restart"
