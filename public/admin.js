const loginPanel = document.getElementById('loginPanel');
const adminPanel = document.getElementById('adminPanel');
const passwordInput = document.getElementById('passwordInput');
const loginBtn = document.getElementById('loginBtn');
const loginMessage = document.getElementById('loginMessage');
const adminPostList = document.getElementById('adminPostList');
const adminMessage = document.getElementById('adminMessage');
const adminSearchInput = document.getElementById('adminSearchInput');
const selectAllPosts = document.getElementById('selectAllPosts');
const batchDeleteBtn = document.getElementById('batchDeleteBtn');
const richEditor = document.getElementById('richEditor');
const schedulePanel = document.getElementById('schedulePanel');
const richModeBtn = document.getElementById('richModeBtn');
const markdownModeBtn = document.getElementById('markdownModeBtn');
const fields = {
  title: document.getElementById('postTitle'),
  summary: document.getElementById('postSummary'),
  coverImage: document.getElementById('coverImage'),
  status: document.getElementById('postStatus'),
  publishedAt: document.getElementById('publishedAt'),
  content: document.getElementById('postContent'),
};
let posts = [];
let activeId = null;
let selectedIds = new Set();
let contentFormat = 'html';

async function checkAuth() {
  const response = await fetch('/api/auth/check');
  const body = await response.json();
  setLoggedIn(Boolean(body.loggedIn));
  if (body.loggedIn) await loadAdminPosts();
}

function setLoggedIn(value) {
  loginPanel.classList.toggle('hidden', value);
  adminPanel.classList.toggle('hidden', !value);
}

async function login() {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: passwordInput.value }),
  });
  if (!response.ok) {
    loginMessage.textContent = '密码错误';
    return;
  }
  loginMessage.textContent = '';
  setLoggedIn(true);
  await loadAdminPosts();
}

async function loadAdminPosts() {
  const q = adminSearchInput.value.trim();
  const response = await fetch('/api/admin/posts' + (q ? `?q=${encodeURIComponent(q)}` : ''));
  if (response.status === 401) {
    setLoggedIn(false);
    return;
  }
  const body = await response.json();
  posts = body.posts || [];
  selectedIds = new Set([...selectedIds].filter(id => posts.some(post => post.id === id)));
  renderAdminPosts();
  if (!activeId && posts[0]) selectPost(posts[0].id);
}

function renderAdminPosts() {
  adminPostList.innerHTML = posts.map(post => `
    <div class="admin-post ${post.id === activeId ? 'active' : ''}" data-id="${post.id}">
      <label class="post-check"><input type="checkbox" data-check-id="${post.id}" ${selectedIds.has(post.id) ? 'checked' : ''}></label>
      <button type="button" class="admin-post-main" data-open-id="${post.id}">
        <strong>${escapeHtml(post.title)}</strong>
        <span>${statusText(post)}</span>
        ${post.snippet ? `<em>${post.snippet}</em>` : ''}
      </button>
    </div>
  `).join('') || '<p class="empty">暂无文章</p>';
  adminPostList.querySelectorAll('[data-open-id]').forEach(button => {
    button.addEventListener('click', () => selectPost(Number(button.dataset.openId)));
  });
  adminPostList.querySelectorAll('[data-check-id]').forEach(input => {
    input.addEventListener('change', () => {
      const id = Number(input.dataset.checkId);
      if (input.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      updateBatchState();
    });
  });
  updateBatchState();
}

function updateBatchState() {
  const visibleIds = posts.map(post => post.id);
  const selectedVisibleCount = visibleIds.filter(id => selectedIds.has(id)).length;
  selectAllPosts.checked = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  batchDeleteBtn.disabled = selectedIds.size === 0;
  batchDeleteBtn.textContent = selectedIds.size ? `批量删除 ${selectedIds.size}` : '批量删除';
}

async function selectPost(id) {
  const response = await fetch(`/api/admin/posts/${id}`);
  if (response.status === 401) {
    setLoggedIn(false);
    return;
  }
  const body = await response.json();
  if (!body.ok) return;
  const post = body.post;

  activeId = post.id;
  contentFormat = post.contentFormat || 'html';
  fields.title.value = post.title || '';
  fields.summary.value = post.summary || '';
  fields.coverImage.value = post.coverImage || '';
  fields.status.value = post.status === 'draft' ? 'published' : post.status;
  fields.publishedAt.value = toDatetimeLocal(post.publishedAt);
  if (contentFormat === 'html') richEditor.innerHTML = post.content || '';
  else fields.content.value = post.content || '';
  setEditorMode(contentFormat);
  schedulePanel.classList.add('hidden');
  updateSharePanel(post);
  renderAdminPosts();

  // 如果有搜索关键词，高亮定位到第一个匹配
  if (adminSearchKeyword && contentFormat === 'html') {
    setTimeout(() => highlightAdminSearch(adminSearchKeyword), 100);
  }
}

function highlightAdminSearch(keyword) {
  const editor = richEditor;
  if (!editor || !keyword) return;

  // 清除旧高亮
  editor.querySelectorAll('mark.admin-search-hit').forEach(mark => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });

  const escaped = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');

  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  let firstMark = null;
  nodes.forEach(node => {
    if (node.textContent.toLowerCase().indexOf(keyword.toLowerCase()) !== -1) {
      const span = document.createElement('span');
      span.innerHTML = node.textContent.replace(regex, '<mark class="admin-search-hit">$&</mark>');
      node.parentNode.replaceChild(span, node);
      if (!firstMark) firstMark = span.querySelector('mark');
    }
  });

  if (firstMark) {
    firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    firstMark.style.background = '#fde68a';
    firstMark.style.boxShadow = '0 0 0 3px #fcd34d';
    firstMark.style.transition = 'background 2s, box-shadow 2s';
    setTimeout(() => {
      firstMark.style.background = 'rgba(39,196,153,0.3)';
      firstMark.style.boxShadow = '';
    }, 3000);
  }
}

