# Understudy: video script

Rules: 3 to 5 minutes, public. This script runs about 3:20.

---

## BEFORE RECORDING: setup (do all of this first, takes 5 minutes)

### 1. Terminal
Open a terminal in the repo folder:

```
cd C:\Users\Nilesh\Downloads\code\syndicatehack
```

Make the font big (Ctrl and + a few times, aim for 16 or bigger). Clear it:

```
clear
```

Then TYPE this but DO NOT press enter yet. You press enter during the video when the script says so.

PowerShell (the default Windows terminal):
```powershell
$env:MEMORY_DIR="memory/live"; $env:ROUNDS="2"; $env:LIMIT="48"; $env:TEST="0"; npm run loop
```

Git Bash / macOS / Linux:
```
MEMORY_DIR=memory/live ROUNDS=2 LIMIT=48 TEST=0 npm run loop
```

What it does: runs 48 sample emails with a fresh empty memory, reflects, runs again. About 90 seconds.
You'll see: `run 1` line, then a `reflect run 1` line, then `run 2` line. That's it.

### 2. Browser tabs, in this order
- Tab A: https://github.com/nileshpatil6/understudy/pulls?q=is%3Amerged
- Tab B: the dashboard. Paste this into the address bar:
  `C:\Users\Nilesh\Downloads\code\syndicatehack\dashboard\gmail.private.html`
- Tab C: https://app.neatlogs.com/traces

### 3. VS Code
Open `memory/judgment.gmail.md`. Zoom in (Ctrl and +) so the text is big.

### 4. AO
Open Agent Orchestrator. Click "Open Kanban" so all six cards are visible.

### 5. Recording
Start menu → Clipchamp → Record screen. Full screen, microphone on.
Close everything else. Phone on silent.

### AFTER RECORDING, run this once to clean up the live run, then close the terminal window:

PowerShell:
```powershell
git checkout -- results/; Remove-Item -Recurse -Force memory/live
```

Git Bash:
```
git checkout -- results/ && rm -rf memory/live
```

---

## THE SCRIPT

Spoken, not read. Short sentences. Pause where there's a blank line. If you stumble, keep going; cut it later.
Anything in [brackets] is what's on screen, don't say it.

---

[Start on AO, Kanban view, all six cards visible]

Hey. I'm Nilesh, this is Understudy.

So here's a problem every "self-improving agent" has. To improve, it needs to know when it was wrong. Which means
somebody has to label a few hundred examples by hand. And nobody does that well at hour twenty of a hackathon.

So I didn't label anything.

Your inbox already knows what you did with every email. You replied, or you starred it, or you opened it and
moved on, or you never touched it. Gmail has all of that stored. That's thousands of labels, for free, and they're
about *your* judgment specifically. Not some generic dataset.

Understudy learns from that.

And the whole thing was built inside Agent Orchestrator. This is the board. Six worker sessions, six pull requests,
all merged, all passing CI. The orchestrator spawned them itself from one prompt.

---

[Alt-tab to browser Tab A, GitHub merged PRs. Scroll once slowly]

Slack adapter. GitHub adapter. Sample datasets. Eval tests. Memory pruning. Metrics docs. Each one in its own
worktree, in parallel. I reviewed and merged. That's it.

---

[Alt-tab to the Terminal. The command is already typed. Press ENTER as you say "let me just run it"]

Okay, let me just run it.

What's happening: it goes through a batch of emails and for each one predicts what I'd do. Reply, act, archive,
or ignore. It only sees what exists when the email arrives. Sender, subject, snippet, time. Never the read status,
never the labels. I'll come back to why that matters.

[run 1 prints]

Run one. No memory. Pretty bad.

Now it looks at every miss and writes rules for itself.

[reflect line prints]

But here's the important bit. It's only allowed to learn from seventy percent of the data. Every rule it writes
gets tested on the other thirty percent, and if the score drops, the rule is thrown out. See that validate number
going up? That's the gate. It has to prove itself before anything gets saved.

[run 2 prints]

Run two. Six rules. Big jump.

---

[Alt-tab to VS Code, memory/judgment.gmail.md. Scroll slowly]

And this is the memory. This is from my actual inbox. Eleven rules. Plain text.

Like this one. "A human replying to a thread I started, reply." Or this. "CI results with nothing assigned to
me, ignore." That's the entire learned state. There's no model weights, no vector store. You can read it, you can
edit it, you can git blame it.

---

[Browser Tab B, the dashboard. Accuracy chart]

Now, the numbers. And I want to be honest about these.

These are from a held-out set. Ninety-three older emails the learning process never saw. On raw accuracy we
land at sixty-seven percent. Which sounds fine, except a program that just says "ignore" every time also gets
sixty-seven, because most email is junk.

So the number that actually matters is the class-balanced one. Macro F1. Where always-ignore scores twenty, we
score forty. It doubles the baseline, and it climbs every single run. And we bootstrapped it. Plus twenty-two
points, confidence interval eleven to thirty-three. It's not noise.

[point at the red dotted line]

This red line is version one. No gate. Training accuracy hit ninety-one percent and I was pretty happy. Then the
held-out score fell apart. It had written thirty-five rules and most of them were about one specific sender. It was
memorising. So I built the gate, and that's when the held-out line started going up instead of down.

And even before that, the very first version hit ninety-nine percent. Because it could see the labels it was
supposed to be predicting. Caught that too. Both of those failures are in the repo, on purpose.

---

[Same tab, scroll up to the top tiles]

Cost. The big model, no memory, thirty macro F1, forty-eight cents for a batch. The cheapest model with these
eleven rules, forty macro F1, two cents. The rules are worth more than the model. And they move between models.

---

[Browser Tab C, Neatlogs]

Every prediction and every reflection is traced here in Neatlogs, so I could go find a bad call and look at the
reflection that fixed it.

And the same engine runs on Slack. One environment variable. Eighty-eight to a hundred in three rounds, and then
it stopped writing rules, because there was nothing left to learn.

Repo's public. Every number I said is in there with the run that produced it.

That's Understudy. Thanks.
