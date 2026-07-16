// Minimum |spread| (percentile points) required to fire an archetype tag.
// The gate scales down with age: older players need a smaller edge because the
// dynasty market already discounts age, so a residual underpricing is a stronger
// win-now signal. TUNABLE (backend-only).
export const SPREAD_GATE = 15;
export const SPREAD_GATE_OLD = 10;
