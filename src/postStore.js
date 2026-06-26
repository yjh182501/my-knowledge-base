const slugify = require('slugify');
const crypto = require('node:crypto');

function createSlug(title) {
  const base = slugify(title, { lower: true, strict: true, locale: 'zh' });
  return base || encodeURIComponent(title).replace(/%/g, '').toLowerCase();
}

function toRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    contentFormat: row.content_format,
    summary: row.summary,
    coverImage: row.cover_image,
    status: row.status,
    shareToken: row.share_token || null,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
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

function createSnippet(post, term) {
  const source = stripHtml(`${post.title}\n${post.summary}\n${post.content}`);
  const lower = source.toLowerCase();
  const index = lower.indexOf(term.toLowerCase());
  if (index < 0) return '';
  const start = Math.max(0, index - 36);
  const end = Math.min(source.length, index + term.length + 56);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < source.length ? '...' : '';
  const snippet = escapeHtml(source.slice(start, end));
  const escapedTerm = escapeHtml(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return prefix + snippet.replace(new RegExp(escapedTerm, 'gi'), '<mark>$&</mark>') + suffix;
}

function normalizePost(input, existing) {
  const now = new Date().toISOString();
  const title = String(input.title || '').trim();
  const content = String(input.content || '');
  const status = input.status || 'draft';
  const contentFormat = input.contentFormat || 'markdown';

  if (!title) throw new Error('标题不能为空');
  if (!content.trim()) throw new Error('内容不能为空');
  if (!['draft', 'published', 'scheduled'].includes(status)) throw new Error('文章状态无效');
  if (!['markdown', 'html'].includes(contentFormat)) throw new Error('内容格式无效');
  if (status === 'scheduled' && !input.publishedAt) throw new Error('定时发布需要发布时间');

  return {
    slug: existing?.slug || input.slug || createSlug(title),
    title,
    content,
    contentFormat,
    summary: String(input.summary || ''),
    coverImage: String(input.coverImage || ''),
    status,
    publishedAt: status === 'draft' ? null : (input.publishedAt || now),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function createPostStore(db) {
  function ensureUniqueSlug(slug, ignoredId) {
    let candidate = slug;
    let suffix = 2;
    const find = db.prepare('SELECT id FROM posts WHERE slug = ?');
    while (true) {
      const existing = find.get(candidate);
      if (!existing || existing.id === ignoredId) return candidate;
      candidate = `${slug}-${suffix}`;
      suffix += 1;
    }
  }

  function getPost(id) {
    return toRow(db.prepare('SELECT * FROM posts WHERE id = ?').get(id));
  }

  function getPostBySlug(slug) {
    return toRow(db.prepare('SELECT * FROM posts WHERE slug = ?').get(slug));
  }

  function createPost(input) {
    const post = normalizePost(input);
    post.slug = ensureUniqueSlug(post.slug);
    const result = db.prepare(`
      INSERT INTO posts
        (slug, title, content, content_format, summary, cover_image, status, published_at, created_at, updated_at)
      VALUES
        (@slug, @title, @content, @contentFormat, @summary, @coverImage, @status, @publishedAt, @createdAt, @updatedAt)
    `).run(post);
    return getPost(result.lastInsertRowid);
  }

  function updatePost(id, input) {
    const existing = getPost(id);
    if (!existing) return null;
    const post = normalizePost(input, existing);
    post.slug = ensureUniqueSlug(input.slug || createSlug(post.title), id);
    post.id = id;
    db.prepare(`
      UPDATE posts
      SET slug = @slug,
          title = @title,
          content = @content,
          content_format = @contentFormat,
          summary = @summary,
          cover_image = @coverImage,
          status = @status,
          published_at = @publishedAt,
          updated_at = @updatedAt
      WHERE id = @id
    `).run(post);
    return getPost(id);
  }

  function deletePost(id) {
    const result = db.prepare('DELETE FROM posts WHERE id = ?').run(id);
    return result.changes > 0;
  }

  function deletePosts(ids) {
    const cleanIds = ids.map(Number).filter(Number.isInteger);
    if (cleanIds.length === 0) return 0;
    const remove = db.prepare('DELETE FROM posts WHERE id = ?');
    const transaction = db.transaction(values => {
      let deleted = 0;
      for (const id of values) deleted += remove.run(id).changes;
      return deleted;
    });
    return transaction(cleanIds);
  }

  function listAdminPosts() {
    return db.prepare('SELECT * FROM posts ORDER BY updated_at DESC, id DESC').all().map(toRow);
  }

  function listPublicPosts(options = {}) {
    const now = (options.now || new Date()).toISOString();
    return db.prepare(`
      SELECT * FROM posts
      WHERE status = 'published'
         OR (status = 'scheduled' AND published_at <= ?)
      ORDER BY published_at DESC, created_at DESC, id DESC
    `).all(now).map(toRow);
  }

  function searchPublicPosts(keyword, options = {}) {
    const term = String(keyword || '').trim().toLowerCase();
    if (!term) return listPublicPosts(options);
    return listPublicPosts(options).filter(post => {
      return post.title.toLowerCase().includes(term) || post.content.toLowerCase().includes(term);
    }).map(post => ({ ...post, snippet: createSnippet(post, keyword) }));
  }

  function searchAdminPosts(keyword) {
    const term = String(keyword || '').trim().toLowerCase();
    if (!term) return listAdminPosts();
    return listAdminPosts().filter(post => {
      return post.title.toLowerCase().includes(term)
        || post.summary.toLowerCase().includes(term)
        || post.content.toLowerCase().includes(term)
        || post.status.toLowerCase().includes(term);
    }).map(post => ({ ...post, snippet: createSnippet(post, keyword) }));
  }

  function generateShareToken(id) {
    const existing = getPost(id);
    if (!existing) return null;
    if (existing.shareToken) return existing; // 已有 token 直接返回
    const token = crypto.randomBytes(8).toString('hex');
    db.prepare('UPDATE posts SET share_token = ? WHERE id = ?').run(token, id);
    return getPost(id);
  }

  function revokeShareToken(id) {
    db.prepare('UPDATE posts SET share_token = NULL WHERE id = ?').run(id);
    return getPost(id);
  }

  function getPostByShareToken(token) {
    const row = db.prepare('SELECT * FROM posts WHERE share_token = ?').get(token);
    return toRow(row);
  }

  return {
    createPost,
    updatePost,
    deletePost,
    deletePosts,
    getPost,
    getPostBySlug,
    listAdminPosts,
    listPublicPosts,
    searchPublicPosts,
    searchAdminPosts,
    generateShareToken,
    revokeShareToken,
    getPostByShareToken,
  };
}

module.exports = { createPostStore, createSlug };
