'use strict';
const path = require('path');
const fs = require('fs');
const { pool } = require('./db');

const ROOT = path.join(__dirname, '..');
const REPO_DIR = path.join(ROOT, 'repository');
const BACKUP_DIR = path.join(ROOT, 'backups');

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const safeSegment = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
const escapeLike = (s) => s.replace(/[\\%_]/g, (m) => '\\' + m);

const buildFileName = (category, title, date, version, ext) =>
  `${safeSegment(category)}_${String(title).replace(/[^a-zA-Z0-9]/g, '_')}_${date}_v${version}${ext}`;

function storedFile(v) {
  const parts = String(v.file_path || '').split(/[\\/]/).filter(Boolean);
  const dir = parts.length > 1 ? parts[parts.length - 2] : '';
  return path.join(REPO_DIR, dir, v.standardized_file_name);
}

function fileUrl(row) {
  const parts = String(row.file_path || '').split(/[\\/]/).filter(Boolean);
  const dir = parts.length > 1 ? parts[parts.length - 2] : safeSegment(row.category);
  return `/repository/${encodeURIComponent(dir)}/${encodeURIComponent(row.standardized_file_name)}`;
}

const toDoc = ({ file_path, ...rest }) => ({ ...rest, file_url: fileUrl({ file_path, ...rest }) });

async function purgeDocument(c, id, files) {
  const vs = await c.query('SELECT standardized_file_name, file_path FROM DocumentVersion WHERE document_id = $1', [id]);
  vs.rows.forEach((v) => files.push(storedFile(v)));
  await c.query('UPDATE ActivityLogEntry SET document_id = NULL WHERE document_id = $1', [id]);
  await c.query('DELETE FROM DocumentVersion WHERE document_id = $1', [id]);
  await c.query('DELETE FROM Document WHERE id = $1', [id]);
}

async function getDatabaseExport() {
  const [users, docs, versions, activity, types, events] = await Promise.all([
    pool.query('SELECT id, full_name, username, access_level, status, date_created FROM UserAccount'),
    pool.query('SELECT * FROM Document'),
    pool.query('SELECT * FROM DocumentVersion'),
    pool.query('SELECT * FROM ActivityLogEntry'),
    pool.query('SELECT * FROM DocumentType'),
    pool.query('SELECT * FROM EventFolder'),
  ]);
  return {
    export_date: new Date().toISOString(),
    UserAccount: users.rows, Document: docs.rows, DocumentVersion: versions.rows,
    ActivityLogEntry: activity.rows, DocumentType: types.rows, EventFolder: events.rows,
  };
}

function buildBackup(archive, dbBackup) {
  archive.append(JSON.stringify(dbBackup, null, 2), { name: 'database_export.json' });
  if (fs.existsSync(REPO_DIR)) archive.directory(REPO_DIR, 'repository_files');
}

module.exports = {
  ROOT, REPO_DIR, BACKUP_DIR,
  str, safeSegment, escapeLike, buildFileName, storedFile, toDoc,
  purgeDocument, getDatabaseExport, buildBackup,
};