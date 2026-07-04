const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'tirepressure.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS riders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bikes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rider_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    front_tire_width REAL NOT NULL,
    rear_tire_width REAL,
    tire_width_unit TEXT DEFAULT 'mm' CHECK(tire_width_unit IN ('mm', 'in')),
    rim_width_mm REAL DEFAULT 23,
    rim_type TEXT DEFAULT 'hooked' CHECK(rim_type IN ('hooked', 'hookless')),
    front_casing TEXT DEFAULT 'endurance' CHECK(front_casing IN ('extralight', 'standard', 'endurance', 'endurance_plus')),
    rear_casing TEXT,
    is_tubeless INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS setups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bike_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    rider_weight REAL NOT NULL,
    bike_weight REAL NOT NULL,
    front_luggage_weight REAL DEFAULT 0,
    rear_luggage_weight REAL DEFAULT 0,
    bikepacking_load_weight REAL DEFAULT 0,
    weight_unit TEXT DEFAULT 'lbs' CHECK(weight_unit IN ('kg', 'lbs')),
    bike_type TEXT DEFAULT 'gravel' CHECK(bike_type IN ('road', 'gravel', 'mountain', 'bikepacking')),
    frame_size TEXT DEFAULT 'medium' CHECK(frame_size IN ('small', 'medium', 'tall')),
    riding_position TEXT DEFAULT 'intermediate' CHECK(riding_position IN ('aero', 'low', 'intermediate', 'upright')),
    surface_type TEXT DEFAULT 'smooth_gravel' CHECK(surface_type IN ('smooth_asphalt', 'rough_asphalt', 'smooth_gravel', 'coarse_gravel', 'rough_gravel', 'mixed_paved_gravel', 'singletrack')),
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (bike_id) REFERENCES bikes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS saved_pressures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setup_id INTEGER NOT NULL,
    front_psi REAL NOT NULL,
    rear_psi REAL NOT NULL,
    front_bar REAL NOT NULL,
    rear_bar REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (setup_id) REFERENCES setups(id) ON DELETE CASCADE
  );
`);

module.exports = db;
