const assert = require('node:assert/strict');
const test = require('node:test');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const { createApp } = require('../src/server');

async function createTestServer() {
  const dir = mkdtempSync(join(tmpdir(), 'blog-api-'));
  const app = createApp({
    dataDir: join(dir, 'data'),
    uploadDir: join(dir, 'uploads'),
    adminPassword: 'secret-password',
    staticDir: join(dir, 'public'),
  });
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    baseUrl,
    async request(path, options) {
      return fetch(baseUrl + path, options);
    },
    async login() {
      const response = await fetch(baseUrl + '/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'secret-password' }),
      });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    },
    cleanup() {
      server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('rejects admin writes without login', async () => {
  const ctx = await createTestServer();
  try {
    const response = await ctx.request('/api/admin/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '未登录', content: '不能保存' }),
    });

    assert.equal(response.status, 401);
  } finally {
    ctx.cleanup();
  }
});

test('creates a draft through the admin API and hides it publicly', async () => {
  const ctx = await createTestServer();
  try {
    const cookie = await ctx.login();
    const createResponse = await ctx.request('/api/admin/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        title: '后台草稿',
        content: '还没发布',
        contentFormat: 'markdown',
        status: 'draft',
      }),
    });
    const created = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.equal(created.post.status, 'draft');

    const publicResponse = await ctx.request('/api/posts');
    const publicBody = await publicResponse.json();
    assert.deepEqual(publicBody.posts, []);
  } finally {
    ctx.cleanup();
  }
});

test('publishes and updates a post through the API without duplication', async () => {
  const ctx = await createTestServer();
  try {
    const cookie = await ctx.login();
    const createResponse = await ctx.request('/api/admin/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        title: '原文章',
        content: '旧内容',
        contentFormat: 'markdown',
        status: 'published',
      }),
    });
    const created = await createResponse.json();

    const updateResponse = await ctx.request(`/api/admin/posts/${created.post.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        title: '改后文章',
        content: '新内容',
        contentFormat: 'markdown',
        status: 'published',
      }),
    });
    assert.equal(updateResponse.status, 200);

    const adminResponse = await ctx.request('/api/admin/posts', { headers: { cookie } });
    const adminBody = await adminResponse.json();
    assert.equal(adminBody.posts.length, 1);
    assert.equal(adminBody.posts[0].title, '改后文章');
  } finally {
    ctx.cleanup();
  }
});

test('keeps scheduled posts hidden until their publish time', async () => {
  const ctx = await createTestServer();
  try {
    const cookie = await ctx.login();
    await ctx.request('/api/admin/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        title: '明天发布',
        content: '还不能看',
        contentFormat: 'markdown',
        status: 'scheduled',
        publishedAt: '2999-01-01T00:00:00.000Z',
      }),
    });

    const publicResponse = await ctx.request('/api/posts');
    const publicBody = await publicResponse.json();
    assert.equal(publicBody.posts.length, 0);
  } finally {
    ctx.cleanup();
  }
});

test('uploads an image for logged-in admin users', async () => {
  const ctx = await createTestServer();
  try {
    const cookie = await ctx.login();
    const filePath = join(tmpdir(), `upload-${Date.now()}.png`);
    writeFileSync(filePath, Buffer.from([137, 80, 78, 71]));
    const form = new FormData();
    form.append('file', new Blob([Buffer.from([137, 80, 78, 71])], { type: 'image/png' }), 'cover.png');

    const response = await ctx.request('/api/admin/uploads', {
      method: 'POST',
      headers: { cookie },
      body: form,
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.match(body.url, /^\/uploads\/.+\.png$/);
  } finally {
    ctx.cleanup();
  }
});

test('returns public search snippets for content matches', async () => {
  const ctx = await createTestServer();
  try {
    const cookie = await ctx.login();
    await ctx.request('/api/admin/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        title: '搜索测试',
        content: '这篇文章包含 Obsidian 风格搜索',
        contentFormat: 'markdown',
        status: 'published',
      }),
    });

    const response = await ctx.request('/api/posts?q=Obsidian');
    const body = await response.json();
    assert.equal(body.posts.length, 1);
    assert.match(body.posts[0].snippet, /<mark>Obsidian<\/mark>/);
  } finally {
    ctx.cleanup();
  }
});

test('searches admin posts and deletes posts in batches', async () => {
  const ctx = await createTestServer();
  try {
    const cookie = await ctx.login();
    const firstResponse = await ctx.request('/api/admin/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        title: '批量删除一',
        content: '后台搜索关键词',
        contentFormat: 'markdown',
        status: 'draft',
      }),
    });
    const secondResponse = await ctx.request('/api/admin/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        title: '批量删除二',
        content: '后台搜索关键词',
        contentFormat: 'markdown',
        status: 'draft',
      }),
    });
    const first = await firstResponse.json();
    const second = await secondResponse.json();

    const searchResponse = await ctx.request('/api/admin/posts?q=后台搜索关键词', { headers: { cookie } });
    const searchBody = await searchResponse.json();
    assert.equal(searchBody.posts.length, 2);

    const deleteResponse = await ctx.request('/api/admin/posts/batch-delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ ids: [first.post.id, second.post.id] }),
    });
    const deleteBody = await deleteResponse.json();
    assert.equal(deleteBody.deleted, 2);

    const adminResponse = await ctx.request('/api/admin/posts', { headers: { cookie } });
    const adminBody = await adminResponse.json();
    assert.equal(adminBody.posts.length, 0);
  } finally {
    ctx.cleanup();
  }
});
