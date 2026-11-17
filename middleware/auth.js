'use strict';
const { pool, httpError } = require('../config/db');

const ROLES = ['Officer', 'Secretary', 'Treasurer', 'President', 'Administrator'];
const ADMIN_ROLES = ['Administrator', 'President'];
const FINANCE_ROLES = ['President', 'Treasurer', 'Secretary'];
const APPROVER_ROLES = ['President'];

const isAdminish = (role) => ADMIN_ROLES.includes(role);
const canFinance = (role) => FINANCE_ROLES.includes(role);
const isFinance = (category) => String(category).toLowerCase() === 'finance';
const visibility = (role) => (canFinance(role) ? '' : " AND lower(d.category) <> 'finance'");

const wantsJson = (req) => req.originalUrl.startsWith('/api/') || req.accepts(['html', 'json']) === 'json';

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  if (wantsJson(req)) return res.status(401).json({ success: false, error: 'Please sign in again.' });
  res.redirect('/login');
}

const requireRole = (...roles) => (req, res, next) => {
  if (roles.includes(req.session.role)) return next();
  res.status(403).json({ success: false, error: `Access denied: ${roles.join(' or ')} only.` });
};

const notOfficer = (req, res, next) =>
  req.session.role === 'Officer'
    ? res.status(403).json({ success: false, error: 'Access denied: Officers cannot do this.' })
    : next();

function assertCategoryAccess(role, category) {
  if (isFinance(category) && !canFinance(role)) {
    throw httpError(403, 'Access denied: Finance documents are limited to the President, Treasurer and Secretary.');
  }
}

async function assertFolderAccess(role, id) {
  const r = await pool.query('SELECT category FROM EventFolder WHERE id = $1', [id]);
  if (r.rows[0]) assertCategoryAccess(role, r.rows[0].category);
}

module.exports = {
  ROLES, ADMIN_ROLES, FINANCE_ROLES, APPROVER_ROLES,
  isAdminish, canFinance, isFinance, visibility, wantsJson,
  requireAuth, requireRole, notOfficer, assertCategoryAccess, assertFolderAccess,
};