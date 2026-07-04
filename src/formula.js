/**
 * Tire pressure calculation calibrated to Rene Herse calculator 3.0.
 * Formula: PSI = K(W) × L / W × corrections
 * Where L = per-wheel load in lbs, W = tire width in mm
 *
 * K coefficients calibrated against Rene Herse PRO tool output.
 * Calculates front and rear independently based on tire width, casing, and load.
 */

// ─── K coefficient ────────────────────────────────────────────────
// Calibrated to Rene Herse, biased slightly high for safety
// K is constant across tire widths (linear P = K×L/W relationship)

const K = 13.2;

// ─── Correction factors ───────────────────────────────────────────

function rimWidthCorrection(rimWidthMm) {
  // Rene Herse uses 23mm as reference, 0.2% per mm over
  const ref = 23;
  if (rimWidthMm <= ref) return 1.0;
  return 1 - 0.002 * (rimWidthMm - ref);
}

function casingCorrection(casingType) {
  const factors = {
    extralight: 0.95,
    standard: 1.075,
    endurance: 1.0,
    endurance_plus: 1.0,
  };
  return factors[casingType] ?? 1.0;
}

function tubeCorrection(isTubeless) {
  return isTubeless ? 1.0 : 1.05;
}

function surfaceCorrection(surfaceType) {
  const factors = {
    smooth_asphalt: 0.925,
    rough_asphalt: 0.975,
    smooth_gravel: 1.0,
    coarse_gravel: 0.945,
    rough_gravel: 1.055,
    mixed_paved_gravel: 1.01,
    singletrack: 1.10,
  };
  return factors[surfaceType] ?? 1.0;
}

// ─── Weight distribution ──────────────────────────────────────────
// Combines bike type, frame size, and riding position

const BIKE_DIST = {
  road:        [0.44, 0.56],
  gravel:      [0.467, 0.533],
  mountain:    [0.44, 0.56],
  bikepacking: [0.46, 0.54],
};

const FRAME_SHIFT = {
  small:  0.015,   // shorter rider sits more forward
  medium: 0.0,
  tall:  -0.015,   // taller rider sits more rearward
};

const POSITION_SHIFT = {
  aero:          0.015,   // more weight on front
  low:           0.008,
  intermediate:  0.0,
  upright:      -0.008,   // more weight on rear
};

function weightDist(bikeType, frameSize, ridingPosition, frontLuggageLbs, rearLuggageLbs, totalLbs) {
  const [baseFront, baseRear] = BIKE_DIST[bikeType] ?? BIKE_DIST.gravel;
  const frameShift = FRAME_SHIFT[frameSize] ?? 0.0;
  const posShift = POSITION_SHIFT[ridingPosition] ?? 0.0;

  let frontPct = baseFront + frameShift + posShift;
  let rearPct = 1 - frontPct;

  // Luggage goes directly to respective wheels
  const frontLoadLbs = totalLbs * frontPct + frontLuggageLbs;
  const rearLoadLbs = totalLbs * rearPct + rearLuggageLbs;

  return [frontLoadLbs, rearLoadLbs];
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
 * @param {Object} p
 * @param {number} p.riderWeight
 * @param {number} p.bikeWeight
 * @param {number} [p.frontLuggageWeight=0]
 * @param {number} [p.rearLuggageWeight=0]
 * @param {number} [p.bikepackingLoadWeight=0]
 * @param {string} [p.weightUnit='lbs']
 * @param {number} p.frontTireWidth
 * @param {number} [p.rearTireWidth] - defaults to frontTireWidth
 * @param {string} [p.tireWidthUnit='mm']
 * @param {number} [p.rimWidthMm=23]
 * @param {string} [p.rimType='hooked']
 * @param {string} [p.frontCasing='endurance']
 * @param {string} [p.rearCasing] - defaults to frontCasing
 * @param {boolean} [p.isTubeless=true]
 * @param {string} [p.bikeType='gravel']
 * @param {string} [p.frameSize='medium']
 * @param {string} [p.ridingPosition='intermediate']
 * @param {string} [p.surfaceType='smooth_gravel']
 * @returns {{ frontPsi, rearPsi, frontBar, rearBar }}
 */
function calculatePressure(p) {
  const {
    riderWeight,
    bikeWeight,
    frontLuggageWeight = 0,
    rearLuggageWeight = 0,
    bikepackingLoadWeight = 0,
    weightUnit = 'lbs',
    frontTireWidth,
    rearTireWidth,
    tireWidthUnit = 'mm',
    rimWidthMm = 23,
    rimType = 'hooked',
    frontCasing = 'endurance',
    rearCasing,
    isTubeless = true,
    bikeType = 'gravel',
    frameSize = 'medium',
    ridingPosition = 'intermediate',
    surfaceType = 'smooth_gravel',
  } = p;

  const fRearCasing = rearCasing ?? frontCasing;
  const fRearTireWidth = rearTireWidth ?? frontTireWidth;

  const fTireMm = tireWidthUnit === 'in' ? inToMm(frontTireWidth) : frontTireWidth;
  const rTireMm = tireWidthUnit === 'in' ? inToMm(fRearTireWidth) : fRearTireWidth;

  // Convert all weights to lbs
  const toLbs = weightUnit === 'kg' ? kgToLbs : (x) => x;
  const riderLbs = toLbs(riderWeight);
  const bikeLbs = toLbs(bikeWeight);
  const frontLugLbs = toLbs(frontLuggageWeight);
  const rearLugLbs = toLbs(rearLuggageWeight);
  const bpkLbs = toLbs(bikepackingLoadWeight);

  const totalLbs = riderLbs + bikeLbs + bpkLbs;

  // Weight distribution
  const [frontLoadLbs, rearLoadLbs] = weightDist(
    bikeType, frameSize, ridingPosition,
    frontLugLbs, rearLugLbs, totalLbs
  );

  // K coefficient
  const kFront = K;
  const kRear = K;

  // Corrections
  const rim = rimWidthCorrection(rimWidthMm);
  const tube = tubeCorrection(isTubeless);
  const surface = surfaceCorrection(surfaceType);
  const frontCasingCorr = casingCorrection(frontCasing);
  const rearCasingCorr = casingCorrection(fRearCasing);

  // Calculate PSI
  let frontPsi = kFront * frontLoadLbs / fTireMm * rim * frontCasingCorr * tube * surface;
  let rearPsi = kRear * rearLoadLbs / rTireMm * rim * rearCasingCorr * tube * surface;

  // Hookless rim cap
  if (rimType === 'hookless') {
    frontPsi = Math.min(72.5, frontPsi);
    rearPsi = Math.min(72.5, rearPsi);
  }

  // Safety clamp
  frontPsi = Math.max(15, Math.min(120, frontPsi));
  rearPsi = Math.max(15, Math.min(120, rearPsi));

  const finalFront = Math.round(frontPsi);
  const finalRear = Math.round(rearPsi);

  return {
    frontPsi: finalFront,
    rearPsi: finalRear,
    frontBar: parseFloat(psiToBar(finalFront).toFixed(1)),
    rearBar: parseFloat(psiToBar(finalRear).toFixed(1)),
  };
}

module.exports = {
  calculatePressure,
  K,
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
