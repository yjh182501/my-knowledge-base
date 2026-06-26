const { existsSync, readdirSync, readFileSync } = require('node:fs');
const { extname, join, basename } = require('node:path');
const { createSlug } = require('./postStore');

function migratePosts({ postsDir, store }) {
  if (!existsSync(postsDir)) return { imported: 0, skipped: 0 };

  let imported = 0;
  let skipped = 0;
  const files = readdirSync(postsDir)
    .filter(file => ['.md', '.html'].includes(extname(file).toLowerCase()));

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const title = basename(file, ext);
    const slug = createSlug(title);
    if (store.getPostBySlug(slug)) {
      skipped += 1;
      continue;
    }
    store.createPost({
      slug,
      title,
      content: readFileSync(join(postsDir, file), 'utf8'),
      contentFormat: ext === '.html' ? 'html' : 'markdown',
      status: 'published',
    });
    imported += 1;
  }

  return { imported, skipped };
}

module.exports = { migratePosts };
