const crypto = require('node:crypto');
const cookie = require('cookie');

function createAuth(config) {
  const sessions = new Map();

  function issueSession(res) {
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { createdAt: Date.now() });
    res.setHeader('set-cookie', cookie.serialize(config.cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    }));
  }

  function clearSession(req, res) {
    const token = getToken(req);
    if (token) sessions.delete(token);
    res.setHeader('set-cookie', cookie.serialize(config.cookieName, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    }));
  }

  function getToken(req) {
    const cookies = cookie.parse(req.headers.cookie || '');
    return cookies[config.cookieName];
  }

  function isLoggedIn(req) {
    const token = getToken(req);
    return Boolean(token && sessions.has(token));
  }

  function requireAdmin(req, res, next) {
    if (!isLoggedIn(req)) {
      res.status(401).json({ ok: false, error: '请先登录' });
      return;
    }
    next();
  }

  return {
    issueSession,
    clearSession,
    isLoggedIn,
    requireAdmin,
  };
}

module.exports = { createAuth };
