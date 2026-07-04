# AGENTS.md — Tire Pressure Calculator

## Overview

A tire pressure calculator web app using the Frank Berto 15% deflection method. Node.js backend with Express + SQLite, vanilla HTML/CSS/JS frontend as a PWA.

## Running

```bash
pnpm install
pnpm start           # production on port 3000
pnpm dev             # development with auto-reload
```

Open http://localhost:3000

## Architecture

```
src/
├── server.js       # Express app, static file serving, API routes
├── db.js           # SQLite schema + connection (better-sqlite3)
├── formula.js      # Berto formula + correction factors
└── routes/
    ├── riders.js   # CRUD for rider profiles
    ├── bikes.js    # CRUD for bikes (tire/rim/casing config)
    ├── setups.js   # CRUD for setups (weights, surface, bike type)
    └── pressures.js # Calculate + save/recall pressure results

public/
├── index.html      # Single page — profile selector, calculator, history
├── script.js       # Frontend logic, API calls, DOM updates
├── styles.css      # Mobile-first styling
├── sw.js           # Service worker (network-first HTML, cache-first assets, no API caching)
└── manifest.json   # PWA manifest

data/
└── tirepressure.db # SQLite database (created at runtime, gitignored)

deploy/
├── setup.sh        # Proxmox LXC setup script (community-scripts pattern)
├── nginx.conf      # Nginx reverse proxy config
└── README.md       # Deployment instructions
```

### Data flow

1. User selects/creates rider → bike → setup
2. Selecting a bike pre-fills tire width, rim width, casing, tubeless
3. Selecting a setup pre-fills weights, bike type, surface
4. Frontend sends all params to `POST /api/pressures/calculate`
5. Backend applies Berto formula with correction factors, returns front/rear PSI + bar
6. User can save result to the selected setup

### Formula: `P = 600·L / W² + 0.75·W − 25`

Where L = per-wheel load (lbs), W = actual mounted tire width (mm).

**Correction factors** (multiplied after base formula):
- Rim width: -0.2% per mm over 18mm internal
- Casing: extralight ×0.95, standard ×1.0, endurance/endurance_plus ×1.05
- Tube vs tubeless: ×1.05 for butyl tubes
- Surface: smooth_asphalt ×1.0, rough_asphalt ×0.95, smooth_gravel ×0.925, coarse_gravel ×0.9, rough_gravel ×0.875

**Front coupling**: P_front = 0.93 × P_rear (accounts for braking load transfer)

**Safety**: output clamped to 15–120 PSI; hookless rims ≥30mm capped at 60 PSI

## Patterns & Conventions

- **Package manager**: pnpm 11+ with supply chain security (see `.npmrc`)
- **No modules/bundler** — all frontend JS is global scope in `public/script.js`
- **API** — RESTful JSON under `/api/riders`, `/api/bikes`, `/api/setups`, `/api/pressures`
- **Database** — better-sqlite3 (synchronous), WAL mode, foreign keys on, cascading deletes
- **DOM access** — `document.getElementById` throughout
- **Weight distribution** — auto-derived from bike type (road 40/60, gravel 42/58, touring 35/65, etc.)
- **Service worker** — network-first for HTML, cache-first for static assets, API requests bypass cache entirely

## Supply Chain Security

pnpm v10+ blocks postinstall scripts by default. See `.npmrc`:

- `onlyBuiltDependencies=better-sqlite3` — only allow builds for native addon
- `blockExoticSubdeps=true` — block git/tarball transitive deps
- `minimumReleaseAge=1440` — 1-day delay on new versions
- `trustPolicy=no-downgrade` — prevent trust level regression

To approve a new native dependency: `pnpm approve-builds <package-name>`

## Testing

No test suite. Verify manually:

1. Create rider → bike → setup
2. Calculate with known values, compare against Rene Herse calculator
3. Save and recall pressures
4. Test offline: load page, disconnect, reload
5. Test unit conversion (kg/lbs, mm/inches)

## Deployment

See `deploy/` for Proxmox LXC. Data persists in `/opt/tirepressure/data/` — back up `tirepressure.db` to preserve saved pressures.

## Important

- K-coefficients from the old formula are gone — the real Berto formula is in `src/formula.js`
- The Berto formula is calibrated for tire widths 23–50mm on 700C wheels — extrapolation beyond this range is unreliable
- Wheel diameter does NOT directly affect the formula — only tire width and rim width matter
- `font-size: 16px` on inputs prevents iOS Safari zoom — don't reduce it
