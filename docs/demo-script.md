# Demo video script (target 3:30)

Record at 1080p, dark mode, terminal font 16+. Talk fast, cut dead air. Every claim on screen.

## 0:00 Hook (20s)
Screen: dashboard, accuracy chart.
"Every self-improving agent needs ground truth. Everyone hand-labels it. We didn't label anything.
Your inbox already recorded what you did with every email. Understudy learns your judgment from that,
and gets measurably better on emails it has never seen."

## 0:20 AO (30s)
Screen: AO dashboard, kanban, session count visible. Scroll the board.
"Built end to end in Agent Orchestrator. N sessions, M merged PRs, CI on every one.
Eval harness, memory, reflector, dashboard and source adapters were separate workers in separate worktrees."
Point at one PR with a CI failure that an agent fixed itself, if there is one.

## 0:50 The loop, live (60s)
Screen: terminal. `PRIVATE=1 ROUNDS=2 npx tsx scripts/loop.ts`
While it runs: "148 real emails, ground truth derived from Gmail labels, never shown to the agent.
Run 1, no memory, 32%. Reflect on the misses. Run 2, 62%." Show the reflect line with the validate gate.
"The reflector only learns from 70% of the data and has to prove itself on the other 30% before a rule is kept.
When it overfits, memory gets rewritten into fewer, more general rules."

## 1:50 The memory (40s)
Screen: memory/judgment.gmail.md in editor. Slowly scroll.
Read two rules aloud: "human replies continuing an inquiry I started -> reply", "standalone CI results with no assigned task -> ignore".
"Eleven rules. Plain text. That is the whole learned state. You can read it, edit it, git blame it."

## 2:30 The honest chart (35s)
Screen: dashboard. Point at lines.
"Held-out, never reflected on: 24% to 68% four-class, 67% to 86% attend-versus-skip.
The red dotted line is our first reflector without the gate: train hit 91%, held-out fell to 57%. We caught our own overfit and shipped the fix."

## 3:05 Cost (20s)
Screen: baselines table.
"gpt-6-astra with no memory: 43%. gpt-5.6-luna with eleven learned rules: 68%. Same as astra with memory, at one fortieth the cost. Two seconds per email."

## 3:25 Close (10s)
Screen: Neatlogs trace of one bad prediction next to the reflection that fixed it.
"Traces in Neatlogs. Repo, setup, eval all public. Understudy."

## Cuts to have ready
- AO board screenshot with session count
- Terminal recording of a 2-round loop
- Dashboard (private, real inbox) full page
- memory/judgment.gmail.md
- Neatlogs trace page
