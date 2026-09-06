## Inspiration

My agent hit 99% accuracy in three hours. So I deleted it. It was cheating, and I only found out because I went looking.

That's the honest origin of this project. But the idea came a bit earlier.

Every "self-improving agent" has the same dirty secret: to improve, it needs to know when it was wrong. Which means a human sits down and hand-labels a few hundred examples. At hour twenty of a hackathon, nobody does that honestly, and the improvement chart turns into noise.

Then it clicked. **The labels already exist.** My inbox has been keeping score on me for years. I replied to that one. Starred that. Opened this one and did nothing. Never touched that one at all. Gmail stored every decision. Thousands of labels, free, and they describe *my* judgment, not some generic dataset's.

Slack keeps the same log. So does GitHub. Any app with an activity history is a free training set about one specific person.

## What it does

**Understudy** predicts what I would do with an incoming item: `reply`, `act`, `archive`, or `ignore`. It only sees what exists the moment the item arrives: sender, subject, snippet, timestamp, cc. Never the read state, never the labels.

After each run it reflects on its misses and writes rules into a plain markdown file. The next run reads that file. That file is the entire learned state. Eleven lines of English:

> A human replying to a thread I started → reply
> CI results with nothing assigned to me → ignore

I can read them, argue with them, delete one, `git blame` them. No weights, no vector store.

The same engine runs on Slack with one environment variable changed. It went 88% → 100% in three rounds, then stopped proposing rules because there was nothing left to learn.

## How we built it

TypeScript, no framework. Prediction runs on the cheapest model available with memory in the cached system prefix; reflection runs once per round on the strongest model. Neatlogs traces every call, so a bad guess sits right next to the reflection that fixed it.

The core loop (eval harness, prediction, gated reflection, consolidation, dashboard) was built in Claude Code. Everything around it came out of **Agent Orchestrator**. I gave the orchestrator one prompt with six task descriptions and strict file ownership. It spawned six workers in parallel, each in its own worktree, each opening its own PR: Slack adapter, GitHub adapter and exporter, held-out sample datasets, eval harness tests, a deterministic memory pruner, and a metrics doc that argues against our own headline number. All six merged, all CI green, zero file collisions. Tests went from 10 to 83.

## Challenges we ran into

I caught it lying twice.

**First, it read the answer sheet.** The first loop hit 99% train accuracy because the reflector could see `meta.labels`, the exact Gmail flags the ground truth was derived from. It learned "UNREAD → ignore." Perfectly correct, perfectly useless. An email arriving right now has no read flag; that flag is a record of what you do afterwards. I stripped every label-derived field before anything reaches the model, wrote a unit test that fails if one leaks back, wiped memory, and reran.

**Then it memorised.** The honest version climbed to 91% on train while a held-out set of 93 older emails went 25 → 66 → 48 → 52 → 57. It had written 35 rules, most of them exceptions about one specific sender. So I stopped trusting the reflector. It now learns from 70% of the training set, and every proposed rule is scored on the other 30% before it's kept. If validation drops, the rule is deleted. If memory bloats past 20 rules, a consolidation pass rewrites it into fewer, broader ones.

35 rules became 11. Train accuracy went *down*. Held-out accuracy went *up*. That trade is the entire project.

**Then the numbers nearly fooled me a third time.** The held-out set is 68% `ignore`, so a program that always answers "ignore" scores 67.7% accuracy while getting three of the four classes completely wrong. My final run *also* scored 67.7%. Read alone, it looked like nothing had been learned. Switching to class-balanced metrics told the real story.

## Accomplishments that we're proud of

Eleven plain-English rules that double a constant baseline on a held-out set the learning never touched:

| | always "ignore" | run 1, no memory | **run 6, 11 rules** |
|---|---|---|---|
| macro-F1 | 20.2% | 17.4% | **40.0%** |
| balanced accuracy | 25.0% | 24.8% | **43.1%** |
| attend vs skip | 67.7% | 66.7% | **86.0%** |

Macro-F1 climbs monotonically across all six runs. Paired bootstrap on the gain: **+22.6 points, 95% CI [11.0, 33.2]**. Not noise.

The cost result is my favourite. `gpt-6-astra` with no memory: 30 macro-F1 at $0.48 a batch. `gpt-5.6-luna`, the cheapest model available, with the eleven learned rules: 40 macro-F1 at **$0.02**. Eleven lines of English beat a model upgrade at one twentieth the price, and the rules are portable: written by the big model, they work unchanged in the small one.

And both failed versions are still in the repo, in `results/README.md`, with the runs that produced them. On purpose.

## What we learned

A learning system is mostly plumbing about trust. What is the learner allowed to see? What does it have to prove before you believe it? What happens when it regresses? Get those three right and the model choice barely matters. I spent the least time picking a model and the most time deciding what it couldn't look at.

Also: hold out a test set before you write a single line of the learner. The moment I had one, both failures became visible in under a minute.

## What's next for Understudy

Act, not just predict. Draft the reply for the `reply` class. Escalate anything under a confidence threshold instead of guessing. The Slack and GitHub adapters are already merged, so the same loop runs on them today; the interesting next step is a memory that spans sources, so what it learns about me on Slack sharpens what it predicts in email.
