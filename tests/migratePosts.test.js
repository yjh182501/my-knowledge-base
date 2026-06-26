const assert = require('node:assert/strict');
const test = require('node:test');
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const { createDatabase } = require('../src/db');
const { createPostStore } = require('../src/postStore');
const { migratePosts } = require('../src/migratePosts');

test('imports markdown and html posts once', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blog-migrate-'));
  try {
    const postsDir = join(dir, 'posts');
    mkdirSync(postsDir);
    writeFileSync(join(postsDir, '工作笔记.md'), '# 标题\n\n内容', 'utf8');
    writeFileSync(join(postsDir, '基础概念.html'), '<h1>基础概念</h1>', 'utf8');

    const db = createDatabase(join(dir, 'blog.sqlite'));
    const store = createPostStore(db);
    const first = migratePosts({ postsDir, store });
    const second = migratePosts({ postsDir, store });

    assert.equal(first.imported, 2);
    assert.equal(second.imported, 0);
    assert.equal(store.listAdminPosts().length, 2);
    assert.equal(store.listPublicPosts().length, 2);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
