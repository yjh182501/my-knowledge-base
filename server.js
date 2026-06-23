const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const POSTS_DIR = path.join(__dirname, 'posts');
const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0'; // 绑定所有网络接口，让外网可访问

// ============================================================
// 密码保护配置
// ============================================================
// 部署到公网后，用这个密码才能发布/编辑/删除文章
// 查看文章不需要密码（公开浏览）
// ⚠️ 通过环境变量 POST_PASSWORD 设置密码，防止硬编码泄露
// 如果不设置环境变量，默认密码就是以下值（建议部署时通过环境变量设置）
const POST_PASSWORD = process.env.POST_PASSWORD || 'yjh199400';
// 建议部署后立即在 Zeabur 后台设置环境变量 POST_PASSWORD 改成你自己的密码

// Session cookie 有效期（7天）
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

// 生成简单的 session token
function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

// 简易 session 存储（内存中）
const sessions = new Map();

// 从 cookie 中解析 session
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) cookies[k.trim()] = v.join('=');
  });
  return cookies;
}

// 检查是否已登录（写操作需要）
function isLoggedIn(cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  const token = cookies['kb_session'];
  if (!token) return false;
  return sessions.has(token);
}

// 需要登录的 API 中间件
function requireAuth(req, res) {
  if (!isLoggedIn(req.headers.cookie)) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: '请先登录' }));
    return false;
  }
  return true;
}

function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch(e) { return ''; }
}

function getPostList() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md') || f.endsWith('.html'));
  return files.map(file => ({
    filename: file,
    name: file.replace('.md', '').replace('.html', ''),
    ext: file.endsWith('.html') ? 'html' : 'md',
  })).sort((a, b) => b.name.localeCompare(a.name, 'zh'));
}

function parseMarkdown(md) {
  const lines = md.split('\n');
  let html = '';
  let inList = false;
  let listTag = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.trim() === '') {
      if (inList) { html += `</${listTag}>\n`; inList = false; }
      continue;
    }
    if (line.match(/^#\s+(.*)/)) {
      if (inList) { html += `</${listTag}>\n`; inList = false; }
      html += `<h1>${line.replace(/^#\s+/, '')}</h1>\n`;
      continue;
    }
    if (line.match(/^##\s+(.*)/)) {
      if (inList) { html += `</${listTag}>\n`; inList = false; }
      html += `<h2>${line.replace(/^##\s+/, '')}</h2>\n`;
      continue;
    }
    if (line.match(/^###\s+(.*)/)) {
      if (inList) { html += `</${listTag}>\n`; inList = false; }
      html += `<h3>${line.replace(/^###\s+/, '')}</h3>\n`;
      continue;
    }
    if (line.match(/^>\s+(.*)/)) {
      if (inList) { html += `</${listTag}>\n`; inList = false; }
      html += `<blockquote>${line.replace(/^>\s+/, '')}</blockquote>\n`;
      continue;
    }
    if (line.match(/^-\s+(.*)/)) {
      if (!inList || listTag !== 'ul') {
        if (inList) html += `</${listTag}>\n`;
        html += '<ul>\n';
        inList = true;
        listTag = 'ul';
      }
      html += `<li>${formatInline(line.replace(/^-\s+/, ''))}</li>\n`;
      continue;
    }
    if (line.match(/^\d+\.\s+(.*)/)) {
      if (!inList || listTag !== 'ol') {
        if (inList) html += `</${listTag}>\n`;
        html += '<ol>\n';
        inList = true;
        listTag = 'ol';
      }
      html += `<li>${formatInline(line.replace(/^\d+\.\s+/, ''))}</li>\n`;
      continue;
    }
    if (inList) { html += `</${listTag}>\n`; inList = false; }
    if (line.match(/^---/)) { html += '<hr>\n'; continue; }
    if (line.includes('|')) {
      if (inList) { html += `</${listTag}>\n`; inList = false; }
      html += `<p>${formatInline(line)}</p>\n`;
      continue;
    }
    html += `<p>${formatInline(line)}</p>\n`;
  }
  if (inList) html += `</${listTag}>\n`;
  return html;
}

function formatInline(text) {
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/`(.+?)`/g, '<code>$1</code>');
  text = text.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');
  text = text.replace(/!\[(.+?)\]\((.+?)\)/g, '<img src="$2" alt="$1">');
  return text;
}

