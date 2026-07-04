const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const setups = db.prepare('SELECT * FROM setups WHERE bike_id = ? ORDER BY name').all(req.query.bike_id);
  res.json(setups);
});

router.get('/:id', (req, res) => {
  const setup = db.prepare('SELECT * FROM setups WHERE id = ?').get(req.params.id);
  if (!setup) return res.status(404).json({ error: 'Not found' });
  res.json(setup);
});

router.post('/', (req, res) => {
  const { bike_id, name, rider_weight, bike_weight, additional_weight, weight_unit, frame_size, surface_type, notes } = req.body;
  if (!bike_id || !name?.trim() || !rider_weight || !bike_weight) {
    return res.status(400).json({ error: 'bike_id, name, rider_weight, bike_weight required' });
  }
  const result = db.prepare(
    'INSERT INTO setups (bike_id, name, rider_weight, bike_weight, additional_weight, weight_unit, frame_size, surface_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(bike_id, name.trim(), rider_weight, bike_weight, additional_weight ?? 0, weight_unit ?? 'lbs', frame_size ?? 'medium', surface_type ?? 'smooth_pavement', notes ?? null);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, rider_weight, bike_weight, additional_weight, weight_unit, frame_size, surface_type, notes } = req.body;
  const result = db.prepare(
    'UPDATE setups SET name = ?, rider_weight = ?, bike_weight = ?, additional_weight = ?, weight_unit = ?, frame_size = ?, surface_type = ?, notes = ? WHERE id = ?'
  ).run(name?.trim(), rider_weight, bike_weight, additional_weight, weight_unit, frame_size, surface_type, notes ?? null, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ id: Number(req.params.id) });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM setups WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

module.exports = router;
