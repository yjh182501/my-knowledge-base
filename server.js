const { createApp } = require('./src/server');
const { createConfig } = require('./src/config');

const config = createConfig({ rootDir: __dirname });
const app = createApp(config);

app.listen(config.port, config.host, () => {
  console.log(`Blog CMS is running at http://localhost:${config.port}`);
  console.log(`Admin: http://localhost:${config.port}/manage`);
  console.log(`Database: ${config.dbPath}`);
  console.log(`Uploads: ${config.uploadDir}`);
});
