// Textbook PDFs go straight from her browser into private Vercel Blob storage (no size limit from
// this app; big files upload in parts). This route only hands out a short-lived upload permission.
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { denied, passcodeOk } from "@/lib/auth";

export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  // Vercel's own "upload finished" call is signed and checked by handleUpload; her request needs the passcode.
  if (body.type === "blob.generate-client-token" && !passcodeOk(req)) return denied();
  if (!process.env.BLOB_READ_WRITE_TOKEN) return Response.json({ error: "PDF storage isn't switched on yet (Vercel → Storage → Blob)." }, { status: 503 });
  try {
    const r = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("textbooks/")) throw new Error("Only textbook PDFs can be uploaded here.");
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 300 * 1024 * 1024,
          addRandomSuffix: true,
          validUntil: Date.now() + 2 * 60 * 60 * 1000,
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