function newPost() {
  activeId = null;
  Object.values(fields).forEach(field => { field.value = ''; });
  richEditor.innerHTML = '';
  contentFormat = 'html';
  setEditorMode('html');
  fields.status.value = 'published';
  schedulePanel.classList.add('hidden');
  document.getElementById('sharePanel').classList.add('hidden');
  document.getElementById('shareAdminBtn').classList.remove('hidden');
  renderAdminPosts();
}

function setEditorMode(mode) {
  contentFormat = mode;
  richModeBtn.classList.toggle('active', mode === 'html');
  markdownModeBtn.classList.toggle('active', mode === 'markdown');
  richEditor.classList.toggle('hidden', mode !== 'html');
  fields.content.classList.toggle('hidden', mode !== 'markdown');
}

function getEditorContent() {
  return contentFormat === 'html' ? richEditor.innerHTML.trim() : fields.content.value.trim();
}

async function savePost(status, options = {}) {
  const publishedAt = options.publishedAt || null;
  const payload = {
    title: fields.title.value.trim(),
    summary: fields.summary.value.trim(),
    coverImage: fields.coverImage.value.trim(),
    contentFormat,
    status,
    publishedAt,
    content: getEditorContent(),
  };
  const response = await fetch(activeId ? `/api/admin/posts/${activeId}` : '/api/admin/posts', {
    method: activeId ? 'PUT' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) {
    adminMessage.textContent = body.error || '保存失败';
    return false;
  }
  adminMessage.textContent = status === 'draft' ? '草稿已保存' : '文章已发布';
  activeId = body.post.id;
  await loadAdminPosts();
  return true;
}

async function deletePost() {
  if (!activeId) return;
  const confirmed = await showConfirmDialog({
    title: '删除当前文章',
    message: '确定删除这篇文章吗？删除后无法恢复。',
    confirmText: '删除',
    danger: true,
  });
  if (!confirmed) return;
  const response = await fetch(`/api/admin/posts/${activeId}`, { method: 'DELETE' });
  if (!response.ok) {
    adminMessage.textContent = '删除失败';
    return;
  }
  adminMessage.textContent = '已删除';
  activeId = null;
  newPost();
  await loadAdminPosts();
}

async function batchDelete() {
  if (selectedIds.size === 0) return;
  const confirmed = await showConfirmDialog({
    title: '批量删除文章',
    message: `确定删除选中的 ${selectedIds.size} 篇文章吗？删除后无法恢复。`,
    confirmText: '删除',
    danger: true,
  });
  if (!confirmed) return;
  const response = await fetch('/api/admin/posts/batch-delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [...selectedIds] }),
  });
  const body = await response.json();
  if (!response.ok) {
    adminMessage.textContent = body.error || '批量删除失败';
    return;
  }
  adminMessage.textContent = `已删除 ${body.deleted} 篇文章`;
  if (selectedIds.has(activeId)) {
    activeId = null;
    newPost();
  }
  selectedIds.clear();
  await loadAdminPosts();
}

