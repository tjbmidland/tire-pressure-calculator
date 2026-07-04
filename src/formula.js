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