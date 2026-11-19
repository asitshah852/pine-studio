// Studio passcode. Saving shared data and using Claude need it. Set APP_PASSCODE in Vercel.
import { timingSafeEqual } from "node:crypto";

export const passcodeSet = () => Boolean(process.env.APP_PASSCODE);

export function passcodeOk(req: Request): boolean {
  const want = process.env.APP_PASSCODE;
  if (!want) return true;
  const got = req.headers.get("x-pine-passcode") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const denied = () => Response.json({ error: "Studio passcode needed." }, { status: 401 });
