const assert = require('node:assert/strict');
const test = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('public detail view follows the same rich-text rhythm as the editor', () => {
  const css = readFileSync(join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(css, /\.article-body\s*\{\s*line-height:\s*1\.8;\s*font-size:\s*16px;/);
  assert.match(css, /@import url\("\/fonts\/noto-serif-sc\/chinese-simplified\.css"\)/);
  assert.match(css, /--article-serif-font:\s*"Noto Serif SC"/);
  assert.match(css, /\.article-body[\s\S]*font-family:\s*var\(--article-serif-font\)/);
  assert.match(css, /\.article-body :not\(pre\):not\(code\):not\(kbd\):not\(samp\)[\s\S]*font-family:\s*var\(--article-serif-font\) !important/);
  assert.match(css, /\.article-body table[\s\S]*margin:\s*12px 0/);
  assert.match(css, /\.article-body blockquote[\s\S]*margin:\s*12px 0/);
  assert.match(css, /\.article-body h1, \.article-body h2, \.article-body h3/);
  assert.match(css, /\.rich-editor table[\s\S]*display:\s*table/);
  assert.match(css, /\.rich-editor table[\s\S]*width:\s*100%\s*!important/);
});

test('share copy action shows a visible success toast', () => {
  const adminJs = readFileSync(join(__dirname, '..', 'public', 'admin.js'), 'utf8');
  const appJs = readFileSync(join(__dirname, '..', 'public', 'app.js'), 'utf8');

  assert.match(adminJs, /showCopyToast\('已复制链接'\)/);
  assert.match(appJs, /showShareCopyToast\('已复制分享链接'\)/);
});

test('admin destructive actions use the app confirm dialog instead of browser confirm', () => {
  const adminJs = readFileSync(join(__dirname, '..', 'public', 'admin.js'), 'utf8');

  assert.doesNotMatch(adminJs, /confirm\(/);
  assert.match(adminJs, /showConfirmDialog/);
});

test('in-article search stays scoped to the current article and uses a compact sheet', () => {
  const appJs = readFileSync(join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const css = readFileSync(join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(appJs, /postDetail\.querySelector\('\.article-body'\)/);
  assert.match(css, /\.in-article-search-panel[\s\S]*border-radius:\s*18px/);
  assert.match(css, /\.in-article-search-panel[\s\S]*max-height:\s*76vh/);
});

test('public post detail enters an immersive reading mode', () => {
  const appJs = readFileSync(join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const css = readFileSync(join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(appJs, /document\.body\.classList\.add\('reading-mode'\)/);
  assert.match(appJs, /document\.body\.classList\.remove\('reading-mode'\)/);
  assert.match(css, /body\.reading-mode \.site-header[\s\S]*display:\s*none/);
  assert.match(css, /body\.reading-mode \.search-shell[\s\S]*display:\s*none/);
});

test('front share copy uses a robust copy helper and updates the button state', () => {
  const appJs = readFileSync(join(__dirname, '..', 'public', 'app.js'), 'utf8');

  assert.match(appJs, /function copyTextToClipboard/);
  assert.match(appJs, /setShareCopyState\(button, true\)/);
  assert.match(appJs, /navigator\.clipboard\?\.writeText/);
});

test('editor mode tabs use dark active state and white inactive state', () => {
  const css = readFileSync(join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(css, /\.mode-btn[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.78\)/);
  assert.match(css, /\.mode-btn\.active[\s\S]*background:\s*linear-gradient/);
  assert.match(css, /\.mode-btn\.active[\s\S]*color:\s*#fff/);
});

test('in-article search marks the jumped result with an obvious active style', () => {
  const appJs = readFileSync(join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const css = readFileSync(join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(appJs, /classList\.toggle\('active-hit'/);
  assert.match(css, /mark\.in-article-highlight\.active-hit/);
  assert.match(css, /animation:\s*searchPulse/);
});

test('admin share copy button shows copied link state', () => {
  const adminJs = readFileSync(join(__dirname, '..', 'public', 'admin.js'), 'utf8');

  assert.match(adminJs, /已复制链接/);
  assert.match(adminJs, /button\.classList\.add\('copy-success'\)/);
});

test('reading mode top actions do not stay sticky while reading', () => {
  const css = readFileSync(join(__dirname, '..', 'public', 'styles.css'), 'utf8');
  const readingToolbarRule = css.match(/body\.reading-mode \.post-detail-topbar\s*\{[\s\S]*?\}/)?.[0] || '';

  assert.doesNotMatch(readingToolbarRule, /position:\s*sticky/);
  assert.match(readingToolbarRule, /position:\s*static/);
});

test('clicking an in-article search result closes the search sheet before reading', () => {
  const appJs = readFileSync(join(__dirname, '..', 'public', 'app.js'), 'utf8');

  assert.match(appJs, /jumpInArticle\(\{\s*closePanel:\s*true\s*\}\)/);
  assert.match(appJs, /if \(closePanel\) closeInArticleSearch\(\{ keepHighlights: true \}\)/);
});

test('admin mobile copy fallback shows a manual copy dialog instead of staying silent', () => {
  const adminJs = readFileSync(join(__dirname, '..', 'public', 'admin.js'), 'utf8');
  const css = readFileSync(join(__dirname, '..', 'public', 'styles.css'), 'utf8');

  assert.match(adminJs, /showManualCopyDialog/);
  assert.match(adminJs, /复制中/);
  assert.match(css, /\.manual-copy-text/);
});
