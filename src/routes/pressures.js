const express = require('express');
const router = express.Router();
const db = require('../db');
const { calculatePressure } = require('../formula');

// List saved pressures for a setup
router.get('/', (req, res) => {
  const pressures = db.prepare('SELECT * FROM saved_pressures WHERE setup_id = ? ORDER BY created_at DESC').all(req.query.setup_id);
  res.json(pressures);
});

// Calculate pressure (does not save — use POST / to save)
router.post('/calculate', (req, res) => {
  try {
    const result = calculatePressure(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Save a pressure result
router.post('/', (req, res) => {
  const { setup_id, front_psi, rear_psi, front_bar, rear_bar } = req.body;
  if (!setup_id || front_psi == null || rear_psi == null) {
    return res.status(400).json({ error: 'setup_id, front_psi, rear_psi required' });
  }
  const result = db.prepare(
    'INSERT INTO saved_pressures (setup_id, front_psi, rear_psi, front_bar, rear_bar) VALUES (?, ?, ?, ?, ?)'
  ).run(setup_id, front_psi, rear_psi, front_bar ?? 0, rear_bar ?? 0);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Delete a saved pressure
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM saved_pressures WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

module.exports = router;