async function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch('/api/admin/uploads', { method: 'POST', body: form });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '上传失败');
  return body.url;
}

async function handleEditorPaste(event) {
  const items = [...(event.clipboardData?.items || [])];
  const imageItem = items.find(item => item.type.startsWith('image/'));
  if (!imageItem) return;
  event.preventDefault();
  try {
    const url = await uploadFile(imageItem.getAsFile());
    if (contentFormat === 'html') {
      document.execCommand('insertHTML', false, `<img src="${url}" alt="">`);
    } else {
      insertAtTextarea(fields.content, `![图片](${url})`);
    }
    adminMessage.textContent = '图片已插入';
  } catch (error) {
    adminMessage.textContent = error.message;
  }
}

function insertAtTextarea(textarea, text) {
  const start = textarea.selectionStart || textarea.value.length;
  const end = textarea.selectionEnd || textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
}

function showPublishPanel() {
  schedulePanel.classList.toggle('hidden');
  if (!schedulePanel.classList.contains('hidden')) fields.status.focus();
}

function publishFromPanel() {
  const status = fields.status.value;
  if (status === 'scheduled') {
    if (!fields.publishedAt.value) {
      adminMessage.textContent = '请选择定时发布时间';
      return;
    }
    savePost('scheduled', { publishedAt: new Date(fields.publishedAt.value).toISOString() });
    return;
  }
  savePost('published');
}

function statusText(post) {
  if (post.status === 'draft') return '草稿';
  if (post.status === 'scheduled') return `定时 ${formatDate(post.publishedAt)}`;
  return `已发布 ${formatDate(post.publishedAt)}`;
}

function toDatetimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
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

let adminSearchTimer;
let adminSearchKeyword = '';
loginBtn.addEventListener('click', login);
passwordInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') login();
});
adminSearchInput.addEventListener('input', () => {
  clearTimeout(adminSearchTimer);
  adminSearchKeyword = adminSearchInput.value.trim();
  adminSearchTimer = setTimeout(loadAdminPosts, 180);
});
selectAllPosts.addEventListener('change', () => {
  posts.forEach(post => {
    if (selectAllPosts.checked) selectedIds.add(post.id);
    else selectedIds.delete(post.id);
  });
  renderAdminPosts();
});
document.getElementById('newPostBtn').addEventListener('click', newPost);
document.getElementById('saveDraftBtn').addEventListener('click', () => savePost('draft'));
document.getElementById('publishPostBtn').addEventListener('click', showPublishPanel);
document.getElementById('confirmPublishBtn').addEventListener('click', publishFromPanel);
document.getElementById('deletePostBtn').addEventListener('click', deletePost);
batchDeleteBtn.addEventListener('click', batchDelete);
richModeBtn.addEventListener('click', () => setEditorMode('html'));
markdownModeBtn.addEventListener('click', () => setEditorMode('markdown'));
richEditor.addEventListener('paste', handleEditorPaste);
fields.content.addEventListener('paste', handleEditorPaste);

// ========== 分享功能 ==========
function updateSharePanel(post) {
  const sharePanel = document.getElementById('sharePanel');
  const shareAdminBtn = document.getElementById('shareAdminBtn');
  const shareAdminUrl = document.getElementById('shareAdminUrl');

  if (post.shareToken) {
    const url = `${location.origin}/share/${post.shareToken}`;
    sharePanel.classList.remove('hidden');
    shareAdminBtn.classList.add('hidden');
    shareAdminUrl.textContent = url;
  } else {
    sharePanel.classList.add('hidden');
    shareAdminBtn.classList.remove('hidden');
  }
}

async function generateShare() {
  if (!activeId) { adminMessage.textContent = '请先选择文章'; return; }
  adminMessage.textContent = '正在生成分享链接...';
  const response = await fetch(`/api/admin/posts/${activeId}/share`, { method: 'POST' });
  const body = await response.json();
  if (!response.ok) { adminMessage.textContent = body.error || '生成失败'; return; }
  adminMessage.textContent = '分享链接已生成';
  const post = store_getPost_local(activeId);
  if (post) post.shareToken = body.shareToken;
  updateSharePanel({ shareToken: body.shareToken });
}

