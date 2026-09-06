# Understudy: the whole story, in plain language

This is the complete account of what was built during Syndicate by Maximor, why, what went wrong, what was
fixed, and what the numbers mean. Written so that someone who did not watch it happen can explain it
confidently. Read it once top to bottom.

---

## 1. The hackathon

**Syndicate by Maximor.** 30 hours, online, ~770 registrants. Hosted by Agent Orchestrator (AO), with cash prizes
from Maximor, a finance-automation startup. Two tracks:

- **Track 1: Automated Agent Engineering.** Build an agent that gets better at a task over time.
- **Track 2: Autonomous Office of the CFO.** Automate a real finance workflow.

We chose **Track 1**.

**The judge told us what he wanted.** Maaz, one of the organizers, sent an email mid-hackathon that said,
roughly: give an agent access to third-party apps and a general task; show it *genuinely getting better over time*
through *self-reflection* and a *growing memory*; show it *learning contextual logic from the third-party tool's
data*; keep a good balance of *cost and speed*. He also said the domain does not matter.

Every design decision below maps back to one of those sentences.

**The mandatory constraint.** Everything must be built using Agent Orchestrator, and the demo must show the AO
dashboard with the sessions used. Projects without meaningful AO usage are disqualified.

**A trap we avoided.** A widely-shared Medium "field manual" for this hackathon claimed AO meant Arweave's "ao"
blockchain computer, with Lua smart contracts and crypto wallets. It is wrong. AO here is Agent Orchestrator, a
desktop app that runs many coding agents in parallel. Some fraction of the field followed that article.

---

## 2. What Agent Orchestrator actually is

AO is a desktop app (free, open source, made by Prateek Karnal, who is also a judge). It does not write code
itself. It launches coding agents you already have installed (we used Claude Code) and manages them:

- Each task gets its own **worker session**, its own git **worktree** and branch, and its own **pull request**.
- A **kanban board** shows every session: building, validating, in review, ready.
- An **orchestrator** agent can read a task description, plan it, and spawn the workers itself.
- When CI fails on a PR, AO routes the failure back to the worker to fix.

The judges score "AO usage" at 25% of the total. What they want to see is the board with real sessions, real
PRs, and evidence that parallel agents built the thing.

---

## 3. The idea

### The problem everyone has

Every "self-improving agent" needs **ground truth**: a way to know whether its answer was right, so it can learn
from being wrong. Almost every team solves this by hand-labeling a few hundred examples. That takes hours,
happens at 3am, and produces noisy labels. Then the "improvement" chart is noise.

### The insight

**The labels already exist.** Your inbox recorded what you did with every email you ever received. You replied
to it. You starred it. You opened it and left it. You never touched it. Gmail stores all of that. Thousands of
labels, free, and they describe *your actual judgment* rather than a guess.

Slack records the same thing (replied / reacted / read / unread). So does GitHub (commented / marked done / read
/ unread). Any app with an activity log is a free labeled dataset about one specific person.

### What the agent does

**Understudy** predicts what *you specifically* would do with an incoming item. Four possible answers:

| action | meaning |
|---|---|
| `reply` | you would write back |
| `act` | you would do something about it (star it, click through, follow up) without replying |
| `archive` | you would open it and dismiss it |
| `ignore` | you would leave it unread and never touch it |

It reads only what exists at the moment the item arrives: sender, subject, snippet, timestamp, cc, and whether
it continues a thread you started. Nothing else.

### How it learns

```
1. Run: predict an action for every item. Score against the derived truth.
2. Reflect: look at the misses. Write rules into a memory file.
3. Next run reads the memory. Repeat.
```

The memory is two plain-text markdown files:

- `memory/judgment.gmail.md`: rules about *you*. "Human replies continuing an inquiry the user initiated → reply."
- `memory/tools.gmail.md`: rules about *reading the source*. "For workflow mail, extract the repo and workflow
  name from the subject; 'Run failed' alone carries no signal."

Two memories because the judge asked for two kinds of learning: learning the task, and learning the tool.

The memory is the entire learned state. You can read it, edit it, and `git log -p memory/` shows the learning
curve in prose.

---

## 4. What went wrong, twice, and why that is the best part of the story

### Failure 1: it cheated (and we caught it)

The first loop reached **99% accuracy in three rounds**. Beautiful chart. Completely fake.

