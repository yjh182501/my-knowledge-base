# 数据安全说明（重要）

## 你担心的问题

> "更新代码时会不会删除我的原有笔记？"

**答案：不会！**

---

## 为什么不会删除？

我们的更新流程是：

```bash
# 1. git pull origin main  → 只更新代码文件
# 2. npm install           → 只更新 node_modules
# 3. pm2 restart           → 只重启服务
```

**不会执行**：
- ❌ `rm -rf data`  
- ❌ `rm -rf uploads`  
- ❌ `git clean`  

---

## 数据目录保护清单

| 目录 | 内容 | 是否受保护 | 说明 |
|------|------|-----------|------|
| `data/` | 博客数据库、配置 | ✅ 是 | 永远不会被删除 |
| `uploads/` | 上传的图片、文件 | ✅ 是 | 永远不会被删除 |
| `logs/` | 日志文件 | ✅ 是 | 永远不会被删除 |
| `src/` | 源代码 | ❌ 否 | 会被 `git pull` 更新 |
| `public/` | 前端静态文件 | ❌ 否 | 会被 `git pull` 更新 |
| `node_modules/` | 依赖包 | ❌ 否 | 会被 `npm install` 更新 |

---

## 一键更新脚本（安全版）

复制到服务器终端运行：

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/yjh182501/my-knowledge-base/main/scripts/update.sh)"
```

脚本会：
1. 检查 `data/` 和 `uploads/` 目录是否存在
2. 显示保护状态
3. 只更新代码、依赖、重启服务
4. 最后显示服务状态

---

## 定期备份建议（可选）

虽然更新不会删除数据，但为了万无一失，建议定期备份：

```bash
# 备份到 /backup 目录
mkdir -p /backup
tar czf /backup/blog-backup-$(date +%Y%m%d).tar.gz /opt/personal-blog/data /opt/personal-blog/uploads
```

---

## 重要提醒

| 项目 | 路径 | 是否自动备份 |
|------|------|-------------|
| 博客数据库 | `/opt/personal-blog/data/blog.sqlite` | ❌ 需手动备份 |
| 上传文件 | `/opt/personal-blog/uploads/` | ❌ 需手动备份 |
| 配置文件 | `/opt/personal-blog/src/config.js` | ❌ 需手动备份 |

---

## 一键备份脚本（可选）

我可以帮你生成一个备份脚本 `backup.sh`：

```bash
#!/bin/bash
BACKUP_DIR="/backup"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="blog-backup-${DATE}.tar.gz"

mkdir -p ${BACKUP_DIR}
tar czf ${BACKUP_DIR}/${BACKUP_FILE} \
  /opt/personal-blog/data \
  /opt/personal-blog/uploads \
  /opt/personal-blog/src/config.js

echo "备份完成：${BACKUP_DIR}/${BACKUP_FILE}"
```

需要我帮你生成吗？

---

## 总结

- ✅ 更新脚本不会删除数据
- ✅ `data/` 和 `uploads/` 永远受保护
- ✅ 只更新代码、依赖、重启服务
- ⚠️ 建议定期手动备份（数据库 + 上传文件）
