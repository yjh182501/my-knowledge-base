GitHub 自动部署部署指南

=== 服务器端部署步骤 ===

1. 登录服务器（SSH）
   ssh yjh@你的服务器IP

2. 上传文件到服务器
   将 deploy.sh 和 webhook-server.js 上传到服务器
   例如：/home/yjh/deploy.sh 和 /home/yjh/webhook-server.js

3. 创建日志目录
   mkdir -p /home/yjh/logs
   chmod 755 /home/yjh/logs

4. 设置脚本权限
   chmod +x /home/yjh/deploy.sh

5. 编辑 deploy.sh（修改配置）
   vi /home/yjh/deploy.sh
   
   修改以下配置（按 i 进入编辑模式）：
   - PROJECT_DIR="/home/yjh/my-blog"  # 项目路径
   - NODE_USER="yjh"                  # 运行 Node.js 的用户
   - WEBHOOK_SECRET="yjh-...26"      # Webhook 密钥（自定义一个密钥，保持和 GitHub 一致）
   
   按 Esc，输入 :wq 保存退出

6. 初始化项目
   cd /home/yjh
   mkdir my-blog
   cd my-blog
   # 克隆你的项目（替换为你的 GitHub 地址）
   git clone https://github.com/yjh182501/my-knowledge-base.git .
   npm install --production

7. 配置 pm2（启动服务）
   pm2 start src/server.js --name my-blog --node-args="--no-deprecation"
   pm2 save
   pm2 startup  # 按提示执行开机自启命令

8. 安装并启动 Webhook 服务
   pm2 start webhook-server.js --name webhook
   pm2 save

9. 测试 Webhook
   访问 http://你的服务器IP:9091/webhook
   如果显示 "Not Found" 说明服务正常

10. 防火墙配置
    # Ubuntu
    sudo ufw allow 9090/tcp  # 应用端口
    sudo ufw allow 9091/tcp  # Webhook 端口
    
    # CentOS
    sudo firewall-cmd --permanent --add-port=9090/tcp
    sudo firewall-cmd --permanent --add-port=9091/tcp
    sudo firewall-cmd --reload

=== GitHub 仓库配置步骤 ===

1. 打开你的 GitHub 仓库
2. Settings → Webhooks → Add webhook
3. 填写：
   - Payload URL: http://你的服务器IP:9091/webhook
   - Content type: application/json
   - Secret: 和 deploy.sh 中的 WEBHOOK_SECRET 保持一致
   - Which events?: Just the push event
4. 点击 Add webhook

=== 测试自动部署 ===

1. 在本地修改一个文件（比如 README.md）
2. git add -A && git commit -m "test deploy" && git push origin main
3. 等待几秒钟
4. 检查服务器日志：
   pm2 logs webhook
   pm2 logs my-blog
5. 手机访问 http://你的服务器IP:9090 验证更新

=== 常见问题 ===

Q: Webhook 403 错误？
A: 检查 Secret 是否一致，重新保存 Webhook

Q: 部署脚本执行失败？
A: 检查 deploy.sh 中的路径和用户权限

Q: 服务启动失败？
A: 查看日志 pm2 logs my-blog

Q: 端口被占用？
A: 修改 deploy.sh 和 webhook-server.js 中的端口配置

=== 注意事项 ===

1. Webhook 密钥（SECRET）需要在 deploy.sh 和 GitHub Webhook 中保持一致
2. 确保服务器防火墙开放了 9090（应用）和 9091（Webhook）端口
3. 第一次部署可能需要手动运行 deploy.sh 检查是否有错误
4. Webhook 服务崩溃后会自动重启（pm2 自带功能）
5. 建议在 deploy.sh 中配置备份目录，防止部署失败