The reflector could see `meta.labels`, the Gmail flags like `UNREAD` and `IMPORTANT`. But those flags are
exactly what the ground truth was *derived from*. So it wrote rules like "UNREAD → ignore." Perfectly correct,
perfectly useless. It had learned our labeling formula, not the user.

An email arriving right now has no `UNREAD` flag yet. Those flags are a record of what you do *afterwards*. A
real agent can never see them at prediction time.

**The fix.** Every label-derived field is stripped before the item reaches the model or the reflector. A unit
test fails if one ever leaks back in. Memory was wiped and everything was rerun.

### Failure 2: it overfit (and we caught it)

The honest loop climbed to **91% on the training set**. But on a **held-out set** (93 older emails the reflector
never saw), accuracy went 25 → 66 → 48 → 52 → 57. It peaked early and decayed.

The memory had grown to 35 rules, and most of them were exceptions about individual senders: "Accubate final-day
reminders → ignore, overriding the earlier rule about saved Genesis applications." That is memorization, not
learning.

**The fix: stop trusting the reflector.** It now works like this:

1. The training set is split 70/30 by a hash of each item's id. The split never changes.
2. The reflector only sees misses from the 70% "learn" half.
3. Its proposed rules are tested on the 30% "validate" half. If validation accuracy drops, the rules are rejected.
4. If memory grows past 20 rules, or validation regresses, a **consolidation** pass rewrites the whole memory
   into fewer, broader rules, ranked by how often the agent actually cited each one.
5. The held-out test set is never touched by any of this.

**Result.** 11 rules instead of 35. Training accuracy went *down* (91% → 68%) and held-out accuracy went *up*
(57% → 68%). The gap between train and held-out closed. That trade, lower train for higher held-out, is the only
trade a learning system should ever make.

Both failures are preserved in `results/README.md`, not deleted.

---

## 5. The numbers, and which ones to trust

### The data

- **Train:** 148 real emails from the last 45 days of the author's inbox.
- **Held-out:** 93 real emails from 45 to 80 days ago. The reflector never sees these. They are the honest test.
- Ground truth derived from Gmail: replied → `reply`; starred, or marked important and opened → `act`;
  removed from inbox, or opened and left → `archive`; still unread → `ignore`.

### Why raw accuracy is misleading here

The held-out set is 68% `ignore`. So a program that always answers "ignore" scores **67.7% accuracy** while
getting three of the four classes completely wrong.

Our final run *also* scores 67.7% accuracy. Read alone, that looks like it learned nothing.

The metrics that cannot be gamed by imbalance are **macro-F1** (average F1 across the four classes) and
**balanced accuracy** (average recall across the four classes). A constant predictor scores 25% balanced accuracy
by construction, whatever the imbalance.

### The headline

| | always "ignore" | Understudy run 1 (no memory) | **Understudy run 6 (11 rules)** |
|---|---|---|---|
| accuracy | 67.7% | 23.7% | 67.7% |
| **macro-F1** | 20.2% | 17.4% | **40.0%** |
| **balanced accuracy** | 25.0% | 24.8% | **43.1%** |
| attend vs skip | 67.7% | 66.7% | **86.0%** |

We tie the dumb baseline on accuracy and **double it** on the metrics that matter. Macro-F1 climbs monotonically
across all six runs: 17.4 → 30.8 → 33.1 → 34.3 → 39.5 → 40.0.

**Is it noise?** 93 items is small, so we checked. Paired bootstrap, 5000 resamples: the run 1 → run 6
improvement in held-out macro-F1 is **+22.6 points, 95% confidence interval [+11.0, +33.2]**. The interval does
not come close to zero.

**"Attend vs skip"** collapses the four classes to two: does this need my attention (reply, act) or not
(archive, ignore). That is the distinction a user actually feels. 66.7% → 86.0%.

### Cost

Prediction runs on `gpt-5.6-luna`, the cheapest model available. Reflection runs once per round on `gpt-6-astra`,
the most capable.

| model | memory | macro-F1 | cost for 93 items |
|---|---|---|---|
| gpt-6-astra (flagship) | none | 30.2% | $0.48 |
| gpt-6-astra | 11 learned rules | 42.5% | $1.02 |
| gpt-5.6-luna (cheapest) | none | 23.4% | $0.013 |
| **gpt-5.6-luna** | **11 learned rules** | **40.0%** | **$0.024** |

Eleven plain-English rules make the cheapest model beat the flagship-without-memory, at one twentieth the cost,
and land within 2.5 points of the flagship-with-memory at one fortieth the cost. **The learning is worth more
than the model, and it is portable across models.**

