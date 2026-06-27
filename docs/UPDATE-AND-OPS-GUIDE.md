# 个人知识库更新与运维手册

这份手册总结了本项目从前端体验优化到服务器部署排障的完整经验，目标只有两个：

1. 后续更新代码时，不影响服务器上已有笔记。
2. 出问题时，能快速判断是代码、PM2、端口，还是反向代理的问题。

## 1. 这次实际完成了什么

### 前端与后台体验优化

- 优化了后台桌面端和手机端布局，修复列表、编辑器、发布区错位和越界问题。
- 优化了前台阅读页的移动端适配，减少无效留白，阅读更接近 H5 页面。
- 重做了阅读模式顶部操作，只保留核心按钮，且不再一直悬浮挡内容。
- 整理了两层搜索：
  - 外层搜索：搜索全站标题和内容，点击跳转文章。
  - 页内搜索：只搜索当前文章，点击后跳到对应位置并高亮。
- 优化了分享链接体验：
  - 复制后有明确提示。
  - 手机端浏览器不支持自动复制时，弹出手动复制窗口。
- 替换原生确认框为站内统一弹窗。
- 修复了富文本粘贴后的展示差异：
  - 后台编辑区尽量保留原排版。
  - 前台详情页尽量按原排版显示。
- 为移动端增加可部署的衬线网页字体，避免电脑有衬线、手机变无衬线的问题。

### 数据与部署安全优化

- 把运行数据和代码目录彻底分开：
  - 代码目录：`/opt/personal-blog`
  - 数据目录：`/home/yjh/my-blog-data`
  - 上传目录：`/home/yjh/my-blog-uploads`
- 让程序优先读取环境变量：
  - `BLOG_DATA_DIR`
  - `BLOG_UPLOAD_DIR`
- 把 `data/`、`uploads/`、`logs/`、`.env`、`node_modules/` 从 Git 跟踪中排除。
- 删除了旧的自动部署脚本，改为手动更新，减少路径和环境变量不一致带来的风险。

## 2. 这次踩过的关键坑

### 坑 1：服务器项目路径判断错了

最初误以为项目在：

```bash
/home/yjh/my-blog
```

实际上线上运行目录是：

```bash
/opt/personal-blog
```

结论：以后先看 `pm2 show my-blog` 里的 `exec cwd`，不要猜目录。

### 坑 2：PM2 里有多个旧进程

服务器里同时存在多个旧的 `my-blog` / `my-knowledge-base` 进程，容易导致：

- 看错当前在线进程
- 重启到错误实例
- 端口冲突

结论：后续只保留当前真正在线的 `my-blog` 进程。

### 坑 3：数据目录权限不足

第一次切换到外部数据目录时，程序报错：

```bash
EACCES: permission denied, mkdir '/home/yjh/my-blog-data'
```

原因：`admin` 用户没有这个目录的写权限。

解决方式：

```bash
sudo mkdir -p /home/yjh/my-blog-data
sudo mkdir -p /home/yjh/my-blog-uploads
sudo chown -R admin:admin /home/yjh/my-blog-data
sudo chown -R admin:admin /home/yjh/my-blog-uploads
```

### 坑 4：Mac 的 node_modules 被带到 Linux 服务器

当时服务器报错：

```bash
better_sqlite3.node: invalid ELF header
```

原因：仓库里曾经混入了本地 `node_modules`，服务器拉到的是错误平台的二进制依赖。

解决方式：

```bash
rm -rf node_modules
npm install --production
```

结论：依赖必须在服务器本机安装，不能跨平台直接带过去。

### 坑 5：OpenResty 反向代理端口和 Node 实际端口不一致

Node 一度监听在：

```bash
127.0.0.1:3001
```

而 1Panel 反向代理还指向：

```bash
127.0.0.1:9090
```

结果外网访问直接 `502 Bad Gateway`。

最终策略：笔记服务固定跑在 `9090`，不要占用 `3001` 这个已有业务端口。

## 3. 当前正确的线上结构

### 代码目录

```bash
/opt/personal-blog
```

### 数据目录

```bash
/home/yjh/my-blog-data
```

### 上传目录

```bash
/home/yjh/my-blog-uploads
```

### 固定运行环境变量

```bash
PORT=9090
BLOG_DATA_DIR=/home/yjh/my-blog-data
BLOG_UPLOAD_DIR=/home/yjh/my-blog-uploads
```

### 1Panel / OpenResty 反向代理目标

```bash
http://127.0.0.1:9090
```

