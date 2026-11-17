'use strict';
const path = require('path');
const fsp = require('fs').promises;
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { pool, tx, logActivity, httpError } = require('../config/db');
const {
  REPO_DIR, str, safeSegment, escapeLike, buildFileName, storedFile, toDoc, purgeDocument,
} = require('../config/helpers');
const {
  APPROVER_ROLES, canFinance, isFinance, visibility,
  requireAuth, requireRole, notOfficer, assertCategoryAccess, assertFolderAccess,
} = require('../middleware/auth');

const router = express.Router();
router.param('id', (req, res, next, val) =>
  /^\d{1,9}$/.test(val) ? next() : res.status(400).json({ success: false, error: 'Invalid id.' }));

const MAX_UPLOAD_MB = 25;
const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.png', '.jpg', '.jpeg']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DOC_SELECT = `
  SELECT d.id, d.title, d.category, d.subfolder,
         to_char(d.document_date, 'YYYY-MM-DD') AS document_date,
         d.approval_status, d.approver, d.approval_date,
         COALESCE(d.view_count, 0) AS view_count,
         dv.version_number, dv.standardized_file_name, dv.file_path
  FROM Document d
  JOIN LATERAL (
    SELECT version_number, standardized_file_name, file_path
    FROM DocumentVersion WHERE document_id = d.id
    ORDER BY version_number DESC LIMIT 1
  ) dv ON TRUE`;

/* ---- Document Types & Event Folders ---- */
router.get('/api/folders', requireAuth, async (req, res) => {
  const allowFinance = canFinance(req.session.role);
  const [types, events] = await Promise.all([
    pool.query('SELECT name FROM DocumentType WHERE is_deleted = FALSE ORDER BY id'),
    pool.query('SELECT id, category, name FROM EventFolder WHERE is_deleted = FALSE ORDER BY name'),
  ]);
  const hide = (c) => !allowFinance && isFinance(c);
  const map = {};
  events.rows.filter((e) => !hide(e.category)).forEach((e) => (map[e.category] ||= []).push({ id: e.id, name: e.name }));
  res.json({ types: types.rows.map((t) => t.name).filter((n) => !hide(n)), events: map });
});

router.post('/api/types', requireAuth, notOfficer, async (req, res) => {
  const name = str(req.body.name);
  if (!/^[\w][\w &.-]{1,39}$/.test(name)) throw httpError(400, 'Use 2–40 letters, numbers or spaces.');
  const r = await pool.query('INSERT INTO DocumentType (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id', [name]);
  if (!r.rowCount) {
    const bin = await pool.query('SELECT 1 FROM DocumentType WHERE name = $1 AND is_deleted', [name]);
    throw httpError(409, bin.rowCount ? 'That type is in the Recycle Bin. Restore it from there.' : 'That document type already exists.');
  }
  await logActivity(req.session.userId, 'Create Document Type', null, `Created type "${name}"`);
  res.status(201).json({ success: true });
});

router.delete('/api/types/:name', requireAuth, requireRole('Administrator'), async (req, res) => {
  const name = req.params.name;
  assertCategoryAccess(req.session.role, name);
  const count = await tx(async (c) => {
    const t = await c.query('UPDATE DocumentType SET is_deleted = TRUE, deleted_at = now() WHERE name = $1 AND is_deleted = FALSE RETURNING id', [name]);
    if (!t.rowCount) throw httpError(404, 'Document type not found.');
    const d = await c.query('UPDATE Document SET is_deleted = TRUE, deleted_with_type = TRUE WHERE category = $1 AND is_deleted = FALSE RETURNING id', [name]);
    await c.query('UPDATE EventFolder SET is_deleted = TRUE, deleted_at = now(), deleted_with_type = TRUE WHERE category = $1 AND is_deleted = FALSE', [name]);
    await logActivity(req.session.userId, 'Delete Document Type', null, `Moved type "${name}" and ${d.rowCount} document(s) to Recycle Bin`, c);
    return d.rowCount;
  });
  res.json({ success: true, documents: count });
});

router.get('/api/types/deleted', requireAuth, notOfficer, async (req, res) => {
  const { rows } = await pool.query(`SELECT t.name, t.deleted_at, (SELECT COUNT(*)::int FROM Document d WHERE d.category = t.name) AS doc_count
                                     FROM DocumentType t WHERE t.is_deleted ORDER BY t.deleted_at DESC`);
  res.json({ types: rows.filter((t) => !isFinance(t.name) || canFinance(req.session.role)) });
});

router.post('/api/types/restore/:name', requireAuth, notOfficer, async (req, res) => {
  const name = req.params.name;
  assertCategoryAccess(req.session.role, name);
  await tx(async (c) => {
    const t = await c.query('UPDATE DocumentType SET is_deleted = FALSE, deleted_at = NULL WHERE name = $1 AND is_deleted RETURNING id', [name]);
    if (!t.rowCount) throw httpError(404, 'Document type not found in the Recycle Bin.');
    await c.query('UPDATE Document SET is_deleted = FALSE, deleted_with_type = FALSE WHERE category = $1 AND deleted_with_type', [name]);
    await c.query('UPDATE EventFolder SET is_deleted = FALSE, deleted_at = NULL, deleted_with_type = FALSE WHERE category = $1 AND deleted_with_type', [name]);
    await logActivity(req.session.userId, 'Restore Document Type', null, `Restored type "${name}" with its events and documents`, c);
  });
  res.json({ success: true });
});

router.delete('/api/types/permanent/:name', requireAuth, requireRole('Administrator'), async (req, res) => {
  const name = req.params.name;
  assertCategoryAccess(req.session.role, name);
  const files = [];
  await tx(async (c) => {
    const t = await c.query('SELECT id FROM DocumentType WHERE name = $1 AND is_deleted FOR UPDATE', [name]);
    if (!t.rowCount) throw httpError(404, 'Document type not found in the Recycle Bin.');
    const docs = await c.query('SELECT id FROM Document WHERE category = $1', [name]);
    for (const d of docs.rows) await purgeDocument(c, d.id, files);
    await c.query('DELETE FROM EventFolder WHERE category = $1', [name]);
    await c.query('DELETE FROM DocumentType WHERE name = $1', [name]);
    await logActivity(req.session.userId, 'Permanent Delete', null, `Permanently deleted type "${name}" and ${docs.rowCount} document(s)`, c);
  });
  await Promise.all(files.map((f) => fsp.unlink(f).catch(() => {})));
  res.json({ success: true });
});

router.post('/api/folders', requireAuth, async (req, res) => {
  const category = str(req.body.category), name = str(req.body.name);
  if (!category || name.length < 2 || name.length > 80) throw httpError(400, 'Event name must be 2–80 characters.');
  if (name.toLowerCase() === 'general') throw httpError(400, '“General” is reserved.');
  assertCategoryAccess(req.session.role, category);
  const t = await pool.query('SELECT 1 FROM DocumentType WHERE name = $1 AND is_deleted = FALSE', [category]);
  if (!t.rowCount) throw httpError(400, 'Unknown document type.');
  const r = await pool.query(
    `INSERT INTO EventFolder (category, name) VALUES ($1,$2)
     ON CONFLICT (category, name) DO UPDATE SET is_deleted = FALSE, deleted_at = NULL WHERE EventFolder.is_deleted
     RETURNING id`, [category, name]);
  if (!r.rowCount) throw httpError(409, 'That event already exists in this document type.');
  await logActivity(req.session.userId, 'Create Event', null, `Created event "${name}" under ${category}`);
  res.status(201).json({ success: true, id: r.rows[0].id });
});

router.put('/api/folders/:id', requireAuth, notOfficer, async (req, res) => {
  await assertFolderAccess(req.session.role, req.params.id);
  const name = str(req.body.name);
  if (name.length < 2 || name.length > 80) throw httpError(400, 'Event name must be 2–80 characters.');
  if (name.toLowerCase() === 'general') throw httpError(400, '“General” is reserved.');
  await tx(async (c) => {
    const cur = await c.query('SELECT category, name FROM EventFolder WHERE id = $1 AND is_deleted = FALSE FOR UPDATE', [req.params.id]);
    if (!cur.rowCount) throw httpError(404, 'Event not found.');
    const { category, name: old } = cur.rows[0];
    const dup = await c.query('SELECT 1 FROM EventFolder WHERE category = $1 AND name = $2 AND id <> $3', [category, name, req.params.id]);
    if (dup.rowCount) throw httpError(409, 'An event with that name already exists.');
    await c.query('UPDATE EventFolder SET name = $1 WHERE id = $2', [name, req.params.id]);
    await c.query('UPDATE Document SET subfolder = $1 WHERE category = $2 AND subfolder = $3', [name, category, old]);
    await logActivity(req.session.userId, 'Rename Event', null, `"${old}" → "${name}" under ${category}`, c);
  });
  res.json({ success: true });
});

router.delete('/api/folders/:id', requireAuth, notOfficer, async (req, res) => {
  await assertFolderAccess(req.session.role, req.params.id);
  const r = await pool.query('UPDATE EventFolder SET is_deleted = TRUE, deleted_at = now() WHERE id = $1 AND is_deleted = FALSE RETURNING category, name', [req.params.id]);
  if (!r.rowCount) throw httpError(404, 'Event not found.');
  await logActivity(req.session.userId, 'Delete Event', null, `Moved event "${r.rows[0].name}" to Recycle Bin`);
  res.json({ success: true });
});

router.get('/api/folders/deleted', requireAuth, notOfficer, async (req, res) => {
  const { rows } = await pool.query('SELECT id, category, name, deleted_at FROM EventFolder WHERE is_deleted = TRUE ORDER BY deleted_at DESC');
  res.json({ folders: rows.filter((f) => !isFinance(f.category) || canFinance(req.session.role)) });
});

router.post('/api/folders/restore/:id', requireAuth, notOfficer, async (req, res) => {
  await assertFolderAccess(req.session.role, req.params.id);
  const r = await pool.query('UPDATE EventFolder SET is_deleted = FALSE, deleted_at = NULL WHERE id = $1 AND is_deleted RETURNING name', [req.params.id]);
  if (!r.rowCount) throw httpError(404, 'Event not found in the Recycle Bin.');
  await logActivity(req.session.userId, 'Restore Event', null, `Restored event "${r.rows[0].name}"`);
  res.json({ success: true });
});

router.delete('/api/folders/permanent/:id', requireAuth, requireRole('Administrator'), async (req, res) => {
  await assertFolderAccess(req.session.role, req.params.id);
  const r = await pool.query('DELETE FROM EventFolder WHERE id = $1 AND is_deleted RETURNING name', [req.params.id]);
  if (!r.rowCount) throw httpError(404, 'Event not found in the Recycle Bin.');
  await logActivity(req.session.userId, 'Permanent Delete', null, `Permanently deleted event "${r.rows[0].name}"`);
  res.json({ success: true });
});

/* ---- Documents ---- */
router.get('/api/documents', requireAuth, async (req, res) => {
  const role = req.session.role;
  const keyword = str(req.query.keyword), category = str(req.query.category);
  const params = [];
  let sql = `${DOC_SELECT} WHERE d.is_deleted = FALSE${visibility(role)}`;
  if (keyword) {
    params.push(`%${escapeLike(keyword)}%`);
    const p = `$${params.length}`;
    sql += ` AND (d.title ILIKE ${p} OR d.category ILIKE ${p} OR d.subfolder ILIKE ${p} OR dv.standardized_file_name ILIKE ${p})`;
  }
  if (category) { params.push(category); sql += ` AND d.category = $${params.length}`; }
  sql += ' ORDER BY d.document_date DESC, d.id DESC';
  const { rows } = await pool.query(sql, params);
  res.json({ userRole: role, documents: rows.map(toDoc) });
});

router.get('/api/documents/frequent', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`${DOC_SELECT} WHERE d.is_deleted = FALSE${visibility(req.session.role)} ORDER BY COALESCE(d.view_count,0) DESC, d.id DESC LIMIT 4`);
  res.json({ documents: rows.map(toDoc) });
});

router.get('/api/documents/deleted', requireAuth, notOfficer, async (req, res) => {
  const { rows } = await pool.query(`${DOC_SELECT} WHERE d.is_deleted = TRUE${visibility(req.session.role)} ORDER BY d.id DESC`);
  res.json({ userRole: req.session.role, documents: rows.map(toDoc) });
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    ALLOWED_EXT.has(path.extname(file.originalname).toLowerCase())
      ? cb(null, true)
      : cb(httpError(400, `Unsupported file type. Allowed: ${[...ALLOWED_EXT].join(' ')}`)),
});

router.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
  const title = str(req.body.title), category = str(req.body.category), date = str(req.body.date);
  const sub = str(req.body.subfolder) || 'General';
  const file = req.file;
  const { userId, role } = req.session;

  if (!file || !title || !category || !date) throw httpError(400, 'Title, type, date and file are all required.');
  if (title.length > 150) throw httpError(400, 'Title is too long (150 characters max).');
  if (!DATE_RE.test(date)) throw httpError(400, 'Invalid date.');
  assertCategoryAccess(role, category);

  const type = await pool.query('SELECT 1 FROM DocumentType WHERE name = $1 AND is_deleted = FALSE', [category]);
  if (!type.rowCount) throw httpError(400, 'Unknown document type.');
  if (sub !== 'General') {
    const ev = await pool.query('SELECT 1 FROM EventFolder WHERE category = $1 AND name = $2 AND is_deleted = FALSE', [category, sub]);
    if (!ev.rowCount) throw httpError(400, 'That event folder does not exist.');
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const dir = path.join(REPO_DIR, safeSegment(category));
  await fsp.mkdir(dir, { recursive: true });

  let writtenPath = null;
  try {
    const out = await tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${category}|${sub}|${title.toLowerCase()}`]);
      const found = await c.query('SELECT id, is_deleted FROM Document WHERE title = $1 AND category = $2 AND subfolder = $3', [title, category, sub]);

      let documentId, version = 1;
      if (found.rowCount) {
        if (found.rows[0].is_deleted) throw httpError(409, 'A document with this title is in the Recycle Bin. Restore it or pick another title.');
        documentId = found.rows[0].id;
        const v = await c.query('SELECT COALESCE(MAX(version_number),0) AS m FROM DocumentVersion WHERE document_id = $1', [documentId]);
        version = v.rows[0].m + 1;
      } else {
        const d = await c.query('INSERT INTO Document (title, category, subfolder, document_date) VALUES ($1,$2,$3,$4) RETURNING id', [title, category, sub, date]);
        documentId = d.rows[0].id;
      }

      const name = buildFileName(category, title, date, version, ext);
      const finalPath = path.join(dir, name);
      await fsp.writeFile(finalPath, file.buffer, { flag: 'wx' });
      writtenPath = finalPath;

      await c.query('INSERT INTO DocumentVersion (document_id, version_number, standardized_file_name, file_path, uploaded_by) VALUES ($1,$2,$3,$4,$5)', [documentId, version, name, finalPath, userId]);
      await logActivity(userId, 'Upload Document', documentId, `Version ${version} uploaded to ${sub}`, c);
      return { documentId, version, name };
    });
    res.status(201).json({ success: true, ...out });
  } catch (err) {
    if (writtenPath) await fsp.unlink(writtenPath).catch(() => {});
    throw err;
  }
});

