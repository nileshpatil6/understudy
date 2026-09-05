# Judgment memory

Rules the agent has learned about how this user handles items. One rule per line, prefixed with `- `.

- One-time login or authentication-code emails, without a separate security warning or account problem -> archive
- Routine invoice-available notices or receipts that state an amount without explicitly requesting payment or reporting a billing problem -> archive
- Software-release announcements and ongoing hackathon progress bulletins reporting milestones, time remaining, or gallery updates without assigning the user a task -> archive
- Promotional offers, coupons, win-back campaigns, social-network visibility or people recommendations, and general curated-news digests -> ignore
- Automated job-application acknowledgments that only confirm receipt or ongoing review, with no decision or requested next step -> ignore
- Interview invitations requesting availability, confirmation, or selection of a time slot, including invitations delivered through automated recruiting systems -> reply
