#!/bin/bash
# 自动部署脚本 - GitHub Webhook 触发后运行
# 用法：bash deploy.sh

set -e  # 出错立即退出

# ========== 配置区域 ==========
PROJECT_DIR="/home/yjh/my-blog"     # 项目路径
NODE_USER="yjh"                    # 运行 Node.js 的用户
PM2_NAME="my-blog"                 # pm2 进程名称
LOG_DIR="/home/yjh/logs/blog"      # 日志目录
BACKUP_DIR="/home/yjh/backup"      # 备份目录
WEBHOOK_SECRET="yjh-blog-webhook-secret-2026"  # Webhook 密钥（需和 GitHub 保持一致）
# ==============================

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ========== 检查环境 ==========
check_env() {
    log_info "检查运行环境..."
    
    # 检查 git
    if ! command -v git &> /dev/null; then
        log_error "未安装 git，请先安装：sudo apt install git（Ubuntu）或 sudo yum install git（CentOS）"
        exit 1
    fi
    
    # 检查 node
    if ! command -v node &> /dev/null; then
        log_error "未安装 Node.js，请先安装：https://nodejs.org/"
        exit 1
    fi
    
    # 检查 npm
    if ! command -v npm &> /dev/null; then
        log_error "未安装 npm"
        exit 1
    fi
    
    # 检查 pm2
    if ! command -v pm2 &> /dev/null; then
        log_warn "未安装 pm2，尝试安装..."
        npm install -g pm2
    fi
    
    log_info "环境检查通过"
}

# ========== 目录准备 ==========
prepare_dirs() {
    log_info "准备目录结构..."
    
    # 创建项目目录
    if [ ! -d "$PROJECT_DIR" ]; then
        log_info "创建项目目录：$PROJECT_DIR"
        sudo mkdir -p "$PROJECT_DIR"
        sudo chown -R "$NODE_USER:$NODE_USER" "$PROJECT_DIR"
    fi
    
    # 创建日志目录
    sudo mkdir -p "$LOG_DIR"
    sudo chown -R "$NODE_USER:$NODE_USER" "$LOG_DIR"
    
    # 创建备份目录
    sudo mkdir -p "$BACKUP_DIR"
    sudo chown -R "$NODE_USER:$NODE_USER" "$BACKUP_DIR"
    
    log_info "目录准备完成"
}

# ========== 拉取代码 ==========
pull_code() {
    log_info "正在拉取最新代码..."
    
    cd "$PROJECT_DIR"
    
    # 如果是第一次部署，先克隆
    if [ ! -d ".git" ]; then
        log_info "首次部署，克隆仓库..."
        sudo -u "$NODE_USER" git clone https://github.com/yjh182501/my-knowledge-base.git .
    else
        # 备份当前版本（可选）
        log_info "备份当前版本..."
        BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S)"
        sudo -u "$NODE_USER" tar -czf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" --exclude="node_modules" --exclude=".git" .
        
        # 拉取最新代码
        sudo -u "$NODE_USER" git fetch origin
        sudo -u "$NODE_USER" git reset --hard origin/main
    fi
    
    log_info "代码拉取完成"
}

# ========== 安装依赖 ==========
install_deps() {
    log_info "安装依赖..."
    
    cd "$PROJECT_DIR"
    sudo -u "$NODE_USER" npm install --production
    # 如果需要开发依赖（比如构建工具）
    # sudo -u "$NODE_USER" npm install
    
    log_info "依赖安装完成"
}

# ========== 重启服务 ==========
restart_service() {
    log_info "重启服务..."
    
    # 停止旧服务
    pm2 stop "$PM2_NAME" 2>/dev/null || true
    
    # 启动新服务
    cd "$PROJECT_DIR"
    pm2 start src/server.js \
        --name "$PM2_NAME" \
        --interpreter /usr/bin/node \
        --no-daemon \
        --ignore-watches=".git" \
        --log-date-format="YYYY-MM-DD HH:mm:ss" \
        --output "$LOG_DIR/out.log" \
        --error "$LOG_DIR/error.log" \
        --env production
    
    # 保存 pm2 配置（开机自启）
    pm2 save
    
    log_info "服务重启完成"
}

# ========== 验证部署 ==========
verify_deploy() {
    log_info "验证部署..."
    
    # 等待服务启动
    sleep 3
    
    # 检查 pm2 状态
    if pm2 describe "$PM2_NAME" | grep -q "status.*online"; then
        log_info "服务运行正常"
        pm2 status
    else
        log_error "服务启动失败，请检查日志：tail -n 50 $LOG_DIR/error.log"
        exit 1
    fi
    
    # 检查端口
    PORT=9090
    if ss -tuln | grep -q ":$PORT "; then
        log_info "端口 $PORT 已监听"
    else
        log_warn "端口 $PORT 未监听，可能需要检查配置"
    fi
    
    log_info "部署验证完成"
}

# ========== 清理旧备份 ==========
cleanup() {
    log_info "清理旧备份（保留最近7天）..."
    
    find "$BACKUP_DIR" -name "backup-*.tar.gz" -mtime +7 -delete 2>/dev/null || true
    
    log_info "清理完成"
}

# ========== 主流程 ==========
main() {
    echo "=========================================="
    echo "  GitHub 自动部署脚本"
    echo "  时间：$(date '+%Y-%m-%d %H:%M:%S')"
    echo "=========================================="
    
    check_env
    prepare_dirs
    pull_code
    install_deps
    restart_service
    verify_deploy
    cleanup
    
    echo "=========================================="
    echo -e "${GREEN}  部署成功！${NC}"
    echo "  服务端口：9090"
    echo "  日志目录：$LOG_DIR"
    echo "  查看日志：pm2 logs $PM2_NAME"
    echo "=========================================="
}

main "$@"