router.put('/api/documents/:id', requireAuth, async (req, res) => {
  const title = str(req.body.title), category = str(req.body.category), date = str(req.body.date);
  const { userId, role } = req.session;
  if (!title || !category || !date) throw httpError(400, 'Title, type and date are required.');
  if (title.length > 150) throw httpError(400, 'Title is too long (150 characters max).');
  if (!DATE_RE.test(date)) throw httpError(400, 'Invalid date.');
  assertCategoryAccess(role, category);

  const moves = [];
  try {
    await tx(async (c) => {
      const cur = await c.query('SELECT id, category FROM Document WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (!cur.rowCount) throw httpError(404, 'Document not found.');
      assertCategoryAccess(role, cur.rows[0].category);
      const type = await c.query('SELECT 1 FROM DocumentType WHERE name = $1 AND is_deleted = FALSE', [category]);
      if (!type.rowCount) throw httpError(400, 'Unknown document type.');

      const versions = await c.query('SELECT id, version_number, standardized_file_name, file_path FROM DocumentVersion WHERE document_id = $1', [req.params.id]);
      const newDir = path.join(REPO_DIR, safeSegment(category));
      await fsp.mkdir(newDir, { recursive: true });

      for (const v of versions.rows) {
        const newName = buildFileName(category, title, date, v.version_number, path.extname(v.standardized_file_name));
        const from = storedFile(v), to = path.join(newDir, newName);
        if (from !== to) {
          try { await fsp.rename(from, to); moves.push({ from, to }); }
          catch (e) { if (e.code !== 'ENOENT') throw e; }
        }
        await c.query('UPDATE DocumentVersion SET standardized_file_name = $1, file_path = $2 WHERE id = $3', [newName, to, v.id]);
      }

      const moved = cur.rows[0].category !== category;
      await c.query(`UPDATE Document SET title = $1, category = $2, document_date = $3${moved ? ", subfolder = 'General'" : ''} WHERE id = $4`, [title, category, date, req.params.id]);
      await logActivity(userId, 'Edit Document', req.params.id, `Updated metadata (type: ${category})`, c);
    });
  } catch (err) {
    for (const m of moves.reverse()) await fsp.rename(m.to, m.from).catch(() => {});
    throw err;
  }
  res.json({ success: true });
});

const approve = [requireAuth, requireRole(...APPROVER_ROLES), async (req, res) => {
  const r = await pool.query(
    `UPDATE Document SET approval_status = 'Approved', approver = $1, approval_date = CURRENT_TIMESTAMP
     WHERE id = $2 AND is_deleted = FALSE AND approval_status IS DISTINCT FROM 'Approved' RETURNING id`,
    [req.session.username, req.params.id]);
  if (!r.rowCount) throw httpError(409, 'Document is already approved or no longer exists.');
  await logActivity(req.session.userId, 'Approve Document', req.params.id, 'Document marked as Approved');
  res.json({ success: true });
}];
router.post('/api/documents/approve/:id', ...approve);
router.post('/api/approve/:id', ...approve);

router.post('/api/documents/soft-delete/:id', requireAuth, notOfficer, async (req, res) => {
  const r = await pool.query(`UPDATE Document d SET is_deleted = TRUE WHERE d.id = $1 AND d.is_deleted = FALSE${visibility(req.session.role)} RETURNING d.id`, [req.params.id]);
  if (!r.rowCount) throw httpError(404, 'Document not found.');
  await logActivity(req.session.userId, 'Move to Recycle Bin', req.params.id, 'Document moved to recycle bin');
  res.json({ success: true });
});

router.post('/api/documents/restore/:id', requireAuth, notOfficer, async (req, res) => {
  const gone = await pool.query('SELECT t.name FROM Document d JOIN DocumentType t ON t.name = d.category WHERE d.id = $1 AND t.is_deleted', [req.params.id]);
  if (gone.rowCount) throw httpError(409, `Restore the document type “${gone.rows[0].name}” first.`);
  const r = await pool.query(`UPDATE Document d SET is_deleted = FALSE WHERE d.id = $1 AND d.is_deleted${visibility(req.session.role)} RETURNING d.id`, [req.params.id]);
  if (!r.rowCount) throw httpError(404, 'Document not found in the Recycle Bin.');
  await logActivity(req.session.userId, 'Restore Document', req.params.id, 'Document restored from recycle bin');
  res.json({ success: true });
});

router.delete('/api/documents/permanent-delete/:id', requireAuth, requireRole('Administrator'), async (req, res) => {
  const files = [];
  await tx(async (c) => {
    const d = await c.query(`SELECT d.title FROM Document d WHERE d.id = $1 AND d.is_deleted${visibility(req.session.role)} FOR UPDATE OF d`, [req.params.id]);
    if (!d.rowCount) throw httpError(404, 'Document not found in the Recycle Bin.');
    await purgeDocument(c, req.params.id, files);
    await logActivity(req.session.userId, 'Permanent Delete', null, `Permanently deleted "${d.rows[0].title}" (ID ${req.params.id})`, c);
  });
  await Promise.all(files.map((f) => fsp.unlink(f).catch(() => {})));
  res.json({ success: true });
});

router.post('/api/activity/log-view/:id', requireAuth, async (req, res) => {
  const r = await pool.query(`UPDATE Document d SET view_count = COALESCE(view_count,0) + 1 WHERE d.id = $1 AND d.is_deleted = FALSE${visibility(req.session.role)} RETURNING d.id`, [req.params.id]);
  if (!r.rowCount) throw httpError(404, 'Document not found.');
  await logActivity(req.session.userId, 'View Document', req.params.id, 'Document previewed or accessed');
  res.json({ success: true });
});

/* ---- Signed Preview Links ---- */
const sign = (secret, id, exp, name) =>
  crypto.createHmac('sha256', secret).update(`${id}.${exp}.${name}`).digest('hex');

router.get('/api/documents/:id/preview-link', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`${DOC_SELECT} WHERE d.id = $1 AND d.is_deleted = FALSE${visibility(req.session.role)}`, [req.params.id]);
  if (!rows[0]) throw httpError(404, 'Document not found.');
  const name = rows[0].standardized_file_name;
  const exp = Date.now() + 2 * 60 * 1000;
  res.json({ url: `/signed/${req.params.id}/${exp}/${sign(req.app.locals.sessionSecret, req.params.id, exp, name)}/${encodeURIComponent(name)}` });
});

router.get('/signed/:id/:exp/:sig/:name', async (req, res) => {
  const { id, exp, sig, name } = req.params;
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return res.sendStatus(403);
  const good = sign(req.app.locals.sessionSecret, id, exp, name);
  const ok = sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
  if (!ok) return res.sendStatus(403);
  const { rows } = await pool.query(`${DOC_SELECT} WHERE d.id = $1 AND d.is_deleted = FALSE`, [id]);
  if (!rows[0] || rows[0].standardized_file_name !== name) return res.sendStatus(404);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);
  res.sendFile(storedFile(rows[0]), (err) => { if (err && !res.headersSent) res.sendStatus(404); });
});

module.exports = router;