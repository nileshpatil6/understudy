# Metrics

Every number this project reports, where it comes from in the code, and whether it is evidence of learning.

Read `docs/architecture.md` first for the loop itself. This file is only about the scoreboard.

All of it is computed in `src/eval/run.ts` and written to `results/<source>/<split>/run-N.json`.
Nothing on the dashboard or in `results/README.md` is typed by hand; every figure below can be recomputed
from a run file.

## Where the numbers come from

One run file is one eval pass over one split. It carries the run counter, the split, the item count,
the scores, the cost, the average latency, the rule count, the exact memory text the agent read, and
every individual prediction. Because the memory is stored inside the file, any run can be reproduced
later even after `memory/*.md` has moved on.

The splits mean different things and must never be read the same way:

| split | who sees it | what it is for |
|---|---|---|
| `train` (learn half, 70%) | the reflector sees these misses | the set the rules are written from |
| `train` (validate half, 30%) | scored under old and candidate memory | the gate that accepts or rejects a rule set |
| `test` | never reflected on, never gated on | the only honest report of generalization |

The learn / validate partition is `partition()` in `src/eval/run.ts`: a FNV-1a hash of the item id
mod 10, under 7 goes to learn. It is deterministic, so the halves are identical across runs and
across machines. That matters because a reshuffled split between runs would make the run-to-run
curve meaningless.

## 4-class accuracy

`accuracy = correct / items`, where correct means the predicted `Action` equals `Item.truth` exactly,
across `reply`, `act`, `archive`, `ignore`.

This is the strictest number the project reports and the one most easily misread, because the classes
are heavily imbalanced. On the real inbox held-out set, always answering `ignore` scores 67.7%
(`results/README.md`). The final gated run also scores 67.7% 4-class. Read alone, that run looks like
it learned nothing at all. It is only when you look at the attend/skip number and the per-action
breakdown that the difference between the two shows up: the constant predictor gets three of the four
classes completely wrong, and the learned run does not.

So: 4-class accuracy is worth reporting, but it is never worth reporting without the baseline next to it.

## Attend / skip accuracy

`attendAccuracy` collapses the four classes into two using `attends()` in `src/eval/run.ts`:
`reply` and `act` are attend, `archive` and `ignore` are skip. A prediction counts as correct when it
lands on the right side of that line, even if it picked the wrong action within the side.

This is the number closest to what a user of the system would actually feel, because the cost of
confusing `archive` with `ignore` is nearly zero, while the cost of confusing `reply` with `ignore` is
the whole product. On the real held-out set it moves 66.7% -> 86.0% over six gated rounds against a
67.7% constant baseline.

It is also the number most flattered by imbalance. In `results/gmail/train/run-1.json`, the run with
an empty memory and zero rules, attend/skip is already 93.1% while 4-class is 59.7%. Attend/skip
without its baseline printed beside it says almost nothing.

## The majority-class baseline

The majority-class baseline is the score of a predictor that ignores the input entirely and always
answers the most common class in that split. It costs nothing, learns nothing, and on imbalanced
inboxes it is hard to beat.

It matters here more than in a normal classification project for two reasons.

First, real inboxes are lopsided in exactly the direction that makes accuracy look good. Most mail is
never touched. A system that has learned nothing and answers `ignore` every time inherits that
lopsidedness as a score.

Second, this project's headline claim is that a cheap model plus learned rules matches a flagship
model. If the cheap model with rules only reaches the constant baseline, the claim is empty. Printing
the baseline is what keeps the claim falsifiable.

The baselines for the committed sample set, computed from `perAction` totals in the run files:

| split | items | class counts | always-`ignore` (4-class) | always-skip (attend/skip) |
|---|---|---|---|---|
| `gmail/train` | 144 | reply 24, act 42, archive 24, ignore 54 | 37.5% | 54.2% |
| `gmail/validate` | 51 | reply 8, act 11, archive 10, ignore 22 | 43.1% | 62.7% |

For the real inbox, `results/README.md` reports 67.7% on both for the held-out set. The two being
equal tells you the held-out set has essentially no `archive` items, so `skip` and `ignore` are the
same set there. That is a property of the data, not a result.

There is a second baseline that matters just as much: the same model on the same items with an empty
memory. Reproduce it with `NO_MEMORY=1 SPLIT=test RESULTS_TAG=no-memory npm run eval`, which writes
to a sibling tag directory instead of overwriting the split's run sequence. The memory-off number is
the one that isolates what the rules did, since it holds the model, the prompt scaffold, the effort
level and the items fixed and changes only the learned text.

## Per-action accuracy

`perAction` is a `{ total, correct }` pair for each of the four actions, keyed by ground truth. It is
recall per class, not precision: `total` is how many items truly had that action, `correct` is how
many of those the agent got right. There is no confusion matrix in the run file, so per-action numbers
say what was missed, not what it was mistaken for.

This is the breakdown that catches the collapse the aggregate hides. `results/gmail/train/run-1.json`
with an empty memory:

```
reply 18/24   act 42/42   archive 6/24   ignore 20/54
```

The agent was answering `act` for nearly everything. That is a 59.7% aggregate built out of one
saturated class and two broken ones. By run 2, with six rules, `archive` went 6/24 -> 24/24 and
`ignore` 20/54 -> 54/54 while `act` dropped 42/42 -> 31/42, which is the shape of a real behavior
change rather than a shift in bias.

A useful rule of thumb: any run whose gain lives entirely in the majority class has not learned
anything you would want to ship.

## Cost

