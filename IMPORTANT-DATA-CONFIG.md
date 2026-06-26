# 数据持久化配置（关键配置）

## 修改 docker-compose.yml（数据挂载到宿主机）

```yaml
version: '3.8'

services:
  blog:
    image: node:20-alpine
    container_name: my-blog
    restart: unless-stopped
    ports:
      - "9090:9090"
    environment:
      - NODE_ENV=production
      - BLOG_DATA_DIR=/app/data
      - BLOG_UPLOAD_DIR=/app/uploads
      - POST_PASSWORD=${POST_PASSWORD:-change-this-password}
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
    working_dir: /app
    command: npm start
```

---

## 迁移步骤（在服务器上执行）

```bash
# 1. 停止旧容器（如果有）
cd /opt/my-blog
docker-compose down

# 2. 备份原来的数据（在 /opt/personal-blog 里）
cd /opt/personal-blog
tar czf /tmp/data-backup.tar.gz data uploads

# 3. 把数据复制到新项目目录
cp -r data /opt/my-blog/
cp -r uploads /opt/my-blog/

# 4. 修改 docker-compose.yml（见上文）

# 5. 启动新容器
cd /opt/my-blog
docker-compose up -d

# 6. 验证数据
docker-compose exec blog ls -la /app/data
docker-compose exec blog ls -la /app/uploads
```

---

## 数据存储路径对照

| 容器内路径 | 宿主机路径 | 说明 |
|-----------|-----------|------|
| `/app/data` | `/opt/my-blog/data` | 博客数据（数据库、配置） |
| `/app/uploads` | `/opt/my-blog/uploads` | 上传文件 |

---

## 验证数据是否正确

```bash
# 进入容器查看
docker-compose exec blog sh

# 检查数据目录
ls -la /app/data
cat /app/data/config.json  # 或 cat /app/data/blog.sqlite

# 退出
exit
```

---

## 常见问题

### Q：迁移后访问博客提示"数据不存在"

A：检查 `BLOG_DATA_DIR` 环境变量是否正确，应该是 `/app/data`

### Q：上传的图片不显示

A：检查 `BLOG_UPLOAD_DIR` 环境变量是否正确，应该是 `/app/uploads`

### Q：数据目录权限问题

A：修改权限：
```bash
chmod -R 755 /opt/my-blog/data /opt/my-blog/uploads
chown -R node:node /opt/my-blog/data /opt/my-blog/uploads
```

---

## 一鍵脚本（可选）

我生成了 `scripts/migrate-data.sh`，用法：

```bash
cd /opt/my-blog
bash scripts/migrate-data.sh
```

但前提是你的 `data/` 和 `uploads/` 目录已经在 `/opt/my-blog` 里。

---

## 重要提醒

- ✅ 每次更新前备份数据：`tar czf /backup/$(date +%Y%m%d).tar.gz data uploads`
- ✅ 数据库文件：`data/blog.sqlite`
- ✅ 上传文件：`uploads/`
- ❌ 不要把数据放在容器里（容器删除就没了）
