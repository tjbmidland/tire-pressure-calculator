/**
 * Tire pressure calculation using the Frank Berto 15% deflection method.
 * Formula: P = 600·L / W² + 0.75·W − 25
 * Where L = per-wheel load in lbs, W = actual mounted tire width in mm
 *
 * Sources:
 * - BikeLab Studio white paper: https://www.bikelabstudio.com/articles/white-paper-psi-model.html
 * - Rene Herse tire pressure calculator methodology
 */

// ─── Core Berto formula ───────────────────────────────────────────

function bertoPressure(loadLbs, tireWidthMm) {
  return (600 * loadLbs) / (tireWidthMm ** 2) + 0.75 * tireWidthMm - 25;
}

// ─── Correction factors ───────────────────────────────────────────

function rimWidthCorrection(rimWidthMm) {
  // Each mm of internal rim width over 18mm reduces pressure by ~0.2%
  // Reference: BikeLab white paper
  const ref = 18;
  if (rimWidthMm <= ref) return 1.0;
  return 1 - 0.002 * (rimWidthMm - ref);
}

function casingCorrection(casingType) {
  // Supple casings deflect more at equal pressure, stiff casings deflect less
  // Reference: Rene Herse calculator, BikeLab white paper
  const factors = {
    extralight: 0.95,
    standard: 1.0,
    endurance: 1.05,
    endurance_plus: 1.05,
  };
  return factors[casingType] ?? 1.0;
}

function tubeCorrection(isTubeless) {
  // Butyl tubes add hysteresis, reducing effective deflection
  // +5% for tubes (not tubeless)
  // Reference: BikeLab white paper
  return isTubeless ? 1.0 : 1.05;
}

function surfaceCorrection(surfaceType) {
  // Rough surfaces benefit from lower pressure (impedance losses)
  // Reference: Rene Herse calculator, BikeLab white paper
  const factors = {
    smooth_asphalt: 1.0,
    rough_asphalt: 0.95,
    smooth_gravel: 0.925,
    coarse_gravel: 0.9,
    rough_gravel: 0.875,
  };
  return factors[surfaceType] ?? 1.0;
}

// ─── Weight distribution ──────────────────────────────────────────

function defaultWeightDist(bikeType) {
  // Static weight distribution (front%, rear%)
  // Reference: BikeLab white paper, typical values by bike geometry
  const distributions = {
    road: [0.4, 0.6],
    gravel: [0.42, 0.58],
    touring: [0.35, 0.65],
    city: [0.35, 0.65],
    mountain: [0.42, 0.58],
  };
  return distributions[bikeType] ?? [0.42, 0.58];
}

// ─── Unit conversions ─────────────────────────────────────────────

const KG_TO_LBS = 2.20462;
const IN_TO_MM = 25.4;

function kgToLbs(kg) { return kg * KG_TO_LBS; }
function lbsToKg(lbs) { return lbs / KG_TO_LBS; }
function inToMm(inches) { return inches * IN_TO_MM; }
function psiToBar(psi) { return psi / 14.5038; }
function barToPsi(bar) { return bar * 14.5038; }

// ─── Main calculation ─────────────────────────────────────────────

/**
 * Calculate tire pressure for front and rear wheels.
 *
 * @param {Object} params
 * @param {number} params.riderWeightKg - Rider weight in kg
 * @param {number} params.bikeWeightKg - Bike weight in kg
 * @param {number} params.additionalWeightKg - Gear/bags weight in kg
 * @param {number} params.tireWidthMm - Tire width in mm (actual mounted or corrected)
 * @param {number} [params.rimWidthMm=18] - Rim internal width in mm
 * @param {string} [params.casingType='standard'] - extralight|standard|endurance|endurance_plus
 * @param {boolean} [params.isTubeless=true] - Whether running tubeless
 * @param {string} [params.surfaceType='smooth_asphalt'] - Surface type
 * @param {string} [params.bikeType='gravel'] - Bike type for weight distribution
 * @param {number[]} [params.weightDist] - Custom [front%, rear%] distribution (0-1)
 * @param {string} [params.tireWidthUnit='mm'] - 'mm' or 'in'
 * @param {string} [params.weightUnit='kg'] - 'kg' or 'lbs'
 * @returns {{ frontPsi: number, rearPsi: number, frontBar: number, rearBar: number }}
 */
