# Devpost submission text

Paste-ready. Track 1: Automated Agent Engineering.

---

## Elevator pitch (200 char max)

An agent that learns your judgment from what you already did in your own apps, and proves it on emails it has never seen.

---

## About the project

### Inspiration

Every "self-improving agent" needs ground truth, and that is where they die. You build the loop, then realise you have to hand-label a few hundred examples to know whether it improved. At hour 20 of a hackathon nobody does that honestly, so the improvement curve becomes 30 points of noise.

Then it clicked: the labels already exist. Your inbox recorded what you did with every email you ever received. You replied, you starred it, you opened it and left it, you never touched it. Thousands of labels, free, and they are about your actual judgment rather than someone's guess at it. Slack has the same record. So does GitHub.

### What it does

Understudy predicts what you specifically would do with an incoming item, in four classes: reply, act, archive, ignore. It reads only what exists at the moment the item arrives, sender, subject, snippet, timestamp, cc, and whether it continues a thread you started.

After each run it looks at every miss, writes rules into a plain-markdown memory, and reads that memory on the next run. The memory is the entire learned state. You can read it, edit it, and `git log -p memory/` is the learning curve in prose.

Two memories, because the judge asked for two different kinds of learning:
- `judgment.gmail.md` learns you. "Human replies continuing an inquiry the user initiated -> reply."
- `tools.gmail.md` learns the source. "For workflow mail, extract repo and workflow name from the subject; 'Run failed' alone carries no signal."

### How we built it

Node and TypeScript, no framework. Every commit came out of an Agent Orchestrator session.

The loop:

```
item -> render (label-derived fields stripped) -> predict(item, memory) -> score against derived truth
     -> reflect on misses from the learn half only
     -> gate the proposed rules on a validate half the reflector never saw
     -> accept, or consolidate into fewer broader rules, or reject
     -> next run reads the updated memory
```

Prediction runs on the cheapest available model (`gpt-5.6-luna`, low reasoning effort) with memory in the cached system prefix. Reflection runs once per round on the most capable one (`gpt-6-astra`, high effort). Neatlogs traces every prediction and every reflection, so a bad prediction can be inspected next to the reflection that fixed it.

Six parallel AO workers built the Slack adapter, the GitHub adapter and exporter, the sample datasets, the eval harness tests, the memory pruner, and the metrics documentation, each in its own worktree with its own PR and green CI.

### Challenges we ran into

**We caught ourselves cheating.** The first loop hit 99% train accuracy in three rounds. Beautiful chart, worthless: the reflector could see `meta.labels`, so it had learned our labeling function ("UNREAD -> ignore") rather than anything about the user. An email arriving right now has no read state; those flags come from what you do afterwards. We stripped every label-derived field from the agent's input, added a unit test that fails if one ever leaks back in, wiped memory and reran.

**Then we caught ourselves overfitting.** The honest reflector climbed to 91% on train while held-out accuracy went 25 -> 66 -> 48 -> 52 -> 57%. It had written 35 rules, most of them exceptions about individual senders. So we stopped trusting the reflector. It now learns from 70% of the training set and has to prove each proposal on the other 30% before a rule is kept. When memory bloats past 20 rules or validation regresses, a consolidation pass rewrites the whole memory into fewer, broader rules, ranked by how often the agent actually cited each one.

Both failures are preserved in `results/README.md` rather than deleted.

### Accomplishments we are proud of

Eleven plain-English rules take the cheapest model available from 35.5% to 67.7% on a held-out set, matching the flagship model *with* the same memory at one fortieth of the cost. The learning is worth more than the model.

And the honest evaluation. We report the majority-class baseline next to our own number, which shows that our 4-class figure on the real held-out set does not beat always-guessing-ignore, while the attend/skip and per-action numbers clearly do. That is in `docs/metrics.md`, written to be read by someone trying to catch us.

### What we learned

A learning system is mostly plumbing about trust: what the learner is allowed to see, what it has to prove before you believe it, and what you do when it regresses. The model choice was the least interesting decision we made.

### What is next

The engine is source-agnostic. The Slack and GitHub adapters are already merged; pointing the same loop at them needs an export and one env var. Beyond prediction, the natural next step is acting: draft the reply for the `reply` class, and escalate anything below a confidence threshold instead of guessing.

---

## Built with

typescript, node.js, openai, agent-orchestrator, neatlogs, gmail-api, github-cli, vitest, github-actions

---

## Try it out links

- GitHub: https://github.com/nileshpatil6/understudy
- Demo video: (paste YouTube link)

---

## Results to quote in the video and description

Real inbox, 148 train items, 93 held-out items from an earlier date range the reflector never sees:

| | run 1 | run 6 |
|---|---|---|
| held-out 4-class | 23.7% | 67.7% |
| held-out attend vs skip | 66.7% | 86.0% |
| rules in memory | 0 | 11 |
| cost per 148-item run | $0.026 | $0.039 |
| latency per item | 2.4s | 2.1s |

Same held-out set, model comparison:

| model | memory | 4-class | attend/skip | cost |
|---|---|---|---|---|
| gpt-6-astra | none | 43.0% | 81.7% | $0.479 |
| gpt-6-astra | 11 learned rules | 67.7% | 88.2% | $1.020 |
| gpt-5.6-luna | none | 35.5% | 75.3% | $0.013 |
| gpt-5.6-luna | 11 learned rules | 67.7% | 86.0% | $0.024 |

Caveat we state out loud: the always-ignore baseline on that held-out set is also 67.7%, so the 4-class number alone is not the evidence. The attend/skip lift (66.7 -> 86.0) and the per-action breakdown are.
