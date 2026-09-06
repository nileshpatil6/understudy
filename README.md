# Understudy

An agent that learns *your* judgment by watching what you actually did in your own apps, then does the work for you, and gets measurably better on items it has never seen.

Built for Syndicate by Maximor, Track 1: Automated Agent Engineering. Built end to end in Agent Orchestrator.

## The trick

Every "self-improving agent" needs ground truth. Most teams hand-label it. We label nothing.

Your inbox already recorded the right answer for every email: you replied, you starred it, you opened and left it, you never touched it. Thousands of free labels. Same for Slack, GitHub, anything with an activity log.

```
read item (Gmail / Slack / GitHub)          the agent sees only what exists at arrival:
  -> predict what you would do              sender, subject, snippet, time, cc.
       reply | act | archive | ignore       never the read / starred / label state.
  -> compare with what you really did
  -> reflect on the misses                  learns from 70% of train,
  -> keep a rule only if it holds           must hold on the other 30%,
     on data it did not learn from          consolidates when memory bloats.
  -> next run reads the new memory          memory/judgment.gmail.md, plain markdown
```

## Numbers, real inbox, held-out set the reflector never sees

| | run 1 | run 6 |
|---|---|---|
| held-out 4-class accuracy | 23.7% | **67.7%** |
| held-out attend vs skip | 66.7% | **86.0%** |
| rules in memory | 0 | 11 |
| cost per run of 148 emails | $0.026 | $0.039 |
| latency per email | 2.4s | 2.1s |

Same held-out set, no learning: `gpt-6-astra` 43.0% at $0.48. With the 11 learned rules, `gpt-5.6-luna` matches `gpt-6-astra`+memory (67.7%) at 1/40 the cost.

Our first reflector hit 91% on train and 57% on held-out. We caught it, built the validation gate, and kept the bad run in `results/README.md`. Full tables and the ungated comparison there.

## Layout

```
src/eval      harness: predict, score, write results/<split>/run-N.json (predictions, cost, latency, memory used)
src/agent     predict(item, memory); renderItem strips label-derived fields (unit tested)
src/reflect   validation-gated reflection: learn half -> propose -> gate on validate half -> accept / consolidate / reject
src/memory    two markdown memories per source; consolidate.ts rewrites bloated memory into fewer
              general rules (model call), prune.ts drops uncited ones (deterministic, PRUNE=1)
src/tools     source adapters + ground-truth derivation (gmail-labels.ts)
src/dashboard self-contained HTML: accuracy curves, cost, per-action table, the memory with new rules highlighted
data/sample   synthetic inbox, committed, for CI and public demos
data/private  your real export, gitignored
memory/       the learned rules, git tracked: `git log -p memory/` is the learning curve
results/      one JSON per run, plus README.md with the headline tables
docs/         architecture.md, ao-workers.md, demo-script.md
```

## Run it

```
npm i
cp .env.example .env            # OPENAI_API_KEY, optional NEATLOGS_API_KEY
npx tsx scripts/gen-sample.ts   # 144-item synthetic inbox
MEMORY_DIR=memory/sample npm run loop   # 5 rounds: eval -> gated reflect -> eval
npm run dashboard               # dashboard/gmail.html
```

The same loop runs on the other sources with no code changes:

```
SOURCE=slack  MEMORY_DIR=memory/sample npm run loop
SOURCE=github MEMORY_DIR=memory/sample npm run loop
```

On your own inbox: export to `data/private/gmail.jsonl` (+ `gmail.test.jsonl` for a held-out range) using the rules in `data/README.md`, then `PRIVATE=1 npm run loop` and `PRIVATE=1 npm run dashboard`.

Env: `SOURCE=gmail|slack|github`, `ROUNDS=5`, `LIMIT=50`, `PRIVATE=1`, `TEST=0` (skip held-out), `MEMORY_DIR`, `UNDERSTUDY_MODEL` (gpt-5.6-luna), `UNDERSTUDY_REFLECT_MODEL` (gpt-6-astra), `NO_MEMORY=1` (bare-model baseline), `RESULTS_TAG` (file a one-off run separately), `PRUNE=1` (drop rules the agent stopped citing).

`npm test`, `npm run typecheck`, `npm run lint` run in CI on every PR.

## Built with AO

The core loop was built with Claude Code driven from this project's session. Every feature PR was built by an
Agent Orchestrator worker in its own worktree with its own PR and green CI, spawned by the AO orchestrator from
the prompts in `docs/ao-workers.md`: Slack and GitHub adapters, sample datasets with a held-out split, eval
harness tests, the memory pruner, the metrics doc. `git log` shows which is which: AO work lands as
squash-merged PRs (`#N`), core work as direct commits.
