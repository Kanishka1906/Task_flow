const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

console.log("Starting server...");

// Middleware
app.use(cors());
app.use(express.json());

// Healthcheck FIRST (very important)
app.get('/api/health', (req, res) => {
  res.send("OK");
});

// Try loading routes safely
try {
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/projects', require('./routes/projects'));
  app.use('/api/tasks', require('./routes/tasks'));
  console.log("Routes loaded");
} catch (err) {
  console.error("Route loading failed:", err);
}

// Static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