// 搜索文章（标题+内容）
function searchPosts(keyword) {
  const posts = getPostList();
  if (!keyword) return posts.map(p => ({ ...p, preview: '', matchPosition: -1 }));
  const kw = keyword.toLowerCase();
  
  return posts
    .map(p => {
      const filePath = path.join(POSTS_DIR, p.name + (p.ext === 'html' ? '.html' : '.md'));
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf-8');
      let preview = '';
      let highlightText = '';
      let matchPosition = -1;
      
      if (p.ext === 'html') {
        highlightText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      } else {
        highlightText = content.replace(/[#*`>\-\[\]()!]/g, '');
      }
      
      const titleMatch = p.name.toLowerCase().includes(kw);
      const contentLower = highlightText.toLowerCase();
      const contentIdx = contentLower.indexOf(kw);
      const contentMatch = contentIdx >= 0;
      matchPosition = contentIdx;
      
      if (contentMatch || titleMatch) {
        // 计算匹配位置的上下文
        if (matchPosition >= 0) {
          const start = Math.max(0, matchPosition - 30);
          const end = Math.min(highlightText.length, matchPosition + kw.length + 60);
          preview = (start > 0 ? '...' : '') + highlightText.substring(start, end) + (end < highlightText.length ? '...' : '');
        } else {
          // 标题匹配但没有内容匹配，显示文章开头
          preview = highlightText.substring(0, 100);
        }
        return { ...p, preview, titleMatch, contentMatch, matchPosition };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      // 标题匹配排最前
      if (a.titleMatch && !b.titleMatch) return -1;
      if (!a.titleMatch && b.titleMatch) return 1;
      // 内容匹配排前面
      if (a.contentMatch && !b.contentMatch) return -1;
      if (!a.contentMatch && b.contentMatch) return 1;
      return 0;
    });
}

// ===== 登录页面 HTML =====
function getLoginPage(error) {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>登录 - 个人知识库</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:#f5f5f0;color:#1a1a1a;display:flex;align-items:center;justify-content:center;min-height:100vh}
.login-box{background:white;border-radius:16px;padding:40px;box-shadow:0 4px 20px rgba(0,0,0,0.08);max-width:400px;width:90%;text-align:center}
.login-box h1{font-size:22px;margin-bottom:8px}
.login-box p{color:#999;font-size:14px;margin-bottom:24px}
.login-box input{width:100%;padding:14px 16px;border:2px solid #e8e8e8;border-radius:8px;font-size:16px;margin-bottom:16px;transition:border-color 0.2s}
.login-box input:focus{border-color:#07c160;outline:none}
.login-box button{width:100%;padding:14px;background:#07c160;color:white;border:none;border-radius:8px;font-size:16px;cursor:pointer;font-weight:bold}
.login-box button:hover{background:#06ad56}
.error-msg{color:#e74c3c;font-size:14px;margin-bottom:12px}
</style>
</head><body>
<div class="login-box">
  <h1>🔐 管理后台</h1>
  <p>请输入密码以发布或管理文章</p>
  ${error ? `<div class="error-msg">${error}</div>` : ''}
  <form method="POST" action="/api/login">
    <input type="password" name="password" placeholder="请输入管理密码" autofocus>
    <button type="submit">登录</button>
  </form>
  <p style="margin-top:20px;font-size:13px;color:#999"><a href="/" style="color:#07c160">← 返回首页浏览</a></p>
</div>
</body></html>`;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  // ===== 静态资源 =====
  if (pathname === '/style.css') {
    const cssPath = path.join(__dirname, 'style.css');
    if (fs.existsSync(cssPath)) {
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      res.end(fs.readFileSync(cssPath, 'utf-8'));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
    return;
  }

  // ===== search.js =====
  if (pathname === '/search.js') {
    const jsPath = path.join(__dirname, 'search.js');
    if (fs.existsSync(jsPath)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(fs.readFileSync(jsPath, 'utf-8'));
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // ===== 静态资源：public 目录（search.js 等） =====
  if (pathname.startsWith('/public/')) {
    const filePath = path.join(__dirname, pathname);
    if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.png': 'image/png', '.jpg': 'image/jpeg',
        '.gif': 'image/gif', '.svg': 'image/svg+xml',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(fs.readFileSync(filePath));
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // ===== 静态资源：posts 目录下的图片等 =====
  if (pathname.startsWith('/posts/')) {
    const filePath = path.join(__dirname, pathname);
    if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(fs.readFileSync(filePath));
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  // ===== API：登录 =====
  if (pathname === '/api/login' && method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      // 支持 form 表单提交和 JSON 提交
      let password = '';
      if (req.headers['content-type']?.includes('application/json')) {
        try {
          const data = JSON.parse(body);
          password = data.password || '';
        } catch(e) { password = ''; }
      } else {
        const params = new URLSearchParams(body);
        password = params.get('password') || '';
      }

      if (password === POST_PASSWORD) {
        const token = generateToken();
        sessions.set(token, { createdAt: Date.now() });
        // 设置 cookie，7天有效
        const cookieStr = `kb_session=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE}`;
        res.writeHead(302, {
          'Location': '/',
          'Set-Cookie': cookieStr,
        });
        res.end();
      } else {
        res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getLoginPage('❌ 密码错误，请重试'));
      }
    });
    return;
  }

  // ===== API：登出 =====
  if (pathname === '/api/logout' && method === 'POST') {
    if (isLoggedIn(req.headers.cookie)) {
      const cookies = parseCookies(req.headers.cookie);
      sessions.delete(cookies['kb_session']);
    }
    res.writeHead(302, {
      'Location': '/',
      'Set-Cookie': 'kb_session=; HttpOnly; Path=/; Max-Age=0',
    });
    res.end();
    return;
  }

  // ===== API：检查登录状态 =====
  if (pathname === '/api/auth/check' && method === 'GET') {
    const loggedIn = isLoggedIn(req.headers.cookie);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, loggedIn }));
    return;
  }

  // ===== API：搜索（公开，不需要登录） =====
  if (pathname === '/api/search' && method === 'GET') {
    const keyword = url.searchParams.get('q') || '';
    const results = searchPosts(keyword);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(results));
    return;
  }

  // ===== API：获取文章详情（公开） =====
  if (pathname.startsWith('/api/post/') && method === 'GET' && !pathname.endsWith('/edit')) {
    const encodedName = decodeURIComponent(pathname.replace('/api/post/', '').replace('/edit', ''));
    let filePath = path.join(POSTS_DIR, encodedName + '.html');
    let ext = 'html';
    if (!fs.existsSync(filePath)) {
      filePath = path.join(POSTS_DIR, encodedName + '.md');
      ext = 'md';
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ content, ext, name: encodedName }));
    return;
  }

  // ===== API：删除文章（需要登录） =====
  if (pathname.startsWith('/api/post/') && method === 'DELETE') {
    if (!requireAuth(req, res)) return;
    const encodedName = decodeURIComponent(pathname.replace('/api/post/', ''));
    let filePath = path.join(POSTS_DIR, encodedName + '.html');
    let ext = 'html';
    if (!fs.existsSync(filePath)) {
      filePath = path.join(POSTS_DIR, encodedName + '.md');
      ext = 'md';
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
      return;
    }
    try {
      fs.unlinkSync(filePath);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // ===== API：更新文章（需要登录） =====
  if (pathname.startsWith('/api/post/') && pathname.endsWith('/edit') && method === 'PUT') {
    if (!requireAuth(req, res)) return;
    const encodedName = decodeURIComponent(pathname.replace('/api/post/', '').replace('/edit', ''));
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const content = data.content;
        const mode = data.mode || 'markdown';
        const ext = mode === 'rich' ? '.html' : '.md';
        const filePath = path.join(POSTS_DIR, encodedName + ext);
        
        if (!fs.existsSync(filePath)) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'File not found' }));
          return;
        }
        
        fs.writeFileSync(filePath, content, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // ===== 首页（公开浏览 + 登录状态显示） =====
  if (pathname === '/' || pathname === '') {
    const posts = getPostList();
    const loggedIn = isLoggedIn(req.headers.cookie);
    const postCards = posts.map(p => {
      const linkExt = p.ext === 'html' ? 'html' : 'md';
      return `
      <div class="post-card" data-name="${encodeURIComponent(p.name)}">
        <a href="/post/${encodeURIComponent(p.name)}.${linkExt}">
          <h2>${p.name}</h2>
          <span class="meta">${p.ext === 'html' ? '🎨 富文本' : '📝 Markdown'} · 点击查看全文</span>
        </a>
      </div>`;
    }).join('');
    const body = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>个人知识库</title>
<style>${readFile(path.join(__dirname, 'style.css'))}</style>
</head><body>
<div class="container">
  <header class="site-header">
    <h1>📚 个人知识库</h1>
    <p>记录技术心得、工作笔记、学习资料</p>
    <div class="header-actions">
      ${loggedIn ? '<a href="/editor" class="publish-btn">✍️ 发布文章</a><button class="logout-btn" onclick="logout()">🚪 退出</button>' : '<a href="/login" class="login-btn">🔐 管理</a>'}
    </div>
  </header>
  <div class="search-bar">
    <input type="text" id="search-input" placeholder="搜索文章（标题+内容）..." oninput="doSearch(this.value)">
    <div id="search-results" class="search-results"></div>
  </div>
  <main class="post-list" id="post-list">${postCards || '<p class="empty">暂无文章，点击右上角"发布文章"来创建第一篇</p>'}</main>
  <footer><p>Powered by yjh182501</p></footer>
</div>
<script>
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function doSearch(q) {
  if (!q.trim()) {
    document.getElementById('search-results').innerHTML = '';
    return;
  }
  fetch('/api/search?q=' + encodeURIComponent(q))
    .then(r => r.json())
    .then(posts => {
      const container = document.getElementById('search-results');
      if (!posts || posts.length === 0) {
        container.innerHTML = '<div class="search-empty">未找到匹配的文章</div>';
        return;
      }
      container.innerHTML = posts.map(p => {
        const linkExt = p.ext === 'html' ? 'html' : 'md';
        const nameEsc = escapeHtml(p.name);
        const extLabel = p.ext === 'html' ? '富文本' : 'Markdown';
        let previewHtml = '';
        if (p.preview) {
          const previewEsc = escapeHtml(p.preview);
          previewHtml = '<div class="search-preview">' + previewEsc + '</div>';
        }
        const href = '/post/' + encodeURIComponent(p.name) + '.' + linkExt;
        return '<a class="search-item" href="' + href + '" data-keyword="' + escapeHtml(q) + '" data-preview="' + (p.preview || '') + '">' +
          '<div class="search-item-title">' + nameEsc + ' <small>[' + extLabel + ']</small></div>' +
          previewHtml +
          '</a>';
      }).join('');
      // 给搜索结果添加点击事件：跳转时带上 ?match=关键词
      container.querySelectorAll('.search-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
          var kw = this.getAttribute('data-keyword');
          var href = this.getAttribute('href') + '?match=' + encodeURIComponent(kw);
          window.location.href = href;
          e.preventDefault();
        });
      });
    })
    .catch(err => {
      console.error('搜索错误:', err);
      document.getElementById('search-results').innerHTML = '<div class="search-empty">搜索出错，请重试</div>';
    });
}

function logout() {
  fetch('/api/logout', { method: 'POST' })
    .then(() => location.reload());
}
</script>
</body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
    return;
  }

  // ===== 登录页 =====
  if (pathname === '/login') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(getLoginPage());
    return;
  }

  // ===== 文章页面（公开浏览） =====
  if (pathname.startsWith('/post/')) {
    const fullPath = pathname.replace('/post/', '');
    let ext = fullPath.endsWith('.html') ? 'html' : 'md';
    const namePart = fullPath.replace('.html', '').replace('.md', '');
    const encodedName = decodeURIComponent(namePart);
    
    let filePath = path.join(POSTS_DIR, encodedName + '.' + ext);
    
    if (!fs.existsSync(filePath)) {
      ext = ext === 'html' ? 'md' : 'html';
      filePath = path.join(POSTS_DIR, encodedName + '.' + ext);
    }
    
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 - 文章未找到</h1><a href="/">返回首页</a>');
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    let htmlContent;
    
    if (ext === 'html') {
      htmlContent = content;
    } else {
      htmlContent = parseMarkdown(content);
    }

    const loggedIn = isLoggedIn(req.headers.cookie);

    const body = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${encodedName} - 个人知识库</title>
<style>${readFile(path.join(__dirname, 'style.css'))}</style>
</head><body>
<div class="container">
  <article class="post-page">
    <a href="/" class="back-link">← 返回首页</a>
    <h1>${encodedName}</h1>
    ${loggedIn ? `
    <div class="post-actions">
      <button class="btn-edit" onclick="editPost('${encodeURIComponent(encodedName)}')">✏️ 编辑</button>
      <button class="btn-delete" onclick="deletePost('${encodeURIComponent(encodedName)}', '${ext}')">🗑️ 删除</button>
    </div>` : ''}
    <div class="post-content">${htmlContent}</div>
  </article>
  <footer><p>Powered by yjh182501</p></footer>
</div>

<!-- 文章内搜索按钮 -->
<button class="post-search-toggle visible" id="post-search-toggle" onclick="togglePostSearch()">🔍 本文搜索</button>

<!-- 搜索面板遮罩 -->
<div class="post-search-overlay" id="post-search-overlay" onclick="togglePostSearch()"></div>

<!-- 文章内搜索面板 -->
<div class="post-search-panel" id="post-search-panel">
  <div class="post-search-panel-header">
    <h3>🔍 本文搜索</h3>
    <div class="post-search-nav">
      <button class="post-search-nav-btn" id="post-search-prev" onclick="prevMatch()" disabled title="上一个匹配 (Shift+Enter)" aria-label="上一个匹配">↑</button>
      <span class="post-search-match-badge" id="post-search-badge">0/0</span>
      <button class="post-search-nav-btn" id="post-search-next" onclick="nextMatch()" disabled title="下一个匹配 (Enter)" aria-label="下一个匹配">↓</button>
    </div>
    <button class="post-search-close" onclick="togglePostSearch()">✕</button>
  </div>
  <div class="post-search-input-wrap">
    <input type="text" id="post-search-input" placeholder="搜索本文内容..." oninput="doPostSearch(this.value)" onkeydown="postSearchKeydown(event)">
  </div>
  <div class="post-search-count" id="post-search-count">
    <span>输入关键词开始搜索</span>
    <span class="post-search-hint"><kbd>Enter</kbd> 下一个 <kbd>Esc</kbd> 关闭</span>
  </div>
  <div class="post-search-results" id="post-search-results"></div>
</div>
<script>
// 搜索跳转定位
(function() {
  const urlParams = new URLSearchParams(window.location.search);
  const kw = urlParams.get('match');
  if (!kw) return;
  var el = document.querySelector('.post-content');
  if (!el) return;
  // 遍历所有文本节点，替换匹配关键词
  var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
  var nodes = [];
  while(walker.nextNode()) nodes.push(walker.currentNode);
  var escapedKw = kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  var regex = new RegExp(escapedKw, 'gi');
  var found = false;
  nodes.forEach(function(node) {
    if (found) return;
    if (node.textContent.toLowerCase().indexOf(kw.toLowerCase()) !== -1) {
      var span = document.createElement('span');
      span.innerHTML = node.textContent.replace(regex, '<mark class="search-highlight">$&</mark>');
      node.parentNode.replaceChild(span, node);
      found = true;
    }
  });
  if (found) {
    setTimeout(function() {
      var mark = el.querySelector('mark.search-highlight');
      if (mark) {
        mark.scrollIntoView({behavior:'smooth', block:'center'});
        mark.style.transition = 'background 2s';
        setTimeout(function(){ mark.style.background = 'transparent'; }, 2500);
      }
    }, 200);
  }
})();
</script>
<script>
function deletePost(name, ext) {
  if (!confirm('确定要删除这篇文章吗？')) return;
  fetch('/api/post/' + name, { method: 'DELETE' })
    .then(r => r.json())
    .then(res => {
      if (res.ok) {
        alert('✅ 已删除');
        location.href = '/';
      } else if (res.error === '请先登录') {
        alert('🔐 请先登录');
        location.href = '/login';
      } else {
        alert('❌ 删除失败：' + res.error);
      }
    });
}
function editPost(name) {
  fetch('/api/post/' + name)
    .then(r => r.json())
    .then(data => {
      if (data.error) { alert('文章不存在'); return; }
      const params = new URLSearchParams({
        edit: data.name,
        mode: data.ext === 'html' ? 'rich' : 'markdown'
      });
      sessionStorage.setItem('edit-content', data.content);
      location.href = '/editor?' + params.toString();
    });
}
</script>
<script src="/search.js"></script>
</body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
    return;
  }

  // ===== 编辑器页面（需要登录） =====
  if (pathname === '/editor') {
    if (!isLoggedIn(req.headers.cookie)) {
      res.writeHead(302, { 'Location': '/login' });
      res.end();
      return;
    }
    if (method === 'GET') {
      const editorPath = path.join(__dirname, 'editor.html');
      if (!fs.existsSync(editorPath)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('编辑器文件不存在');
        return;
      }
      const editorContent = fs.readFileSync(editorPath, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(editorContent);
      return;
    }
  }

  // ===== API：保存文章（需要登录） =====
  if (pathname === '/api/save' && method === 'POST') {
    if (!requireAuth(req, res)) return;
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const title = data.title;
        const content = data.content;
        const mode = data.mode || 'markdown';
        
        const ext = mode === 'rich' ? '.html' : '.md';
        const filename = title + ext;
        const filePath = path.join(POSTS_DIR, filename);

        if (!fs.existsSync(POSTS_DIR)) {
          fs.mkdirSync(POSTS_DIR, { recursive: true });
        }

        fs.writeFileSync(filePath, content, 'utf-8');

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ 
          ok: true, 
          filename: encodeURIComponent(title) + ext
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(PORT, HOST, () => {
  console.log(`✅ 服务器已启动`);
  console.log(`🌐 本地访问: http://localhost:${PORT}`);
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`📱 局域网访问: http://${net.address}:${PORT}`);
      }
    }
  }
  console.log(`📂 文章目录: ${POSTS_DIR}`);
  console.log(`💡 管理密码: ${POST_PASSWORD}`);
  console.log(`💡 提示: 访问 /login 登录后发布文章`);
  console.log(`💡 设置环境变量 POST_PASSWORD 可修改管理密码`);
});
