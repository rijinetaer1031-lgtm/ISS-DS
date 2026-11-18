'use strict';
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const multer = require('multer');
const archiver = require('archiver');
const cron = require('node-cron');

const { pool, ensureSchema } = require('./config/db');
const { ROOT, REPO_DIR, BACKUP_DIR, getDatabaseExport, buildBackup } = require('./config/helpers');
const { isAdminish, canFinance, isFinance, wantsJson, requireAuth } = require('./middleware/auth');

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const VIEWS_DIR = path.join(ROOT, 'views');
const PUBLIC_DIR = path.join(ROOT, 'public');

if (!process.env.DATABASE_URL) {
  console.error('✖ DATABASE_URL is missing. Fill it in inside .env.');
  process.exit(1);
}
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const app = express();
app.locals.sessionSecret = SESSION_SECRET;
if (IS_PROD) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
      "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "frame-src 'self' https://docs.google.com",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  });
  next();
});

app.use(express.static(PUBLIC_DIR, {
  index: false, dotfiles: 'ignore',
  setHeaders: (res, file) => { if (/\.(js|css)$/.test(file)) res.set('Cache-Control', IS_PROD ? 'public, max-age=3600' : 'no-cache'); },
}));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));
app.use(session({
  store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  name: 'issds.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: 1000 * 60 * 60 * 8 },
}));

/* ---- HTML Pages ---- */
const sendView = (name) => (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(VIEWS_DIR, `${name}.html`));
};
const guard = (allowed, denyCode) => (req, res, next) =>
  allowed(req.session.role) ? next() : res.redirect(`/dashboard?error=${denyCode}`);

app.get('/', (req, res) => res.redirect(req.session.userId ? '/dashboard' : '/login'));
app.get('/login', (req, res, next) => (req.session.userId ? res.redirect('/dashboard') : sendView('login')(req, res, next)));
app.get('/logout', (req, res) => req.session.destroy(() => { res.clearCookie('issds.sid'); res.redirect('/login'); }));

app.get('/dashboard', requireAuth, sendView('dashboard'));
app.get('/upload', requireAuth, sendView('upload'));
app.get('/documents', requireAuth, sendView('documents'));
app.get('/activity-log', requireAuth, guard(isAdminish, 'activity_denied'), sendView('activity-log'));
app.get('/admin', requireAuth, guard(isAdminish, 'admin_denied'), sendView('admin'));
app.get('/recycle-bin', requireAuth, guard((r) => r !== 'Officer', 'bin_denied'), sendView('recycle-bin'));

/* ---- API Routes ---- */
app.use(require('./routes/auth'));
app.use(require('./routes/admin'));
app.use(require('./routes/documents'));

/* ---- Private File Delivery ---- */
app.use('/repository', requireAuth, (req, res, next) => {
  let folder = '';
  try { folder = decodeURIComponent(req.path).split('/')[1] || ''; } catch { return res.sendStatus(400); }
  if (isFinance(folder) && !canFinance(req.session.role)) return res.sendStatus(403);
  next();
}, express.static(REPO_DIR, { dotfiles: 'deny', index: false, fallthrough: false }));

/* ---- Weekly Scheduled Backup ---- */
cron.schedule('0 0 * * 0', async () => {
  console.log('Running scheduled weekly backup…');
  try {
    await fsp.mkdir(BACKUP_DIR, { recursive: true });
    const dbBackup = await getDatabaseExport();
    const target = path.join(BACKUP_DIR, `Weekly_Backup_${new Date().toISOString().split('T')[0]}.zip`);
    const output = fs.createWriteStream(target);
    const archive = archiver('zip', { zlib: { level: 6 } });
    const closed = new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); archive.on('error', reject); });
    archive.pipe(output);
    buildBackup(archive, dbBackup);
    await archive.finalize();
    await closed;
    const old = (await fsp.readdir(BACKUP_DIR)).filter((f) => f.startsWith('Weekly_Backup_')).sort().reverse().slice(8);
    await Promise.all(old.map((f) => fsp.unlink(path.join(BACKUP_DIR, f)).catch(() => {})));
    console.log('Weekly backup saved to /backups.');
  } catch (err) {
    console.error('Automated backup failed:', err);
  }
});

/* ---- Errors & Startup ---- */
app.use((req, res) => {
  if (wantsJson(req)) return res.status(404).json({ success: false, error: 'Not found.' });
  res.status(404).type('text').send('404 — Page not found');
});

app.use((err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message;
  if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 25 MB).' : err.message;
  } else if (err.code === 'ENOENT' && req.originalUrl.startsWith('/repository')) {
    status = 404; message = 'File not found.';
  } else if (status >= 500) {
    console.error(`${req.method} ${req.originalUrl}:`, err);
    message = IS_PROD ? 'Something went wrong on the server.' : err.message;
  }
  if (res.headersSent) return;
  res.status(status).json({ success: false, error: message });
});

let server;
(async () => {
  try { await ensureSchema(); } catch (err) { console.error('Schema bootstrap failed (continuing):', err.message); }
  server = app.listen(PORT, () => console.log(`ISS-DS running on http://localhost:${PORT}`));
})();

const shutdown = () => { console.log('Shutting down…'); (server ? server.close.bind(server) : (cb) => cb())(() => pool.end().then(() => process.exit(0))); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);