Speed: about 2.1 seconds per email, $0.03 to $0.04 per run of 148.

### Second source: Slack

The same engine pointed at Slack with one environment variable and no code changes: 88% → 100% in three rounds,
7 rules. At round 3 the reflector proposed nothing, because there was nothing left to learn. A loop that cannot
stop is not learning; this one stopped.

(Slack and the public sample data are synthetic with cleanly separable patterns, so 100% is expected there. The
point is portability, not the score. The real-inbox numbers are the evidence.)

---

## 6. What AO built

Six worker sessions, spawned by the AO orchestrator from one prompt, each in its own worktree, each opening its
own PR, all six merged with green CI, zero file-ownership violations:

| PR | what |
|---|---|
| #1 | Slack source adapter with derived ground truth |
| #2 | GitHub notifications adapter and exporter |
| #3 | Unit tests for the eval harness |
| #4 | Deterministic memory pruner |
| #5 | Metrics documentation (argues against our own headline number) |
| #6 | Synthetic sample datasets for slack, github, and a held-out gmail split |

Test count went from 10 to 83. The core loop (eval harness, prediction, gated reflection, consolidation,
dashboard) was built with Claude Code driven from the main session. `git log` shows which is which: AO work lands
as squash-merged PRs, core work as direct commits.

---

## 7. The stack

- TypeScript, Node 22. No framework.
- OpenAI API for prediction and reflection.
- Neatlogs for tracing: every prediction and every reflection is a span, so a bad prediction can be inspected next
  to the reflection that fixed it.
- Vitest, ESLint, GitHub Actions CI on every PR.
- A self-contained HTML dashboard with inline SVG charts (no CDN, no build).

---

## 8. Repo map

```
src/eval      run the agent over a dataset, score it, write results/<split>/run-N.json
src/agent     predict(item, memory); strips label-derived fields before the model sees anything
src/reflect   validation-gated reflection: learn half → propose → gate on validate half → accept/consolidate/reject
src/memory    the two markdown memories; consolidate.ts (model rewrite), prune.ts (deterministic drop)
src/tools     source adapters and ground-truth derivation for gmail, slack, github
src/dashboard builds the HTML dashboard
data/sample   synthetic data, committed
data/private  real data, gitignored
memory/       the learned rules, git tracked
results/      one JSON per run, plus README.md with every table
docs/         architecture, metrics, demo script, AO worker prompts, Devpost text, this file
```

---

## 9. Glossary

- **Ground truth.** The correct answer, used to score predictions. Here: what the user actually did.
- **Held-out set.** Data the learning process never sees. The only honest measure of generalization.
- **Train / validate split.** Within the training data: 70% the reflector learns from, 30% it is tested on before
  its rules are kept.
- **Reflector.** The step that reads the misses and writes new rules. Runs on the strong model, once per round.
- **Consolidation.** Rewriting a bloated memory into fewer, broader rules. Triggered when memory exceeds 20 rules or
  validation regresses.
- **Pruning.** Deterministically dropping rules the agent stopped citing. No model call.
- **Macro-F1.** Average of per-class F1 scores. Treats every class equally regardless of how common it is.
- **Balanced accuracy.** Average of per-class recall. A constant predictor scores 1/(number of classes).
- **Bootstrap confidence interval.** Resample the data with replacement thousands of times to estimate how much
  a number would wobble. If the interval excludes zero, the improvement is not noise.
- **Label leakage.** When the model can see information that was used to create the ground truth. Produces
  fake accuracy. Failure 1.
- **Overfitting.** Learning the specific training examples instead of the underlying pattern. High train score,
  low held-out score. Failure 2.
- **Worktree.** A separate checkout of the same git repo. AO gives each worker its own so they never collide.

---

## 10. The one-paragraph version

Understudy learns a person's judgment from what they already did in their own apps, so nobody labels anything.
It predicts reply / act / archive / ignore for incoming items, reflects on its misses, and writes plain-English
rules into a memory file. The first version cheated by reading the labels; we caught it. The second version
overfit; we caught that too and built a validation gate that makes the reflector prove every rule on data it did
not learn from. The result: 11 rules that double the class-balanced accuracy of a constant baseline on a held-out
set, with a bootstrap confidence interval that excludes zero, and that make the cheapest model available match
the flagship at one fortieth the cost. Same engine runs on Slack with one env var. Six AO worker sessions built
the adapters, datasets, tests, and docs in parallel, all merged with green CI.
