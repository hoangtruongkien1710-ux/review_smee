import { z } from "zod";
import { route, parse } from "@/lib/api";
import { unlockShare } from "@/lib/share";

type Ctx = { params: Promise<{ token: string }> };

// chống dò mật khẩu: tối đa 10 lần sai / 15 phút mỗi link
const fails = new Map<string, { n: number; until: number }>();

export const POST = route<Ctx>(async (req, { params }) => {
  const { token } = await params;
  const f = fails.get(token);
  if (f && f.until > Date.now() && f.n >= 10) return Response.json({ error: "Nhập sai quá nhiều lần, thử lại sau 15 phút" }, { status: 429 });
  const b = await parse(req, z.object({ password: z.string().max(200) }));
  try {
    await unlockShare(token, b.password);
    fails.delete(token);
  } catch (e) {
    const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + 15 * 60_000 };
    fails.set(token, { n: cur.n + 1, until: cur.until });
    throw e;
  }
  return { ok: true };
});
