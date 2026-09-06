# Results

`results/<source>/<split>/run-N.json` for the committed sample set, `results/private/...` (gitignored) for real data.
Each run file holds every prediction, cost, latency and the exact memory the agent read, so every number below
can be recomputed from disk without calling a model. `scripts/backfill-metrics.ts` does exactly that.

Which metric to read, and why, is argued in [docs/metrics.md](../docs/metrics.md). Short version: this data is
heavily imbalanced, so raw accuracy is close to meaningless on its own. macro-F1 and balanced accuracy are the
honest headline.

## Gmail, real inbox, gated reflector (2026-09-06)

148 train items, 93 held-out items from an earlier date range the reflector never sees.
Prediction model `gpt-5.6-luna`, reflection model `gpt-6-astra`. The agent never sees read/label state.

| run | train acc | held-out acc | **macro-F1** | **balanced acc** | attend/skip | rules | cost / 148 | reflect decision |
|---|---|---|---|---|---|---|---|---|
| 1 | 32.4% | 23.7% | 17.4% | 24.8% | 66.7% | 0 | $0.026 | accepted (+6) |
| 2 | 61.5% | 63.4% | 30.8% | 32.7% | 84.9% | 6 | $0.033 | consolidated (validate fell 70 → 54) |
| 3 | 62.2% | 66.7% | 33.1% | 33.5% | 84.9% | 6 | $0.034 | accepted (+6) |
| 4 | 68.2% | 64.5% | 34.3% | 35.6% | 80.6% | 12 | $0.041 | accepted (+6) |
| 5 | 68.9% | 63.4% | 39.5% | 42.0% | 84.9% | 18 | $0.047 | consolidated (18 → 11) |
| 6 | 67.6% | 67.7% | **40.0%** | **43.1%** | **86.0%** | 11 | $0.039 | |
| | | | | | | | | |
| always-`ignore` baseline | | 67.7% | 20.2% | 25.0% | 67.7% | 0 | $0 | |

**Read the macro columns, not the accuracy column.** The held-out set is 68% `ignore`, so a predictor that
always answers `ignore` scores 67.7% accuracy while getting three of the four classes completely wrong. Our
final run ties it on accuracy and doubles it where imbalance cannot help: macro-F1 20.2 → 40.0, balanced
accuracy 25.0 → 43.1.

Those two columns also climb monotonically across all six runs (17.4 → 30.8 → 33.1 → 34.3 → 39.5 → 40.0),
which the raw accuracy column does not. That monotonic climb, on data the reflector never saw, is the actual
claim this project makes.

## Baselines on the same held-out set

| model | memory | acc | macro-F1 | balanced acc | attend/skip | cost / 93 | latency |
|---|---|---|---|---|---|---|---|
| always `ignore` | n/a | 67.7% | 20.2% | 25.0% | 67.7% | $0 | 0s |
| gpt-5.4-mini | none | 20.4% | 16.0% | 32.5% | 72.0% | $0.062 | 1.8s |
| gpt-5.6-luna | none | 35.5% | 23.4% | 26.6% | 75.3% | $0.013 | 2.0s |
| gpt-6-astra | none | 43.0% | 30.2% | 34.9% | 81.7% | $0.479 | 2.8s |
| gpt-6-astra | learned, 11 rules | 67.7% | 42.5% | 44.8% | 88.2% | $1.020 | 3.3s |
| **gpt-5.6-luna** | **learned, 11 rules** | **67.7%** | **40.0%** | **43.1%** | **86.0%** | **$0.024** | **2.1s** |

Two things this table says.

First, eleven plain-English rules are worth more than a model upgrade. `luna` + memory (40.0 macro-F1) beats
`astra` with no memory (30.2) at one twentieth the cost, and lands within 2.5 points of `astra` *with* the same
memory at one fortieth the cost.

Second, the rules are portable. They were written by `astra` during reflection and they transfer intact to a
model forty times cheaper. The learning is not model-specific.

## Sample set, reproducible without a private inbox (2026-09-06)

```
npx tsx scripts/gen-sample.ts && MEMORY_DIR=memory/sample npm run loop
```

144 synthetic train items, 60 held-out items generated from the same templates but different instances.
Same gated loop, same models. The reflector never sees the held-out split.

| run | train acc | held-out acc | held-out attend/skip | rules | reflect decision |
|---|---|---|---|---|---|
| 1 | 56.3% | 61.7% | 91.7% | 0 | accepted (+6), validate 51 → 94 |
| 2 | 95.1% | 93.3% | 100.0% | 6 | accepted (+3), validate 92 → 98 |
| 3 | 96.5% | 98.3% | 98.3% | 9 | accepted (+3), validate 98 → 100 |
| 4 | 100.0% | **100.0%** | **100.0%** | 12 | 0 misses, nothing proposed |
| 5 | 100.0% | 100.0% | 100.0% | 12 | |

**Read this as a smoke test, not as evidence.** The sample data is synthetic and its patterns are cleanly
separable by construction, so saturating at 100% is the expected outcome and says nothing about real-world
difficulty. What it does show is that the loop works end to end on data a judge can regenerate: the memory
transfers to items the reflector never saw, and the reflector correctly stops proposing once there is nothing
left to learn. The real-inbox numbers above are the evidence.

## Ungated reflector (v1, kept for comparison)

Same data, reflector saw all train misses, no validation gate, no consolidation.
Train 31 → 91%, held-out 25 → 66 → 48 → 52 → 57%, 35 rules, most of them sender-specific exceptions.

This is why the gate exists. The gated reflector reached lower train accuracy (68%) and higher held-out
accuracy (68%) with a third as many rules. Trading train accuracy for generalization is the only trade a
learning system should make.

## Label leakage (v0, kept as a warning)

The very first loop reached 99% train accuracy in three rounds by reading `meta.labels`, the Gmail flags that
ground truth is derived from. It had learned the labeling function ("UNREAD → ignore"), not the user. An email
arriving right now carries none of those flags; they are a record of what the user did afterwards.

`src/agent/predict.ts#renderItem` now strips every label-derived field before the item reaches the model or
the reflector, and `src/agent/predict.test.ts` fails if one leaks back in.
