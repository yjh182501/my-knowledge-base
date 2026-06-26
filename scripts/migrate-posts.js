const { join } = require('node:path');
const { createConfig } = require('../src/config');
const { createDatabase } = require('../src/db');
const { createPostStore } = require('../src/postStore');
const { migratePosts } = require('../src/migratePosts');

const config = createConfig({ rootDir: join(__dirname, '..') });
const db = createDatabase(config.dbPath);
const store = createPostStore(db);
const result = migratePosts({
  postsDir: join(config.rootDir, 'posts'),
  store,
});

console.log(`Imported ${result.imported} posts, skipped ${result.skipped} existing posts.`);
db.close();
