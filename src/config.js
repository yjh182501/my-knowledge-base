const { join } = require('node:path');

function createConfig(overrides = {}) {
  const rootDir = overrides.rootDir || process.cwd();
  const dataDir = overrides.dataDir || process.env.BLOG_DATA_DIR || join(rootDir, 'data');
  const uploadDir = overrides.uploadDir || process.env.BLOG_UPLOAD_DIR || join(rootDir, 'uploads');
  return {
    rootDir,
    dataDir,
    uploadDir,
    dbPath: overrides.dbPath || process.env.BLOG_DB_PATH || join(dataDir, 'blog.sqlite'),
    staticDir: overrides.staticDir || join(rootDir, 'public'),
    port: Number(overrides.port || process.env.PORT || 8080),
    host: overrides.host || process.env.HOST || '0.0.0.0',
    adminPassword: overrides.adminPassword || process.env.POST_PASSWORD || 'change-this-password',
    cookieName: 'blog_session',
  };
}

module.exports = { createConfig };
