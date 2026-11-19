// Uploads from her computer go straight from the browser into private Vercel Blob storage.
// This route only hands out a short-lived permission for one PDF:
//  • with a storage key (BLOB_READ_WRITE_TOKEN): a client token (handleUpload);
//  • with Vercel's key-less sign-in (BLOB_STORE_ID): a presigned upload link (handleUploadPresigned).
import { issueSignedToken } from "@vercel/blob";
import { handleUpload, handleUploadPresigned, type HandleUploadBody, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { denied, passcodeOk } from "@/lib/auth";
import { blobAuth, blobOn, blobToken } from "@/lib/blob";

const MAX = 300 * 1024 * 1024;
const RULES = { allowedContentTypes: ["application/pdf"], maximumSizeInBytes: MAX };

export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody | HandleUploadPresignedBody;
  // Vercel's own "upload finished" call is signed and checked by the SDK; her request needs the passcode.
  if ((body.type === "blob.generate-client-token" || body.type === "blob.generate-presigned-url") && !passcodeOk(req)) return denied();
  if (!blobOn()) return Response.json({ error: "PDF storage isn't switched on yet (Vercel → Storage → Blob)." }, { status: 503 });
  const onlyTextbooks = (pathname: string) => {
    if (!pathname.startsWith("textbooks/") || !/\.pdf$/i.test(pathname)) throw new Error("Only textbook PDFs can be uploaded here.");
  };
  try {
    const token = blobToken();
    if (token) {
      return Response.json(
        await handleUpload({
          token,
          body: body as HandleUploadBody,
          request: req,
          onBeforeGenerateToken: async (pathname) => {
            onlyTextbooks(pathname);
            return { ...RULES, addRandomSuffix: true, validUntil: Date.now() + 2 * 60 * 60 * 1000 };
          },
        }),
      );
    }
    return Response.json(
      await handleUploadPresigned({
        body: body as HandleUploadPresignedBody,
        request: req,
        getSignedToken: async (pathname) => {
          onlyTextbooks(pathname);
          const validUntil = Date.now() + 2 * 60 * 60 * 1000;
          return {
            token: await issueSignedToken({ pathname: "*", operations: ["put"], validUntil, ...RULES, ...blobAuth() }),
            urlOptions: { ...RULES, addRandomSuffix: true, validUntil },
          };
        },
      }),
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
