# Results

`results/<source>/<split>/run-N.json` for the committed sample set, `results/private/...` (gitignored) for real data.
Each run file holds every prediction, cost, latency and the exact memory the agent read.

## Gmail, real inbox, gated reflector (2026-09-06)

148 train items, 93 held-out items from an earlier date range the reflector never sees.
Prediction model gpt-5.6-luna, reflection model gpt-6-astra. Agent never sees read/label state.

| run | train 4-class | held-out 4-class | held-out attend/skip | rules | cost / 148 | reflect decision |
|---|---|---|---|---|---|---|
| 1 | 32.4% | 23.7% | 66.7% | 0  | $0.026 | accepted (+6) |
| 2 | 61.5% | 63.4% | 84.9% | 6  | $0.033 | consolidated (validate fell 70 -> 54, rewrite kept 70) |
| 3 | 62.2% | 66.7% | 84.9% | 6  | $0.034 | accepted (+6) |
| 4 | 68.2% | 64.5% | 80.6% | 12 | $0.041 | accepted (+6) |
| 5 | 68.9% | 63.4% | 84.9% | 18 | $0.047 | consolidated (18 -> 11 rules) |
| 6 | 67.6% | **67.7%** | **86.0%** | 11 | $0.039 | |

Majority-class baseline on held-out: 67.7% (always "ignore"), 67.7% attend/skip.

## Baselines on the same held-out set

| model | memory | 4-class | attend/skip | cost / 93 | latency |
|---|---|---|---|---|---|
| gpt-6-astra | none | 43.0% | 81.7% | $0.479 | 2.8s |
| gpt-6-astra | learned, 11 rules | 67.7% | 88.2% | $1.020 | 3.3s |
| gpt-5.4-mini | none | 20.4% | 72.0% | $0.062 | 1.8s |
| gpt-5.6-luna | none | 35.5% | 75.3% | $0.013 | 2.0s |
| **gpt-5.6-luna** | **learned, 11 rules** | **67.7%** | **86.0%** | **$0.024** | **2.1s** |

Eleven learned rules move the cheapest model from 35.5% to 67.7%, matching the flagship with memory at 1/40 the cost.

## Ungated reflector (v1, kept for comparison)

Same data, reflector saw all train misses, no validation gate, no consolidation.
Train 31 -> 91%, held-out 25 -> 66 -> 48 -> 52 -> 57%, 35 rules, most of them sender-specific exceptions.
