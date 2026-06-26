# 数据迁移指南

## 问题原因

Docker 默认把数据存在 Volume（如 `my-blog_blog-data`）里，而你原来的 `data/` 和 `uploads/` 在宿主机本地，所以新建容器时数据是空的。

---

## 解决方案（选择一种）

### 方案 1：直接挂载本地目录（推荐，最简单）

修改 `docker-compose.yml`，把 Volume 挂载改成：

```yaml
volumes:
  - ./data:/app/data
  - ./uploads:/app/uploads
```

这样容器里的 `/app/data` 和 `/app/uploads` 就直接映射到宿主机的 `./data` 和 `./uploads`，数据永久保存。

✅ 优点：简单、直观、数据就在项目目录里，方便备份  
❌ 缺点：需要先存在 `data/` 和 `uploads/` 目录

---

### 方案 2：用脚本迁移（适合已有 Volume 的情况）

在服务器上执行：

```bash
cd /opt/my-blog

# 1. 备份原来的数据
tar czf /tmp/data-backup.tar.gz data uploads

# 2. 启动容器（会自动创建空的 Volume）
docker-compose up -d

# 3. 把备份的数据拷贝到容器
docker run --rm -v my-blog_blog-data:/target -v /tmp:/host alpine sh -c "cp -r /host/data-backup.tar.gz /target/ && cd /target && tar xzf data-backup.tar.gz && rm data-backup.tar.gz"

# 4. 重启容器
docker-compose restart
```

---

## 数据迁移脚本

我生成了一个自动化脚本 `scripts/migrate-data.sh`，用法：

```bash
cd /opt/my-blog
bash scripts/migrate-data.sh
```

它会自动：
- 检查 `data/` 和 `uploads/` 是否存在
- 启动容器
- 把数据拷贝到容器里

---

## 迁移后验证

```bash
# 1. 查看容器状态
docker-compose ps

# 2. 查看数据是否正确
docker-compose exec blog ls -la /app/data
docker-compose exec blog ls -la /app/uploads

# 3. 重启服务
docker-compose restart
```

---

## 数据备份建议

### 定期备份（每天/每周）

```bash
# 备份到 /backup 目录
docker run --rm -v my-blog_blog-data:/data -v /backup:/backup alpine tar czf /backup/data-$(date +%Y%m%d).tar.gz /data
```

### 手动备份

```bash
# 直接打包宿主机的数据目录（如果用了方案 1）
tar czf /backup/my-blog-data-backup.tar.gz /opt/my-blog/data /opt/my-blog/uploads
```

---

## 恢复数据

```bash
# 如果数据丢失，用备份恢复
docker run --rm -v my-blog_blog-data:/target -v /backup:/backup alpine sh -c "cd /target && tar xzf /backup/data-20260626.tar.gz"
```

---

## 总结

| 方案 | 适用场景 | 难度 |
|------|---------|------|
| 挂载本地目录 | 新部署或数据还在本地 | ⭐ |
| 脚本迁移 | 已有容器和数据 | ⭐⭐ |
| 手动拷贝 | 数据量小 | ⭐⭐ |

---

## 重要提醒

- 数据库文件路径：`data/blog.sqlite`
- 上传文件路径：`uploads/`
- 备份频率：至少每周一次
- 测试恢复：定期测试恢复流程，确保备份有效
