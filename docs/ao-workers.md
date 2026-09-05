# AO worker prompts

Spawn each as its own AO worker. They touch disjoint files so they can run in parallel.
CI (typecheck, lint, vitest) must be green before merge.

## 1. Slack source adapter
Files: src/tools/slack.ts, src/tools/slack.test.ts, data/README.md
Add a Slack item source. Read a JSONL export in data/{sample,private}/slack.jsonl with the same Item schema as gmail.
Derive truth from Slack facts: user replied in thread -> reply; user reacted or saved -> act; user opened channel after message and did nothing -> archive; never read -> ignore.
Write deriveSlackAction(facts) mirroring src/tools/gmail-labels.ts, with tests. Do not touch the agent or eval code.

## 2. GitHub notifications source adapter
Files: src/tools/github.ts, src/tools/github.test.ts, scripts/export-github.ts
Add a GitHub notifications source. scripts/export-github.ts uses `gh api /notifications?all=true` to pull the last 200 notifications and writes data/private/github.jsonl.
Truth: user commented after -> reply; user marked done or the thread got unsubscribed by the user -> archive; notification still unread -> ignore; read but no action -> act.
Write deriveGithubAction with tests.

## 3. Sample dataset generator for slack and github
Files: scripts/gen-sample.ts, data/sample/slack.jsonl, data/sample/github.jsonl
Extend the generator so it also emits deterministic sample sets for slack and github with learnable but unstated patterns. ~100 items each. Do not change the gmail sample.

## 4. Eval robustness
Files: src/eval/run.ts, src/eval/run.test.ts
Add retry with backoff on rate-limit errors in mapLimit, a --seed option that shuffles item order deterministically, and a unit test for the scoring math using fake predictions. Keep the RunResult schema unchanged.

## 5. Memory pruning
Files: src/memory/prune.ts, src/memory/prune.test.ts, src/reflect/run.ts (only the call site)
After each reflection, ask the model to merge duplicate or contradictory rules and drop rules the last two runs never used (Prediction.rulesUsed). Cap judgment memory at 40 rules. Log what was removed. Must be opt-in via PRUNE=1.

## 6. README and architecture doc
Files: README.md, docs/architecture.md
Write docs/architecture.md: the loop, the two memories, ground-truth derivation per source, the eval metrics, cost accounting. Include an ASCII diagram. Update README to link it and to show the current numbers from results/.
