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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tire Pressure Calculator running on http://0.0.0.0:${PORT}`);
});