`costUsd` on a run is the sum of `Prediction.costUsd`, computed in `costUsd()` in `src/agent/llm.ts`:

```
uncached = max(0, inputTokens - cachedTokens)
cost = (uncached * price.in + cachedTokens * price.cached + outputTokens * price.out) / 1e6
```

Prices are per 1M tokens and hard-coded in the `PRICES` table. For the prediction model
`gpt-5.6-luna` that is $0.20 input, $0.02 cached input, $1.20 output. Cached input is billed at one
tenth of the uncached rate, so the split between the two dominates the bill on any run where the
prompt is mostly fixed.

That split is the reason `src/agent/predict.ts` puts the memory in the system prompt and the item in
the user message. The system prefix is byte-identical for every item in a run, so the provider's
prompt cache can serve it after the first call. Growing memory therefore costs far less per run than
its token count suggests, which is what makes rule accumulation affordable.

Two caveats on reading the cost figures.

It is an estimate, not an invoice. The price table is a local constant. If provider pricing moves and
the table does not, every historical run file silently reports the wrong dollar amount. Compare cost
figures across runs, not against a billing statement.

`Prediction` records `inputTokens` and `outputTokens` but not `cachedTokens`, so a run file cannot be
decomposed back into cached and uncached input after the fact. In the committed sample runs this is
recoverable by arithmetic: for all four `results/gmail/train/run-N.json` files, `inputTokens * 0.20 +
outputTokens * 1.20` per 1M reproduces the recorded `costUsd` to the last digit, which means
`cachedTokens` was zero for every one of those predictions. The sample prompts are short enough that
the cache never engaged. Do not read the sample runs as a demonstration of the caching argument; the
real-inbox runs in `results/README.md` are where memory is large enough for it to bite.

## Latency

`avgLatencyMs` is the mean of `Prediction.latencyMs`, and each of those is wall clock around a single
`chat.completions.create` call in `src/agent/llm.ts`. It measures one item end to end including
provider queueing and reasoning tokens.

It is not the duration of the run. `runEval` maps with a concurrency of 6 by default, so a 144-item
run at 1.9s per item finishes in well under 144 * 1.9 seconds.

Latency is the noisiest number in the file. It moves with provider load and network conditions on the
day, so a run-to-run difference of a few hundred milliseconds carries no information. It is here to
show the order of magnitude (a couple of seconds per item, on a cheap model at low effort) and to
catch a regression into a different order of magnitude, nothing finer.

## Rule count

`memoryRules` is `memoryRuleCount()` in `src/agent/predict.ts`, which is `listRules()` over both
memory files. `listRules()` in `src/memory/store.ts` counts lines beginning with `- `. Prose,
headings and blank lines do not count. It is a count of bullets, not a measure of knowledge.

Read it as a budget, not a score. More rules is not better; the gate in `src/reflect/run.ts` triggers
consolidation past 20 rules precisely because unbounded growth is the failure mode. In the ungated v1
run, memory reached 35 rules and held-out accuracy fell to 57%, most of the additions being
sender-specific exceptions. The gated run reached 68% held-out with 11.

The number worth watching is rules against held-out accuracy over rounds. Rules rising while held-out
is flat or falling means the reflector is memorizing.

## Which numbers are evidence of learning

Evidence:

- **Held-out 4-class and attend/skip accuracy**, compared against both the majority-class baseline and
  the same model with `NO_MEMORY=1` on the same items. The `test` split is never reflected on and
  never gated on, so it is the only split that can carry this claim.
- **Held-out per-action accuracy**, especially the non-majority classes. A constant predictor scores
  zero on three of the four; recovering them cannot be done by shifting bias.
- **Held-out accuracy holding or rising while the rule count stays bounded.** Generalization that
  survives consolidation is the thing the gate exists to produce.

Not evidence, whatever the value:

- **Train accuracy.** The reflector wrote its rules from misses on that half. `results/gmail/train/run-4.json`
  is 144/144, which says the rules describe the items they were written from, and nothing more.
- **Validate accuracy.** It is the accept/reject signal for candidate memory, so the selected memory
  is fit to it by construction. It is a control input, not a report.
- **Attend/skip on its own.** 93.1% with zero rules on the sample train set. Without a baseline beside
  it, the number is a description of the class balance.
- **4-class accuracy on its own.** 67.7% held-out on the real inbox is exactly the always-`ignore`
  score. Same number, opposite meanings, and only the breakdown separates them.
- **Cost, latency, rule count.** Operational figures. They constrain what is worth shipping and say
  nothing about whether anything was learned. A run can get cheaper and faster while getting worse.
- **Any number from the sample dataset.** `data/sample/*.jsonl` is generated by `scripts/gen-sample.ts`
  with deliberately learnable planted patterns. It exists so the loop can be run and reviewed without
  private mail. Sample scores demonstrate that the machinery works, not that a person's judgment was
  captured.

## Reproducing a reported number

```bash
npm run eval                                          # train split, current memory on disk
SPLIT=test npm run eval                               # held-out
NO_MEMORY=1 SPLIT=test RESULTS_TAG=no-memory npm run eval   # memory-off baseline, own directory
PRIVATE=1 SOURCE=gmail npm run loop                   # full eval -> reflect -> eval chart
npm run dashboard                                     # renders dashboard/<source>.html from results/ and memory/
```

`summarize()` in `src/eval/run.ts` prints the one-line form: accuracy, attend/skip, cost, average
latency, rule count, then the per-action tallies. Everything in this document is a longer way of
reading that line.
