# Personal Blog CMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the personal blog into a self-hosted CMS with stable SQLite storage, separated frontend/backend responsibilities, admin writing, uploads, search, and scheduled publishing.

**Architecture:** Keep the app deployable as one Node process for 1Panel/Alibaba Cloud, but split responsibilities into focused backend modules and static frontend files. SQLite is the source of truth; existing `posts/` files are migrated once and then treated as backup input.

**Tech Stack:** Node.js 18+, Express, better-sqlite3, multer, cookie sessions, node:test, Nginx/PM2 deployment docs.

---

## File Structure

- `src/config.js`: paths, port, password, cookie settings.
- `src/db.js`: SQLite connection, schema setup, migration helpers.
- `src/postStore.js`: article CRUD, status filtering, search.
- `src/auth.js`: password login and cookie session helpers.
- `src/server.js`: Express app factory, routes, static frontend serving.
- `scripts/migrate-posts.js`: import existing `posts/*.md` and `posts/*.html`.
- `public/index.html`: reader-facing homepage shell.
- `public/admin.html`: admin writing and article management UI.
- `public/app.js`: frontend reader logic.
- `public/admin.js`: admin logic.
- `public/styles.css`: shared app styling.
- `tests/postStore.test.js`: database behavior tests.
- `tests/server.test.js`: API behavior tests.
- `server.js`: small production entrypoint.
- `README.md`: local and Alibaba Cloud deployment instructions.

## Tasks

### Task 1: SQLite Post Store

**Files:**
- Create: `src/config.js`
- Create: `src/db.js`
- Create: `src/postStore.js`
- Test: `tests/postStore.test.js`

- [ ] Write tests for creating drafts, publishing, scheduled visibility, updating without duplication, deleting, and search.
- [ ] Run `npm test -- tests/postStore.test.js` and confirm the tests fail because modules do not exist.
- [ ] Implement schema and post store functions.
- [ ] Run `npm test -- tests/postStore.test.js` and confirm the tests pass.

### Task 2: Backend API

**Files:**
- Create: `src/auth.js`
- Create: `src/server.js`
- Modify: `server.js`
- Test: `tests/server.test.js`

- [ ] Write API tests for auth, public article listing, admin article CRUD, scheduled visibility, and uploads.
- [ ] Run `npm test -- tests/server.test.js` and confirm the tests fail because the API does not exist.
- [ ] Implement Express routes and cookie auth.
- [ ] Run `npm test -- tests/server.test.js` and confirm the tests pass.

### Task 3: Frontend Separation

**Files:**
- Replace: `public/index.html`
- Replace: `public/admin.html`
- Create: `public/app.js`
- Create: `public/admin.js`
- Replace: `public/styles.css`

- [ ] Build the reader homepage and article detail UI against `/api/posts`.
- [ ] Build the admin article list and editor against `/api/admin/posts`.
- [ ] Support draft, publish now, and schedule publish controls.
- [ ] Verify locally in a browser that articles persist after server restart.

### Task 4: Migration and Deployment

**Files:**
- Create: `scripts/migrate-posts.js`
- Modify: `package.json`
- Modify: `README.md`

- [ ] Import existing `posts/` files into SQLite without duplicates.
- [ ] Add start, test, migrate, and production scripts.
- [ ] Document 1Panel/Alibaba Cloud deployment with IP-only access.
- [ ] Run migration and verify the current two articles appear in the new UI.

### Task 5: Final Verification

- [ ] Run the full test suite.
- [ ] Start the local server.
- [ ] Verify draft, immediate publish, scheduled publish, edit, delete, search, upload, and restart persistence.
- [ ] Review the diff for unrelated changes.

