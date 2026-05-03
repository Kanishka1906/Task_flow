const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { authenticate, requireProjectAccess } = require('../middleware');

const router = express.Router();

const TASK_SELECT = `
  SELECT t.*,
    u_a.name as assignee_name, u_a.email as assignee_email, u_a.avatar_color as assignee_color,
    u_c.name as creator_name,
    p.name as project_name, p.color as project_color
  FROM tasks t
  LEFT JOIN users u_a ON u_a.id = t.assignee_id
  LEFT JOIN users u_c ON u_c.id = t.creator_id
  LEFT JOIN projects p ON p.id = t.project_id
`;

// GET /api/tasks - get tasks for current user (dashboard)
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { status, priority, project_id, assignee } = req.query;

  let query = TASK_SELECT;
  const conditions = [];
  const params = [];

  if (req.user.role !== 'admin') {
    conditions.push(`t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?)`);
    params.push(req.user.id);
  }
  if (status) { conditions.push(`t.status = ?`); params.push(status); }
  if (priority) { conditions.push(`t.priority = ?`); params.push(priority); }
  if (project_id) { conditions.push(`t.project_id = ?`); params.push(project_id); }
  if (assignee === 'me') { conditions.push(`t.assignee_id = ?`); params.push(req.user.id); }

  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY t.created_at DESC';

  const tasks = db.prepare(query).all(...params);
  res.json({ tasks });
});

// GET /api/tasks/dashboard - summary stats
router.get('/dashboard', authenticate, (req, res) => {
  const db = getDb();
  const projectFilter = req.user.role !== 'admin'
    ? `AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id = '${req.user.id}')`
    : '';

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todo,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) as review,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN due_date < DATE('now') AND status != 'done' THEN 1 ELSE 0 END) as overdue,
      SUM(CASE WHEN assignee_id = '${req.user.id}' THEN 1 ELSE 0 END) as assigned_to_me
    FROM tasks t WHERE 1=1 ${projectFilter}
  `).get();

  const recentTasks = db.prepare(`
    ${TASK_SELECT}
    WHERE t.assignee_id = ? OR t.creator_id = ?
    ORDER BY t.updated_at DESC LIMIT 5
  `).all(req.user.id, req.user.id);

  const overdueTasks = db.prepare(`
    ${TASK_SELECT}
    WHERE t.due_date < DATE('now') AND t.status != 'done'
    ${projectFilter.replace('AND ', 'AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?)').replace(`'${req.user.id}'`, '')}
    ORDER BY t.due_date ASC LIMIT 5
  `).all(...(req.user.role !== 'admin' ? [req.user.id] : []));

  let projectCount = 0;
  if (req.user.role === 'admin') {
    projectCount = db.prepare('SELECT COUNT(*) as c FROM projects').get().c;
  } else {
    projectCount = db.prepare('SELECT COUNT(*) as c FROM project_members WHERE user_id = ?').get(req.user.id).c;
  }

  res.json({ stats, recentTasks, overdueTasks, projectCount });
});

// GET /api/tasks/project/:projectId
router.get('/project/:projectId', authenticate, requireProjectAccess, (req, res) => {
  const db = getDb();
  const { status, priority, assignee_id } = req.query;
  let query = TASK_SELECT + ' WHERE t.project_id = ?';
  const params = [req.params.projectId];

  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (priority) { query += ' AND t.priority = ?'; params.push(priority); }
  if (assignee_id) { query += ' AND t.assignee_id = ?'; params.push(assignee_id); }
  query += ' ORDER BY t.created_at DESC';

  const tasks = db.prepare(query).all(...params);
  res.json({ tasks });
});

// POST /api/tasks - create task
router.post('/', authenticate, (req, res) => {
  const { title, description, status, priority, project_id, assignee_id, due_date } = req.body;
  if (!title) return res.status(400).json({ error: 'Task title is required' });
  if (!project_id) return res.status(400).json({ error: 'project_id is required' });

  const db = getDb();
  // Check project access
  const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').get(project_id, req.user.id);
  if (!member && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not a member of this project' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO tasks (id, title, description, status, priority, project_id, assignee_id, creator_id, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title.trim(), description || '', status || 'todo', priority || 'medium', project_id, assignee_id || null, req.user.id, due_date || null);

  const task = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(id);
  res.status(201).json({ task });
});

// PATCH /api/tasks/:id - update task
router.patch('/:id', authenticate, (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').get(task.project_id, req.user.id);
  if (!member && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { title, description, status, priority, assignee_id, due_date } = req.body;
  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      priority = COALESCE(?, priority),
      assignee_id = CASE WHEN ? IS NOT NULL THEN ? ELSE assignee_id END,
      due_date = CASE WHEN ? IS NOT NULL THEN ? ELSE due_date END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    title || null, description !== undefined ? description : null,
    status || null, priority || null,
    assignee_id !== undefined ? assignee_id : null, assignee_id || null,
    due_date !== undefined ? due_date : null, due_date || null,
    req.params.id
  );

  const updated = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(req.params.id);
  res.json({ task: updated });
});

// DELETE /api/tasks/:id
router.delete('/:id', authenticate, (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const member = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').get(task.project_id, req.user.id);
  const isProjectAdmin = member && member.role === 'admin';
  const isCreator = task.creator_id === req.user.id;

  if (!isProjectAdmin && !isCreator && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.json({ message: 'Task deleted' });
});

// GET /api/tasks/:id/comments
router.get('/:id/comments', authenticate, (req, res) => {
  const db = getDb();
  const comments = db.prepare(`
    SELECT c.*, u.name as user_name, u.avatar_color
    FROM task_comments c JOIN users u ON u.id = c.user_id
    WHERE c.task_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);
  res.json({ comments });
});

// POST /api/tasks/:id/comments
router.post('/:id/comments', authenticate, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });

  const db = getDb();
  const id = uuidv4();
  db.prepare('INSERT INTO task_comments (id, task_id, user_id, content) VALUES (?, ?, ?, ?)').run(id, req.params.id, req.user.id, content);

  const comment = db.prepare(`
    SELECT c.*, u.name as user_name, u.avatar_color
    FROM task_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(id);
  res.status(201).json({ comment });
});

module.exports = router;
