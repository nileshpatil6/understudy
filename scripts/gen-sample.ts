import { mkdir, writeFile } from "node:fs/promises";
import type { Item, Action } from "../src/types.js";

/**
 * Deterministic synthetic inbox with real-looking patterns, safe to commit and demo.
 * The patterns are learnable but not stated anywhere the agent can see.
 */
type Tpl = { from: string; subject: (i: number) => string; snippet: string; truth: Action; meta?: Record<string, unknown> };
const T: Tpl[] = [
  { from: "notifications@github.com", subject: (i) => `[nileshpatil6/enduent-scraper] Run failed: Daily brief - main (${hex(i)})`, snippet: "Daily brief: All jobs have failed. View workflow run.", truth: "act", meta: { list: "ci_activity" } },
  { from: "notifications@github.com", subject: (i) => `[nileshpatil6/ghostCaptcha] Run failed: ci - main (${hex(i)})`, snippet: "ci: Some jobs were not successful.", truth: "act", meta: { list: "ci_activity" } },
  { from: "notifications@github.com", subject: (i) => `[vercel/next.js] New release v15.${i % 9}.0`, snippet: "A new release was published.", truth: "archive", meta: { list: "releases" } },
  { from: "noreply@swelist.com", subject: (i) => `${60 + (i % 40)} New Internships Posted Today`, snippet: "Here is your daily update of tech internships.", truth: "ignore" },
  { from: "notification@smartrecruiters.com", subject: () => "Your Application at Continental - Intern - AI Engineer", snippet: "Thank you for your application. We are currently reviewing.", truth: "ignore" },
  { from: "notification@smartrecruiters.com", subject: () => "Interview invitation - Intern - AI Engineer", snippet: "We would like to invite you to an interview. Please pick a slot.", truth: "reply" },
  { from: "recruiting@stripe.com", subject: () => "Next steps: Stripe Software Engineering Intern", snippet: "We would love to schedule a 30 minute call this week.", truth: "reply" },
  { from: "messages-noreply@linkedin.com", subject: () => "Chief Executive Officer you may know", snippet: "People you may know based on your profile.", truth: "ignore" },
  { from: "notifications-noreply@linkedin.com", subject: () => "You appeared in recent searches", snippet: "3 new updates for you.", truth: "ignore" },
  { from: "maazx@user.luma-mail.com", subject: () => "[TRACK INFORMATION]", snippet: "More information regarding the tracks and what we are looking for.", truth: "act" },
  { from: "support@devpost.com", subject: () => "Syndicate by Maximor: complete these steps before building", snippet: "Join the Discord, install AO, generate your pass.", truth: "act" },
  { from: "support@devpost.com", subject: (i) => `Shipaton Week ${i % 8}: ${30 - (i % 8) * 3} days left`, snippet: "Week in 60 seconds. The project gallery is public.", truth: "archive" },
  { from: "no-reply@alerts.spotify.com", subject: (i) => `${100000 + i * 7919} - Your Spotify login code`, snippet: "Enter this code to continue logging in.", truth: "archive" },
  { from: "team@namastedev.com", subject: () => "Teachers Day Gift for Your Learning Journey - Coupon Inside", snippet: "Celebrate learning with a special coupon.", truth: "ignore" },
  { from: "team@ship.emergent.sh", subject: () => "This might change your mind", snippet: "85% off Standard pass. Claim now.", truth: "ignore" },
  { from: "marketing@atlasfunded.com", subject: () => "Remember Why You Chose Us", snippet: "Because your comeback starts here.", truth: "ignore" },
  { from: "no-reply@slack.com", subject: () => "Confirm your email address to join Enduent", snippet: "Once you have confirmed your email you will be the newest member.", truth: "act" },
  { from: "ravi@enduent.com", subject: (i) => `Re: scraper output for client ${i % 5}`, snippet: "Can you check the JSON, looks like the date field is off?", truth: "reply", meta: { thread: true } },
  { from: "tajima@example.jp", subject: () => "納品スケジュールについて", snippet: "来週の納品スケジュールを確認させてください。", truth: "reply", meta: { client: true } },
  { from: "prof.sharma@college.edu", subject: (i) => `Assignment ${i % 6} deadline extended`, snippet: "The deadline has been moved to Friday.", truth: "act" },
  { from: "googledev-noreply@google.com", subject: () => "The Monthly Build - Google Developer Program", snippet: "A curated deep dive on the latest builder news.", truth: "ignore" },
  { from: "no_reply@email.heygen.com", subject: () => "Quick survey: How do you use avatar-led AI video?", snippet: "We are surveying creators.", truth: "ignore" },
  { from: "billing@vercel.com", subject: (i) => `Your Vercel invoice for ${["Jun", "Jul", "Aug", "Sep"][i % 4]}`, snippet: "Your invoice is ready. Amount: $20.00", truth: "archive" },
  { from: "billing@vercel.com", subject: () => "Payment failed for your Vercel team", snippet: "We could not charge your card. Update payment to avoid suspension.", truth: "act" },
];

function hex(i: number) {
  return ((i * 2654435761) >>> 0).toString(16).slice(0, 7);
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

const items: Item[] = [];
let n = 0;
for (let round = 0; round < 6; round++) {
  for (const t of T) {
    n++;
    const d = new Date(Date.UTC(2026, 7, 1 + ((n * 7) % 30), (n * 13) % 24, (n * 17) % 60));
    items.push({ id: `s${n}`, source: "gmail", from: t.from, subject: t.subject(n), snippet: t.snippet, receivedAt: d.toISOString(), meta: t.meta ?? {}, truth: t.truth });
  }
}
items.sort((a, b) => (hash(a.id) % 1000) - (hash(b.id) % 1000));

await mkdir("data/sample", { recursive: true });
await writeFile("data/sample/gmail.jsonl", items.map((i) => JSON.stringify(i)).join("\n") + "\n");
console.log(`wrote ${items.length} sample items`);
