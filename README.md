# TaskFlow — Team Task Manager

A full-stack team task manager with role-based access control, project management, and real-time task tracking.

## Features

- **Authentication** — JWT-based signup/login with secure password hashing
- **Role-Based Access Control** — Admin and Member roles (global + per-project)
- **Project Management** — Create, edit, delete projects; add/remove team members
- **Task Management** — Full CRUD with status, priority, due dates, assignees
- **Kanban Board** — Drag-friendly board view by status columns
- **Dashboard** — Task stats, overdue alerts, recent activity
- **Comments** — Per-task discussion threads
- **Admin Panel** — Manage all users and roles

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js + Express |
| Database | SQLite via better-sqlite3 |
| Auth | JWT + bcrypt |
| Frontend | Vanilla HTML/CSS/JS (SPA) |
| Deployment | Railway |

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Or production
npm start
```

Visit `http://localhost:3000`

**Note:** The first user to sign up automatically becomes Admin.

## Project Structure

```
taskflow/
├── src/
│   ├── server.js          # Express app entry point
│   ├── db.js              # SQLite init + schema
│   ├── middleware.js       # JWT auth + RBAC middleware
│   └── routes/
│       ├── auth.js         # POST /signup, /login, GET /me
│       ├── users.js        # GET /users, PATCH /users/:id/role
│       ├── projects.js     # Full project + member CRUD
│       └── tasks.js        # Full task CRUD + comments + dashboard
├── public/
│   └── index.html          # Single-page frontend app
├── package.json
├── railway.toml
└── .gitignore
```

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register new user |
| POST | `/api/auth/login` | Login and get JWT |
| GET | `/api/auth/me` | Get current user |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List accessible projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project + members |
| PATCH | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |
| POST | `/api/projects/:id/members` | Add member |
| DELETE | `/api/projects/:id/members/:uid` | Remove member |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List tasks (with filters) |
| GET | `/api/tasks/dashboard` | Dashboard stats |
| GET | `/api/tasks/project/:id` | Tasks for project |
| POST | `/api/tasks` | Create task |
| PATCH | `/api/tasks/:id` | Update task |
| DELETE | `/api/tasks/:id` | Delete task |
| GET | `/api/tasks/:id/comments` | Get comments |
| POST | `/api/tasks/:id/comments` | Add comment |

## Deploying to Railway

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/taskflow.git
git push -u origin main
```

### Step 2 — Deploy on Railway
1. Go to [railway.app](https://railway.app) and sign in
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your `taskflow` repository
4. Railway auto-detects Node.js and deploys

### Step 3 — Set Environment Variables (optional but recommended)
In Railway dashboard → your service → **Variables**:

```
JWT_SECRET=your-super-secret-key-here-change-this
NODE_ENV=production
```

### Step 4 — Add a Volume for Database Persistence
1. In Railway dashboard → your service → **Volumes**
2. Click **"New Volume"**
3. Mount path: `/data`
4. Then set `DB_PATH` environment variable: `/data/taskflow.db`

Without a volume, the SQLite database resets on each deploy. With a volume, data persists.

### Step 5 — Get Your Live URL
Railway provides a URL like `https://taskflow-production-xxxx.up.railway.app`

## Role-Based Access Control

| Action | Member | Project Admin | Global Admin |
|--------|--------|---------------|--------------|
| View projects they're in | ✓ | ✓ | ✓ (all) |
| Create projects | ✓ | ✓ | ✓ |
| Manage project members | ✗ | ✓ | ✓ |
| Create tasks in project | ✓ | ✓ | ✓ |
| Edit/delete any task | ✗ (own only) | ✓ | ✓ |
| View all users | ✗ | ✗ | ✓ |
| Change user roles | ✗ | ✗ | ✓ |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `JWT_SECRET` | `taskflow-secret-key-...` | JWT signing secret |
| `DB_PATH` | `./taskflow.db` | SQLite database path |
| `NODE_ENV` | development | Environment |
