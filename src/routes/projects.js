const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authenticate, requireProjectAccess, requireProjectAdmin } = require('../middleware');

const router = express.Router();

// GET /api/projects - list projects for current user
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  let projects;
  if (req.user.role === 'admin') {
    projects = db.prepare(`
      SELECT p.*, u.name as owner_name,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as member_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') as done_count
      FROM projects p
      JOIN users u ON u.id = p.owner_id
      ORDER BY p.created_at DESC
    `).all();
  } else {
    projects = db.prepare(`
      SELECT p.*, u.name as owner_name, pm.role as my_role,
        (SELECT COUNT(*) FROM project_members pm2 WHERE pm2.project_id = p.id) as member_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') as done_count
      FROM projects p
      JOIN users u ON u.id = p.owner_id
      JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
      ORDER BY p.created_at DESC
    `).all(req.user.id);
  }
  res.json({ projects });
});

// POST /api/projects - create project
router.post('/', authenticate, (req, res) => {
  const { name, description, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Project name is required' });

  const db = getDb();
  const id = uuidv4();
  db.prepare(
    'INSERT INTO projects (id, name, description, color, owner_id) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name.trim(), description || '', color || '#6366f1', req.user.id);

  // Auto-add creator as admin member
  db.prepare(
    'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)'
  ).run(id, req.user.id, 'admin');

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  res.status(201).json({ project });
});

// GET /api/projects/:projectId - get single project with members
router.get('/:projectId', authenticate, requireProjectAccess, (req, res) => {
  const db = getDb();
  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_color, pm.role, pm.joined_at
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ?
    ORDER BY pm.joined_at ASC
  `).all(req.params.projectId);

  res.json({ project: req.project, members });
});

// PATCH /api/projects/:projectId - update project
router.patch('/:projectId', authenticate, requireProjectAccess, requireProjectAdmin, (req, res) => {
  const { name, description, color } = req.body;
  const db = getDb();
  db.prepare(
    'UPDATE projects SET name = COALESCE(?, name), description = COALESCE(?, description), color = COALESCE(?, color) WHERE id = ?'
  ).run(name || null, description !== undefined ? description : null, color || null, req.params.projectId);

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  res.json({ project });
});

// DELETE /api/projects/:projectId - delete project
router.delete('/:projectId', authenticate, requireProjectAccess, requireProjectAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.projectId);
  res.json({ message: 'Project deleted' });
});

// POST /api/projects/:projectId/members - add member
router.post('/:projectId/members', authenticate, requireProjectAccess, requireProjectAdmin, (req, res) => {
  const { user_id, role } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const existing = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').get(req.params.projectId, user_id);
  if (existing) return res.status(409).json({ error: 'User already in project' });

  db.prepare(
    'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)'
  ).run(req.params.projectId, user_id, role || 'member');

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar_color, pm.role, pm.joined_at
    FROM project_members pm JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ? ORDER BY pm.joined_at ASC
  `).all(req.params.projectId);

  res.status(201).json({ members });
});

// DELETE /api/projects/:projectId/members/:userId - remove member
router.delete('/:projectId/members/:userId', authenticate, requireProjectAccess, requireProjectAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(req.params.projectId, req.params.userId);
  res.json({ message: 'Member removed' });
});

module.exports = router;
