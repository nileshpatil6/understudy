# Understudy

**An agent that learns your judgment from what you already did in your own apps, and proves it on items it has never seen.**

Nobody labels anything. Your inbox recorded the answers years ago.

Built in 30 hours for [Syndicate by Maximor](https://syndicate-by-maximor.devpost.com/), Track 1: Automated Agent Engineering. Built with [Agent Orchestrator](https://aoagents.dev/).

---

## My agent hit 99% accuracy in three hours. So I deleted it.

It was cheating. That's the honest version of this README, and the rest of it is what I built after I caught it. Twice.

## The idea

Every "self-improving agent" has the same problem: to improve, it has to know when it was wrong. So someone hand-labels a few hundred examples, badly, at hour twenty.

But the labels already exist. Gmail knows you replied to that email, starred that one, opened this one and left, never touched that one at all. Slack knows whether you reacted. GitHub knows whether you marked it done. Every app with an activity log is a free, personal, labelled dataset.

Understudy reads that log and learns what *you* would do.

```
incoming item  ->  predict: reply | act | archive | ignore
               ->  compare to what you actually did
               ->  reflect on the misses, write rules
               ->  test every rule on data it did not learn from
               ->  keep, consolidate, or delete
               ->  next run reads the memory
```

The agent sees only what exists the moment the item lands: sender, subject, snippet, timestamp, cc. Never the read state. Never the labels. There is a unit test that fails if that boundary is ever crossed, because the first version crossed it.

## What it learned

The entire learned state is one markdown file. From my real inbox, after six rounds:

```
- Human replies continuing an inquiry the user initiated, providing answers,
  guidance, constraints, or referrals, even without a question -> reply
- Standalone automated operational reports (CI results, package publication,
  performance milestones) with no assigned task -> ignore
- Authentication messages supplying a numeric code the user must enter -> act
- Expiring one-click sign-in links and after-the-fact credential confirmations -> ignore
```

Eleven rules. No weights, no vector store. You can read them, edit them, delete one, `git blame` them.

## Results

Real inbox. 148 training emails, 93 held-out emails from an earlier month that the learning process never touched.

| held-out, 93 emails | always "ignore" | run 1, no memory | **run 6, 11 rules** |
|---|---|---|---|
| macro-F1 | 20.2% | 17.4% | **40.0%** |
| balanced accuracy | 25.0% | 24.8% | **43.1%** |
| attend vs skip | 67.7% | 66.7% | **86.0%** |
| raw accuracy | 67.7% | 23.7% | 67.7% |

That last row is the one to be suspicious of, and the reason the others are there. The held-out set is 68% `ignore`, so always guessing "ignore" scores 67.7% while getting three of four classes completely wrong. Read the balanced rows. Macro-F1 climbs every single run: 17.4 → 30.8 → 33.1 → 34.3 → 39.5 → 40.0. Paired bootstrap on the gain: **+22.6 points, 95% CI [11.0, 33.2]**.

**The rules are worth more than the model.**

| model | memory | macro-F1 | cost / 93 items |
|---|---|---|---|
| gpt-6-astra | none | 30.2% | $0.48 |
| gpt-6-astra | 11 learned rules | 42.5% | $1.02 |
| gpt-5.6-luna | none | 23.4% | $0.013 |
| **gpt-5.6-luna** | **11 learned rules** | **40.0%** | **$0.024** |

Eleven lines of English take the cheapest model past the flagship at one twentieth the cost. Written by the big model during reflection, they transfer unchanged to the small one.

**Second source, zero code changes.** `SOURCE=slack npm run loop`: 88% → 100% in three rounds, seven rules, then the reflector proposed nothing because there was nothing left to learn.

Every number above, the runs that produced them, and both failed versions are in [`results/README.md`](results/README.md). Which numbers count as evidence and which do not is argued in [`docs/metrics.md`](docs/metrics.md).

## The two failures, kept on purpose

**v0 read the answer sheet.** 99% train accuracy in three rounds, because the reflector could see `meta.labels`, the same Gmail flags the ground truth is derived from. It learned "UNREAD → ignore". Correct and useless. Fixed by stripping every label-derived field before the model sees anything, enforced by `src/agent/predict.test.ts`.

**v1 memorised.** 91% on train, held-out went 25 → 66 → 48 → 52 → 57. Thirty-five rules, mostly exceptions about one sender. Fixed by not trusting the reflector: it learns from 70% of the training set and every proposal is scored on the other 30% before it is kept. Regress and it is deleted. Bloat past 20 rules and a consolidation pass rewrites the memory into fewer, broader ones. Thirty-five rules became eleven; train went down, held-out went up.

## How it is built

TypeScript, Node 22, no framework. OpenAI for prediction (cheapest model, low effort, memory in the cached prefix) and reflection (strongest model, once per round). [Neatlogs](https://neatlogs.com) traces every call so a bad prediction sits next to the reflection that fixed it.

```
src/eval        harness: predict, score, write results/<split>/run-N.json with every prediction, cost, latency, memory
src/agent       predict(item, memory); renderItem strips label-derived fields
src/reflect     gated reflection: learn half -> propose -> validate half -> accept / consolidate / reject
src/memory      the markdown memories; consolidate.ts (model rewrite), prune.ts (deterministic drop, PRUNE=1)
src/tools       gmail, slack, github adapters and ground-truth derivation
src/dashboard   self-contained HTML: curves, cost, per-action table, memory with new rules highlighted
scripts/        loop.ts (the whole experiment), gen-sample.ts, export-github.ts, backfill-metrics.ts
data/sample     synthetic sets for gmail, slack, github, plus a held-out gmail split. Committed.
data/private    your real export. Gitignored.
memory/         the learned rules. git log -p memory/ is the learning curve in prose.
results/        one JSON per run, README.md with every table
docs/           architecture, metrics, the full story, AO worker prompts, demo script
```

### Built with Agent Orchestrator

The core loop was built in Claude Code. Everything around it came out of AO: one prompt to the orchestrator, six worker sessions spawned in parallel, each in its own worktree, each opening its own PR.

| PR | worker | what it built |
|---|---|---|
| #1 | slack-adapter | Slack source with derived ground truth |
| #2 | github-adapter | GitHub notifications adapter and `gh api` exporter |
| #3 | eval-tests | unit tests for the harness's pure functions |
| #4 | memory-pruning | deterministic rule pruner |
| #5 | docs-metrics | the doc that argues against our own headline number |
| #6 | sample-datasets | slack and github samples, held-out gmail split |

All six merged, all CI green, zero file-ownership collisions. Tests went from 10 to 83. The prompts are in [`docs/ao-workers.md`](docs/ao-workers.md).

## Run it

```bash
npm i
cp .env.example .env                       # OPENAI_API_KEY, optional NEATLOGS_API_KEY
npx tsx scripts/gen-sample.ts              # synthetic gmail / slack / github sets
MEMORY_DIR=memory/sample npm run loop      # 5 rounds: eval -> gated reflect -> eval
npm run dashboard                          # dashboard/gmail.html
```

Other sources, same loop:

```bash
SOURCE=slack  MEMORY_DIR=memory/sample npm run loop
SOURCE=github MEMORY_DIR=memory/sample npm run loop
```

Your own inbox: export to `data/private/gmail.jsonl` (and `gmail.test.jsonl` for a held-out range) following [`data/README.md`](data/README.md), then `PRIVATE=1 npm run loop`.

| env | default | what |
|---|---|---|
| `SOURCE` | `gmail` | `gmail`, `slack`, `github` |
| `ROUNDS` | `5` | eval → reflect cycles |
| `LIMIT` | all | cap items per run |
| `PRIVATE` | off | use `data/private` and `results/private` |
| `TEST` | on | `TEST=0` skips held-out scoring |
| `MEMORY_DIR` | `memory` | keep sample runs from touching real memory |
| `PRUNE` | off | `PRUNE=1` drops rules the agent stopped citing |
| `NO_MEMORY` | off | `NO_MEMORY=1` scores the bare model as a baseline |
| `UNDERSTUDY_MODEL` | `gpt-5.6-luna` | prediction model |
| `UNDERSTUDY_REFLECT_MODEL` | `gpt-6-astra` | reflection model |

`npm test`, `npm run typecheck`, `npm run lint` run in CI on every push and PR.

## Read more

- [`docs/STORY.md`](docs/STORY.md): the whole thing in plain language, start to finish
- [`docs/architecture.md`](docs/architecture.md): the loop, the gate, the two memories, adding a source
- [`docs/metrics.md`](docs/metrics.md): every reported number and whether it is evidence
- [`results/README.md`](results/README.md): all tables, all runs, both failures
