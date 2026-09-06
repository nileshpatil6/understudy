# Architecture

Understudy is a learning system, not a classifier. The classifier is deliberately the cheapest model available.
Everything interesting happens around it: where ground truth comes from, what the agent is allowed to see,
how memory grows, and how growth is gated so it generalizes instead of memorizing.

```
                 data/<private|sample>/<source>.jsonl          data/.../<source>.test.jsonl
                 (train: learn 70% | validate 30%)             (held out, never reflected on)
                                 |                                          |
                                 v                                          v
   +------------------------------------------------------------------------------------+
   |  eval harness   src/eval/run.ts                                                     |
   |    for each item: render (labels stripped) -> predict(item, memory) -> score        |
   |    writes results/<split>/run-N.json: every prediction, cost, latency, memory used  |
   +------------------------------------------------------------------------------------+
                                 |
             misses on the LEARN half only
                                 v
   +------------------------------------------------------------------------------------+
   |  reflector      src/reflect/run.ts        (gpt-6-astra, high effort, once per run)  |
   |    propose 3-6 general rules  ->  candidate memory                                  |
   |    gate: score VALIDATE half with old memory (free, reuse run) vs candidate memory  |
   |      hold or improve  -> accept                                                     |
   |      drop > 2 pts, or > 20 rules -> consolidate (rewrite to fewer, broader rules)   |
   |                                        -> keep best of {old, candidate, rewritten}  |
   +------------------------------------------------------------------------------------+
                                 |
                                 v
              memory/judgment.<source>.md   memory/tools.<source>.md      (plain markdown, git tracked)
                                 |
                                 v
                        next run reads them
```

## Ground truth without labeling

Each source app already records what the user did. For Gmail (`src/tools/gmail-labels.ts`):

| observed in Gmail | truth |
|---|---|
| user sent a message later in the thread | reply |
| starred, or Gmail marked IMPORTANT and the user opened it | act |
| removed from inbox, or opened in inbox and left | archive |
| still unread in inbox | ignore |

The same shape works for Slack (replied / reacted / read / unread) and GitHub notifications (commented / done / read / unread).
`Item.truth` is the only place these signals appear. The agent never receives them.

## What the agent is allowed to see

`src/agent/predict.ts#renderItem` strips every label-derived field (`labels`, `readAt`, `reactions`, ...)
before the item reaches the model or the reflector. The agent sees exactly what exists at arrival time:
sender, subject, snippet, timestamp, cc, and whether the message continues a thread the user started.

This is enforced by a unit test. The first version of the reflector saw `meta.labels` and reached 99% train
accuracy by learning the labeling function ("UNREAD -> ignore"). That result is preserved in `results/README.md`
as the reason this boundary exists.

## Two memories

- `judgment.<source>.md`: rules about the person. "Human replies continuing an inquiry the user initiated -> reply."
- `tools.<source>.md`: rules about reading the source. "For workflow mail, extract repo and workflow from the subject; `Run failed` alone carries no signal."

Both are plain markdown bullet lists. They are the entire learned state. `git log -p memory/` is the learning curve in prose.

## Gated learning

The reflector is not trusted. It proposes; validation decides.

1. Train items are split 70/30 by id hash into learn / validate. The split is fixed across runs.
2. The reflector sees misses from the learn half only.
3. Validate accuracy under the old memory comes for free from the run that just finished.
4. One small eval (about 45 items, ~$0.01) scores validate under the candidate memory.
5. Accept if validate holds within 2 points. Otherwise, or if memory exceeds 20 rules, a consolidation call
   rewrites the whole memory into fewer, broader rules, ranked by how often the agent actually cited each rule
   (`Prediction.rulesUsed`). The best of old / candidate / rewritten wins.

Effect on real data (`results/README.md`): the ungated reflector reached 91% train and 57% held-out with 35 rules.
The gated reflector reached 68% train and 68% held-out with 11 rules. It traded train accuracy for generalization,
which is the only trade a learning system should make.

## Cost and speed

Prediction runs on `gpt-5.6-luna` with `reasoning_effort: low`, memory in the system prompt so the provider cache
hits across all 148 items. About $0.03 and 2.1 seconds per item per run. Reflection runs on `gpt-6-astra` once per
round, about $0.15 to $0.30 including the gate evals. Learned memory moves luna from 35.5% to 67.7% on held-out,
matching `gpt-6-astra` with the same memory at 1/40 the cost.

## Evaluation

Every reported number, its baseline, and whether it is evidence of learning is documented in
[docs/metrics.md](metrics.md). Read it before quoting any accuracy figure: the 4-class number on the real
held-out set matches the always-`ignore` baseline, so it means nothing without the attend/skip and per-action
breakdown beside it.

`npm run loop` produces the whole chart: train, held-out, per-action, cost, latency, rules, and the reflector's
decision each round. `npm run dashboard` renders `dashboard/<source>.html` from `results/` and `memory/`
(inline SVG, no dependencies). Neatlogs traces every prediction and reflection when `NEATLOGS_API_KEY` is set.

## Adding a source

1. `src/tools/<source>.ts`: `derive<Source>Action(facts)` from that app's activity signals, with tests.
2. An exporter that writes `data/private/<source>.jsonl` in the `Item` schema, with the raw signals under `meta`
   and their keys added to `HIDDEN_META` in `src/agent/predict.ts`.
3. `SOURCE=<source> npm run loop`. Nothing else changes.
