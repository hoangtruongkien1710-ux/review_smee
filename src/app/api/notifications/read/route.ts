import { z } from "zod";
import { route, parse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

const Body = z.object({ ids: z.array(z.string()).max(200).optional() });

/** Đánh dấu đã đọc: theo danh sách id, hoặc tất cả nếu không gửi ids. */
export const POST = route(async (req) => {
  const me = await requireUser();
  const b = await parse(req, Body);
  await prisma.notification.updateMany({
    where: { userId: me.id, read: false, ...(b.ids ? { id: { in: b.ids } } : {}) },
    data: { read: true },
  });
  return { ok: true };
});
