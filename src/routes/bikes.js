const express = require('express');
const router = express.Router();
const db = require('../db');

// List bikes for a rider
router.get('/', (req, res) => {
  const bikes = db.prepare('SELECT * FROM bikes WHERE rider_id = ? ORDER BY name').all(req.query.rider_id);
  res.json(bikes);
});

// Get single bike
router.get('/:id', (req, res) => {
  const bike = db.prepare('SELECT * FROM bikes WHERE id = ?').get(req.params.id);
  if (!bike) return res.status(404).json({ error: 'Not found' });
  res.json(bike);
});

// Create bike
router.post('/', (req, res) => {
  const { rider_id, name, tire_width_mm, rim_width_mm, casing_type, is_tubeless, notes } = req.body;
  if (!rider_id || !name?.trim() || !tire_width_mm) {
    return res.status(400).json({ error: 'rider_id, name, tire_width_mm required' });
  }
  const result = db.prepare(
    'INSERT INTO bikes (rider_id, name, tire_width_mm, rim_width_mm, casing_type, is_tubeless, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(rider_id, name.trim(), tire_width_mm, rim_width_mm ?? 18, casing_type ?? 'standard', is_tubeless ?? 1, notes ?? null);
  res.status(201).json({ id: result.lastInsertRowid, rider_id, name: name.trim() });
});

// Update bike
router.put('/:id', (req, res) => {
  const { name, tire_width_mm, rim_width_mm, casing_type, is_tubeless, notes } = req.body;
  const result = db.prepare(
    'UPDATE bikes SET name = ?, tire_width_mm = ?, rim_width_mm = ?, casing_type = ?, is_tubeless = ?, notes = ? WHERE id = ?'
  ).run(name?.trim(), tire_width_mm, rim_width_mm, casing_type, is_tubeless, notes ?? null, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ id: Number(req.params.id) });
});

// Delete bike
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM bikes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

module.exports = router;
