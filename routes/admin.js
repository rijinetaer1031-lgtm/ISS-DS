'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const _archiver = require('archiver');
const archiver = typeof _archiver === 'function' ? _archiver : (_archiver.default || _archiver.create);
const { pool, tx, logActivity, httpError } = require('../config/db');
const { str, getDatabaseExport, buildBackup } = require('../config/helpers');
const { ROLES, ADMIN_ROLES, requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.param('id', (req, res, next, val) =>
  /^\d{1,9}$/.test(val) ? next() : res.status(400).json({ success: false, error: 'Invalid id.' }));

const userAdmin = [requireAuth, requireRole(...ADMIN_ROLES)];

function assertCanManage(actorRole, targetRole) {
  if (actorRole !== 'Administrator' && targetRole === 'Administrator') {
    throw httpError(403, 'Only an Administrator can manage Administrator accounts.');
  }
}

async function loadTarget(id) {
  const { rows } = await pool.query('SELECT id, username, access_level, status FROM UserAccount WHERE id = $1', [id]);
  if (!rows[0]) throw httpError(404, 'User not found.');
  return rows[0];
}

router.get('/api/users', ...userAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT id, full_name, username, access_level, status, date_created FROM UserAccount ORDER BY date_created DESC');
  res.json(rows);
});

router.post('/api/users', ...userAdmin, async (req, res) => {
  const full_name = str(req.body.full_name), username = str(req.body.username);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const access_level = str(req.body.access_level);

  if (!full_name || !username || !password || !access_level) throw httpError(400, 'Fill in every field.');
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) throw httpError(400, 'Username: 3–32 letters, numbers, dot, dash or underscore.');
  if (password.length < 8) throw httpError(400, 'Password must be at least 8 characters.');
  if (!ROLES.includes(access_level)) throw httpError(400, 'Unknown access level.');
  assertCanManage(req.session.role, access_level);

  const hashed = await bcrypt.hash(password, 10);
  await tx(async (c) => {
    const dup = await c.query('SELECT 1 FROM UserAccount WHERE lower(username) = lower($1)', [username]);
    if (dup.rowCount) throw httpError(409, 'That username is already taken.');
    await c.query('INSERT INTO UserAccount (full_name, username, password_hash, access_level) VALUES ($1,$2,$3,$4)', [full_name, username, hashed, access_level]);
    await logActivity(req.session.userId, 'Create Account', null, `Created ${access_level} account: ${username}`, c);
  });
  res.status(201).json({ success: true });
});

router.put('/api/users/:id/role', ...userAdmin, async (req, res) => {
  const newRole = str(req.body.newRole);
  if (!ROLES.includes(newRole)) throw httpError(400, 'Unknown access level.');
  const target = await loadTarget(req.params.id);
  assertCanManage(req.session.role, newRole);
  assertCanManage(req.session.role, target.access_level);
  if (target.id === req.session.userId) throw httpError(400, 'You cannot change your own access level.');
  await pool.query('UPDATE UserAccount SET access_level = $1 WHERE id = $2', [newRole, target.id]);
  await logActivity(req.session.userId, 'Change Role', null, `${target.username}: ${target.access_level} → ${newRole}`);
  res.json({ success: true });
});

const setStatus = (status) => async (req, res) => {
  const target = await loadTarget(req.params.id);
  assertCanManage(req.session.role, target.access_level);
  if (target.id === req.session.userId) throw httpError(400, 'You cannot deactivate your own account.');
  await pool.query('UPDATE UserAccount SET status = $1 WHERE id = $2', [status, target.id]);
  await logActivity(req.session.userId, status === 'inactive' ? 'Deactivate Account' : 'Activate Account', null, target.username);
  res.json({ success: true });
};
router.put('/api/users/:id/deactivate', ...userAdmin, setStatus('inactive'));
router.put('/api/users/:id/activate', ...userAdmin, setStatus('active'));

router.put('/api/users/:id/reset-password', ...userAdmin, async (req, res) => {
  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
  if (newPassword.length < 8) throw httpError(400, 'Password must be at least 8 characters.');
  const target = await loadTarget(req.params.id);
  assertCanManage(req.session.role, target.access_level);
  await pool.query('UPDATE UserAccount SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(newPassword, 10), target.id]);
  await logActivity(req.session.userId, 'Reset Password', null, target.username);
  res.json({ success: true });
});

router.get('/api/activity', requireAuth, requireRole(...ADMIN_ROLES), async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 300, 1), 1000);
  const { rows } = await pool.query(
    `SELECT a.id, a.action_date, COALESCE(u.username, 'deleted-user') AS username, a.action_type,
            a.document_id, d.title AS document_title, a.result
     FROM ActivityLogEntry a
     LEFT JOIN UserAccount u ON a.user_id = u.id
     LEFT JOIN Document d ON a.document_id = d.id
     ORDER BY a.action_date DESC, a.id DESC LIMIT $1`, [limit]);
  res.json(rows);
});

router.get('/api/backup', requireAuth, requireRole('Administrator'), async (req, res) => {
  const dbBackup = await getDatabaseExport();
  res.attachment(`ISS_DS_Backup_${new Date().toISOString().split('T')[0]}.zip`);
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => { console.error('Backup stream error:', err); res.destroy(err); });
  archive.pipe(res);
  buildBackup(archive, dbBackup);
  await archive.finalize();
  logActivity(req.session.userId, 'System Backup', null, 'Generated manual system backup ZIP').catch(console.error);
});

module.exports = router;