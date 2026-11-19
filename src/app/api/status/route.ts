import { claudeOn } from "@/lib/claude";
import { dbConfigured } from "@/lib/db";
import { passcodeSet } from "@/lib/auth";
import { youtubeOn } from "@/lib/sources";
import { blobOn, blobUploadsOn } from "@/lib/blob";

export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({
    claude: claudeOn(),
    db: dbConfigured(),
    passcode: passcodeSet(),
    youtube: youtubeOn(),
    pdfs: blobOn(),
    pdfUploads: blobUploadsOn(),
    email: Boolean(process.env.RESEND_API_KEY && process.env.FEEDBACK_EMAIL_TO),
  });
}
