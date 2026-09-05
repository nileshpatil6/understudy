# Data

`sample/`   synthetic, committed. `npx tsx scripts/gen-sample.ts` regenerates it.
`private/`  real exports, gitignored. Never commit.

## Item schema (jsonl, one per line)

```
id, source (gmail|slack|github), from, subject, snippet, body?, receivedAt, meta{}, truth
truth = reply | act | archive | ignore, derived from the source app, see src/tools/gmail-labels.ts
```

## Exporting your Gmail

Ground truth comes from Gmail's own labels on each thread. For each inbound message:
- you sent a message later in the thread      -> reply
- STARRED, or IMPORTANT and opened            -> act
- not in INBOX, or opened in INBOX and left   -> archive
- still unread in INBOX                       -> ignore

Outbound-only threads are skipped. Current private set: 148 items over 45 days.
