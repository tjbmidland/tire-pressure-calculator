const express = require('express');
const router = express.Router();
const db = require('../db');
const { calculatePressure } = require('../formula');

// List saved pressures.
//   ?setup_id=<id> → pressures for one setup (plain rows)
//   no setup_id    → ALL pressures, joined with setup/bike/rider names (global view)
router.get('/', (req, res) => {
  if (req.query.setup_id) {
    const pressures = db.prepare(
      'SELECT * FROM saved_pressures WHERE setup_id = ? ORDER BY created_at DESC'
    ).all(req.query.setup_id);
    return res.json(pressures);
  }
  const pressures = db.prepare(`
    SELECT sp.*, s.name AS setup_name, b.name AS bike_name, r.name AS rider_name,
           s.bike_id, b.rider_id
    FROM saved_pressures sp
    JOIN setups s ON sp.setup_id = s.id
    JOIN bikes b  ON s.bike_id   = b.id
    JOIN riders r ON b.rider_id  = r.id
    ORDER BY sp.created_at DESC
  `).all();
  res.json(pressures);
});

// Single saved pressure, with full rider/bike/setup context (for recall)
router.get('/:id', (req, res) => {
  const p = db.prepare(`
    SELECT sp.*, s.name AS setup_name, b.name AS bike_name, r.name AS rider_name,
           s.bike_id, b.rider_id
    FROM saved_pressures sp
    JOIN setups s ON sp.setup_id = s.id
    JOIN bikes b  ON s.bike_id   = b.id
    JOIN riders r ON b.rider_id  = r.id
    WHERE sp.id = ?
  `).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
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

// Save a pressure result, including the producing inputs for robust recall
router.post('/', (req, res) => {
  const { setup_id, front_psi, rear_psi, front_bar, rear_bar, inputs, label, notes } = req.body;
  if (!setup_id || front_psi == null || rear_psi == null) {
    return res.status(400).json({ error: 'setup_id, front_psi, rear_psi required' });
  }
  const inputsJson = inputs
    ? (typeof inputs === 'string' ? inputs : JSON.stringify(inputs))
    : null;
  const result = db.prepare(
    'INSERT INTO saved_pressures (setup_id, front_psi, rear_psi, front_bar, rear_bar, inputs, label, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(setup_id, front_psi, rear_psi, front_bar ?? 0, rear_bar ?? 0, inputsJson, label ?? null, notes ?? null);
  res.status(201).json({ id: result.lastInsertRowid });
});

// Delete a saved pressure
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM saved_pressures WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

module.exports = router;
