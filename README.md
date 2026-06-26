# 个人知识库 CMS

这是一个个人自用博客后台，适合部署在自己的阿里云 ECS / 1Panel 服务器上。

当前版本特点：

- 在线后台写文章
- 草稿、立即发布、定时发布
- SQLite 持久保存文章
- 图片上传
- 前台文章列表、详情和搜索
- 旧 `posts/` 文件一次性迁移
- 不再依赖 Git 自动同步保存文章

## 本地使用

安装依赖：

```bash
npm install
```

导入现有 `posts/` 文章：

```bash
npm run migrate
```

启动服务：

```bash
npm start
```

访问：

- 前台：`http://localhost:8080`
- 后台：`http://localhost:8080/manage`

默认后台密码来自环境变量 `POST_PASSWORD`。如果没有设置，会使用 `change-this-password`，正式部署前必须修改。

## 数据目录

默认数据会写入项目目录：

- 数据库：`data/blog.sqlite`
- 上传图片：`uploads/`

部署到服务器时建议使用固定目录：

```bash
export BLOG_DATA_DIR=/opt/personal-blog/data
export BLOG_UPLOAD_DIR=/opt/personal-blog/uploads
export POST_PASSWORD='换成一个强密码'
npm start
```

## 阿里云 / 1Panel 部署建议

服务器可以直接用公网 IP 访问，不绑定域名也可以：

```text
http://47.101.155.191
```

没有域名时通常无法方便地配置 HTTPS，浏览器会提示“不安全”。个人自用可以接受，但要注意：

- 后台密码必须足够强。
- 不要把后端应用端口直接暴露给公网。
- 只让 Nginx 对外提供 `80` 端口。
- 1Panel 面板端口和 SSH 端口尽量限制访问 IP。
- 定期备份数据库和上传目录。

推荐目录：

```text
/opt/personal-blog/app       应用代码
/opt/personal-blog/data      SQLite 数据库
/opt/personal-blog/uploads   上传图片
/opt/personal-blog/backups   备份文件
```

Nginx 反向代理到本机 Node 端口即可。后端服务可以用 PM2 或 1Panel 的 Node 项目管理保持常驻。

## 备份

最重要的是备份这两个位置：

```text
/opt/personal-blog/data/blog.sqlite
/opt/personal-blog/uploads
```

建议每天备份一次，至少保留最近 7 到 30 天。

## 测试

```bash
npm test
```

