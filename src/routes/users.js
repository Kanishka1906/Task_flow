const express = require('express');
const { getDb } = require('../db');
const { authenticate, requireAdmin } = require('../middleware');

const router = express.Router();

// GET /api/users - list all users (admin only)
router.get('/', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, name, email, role, avatar_color, created_at FROM users ORDER BY created_at ASC').all();
  res.json({ users });
});

// GET /api/users/search?q=
router.get('/search', authenticate, (req, res) => {
  const { q } = req.query;
  const db = getDb();
  const users = db.prepare(
    "SELECT id, name, email, role, avatar_color FROM users WHERE name LIKE ? OR email LIKE ? LIMIT 20"
  ).all(`%${q || ''}%`, `%${q || ''}%`);
  res.json({ users });
});

// PATCH /api/users/:id/role - change user role (admin only)
router.patch('/:id/role', authenticate, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const db = getDb();
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  const user = db.prepare('SELECT id, name, email, role, avatar_color FROM users WHERE id = ?').get(req.params.id);
  res.json({ user });
});

module.exports = router;
