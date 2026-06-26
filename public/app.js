const postList = document.getElementById('postList');
const postDetail = document.getElementById('postDetail');
const searchInput = document.getElementById('searchInput');
const searchPanel = document.getElementById('searchPanel');

let currentSearch = '';

async function loadPosts(q = '') {
  const response = await fetch('/api/posts' + (q ? `?q=${encodeURIComponent(q)}` : ''));
  const body = await response.json();
  if (q) renderSearchResults(body.posts || [], q);
  else renderPostList(body.posts || []);
}

function renderPostList(posts) {
  postDetail.classList.add('hidden');
  postList.classList.remove('hidden');
  searchPanel.classList.add('hidden');
  if (posts.length === 0) {
    postList.innerHTML = '<p class="empty">暂无文章</p>';
    return;
  }
  postList.innerHTML = posts.map(post => `
    <button class="post-card" data-slug="${escapeAttr(post.slug)}">
      <span>${escapeHtml(formatDate(post.publishedAt || post.createdAt))}</span>
      <strong>${escapeHtml(post.title)}</strong>
      <em>${escapeHtml(post.summary || '点击查看全文')}</em>
    </button>
  `).join('');
  postList.querySelectorAll('.post-card').forEach(card => {
    card.addEventListener('click', () => loadPost(card.dataset.slug));
  });
}

function renderSearchResults(posts, keyword) {
  searchPanel.classList.remove('hidden');
  if (posts.length === 0) {
    searchPanel.innerHTML = '<div class="search-empty">没有找到匹配内容</div>';
    return;
  }
  searchPanel.innerHTML = posts.map(post => `
    <button class="search-result" data-slug="${escapeAttr(post.slug)}" data-keyword="${escapeAttr(keyword)}">
      <strong>${highlightText(post.title, keyword)}</strong>
      <span>${post.snippet || escapeHtml(post.summary || '标题匹配')}</span>
    </button>
  `).join('');
  searchPanel.querySelectorAll('.search-result').forEach(item => {
    item.addEventListener('click', () => loadPost(item.dataset.slug, item.dataset.keyword));
  });
}

async function loadPost(slug, keyword = '') {
  const response = await fetch(`/api/posts/${encodeURIComponent(slug)}`);
  const body = await response.json();
  if (!body.ok) return;
  const post = body.post;
  currentSearch = keyword;
  postList.classList.add('hidden');
  searchPanel.classList.add('hidden');
  postDetail.classList.remove('hidden');
  const articleHtml = post.contentFormat === 'html' ? post.content : markdownToHtml(post.content);
  postDetail.innerHTML = `
    <div class="post-detail-topbar">
      <button class="text-button" id="backBtn">返回列表</button>
      <div class="topbar-right">
        <button class="text-button" id="shareBtn" title="生成分享链接">🔗 分享</button>
        <button class="text-button" id="inArticleSearchBtn" title="在文章内搜索 (Ctrl+F)">🔍 页内搜索</button>
      </div>
    </div>
    <h1>${escapeHtml(post.title)}</h1>
    <p class="meta">${escapeHtml(formatDate(post.publishedAt || post.createdAt))}</p>
    <div class="article-body">${articleHtml}</div>
  `;
  document.getElementById('backBtn').addEventListener('click', () => {
    postDetail.classList.add('hidden');
    postList.classList.remove('hidden');
    closeInArticleSearch();
  });
  document.getElementById('inArticleSearchBtn').addEventListener('click', openInArticleSearch);
  document.getElementById('shareBtn').addEventListener('click', () => sharePost(post));
  if (keyword) {
    highlightArticle(keyword);
    setTimeout(() => {
      const first = postDetail.querySelector('mark.search-hit');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }
}

function highlightArticle(keyword) {
  const body = postDetail.querySelector('.article-body');
  if (!body || !keyword) return;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    if (!regex.test(node.textContent)) return;
    regex.lastIndex = 0;
    const span = document.createElement('span');
    span.innerHTML = escapeHtml(node.textContent).replace(regex, '<mark class="search-hit">$&</mark>');
    node.parentNode.replaceChild(span, node);
  });
}

