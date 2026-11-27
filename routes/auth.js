'use strict';
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, logActivity, httpError } = require('../config/db');
const { str } = require('../config/helpers');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10);

const attempts = new Map();
function throttled(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || rec.reset < now) { attempts.set(ip, { n: 1, reset: now + 15 * 60 * 1000 }); return false; }
  rec.n += 1;
  return rec.n > 50;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k); }, 60 * 1000).unref();

router.post('/api/login', async (req, res) => {
  const username = str(req.body.username);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!username || !password) throw httpError(400, 'Enter your username and password.');
  if (throttled(req.ip)) throw httpError(429, 'Too many attempts. Try again in 15 minutes.');

  const { rows } = await pool.query('SELECT * FROM UserAccount WHERE lower(username) = lower($1)', [username]);
  const user = rows[0];

  let valid = false;
  if (user) {
    if (String(user.password_hash).startsWith('$2')) {
      valid = await bcrypt.compare(password, user.password_hash);
    } else {
      const a = Buffer.from(String(user.password_hash)), b = Buffer.from(password);
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
      if (valid) await pool.query('UPDATE UserAccount SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(password, 10), user.id]);
    }
  } else {
    await bcrypt.compare(password, DUMMY_HASH);
  }

  if (!valid) throw httpError(401, 'Invalid username or password.');
  if (String(user.status || 'active').toLowerCase() === 'inactive') throw httpError(403, 'This account is deactivated. Contact an administrator.');

  attempts.delete(req.ip);
  await new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
  Object.assign(req.session, { userId: user.id, role: user.access_level, username: user.username, fullName: user.full_name });
  await logActivity(user.id, 'Login', null, 'Success');
  res.json({ success: true, redirect: '/dashboard' });
});

const me = (req, res) => res.json({
  userId: req.session.userId, role: req.session.role,
  username: req.session.username, fullName: req.session.fullName,
});
router.get('/api/me', requireAuth, me);
router.get('/api/current-user', requireAuth, me);

module.exports = router;