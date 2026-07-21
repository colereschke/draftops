# HARD-017 Performance Results

- Command: `pnpm performance:hard-017`
- Viewport: 390 × 844
- CPU throttle: 4× Chromium CDP emulation
- Fixture players: 267
- Fixture Sleeper identities: 5000
- Warm-up samples discarded: 5
- Retained samples per interaction: 20
- Interaction budget: ≤ 200 ms at p75

## Comparison

| Metric                    | Baseline |  Final |  Delta |
| ------------------------- | -------: | -----: | -----: |
| Value-sheet RSC bytes     |   138423 | 133916 |  -3.3% |
| Rankings RSC bytes        |   972848 |  11125 | -98.9% |
| Main descendant DOM nodes |     3627 |   3627 |  +0.0% |
| QB-filter p75 (ms)        |     83.3 |   54.7 | -34.3% |
| Player-sort p75 (ms)      |    188.7 |  183.2 |  -2.9% |

## Raw measurements

### Baseline

- Date: 2026-07-21T18:51:51.866Z
- Source commit: 360d3cf3cf6f9104c34f8754ffe24c0146d0b30b
- Browser: 149.0.7827.55
- Value-sheet RSC bytes: 138423
- Rankings RSC bytes: 972848
- Bounded Sleeper search bytes: n/a (bounded endpoint not present)
- Rendered rows: 267
- Main descendant DOM nodes: 3627
- QB-filter p75: 83.3 ms
- Player-sort p75: 188.7 ms
- QB-filter samples: 87.2, 81.9, 85.9, 89.7, 83.8, 71.4, 77.2, 80.7, 70.0, 72.8, 87.1, 69.5, 78.2, 73.6, 83.3, 78.2, 73.9, 78.2, 80.3, 77.7
- Player-sort samples: 197.8, 185.8, 181.5, 196.5, 181.2, 183.8, 188.8, 173.6, 184.8, 190.0, 185.8, 188.7, 188.1, 198.8, 171.9, 178.8, 188.1, 181.5, 184.9, 179.3

### Final

- Date: 2026-07-21T18:56:40.258Z
- Source commit: adea41a242d6bcb3c7441084144b7736e8ffe418 (working tree includes changes)
- Browser: 149.0.7827.55
- Value-sheet RSC bytes: 133916
- Rankings RSC bytes: 11125
- Bounded Sleeper search bytes: 894 (8 results)
- Rendered rows: 267
- Main descendant DOM nodes: 3627
- QB-filter p75: 54.7 ms
- Player-sort p75: 183.2 ms
- QB-filter samples: 50.9, 50.9, 54.7, 47.6, 52.8, 55.8, 42.9, 46.6, 68.3, 52.6, 46.7, 51.9, 59.3, 44.9, 51.7, 52.0, 57.0, 48.7, 54.3, 60.5
- Player-sort samples: 175.3, 178.1, 174.3, 172.5, 191.1, 161.8, 175.3, 183.2, 176.5, 170.6, 169.4, 186.8, 195.1, 187.1, 167.1, 188.8, 169.8, 158.8, 182.3, 168.7