function markdownToHtml(markdown) {
  return escapeHtml(markdown)
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

function highlightText(value, keyword) {
  const escapedValue = escapeHtml(value);
  const escapedKeyword = escapeHtml(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escapedValue.replace(new RegExp(escapedKeyword, 'gi'), '<mark>$&</mark>');
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  searchTimer = setTimeout(() => {
    currentSearch = q;
    loadPosts(q);
  }, 180);
});

// ========== 页内搜索功能 ==========
let inArticleMatches = [];
let inArticleActiveIndex = -1;
let inArticleSearchTimer;

function openInArticleSearch() {
  const panel = document.getElementById('inArticleSearchPanel');
  const overlay = document.getElementById('inArticleSearchOverlay');
  if (!panel) return;
  panel.classList.remove('hidden');
  overlay.classList.remove('hidden');
  const inp = document.getElementById('inArticleSearchInput');
  if (inp) { inp.focus(); inp.select(); }
}

function closeInArticleSearch() {
  const panel = document.getElementById('inArticleSearchPanel');
  const overlay = document.getElementById('inArticleSearchOverlay');
  if (panel) panel.classList.add('hidden');
  if (overlay) overlay.classList.add('hidden');
  clearInArticleHighlights();
  inArticleMatches = [];
  inArticleActiveIndex = -1;
}

function doInArticleSearch(q) {
  q = q.trim();
  const resultsEl = document.getElementById('inArticleSearchResults');
  const badge = document.getElementById('inArticleSearchBadge');
  inArticleActiveIndex = -1;

  if (!q) {
    if (resultsEl) resultsEl.innerHTML = '<div class="in-article-search-empty">输入关键词搜索当前文章</div>';
    if (badge) badge.textContent = '0/0';
    clearInArticleHighlights();
    return;
  }

  const contentEl = postDetail.querySelector('.article-body');
  if (!contentEl) return;

  // 收集所有文本节点
  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null, false);
  const allTextNodes = [];
  while (walker.nextNode()) allTextNodes.push(walker.currentNode);

  const fullText = allTextNodes.map(n => n.textContent).join('\n');
  const escapedQ = q.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(escapedQ, 'gi');

  inArticleMatches = [];
  let match;
  while ((match = regex.exec(fullText)) !== null) {
    const pos = match.index;
    const start = Math.max(0, pos - 40);
    const end = Math.min(fullText.length, pos + q.length + 40);
    const ctx = (start > 0 ? '...' : '') + fullText.substring(start, end) + (end < fullText.length ? '...' : '');
    inArticleMatches.push({ index: pos, text: match[0], context: ctx });
    regex.lastIndex = pos + 1;
  }

  if (inArticleMatches.length === 0) {
    if (resultsEl) resultsEl.innerHTML = '<div class="in-article-search-empty">未找到匹配内容</div>';
    if (badge) badge.textContent = '0/0';
    clearInArticleHighlights();
    return;
  }

  if (badge) badge.textContent = '1/' + inArticleMatches.length;

  // 渲染结果列表
  if (resultsEl) {
    resultsEl.innerHTML = inArticleMatches.map((m, i) => {
      const highlightedCtx = escapeHtml(m.context).replace(
        new RegExp(escapeHtml(m.text), 'gi'),
        '<mark>$&</mark>'
      );
      return `<div class="in-article-result-item" data-idx="${i}">${highlightedCtx}</div>`;
    }).join('');
    resultsEl.querySelectorAll('.in-article-result-item').forEach(item => {
      item.addEventListener('click', () => {
        inArticleActiveIndex = Number(item.dataset.idx);
        jumpInArticle();
      });
    });
  }

  // 高亮正文
  highlightInArticleContent(q, escapedQ);
  inArticleActiveIndex = 0;
  jumpInArticle();
}

function highlightInArticleContent(q, escapedQ) {
  const contentEl = postDetail.querySelector('.article-body');
  if (!contentEl) return;
  clearInArticleHighlights();

  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null, false);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  const regex = new RegExp(escapedQ, 'gi');
  nodes.forEach(node => {
    if (node.textContent.toLowerCase().indexOf(q.toLowerCase()) !== -1) {
      const span = document.createElement('span');
      span.innerHTML = node.textContent.replace(regex, '<mark class="in-article-highlight">$&</mark>');
      node.parentNode.replaceChild(span, node);
    }
  });
}

