// Emails a feedback note (Resend) when RESEND_API_KEY and FEEDBACK_EMAIL_TO are set.
// The note itself is saved with the rest of the studio data by the page.
import { denied, passcodeOk } from "@/lib/auth";

export async function POST(req: Request) {
  if (!passcodeOk(req)) return denied();
  const { tab, text } = (await req.json()) as { tab?: string; text?: string };
  const key = process.env.RESEND_API_KEY;
  const to = (process.env.FEEDBACK_EMAIL_TO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!key || !to.length || !text) return Response.json({ emailed: false });
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.FEEDBACK_EMAIL_FROM || "Pine Studio <onboarding@resend.dev>",
      to,
      subject: `Pine Studio feedback (${tab}): ${text.replace(/\s+/g, " ").slice(0, 60)}`,
      text: `Feedback on the ${tab} tab:\n\n${text}\n\nTo make the change, paste this into a Claude Code session.`,
    }),
  });
  return Response.json({ emailed: r.ok });
}
