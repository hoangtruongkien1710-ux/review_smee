import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export const GET = route(async () => {
  const me = await requireUser();
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.notification.count({ where: { userId: me.id, read: false } }),
  ]);
  return {
    unread,
    items: items.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
  };
});