## 4. 以后每次更新的标准流程

按下面顺序执行，不要跳步骤。

### 第一步：进入项目目录

```bash
cd /opt/personal-blog
```

### 第二步：拉代码

```bash
git pull origin main
```

### 第三步：安装依赖

```bash
npm install --production
```

说明：这一步不能省略，因为后续可能新增依赖，比如字体包。

### 第四步：更新前备份数据库

```bash
cp /home/yjh/my-blog-data/blog.sqlite /home/yjh/my-blog-data/blog.sqlite.bak-$(date +%Y%m%d-%H%M%S)
```

### 第五步：带环境变量重启服务

```bash
PORT=9090 BLOG_DATA_DIR=/home/yjh/my-blog-data BLOG_UPLOAD_DIR=/home/yjh/my-blog-uploads pm2 restart my-blog --update-env
```

### 第六步：检查状态

```bash
pm2 status
pm2 env my-blog | grep -E 'PORT|BLOG_'
curl -I http://127.0.0.1:9090
```

如果这三步都正常，基本可以确认服务没问题。

## 5. 为什么这样更新不会影响原笔记

原因很简单：代码和数据已经分开了。

- `git pull` 只会更新 `/opt/personal-blog` 里的代码。
- 笔记数据库在 `/home/yjh/my-blog-data/blog.sqlite`。
- 上传文件在 `/home/yjh/my-blog-uploads`。

所以后面只要保持这套环境变量不变，更新代码不会覆盖已有笔记。

真正危险的情况只有两种：

- 你把环境变量去掉了，程序又重新读回项目里的 `data/`。
- 你手动删除了 `/home/yjh/my-blog-data` 或 `/home/yjh/my-blog-uploads`。

## 6. 启动与开机自启

### 保存当前 PM2 配置

```bash
pm2 save
```

### 设置开机自启

```bash
pm2 startup
```

执行后，PM2 会输出一条 `sudo ...` 命令，把它再执行一遍。

只有这两步都完成，服务器重启后服务才会自动拉起。

## 7. 出问题时怎么排查

不要一上来就改代码，先按这个顺序查。

### 先看 PM2 状态

```bash
pm2 status
pm2 show my-blog
```

### 再看环境变量

```bash
pm2 env my-blog | grep -E 'PORT|BLOG_'
```

### 再看端口监听

```bash
ss -tulnp | grep node
```

### 再看本机回环访问

```bash
curl -I http://127.0.0.1:9090
```

### 最后看日志

```bash
pm2 logs my-blog --lines 80 --nostream
```

## 8. 常见故障和对应结论

### 现象：网站显示 502 Bad Gateway

优先排查：

- Node 服务有没有启动
- Node 监听端口是不是 `9090`
- 1Panel 反向代理是不是还指向 `127.0.0.1:9090`

### 现象：重启后笔记全没了

优先排查：

- `pm2 env my-blog | grep BLOG_`
- 程序是不是没带 `BLOG_DATA_DIR`
- 当前数据库是不是读成了项目目录里的 `data/blog.sqlite`

### 现象：报 `invalid ELF header`

结论：服务器加载了错误平台的本地依赖。

处理方式：

```bash
rm -rf node_modules
npm install --production
```

### 现象：报 `EACCES: permission denied`

结论：数据目录权限不够。

处理方式：

```bash
sudo chown -R admin:admin /home/yjh/my-blog-data
sudo chown -R admin:admin /home/yjh/my-blog-uploads
```

### 现象：报 `EADDRINUSE`

结论：端口被别的进程占用了。

优先确认：

- 当前目标端口是不是 `9090`
- PM2 是否重复起了多个旧进程

## 9. 一条可长期复用的更新命令

后面如果你懒得一条条敲，可以直接用这一段：

```bash
cd /opt/personal-blog && \
git pull origin main && \
npm install --production && \
cp /home/yjh/my-blog-data/blog.sqlite /home/yjh/my-blog-data/blog.sqlite.bak-$(date +%Y%m%d-%H%M%S) && \
PORT=9090 BLOG_DATA_DIR=/home/yjh/my-blog-data BLOG_UPLOAD_DIR=/home/yjh/my-blog-uploads pm2 restart my-blog --update-env && \
pm2 status
```

## 10. 以后必须记住的三条

1. 不要再把 `node_modules` 推到 GitHub。
2. 不要让笔记服务再占 `3001`，固定回 `9090`。
3. 不要省略 `BLOG_DATA_DIR` 和 `BLOG_UPLOAD_DIR`。

