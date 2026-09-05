# Judgment memory

Rules the agent has learned about how this user handles items. One rule per line, prefixed with `- `.

- Broadcast recommendations, newsletters, product announcements, security digests, optional opportunities or benefits, and automated registration/submission/assessment reminders—even personalized, urgent, or referencing past participation or a saved application -> ignore
- Review, comment, approval, merge, or review-progress messages explicitly tied to the user's authored contribution, including automated collaboration notifications -> act
- Standalone automated operational reports, including CI/workflow/deployment results, package publication, and performance milestones, without an assigned task or contribution-specific collaboration/review activity, regardless of branch or success/failure status -> ignore
- Routine non-promotional administration, including account-specific plan changes, generic onboarding, organization invitations or membership notices, enabled-2FA confirmations, and order expiration or renewal notices, without an assigned task -> archive
- Expiring one-click sign-in links and after-the-fact confirmations of credential/token creation, account linking, or third-party sign-in/data-sharing authorization -> ignore
- Authentication messages supplying a numeric login or verification code for the user to enter, even when short-lived -> act
- Human replies continuing an inquiry the user initiated that provide answers, guidance, constraints, status, or referrals, even without explicitly requesting a response -> reply
- Automated acknowledgments or availability/status replies directly continuing an inquiry the user initiated, including those providing alternate contacts -> act
- Personal transactional messages confirming approved participation, shortlisting with concrete participant benefits, an earned certificate, or access to stored identity documents -> act
- Messages assigning mandatory participation logistics to an already enrolled participant, rather than promoting registration or reminding them to submit or attempt a round -> act
- Routine submission receipts and informational evaluation/progress updates for an application or competition the user has entered, without an assigned task or a new approval, benefit, or credential -> archive
