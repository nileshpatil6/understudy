# Understudy: video script

Spoken, not read. Short sentences. Pause where there's a blank line. If you stumble, keep going; cut it later.
Total about 3 minutes 20 seconds. Anything in [brackets] is what's on screen, don't say it.

---

[AO Kanban board, all six cards visible]

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

[GitHub, merged PRs list, scroll once slowly]

Slack adapter. GitHub adapter. Sample datasets. Eval tests. Memory pruning. Metrics docs. Each one in its own
worktree, in parallel. I reviewed and merged. That's it.

---

[Terminal, command already typed. Hit enter as you say "let me just run it"]

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

[VS Code, memory/judgment.gmail.md, scroll slowly]

And this is the memory. This is from my actual inbox. Eleven rules. Plain text.

Like this one. "A human replying to a thread I started, reply." Or this. "CI results with nothing assigned to
me, ignore." That's the entire learned state. There's no model weights, no vector store. You can read it, you can
edit it, you can git blame it.

---

[Dashboard, real inbox, accuracy chart]

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

[Dashboard, top tiles: cost]

Cost. The big model, no memory, thirty macro F1, forty-eight cents for a batch. The cheapest model with these
eleven rules, forty macro F1, two cents. The rules are worth more than the model. And they move between models.

---

[Neatlogs traces]

Every prediction and every reflection is traced here in Neatlogs, so I could go find a bad call and look at the
reflection that fixed it.

And the same engine runs on Slack. One environment variable. Eighty-eight to a hundred in three rounds, and then
it stopped writing rules, because there was nothing left to learn.

Repo's public. Every number I said is in there with the run that produced it.

That's Understudy. Thanks.
