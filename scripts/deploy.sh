#!/bin/bash
# 一键部署个人知识库 CMS 到服务器
# 使用方法：bash deploy.sh <服务器IP> <SSH用户名> <POST_PASSWORD>
# 示例：bash deploy.sh 你的服务器公网IP root "你的强密码"

set -e  # 遇到错误立即退出

echo "=========================================="
echo "个人知识库 CMS 一键部署脚本"
echo "=========================================="

# 参数检查
if [ $# -lt 3 ]; then
    echo "用法: bash deploy.sh <服务器IP> <SSH用户名> <POST_PASSWORD>"
    echo "示例: bash deploy.sh 你的服务器公网IP root \"MyStrongPassword123!\""
    echo ""
    echo "提示: 公网 IP 地址请替换为你自己的服务器地址"
    exit 1
fi

SERVER_IP=$1
SSH_USER=$2
POST_PASSWORD=$3
REMOTE_DIR="/opt/personal-blog"

echo ""
echo "部署信息:"
echo "服务器: ${SSH_USER}@${SERVER_IP}"
echo "部署目录: ${REMOTE_DIR}"
echo "管理员密码: 已设置"
echo "=========================================="

# 1. 上传项目到服务器
echo ""
echo "[1/7] 上传项目文件到服务器..."
ssh "${SSH_USER}@${SERVER_IP}" "mkdir -p ${REMOTE_DIR}"
rsync -avz --exclude='node_modules' --exclude='.git' --exclude='data' --exclude='uploads' --exclude='logs' "$(dirname "$0")/.." "${SSH_USER}@${SERVER_IP}:${REMOTE_DIR}/"

# 2. SSH 登录服务器执行部署命令
echo ""
echo "[2/7] 检查并安装 Node.js..."
ssh "${SSH_USER}@${SERVER_IP}" "node -v || (curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs)"

echo ""
echo "[3/7] 安装 npm 依赖..."
ssh "${SSH_USER}@${SERVER_IP}" "cd ${REMOTE_DIR} && npm install --production"

echo ""
echo "[4/7] 导入已有文章..."
ssh "${SSH_USER}@${SERVER_IP}" "cd ${REMOTE_DIR} && npm run migrate"

echo ""
echo "[5/7] 安装 PM2..."
ssh "${SSH_USER}@${SERVER_IP}" "npm install -g pm2"

echo ""
echo "[6/7] 启动服务..."
ssh "${SSH_USER}@${SERVER_IP}" "cd ${REMOTE_DIR} && POST_PASSWORD='${POST_PASSWORD}' pm2 start server.js --name 'my-blog'"

echo ""
echo "[7/7] 保存 PM2 配置..."
ssh "${SSH_USER}@${SERVER_IP}" "cd ${REMOTE_DIR} && pm2 save && pm2 startup -f"

echo "=========================================="
echo "部署完成！"
echo "=========================================="
echo "访问地址:"
echo "  前台: http://${SERVER_IP}:8080"
echo "  后台: http://${SERVER_IP}:8080/manage"
echo ""
echo "常用命令:"
echo "  查看状态: ssh ${SSH_USER}@${SERVER_IP} 'pm2 status my-blog'"
echo "  查看日志: ssh ${SSH_USER}@${SERVER_IP} 'pm2 logs my-blog'"
echo "  重启服务: ssh ${SSH_USER}@${SERVER_IP} 'pm2 restart my-blog'"
echo "  停止服务: ssh ${SSH_USER}@${SERVER_IP} 'pm2 stop my-blog'"
echo ""
echo "重要提示:"
echo "  1. 前台端口 8080 不建议直接暴露公网"
echo "  2. 建议在 1Panel 面板配置反向代理"
echo "  3. 定期备份数据库和 uploads 目录"
echo "  4. 数据库路径: ${REMOTE_DIR}/data/blog.sqlite"
echo "  5. 上传目录: ${REMOTE_DIR}/uploads"
