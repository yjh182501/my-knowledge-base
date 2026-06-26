const assert = require('node:assert/strict');
const test = require('node:test');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const { createDatabase } = require('../src/db');
const { createPostStore } = require('../src/postStore');

function createStore() {
  const dir = mkdtempSync(join(tmpdir(), 'blog-store-'));
  const db = createDatabase(join(dir, 'blog.sqlite'));
  const store = createPostStore(db);
  return {
    store,
    cleanup() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('creates a draft that is hidden from the public list', () => {
  const { store, cleanup } = createStore();
  try {
    const post = store.createPost({
      title: '草稿文章',
      content: '只给后台看',
      contentFormat: 'markdown',
      status: 'draft',
    });

    assert.equal(post.status, 'draft');
    assert.equal(store.listAdminPosts().length, 1);
    assert.equal(store.listPublicPosts().length, 0);
  } finally {
    cleanup();
  }
});

test('shows immediately published posts in the public list', () => {
  const { store, cleanup } = createStore();
  try {
    const post = store.createPost({
      title: '公开文章',
      content: '前台可见',
      contentFormat: 'markdown',
      status: 'published',
    });

    const publicPosts = store.listPublicPosts();
    assert.equal(publicPosts.length, 1);
    assert.equal(publicPosts[0].id, post.id);
  } finally {
    cleanup();
  }
});

test('hides scheduled posts before publish time and shows them after', () => {
  const { store, cleanup } = createStore();
  try {
    const now = new Date('2026-06-26T10:00:00.000Z');
    store.createPost({
      title: '定时文章',
      content: '时间到再显示',
      contentFormat: 'markdown',
      status: 'scheduled',
      publishedAt: '2026-06-26T12:00:00.000Z',
    });

    assert.equal(store.listPublicPosts({ now }).length, 0);
    assert.equal(store.listPublicPosts({ now: new Date('2026-06-26T12:00:00.000Z') }).length, 1);
  } finally {
    cleanup();
  }
});

test('updates an existing post without creating duplicates', () => {
  const { store, cleanup } = createStore();
  try {
    const post = store.createPost({
      title: '原标题',
      content: '旧内容',
      contentFormat: 'markdown',
      status: 'draft',
    });

    const updated = store.updatePost(post.id, {
      title: '新标题',
      content: '新内容',
      contentFormat: 'markdown',
      status: 'published',
    });

    assert.equal(updated.title, '新标题');
    assert.equal(updated.content, '新内容');
    assert.equal(store.listAdminPosts().length, 1);
  } finally {
    cleanup();
  }
});

test('deletes a post from admin and public lists', () => {
  const { store, cleanup } = createStore();
  try {
    const post = store.createPost({
      title: '要删除',
      content: '删除后不可见',
      contentFormat: 'markdown',
      status: 'published',
    });

    assert.equal(store.deletePost(post.id), true);
    assert.equal(store.listAdminPosts().length, 0);
    assert.equal(store.listPublicPosts().length, 0);
  } finally {
    cleanup();
  }
});

test('searches public posts by title and content only', () => {
  const { store, cleanup } = createStore();
  try {
    store.createPost({
      title: '设备点检',
      content: '标准化流程',
      contentFormat: 'markdown',
      status: 'published',
    });
    store.createPost({
      title: '隐藏草稿',
      content: '标准化流程',
      contentFormat: 'markdown',
      status: 'draft',
    });

    const results = store.searchPublicPosts('标准化');
    assert.equal(results.length, 1);
    assert.equal(results[0].title, '设备点检');
  } finally {
    cleanup();
  }
});

test('returns highlighted public search snippets from matched content', () => {
  const { store, cleanup } = createStore();
  try {
    store.createPost({
      title: '巡检规范',
      content: '第一段内容\n设备点检需要按标准化流程执行\n最后一段内容',
      contentFormat: 'markdown',
      status: 'published',
    });

    const results = store.searchPublicPosts('标准化');
    assert.equal(results.length, 1);
    assert.match(results[0].snippet, /<mark>标准化<\/mark>/);
  } finally {
    cleanup();
  }
});

test('searches admin posts including drafts and scheduled posts', () => {
  const { store, cleanup } = createStore();
  try {
    store.createPost({
      title: '后台草稿',
      content: '内部关键词',
      contentFormat: 'markdown',
      status: 'draft',
    });
    store.createPost({
      title: '公开文章',
      content: '普通内容',
      contentFormat: 'markdown',
      status: 'published',
    });

    const results = store.searchAdminPosts('内部关键词');
    assert.equal(results.length, 1);
    assert.equal(results[0].title, '后台草稿');
  } finally {
    cleanup();
  }
});

test('deletes multiple posts by id', () => {
  const { store, cleanup } = createStore();
  try {
    const first = store.createPost({
      title: '第一篇',
      content: '内容',
      contentFormat: 'markdown',
      status: 'draft',
    });
    const second = store.createPost({
      title: '第二篇',
      content: '内容',
      contentFormat: 'markdown',
      status: 'draft',
    });

    assert.equal(store.deletePosts([first.id, second.id, 999]), 2);
    assert.equal(store.listAdminPosts().length, 0);
  } finally {
    cleanup();
  }
});
