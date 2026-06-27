const express = require('express');
const multer = require('multer');
const { mkdirSync } = require('node:fs');
const { extname, join } = require('node:path');
const crypto = require('node:crypto');

const { createConfig } = require('./config');
const { createDatabase } = require('./db');
const { createPostStore } = require('./postStore');
const { createAuth } = require('./auth');

function createApp(overrides = {}) {
  const config = createConfig(overrides);
  mkdirSync(config.dataDir, { recursive: true });
  mkdirSync(config.uploadDir, { recursive: true });

  const db = createDatabase(config.dbPath);
  const store = createPostStore(db);
  const auth = createAuth(config);
  const app = express();

  const upload = multer({
    storage: multer.diskStorage({
      destination: config.uploadDir,
      filename(req, file, callback) {
        const originalExt = extname(file.originalname || '').toLowerCase();
        const ext = ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(originalExt) ? originalExt : '.bin';
        callback(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
      },
    }),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter(req, file, callback) {
      if (!file.mimetype.startsWith('image/')) {
        callback(new Error('只支持图片上传'));
        return;
      }
      callback(null, true);
    },
  });

  app.locals.db = db;
  app.locals.store = store;
  app.use(express.json({ limit: '5mb' }));
  app.use('/uploads', express.static(config.uploadDir));
  app.use('/fonts/noto-serif-sc', express.static(join(__dirname, '..', 'node_modules', '@fontsource', 'noto-serif-sc')));
  app.use(express.static(config.staticDir));

  app.post('/api/auth/login', (req, res) => {
    if (req.body?.password !== config.adminPassword) {
      res.status(401).json({ ok: false, error: '密码错误' });
      return;
    }
    auth.issueSession(res);
    res.json({ ok: true });
  });

  app.post('/api/auth/logout', (req, res) => {
    auth.clearSession(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/check', (req, res) => {
    res.json({ ok: true, loggedIn: auth.isLoggedIn(req) });
  });

  app.get('/api/posts', (req, res) => {
    const q = String(req.query.q || '').trim();
    const posts = q ? store.searchPublicPosts(q) : store.listPublicPosts();
    res.json({ ok: true, posts: posts.map(toListPost) });
  });

  app.get('/api/posts/:slug', (req, res) => {
    const post = store.getPostBySlug(req.params.slug);
    if (!post || !isPubliclyVisible(post)) {
      res.status(404).json({ ok: false, error: '文章不存在' });
      return;
    }
    res.json({ ok: true, post });
  });

  app.get('/api/admin/posts', auth.requireAdmin, (req, res) => {
    const q = String(req.query.q || '').trim();
    const posts = q ? store.searchAdminPosts(q) : store.listAdminPosts();
    res.json({ ok: true, posts: posts.map(toAdminListPost) });
  });

  app.get('/api/admin/posts/:id', auth.requireAdmin, (req, res) => {
    const post = store.getPost(Number(req.params.id));
    if (!post) {
      res.status(404).json({ ok: false, error: '文章不存在' });
      return;
    }
    res.json({ ok: true, post });
  });

  app.post('/api/admin/posts', auth.requireAdmin, (req, res) => {
    try {
      const post = store.createPost(normalizeBody(req.body));
      res.status(201).json({ ok: true, post });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.put('/api/admin/posts/:id', auth.requireAdmin, (req, res) => {
    try {
      const post = store.updatePost(Number(req.params.id), normalizeBody(req.body));
      if (!post) {
        res.status(404).json({ ok: false, error: '文章不存在' });
        return;
      }
      res.json({ ok: true, post });
    } catch (error) {
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.delete('/api/admin/posts/:id', auth.requireAdmin, (req, res) => {
    const ok = store.deletePost(Number(req.params.id));
    if (!ok) {
      res.status(404).json({ ok: false, error: '文章不存在' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/admin/posts/batch-delete', auth.requireAdmin, (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const deleted = store.deletePosts(ids);
    res.json({ ok: true, deleted });
  });

  // 分享链接 API：生成分享 token
  app.post('/api/admin/posts/:id/share', auth.requireAdmin, (req, res) => {
    const post = store.generateShareToken(Number(req.params.id));
    if (!post) {
      res.status(404).json({ ok: false, error: '文章不存在' });
      return;
    }
    res.json({ ok: true, shareToken: post.shareToken });
  });

  // 分享链接 API：撤销分享
  app.delete('/api/admin/posts/:id/share', auth.requireAdmin, (req, res) => {
    const post = store.revokeShareToken(Number(req.params.id));
    if (!post) {
      res.status(404).json({ ok: false, error: '文章不存在' });
      return;
    }
    res.json({ ok: true });
  });

  // 分享阅读页面：通过 token 访问文章（无需登录）
  app.get('/share/:token', (req, res) => {
    const post = store.getPostByShareToken(req.params.token);
    if (!post) {
      res.status(404).send(generateShare404Page());
      return;
    }
    res.send(generateSharePage(post));
  });

  app.post('/api/admin/uploads', auth.requireAdmin, upload.single('file'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ ok: false, error: '请选择图片' });
      return;
    }
    res.status(201).json({ ok: true, url: `/uploads/${req.file.filename}` });
  });

  app.get(['/manage', '/admin'], (req, res) => {
    res.sendFile(join(config.staticDir, 'admin.html'));
  });

  return app;
}

function normalizeBody(body) {
  return {
    title: body.title,
    content: body.content,
    contentFormat: body.contentFormat || 'markdown',
    summary: body.summary || '',
    coverImage: body.coverImage || '',
    status: body.status || 'draft',
    publishedAt: body.publishedAt || null,
  };
}

function toListPost(post) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    coverImage: post.coverImage,
    contentFormat: post.contentFormat,
    status: post.status,
    shareToken: post.shareToken || null,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    snippet: post.snippet || '',
  };
}

function toAdminListPost(post) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    coverImage: post.coverImage,
    contentFormat: post.contentFormat,
    status: post.status,
    shareToken: post.shareToken || null,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    snippet: post.snippet || '',
  };
}

function isPubliclyVisible(post) {
  if (post.status === 'published') return true;
  if (post.status === 'scheduled' && post.publishedAt) {
    return new Date(post.publishedAt).getTime() <= Date.now();
  }
  return false;
}

function generateSharePage(post) {
  const title = escapeHtmlAttr(post.title);
  const date = formatDateZh(post.publishedAt || post.createdAt);
  const body = post.contentFormat === 'html' ? post.content : markdownToHtmlSimple(post.content);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - 分享阅读</title>
<style>
@import url("/fonts/noto-serif-sc/chinese-simplified.css");
*{margin:0;padding:0;box-sizing:border-box}
:root{--article-serif-font:"Noto Serif SC","Songti SC","STSong","SimSun","Times New Roman",serif}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;background:#f8fafc;color:#1e293b;line-height:1.75;min-height:100vh}
.share-header{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#0d9488 100%);padding:40px 20px 30px;text-align:center}
.share-header h1{color:#f0fdfa;font-size:1.5em;font-weight:700;margin-bottom:8px;word-break:break-word}
.share-header .date{color:#94a3b8;font-size:0.85em}
.share-badge{display:inline-block;background:rgba(13,148,136,0.2);color:#5eead4;font-size:0.75em;padding:2px 10px;border-radius:12px;border:1px solid rgba(13,148,136,0.3);margin-top:10px}
.share-container{max-width:780px;margin:0 auto;padding:24px 20px 60px}
.share-content{background:#fff;border-radius:12px;padding:32px 28px;box-shadow:0 1px 3px rgba(0,0,0,0.06)}
.share-content,.share-content :not(pre):not(code){font-family:var(--article-serif-font)!important}
.share-content img{max-width:100%;height:auto;border-radius:6px;margin:12px 0}
.share-content pre{background:#1e293b;color:#e2e8f0;padding:16px;border-radius:8px;overflow-x:auto;margin:14px 0;font-size:0.88em;line-height:1.6}
.share-content code{font-family:"SF Mono",Menlo,Monaco,Consolas,monospace;font-size:0.9em}
.share-content :not(pre)>code{background:#f1f5f9;color:#0f766e;padding:2px 6px;border-radius:4px}
.share-content table{width:100%;border-collapse:collapse;margin:14px 0;font-size:0.92em}
.share-content th,.share-content td{border:1px solid #e2e8f0;padding:8px 12px;text-align:left}
.share-content th{background:#f8fafc;font-weight:600}
.share-content blockquote{border-left:3px solid #0d9488;padding:8px 16px;margin:14px 0;color:#64748b;background:#f0fdfa;border-radius:0 6px 6px 0}
.share-content h1{font-size:1.4em;margin:24px 0 12px;color:#0f172a}
.share-content h2{font-size:1.25em;margin:20px 0 10px;color:#0f172a}
.share-content h3{font-size:1.1em;margin:16px 0 8px;color:#1e293b}
.share-content p{margin:10px 0}
.share-content ul,.share-content ol{margin:10px 0 10px 24px}
.share-content li{margin:4px 0}
.share-content a{color:#0d9488;text-decoration:none;border-bottom:1px dashed #0d9488}
.share-content a:hover{color:#0f766e;border-bottom-style:solid}
.share-content hr{border:none;border-top:1px solid #e2e8f0;margin:20px 0}
.share-footer{text-align:center;margin-top:40px;color:#94a3b8;font-size:0.8em}
.share-footer a{color:#0d9488;text-decoration:none}
@media(max-width:600px){.share-content{padding:20px 16px}.share-header{padding:28px 16px 20px}.share-header h1{font-size:1.25em}}
</style>
</head>
<body>
<div class="share-header">
  <h1>${escapeHtmlContent(post.title)}</h1>
  <div class="date">${date}</div>
  <span class="share-badge">分享阅读</span>
</div>
<div class="share-container">
  <div class="share-content">${body}</div>
  <div class="share-footer">由个人知识库分享</div>
</div>
</body>
</html>`;
}

function generateShare404Page() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>分享链接无效</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;background:#f8fafc;color:#1e293b;display:flex;align-items:center;justify-content:center;min-height:100vh}
.box{text-align:center;padding:40px}
.box h1{font-size:2em;color:#0f172a;margin-bottom:12px}
.box p{color:#64748b;margin-bottom:24px}
.box a{color:#0d9488;text-decoration:none;font-weight:600}
</style>
</head>
<body>
<div class="box">
  <h1>404</h1>
  <p>分享链接无效或已被撤销</p>
  <a href="/">返回首页</a>
</div>
</body>
</html>`;
}

function escapeHtmlAttr(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function escapeHtmlContent(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function formatDateZh(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
}

function markdownToHtmlSimple(markdown) {
  return escapeHtmlContent(markdown)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/!\[(.*?)\]\((.+?)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}

module.exports = { createApp };
