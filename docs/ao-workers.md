# AO worker prompts

Six independent workers. They touch disjoint files so they run in parallel without conflicts.
CI (`npm run typecheck`, `npm run lint`, `npm test`) must be green before a PR is ready.

## Files no worker may edit

`src/agent/predict.ts`, `src/agent/llm.ts`, `src/eval/run.ts`, `src/reflect/run.ts`, `src/memory/store.ts`,
`src/memory/consolidate.ts`, `src/types.ts`, `memory/*.md`, `data/private/*`, `results/*`.

These are owned by the human maintainer and are being edited concurrently. If your task seems to need a
change in one of them, do not make it. Describe the change you would make in your PR body instead.

Read `docs/architecture.md` before starting. It explains the loop, the two memories, ground-truth derivation
and why label-derived fields are hidden from the agent.

## 1. slack-adapter
Owns: `src/tools/slack.ts`, `src/tools/slack.test.ts`

Add a Slack item source, mirroring `src/tools/gmail-labels.ts`. Export `deriveSlackAction(facts)` where facts
carry the activity signals Slack records: whether the user replied in the thread, whether the user reacted or
saved the message, whether the user opened the channel after the message arrived, whether it was ever read.

Truth: replied in thread -> `reply`; reacted or saved -> `act`; read and nothing else -> `archive`; never read -> `ignore`.
Precedence matters: reply beats act beats archive beats ignore. Test every branch including precedence.

List the fact field names in your PR body so the maintainer can add them to `HIDDEN_META`.

## 2. github-adapter
Owns: `src/tools/github.ts`, `src/tools/github.test.ts`, `scripts/export-github.ts`

Export `deriveGithubAction(facts)`: user commented after the notification -> `reply`; user marked it done or
unsubscribed -> `archive`; still unread -> `ignore`; read but no action -> `act`. Tests for every branch.

`scripts/export-github.ts` shells out to `gh api "/notifications?all=true&per_page=100"`, pages up to 200
notifications, and writes `data/private/github.jsonl` in the `Item` schema from `src/types.ts`. Raw signals go
under `meta`. The script must not run during tests.

## 3. sample-datasets
Owns: `scripts/gen-sample.ts`, `data/sample/slack.jsonl`, `data/sample/github.jsonl`, `data/sample/gmail.test.jsonl`

Extend the generator so it also emits deterministic sample sets for slack and github (~100 items each) with
learnable patterns that are never stated in the data, plus a held-out `gmail.test.jsonl` (~60 items) drawn from
the same generators but different instances, so the public sample set can demonstrate generalization the way
the private one does.

Do not change the existing `data/sample/gmail.jsonl` output. Verify by regenerating and confirming that file is byte-identical.

## 4. eval-tests
Owns: `src/eval/run.test.ts` (new file only)

Add unit tests for the pure functions exported from `src/eval/run.ts`: `attends`, `partition` (deterministic,
roughly 70/30, stable across calls, disjoint halves), `resultsDir` (path shape for every split and the private
flag), and `summarize`. Do not edit `src/eval/run.ts`. If you find a bug, report it in the PR body.

## 5. memory-pruning
Owns: `src/memory/prune.ts`, `src/memory/prune.test.ts`

Export `prune(rules, usage, opts)`: a pure function that takes rule strings, a usage count per rule (from
`Prediction.rulesUsed` across recent runs), and returns the rules to keep plus a list of what was dropped and why.
Drop rules unused across the last two runs; keep a configurable cap (default 20), preferring higher usage.
Deterministic, no model calls, fully unit tested. The maintainer wires the call site.

## 6. docs
Owns: `docs/` only

Write `docs/metrics.md` explaining every number the project reports: 4-class accuracy, attend/skip accuracy,
the majority-class baseline and why it matters here, per-action accuracy, cost accounting (cached vs uncached
input tokens), latency, and rule count. State plainly which numbers are evidence of learning and which are not.
Cross-link from `docs/architecture.md`. Do not edit `README.md` or `results/README.md`.