async function revokeShare() {
  if (!activeId) return;
  const confirmed = await showConfirmDialog({
    title: '撤销分享链接',
    message: '确定撤销分享链接吗？撤销后原链接将失效。',
    confirmText: '撤销',
    danger: true,
  });
  if (!confirmed) return;
  const response = await fetch(`/api/admin/posts/${activeId}/share`, { method: 'DELETE' });
  const body = await response.json();
  if (!response.ok) { adminMessage.textContent = body.error || '撤销失败'; return; }
  adminMessage.textContent = '分享链接已撤销';
  updateSharePanel({ shareToken: null });
}

async function copyShareUrl() {
  const shareAdminUrl = document.getElementById('shareAdminUrl');
  const copyButton = document.getElementById('copyShareUrlBtn');
  if (!shareAdminUrl) return;
  const url = shareAdminUrl.textContent.trim();
  if (!url) return;

  if (copyButton) copyButton.textContent = '复制中...';

  try {
    await copyTextWithFallback(url);
    showCopySuccess(copyButton);
  } catch (err) {
    showManualCopyDialog(url, copyButton);
  }
}

async function copyTextWithFallback(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement('textarea');
  input.value = text;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.top = '0';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  input.focus();
  input.select();
  input.setSelectionRange(0, input.value.length);
  const copied = document.execCommand('copy');
  document.body.removeChild(input);
  if (!copied) throw new Error('copy command failed');
}

function showCopySuccess(button) {
  adminMessage.textContent = '已复制链接';
  adminMessage.style.color = '#0f766e';
  showCopyToast('已复制链接');
  if (!button) return;
  const oldText = button.textContent;
  button.textContent = '已复制链接';
  button.classList.add('copy-success');
  setTimeout(() => {
    button.textContent = oldText;
    button.classList.remove('copy-success');
    adminMessage.style.color = '';
  }, 1800);
}

function showCopyToast(message) {
  const existing = document.querySelector('.copy-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 20);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 180);
  }, 1800);
}

function showManualCopyDialog(url, button) {
  if (button) button.textContent = '复制';
  adminMessage.textContent = '请长按链接手动复制';
  adminMessage.style.color = '#bf3b35';

  const overlay = document.createElement('div');
  overlay.className = 'app-dialog-overlay';
  overlay.innerHTML = `
    <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="manualCopyTitle">
      <div class="app-dialog-title" id="manualCopyTitle">手动复制链接</div>
      <div class="app-dialog-message">当前浏览器限制了自动复制，请长按下方链接复制。</div>
      <textarea class="manual-copy-text" readonly>${escapeHtml(url)}</textarea>
      <div class="app-dialog-actions">
        <button type="button" class="app-dialog-confirm">知道了</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => {
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 160);
    adminMessage.style.color = '';
  };
  const textArea = overlay.querySelector('.manual-copy-text');
  overlay.querySelector('.app-dialog-confirm').addEventListener('click', close);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) close();
  });
  setTimeout(() => {
    overlay.classList.add('show');
    if (textArea) {
      textArea.focus();
      textArea.select();
    }
  }, 20);
}

function showConfirmDialog({ title, message, confirmText = '确定', danger = false }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'app-dialog-overlay';
    overlay.innerHTML = `
      <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmDialogTitle">
        <div class="app-dialog-title" id="confirmDialogTitle">${escapeHtml(title)}</div>
        <div class="app-dialog-message">${escapeHtml(message)}</div>
        <div class="app-dialog-actions">
          <button type="button" class="app-dialog-cancel">取消</button>
          <button type="button" class="app-dialog-confirm ${danger ? 'danger' : ''}">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const onKeydown = event => {
      if (event.key !== 'Escape') return;
      close(false);
    };
    const close = value => {
      document.removeEventListener('keydown', onKeydown);
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 160);
      resolve(value);
    };

    overlay.querySelector('.app-dialog-cancel').addEventListener('click', () => close(false));
    overlay.querySelector('.app-dialog-confirm').addEventListener('click', () => close(true));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close(false);
    });
    document.addEventListener('keydown', onKeydown);
    setTimeout(() => overlay.classList.add('show'), 20);
  });
}

// 简易本地缓存，用于 updateSharePanel 后刷新
function store_getPost_local(id) {
  return posts.find(p => p.id === id);
}

document.getElementById('shareAdminBtn').addEventListener('click', generateShare);
document.getElementById('revokeShareBtn').addEventListener('click', revokeShare);
document.getElementById('copyShareUrlBtn').addEventListener('click', copyShareUrl);

checkAuth();
