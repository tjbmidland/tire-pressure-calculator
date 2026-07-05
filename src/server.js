const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/riders', require('./routes/riders'));
app.use('/api/bikes', require('./routes/bikes'));
app.use('/api/setups', require('./routes/setups'));
app.use('/api/pressures', require('./routes/pressures'));

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Global error handler — returns JSON for API errors, HTML for others.
// better-sqlite3 exposes SQLite extended result codes on err.code, which are
// more stable than matching substrings of the human-readable message. The
// message-substring fallback is kept for any error that lacks an extended code.
const SQLITE_STATUS = {
  SQLITE_CONSTRAINT_FOREIGNKEY: 400,
  SQLITE_CONSTRAINT_UNIQUE: 409,
  SQLITE_CONSTRAINT_CHECK: 400,
  SQLITE_CONSTRAINT_NOTNULL: 400,
};

app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api')) {
    const status = SQLITE_STATUS[err.code]
      ?? (err.message.includes('FOREIGN KEY') ? 400
        : err.message.includes('UNIQUE') ? 409
        : err.message.includes('CHECK') ? 400
        : 500);
    res.status(status).json({ error: err.message });
  } else {
    res.status(500).send('Internal Server Error');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tire Pressure Calculator running on http://0.0.0.0:${PORT}`);
});
