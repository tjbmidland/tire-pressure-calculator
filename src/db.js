const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'tirepressure.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────

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
    tire_width_mm REAL NOT NULL,
    rim_width_mm REAL DEFAULT 18,
    casing_type TEXT DEFAULT 'standard' CHECK(casing_type IN ('extralight', 'standard', 'endurance', 'endurance_plus')),
    is_tubeless INTEGER DEFAULT 1,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS setups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bike_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    rider_weight_kg REAL NOT NULL,
    bike_weight_kg REAL NOT NULL,
    additional_weight_kg REAL DEFAULT 0,
    bike_type TEXT DEFAULT 'gravel' CHECK(bike_type IN ('road', 'gravel', 'touring', 'city', 'mountain')),
    surface_type TEXT DEFAULT 'smooth_asphalt' CHECK(surface_type IN ('smooth_asphalt', 'rough_asphalt', 'smooth_gravel', 'coarse_gravel', 'rough_gravel')),
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
