# Tire Pressure Calculator

Calculate optimal tire pressure using the Frank Berto 15% deflection method.

## Features

- Real Berto formula: `P = 600·L / W² + 0.75·W − 25`
- Correction factors for rim width, casing type, tube/tubeless, surface conditions
- Front/rear coupling (P_front = 0.93 × P_rear)
- Save rider profiles, bikes, and setups
- Multiple setups per bike (normal, bikepacking, touring)
- Save and recall pressure history
- Works offline (PWA)

## Quick Start

```bash
npm install
npm start
```

Open http://localhost:3000

## Data Model

- **Riders**: name
- **Bikes**: tire width, rim width, casing type, tube/tubeless
- **Setups**: rider weight, bike weight, gear weight, bike type, surface type
- **Saved pressures**: front/rear PSI and bar

## Formula

Based on Frank Berto's 15% tire drop criterion, calibrated against Rene Herse and BikeLab Studio calculators.

Key correction factors:
- Rim width: -0.2% per mm over 18mm internal
- Casing: Extralight -5%, Endurance +5%
- Tube vs tubeless: +5% for butyl tubes
- Surface: Rough asphalt -5%, gravel -7.5% to -12.5%

## Deployment

See `deploy/` for Proxmox LXC setup.
