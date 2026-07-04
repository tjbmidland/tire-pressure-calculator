const express = require('express');
const router = express.Router();
const db = require('../db');

// List all riders
router.get('/', (req, res) => {
  const riders = db.prepare('SELECT * FROM riders ORDER BY name').all();
  res.json(riders);
});

// Create rider
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare('INSERT INTO riders (name) VALUES (?)').run(name.trim());
  res.status(201).json({ id: result.lastInsertRowid, name: name.trim() });
});

// Update rider
router.put('/:id', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare('UPDATE riders SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ id: Number(req.params.id), name: name.trim() });
});

// Delete rider (cascades to bikes, setups, pressures)
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM riders WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.status(204).end();
});

module.exports = router;
