import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isAdmin, requirePageUser } from "@/lib/auth";
import { UsersAdmin } from "@/components/UsersAdmin";

export default async function UsersSettingsPage() {
  const me = await requirePageUser();
  if (!isAdmin(me)) redirect("/");
  const users = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, email: true, color: true, role: true, status: true, lastActiveAt: true, createdAt: true },
  });
  return (
    <UsersAdmin
      me={{ id: me.id, role: me.role }}
      users={users.map((u) => ({
        ...u,
        lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      }))}
    />
  );
}