function clearInArticleHighlights() {
  const contentEl = postDetail.querySelector('.article-body');
  if (!contentEl) return;
  contentEl.querySelectorAll('mark.in-article-highlight').forEach(mark => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
}

function jumpInArticle() {
  const contentEl = postDetail.querySelector('.article-body');
  if (!contentEl) return;
  const marks = contentEl.querySelectorAll('mark.in-article-highlight');
  const badge = document.getElementById('inArticleSearchBadge');
  const resultsEl = document.getElementById('inArticleSearchResults');

  // 清除旧的高亮样式
  marks.forEach(m => {
    m.style.background = '';
    m.style.boxShadow = '';
  });

  if (marks[inArticleActiveIndex]) {
    marks[inArticleActiveIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    marks[inArticleActiveIndex].style.background = '#fde68a';
    marks[inArticleActiveIndex].style.boxShadow = '0 0 0 3px #fcd34d';
    marks[inArticleActiveIndex].style.transition = 'background 1.5s, box-shadow 1.5s';
    setTimeout(() => {
      if (marks[inArticleActiveIndex]) {
        marks[inArticleActiveIndex].style.background = '#fef08a';
        marks[inArticleActiveIndex].style.boxShadow = '0 0 0 2px #fde047';
      }
    }, 2000);
  }

  if (badge) badge.textContent = (inArticleActiveIndex + 1) + '/' + inArticleMatches.length;

  // 高亮结果列表中的当前项
  if (resultsEl) {
    resultsEl.querySelectorAll('.in-article-result-item').forEach((item, i) => {
      item.classList.toggle('active', i === inArticleActiveIndex);
    });
    const activeItem = resultsEl.querySelector('.in-article-result-item.active');
    if (activeItem) activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function nextInArticleMatch() {
  if (inArticleMatches.length === 0) return;
  inArticleActiveIndex = (inArticleActiveIndex + 1) % inArticleMatches.length;
  jumpInArticle();
}

function prevInArticleMatch() {
  if (inArticleMatches.length === 0) return;
  inArticleActiveIndex = (inArticleActiveIndex - 1 + inArticleMatches.length) % inArticleMatches.length;
  jumpInArticle();
}

// 页内搜索事件绑定
document.getElementById('inArticleSearchInput').addEventListener('input', () => {
  clearTimeout(inArticleSearchTimer);
  inArticleSearchTimer = setTimeout(() => {
    doInArticleSearch(document.getElementById('inArticleSearchInput').value);
  }, 200);
});

document.getElementById('inArticleSearchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.shiftKey ? prevInArticleMatch() : nextInArticleMatch();
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    closeInArticleSearch();
  }
});

document.getElementById('inArticleSearchNext').addEventListener('click', nextInArticleMatch);
document.getElementById('inArticleSearchPrev').addEventListener('click', prevInArticleMatch);
document.getElementById('inArticleSearchClose').addEventListener('click', closeInArticleSearch);
document.getElementById('inArticleSearchOverlay').addEventListener('click', closeInArticleSearch);

// Ctrl+F / Cmd+F 在文章详情页时打开页内搜索
document.addEventListener('keydown', (e) => {
  if ((e.key === 'f' && (e.metaKey || e.ctrlKey)) || e.key === 'F3') {
    if (!postDetail.classList.contains('hidden')) {
      e.preventDefault();
      openInArticleSearch();
    }
  }
});

// ========== 分享功能 ==========
function sharePost(post) {
  // 如果已有 shareToken，直接显示
  if (post.shareToken) {
    showShareDialog(post.shareToken);
    return;
  }
  // 前台没有权限生成 token，提示用户去后台操作
  // 但我们可以尝试通过 API 生成（需要登录）
  // 前台用户未登录，所以直接提示
  const shareUrl = `${location.origin}/share/`;
  const msg = '分享链接需要在后台管理中生成。\n\n请进入后台 → 选择文章 → 点击「分享」按钮生成分享链接。';
  // 尝试生成（如果已登录则直接成功）
  fetch(`/api/admin/posts/${post.id}/share`, { method: 'POST' })
    .then(res => {
      if (res.status === 401) {
        alert(msg);
        return;
      }
      return res.json();
    })
    .then(body => {
      if (body && body.ok) {
        showShareDialog(body.shareToken);
      }
    })
    .catch(() => {
      alert(msg);
    });
}

function showShareDialog(token) {
  const url = `${location.origin}/share/${token}`;
  // 创建弹窗
  const overlay = document.createElement('div');
  overlay.className = 'share-dialog-overlay';
  overlay.addEventListener('click', () => overlay.remove());

  const dialog = document.createElement('div');
  dialog.className = 'share-dialog';
  dialog.addEventListener('click', e => e.stopPropagation());

  dialog.innerHTML = `
    <div class="share-dialog-title">分享阅读链接</div>
    <div class="share-dialog-desc">任何人通过此链接都可以阅读这篇文章，无需登录</div>
    <div class="share-dialog-url">
      <input type="text" value="${url}" readonly id="shareUrlInput">
      <button class="share-copy-btn" id="shareCopyBtn">复制</button>
    </div>
    <div class="share-dialog-hint">链接可随时在后台撤销</div>
    <button class="share-dialog-close" id="shareDialogClose">关闭</button>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const input = document.getElementById('shareUrlInput');
  input.select();

  document.getElementById('shareCopyBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(url).then(() => {
      document.getElementById('shareCopyBtn').textContent = '已复制';
      setTimeout(() => {
        document.getElementById('shareCopyBtn').textContent = '复制';
      }, 2000);
    }).catch(() => {
      input.select();
      document.execCommand('copy');
      document.getElementById('shareCopyBtn').textContent = '已复制';
    });
  });

  document.getElementById('shareDialogClose').addEventListener('click', () => overlay.remove());
}

loadPosts();
