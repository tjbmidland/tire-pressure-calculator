/**
 * Tire pressure calculation calibrated to Rene Herse calculator 3.0.
 * Formula: PSI = K(W) × L / W × corrections
 * Where L = per-wheel load in lbs, W = tire width in mm
 *
 * K coefficients calibrated against Rene Herse PRO tool output.
 * K already includes baseline corrections (endurance+ casing, tubeless, smooth gravel).
 * Additional corrections apply only for deviations from that baseline.
 * Weight distribution based on frame size (Rene Herse methodology).
 */

// ─── K coefficients (by tire width range) ─────────────────────────
// Calibrated to Rene Herse, biased slightly high for safety

function getK(tireWidthMm) {
  if (tireWidthMm < 28) return 20.5;
  if (tireWidthMm < 35) return 17.5;
  if (tireWidthMm < 45) return 14.8;
  if (tireWidthMm < 60) return 13.2;
  if (tireWidthMm < 80) return 11.8;
  return 10.3;
}

// ─── Correction factors ───────────────────────────────────────────
// Baseline: endurance+ casing, tubeless, smooth gravel, 23mm rim
// Corrections adjust for deviations from this baseline

function rimWidthCorrection(rimWidthMm) {
  const ref = 23;
  if (rimWidthMm <= ref) return 1.0;
  return 1 - 0.002 * (rimWidthMm - ref);
}

function casingCorrection(casingType) {
  // Baseline is endurance_plus — stiffer casings need more pressure
  const factors = {
    extralight: 0.95,
    standard: 1.05,
    endurance: 1.0,
    endurance_plus: 1.0,
  };
  return factors[casingType] ?? 1.0;
}

function tubeCorrection(isTubeless) {
  // Baseline is tubeless — tubes need more pressure
  return isTubeless ? 1.0 : 1.05;
}

function surfaceCorrection(surfaceType) {
  // Baseline is smooth gravel — adjust for other surfaces
  const factors = {
    smooth_pavement: 1.075,
    rough_pavement: 1.025,
    gravel: 1.0,
    mixed_trail: 0.925,
    singletrack: 0.875,
  };
  return factors[surfaceType] ?? 1.0;
}

// ─── Weight distribution by frame size ────────────────────────────
// Calibrated to Rene Herse PRO tool

function weightDist(frameSize) {
  const distributions = {
    small: [0.48, 0.52],
    medium: [0.467, 0.533],
    tall: [0.451, 0.549],
  };
  return distributions[frameSize] ?? distributions.medium;
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
 */
function calculatePressure(params) {
  const {
    riderWeight,
    bikeWeight,
    additionalWeight = 0,
    tireWidth: rawTireWidth,
    tireWidthUnit = 'mm',
    weightUnit = 'lbs',
    rimWidthMm = 23,
    casingType = 'endurance_plus',
    isTubeless = true,
    surfaceType = 'gravel',
    frameSize = 'medium',
  } = params;

  const tireWidthMm = tireWidthUnit === 'in' ? inToMm(rawTireWidth) : rawTireWidth;

  let totalLbs;
  if (weightUnit === 'kg') {
    totalLbs = kgToLbs(riderWeight + bikeWeight + additionalWeight);
  } else {
    totalLbs = riderWeight + bikeWeight + additionalWeight;
  }

  const [frontPct, rearPct] = weightDist(frameSize);
  const frontLoadLbs = totalLbs * frontPct;
  const rearLoadLbs = totalLbs * rearPct;

  const k = getK(tireWidthMm);

  const allCorrections =
    rimWidthCorrection(rimWidthMm) *
    casingCorrection(casingType) *
    tubeCorrection(isTubeless) *
    surfaceCorrection(surfaceType);

  const frontPsi = k * frontLoadLbs / tireWidthMm * allCorrections;
  const rearPsi = k * rearLoadLbs / tireWidthMm * allCorrections;

  const clampedFront = Math.max(15, Math.min(120, frontPsi));
  const clampedRear = Math.max(15, Math.min(120, rearPsi));

  const hooklessCap = rimWidthMm >= 30 ? 60 : 120;

  const finalFront = Math.round(Math.min(hooklessCap, clampedFront));
  const finalRear = Math.round(Math.min(hooklessCap, clampedRear));

  return {
    frontPsi: finalFront,
    rearPsi: finalRear,
    frontBar: parseFloat(psiToBar(finalFront).toFixed(1)),
    rearBar: parseFloat(psiToBar(finalRear).toFixed(1)),
  };
}

module.exports = {
  calculatePressure,
  getK,
  rimWidthCorrection,
  casingCorrection,
  tubeCorrection,
  surfaceCorrection,
  weightDist,
  kgToLbs,
  lbsToKg,
  inToMm,
  psiToBar,
  barToPsi,
  KG_TO_LBS,
  IN_TO_MM,
};
