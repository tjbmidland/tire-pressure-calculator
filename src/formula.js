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
  const ref = 18;
  if (rimWidthMm <= ref) return 1.0;
  return 1 - 0.002 * (rimWidthMm - ref);
}

function casingCorrection(casingType) {
  const factors = {
    extralight: 0.95,
    standard: 1.0,
    endurance: 1.05,
    endurance_plus: 1.05,
  };
  return factors[casingType] ?? 1.0;
}

function tubeCorrection(isTubeless) {
  return isTubeless ? 1.0 : 1.05;
}

function surfaceCorrection(surfaceType) {
  const factors = {
    smooth_pavement: 1.0,
    rough_pavement: 0.95,
    gravel: 0.925,
    mixed_trail: 0.9,
    singletrack: 0.875,
  };
  return factors[surfaceType] ?? 1.0;
}

// ─── Weight distribution ──────────────────────────────────────────

function defaultWeightDist(bikeType) {
  const distributions = {
    road: [0.40, 0.60],
    gravel: [0.42, 0.58],
    bikepacking: [0.35, 0.65],
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
 * @param {number} params.riderWeight - Rider weight
 * @param {number} params.bikeWeight - Bike weight
 * @param {number} params.additionalWeight - Gear/bags weight
 * @param {number} params.tireWidth - Tire width
 * @param {string} [params.tireWidthUnit='mm'] - 'mm' or 'in'
 * @param {string} [params.weightUnit='lbs'] - 'kg' or 'lbs'
 * @param {number} [params.rimWidthMm=18] - Rim internal width in mm
 * @param {string} [params.casingType='standard'] - extralight|standard|endurance|endurance_plus
 * @param {boolean} [params.isTubeless=true] - Whether running tubeless
 * @param {string} [params.surfaceType='smooth_pavement'] - Surface type
 * @param {string} [params.bikeType='gravel'] - Bike type for weight distribution
 * @returns {{ frontPsi: number, rearPsi: number, frontBar: number, rearBar: number }}
 */
function calculatePressure(params) {
  const {
    riderWeight,
    bikeWeight,
    additionalWeight = 0,
    tireWidth: rawTireWidth,
    tireWidthUnit = 'mm',
    weightUnit = 'lbs',
    rimWidthMm = 18,
    casingType = 'standard',
    isTubeless = true,
    surfaceType = 'smooth_pavement',
    bikeType = 'gravel',
  } = params;

  // Convert tire width to mm
  const tireWidthMm = tireWidthUnit === 'in' ? inToMm(rawTireWidth) : rawTireWidth;

  // Convert weights to lbs (formula uses lbs)
  let totalLbs;
  if (weightUnit === 'kg') {
    totalLbs = kgToLbs(riderWeight + bikeWeight + additionalWeight);
  } else {
    totalLbs = riderWeight + bikeWeight + additionalWeight;
  }

  // Weight distribution
  const [frontPct, rearPct] = defaultWeightDist(bikeType);

  // Per-wheel load in lbs
  const rearLoadLbs = totalLbs * rearPct;

  // Correction multipliers
  const allCorrections =
    rimWidthCorrection(rimWidthMm) *
    casingCorrection(casingType) *
    tubeCorrection(isTubeless) *
    surfaceCorrection(surfaceType);

  // Apply Berto formula to rear wheel
  const rearPsi = bertoPressure(rearLoadLbs, tireWidthMm) * allCorrections;

  // Front coupling: P_front = 0.93 × P_rear
  const frontPsi = rearPsi * 0.93;

  // Safety clamp
  const clampedFront = Math.max(15, Math.min(120, frontPsi));
  const clampedRear = Math.max(15, Math.min(120, rearPsi));

  // Hookless rim cap
  const hooklessCap = rimWidthMm >= 30 ? 60 : 120;

  return {
    frontPsi: Math.round(Math.min(hooklessCap, clampedFront)),
    rearPsi: Math.round(Math.min(hooklessCap, clampedRear)),
    frontBar: parseFloat(psiToBar(Math.min(hooklessCap, clampedFront)).toFixed(1)),
    rearBar: parseFloat(psiToBar(Math.min(hooklessCap, clampedRear)).toFixed(1)),
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
