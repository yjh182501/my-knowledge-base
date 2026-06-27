const assert = require('node:assert/strict');
const test = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { createConfig } = require('../src/config');

test('uses explicit persistent data and upload directories from environment', () => {
  const previousDataDir = process.env.BLOG_DATA_DIR;
  const previousUploadDir = process.env.BLOG_UPLOAD_DIR;
  const previousDbPath = process.env.BLOG_DB_PATH;
  try {
    process.env.BLOG_DATA_DIR = '/srv/my-blog-data';
    process.env.BLOG_UPLOAD_DIR = '/srv/my-blog-uploads';
    delete process.env.BLOG_DB_PATH;

    const config = createConfig({ rootDir: '/app/current' });

    assert.equal(config.dataDir, '/srv/my-blog-data');
    assert.equal(config.uploadDir, '/srv/my-blog-uploads');
    assert.equal(config.dbPath, '/srv/my-blog-data/blog.sqlite');
  } finally {
    restoreEnv('BLOG_DATA_DIR', previousDataDir);
    restoreEnv('BLOG_UPLOAD_DIR', previousUploadDir);
    restoreEnv('BLOG_DB_PATH', previousDbPath);
  }
});

test('keeps runtime data out of git by default', () => {
  const gitignore = readFileSync(join(__dirname, '..', '.gitignore'), 'utf8');

  assert.match(gitignore, /^data\/$/m);
  assert.match(gitignore, /^uploads\/$/m);
  assert.match(gitignore, /^logs\/$/m);
  assert.match(gitignore, /^\.env$/m);
});

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
