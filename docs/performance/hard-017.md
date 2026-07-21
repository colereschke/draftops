# HARD-017 Performance Results

- Date: 2026-07-21T17:35:31.970Z
- Browser: 149.0.7827.55
- Viewport: 390 × 844
- CPU throttle: 4× Chromium CDP emulation
- Fixture players: 267
- Rendered rows: 267
- Main descendant DOM nodes: 3627
- Value-sheet RSC bytes: 161
- Bounded Sleeper search bytes: 861 (8 results)

## Interaction timing (ms)

Warm-up samples discarded: 5; each list below has 20 retained samples.

| Interaction |   p75 | Raw samples                                                                                                                                |
| ----------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| QB filter   | 276.3 | 276.3, 312.9, 269.7, 273.9, 266.8, 276.4, 267.9, 262.9, 289.6, 257.8, 256.0, 296.4, 263.4, 265.0, 259.2, 243.0, 259.9, 261.9, 258.3, 281.6 |
| Player sort | 402.5 | 385.2, 418.6, 371.8, 367.5, 400.8, 367.5, 368.3, 420.0, 386.6, 384.6, 416.0, 366.6, 382.4, 417.9, 384.5, 399.3, 417.5, 384.8, 397.9, 402.5 |
