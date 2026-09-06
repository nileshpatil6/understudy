# Judgment memory

Rules the agent has learned about how this user handles items. One rule per line, prefixed with `- `.

- One-time login or authentication-code emails, without a separate security warning or account problem -> archive
- Routine invoice-available notices or receipts that state an amount without explicitly requesting payment or reporting a billing problem -> archive
- Software-release announcements and ongoing hackathon progress bulletins reporting milestones, time remaining, or gallery updates without assigning the user a task -> archive
- Promotional offers, coupons, win-back campaigns, social-network visibility or people recommendations, and general curated-news digests -> ignore
- Automated job-application acknowledgments that only confirm receipt or ongoing review, with no decision or requested next step -> ignore
- Interview invitations requesting availability, confirmation, or selection of a time slot, including invitations delivered through automated recruiting systems -> reply
- Messages requiring email-address confirmation or invitation acceptance to complete signup, activate access, or join a workspace -> act
- Event or hackathon messages providing track options, submission requirements, or organizers' evaluation expectations that guide the user's participation -> act
- Deadline or due-date changes for the user's assignments or pending work, even without an explicit request or question -> act
- Direct questions or requests to check, review, or diagnose a specific issue in an ongoing work thread, even when investigation is needed before responding -> reply