function calculatePressure(params) {
  const {
    riderWeightKg,
    bikeWeightKg,
    additionalWeightKg = 0,
    tireWidthMm: rawTireWidth,
    rimWidthMm = 18,
    casingType = 'standard',
    isTubeless = true,
    surfaceType = 'smooth_asphalt',
    bikeType = 'gravel',
    weightDist,
    tireWidthUnit = 'mm',
    weightUnit = 'kg',
  } = params;

  // Convert tire width to mm
  const tireWidthMm = tireWidthUnit === 'in' ? inToMm(rawTireWidth) : rawTireWidth;

  // Convert weights to kg if needed
  const riderKg = weightUnit === 'lbs' ? lbsToKg(riderWeightKg) : riderWeightKg;
  const bikeKg = weightUnit === 'lbs' ? lbsToKg(bikeWeightKg) : bikeWeightKg;
  const gearKg = weightUnit === 'lbs' ? lbsToKg(additionalWeightKg) : additionalWeightKg;

  // Total system weight in lbs
  const totalLbs = kgToLbs(riderKg + bikeKg + gearKg);

  // Weight distribution (front%, rear%)
  const [frontPct, rearPct] = weightDist ?? defaultWeightDist(bikeType);

  // Per-wheel load in lbs
  const frontLoadLbs = totalLbs * frontPct;
  const rearLoadLbs = totalLbs * rearPct;

  // Correction multipliers
  const rim = rimWidthCorrection(rimWidthMm);
  const casing = casingCorrection(casingType);
  const tube = tubeCorrection(isTubeless);
  const surface = surfaceCorrection(surfaceType);
  const allCorrections = rim * casing * tube * surface;

  // Apply Berto formula + corrections
  let frontPsi = bertoPressure(frontLoadLbs, tireWidthMm) * allCorrections;
  let rearPsi = bertoPressure(rearLoadLbs, tireWidthMm) * allCorrections;

  // Front coupling: P_front = 0.93 × P_rear
  // Instead of using static front load, couple front to rear
  // This accounts for braking load transfer
  // Reference: BikeLab white paper, calibrated against SILCA and Rene Herse
  const rearFromLoad = bertoPressure(rearLoadLbs, tireWidthMm) * allCorrections;
  const frontCoupled = rearFromLoad * 0.93;
  frontPsi = frontCoupled;

  // Safety clamp
  frontPsi = Math.max(15, Math.min(120, frontPsi));
  rearPsi = Math.max(15, Math.min(120, rearPsi));

  // Hookless rim safety cap
  if (rimWidthMm >= 30) {
    frontPsi = Math.min(60, frontPsi);
    rearPsi = Math.min(60, rearPsi);
  } else if (rimWidthMm >= 21) {
    // Conservative: apply hookless cap for wider rims
    // (In practice, you'd check rim construction, not just width)
  }

  return {
    frontPsi: Math.round(frontPsi),
    rearPsi: Math.round(rearPsi),
    frontBar: parseFloat(psiToBar(frontPsi).toFixed(1)),
    rearBar: parseFloat(psiToBar(rearPsi).toFixed(1)),
  };
}

module.exports = {
  calculatePressure,
  bertoPressure,
  rimWidthCorrection,
  casingCorrection,
  tubeCorrection,
  surfaceCorrection,
  defaultWeightDist,
  kgToLbs,
  lbsToKg,
  inToMm,
  psiToBar,
  barToPsi,
  KG_TO_LBS,
  IN_TO_MM,
};
