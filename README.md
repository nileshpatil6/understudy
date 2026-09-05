# Understudy

An agent that learns *your* judgment by watching what you actually did in your own apps, then does the work for you, and gets measurably better every run.

Built for Syndicate by Maximor, Track 1: Automated Agent Engineering.

## The trick

Every "self-improving agent" needs ground truth. Most teams hand-label it. We don't.

Your inbox already recorded the right answer for every email: you replied, you starred it, you archived it, you never touched it. Thousands of free labels. Same for Slack, GitHub, anything with an activity log.

So the loop is:

```
read item (Gmail / Slack / GitHub via tools)
  -> predict what you would do        reply | act | archive | ignore
  -> compare with what you really did
  -> reflect on every miss
  -> write a rule into memory         memory/judgment.gmail.md, memory/tools.gmail.md
  -> next run reads the new memory
```

Memory is plain markdown. You can read it, judges can read it, git history shows it growing.

## Layout

```
src/eval      harness: run agent over dataset, score, write results/<source>/run-N.json
src/agent     predict(item, memory) -> action + confidence + reasoning + cost + latency
src/memory    two markdown files per source: judgment rules, tool rules
src/reflect   after a run: misses -> new rules
src/tools     source adapters + ground-truth derivation (gmail-labels.ts)
src/dashboard chart of accuracy / cost / latency per run, memory diff
data/sample   synthetic inbox, committed, safe for CI and demos
data/private  your real export, gitignored
memory/       the agent's learned rules
results/      one JSON per run
```

## Run

```
npm i
cp .env.example .env    # add OPENAI_API_KEY
npx tsx scripts/gen-sample.ts
npm run eval            # one run
npm run reflect         # learn from it
npm run loop            # eval -> reflect x5, produces the chart
```

Env: `SOURCE=gmail|slack|github`, `LIMIT=50`, `PRIVATE=1` (use data/private), `ROUNDS=5`, `UNDERSTUDY_MODEL` (default gpt-5.6-luna), `UNDERSTUDY_REFLECT_MODEL` (default gpt-6-astra).

## Built with AO

Every commit in this repo came out of an Agent Orchestrator session. See the demo video for the session board.
