import { claudeOn } from "@/lib/claude";
import { dbConfigured } from "@/lib/db";
import { passcodeSet } from "@/lib/auth";

export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({
    claude: claudeOn(),
    db: dbConfigured(),
    passcode: passcodeSet(),
    email: Boolean(process.env.RESEND_API_KEY && process.env.FEEDBACK_EMAIL_TO),
  });
}
